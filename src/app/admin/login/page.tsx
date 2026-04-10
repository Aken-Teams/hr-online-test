'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role: 'admin' }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '登录失败，请检查用户名和密码');
        return;
      }

      // Cookie is set by the API response; redirect to dashboard
      router.replace('/admin');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Logo size="lg" />
          <h1 className="mt-6 text-xl font-bold text-gray-900">HR 管理后台登录</h1>
          <p className="mt-1.5 text-sm text-gray-500">请使用管理员账号登录</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="用户名"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              disabled={loading}
            />

            <Input
              label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              disabled={loading}
            />

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              loading={loading}
            >
              登录
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
