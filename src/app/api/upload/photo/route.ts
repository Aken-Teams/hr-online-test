import { NextResponse } from 'next/server';
import { getAdminFromCookie } from '@/lib/auth';
import { MAX_UPLOAD_SIZE } from '@/lib/constants';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

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
    const file = formData.get('photo') as File | null;
    const employeeId = formData.get('employeeId') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '请上传照片文件' },
        { status: 400 }
      );
    }

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: '请提供员工ID' },
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
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: '仅支持 JPG、PNG、WebP 格式的图片' },
        { status: 400 }
      );
    }

    // Determine file extension
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    const ext = extMap[file.type] || '.jpg';

    // Generate a unique filename
    const filename = `${employeeId}-${Date.now()}${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'photos');

    // Ensure directory exists
    await mkdir(uploadDir, { recursive: true });

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(uploadDir, filename);
    await writeFile(filePath, buffer);

    // Construct the URL path
    const photoUrl = `/uploads/photos/${filename}`;

    // Update user record with photo URL
    const { prisma } = await import('@/lib/prisma');

    await prisma.user.update({
      where: { id: employeeId },
      data: { photoUrl },
    });

    return NextResponse.json({
      success: true,
      data: {
        photoUrl,
        filename,
      },
    });
  } catch (error) {
    console.error('Upload photo error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
