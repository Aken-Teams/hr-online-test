import { parseQuestionExcel } from '../src/lib/excel';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

const files = [
  'data/【已修改】部门发题库/【已修改】部门发题库/基础知识10%/半导体封装基础知识.xls',
  'data/【已修改】部门发题库/【已修改】部门发题库/基础知识10%/题库--环安.xls',
  'data/【已修改】部门发题库/【已修改】部门发题库/基础知识10%/题库模板-质量.xls',
];

for (const f of files) {
  const buf = fs.readFileSync(f);
  const wb = XLSX.read(buf, { type: 'buffer' });

  console.log('\n=== ' + f.split('/').pop() + ' ===');
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
    console.log('  Sheet "' + sn + '": ' + data.length + ' data rows');
    if (data.length > 0) {
      const headers = Object.keys(data[0] as Record<string, unknown>).filter(k => !k.startsWith('__'));
      console.log('    Headers: ' + headers.join(', '));
    }
  }

  const rows = parseQuestionExcel(buf);
  const byType: Record<string, number> = {};
  for (const r of rows) {
    byType[r.type] = (byType[r.type] || 0) + 1;
  }
  console.log('  PARSED total: ' + rows.length);
  console.log('  By type: ' + JSON.stringify(byType));
}
