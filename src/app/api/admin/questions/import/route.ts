import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { parseQuestionExcel, extractHeadersAndSamples } from '@/lib/excel';
import { identifyColumnsWithAI } from '@/lib/deepseek';
import { MAX_UPLOAD_SIZE } from '@/lib/constants';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

/**
 * Try to extract embedded images from an Excel file using a Python script.
 * Returns a mapping: { sheetName: { "row_col": "/uploads/question-images/xxx.png" } }
 * Returns null if extraction is not available (no Python/LibreOffice).
 */
async function extractExcelImages(
  filePath: string
): Promise<Record<string, Record<string, string>> | null> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'extract-excel-images.py');
  const outputDir = path.join(process.cwd(), 'public', 'uploads', 'question-images');

  try {
    await mkdir(outputDir, { recursive: true });
    const { stdout } = await execFileAsync('python3', [scriptPath, filePath, outputDir], {
      timeout: 30000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    const result = JSON.parse(stdout);
    if (result.error) {
      console.warn('Image extraction warning:', result.error);
      return null;
    }
    return result;
  } catch (err) {
    // Python or LibreOffice not available — silently skip image extraction
    console.warn('Image extraction skipped:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Build a lookup: given sheet name + row index (1-based from XLSX.js),
 * return a map of { colIndex -> imageUrl } for that row's option columns.
 *
 * XLSX.js rows are 1-based (header=0, first data row=1).
 * openpyxl anchor rows are 0-based. So XLSX row N = openpyxl row N.
 * Option columns: A=col1, B=col2, C=col3, D=col4 (0-indexed).
 */
function buildImageLookup(
  imageMap: Record<string, Record<string, string>>
): Map<string, Record<string, string>> {
  const lookup = new Map<string, Record<string, string>>();
  const colToLabel: Record<number, string> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' };

  for (const [sheetName, positions] of Object.entries(imageMap)) {
    for (const [key, url] of Object.entries(positions)) {
      const [rowStr, colStr] = key.split('_');
      const row = parseInt(rowStr, 10);
      const col = parseInt(colStr, 10);
      const label = colToLabel[col];
      if (!label) continue;

      const lookupKey = `${sheetName}__${row}`;
      if (!lookup.has(lookupKey)) lookup.set(lookupKey, {});
      lookup.get(lookupKey)![label] = url;
    }
  }

  return lookup;
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const category = (formData.get('category') as string) || 'PROFESSIONAL';

    if (!file) {
      return NextResponse.json(
        { success: false, error: '请上传文件' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { success: false, error: '文件大小不能超过10MB' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ];
    const validExtensions = ['.xls', '.xlsx'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
      return NextResponse.json(
        { success: false, error: '仅支持 .xls 和 .xlsx 格式' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Save to temp file for Python image extraction
    const tmpFile = path.join(os.tmpdir(), `import_${Date.now()}${ext}`);
    await writeFile(tmpFile, buffer);

    // Step 1: Extract images (if Python + openpyxl available)
    let imageMap: Record<string, Record<string, string>> | null = null;
    try {
      imageMap = await extractExcelImages(tmpFile);
    } catch {
      // Non-fatal: continue without images
    }

    // Step 2: Parse question text data
    let rows = parseQuestionExcel(buffer);

    // AI fallback: if rule-based parsing returned 0 rows, try AI column identification
    if (rows.length === 0) {
      const extracted = extractHeadersAndSamples(buffer);
      if (extracted) {
        const aiMapping = await identifyColumnsWithAI(extracted.headers, extracted.sampleRows);
        if (aiMapping) {
          rows = parseQuestionExcel(buffer, aiMapping);
        }
      }
    }

    // Cleanup temp file
    try { await unlink(tmpFile); } catch { /* ignore */ }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '未解析到有效题目数据' },
        { status: 400 }
      );
    }

    // Step 3: Build image lookup for matching options
    const imageLookup = imageMap ? buildImageLookup(imageMap) : null;
    let imagesAttached = 0;

    // Step 4: Enrich rows with image URLs
    if (imageLookup && imageLookup.size > 0) {
      for (const row of rows) {
        if (!row.options || !row._sheetName || row._rowIndex == null) continue;

        const lookupKey = `${row._sheetName}__${row._rowIndex}`;
        const optImages = imageLookup.get(lookupKey);
        if (!optImages) continue;

        for (const opt of row.options) {
          const imgUrl = optImages[opt.label];
          if (imgUrl) {
            opt.imageUrl = imgUrl;
            // If option text is empty, set placeholder
            if (!opt.content || opt.content === '（见图片）') {
              opt.content = '（见图片）';
            }
            imagesAttached++;
          }
        }

        // If all options were empty but now have images, ensure they exist
        if (row.options.length === 0 && Object.keys(optImages).length > 0) {
          for (const [label, imgUrl] of Object.entries(optImages)) {
            row.options.push({ label, content: '（见图片）', imageUrl: imgUrl });
          }
          imagesAttached += row.options.length;
        }
      }
    }

    // Step 5: Build duplicate detection set
    const existingQuestions = await prisma.question.findMany({
      select: { content: true, type: true, department: true },
    });
    const existingSet = new Set(
      existingQuestions.map((q) => `${q.type}||${q.department}||${q.content.trim()}`)
    );

    // Step 6: Bulk create questions
    let created = 0;
    let skipped = 0;
    let duplicates = 0;
    const errors: string[] = [];

    await prisma.$transaction(
      async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Duplicate check: same type + department + content
        const fingerprint = `${row.type}||${row.department}||${row.content.trim()}`;
        if (existingSet.has(fingerprint)) {
          duplicates++;
          continue;
        }

        try {
          await tx.question.create({
            data: {
              type: row.type,
              content: row.content,
              level: row.level,
              department: row.department,
              role: row.role,
              correctAnswer: row.correctAnswer ?? null,
              isMultiSelect: row.isMultiSelect ?? false,
              referenceAnswer: row.referenceAnswer ?? null,
              sourceFile: file.name,
              category,
              options: row.options
                ? {
                    create: row.options.map((opt, idx) => ({
                      label: opt.label,
                      content: opt.content,
                      imageUrl: opt.imageUrl ?? null,
                      sortOrder: idx,
                    })),
                  }
                : undefined,
            },
          });
          created++;
          existingSet.add(fingerprint);
        } catch (err) {
          skipped++;
          const message = err instanceof Error ? err.message : '未知错误';
          errors.push(`第 ${i + 1} 行: ${message}`);
        }
      }

      await tx.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'QUESTION_IMPORTED',
          details: {
            fileName: file.name,
            totalRows: rows.length,
            created,
            skipped,
            duplicates,
            imagesAttached,
          },
        },
      });
      },
      { timeout: 60000 }
    );

    return NextResponse.json({
      success: true,
      data: {
        totalRows: rows.length,
        created,
        skipped,
        duplicates,
        imagesAttached,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      },
    });
  } catch (error) {
    console.error('Import questions error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
