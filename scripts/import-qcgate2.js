const { PrismaClient } = require('@prisma/client');
const xlrd = require('xlsx');
const p = new PrismaClient();

const FILES = [
  {
    path: 'data/【已修改】部门发题库/部门专业知识90%/制程品管部SAW&DB&WB&QCgateⅡ级.xls',
    sheet: '单选前道',
    process: 'SAW&DB&WB&QCgate',
  },
  {
    path: 'data/【已修改】部门发题库/部门专业知识90%/制程品管部MD&TF&PT&TMTT&FQCⅡ级.xls',
    sheet: '单选',
    process: 'MD&TF&PT&TMTT&FQC',
  },
];

(async () => {
  const exam = await p.exam.findFirst();
  const examId = exam ? exam.id : null;
  console.log('Exam ID:', examId);

  for (const file of FILES) {
    console.log('\n=== ' + file.process + ' ===');

    const wb = xlrd.readFile(file.path);
    const rows = xlrd.utils.sheet_to_json(wb.Sheets[file.sheet], { defval: '' });
    console.log('Rows:', rows.length);

    let created = 0;
    let alreadyExists = 0;
    let copiedFromL1 = 0;

    for (const row of rows) {
      let content = String(row['试题描述(文本)'] || '').trim();
      if (!content) continue;
      content = content.replace(/^\d+[\.\、\s]+/, '').trim();

      // Already exists as Ⅱ级?
      const existingL2 = await p.question.findFirst({
        where: { content, type: 'SINGLE_CHOICE', process: file.process, level: 'Ⅱ级', isActive: true },
      });
      if (existingL2) { alreadyExists++; continue; }

      // Exists as Ⅰ级? Copy its options
      const existingL1 = await p.question.findFirst({
        where: { content, type: 'SINGLE_CHOICE', process: file.process, level: 'Ⅰ级', isActive: true },
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      });

      const answer = String(row['正确答案'] || '').trim().toUpperCase();

      if (existingL1) {
        // Clone from Ⅰ级 with level changed to Ⅱ级
        const correctAns = existingL1.correctAnswer || answer;
        await p.question.create({
          data: {
            type: 'SINGLE_CHOICE',
            content: existingL1.content,
            category: 'PROFESSIONAL',
            department: '制程品管部',
            process: file.process,
            level: 'Ⅱ级',
            role: '全员',
            isActive: true,
            isMultiSelect: false,
            correctAnswer: correctAns,
            examSourceId: examId,
            options: {
              create: existingL1.options.map((o) => ({
                label: o.label,
                content: o.content,
                sortOrder: o.sortOrder,
              })),
            },
          },
        });
        copiedFromL1++;
      } else {
        // Brand new question
        const options = [];
        const optCols = [
          { key: 'A', col: 'A选项(文本)' },
          { key: 'B', col: 'B选项(文本)' },
          { key: 'C', col: 'C选项(文本)' },
          { key: 'D', col: 'D选项(文本)' },
        ];
        for (let i = 0; i < optCols.length; i++) {
          let text = String(row[optCols[i].col] || '').trim();
          if (!text) continue;
          text = text.replace(/^[A-D][\.\、\s]+/, '').trim();
          options.push({
            label: optCols[i].key,
            content: text,
            sortOrder: i,
          });
        }
        if (options.length === 0) continue;

        await p.question.create({
          data: {
            type: 'SINGLE_CHOICE',
            content,
            category: 'PROFESSIONAL',
            department: '制程品管部',
            process: file.process,
            level: 'Ⅱ级',
            role: '全员',
            isActive: true,
            isMultiSelect: false,
            correctAnswer: answer,
            examSourceId: examId,
            options: { create: options },
          },
        });
        created++;
      }
    }

    console.log('Copied from Ⅰ级:', copiedFromL1);
    console.log('New created:', created);
    console.log('Already exists:', alreadyExists);
  }

  // Verify
  console.log('\n=== 验证 ===');
  for (const file of FILES) {
    const count = await p.question.count({
      where: { isActive: true, type: 'SINGLE_CHOICE', process: file.process, level: 'Ⅱ级' },
    });
    console.log(file.process + ' Ⅱ级 SINGLE_CHOICE:', count);
  }

  await p.$disconnect();
})();
