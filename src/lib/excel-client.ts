import * as XLSX from 'xlsx';

/**
 * Client-side utility: check if an Excel file contains a `分类` column header,
 * indicating it was exported with per-row category data (基本题/专业题).
 * Files with this column don't need the manual classification dialog.
 */
export async function hasBuiltInClassification(file: File): Promise<boolean> {
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', sheetRows: 2 });
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
      if (rows.length === 0) continue;
      const headers = rows[0].map((h) => String(h ?? '').trim());
      if (headers.includes('分类')) return true;
    }
  } catch {
    // If we can't read the file, fall through to dialog
  }
  return false;
}

/**
 * Partition files into those that have built-in classification and those that don't.
 */
export async function partitionFilesByClassification(
  files: File[]
): Promise<{ withCategory: File[]; withoutCategory: File[] }> {
  const results = await Promise.all(files.map((f) => hasBuiltInClassification(f)));
  const withCategory: File[] = [];
  const withoutCategory: File[] = [];
  for (let i = 0; i < files.length; i++) {
    if (results[i]) {
      withCategory.push(files[i]);
    } else {
      withoutCategory.push(files[i]);
    }
  }
  return { withCategory, withoutCategory };
}
