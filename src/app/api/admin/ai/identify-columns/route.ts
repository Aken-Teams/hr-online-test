import { NextResponse } from 'next/server';
import { getAdminFromCookie } from '@/lib/auth';
import { identifyColumnsWithAI } from '@/lib/deepseek';

/**
 * POST /api/admin/ai/identify-columns
 * Uses DeepSeek AI to identify column mappings from Excel headers + sample data.
 */
export async function POST(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { headers, sampleRows } = body as {
      headers?: string[];
      sampleRows?: Record<string, string>[];
    };

    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return NextResponse.json(
        { success: false, error: '缺少 headers 参数' },
        { status: 400 }
      );
    }

    const mapping = await identifyColumnsWithAI(
      headers,
      sampleRows ?? []
    );

    if (!mapping) {
      return NextResponse.json(
        { success: false, error: 'AI 识别失败或 API 不可用' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: { mapping } });
  } catch (error) {
    console.error('AI identify-columns error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
