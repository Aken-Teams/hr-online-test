/**
 * Clear all test data from the database.
 * Keeps: Admin accounts
 * Deletes: Everything else (users, exams, questions, sessions, scores, audit logs, etc.)
 *
 * Usage: npx tsx scripts/clear-all-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== 清除所有測試資料 ===\n');

  // Delete in correct order (child → parent) to respect foreign keys

  // 1. Audit logs
  const auditLogs = await prisma.auditLog.deleteMany();
  console.log(`  審計日誌 (audit_logs): ${auditLogs.count} 筆`);

  // 2. Answers
  const answers = await prisma.answer.deleteMany();
  console.log(`  答案 (answers): ${answers.count} 筆`);

  // 3. Exam results
  const results = await prisma.examResult.deleteMany();
  console.log(`  考試結果 (exam_results): ${results.count} 筆`);

  // 4. Exam sessions
  const sessions = await prisma.examSession.deleteMany();
  console.log(`  考試場次 (exam_sessions): ${sessions.count} 筆`);

  // 5. Exam questions (exam-question mapping)
  const examQuestions = await prisma.examQuestion.deleteMany();
  console.log(`  考試題目映射 (exam_questions): ${examQuestions.count} 筆`);

  // 6. Exam question rules
  const rules = await prisma.examQuestionRule.deleteMany();
  console.log(`  出題規則 (exam_question_rules): ${rules.count} 筆`);

  // 7. Exam assignments
  const assignments = await prisma.examAssignment.deleteMany();
  console.log(`  考試指派 (exam_assignments): ${assignments.count} 筆`);

  // 8. Exams
  const exams = await prisma.exam.deleteMany();
  console.log(`  考試 (exams): ${exams.count} 筆`);

  // 9. Question tags
  const tags = await prisma.questionTag.deleteMany();
  console.log(`  題目標籤 (question_tags): ${tags.count} 筆`);

  // 10. Question options
  const options = await prisma.questionOption.deleteMany();
  console.log(`  題目選項 (question_options): ${options.count} 筆`);

  // 11. Questions
  const questions = await prisma.question.deleteMany();
  console.log(`  題目 (questions): ${questions.count} 筆`);

  // 12. Users (employees)
  const users = await prisma.user.deleteMany();
  console.log(`  員工 (users): ${users.count} 筆`);

  console.log('\n✓ 所有測試資料已清除（管理員帳號保留）');
}

main()
  .catch((e) => {
    console.error('清除失敗:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
