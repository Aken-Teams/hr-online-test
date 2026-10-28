/**
 * AD／LDAP 串接連線測試
 * 用法：
 *   npx tsx scripts/verify-ad.ts                 # 查詢功能測試
 *   npx tsx scripts/verify-ad.ts --user 12345    # 查單一工號
 *   npx tsx scripts/verify-ad.ts --search 王     # 姓名模糊查詢
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const ad = await import('../src/lib/ldap');
  console.log('AD 設定狀態：', ad.isAdConfigured() ? '已設定' : '未設定（缺 AD_API）');
  console.log('預設網域：', ad.DEFAULT_AD_DOMAIN);

  const domain = arg('domain') ?? ad.DEFAULT_AD_DOMAIN;

  // --auth <工號> --password <密碼>：驗證 AD 登入（不重試，避免觸發帳號鎖定）
  const authUser = arg('auth');
  if (authUser) {
    const password = arg('password') ?? '';
    const started = Date.now();
    const result = await ad.authenticateAdUser(authUser, password, domain);
    const ms = ((Date.now() - started) / 1000).toFixed(1);
    if (result) {
      console.log(`
登入成功（${ms}s）@${domain}`);
      console.log('  工號：', result.username);
      console.log('  姓名：', result.displayName);
      console.log('  部門：', result.department ?? '-');
      console.log('  職稱：', result.title ?? '-');
    } else {
      console.log(`
登入失敗（${ms}s）@${domain}：工號或密碼錯誤`);
    }
    return;
  }

  const user = arg('user');
  if (user) {
    const u = await ad.getAdUser(user, domain);
    console.log('\n單一工號查詢：', u ?? '查無此人');
    return;
  }

  const search = arg('search');
  if (search) {
    const r = await ad.searchAdUsers(search, domain, 10);
    console.log(`\n姓名查詢「${search}」@${domain}：共 ${r.total} 筆${r.truncated ? '（已截斷）' : ''}`);
    r.users.forEach((u) =>
      console.log(`  ${u.username.padEnd(10)} ${u.displayName.padEnd(12)} ${u.department ?? '-'}`)
    );
    return;
  }

  console.log('\n取組織架構樹（可能較慢）…');
  const started = Date.now();
  const tree = await ad.getOrganizationTree(domain);
  const json = JSON.stringify(tree);
  console.log(`  完成，耗時 ${((Date.now() - started) / 1000).toFixed(1)}s，資料量 ${(json.length / 1024).toFixed(0)} KB`);
  console.log('  結構預覽：', json.slice(0, 400));
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
  process.exitCode = 1;
});
