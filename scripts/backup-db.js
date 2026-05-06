const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const p = new PrismaClient();

(async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(__dirname, '..', 'backups', timestamp);
  fs.mkdirSync(dir, { recursive: true });

  // 1. Users (employees)
  const users = await p.user.findMany();
  fs.writeFileSync(path.join(dir, 'users.json'), JSON.stringify(users, null, 2));
  console.log(`Users: ${users.length} records`);

  // 2. Admins
  const admins = await p.admin.findMany();
  fs.writeFileSync(path.join(dir, 'admins.json'), JSON.stringify(admins, null, 2));
  console.log(`Admins: ${admins.length} records`);

  // 3. Questions
  const questions = await p.question.findMany();
  fs.writeFileSync(path.join(dir, 'questions.json'), JSON.stringify(questions, null, 2));
  console.log(`Questions: ${questions.length} records`);

  // 4. Question options
  const options = await p.questionOption.findMany();
  fs.writeFileSync(path.join(dir, 'question_options.json'), JSON.stringify(options, null, 2));
  console.log(`Question options: ${options.length} records`);

  // 5. Exams
  const exams = await p.exam.findMany();
  fs.writeFileSync(path.join(dir, 'exams.json'), JSON.stringify(exams, null, 2));
  console.log(`Exams: ${exams.length} records`);

  // 6. Exam assignments
  const assignments = await p.examAssignment.findMany();
  fs.writeFileSync(path.join(dir, 'exam_assignments.json'), JSON.stringify(assignments, null, 2));
  console.log(`Exam assignments: ${assignments.length} records`);

  // 7. Exam sessions
  const sessions = await p.examSession.findMany();
  fs.writeFileSync(path.join(dir, 'exam_sessions.json'), JSON.stringify(sessions, null, 2));
  console.log(`Exam sessions: ${sessions.length} records`);

  // 8. Exam results
  const results = await p.examResult.findMany();
  fs.writeFileSync(path.join(dir, 'exam_results.json'), JSON.stringify(results, null, 2));
  console.log(`Exam results: ${results.length} records`);

  // 9. Answers
  const answers = await p.answer.findMany();
  fs.writeFileSync(path.join(dir, 'answers.json'), JSON.stringify(answers, null, 2));
  console.log(`Answers: ${answers.length} records`);

  // 10. Exam questions (pivot)
  const examQuestions = await p.examQuestion.findMany();
  fs.writeFileSync(path.join(dir, 'exam_questions.json'), JSON.stringify(examQuestions, null, 2));
  console.log(`Exam questions: ${examQuestions.length} records`);

  // 11. Question rules
  const rules = await p.examQuestionRule.findMany();
  fs.writeFileSync(path.join(dir, 'exam_question_rules.json'), JSON.stringify(rules, null, 2));
  console.log(`Exam question rules: ${rules.length} records`);

  // 12. Batches
  const batches = await p.examBatch.findMany();
  fs.writeFileSync(path.join(dir, 'exam_batches.json'), JSON.stringify(batches, null, 2));
  console.log(`Exam batches: ${batches.length} records`);

  console.log(`\nAll data backed up to: ${dir}`);

  // Summary
  const totalSize = fs.readdirSync(dir)
    .map(f => fs.statSync(path.join(dir, f)).size)
    .reduce((a, b) => a + b, 0);
  console.log(`Total backup size: ${(totalSize / 1024).toFixed(1)} KB`);

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
