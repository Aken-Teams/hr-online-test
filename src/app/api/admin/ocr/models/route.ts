import { NextResponse } from 'next/server';
import { getAdminFromCookie } from '@/lib/auth';
import { isOcrConfigured, listOcrEngines, getOcrEngineId, OcrPermissionError } from '@/lib/ocr';

/** GET /api/admin/ocr/models — 取得可用 OCR 引擎（available=false 代表離線） */
export async function GET() {
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
    const engines = await listOcrEngines();
    return NextResponse.json({
      success: true,
      data: { defaultEngine: getOcrEngineId(), engines },
    });
  } catch (error) {
    const status = error instanceof OcrPermissionError ? 403 : 502;
    console.error('List OCR engines error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status }
    );
  }
}
