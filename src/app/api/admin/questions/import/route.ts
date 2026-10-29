import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { parseQuestionFiles, questionFp } from '@/lib/question-import';
import type { QuestionImportRow } from '@/types/exam';

/**
 * POST /api/admin/questions/import
 * 批量导入题目「直接进中央题库」（不关联任何考试）。
 *
 * 与关联考试的导入不同：新题建为中央题（examSourceId=null，可被所有考试共用 /
 * 自动抽取），并对中央题库去重（已存在则跳过，不重复建立）。
 *   · 中央已有（题型 + 级别 + 内容相同）→ 跳过，计入 existed
 *   · 中央没有（新题）               → 建为中央题，计入 created
 */
export async function POST(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    const classificationsJson = formData.get('classifications') as string | null;
    let classifications: Record<string, string> = {};
    if (classificationsJson) {
      try {
        classifications = JSON.parse(classificationsJson);
      } catch { /* ignore */ }
    }

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: '请上传文件' }, { status: 400 });
    }

    const { parsedFiles, fileErrors } = await parseQuestionFiles(files, classifications);

    const totalResults = {
      totalFiles: files.length,
      totalRows: 0,
      created: 0,
      existed: 0,
      replaced: 0,
      fileResults: [] as Array<{
        filename: string;
        parsed: unknown;
        rows: number;
        created: number;
        existed: number;
        replaced: number;
        byType?: Record<string, number>;
        error?: string;
      }>,
    };

    for (const fe of fileErrors) {
      totalResults.fileResults.push({
        filename: fe.filename,
        parsed: null,
        rows: 0,
        created: 0,
        existed: 0,
        replaced: 0,
        error: fe.error,
      });
    }

    if (parsedFiles.length > 0) {
      const importTypes = [
        ...new Set(parsedFiles.flatMap((pf) => pf.uniqueRows.map((r) => r.type))),
      ];
      // 中央题库现有指纹（用于去重）
      const centralExisting = await prisma.question.findMany({
        where: { examSourceId: null, type: { in: importTypes } },
        select: { type: true, level: true, content: true },
      });
      const centralFp = new Set(
        centralExisting.map((q) => questionFp(q.type, q.level, q.content))
      );
      const batchFp = new Set<string>(); // 本次导入内（跨文件）去重

      await prisma.$transaction(
        async (tx) => {
          for (const pf of parsedFiles) {
            const toCreate: { row: QuestionImportRow; cat: string; level: string }[] = [];
            let existed = 0;
            for (const row of pf.uniqueRows) {
              const cat = pf.hasPerRowCategory && row.category ? row.category : pf.fileCategory;
              const level = cat === 'BASIC' ? '' : pf.parsed?.level || row.level || '';
              const fp = questionFp(row.type, level, row.content);
              if (batchFp.has(fp)) continue;
              batchFp.add(fp);
              if (centralFp.has(fp)) {
                existed++; // 中央已有 → 跳过
                continue;
              }
              centralFp.add(fp);
              toCreate.push({ row, cat, level });
            }

            const newQuestions = toCreate.map(({ row, cat, level }) => ({
              id: randomUUID(),
              type: row.type,
              content: row.content,
              level,
              department: pf.parsed?.department || row.department,
              role: row.role,
              correctAnswer: row.correctAnswer ?? null,
              isMultiSelect: row.isMultiSelect ?? false,
              referenceAnswer: row.referenceAnswer ?? null,
              sourceFile: pf.file.name,
              process: row.process || pf.parsed?.process || null,
              category: cat,
              examSourceId: null, // ← 中央题库（共享、可被所有考试抽取）
            }));

            if (newQuestions.length > 0) {
              await tx.question.createMany({ data: newQuestions });
              const allOptions = newQuestions.flatMap((q, qi) =>
                (toCreate[qi].row.options || []).map((opt, idx) => ({
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

            totalResults.totalRows += pf.uniqueRows.length;
            totalResults.created += newQuestions.length;
            totalResults.existed += existed;
            totalResults.fileResults.push({
              filename: pf.file.name,
              parsed: pf.parsed,
              rows: pf.uniqueRows.length,
              created: newQuestions.length,
              existed,
              replaced: 0,
              byType: pf.byType,
            });
          }
        },
        { timeout: 60000 }
      );
    }

    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'QUESTION_IMPORTED',
        details: {
          target: 'CENTRAL',
          totalFiles: totalResults.totalFiles,
          totalRows: totalResults.totalRows,
          created: totalResults.created,
          existed: totalResults.existed,
        },
      },
    });

    return NextResponse.json({ success: true, data: totalResults });
  } catch (error) {
    console.error('Import central questions error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
