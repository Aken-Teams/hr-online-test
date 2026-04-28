import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { parseQuestionExcel, parseQuestionFilename, extractHeadersAndSamples, detectFailedSheets } from '@/lib/excel';
import { identifyColumnsWithAI } from '@/lib/deepseek';
import { MAX_UPLOAD_SIZE } from '@/lib/constants';

/**
 * POST /api/admin/exams/[id]/import-questions
 * Import question bank files bound to a specific exam.
 *
 * Overwrite behavior: for each uploaded file, all existing questions from that
 * file (same sourceFile + examSourceId) are deleted first, then the new
 * questions are created. This ensures the DB always matches the file contents.
 * Only affects questions scoped to this exam (examSourceId).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const { id: examId } = await params;

    // Verify exam exists
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      return NextResponse.json(
        { success: false, error: '考试不存在' },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    // Read classifications from frontend (if provided)
    const classificationsJson = formData.get('classifications') as string | null;
    let classifications: Record<string, string> = {};
    if (classificationsJson) {
      try {
        classifications = JSON.parse(classificationsJson);
      } catch { /* ignore parse errors */ }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: '请上传文件' },
        { status: 400 }
      );
    }

    const totalResults = {
      totalFiles: files.length,
      totalRows: 0,
      created: 0,
      replaced: 0,
      fileResults: [] as Array<{
        filename: string;
        parsed: ReturnType<typeof parseQuestionFilename>;
        rows: number;
        created: number;
        replaced: number;
        byType?: Record<string, number>;
        error?: string;
      }>,
    };

    for (const file of files) {
      if (file.size > MAX_UPLOAD_SIZE) {
        totalResults.fileResults.push({
          filename: file.name,
          parsed: null,
          rows: 0,
          created: 0,
          replaced: 0,
          error: '文件大小超过10MB',
        });
        continue;
      }

      // Parse filename for metadata
      const parsed = parseQuestionFilename(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      let rows = parseQuestionExcel(buffer);

      // AI fallback: only when initial parse found 0 rows (avoid double-parsing)
      if (rows.length === 0) {
        const failedSheets = detectFailedSheets(buffer);
        if (failedSheets.length > 0) {
          let aiMapping: Record<string, string> = {};
          for (const failedSheet of failedSheets) {
            const extracted = extractHeadersAndSamples(buffer, 3, failedSheet);
            if (extracted) {
              const mapping = await identifyColumnsWithAI(extracted.headers, extracted.sampleRows);
              if (mapping) {
                aiMapping = { ...aiMapping, ...mapping };
              }
            }
          }
          if (Object.keys(aiMapping).length > 0) {
            rows = parseQuestionExcel(buffer, aiMapping);
          }
        }
      }

      // Count by question type
      const byType: Record<string, number> = {};
      for (const r of rows) {
        byType[r.type] = (byType[r.type] || 0) + 1;
      }

      if (rows.length === 0) {
        totalResults.fileResults.push({
          filename: file.name,
          parsed,
          rows: 0,
          created: 0,
          replaced: 0,
          error: '未解析到有效题目',
        });
        continue;
      }

      // Determine category: use frontend classification first, then filename fallback
      let category: string;
      if (classifications[file.name]) {
        category = classifications[file.name];
      } else {
        const isBasic = file.name.includes('基本') || file.name.includes('基础') || file.name.toLowerCase().includes('basic');
        category = isBasic ? 'BASIC' : 'PROFESSIONAL';
      }

      // Dedup within file (same type + content)
      const seen = new Set<string>();
      const uniqueRows = rows.filter((row) => {
        const fp = `${row.type}||${row.content.trim()}`;
        if (seen.has(fp)) return false;
        seen.add(fp);
        return true;
      });

      let fileReplaced = 0;

      await prisma.$transaction(
        async (tx) => {
          // ── Step 1: Delete all existing questions from this file for this exam ──
          const existingIds = (
            await tx.question.findMany({
              where: { examSourceId: examId, sourceFile: file.name },
              select: { id: true },
            })
          ).map((q) => q.id);

          if (existingIds.length > 0) {
            // Cascade: delete referencing records first
            await tx.answer.deleteMany({ where: { questionId: { in: existingIds } } });
            await tx.examQuestion.deleteMany({ where: { questionId: { in: existingIds } } });
            await tx.questionOption.deleteMany({ where: { questionId: { in: existingIds } } });
            await tx.questionTag.deleteMany({ where: { questionId: { in: existingIds } } });
            await tx.question.deleteMany({ where: { id: { in: existingIds } } });
            fileReplaced = existingIds.length;
          }

          // ── Step 2: Create all questions from file ──
          const newQuestions = uniqueRows.map((row) => ({
            id: randomUUID(),
            type: row.type,
            content: row.content,
            level: parsed?.level || row.level,
            department: parsed?.department || row.department,
            role: row.role,
            correctAnswer: row.correctAnswer ?? null,
            isMultiSelect: row.isMultiSelect ?? false,
            referenceAnswer: row.referenceAnswer ?? null,
            sourceFile: file.name,
            process: parsed?.process || null,
            category,
            examSourceId: examId,
          }));

          await tx.question.createMany({ data: newQuestions });

          const allOptions = newQuestions.flatMap((q, qi) =>
            (uniqueRows[qi].options || []).map((opt, idx) => ({
              questionId: q.id,
              label: opt.label,
              content: opt.content,
              imageUrl: opt.imageUrl ?? null,
              sortOrder: idx,
            }))
          );
          if (allOptions.length > 0) {
            await tx.questionOption.createMany({ data: allOptions });
          }
        },
        { timeout: 60000 }
      );

      totalResults.totalRows += uniqueRows.length;
      totalResults.created += uniqueRows.length;
      totalResults.replaced += fileReplaced;
      totalResults.fileResults.push({
        filename: file.name,
        parsed,
        rows: uniqueRows.length,
        created: uniqueRows.length,
        replaced: fileReplaced,
        byType,
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'QUESTION_IMPORTED',
        details: {
          examId,
          totalFiles: totalResults.totalFiles,
          totalRows: totalResults.totalRows,
          created: totalResults.created,
          replaced: totalResults.replaced,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: totalResults,
    });
  } catch (error) {
    console.error('Import exam questions error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
