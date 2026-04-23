import { parseQuestionExcel } from '../src/lib/excel';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

function testDir(label: string, dir: string) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.match(/\.xls/i)).sort();

  let totalParsed = 0;
  let totalRaw = 0;
  const issues: string[] = [];

  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    const wb = XLSX.read(buf, { type: 'buffer' });

    let fileRaw = 0;
    const sheetInfo: string[] = [];
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
      const count = data.filter(r => {
        const vals = Object.values(r).map(v => String(v ?? '').trim());
        return vals.some(v => v.length > 0);
      }).length;
      fileRaw += count;
      sheetInfo.push(`${sn}:${count}`);
    }

    const rows = parseQuestionExcel(buf);
    totalParsed += rows.length;
    totalRaw += fileRaw;

    if (rows.length < fileRaw * 0.8) {
      issues.push(`  ${f} — raw=${fileRaw} parsed=${rows.length} (${sheetInfo.join(', ')})`);
    }
  }

  console.log(`\n=== ${label} ===`);
  console.log(`Total raw: ${totalRaw}, Parsed: ${totalParsed}, Lost: ${totalRaw - totalParsed}`);
  if (issues.length > 0) {
    console.log('Files with >20% loss:');
    for (const i of issues) console.log(i);
  }
}

const base = 'data/【已修改】部门发题库/【已修改】部门发题库';
testDir('基础知识', path.join(base, '基础知识10%'));
testDir('专业知识', path.join(base, '部门专业知识90%'));
