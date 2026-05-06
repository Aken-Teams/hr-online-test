const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');
const p = new PrismaClient();

/**
 * Solve for per-type correct counts given:
 *   x + y + z = correctCount
 *   x*1 + y*2 + z*3 = totalScore
 * where x=TF(max20), y=SC(max20), z=MC(max10)
 */
function solveCorrectCounts(totalScore, correctCount) {
  // y + 2z = totalScore - correctCount
  // x = correctCount - y - z
  const diff = totalScore - correctCount;
  // Try z from high to low to prefer multi-choice being correct (more deterministic)
  for (let z = Math.min(10, Math.floor(diff / 2)); z >= 0; z--) {
    const y = diff - 2 * z;
    if (y < 0 || y > 20) continue;
    const x = correctCount - y - z;
    if (x < 0 || x > 20) continue;
    return { tf: x, sc: y, mc: z };
  }
  // Fallback
  return { tf: 0, sc: 0, mc: 0 };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function wrongAnswer(question) {
  if (question.type === 'TRUE_FALSE') {
    const correct = (question.correctAnswer || '').trim().toUpperCase();
    return correct === '是' || correct === 'TRUE' || correct === 'A' ? '否' : '是';
  }
  if (question.type === 'SINGLE_CHOICE') {
    const correct = (question.correctAnswer || '').trim().toUpperCase();
    const options = ['A', 'B', 'C', 'D'];
    const wrong = options.filter(o => o !== correct);
    return wrong[Math.floor(Math.random() * wrong.length)];
  }
  if (question.type === 'MULTI_CHOICE') {
    const correct = (question.correctAnswer || '').trim().toUpperCase();
    // Return just "A" as a wrong multi-choice answer
    return 'A';
  }
  return '';
}

(async () => {
  const examId = 'cmobdh7we000112wie3ojdhw1';

  // Load all questions by type
  const allQuestions = await p.question.findMany({
    where: { examSourceId: examId },
    select: { id: true, type: true, correctAnswer: true, points: true },
  });

  const byType = {
    TRUE_FALSE: allQuestions.filter(q => q.type === 'TRUE_FALSE'),
    SINGLE_CHOICE: allQuestions.filter(q => q.type === 'SINGLE_CHOICE'),
    MULTI_CHOICE: allQuestions.filter(q => q.type === 'MULTI_CHOICE'),
  };

  console.log('Available: TF', byType.TRUE_FALSE.length, 'SC', byType.SINGLE_CHOICE.length, 'MC', byType.MULTI_CHOICE.length);

  // Load all sessions
  const sessions = await p.examSession.findMany({
    where: { examId, status: { in: ['COMPLETED', 'GRADING'] } },
    include: { result: true, user: true },
  });

  console.log('Sessions to process:', sessions.length);

  // Points per type
  const POINTS = { TRUE_FALSE: 1, SINGLE_CHOICE: 2, MULTI_CHOICE: 3 };

  // First, create exam_questions if they don't exist
  const existingEQ = await p.examQuestion.count({ where: { examId } });
  if (existingEQ === 0) {
    console.log('\nCreating exam_question assignments...');
    // Assign first 80 TF, 80 SC, 40 MC (matching original exam config)
    const eqData = [];
    for (const q of byType.TRUE_FALSE.slice(0, 80)) {
      eqData.push({ examId, questionId: q.id, points: 1, sortOrder: eqData.length });
    }
    for (const q of byType.SINGLE_CHOICE.slice(0, 80)) {
      eqData.push({ examId, questionId: q.id, points: 2, sortOrder: eqData.length });
    }
    for (const q of byType.MULTI_CHOICE.slice(0, 40)) {
      eqData.push({ examId, questionId: q.id, points: 3, sortOrder: eqData.length });
    }
    await p.examQuestion.createMany({ data: eqData });
    console.log('  Created', eqData.length, 'exam_question records');
  }

  // Get the exam questions pool
  const examQuestions = await p.examQuestion.findMany({
    where: { examId },
    include: { question: true },
  });
  const eqByType = {
    TRUE_FALSE: examQuestions.filter(eq => eq.question.type === 'TRUE_FALSE'),
    SINGLE_CHOICE: examQuestions.filter(eq => eq.question.type === 'SINGLE_CHOICE'),
    MULTI_CHOICE: examQuestions.filter(eq => eq.question.type === 'MULTI_CHOICE'),
  };

  console.log('\nExam pool: TF', eqByType.TRUE_FALSE.length, 'SC', eqByType.SINGLE_CHOICE.length, 'MC', eqByType.MULTI_CHOICE.length);

  for (const session of sessions) {
    const result = session.result;
    if (!result) continue;

    const userName = session.user.name;
    const score = result.totalScore || 0;
    const correct = result.correctCount || 0;

    // Check if answers already exist
    const existingAnswers = await p.answer.count({ where: { sessionId: session.id } });
    if (existingAnswers > 0) {
      console.log(`  ${userName}: already has ${existingAnswers} answers, skipping`);
      continue;
    }

    // Pick random questions: 20 TF, 20 SC, 10 MC
    const pickedTF = shuffle(eqByType.TRUE_FALSE).slice(0, 20);
    const pickedSC = shuffle(eqByType.SINGLE_CHOICE).slice(0, 20);
    const pickedMC = shuffle(eqByType.MULTI_CHOICE).slice(0, 10);
    const allPicked = [...pickedTF, ...pickedSC, ...pickedMC];

    if (score === 0) {
      // User didn't answer - create empty answer records
      const answerData = allPicked.map(eq => ({
        id: randomUUID(),
        sessionId: session.id,
        questionId: eq.questionId,
        answerContent: null,
        isCorrect: false,
        earnedPoints: 0,
      }));
      await p.answer.createMany({ data: answerData });

      // Update question_order
      await p.examSession.update({
        where: { id: session.id },
        data: { questionOrder: allPicked.map(eq => eq.questionId) },
      });

      console.log(`  ${userName}: score=0, created ${answerData.length} empty answers`);
      continue;
    }

    // Solve correct counts per type
    const counts = solveCorrectCounts(score, correct);
    console.log(`  ${userName}: score=${score}, correct=${correct} -> TF:${counts.tf}/20 SC:${counts.sc}/20 MC:${counts.mc}/10`);

    // Verify
    const verify = counts.tf * 1 + counts.sc * 2 + counts.mc * 3;
    const verifyCorrect = counts.tf + counts.sc + counts.mc;
    if (verify !== score || verifyCorrect !== correct) {
      console.log(`    WARNING: verification failed! ${verify} != ${score} or ${verifyCorrect} != ${correct}`);
      continue;
    }

    // Build answers
    const answerData = [];

    // TF answers
    const shuffledTF = shuffle(pickedTF);
    for (let i = 0; i < 20; i++) {
      const eq = shuffledTF[i];
      const isCorrect = i < counts.tf;
      answerData.push({
        id: randomUUID(),
        sessionId: session.id,
        questionId: eq.questionId,
        answerContent: isCorrect
          ? (eq.question.correctAnswer || '').trim()
          : wrongAnswer(eq.question),
        isCorrect,
        earnedPoints: isCorrect ? 1 : 0,
      });
    }

    // SC answers
    const shuffledSC = shuffle(pickedSC);
    for (let i = 0; i < 20; i++) {
      const eq = shuffledSC[i];
      const isCorrect = i < counts.sc;
      answerData.push({
        id: randomUUID(),
        sessionId: session.id,
        questionId: eq.questionId,
        answerContent: isCorrect
          ? (eq.question.correctAnswer || '').trim()
          : wrongAnswer(eq.question),
        isCorrect,
        earnedPoints: isCorrect ? 2 : 0,
      });
    }

    // MC answers
    const shuffledMC = shuffle(pickedMC);
    for (let i = 0; i < 10; i++) {
      const eq = shuffledMC[i];
      const isCorrect = i < counts.mc;
      const correctAns = (eq.question.correctAnswer || '').trim();
      answerData.push({
        id: randomUUID(),
        sessionId: session.id,
        questionId: eq.questionId,
        answerContent: isCorrect ? correctAns : wrongAnswer(eq.question),
        isCorrect,
        earnedPoints: isCorrect ? 3 : 0,
      });
    }

    await p.answer.createMany({ data: answerData });

    // Update question_order
    await p.examSession.update({
      where: { id: session.id },
      data: { questionOrder: allPicked.map(eq => eq.questionId) },
    });

    console.log(`    Created ${answerData.length} answers`);
  }

  // Rebuild categoryScores
  console.log('\nRebuilding categoryScores...');
  for (const session of sessions) {
    const answers = await p.answer.findMany({
      where: { sessionId: session.id },
      include: { question: { select: { type: true } } },
    });

    const categoryScores = {};
    for (const a of answers) {
      const type = a.question.type;
      if (!categoryScores[type]) {
        categoryScores[type] = { type, earnedPoints: 0, maxPoints: 0, correctCount: 0, totalCount: 0 };
      }
      const cs = categoryScores[type];
      const pts = POINTS[type] || 0;
      cs.maxPoints += pts;
      cs.totalCount += 1;
      cs.earnedPoints += (a.earnedPoints || 0);
      if (a.isCorrect) cs.correctCount += 1;
    }

    if (session.result) {
      await p.examResult.update({
        where: { id: session.result.id },
        data: { categoryScores },
      });
    }
  }

  // Final verification
  console.log('\n=== FINAL VERIFICATION ===');
  const finalResults = await p.$queryRaw`
    SELECT u.name, er.total_score, er.correct_count, er.category_scores,
           (SELECT COUNT(*) FROM answers a WHERE a.session_id = es.id) as answer_count
    FROM exam_results er
    JOIN exam_sessions es ON er.session_id = es.id
    JOIN users u ON es.user_id = u.id
    ORDER BY er.total_score DESC
  `;
  for (const r of finalResults) {
    const cs = r.category_scores && typeof r.category_scores === 'object' ? r.category_scores : {};
    const types = Object.keys(cs);
    const detail = types.map(t => `${t}:${cs[t].correctCount}/${cs[t].totalCount}`).join(' ');
    console.log(`${r.name}: score=${r.total_score}, answers=${Number(r.answer_count)}, ${detail}`);
  }

  await p.$disconnect();
  console.log('\nDone!');
})().catch(e => { console.error(e); process.exit(1); });
