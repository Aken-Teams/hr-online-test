/**
 * OCR 閘道連線測試（PDF / 圖片 → 文字）
 *
 * 用法：
 *   npx tsx scripts/ocr-test.ts --list
 *   npx tsx scripts/ocr-test.ts <檔案路徑> [--sync] [--engine paddleocr-remote]
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
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : null;
}

async function main() {
  const ocr = await import('../src/lib/ocr');

  if (!ocr.isOcrConfigured()) {
    console.error('未設定 PRIVATE_AI_API_KEY，請於 .env 填入後再試。');
    process.exitCode = 1;
    return;
  }

  console.log('引擎清單：');
  const engines = await ocr.listOcrEngines();
  for (const e of engines) {
    console.log(`  ${e.available ? '●' : '○'} ${e.id}${e.available ? '' : '（離線）'}`);
  }

  if (process.argv.includes('--list')) return;

  const target = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!target) {
    console.log('\n未指定檔案，僅列出引擎。用法：npx tsx scripts/ocr-test.ts <檔案>');
    return;
  }

  const filePath = path.resolve(process.cwd(), target);
  const buffer = readFileSync(filePath);
  const fileName = path.basename(filePath);
  const engine = arg('engine') ?? ocr.getOcrEngineId();
  const blob = new Blob([new Uint8Array(buffer)]);

  console.log(`\n檔案：${fileName}（${(buffer.length / 1024).toFixed(1)} KB）`);
  console.log(`引擎：${engine}`);

  const startedAt = Date.now();

  if (process.argv.includes('--sync')) {
    console.log('模式：同步辨識');
    const text = await ocr.recognizeImageSync(blob, fileName, engine);
    console.log(`耗時 ${((Date.now() - startedAt) / 1000).toFixed(1)}s，共 ${text.length} 字`);
    console.log('--- 前 500 字 ---');
    console.log(text.slice(0, 500));
    return;
  }

  console.log('模式：非同步（送出 → 輪詢）');
  const jobId = await ocr.submitOcrJob(blob, fileName, engine);
  console.log(`job_id：${jobId}`);

  let lastStatus = '';
  const job = await ocr.waitForOcrJob(jobId, {
    onProgress: (j) => {
      const label = `${j.status}${j.progress != null ? ` ${Math.round(j.progress * 100)}%` : ''}`;
      if (label !== lastStatus) {
        lastStatus = label;
        console.log(`  [${((Date.now() - startedAt) / 1000).toFixed(0)}s] ${label}`);
      }
    },
  });

  const text = job.text ?? '';
  console.log(`\n完成，耗時 ${((Date.now() - startedAt) / 1000).toFixed(1)}s，共 ${text.length} 字`);
  if (job.pages?.length) console.log(`頁數：${job.pages.length}`);
  console.log('--- 前 500 字 ---');
  console.log(text.slice(0, 500));
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exitCode = 1;
});
