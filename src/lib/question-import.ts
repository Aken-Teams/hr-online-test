import {
  parseQuestionExcel,
  parseQuestionFilename,
  extractHeadersAndSamples,
  detectFailedSheets,
} from '@/lib/excel';
import { identifyColumnsWithAI } from '@/lib/deepseek';
import { MAX_UPLOAD_SIZE } from '@/lib/constants';
import type { QuestionImportRow } from '@/types/exam';

export interface ParsedQuestionFile {
  file: File;
  parsed: ReturnType<typeof parseQuestionFilename>;
  uniqueRows: QuestionImportRow[];
  byType: Record<string, number>;
  fileCategory: string;
  hasPerRowCategory: boolean;
}

export interface QuestionFileError {
  filename: string;
  error: string;
}

/** 去重 / 比对指纹：题型 + 级别 + 内容 */
export const questionFp = (type: string, level: string | null, content: string) =>
  `${type}||${(level || '').trim()}||${content.trim()}`;

/**
 * 解析上传的题库文件（供「关联考试」与「直接进中央」两条导入路径共用）。
 * 负责：大小检查、Excel 解析、0 行时的 AI 栏位辨识回退、分类判定、档内去重。
 */
export async function parseQuestionFiles(
  files: File[],
  classifications: Record<string, string>
): Promise<{ parsedFiles: ParsedQuestionFile[]; fileErrors: QuestionFileError[] }> {
  const parsedFiles: ParsedQuestionFile[] = [];
  const fileErrors: QuestionFileError[] = [];

  for (const file of files) {
    if (file.size > MAX_UPLOAD_SIZE) {
      fileErrors.push({ filename: file.name, error: '文件大小超过10MB' });
      continue;
    }

    const parsed = parseQuestionFilename(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    let rows = parseQuestionExcel(buffer);

    // AI fallback：仅在初次解析 0 行时尝试用 AI 辨识栏位
    if (rows.length === 0) {
      const failedSheets = detectFailedSheets(buffer);
      if (failedSheets.length > 0) {
        let aiMapping: Record<string, string> = {};
        for (const failedSheet of failedSheets) {
          const extracted = extractHeadersAndSamples(buffer, 3, failedSheet);
          if (extracted) {
            const mapping = await identifyColumnsWithAI(extracted.headers, extracted.sampleRows);
            if (mapping) aiMapping = { ...aiMapping, ...mapping };
          }
        }
        if (Object.keys(aiMapping).length > 0) {
          rows = parseQuestionExcel(buffer, aiMapping);
        }
      }
    }

    const byType: Record<string, number> = {};
    for (const r of rows) byType[r.type] = (byType[r.type] || 0) + 1;

    if (rows.length === 0) {
      fileErrors.push({ filename: file.name, error: '未解析到有效题目' });
      continue;
    }

    const hasPerRowCategory = rows.some((r) => r.category);
    let fileCategory: string;
    if (classifications[file.name]) {
      fileCategory = classifications[file.name];
    } else {
      const isBasic =
        file.name.includes('基本') ||
        file.name.includes('基础') ||
        file.name.toLowerCase().includes('basic');
      fileCategory = isBasic ? 'BASIC' : 'PROFESSIONAL';
    }

    // 档内去重（题型 + 级别 + 内容）
    const seen = new Set<string>();
    const uniqueRows = rows.filter((row) => {
      const fp = questionFp(row.type, row.level ?? '', row.content);
      if (seen.has(fp)) return false;
      seen.add(fp);
      return true;
    });

    parsedFiles.push({ file, parsed, uniqueRows, byType, fileCategory, hasPerRowCategory });
  }

  return { parsedFiles, fileErrors };
}
