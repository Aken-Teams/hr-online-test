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
 * Import question bank files during exam creation/editing.
 *
 * Hybrid model (no duplication): for each uploaded question —
 *   · already in central bank (same type+level+content) → ExamSourceQuestion
 *     link only (reuse, no copy); counted as `existed`.
 *   · genuinely new → created as EXAM-EXCLUSIVE (examSourceId=examId); `created`.
 * An uploaded exam's pool = its exclusive questions + its linked central
 * questions (see question-generator). Exams without any upload draw from the
 * whole central bank by process+level.
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
      existed: 0,
      replaced: 0,
      fileResults: [] as Array<{
        filename: string;
        parsed: ReturnType<typeof parseQuestionFilename>;
        rows: number;
        created: number;
        existed: number;
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
          existed: 0,
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
          existed: 0,
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

    // ── Phase 2: 混合模型 —— 已在中央的「关联复用」，新题建为「本场独有」──
    // 逐题比对中央题库（type+level+content）：
    //   · 已在中央 → 只写 ExamSourceQuestion 关联（不复制），existed++
    //   · 新题     → 建为本场独有（examSourceId=examId），created++
    // 上传的考试 = 本场独有题 + 关联的中央题，组成其专属抽题池（见 question-generator）。
    if (parsedFiles.length > 0) {
      const fpOf = (type: string, level: string | null, content: string) =>
        `${type}||${(level || '').trim()}||${content.trim()}`;

      const importTypes = [...new Set(parsedFiles.flatMap((pf) => pf.uniqueRows.map((r) => r.type)))];
      // 中央题库指纹 → id（用于关联）
      const centralExisting = await prisma.question.findMany({
        where: { examSourceId: null, type: { in: importTypes } },
        select: { id: true, type: true, level: true, content: true },
      });
      const centralByFp = new Map(centralExisting.map((q) => [fpOf(q.type, q.level, q.content), q.id]));
      // 本场已有的独有题指纹（避免重复导入时重建）
      const ownExisting = await prisma.question.findMany({
        where: { examSourceId: examId, type: { in: importTypes } },
        select: { type: true, level: true, content: true },
      });
      const ownFp = new Set(ownExisting.map((q) => fpOf(q.type, q.level, q.content)));
      // 本场已关联的中央 id（避免重复关联）
      const alreadyLinked = new Set(
        (await prisma.examSourceQuestion.findMany({ where: { examId }, select: { questionId: true } }))
          .map((l) => l.questionId)
      );
      const batchFp = new Set<string>(); // 本次导入内（跨文件）去重

      await prisma.$transaction(
        async (tx) => {
          const linkRows: { examId: string; questionId: string }[] = [];
          for (const pf of parsedFiles) {
            const toCreate: { row: QuestionImportRow; cat: string; level: string }[] = [];
            let linked = 0;
            for (const row of pf.uniqueRows) {
              const cat = (pf.hasPerRowCategory && row.category) ? row.category : pf.fileCategory;
              const level = cat === 'BASIC' ? '' : (pf.parsed?.level || row.level || '');
              const fp = fpOf(row.type, level, row.content);
              if (batchFp.has(fp) || ownFp.has(fp)) continue; // 本次/本场已有
              batchFp.add(fp);
              const centralId = centralByFp.get(fp);
              if (centralId) {
                // 已在中央 → 关联复用（不复制）
                if (!alreadyLinked.has(centralId)) {
                  linkRows.push({ examId, questionId: centralId });
                  alreadyLinked.add(centralId);
                  linked++;
                }
              } else {
                toCreate.push({ row, cat, level }); // 新题 → 本场独有
              }
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
              examSourceId: examId, // ← 本场独有（不进中央、不共享）
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
            totalResults.existed += linked;
            totalResults.fileResults.push({
              filename: pf.file.name,
              parsed: pf.parsed,
              rows: pf.uniqueRows.length,
              created: newQuestions.length,
              existed: linked,
              replaced: 0,
              byType: pf.byType,
            });
          }

          // 关联中央题（去重）
          if (linkRows.length > 0) {
            await tx.examSourceQuestion.createMany({ data: linkRows, skipDuplicates: true });
          }
        },
        { timeout: 60000 }
      );
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
