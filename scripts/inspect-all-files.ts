import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const dataDir = path.join(__dirname, '..', 'data', '【已修改】部门发题库', '【已修改】部门发题库');

function inspectFile(filePath: string) {
  const filename = path.basename(filePath);
  const rel = path.relative(dataDir, filePath);

  try {
    const buf = fs.readFileSync(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });

    console.log(`\n${'='.repeat(70)}`);
    console.log(`FILE: ${rel}`);
    console.log(`Sheets: ${wb.SheetNames.join(', ')}`);

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const rows = range.e.r + 1;
      const cols = range.e.c + 1;

      console.log(`  Sheet "${sheetName}": ${rows} rows x ${cols} cols`);

      // Read first 5 rows to understand structure
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
      const previewRows = Math.min(5, data.length);

      for (let r = 0; r < previewRows; r++) {
        const row = data[r];
        const cells = row.map((c: any, i: number) => {
          const val = String(c ?? '').substring(0, 40);
          return `[${i}]${val}`;
        });
        console.log(`    Row ${r}: ${cells.join(' | ')}`);
      }

      // Check for question types
      const allRows = data.slice(1); // skip header
      const types = new Set<string>();
      for (const row of allRows) {
        // Look for columns that might indicate question type
        for (const cell of row) {
          const val = String(cell ?? '').trim();
          if (['判断题', '选择题', '多选题', '单选题', '简答题', '问答题', '填空题'].includes(val)) {
            types.add(val);
          }
        }
      }
      if (types.size > 0) {
        console.log(`    Question types found: ${[...types].join(', ')}`);
      }
      console.log(`    Total data rows: ${allRows.filter(r => r.some((c: any) => String(c ?? '').trim())).length}`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }
}

// Inspect basic knowledge files
console.log('\n' + '#'.repeat(70));
console.log('# BASIC KNOWLEDGE (基础知识10%)');
console.log('#'.repeat(70));

const basicDir = path.join(dataDir, '基础知识10%');
if (fs.existsSync(basicDir)) {
  const files = fs.readdirSync(basicDir).filter(f => f.match(/\.(xls|xlsx)$/i));
  for (const f of files) {
    inspectFile(path.join(basicDir, f));
  }
}

// Inspect professional knowledge files
console.log('\n' + '#'.repeat(70));
console.log('# PROFESSIONAL KNOWLEDGE (部门专业知识90%)');
console.log('#'.repeat(70));

const proDir = path.join(dataDir, '部门专业知识90%');
if (fs.existsSync(proDir)) {
  const files = fs.readdirSync(proDir).filter(f => f.match(/\.(xls|xlsx)$/i)).sort();
  for (const f of files) {
    inspectFile(path.join(proDir, f));
  }
}
