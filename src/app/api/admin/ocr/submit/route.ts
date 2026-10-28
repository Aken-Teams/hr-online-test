import { NextResponse } from 'next/server';
import { getAdminFromCookie } from '@/lib/auth';
import {
  isOcrConfigured,
  submitOcrJob,
  recognizeImageSync,
  getOcrEngineId,
  OcrPermissionError,
} from '@/lib/ocr';

/**
 * POST /api/admin/ocr/submit — 由後端代理送件，金鑰不外流至前端
 *
 * multipart/form-data:
 *   file   必填
 *   engine 選填，預設 paddleocr-remote
 *   sync   選填，"1" 時走同步辨識（僅建議單張小圖）
 *
 * 回傳 { jobId } 或（sync 時）{ text }
 */
export async function POST(request: Request) {
  const admin = await getAdminFromCookie();
  if (!admin) {
    return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
  }

  if (!isOcrConfigured()) {
    return NextResponse.json(
      { success: false, error: 'OCR 服务未配置（缺少 PRIVATE_AI_API_KEY）' },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: '请上传文件' }, { status: 400 });
    }

    const engine = String(formData.get('engine') || getOcrEngineId());
    const sync = String(formData.get('sync') || '') === '1';

    if (sync) {
      const text = await recognizeImageSync(file, file.name, engine);
      return NextResponse.json({ success: true, data: { engine, text } });
    }

    const jobId = await submitOcrJob(file, file.name, engine);
    return NextResponse.json({ success: true, data: { jobId, engine, fileName: file.name } });
  } catch (error) {
    const status = error instanceof OcrPermissionError ? 403 : 502;
    console.error('Submit OCR job error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}
