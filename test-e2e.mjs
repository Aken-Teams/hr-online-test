/**
 * End-to-end test script: Employee takes exam → Admin monitors → Admin grades
 *
 * Uses 李四 (E002) as the test employee
 */

const BASE = 'http://localhost:3000';

// Cookie jar (simple)
let employeeCookie = '';
let adminCookie = '';

async function fetchJSON(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, headers: res.headers, text };
}

// ============================================================
// Step 1: Employee login (李四)
// ============================================================
async function step1_employeeLogin() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 1: Employee login (李四 / E002)');
  console.log('='.repeat(60));

  const res = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '李四', password: '234567' }),
  });

  const json = await res.json().catch(() => null);

  if (!json?.success) {
    console.log('❌ Login failed:', res.status, json);
    return false;
  }

  // Get cookie from set-cookie header, or use token from body
  const setCookie = res.headers.getSetCookie?.() || [];
  const examCookie = setCookie.find(c => c.startsWith('exam_token='));
  if (examCookie) {
    employeeCookie = examCookie.split(';')[0];
  } else if (json.data?.token) {
    employeeCookie = `exam_token=${json.data.token}`;
  }
  console.log('✅ Login success');

  if (json?.data?.employee) {
    const e = json.data.employee;
    console.log(`  Employee: ${e.name} (${e.employeeNo}), dept: ${e.department}`);
    console.log(`  Assigned exam ID: ${e.examId || 'none'}`);
  }

  return true;
}

// ============================================================
// Step 2: Start exam
// ============================================================
let sessionId = '';
let questions = [];

async function step2_startExam() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 2: Start exam');
  console.log('='.repeat(60));

  const examId = 'cmnsjw5ki0003u0gb57r3xxox';
  const res = await fetch(`${BASE}/api/exam/${examId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': employeeCookie,
    },
  });

  const json = await res.json();
  if (!json.success) {
    console.log('❌ Start exam failed:', json.error);
    return false;
  }

  sessionId = json.data.sessionId;
  questions = json.data.questions;
  console.log('✅ Exam started!');
  console.log('  Session ID:', sessionId);
  console.log('  Total questions:', questions.length);
  console.log('  Time remaining:', json.data.timeRemaining, 'seconds');

  // Show question breakdown
  const byType = {};
  for (const q of questions) {
    byType[q.type] = (byType[q.type] || 0) + 1;
  }
  console.log('  Question types:', JSON.stringify(byType));

  return true;
}

// ============================================================
// Step 3: Answer all questions
// ============================================================
async function step3_answerQuestions() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 3: Answer questions');
  console.log('='.repeat(60));

  let answeredCount = 0;

  for (const q of questions) {
    let answer = '';

    if (q.type === 'SINGLE_CHOICE') {
      // Pick option A (or first available)
      answer = q.options?.length > 0 ? q.options[0].label : 'A';
    } else if (q.type === 'MULTI_CHOICE') {
      // Pick first two options
      const labels = (q.options || []).map(o => o.label);
      answer = labels.slice(0, 2).join(',');
    } else if (q.type === 'TRUE_FALSE') {
      answer = '是';
    } else if (q.type === 'SHORT_ANSWER' || q.type === 'CASE_ANALYSIS' || q.type === 'PRACTICAL') {
      answer = '这是我的主观题答案。我认为应该从以下几个方面分析：第一，要注意安全生产规范；第二，要遵守操作规程；第三，要做好质量检查。';
    } else if (q.type === 'FILL_BLANK') {
      answer = '填空答案';
    }

    const res = await fetch(`${BASE}/api/exam/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': employeeCookie,
      },
      body: JSON.stringify({
        sessionId,
        questionId: q.id,
        answerContent: answer,
      }),
    });

    const json = await res.json();
    if (json.success) {
      answeredCount++;
    } else {
      console.log(`  ⚠️ Failed to answer Q${q.sortOrder + 1} (${q.type}):`, json.error);
    }
  }

  console.log(`✅ Answered ${answeredCount}/${questions.length} questions`);
  return true;
}

// ============================================================
// Step 4: Admin monitoring (check during exam)
// ============================================================
async function step4_adminMonitoring() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 4: Admin monitoring (before submit)');
  console.log('='.repeat(60));

  // Login as admin first
  if (!adminCookie) {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });

    const adminJson = await loginRes.json().catch(() => null);
    if (!adminJson?.success) {
      console.log('❌ Admin login failed:', loginRes.status, adminJson);
      return false;
    }

    const setCookies = loginRes.headers.getSetCookie?.() || [];
    const adminCk = setCookies.find(c => c.startsWith('admin_token='));
    if (adminCk) {
      adminCookie = adminCk.split(';')[0];
    } else if (adminJson.data?.token) {
      adminCookie = `admin_token=${adminJson.data.token}`;
    }
    console.log('✅ Admin login success');
  }

  // Check monitoring SSE (just fetch once, not streaming)
  const examId = 'cmnsjw5ki0003u0gb57r3xxox';
  const monRes = await fetch(`${BASE}/api/admin/monitoring/sessions?examId=${examId}`, {
    headers: { 'Cookie': adminCookie },
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);

  if (monRes) {
    const text = await monRes.text().catch(() => '');
    // Parse SSE data
    const dataLine = text.split('\n').find(l => l.startsWith('data:'));
    if (dataLine) {
      const data = JSON.parse(dataLine.replace('data: ', ''));
      console.log('✅ Monitoring data received');
      console.log('  Sessions count:', data.sessions?.length);
      for (const s of (data.sessions || [])) {
        console.log(`  - ${s.employeeName}: status=${s.status}, answered=${s.answeredCount}/${s.totalQuestions}, tabSwitch=${s.tabSwitchCount}`);
      }
    }
  }

  return true;
}

// ============================================================
// Step 5: Submit exam
// ============================================================
async function step5_submitExam() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 5: Submit exam');
  console.log('='.repeat(60));

  const res = await fetch(`${BASE}/api/exam/${sessionId}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': employeeCookie,
    },
  });

  const json = await res.json();
  if (!json.success) {
    console.log('❌ Submit failed:', json.error);
    return false;
  }

  console.log('✅ Exam submitted!');
  const r = json.data?.result;
  if (r) {
    console.log('  Total score:', r.totalScore, '/', r.maxPossibleScore);
    console.log('  Auto score:', r.autoScore);
    console.log('  Manual score:', r.manualScore ?? 'pending');
    console.log('  Correct count:', r.correctCount, '/', r.totalQuestions);
    console.log('  Is passed:', r.isPassed);
    console.log('  Is fully graded:', r.isFullyGraded);
    console.log('  Time taken:', r.timeTakenSeconds, 'seconds');
    console.log('  Grade label:', r.gradeLabel);
    if (r.categoryScores) {
      console.log('  Category scores:');
      for (const [type, data] of Object.entries(r.categoryScores)) {
        console.log(`    ${type}: ${data.earnedPoints}/${data.maxPoints} (${data.correctCount}/${data.count || data.totalCount} correct)`);
      }
    }
  }

  return true;
}

// ============================================================
// Step 6: Check employee result page
// ============================================================
async function step6_checkResult() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 6: Employee views result');
  console.log('='.repeat(60));

  const examId = 'cmnsjw5ki0003u0gb57r3xxox';
  const res = await fetch(`${BASE}/api/exam/${examId}/result`, {
    headers: { 'Cookie': employeeCookie },
  });

  const json = await res.json();
  if (!json.success) {
    console.log('❌ Get result failed:', json.error);
    return false;
  }

  const d = json.data;
  console.log('✅ Result loaded');
  console.log('  Status:', d.status);
  console.log('  Is pending:', d.isPending);
  if (d.result) {
    console.log('  Total score:', d.result.totalScore);
    console.log('  Correct count:', d.result.correctCount, '/', d.result.totalQuestions);
    console.log('  Is passed:', d.result.isPassed);
  }
  console.log('  Wrong answers:', d.wrongAnswers?.length);
  console.log('  Unanswered:', d.unansweredCount);
  console.log('  Pending grading:', d.pendingGradingCount);
  if (d.ranking) {
    console.log('  Rank:', d.ranking.rank, '/', d.ranking.totalParticipants);
  }

  return true;
}

// ============================================================
// Step 7: Admin checks grading page
// ============================================================
async function step7_adminGrading() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 7: Admin checks grading page');
  console.log('='.repeat(60));

  const examId = 'cmnsjw5ki0003u0gb57r3xxox';
  const res = await fetch(`${BASE}/api/admin/grading?examId=${examId}`, {
    headers: { 'Cookie': adminCookie },
  });

  const json = await res.json();
  if (!json.success) {
    console.log('❌ Get grading failed:', json.error);
    return false;
  }

  const d = json.data;
  console.log('✅ Grading data loaded');
  console.log('  Exam title:', d.examTitle);
  console.log('  Total pending:', d.totalPending);
  console.log('  Graded count:', d.gradedCount);
  console.log('  Answers to grade:', d.answers?.length);

  if (d.answers && d.answers.length > 0) {
    console.log('\n  Pending answers:');
    for (const a of d.answers.slice(0, 5)) {
      console.log(`  - [${a.questionType}] ${a.employeeName}: "${a.questionContent.substring(0, 40)}..."`);
      console.log(`    Answer: "${(a.answerContent || '').substring(0, 60)}..."`);
      console.log(`    Max points: ${a.maxPoints}, isGraded: ${a.isGraded}`);
    }
  }

  return d.answers?.length > 0 ? d.answers : null;
}

// ============================================================
// Step 8: Admin grades subjective answers
// ============================================================
async function step8_adminGradesAnswers(answers) {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 8: Admin grades subjective answers');
  console.log('='.repeat(60));

  if (!answers || answers.length === 0) {
    console.log('⚠️ No answers to grade');
    return true;
  }

  let gradedCount = 0;
  for (const a of answers) {
    // Give 60% of max points
    const points = Math.round(a.maxPoints * 0.6);
    const res = await fetch(`${BASE}/api/admin/grading`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie,
      },
      body: JSON.stringify({
        answerId: a.answerId,
        earnedPoints: points,
        comment: '回答基本正确，但缺少部分细节。',
      }),
    });

    const json = await res.json();
    if (json.success) {
      gradedCount++;
      console.log(`  ✅ Graded: ${a.questionType} - gave ${points}/${a.maxPoints} points`);
    } else {
      console.log(`  ❌ Grade failed: ${json.error}`);
    }
  }

  console.log(`\n✅ Graded ${gradedCount}/${answers.length} answers`);
  return true;
}

// ============================================================
// Step 9: Admin views detailed results
// ============================================================
async function step9_adminResultDetail() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 9: Admin views result detail');
  console.log('='.repeat(60));

  const res = await fetch(`${BASE}/api/admin/results/${sessionId}`, {
    headers: { 'Cookie': adminCookie },
  });

  const json = await res.json();
  if (!json.success) {
    console.log('❌ Get detail failed:', json.error);
    return false;
  }

  const d = json.data;
  console.log('✅ Detail loaded');
  console.log('  Employee:', d.employee.name, '(', d.employee.employeeNo, ')');
  console.log('  Department:', d.employee.department);
  console.log('  Status:', d.status);
  if (d.result) {
    console.log('  Total score:', d.result.totalScore, '/', d.result.maxPossibleScore);
    console.log('  Auto score:', d.result.autoScore);
    console.log('  Manual score:', d.result.manualScore);
    console.log('  Correct:', d.result.correctCount, '/', d.result.totalQuestions);
    console.log('  Is passed:', d.result.isPassed);
    console.log('  Fully graded:', d.result.isFullyGraded);
  }
  console.log('  Correct answers:', d.correctAnswers?.length);
  console.log('  Wrong answers:', d.wrongAnswers?.length);
  console.log('  All questions:', d.allQuestions?.length);
  console.log('  Unanswered:', d.unansweredCount);
  console.log('  Pending grading:', d.pendingGradingCount);

  return true;
}

// ============================================================
// Step 10: Admin analytics report
// ============================================================
async function step10_adminReport() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 10: Admin analytics report');
  console.log('='.repeat(60));

  const examId = 'cmnsjw5ki0003u0gb57r3xxox';
  const res = await fetch(`${BASE}/api/admin/reports/analytics?examId=${examId}`, {
    headers: { 'Cookie': adminCookie },
  });

  const json = await res.json();
  if (!json.success) {
    console.log('❌ Get analytics failed:', json.error);
    return false;
  }

  const d = json.data;
  console.log('✅ Analytics loaded');
  console.log('  Total participants:', d.totalParticipants);
  console.log('  Avg score:', d.avgScore);
  console.log('  Pass rate:', d.passRate, '%');
  console.log('  Highest:', d.highestScore);
  console.log('  Lowest:', d.lowestScore);
  console.log('  Rankings:', d.rankings?.length);
  console.log('  Absences:', d.absentCount);
  console.log('  Score distribution:', JSON.stringify(d.scoreDistribution));

  return true;
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('🚀 Starting E2E Test');
  console.log('Test employee: 李四 (E002)');
  console.log('Test exam: 2026年4月技能考核');

  const ok1 = await step1_employeeLogin();
  if (!ok1) { console.log('\n💥 ABORT: Login failed'); return; }

  const ok2 = await step2_startExam();
  if (!ok2) { console.log('\n💥 ABORT: Start exam failed'); return; }

  const ok3 = await step3_answerQuestions();
  if (!ok3) { console.log('\n💥 ABORT: Answer failed'); return; }

  const ok4 = await step4_adminMonitoring();

  const ok5 = await step5_submitExam();
  if (!ok5) { console.log('\n💥 ABORT: Submit failed'); return; }

  const ok6 = await step6_checkResult();

  const pendingAnswers = await step7_adminGrading();

  if (pendingAnswers && pendingAnswers.length > 0) {
    await step8_adminGradesAnswers(pendingAnswers);
  }

  await step9_adminResultDetail();
  await step10_adminReport();

  console.log('\n' + '='.repeat(60));
  console.log('🏁 E2E Test Complete!');
  console.log('='.repeat(60));
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
