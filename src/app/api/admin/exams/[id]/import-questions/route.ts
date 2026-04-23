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
 * Parses filename format: "部门工序级别.xls" (e.g. "工务部SAWⅡ级.xls")
 * Sets examSourceId + process + category on imported questions.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或��权限' },
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
        { success: false, error: '请上��文件' },
        { status: 400 }
      );
    }

    const totalResults = {
      totalFiles: files.length,
      totalRows: 0,
      created: 0,
      duplicates: 0,
      skipped: 0,
      fileResults: [] as Array<{
        filename: string;
        parsed: ReturnType<typeof parseQuestionFilename>;
        rows: number;
        created: number;
        duplicates: number;
        byType?: Record<string, number>;
        error?: string;
      }>,
    };

    // Build existing question fingerprint set for dedup
    const existingQuestions = await prisma.question.findMany({
      where: { examSourceId: examId },
      select: { content: true, type: true },
    });
    const existingSet = new Set(
      existingQuestions.map((q) => `${q.type}||${q.content.trim()}`)
    );

    for (const file of files) {
      if (file.size > MAX_UPLOAD_SIZE) {
        totalResults.fileResults.push({
          filename: file.name,
          parsed: null,
          rows: 0,
          created: 0,
          duplicates: 0,
          error: '文件大小超过10MB',
        });
        continue;
      }

      // Parse filename for metadata
      const parsed = parseQuestionFilename(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      let rows = parseQuestionExcel(buffer);

      // AI fallback: check for sheets that have data but parsed 0 rows.
      // For each failed sheet, extract headers and ask AI to identify columns,
      // then re-parse with the AI-provided mapping merged in.
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

      // Count by question type
      const byType: Record<string, number> = {};
      for (const r of rows) {
        byType[r.type] = (byType[r.type] || 0) + 1;
      }

      let fileDuplicates = 0;

      if (rows.length === 0) {
        totalResults.fileResults.push({
          filename: file.name,
          parsed,
          rows: 0,
          created: 0,
          duplicates: 0,
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

      // Filter duplicates and prepare batch data
      const validRows: { id: string; row: typeof rows[0] }[] = [];
      for (const row of rows) {
        const fingerprint = `${row.type}||${row.content.trim()}`;
        if (existingSet.has(fingerprint)) {
          fileDuplicates++;
          continue;
        }
        existingSet.add(fingerprint);
        validRows.push({ id: randomUUID(), row });
      }

      if (validRows.length > 0) {
        await prisma.$transaction(
          async (tx) => {
            // Batch create all questions at once
            await tx.question.createMany({
              data: validRows.map(({ id, row }) => ({
                id,
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
              })),
            });

            // Batch create all options at once
            const allOptions = validRows.flatMap(({ id, row }) =>
              (row.options || []).map((opt, idx) => ({
                questionId: id,
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
      }

      const fileCreated = validRows.length;

      totalResults.totalRows += rows.length;
      totalResults.created += fileCreated;
      totalResults.duplicates += fileDuplicates;
      totalResults.fileResults.push({
        filename: file.name,
        parsed,
        rows: rows.length,
        created: fileCreated,
        duplicates: fileDuplicates,
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
          duplicates: totalResults.duplicates,
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
