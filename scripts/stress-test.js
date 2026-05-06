/**
 * Stress Test: Simulate 100 concurrent exam-takers
 *
 * Flow per user:
 *   1. POST /api/auth/verify        → login, get cookie
 *   2. POST /api/exam/{id}/start    → start session, get questions
 *   3. POST /api/exam/answer × N    → answer all questions
 *   4. POST /api/exam/{id}/submit   → submit exam
 *
 * Uses existing employees and question bank.
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const BASE_URL = process.env.BASE_URL || 'http://localhost:12059';
const CONCURRENCY = 100; // how many users at once

const p = new PrismaClient();

// ─── Decrypt password (same logic as src/lib/auth.ts) ───
function getEncryptionKey() {
  const encKeyHex = process.env.ENCRYPTION_KEY || '';
  if (encKeyHex && encKeyHex.length === 64) {
    return Buffer.from(encKeyHex, 'hex');
  }
  const base = process.env.JWT_SECRET || 'fallback-secret';
  return crypto.createHash('sha256').update(base).digest();
}

function decryptValue(encryptedText) {
  const key = getEncryptionKey();
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function getPlainPassword(stored) {
  if (!stored) return null;
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) return null; // bcrypt, can't decrypt
  try { return decryptValue(stored); } catch { return null; }
}

// ─── Helpers ───

async function fetchJson(url, opts = {}) {
  const res = await fetch(`${BASE_URL}${url}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const json = await res.json();
  return { status: res.status, headers: res.headers, json };
}

function extractCookie(headers) {
  const raw = headers.getSetCookie?.() || [];
  for (const c of raw) {
    const match = c.match(/exam_token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

function randomAnswer(question) {
  if (question.type === 'TRUE_FALSE') {
    return Math.random() > 0.5 ? '是' : '否';
  }
  if (question.type === 'SINGLE_CHOICE') {
    const opts = ['A', 'B', 'C', 'D'];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  if (question.type === 'MULTI_CHOICE') {
    const opts = ['A', 'B', 'C', 'D'];
    const count = Math.floor(Math.random() * 3) + 1;
    const shuffled = opts.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).sort().join(',');
  }
  return 'test answer';
}

// ─── Phase 0: Setup exam ───

async function setupExam() {
  console.log('\n══════════════════════════════════════');
  console.log('  Phase 0: Setting up test exam');
  console.log('══════════════════════════════════════\n');

  // Get existing users
  const users = await p.user.findMany({
    where: { isActive: true, idCardLast6: { not: null } },
    select: { id: true, name: true, idCardLast6: true },
    take: CONCURRENCY,
  });
  // Decrypt passwords and filter users with valid passwords
  for (const u of users) {
    u.plainPassword = getPlainPassword(u.idCardLast6);
  }
  const validUsers = users.filter(u => u.plainPassword);
  console.log(`Found ${users.length} active users, ${validUsers.length} with decryptable passwords`);

  // Get question counts by type
  const tfCount = await p.question.count({ where: { type: 'TRUE_FALSE' } });
  const scCount = await p.question.count({ where: { type: 'SINGLE_CHOICE' } });
  const mcCount = await p.question.count({ where: { type: 'MULTI_CHOICE' } });
  console.log(`Questions: TF=${tfCount}, SC=${scCount}, MC=${mcCount}`);

  // Create exam
  const examId = crypto.randomUUID();
  const now = new Date();
  const closeAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now

  await p.exam.create({
    data: {
      id: examId,
      title: '压力测试考试',
      description: '100人并发压力测试',
      timeLimitMinutes: 60,
      passScore: 60,
      totalScore: 100,
      status: 'ACTIVE',
      shuffleQuestions: true,
      shuffleOptions: false,
      showResultImmediately: true,
      showCorrectAnswers: false,
      isPracticeMode: false,
      maxAttempts: 1,
      tabSwitchLimit: 99,
      enableFaceAuth: false,
      openAt: now,
      closeAt,
      theoryWeight: 0.4,
      practicalWeight: 0.6,
      compositePassScore: 90,
      basicQuestionRatio: 0.1,
    },
  });
  console.log(`Created exam: ${examId}`);

  // Create question rules
  await p.examQuestionRule.createMany({
    data: [
      { examId, questionType: 'TRUE_FALSE', count: 10, pointsPerQuestion: 2, commonRatio: 0.1 },
      { examId, questionType: 'SINGLE_CHOICE', count: 10, pointsPerQuestion: 4, commonRatio: 0.1 },
      { examId, questionType: 'MULTI_CHOICE', count: 10, pointsPerQuestion: 4, commonRatio: 0.1 },
    ],
  });

  // Create assignments for valid users only
  await p.examAssignment.createMany({
    data: validUsers.map((u) => ({
      examId,
      userId: u.id,
    })),
  });
  console.log(`Assigned ${validUsers.length} users`);

  return { examId, users: validUsers };
}

// ─── Phase 1-4: Single user flow ───

async function simulateUser(examId, user, index) {
  const timings = { login: 0, start: 0, answers: 0, submit: 0, total: 0 };
  const errors = [];
  const totalStart = Date.now();

  try {
    // 1. Login
    let t = Date.now();
    const loginRes = await fetchJson('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ name: user.name, password: user.plainPassword }),
    });
    timings.login = Date.now() - t;

    if (loginRes.status !== 200) {
      errors.push(`login: ${loginRes.json.error}`);
      timings.total = Date.now() - totalStart;
      return { index, user: user.name, timings, errors, success: false };
    }

    const token = extractCookie(loginRes.headers);
    if (!token) {
      errors.push('login: no cookie returned');
      timings.total = Date.now() - totalStart;
      return { index, user: user.name, timings, errors, success: false };
    }

    const cookieHeader = `exam_token=${token}`;

    // 2. Start exam
    t = Date.now();
    const startRes = await fetchJson(`/api/exam/${examId}/start`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
      body: JSON.stringify({}),
    });
    timings.start = Date.now() - t;

    if (startRes.status !== 200) {
      errors.push(`start(${startRes.status}): ${JSON.stringify(startRes.json).slice(0, 200)}`);
      timings.total = Date.now() - totalStart;
      return { index, user: user.name, timings, errors, success: false };
    }

    const { sessionId, questions } = startRes.json.data;

    // 3. Answer all questions (sequentially, like a real user)
    t = Date.now();
    let answerErrors = 0;
    for (const q of questions) {
      const ansRes = await fetchJson('/api/exam/answer', {
        method: 'POST',
        headers: { Cookie: cookieHeader },
        body: JSON.stringify({
          sessionId,
          questionId: q.id,
          answerContent: randomAnswer(q),
        }),
      });
      if (ansRes.status !== 200) answerErrors++;
    }
    timings.answers = Date.now() - t;
    if (answerErrors > 0) errors.push(`answers: ${answerErrors} failed`);

    // 4. Submit
    t = Date.now();
    const submitRes = await fetchJson(`/api/exam/${examId}/submit`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    timings.submit = Date.now() - t;

    if (submitRes.status !== 200) {
      errors.push(`submit: ${submitRes.json.error}`);
    }

    timings.total = Date.now() - totalStart;
    return {
      index,
      user: user.name,
      timings,
      errors,
      success: errors.length === 0,
      score: submitRes.json?.data?.result?.totalScore ?? null,
      questions: questions.length,
    };
  } catch (err) {
    timings.total = Date.now() - totalStart;
    errors.push(`exception: ${err.message}`);
    return { index, user: user.name, timings, errors, success: false };
  }
}

// ─── Main ───

(async () => {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   STRESS TEST: 100 Concurrent Users  ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Target: ${BASE_URL}`);

  // Check server is up
  try {
    await fetch(BASE_URL);
  } catch {
    console.error(`\nERROR: Server not reachable at ${BASE_URL}`);
    console.error('Please start the dev server first: npm run dev');
    process.exit(1);
  }

  const { examId, users } = await setupExam();
  const testUsers = users.slice(0, CONCURRENCY);

  console.log(`\n══════════════════════════════════════`);
  console.log(`  Phase 1: Running ${testUsers.length} concurrent users`);
  console.log(`══════════════════════════════════════\n`);

  const overallStart = Date.now();

  // Launch users in waves (simulates users arriving over ~30 seconds)
  const WAVE_SIZE = 10;
  const results = [];
  for (let w = 0; w < testUsers.length; w += WAVE_SIZE) {
    const wave = testUsers.slice(w, w + WAVE_SIZE);
    const waveNum = Math.floor(w / WAVE_SIZE) + 1;
    const totalWaves = Math.ceil(testUsers.length / WAVE_SIZE);
    process.stdout.write(`  Wave ${waveNum}/${totalWaves} (${wave.length} users)...`);
    const waveResults = await Promise.all(
      wave.map((user, i) => simulateUser(examId, user, w + i))
    );
    const ok = waveResults.filter(r => r.success).length;
    console.log(` ${ok}/${wave.length} success`);
    results.push(...waveResults);
    // Small delay between waves (simulate real-world staggered arrivals)
    if (w + WAVE_SIZE < testUsers.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const overallTime = Date.now() - overallStart;

  // ─── Analysis ───

  console.log('\n══════════════════════════════════════');
  console.log('  RESULTS');
  console.log('══════════════════════════════════════\n');

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`Total users:   ${results.length}`);
  console.log(`Successful:    ${successful.length}`);
  console.log(`Failed:        ${failed.length}`);
  console.log(`Total time:    ${(overallTime / 1000).toFixed(1)}s`);
  console.log(`Throughput:    ${(successful.length / (overallTime / 1000)).toFixed(1)} users/sec`);

  if (successful.length > 0) {
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const p50 = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * 0.5)]; };
    const p95 = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * 0.95)]; };
    const max = (arr) => Math.max(...arr);

    const metrics = ['login', 'start', 'answers', 'submit', 'total'];
    console.log('\n┌──────────┬──────────┬──────────┬──────────┬──────────┐');
    console.log('│ Phase    │ Avg (ms) │ P50 (ms) │ P95 (ms) │ Max (ms) │');
    console.log('├──────────┼──────────┼──────────┼──────────┼──────────┤');
    for (const m of metrics) {
      const vals = successful.map((r) => r.timings[m]);
      const label = m.padEnd(8);
      console.log(
        `│ ${label} │ ${String(Math.round(avg(vals))).padStart(8)} │ ${String(p50(vals)).padStart(8)} │ ${String(p95(vals)).padStart(8)} │ ${String(max(vals)).padStart(8)} │`
      );
    }
    console.log('└──────────┴──────────┴──────────┴──────────┴──────────┘');

    const scores = successful.filter((r) => r.score != null).map((r) => r.score);
    if (scores.length > 0) {
      console.log(`\nScores: avg=${Math.round(avg(scores))}, min=${Math.min(...scores)}, max=${Math.max(...scores)}`);
    }
  }

  if (failed.length > 0) {
    console.log('\n── Failed Users ──');
    for (const r of failed.slice(0, 10)) {
      console.log(`  ${r.user}: ${r.errors.join(', ')}`);
    }
    if (failed.length > 10) console.log(`  ... and ${failed.length - 10} more`);
  }

  // Cleanup: delete the test exam
  console.log('\n── Cleanup ──');
  const sessions = await p.examSession.findMany({ where: { examId }, select: { id: true } });
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length > 0) {
    await p.answer.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await p.examResult.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await p.auditLog.deleteMany({ where: { sessionId: { in: sessionIds } } });
  }
  await p.examSession.deleteMany({ where: { examId } });
  await p.examQuestion.deleteMany({ where: { examId } });
  await p.examAssignment.deleteMany({ where: { examId } });
  await p.examQuestionRule.deleteMany({ where: { examId } });
  await p.exam.delete({ where: { id: examId } });
  console.log('Test exam and all data cleaned up.');

  await p.$disconnect();
  console.log('\nDone!');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
