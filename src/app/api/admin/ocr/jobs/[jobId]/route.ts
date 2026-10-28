import { NextResponse } from 'next/server';
import { getAdminFromCookie } from '@/lib/auth';
import { isOcrConfigured, getOcrJob, OcrPermissionError } from '@/lib/ocr';

/**
 * GET /api/admin/ocr/jobs/[jobId] — 輪詢 OCR 工作狀態
 * 前端應以 2 秒起、逐步拉長的間隔輪詢，直到 status 為 done 或 error。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
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
    const { jobId } = await params;
    const job = await getOcrJob(jobId);
    return NextResponse.json({
      success: true,
      data: {
        jobId: job.jobId,
        status: job.status,
        progress: job.progress ?? null,
        text: job.text ?? null,
        pages: job.pages ?? null,
        error: job.error ?? null,
      },
    });
  } catch (error) {
    const status = error instanceof OcrPermissionError ? 403 : 502;
    console.error('Get OCR job error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}
