import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import bcrypt from 'bcryptjs';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
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

// ============================================================
// AES-256 reversible encryption for idCardLast6
// ============================================================

const ENC_KEY_HEX = process.env.ENCRYPTION_KEY || '';

function getEncryptionKey(): Buffer {
  if (ENC_KEY_HEX && ENC_KEY_HEX.length === 64) {
    return Buffer.from(ENC_KEY_HEX, 'hex');
  }
  // Derive a 32-byte key from JWT_SECRET as fallback
  const base = process.env.JWT_SECRET || 'fallback-secret';
  const hash = require('crypto').createHash('sha256').update(base).digest();
  return hash;
}

/** Encrypt a plain text string. Returns "iv:encrypted" hex string. */
export function encryptValue(plainText: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/** Decrypt an AES-encrypted value. Returns plain text. */
export function decryptValue(encryptedText: string): string {
  const key = getEncryptionKey();
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** Check if a stored value is bcrypt (legacy) or AES encrypted. */
export function isBcryptHash(value: string): boolean {
  return value.startsWith('$2a$') || value.startsWith('$2b$');
}

/** Verify a password against either bcrypt hash or AES-encrypted value. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (isBcryptHash(stored)) {
    return bcrypt.compare(password, stored);
  }
  // AES encrypted — decrypt and compare
  try {
    return decryptValue(stored) === password;
  } catch {
    return false;
  }
}
