import { parseQuestionExcel } from '../src/lib/excel';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const problemFiles = [
  'data/【已修改】部门发题库/【已修改】部门发题库/基础知识10%/半导体封装基础知识.xls',
  'data/【已修改】部门发题库/【已修改】部门发题库/部门专业知识90%/制程品管部SAW&DB&WB&QCgateⅠ级.xls',
  'data/【已修改】部门发题库/【已修改】部门发题库/部门专业知识90%/工务部MD&TFⅠ级.xls',
  'data/【已修改】部门发题库/【已修改】部门发题库/部门专业知识90%/资材部仓管Ⅰ级.xls',
];

for (const f of problemFiles) {
  const buf = fs.readFileSync(f);
  const wb = XLSX.read(buf, { type: 'buffer' });

  console.log(`\n=== ${path.basename(f)} ===`);

  const parsed = parseQuestionExcel(buf);
  const bySheet: Record<string, number> = {};
  for (const r of parsed) {
    const key = r._sheetName || 'unknown';
    bySheet[key] = (bySheet[key] || 0) + 1;
  }

  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const data = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
    const nonEmpty = data.filter(r =>
      Object.values(r).some(v => String(v ?? '').trim().length > 0)
    ).length;
    const parsedCount = bySheet[sn] || 0;
    const lost = nonEmpty - parsedCount;

    if (lost > 0) {
      const headers = data.length > 0
        ? Object.keys(data[0]).filter(k => !k.startsWith('__')).join(', ')
        : '(empty)';
      console.log(`  LOSS: "${sn}" raw=${nonEmpty} parsed=${parsedCount} lost=${lost}`);
      console.log(`    Headers: ${headers}`);
      if (data.length > 0) {
        const sample = Object.entries(data[0])
          .filter(([k]) => !k.startsWith('__'))
          .map(([k, v]) => `${k}="${String(v).substring(0, 30)}"`)
          .join(' | ');
        console.log(`    Sample: ${sample}`);
      }
    }
  }
}
