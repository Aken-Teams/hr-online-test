import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret');

export interface EmployeeTokenPayload extends JWTPayload {
  type: 'employee';
  userId: string;
  name: string;
  department: string;
  examId?: string;
  sessionId?: string;
}

export interface AdminTokenPayload extends JWTPayload {
  type: 'admin';
  adminId: string;
  username: string;
  role: string;
}

export async function createEmployeeToken(payload: Omit<EmployeeTokenPayload, 'type'>): Promise<string> {
  return new SignJWT({ ...payload, type: 'employee' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('3h')
    .sign(secret);
}

export async function createAdminToken(payload: Omit<AdminTokenPayload, 'type'>): Promise<string> {
  return new SignJWT({ ...payload, type: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret);
}

export async function verifyToken<T extends JWTPayload>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as T;
  } catch {
    return null;
  }
}

export async function getAdminFromCookie(): Promise<AdminTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) return null;
  return verifyToken<AdminTokenPayload>(token);
}

export async function getEmployeeFromCookie(): Promise<EmployeeTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('exam_token')?.value;
  if (!token) return null;
  return verifyToken<EmployeeTokenPayload>(token);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
