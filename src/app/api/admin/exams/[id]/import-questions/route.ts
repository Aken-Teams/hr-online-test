import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { parseQuestionExcel, parseQuestionFilename, extractHeadersAndSamples, detectFailedSheets } from '@/lib/excel';
import { identifyColumnsWithAI } from '@/lib/deepseek';
import { MAX_UPLOAD_SIZE } from '@/lib/constants';
import type { QuestionImportRow } from '@/types/exam';

/**
 * POST /api/admin/exams/[id]/import-questions
 * Import question bank files bound to a specific exam.
 *
 * Full-replace behavior: ALL existing questions for this exam are deleted
 * first, then the new questions from all uploaded files are created.
 * This ensures the DB always matches the uploaded file contents with no
 * duplicates, regardless of filenames.
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

    // ── Phase 1: Parse all files (outside transaction) ──
    interface ParsedFile {
      file: File;
      parsed: ReturnType<typeof parseQuestionFilename>;
      uniqueRows: QuestionImportRow[];
      byType: Record<string, number>;
      fileCategory: string;
      hasPerRowCategory: boolean;
    }
    const parsedFiles: ParsedFile[] = [];

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

      const parsed = parseQuestionFilename(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      let rows = parseQuestionExcel(buffer);

      // AI fallback: only when initial parse found 0 rows
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

      const hasPerRowCategory = rows.some((r) => r.category);
      let fileCategory: string;
      if (classifications[file.name]) {
        fileCategory = classifications[file.name];
      } else {
        const isBasic = file.name.includes('基本') || file.name.includes('基础') || file.name.toLowerCase().includes('basic');
        fileCategory = isBasic ? 'BASIC' : 'PROFESSIONAL';
      }

      // Dedup within file (same type + content + level)
      const seen = new Set<string>();
      const uniqueRows = rows.filter((row) => {
        const fp = `${row.type}||${row.level || ''}||${row.content.trim()}`;
        if (seen.has(fp)) return false;
        seen.add(fp);
        return true;
      });

      parsedFiles.push({ file, parsed, uniqueRows, byType, fileCategory, hasPerRowCategory });
    }

    // ── Phase 2: Single transaction — delete all then create all ──
    if (parsedFiles.length > 0) {
      // Count existing questions before delete (for replaced count)
      const existingIds = (
        await prisma.question.findMany({
          where: { examSourceId: examId },
          select: { id: true },
        })
      ).map((q) => q.id);

      // Safety check: block import if there are answer records referencing these questions
      if (existingIds.length > 0) {
        const answerCount = await prisma.answer.count({
          where: { questionId: { in: existingIds } },
        });
        if (answerCount > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `该考试已有 ${answerCount} 条答题记录，重新导入会删除所有答题数据。如需重新导入，请先在「成绩管理」中清除答题记录。`,
            },
            { status: 409 }
          );
        }
      }

      await prisma.$transaction(
        async (tx) => {
          // Delete ALL existing questions for this exam
          if (existingIds.length > 0) {
            await tx.examQuestion.deleteMany({ where: { questionId: { in: existingIds } } });
            await tx.questionOption.deleteMany({ where: { questionId: { in: existingIds } } });
            await tx.questionTag.deleteMany({ where: { questionId: { in: existingIds } } });
            await tx.question.deleteMany({ where: { id: { in: existingIds } } });
          }

          // Create questions from all parsed files
          for (const pf of parsedFiles) {
            const newQuestions = pf.uniqueRows.map((row) => {
              const cat = (pf.hasPerRowCategory && row.category) ? row.category : pf.fileCategory;
              return {
                id: randomUUID(),
                type: row.type,
                content: row.content,
                level: cat === 'BASIC' ? '' : (pf.parsed?.level || row.level),
                department: pf.parsed?.department || row.department,
                role: row.role,
                correctAnswer: row.correctAnswer ?? null,
                isMultiSelect: row.isMultiSelect ?? false,
                referenceAnswer: row.referenceAnswer ?? null,
                sourceFile: pf.file.name,
                process: row.process || pf.parsed?.process || null,
                category: cat,
                examSourceId: examId,
              };
            });

            await tx.question.createMany({ data: newQuestions });

            const allOptions = newQuestions.flatMap((q, qi) =>
              (pf.uniqueRows[qi].options || []).map((opt, idx) => ({
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
          }
        },
        { timeout: 60000 }
      );

      totalResults.replaced = existingIds.length;

      for (const pf of parsedFiles) {
        totalResults.totalRows += pf.uniqueRows.length;
        totalResults.created += pf.uniqueRows.length;
        totalResults.fileResults.push({
          filename: pf.file.name,
          parsed: pf.parsed,
          rows: pf.uniqueRows.length,
          created: pf.uniqueRows.length,
          replaced: 0,
          byType: pf.byType,
        });
      }
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
