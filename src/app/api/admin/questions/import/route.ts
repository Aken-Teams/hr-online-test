import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { parseQuestionExcel } from '@/lib/excel';
import { MAX_UPLOAD_SIZE } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '请上传文件' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { success: false, error: '文件大小不能超过10MB' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ];
    const validExtensions = ['.xls', '.xlsx'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
      return NextResponse.json(
        { success: false, error: '仅支持 .xls 和 .xlsx 格式' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = parseQuestionExcel(buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '未解析到有效题目数据' },
        { status: 400 }
      );
    }

    // Bulk create questions
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          await tx.question.create({
            data: {
              type: row.type,
              content: row.content,
              level: row.level,
              department: row.department,
              role: row.role,
              correctAnswer: row.correctAnswer ?? null,
              isMultiSelect: row.isMultiSelect ?? false,
              referenceAnswer: row.referenceAnswer ?? null,
              sourceFile: file.name,
              options: row.options
                ? {
                    create: row.options.map((opt, idx) => ({
                      label: opt.label,
                      content: opt.content,
                      sortOrder: idx,
                    })),
                  }
                : undefined,
            },
          });
          created++;
        } catch (err) {
          skipped++;
          const message = err instanceof Error ? err.message : '未知错误';
          errors.push(`第 ${i + 1} 行: ${message}`);
        }
      }

      await tx.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'QUESTION_IMPORTED',
          details: {
            fileName: file.name,
            totalRows: rows.length,
            created,
            skipped,
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        totalRows: rows.length,
        created,
        skipped,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      },
    });
  } catch (error) {
    console.error('Import questions error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
