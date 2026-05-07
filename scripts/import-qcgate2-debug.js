const { PrismaClient } = require('@prisma/client');
const xlrd = require('xlsx');
const p = new PrismaClient();

(async () => {
  const wb = xlrd.readFile('data/【已修改】部门发题库/部门专业知识90%/制程品管部SAW&DB&WB&QCgateⅡ级.xls');
  const rows = xlrd.utils.sheet_to_json(wb.Sheets['单选前道'], { defval: '' });

  // Check first 5 rows
  for (let i = 0; i < 5; i++) {
    let content = String(rows[i]['试题描述(文本)'] || '').trim();
    const original = content;
    content = content.replace(/^\d+[\.\、\s]+/, '').trim();

    console.log('--- Row ' + (i+1) + ' ---');
    console.log('  Original: "' + original + '"');
    console.log('  Cleaned:  "' + content + '"');

    // Check exact match
    const exact = await p.question.findFirst({
      where: { content, type: 'SINGLE_CHOICE', isActive: true },
      select: { id: true, process: true, level: true, content: true },
    });
    if (exact) {
      console.log('  Found exact: process=' + exact.process + ' level=' + exact.level);
    }

    // Check contains match
    const partial = await p.question.findFirst({
      where: { content: { contains: content.substring(0, 20) }, type: 'SINGLE_CHOICE', isActive: true },
      select: { id: true, process: true, level: true, content: true },
    });
    if (partial) {
      console.log('  Found partial: process=' + partial.process + ' level=' + partial.level + ' content="' + partial.content.substring(0, 50) + '"');
    } else {
      console.log('  No match at all');
    }
  }

  await p.$disconnect();
})();
