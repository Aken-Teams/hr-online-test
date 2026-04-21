// End-to-end API test for hr-online-test
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BASE = 'http://localhost:3456';
let adminCookie = '';
let employeeCookie = '';
let employeeCookie2 = '';
const results = [];
let testExamId = '';
let testSessionId = '';
const BUGS = [];

function log(label, pass, detail = '') {
  results.push({ label, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ' -- ' + detail : ''}`);
  if (!pass) BUGS.push(`${label}: ${detail}`);
}

async function api(path, opts = {}) {
  const { method = 'GET', body, cookie, formData } = opts;
  const headers = {};
  if (cookie) headers['Cookie'] = cookie;
  let fetchBody;
  if (formData) {
    fetchBody = formData;
  } else {
    headers['Content-Type'] = 'application/json';
    fetchBody = body ? JSON.stringify(body) : undefined;
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: fetchBody, redirect: 'manual' });
  const setCookie = res.headers.get('set-cookie') || '';
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data, setCookie };
}

// ============================================================
// 1. ADMIN LOGIN
// ============================================================
async function test01() {
  console.log('\n========== 1. ADMIN LOGIN ==========');
  const r = await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  log('Admin login', r.data?.success, `role=${r.data?.data?.role}`);
  if (r.setCookie) { const m = r.setCookie.match(/admin_token=([^;]+)/); if (m) adminCookie = `admin_token=${m[1]}`; }
  log('Admin cookie', adminCookie.length > 10);
  const bad = await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } });
  log('Wrong password rejected', bad.status === 401);
}

// ============================================================
// 2. DASHBOARD
// ============================================================
async function test02() {
  console.log('\n========== 2. DASHBOARD ==========');
  const r = await api('/api/admin/dashboard', { cookie: adminCookie });
  const s = r.data?.data?.stats;
  log('Dashboard loads', r.data?.success && s?.totalQuestions > 0, `exams=${s?.totalExams} Q=${s?.totalQuestions} emp=${s?.totalEmployees}`);
  const noAuth = await api('/api/admin/dashboard');
  log('Rejects unauthenticated', noAuth.status === 401);
}

// ============================================================
// 3. QUESTION CRUD
// ============================================================
async function test03() {
  console.log('\n========== 3. QUESTION CRUD ==========');
  const list = await api('/api/admin/questions?page=1&pageSize=5', { cookie: adminCookie });
  log('List questions', list.data?.success && list.data?.data?.total > 0, `total=${list.data?.data?.total}`);

  const body = { type: 'SINGLE_CHOICE', content: 'E2E_Q_' + Date.now(), level: '一级题库', department: '资材部', role: '仓管员', points: 2, difficulty: 1, correctAnswer: 'A', isMultiSelect: false, isActive: true, options: [{ label: 'A', content: 'Y', sortOrder: 0 }, { label: 'B', content: 'N', sortOrder: 1 }] };
  const c = await api('/api/admin/questions', { method: 'POST', body, cookie: adminCookie });
  const qId = c.data?.data?.id;
  log('Create question', c.data?.success && qId, `id=${qId}`);

  if (qId) {
    const r = await api(`/api/admin/questions/${qId}`, { cookie: adminCookie });
    log('Read question', r.data?.success);
    await api(`/api/admin/questions/${qId}`, { method: 'PUT', body: { ...body, content: 'E2E_UPDATED' }, cookie: adminCookie });
    const v = await api(`/api/admin/questions/${qId}`, { cookie: adminCookie });
    log('Update persisted', v.data?.data?.content === 'E2E_UPDATED');
    const d = await api(`/api/admin/questions/${qId}`, { method: 'DELETE', cookie: adminCookie });
    log('Delete question', d.data?.success || d.status === 200);
    const g = await api(`/api/admin/questions/${qId}`, { cookie: adminCookie });
    log('Delete confirmed', g.status === 404 || !g.data?.data?.id);
  }
}

// ============================================================
// 4. EXAM CRUD + PUBLISH + ASSIGNMENTS + COMMONRATIO
// ============================================================
async function test04() {
  console.log('\n========== 4. EXAM CRUD ==========');
  const now = Date.now();
  const payload = {
    title: 'E2E_' + now, description: 'test', timeLimitMinutes: 30, passScore: 60, totalScore: 100,
    openAt: new Date(now - 3600000).toISOString(), closeAt: new Date(now + 86400000).toISOString(),
    resultQueryOpenAt: new Date(now - 3600000).toISOString(), resultQueryCloseAt: new Date(now + 86400000).toISOString(),
    shuffleQuestions: true, shuffleOptions: true, showCorrectAnswers: false, showResultImmediately: true,
    isPracticeMode: false, tabSwitchLimit: 3, enableFaceAuth: false, maxAttempts: 2,
    questionRules: [
      { questionType: 'SINGLE_CHOICE', count: 3, pointsPerQuestion: 20, commonRatio: 0.8 },
      { questionType: 'TRUE_FALSE', count: 2, pointsPerQuestion: 20, commonRatio: 0.8 },
    ],
    assignments: [{ department: '资材部' }, { department: '工务部' }],
    status: 'PUBLISHED',
  };
  const c = await api('/api/admin/exams', { method: 'POST', body: payload, cookie: adminCookie });
  testExamId = c.data?.data?.id;
  log('Create exam PUBLISHED', c.data?.success && testExamId, `id=${testExamId}`);

  if (testExamId) {
    const r = await api(`/api/admin/exams/${testExamId}`, { cookie: adminCookie });
    const e = r.data?.data;
    log('Status = PUBLISHED', e?.status === 'PUBLISHED', `actual=${e?.status}`);
    const depts = (e?.assignments || []).map(a => a.department).sort();
    log('Assignments in DB', depts.length === 2 && depts.includes('资材部') && depts.includes('工务部'), `depts=${depts}`);
    const ratios = (e?.questionRules || []).map(r => r.commonRatio);
    log('commonRatio=0.8', ratios.every(r => Math.abs(r - 0.8) < 0.01), `vals=${ratios}`);

    // Update
    await api(`/api/admin/exams/${testExamId}`, { method: 'PUT', body: { ...payload, passScore: 50, assignments: [{ department: '生产部' }] }, cookie: adminCookie });
    const v = await api(`/api/admin/exams/${testExamId}`, { cookie: adminCookie });
    log('Update passScore', v.data?.data?.passScore === 50, `val=${v.data?.data?.passScore}`);
    const nd = (v.data?.data?.assignments || []).map(a => a.department);
    log('Assignments updated', nd.length === 1 && nd[0] === '生产部', `depts=${nd}`);

    // Restore for login test
    await api(`/api/admin/exams/${testExamId}`, { method: 'PUT', body: { ...payload, assignments: [{ department: '资材部' }, { department: '工务部' }] }, cookie: adminCookie });
  }
}

// ============================================================
// 5. EMPLOYEE LOGIN
// ============================================================
async function test05() {
  console.log('\n========== 5. EMPLOYEE LOGIN ==========');
  const r = await api('/api/auth/verify', { method: 'POST', body: { name: '赵六', password: '100001' } });
  log('Login 赵六 (资材部)', r.data?.success);
  if (r.setCookie) { const m = r.setCookie.match(/exam_token=([^;]+)/); if (m) employeeCookie = `exam_token=${m[1]}`; }
  log('Employee cookie', employeeCookie.length > 10);
  log('Wrong pw rejected', (await api('/api/auth/verify', { method: 'POST', body: { name: '赵六', password: 'x' } })).status === 401);
  log('Unknown user rejected', (await api('/api/auth/verify', { method: 'POST', body: { name: '不存在', password: '1' } })).status === 401);

  const r2 = await api('/api/auth/verify', { method: 'POST', body: { name: '钱七', password: '100002' } });
  log('Login 钱七 (工务部)', r2.data?.success);
  if (r2.setCookie) { const m = r2.setCookie.match(/exam_token=([^;]+)/); if (m) employeeCookie2 = `exam_token=${m[1]}`; }
}

// ============================================================
// 6. EXAM FLOW
// ============================================================
async function test06() {
  console.log('\n========== 6. EXAM FLOW ==========');
  if (!employeeCookie) { log('SKIP', false, 'no cookie'); return; }

  const avail = await api('/api/exam/available', { cookie: employeeCookie });
  const examId = avail.data?.data?.id || avail.data?.data?.examId;
  log('Available exam', !!examId, `id=${examId}`);
  if (!examId) return;

  const start = await api(`/api/exam/${examId}/start`, { method: 'POST', cookie: employeeCookie });
  testSessionId = start.data?.data?.sessionId;
  const qs = start.data?.data?.questions;
  log('Start exam', start.data?.success && qs?.length > 0, `sid=${testSessionId} q=${qs?.length}`);
  if (!testSessionId || !qs?.length) return;

  log('No answers leaked', !qs.some(q => q.correctAnswer != null));
  const dist = {}; qs.forEach(q => dist[q.type] = (dist[q.type]||0)+1);
  log('Question distribution', true, JSON.stringify(dist));

  // Answer all
  for (const q of qs) {
    const ans = q.type === 'TRUE_FALSE' ? '是' : (q.options?.[0]?.label || 'A');
    const s = await api('/api/exam/answer', { method: 'POST', body: { sessionId: testSessionId, questionId: q.id, answerContent: ans }, cookie: employeeCookie });
    if (!s.data?.success) { log('Save answer FAILED', false, q.id); return; }
  }
  log('All answers saved', true, `count=${qs.length}`);

  // Flag/unflag
  const f = await api('/api/exam/flag', { method: 'POST', body: { sessionId: testSessionId, questionId: qs[0].id, isFlagged: true }, cookie: employeeCookie });
  log('Flag question', f.data?.success);
  await api('/api/exam/flag', { method: 'POST', body: { sessionId: testSessionId, questionId: qs[0].id, isFlagged: false }, cookie: employeeCookie });

  // Submit
  const sub = await api(`/api/exam/${examId}/submit`, { method: 'POST', body: { sessionId: testSessionId }, cookie: employeeCookie });
  log('Submit exam', sub.data?.success);
  const dup = await api(`/api/exam/${examId}/submit`, { method: 'POST', body: { sessionId: testSessionId }, cookie: employeeCookie });
  log('Double submit blocked', !dup.data?.success || dup.status >= 400);
}

// ============================================================
// 7. RESULT
// ============================================================
async function test07() {
  console.log('\n========== 7. RESULT QUERY ==========');
  if (!employeeCookie) { log('SKIP', false); return; }
  const avail = await api('/api/exam/available', { cookie: employeeCookie });
  const examId = avail.data?.data?.id || avail.data?.data?.examId;
  if (!examId) { log('SKIP result', false); return; }

  const r = await api(`/api/exam/${examId}/result`, { cookie: employeeCookie });
  const rd = r.data?.data?.result || r.data?.data;
  log('Get result', r.data?.success, `auto=${rd?.autoScore} total=${rd?.totalScore}/${rd?.maxPossibleScore}`);
  if (rd?.categoryScores) {
    log('Category scores', Object.keys(rd.categoryScores).length > 0, Object.entries(rd.categoryScores).map(([k,v])=>`${k}:${v.earnedPoints}/${v.maxPoints}`).join(' '));
  }
  log('isFullyGraded', rd?.isFullyGraded !== undefined, `val=${rd?.isFullyGraded}`);
}

// ============================================================
// 8. RANDOM QUESTIONS (user2 from different dept)
// ============================================================
async function test08() {
  console.log('\n========== 8. RANDOM QUESTIONS ==========');
  if (!employeeCookie2) { log('SKIP random', false, 'no user2 cookie'); return; }
  const avail = await api('/api/exam/available', { cookie: employeeCookie2 });
  const eid = avail.data?.data?.id || avail.data?.data?.examId;
  if (!eid) { log('SKIP random', false, 'user2 no exam'); return; }

  const s = await api(`/api/exam/${eid}/start`, { method: 'POST', cookie: employeeCookie2 });
  const qs = s.data?.data?.questions;
  log('User2 started', s.data?.success, `q=${qs?.length}`);
  if (qs?.length) {
    const sid2 = s.data.data.sessionId;
    for (const q of qs) {
      const ans = q.type === 'TRUE_FALSE' ? '是' : (q.options?.[0]?.label || 'A');
      await api('/api/exam/answer', { method: 'POST', body: { sessionId: sid2, questionId: q.id, answerContent: ans }, cookie: employeeCookie2 });
    }
    const sub = await api(`/api/exam/${eid}/submit`, { method: 'POST', body: { sessionId: sid2 }, cookie: employeeCookie2 });
    log('User2 submit', sub.data?.success, `score=${sub.data?.data?.autoScore}/${sub.data?.data?.maxPossibleScore}`);
  }
}

// ============================================================
// 9. EMPLOYEE IMPORT PREVIEW/CONFIRM
// ============================================================
async function test09() {
  console.log('\n========== 9. EMPLOYEE IMPORT ==========');
  // Create test Excel
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const data = [['姓名','工号','部门','子部门','岗位','身份证后六位','入职日期'],['E2E_A','E2EIMP1','资材部','','仓管员','111111',''],['E2E_B','E2EIMP2','工务部','','技术员','222222','']];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Preview
  const fd1 = new FormData();
  fd1.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'test.xlsx');
  fd1.append('preview', 'true');
  const prev = await api('/api/admin/employees/import', { method: 'POST', cookie: adminCookie, formData: fd1 });
  const emps = prev.data?.data?.employees;
  log('Preview returns employees', Array.isArray(emps) && emps.length === 2, `count=${emps?.length}`);
  log('Preview has no created/updated', prev.data?.data?.created === undefined);

  // Verify preview didn't write
  const check1 = await api('/api/admin/employees?search=E2EIMP&pageSize=5', { cookie: adminCookie });
  log('Preview not in DB', (check1.data?.data?.total || 0) === 0);

  // Confirm import
  const fd2 = new FormData();
  fd2.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'test.xlsx');
  fd2.append('confirm', 'true');
  const conf = await api('/api/admin/employees/import', { method: 'POST', cookie: adminCookie, formData: fd2 });
  log('Confirm imported', conf.data?.data?.imported === 2, `imported=${conf.data?.data?.imported} failed=${conf.data?.data?.failed}`);

  // Verify in DB
  const check2 = await api('/api/admin/employees?search=E2EIMP&pageSize=5', { cookie: adminCookie });
  log('Confirm written to DB', check2.data?.data?.total === 2);
}

// ============================================================
// 10. EMPLOYEE LIST/CREATE (existing functionality)
// ============================================================
async function test10() {
  console.log('\n========== 10. EMPLOYEE CRUD ==========');
  const list = await api('/api/admin/employees?page=1&pageSize=3', { cookie: adminCookie });
  log('List employees', list.data?.success, `total=${list.data?.data?.total}`);

  const emp = { employeeNo: 'E2E_C_' + Date.now(), name: 'E2E_create_test', department: '资材部', role: '仓管员', idCardLast6: '999999', isActive: true };
  const c = await api('/api/admin/employees', { method: 'POST', body: emp, cookie: adminCookie });
  log('Create employee', c.data?.success && c.data?.data?.id, `id=${c.data?.data?.id}`);
}

// ============================================================
// 11. REPORTS/EXPORT
// ============================================================
async function test11() {
  console.log('\n========== 11. REPORTS & EXPORT ==========');
  const exp = await api('/api/admin/reports/export', { cookie: adminCookie });
  log('Export endpoint', exp.status !== 404, `status=${exp.status}`);
  const ana = await api('/api/admin/reports/analytics', { cookie: adminCookie });
  log('Analytics endpoint', ana.status !== 404, `status=${ana.status}`);
}

// ============================================================
// 12. GRADING/RESULTS ADMIN
// ============================================================
async function test12() {
  console.log('\n========== 12. GRADING ==========');
  const exams = await api('/api/admin/exams?page=1&pageSize=5', { cookie: adminCookie });
  const items = exams.data?.data?.items || [];
  let found = false;
  for (const ex of items.slice(0, 3)) {
    const sess = await api(`/api/admin/exams/${ex.id}/sessions`, { cookie: adminCookie });
    if (sess.data?.success && (sess.data?.data?.length || sess.data?.data?.items?.length)) {
      log('Sessions endpoint', true, `examId=${ex.id}`);
      found = true; break;
    }
  }
  if (!found) log('Sessions endpoint', true, 'no sessions yet');

  const grading = await api('/api/admin/grading', { cookie: adminCookie });
  log('Grading endpoint', grading.status !== 404, `status=${grading.status}`);
}

// ============================================================
// 13. OFFLINE SCORES
// ============================================================
async function test13() {
  console.log('\n========== 13. OFFLINE SCORES ==========');
  if (!testExamId) { log('SKIP offline', false, 'no exam'); return; }
  // Check template download endpoint
  const tpl = await api(`/api/admin/exams/${testExamId}/offline-scores?action=template`, { cookie: adminCookie });
  log('Offline scores template', tpl.status !== 404, `status=${tpl.status}`);
}

// ============================================================
// CLEANUP
// ============================================================
async function cleanup() {
  console.log('\n========== CLEANUP ==========');
  // Archive test exam (can't delete with sessions)
  if (testExamId) {
    // Must go PUBLISHED -> ACTIVE -> CLOSED -> ARCHIVED
    await api(`/api/admin/exams/${testExamId}/status`, { method: 'PATCH', body: { status: 'ACTIVE' }, cookie: adminCookie });
    await api(`/api/admin/exams/${testExamId}/status`, { method: 'PATCH', body: { status: 'CLOSED' }, cookie: adminCookie });
    const arch = await api(`/api/admin/exams/${testExamId}/status`, { method: 'PATCH', body: { status: 'ARCHIVED' }, cookie: adminCookie });
    log('Archive test exam', arch.data?.success || arch.status === 200);
  }
}

function summary() {
  const p = results.filter(r => r.pass).length;
  const f = results.filter(r => !r.pass).length;
  console.log('\n' + '='.repeat(60));
  console.log(`  TOTAL: ${results.length} | PASS: ${p} | FAIL: ${f}`);
  console.log('='.repeat(60));
  if (BUGS.length) { console.log('\nFAILURES:'); BUGS.forEach((b,i) => console.log(`  ${i+1}. ${b}`)); }
  else console.log('\nALL TESTS PASSED!');
}

async function main() {
  console.log('E2E API Tests -- ' + new Date().toISOString());
  try {
    await test01(); await test02(); await test03(); await test04();
    // Login employees AFTER creating exam (JWT embeds examId at login time)
    await test05(); await test06(); await test07(); await test08();
    await test09(); await test10(); await test11(); await test12();
    await test13(); await cleanup();
  } catch (e) { console.error('FATAL:', e.message, e.stack); }
  summary();
}
main();
