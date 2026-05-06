const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Find the exam
  const exams = await p.exam.findMany({ select: { id: true, title: true, status: true } });
  console.log('Exams found:', exams.length);
  for (const e of exams) console.log(`  ${e.id} - ${e.title} (${e.status})`);

  if (exams.length === 0) { console.log('No exams to delete'); return; }

  const examId = exams[0].id;
  console.log(`\nDeleting exam: ${examId}`);

  // Get session IDs
  const sessions = await p.examSession.findMany({ where: { examId }, select: { id: true } });
  const sessionIds = sessions.map(s => s.id);
  console.log(`Sessions: ${sessionIds.length}`);

  // Get question IDs linked to this exam (for exam_questions cleanup, NOT deleting questions themselves)
  const eqCount = await p.examQuestion.count({ where: { examId } });
  console.log(`Exam questions: ${eqCount}`);

  // Delete in order
  if (sessionIds.length > 0) {
    const a = await p.answer.deleteMany({ where: { sessionId: { in: sessionIds } } });
    console.log(`Deleted answers: ${a.count}`);

    const r = await p.examResult.deleteMany({ where: { sessionId: { in: sessionIds } } });
    console.log(`Deleted results: ${r.count}`);

    const al = await p.auditLog.deleteMany({ where: { sessionId: { in: sessionIds } } });
    console.log(`Deleted audit logs (session): ${al.count}`);
  }

  const s = await p.examSession.deleteMany({ where: { examId } });
  console.log(`Deleted sessions: ${s.count}`);

  const eq = await p.examQuestion.deleteMany({ where: { examId } });
  console.log(`Deleted exam_questions: ${eq.count}`);

  const ea = await p.examAssignment.deleteMany({ where: { examId } });
  console.log(`Deleted assignments: ${ea.count}`);

  const eb = await p.examBatch.deleteMany({ where: { examId } });
  console.log(`Deleted batches: ${eb.count}`);

  const er = await p.examQuestionRule.deleteMany({ where: { examId } });
  console.log(`Deleted question rules: ${er.count}`);

  // Unlink questions from exam (set examSourceId to null) instead of deleting
  const qu = await p.question.updateMany({ where: { examSourceId: examId }, data: { examSourceId: null } });
  console.log(`Unlinked questions: ${qu.count} (kept in DB)`);

  // Delete exam itself
  await p.exam.delete({ where: { id: examId } });
  console.log(`Deleted exam: ${examId}`);

  // Verify what's left
  const usersLeft = await p.user.count();
  const questionsLeft = await p.question.count();
  const examsLeft = await p.exam.count();
  console.log(`\n=== REMAINING DATA ===`);
  console.log(`Users: ${usersLeft}`);
  console.log(`Questions: ${questionsLeft}`);
  console.log(`Exams: ${examsLeft}`);

  await p.$disconnect();
  console.log('\nDone!');
})().catch(e => { console.error(e); process.exit(1); });
