'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { useFaceAuth } from '@/hooks/useFaceAuth';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERIFY_TABS = [
  { key: 'password', label: '密码验证' },
  { key: 'face', label: '人脸识别' },
] as const;

// ---------------------------------------------------------------------------
// Password verification tab
// ---------------------------------------------------------------------------

function PasswordTab() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (!name.trim()) {
        setError('请输入姓名');
        return;
      }
      if (!password.trim()) {
        setError('请输入密码');
        return;
      }

      setLoading(true);
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), password: password.trim() }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error || '验证失败，请检查姓名和密码');
          return;
        }

        // Store employee info and token for subsequent requests
        if (data.data?.token) {
          localStorage.setItem('exam-token', data.data.token);
        }
        if (data.data?.employee) {
          localStorage.setItem('exam-employee', JSON.stringify(data.data.employee));
        }

        toast('身份验证成功', 'success');
        router.push('/instructions');
      } catch {
        setError('网络错误，请稍后重试');
      } finally {
        setLoading(false);
      }
    },
    [name, password, router, toast],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="姓名"
        placeholder="请输入您的姓名"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
      />
      <Input
        label="密码"
        type="password"
        placeholder="身份证后6位"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="off"
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <Button type="submit" loading={loading} className="w-full">
        验证身份
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Face verification tab
// ---------------------------------------------------------------------------

function FaceTab() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const {
    modelsLoaded,
    modelsLoading,
    modelError,
    loadModels,
    computeDescriptor,
    isSamePerson,
  } = useFaceAuth();

  // Load face-api models on mount
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCapturing(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!name.trim()) {
      setError('请先输入姓名');
      return;
    }
    if (!modelsLoaded) {
      setError('人脸识别模型尚未加载完成，请稍候');
      return;
    }
    setError('');
    setCapturing(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setError('无法访问摄像头，请检查权限设置');
      setCapturing(false);
    }
  }, [name, modelsLoaded]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current) return;
    setError('');
    setVerifying(true);
    setStatusMsg('正在检测人脸...');

    try {
      // Step 1: Compute face descriptor from video frame
      const liveDescriptor = await computeDescriptor(videoRef.current);

      if (!liveDescriptor) {
        setError('未检测到人脸，请确保面部正对摄像头并在光线充足的环境中');
        setVerifying(false);
        return;
      }

      setStatusMsg('正在验证身份...');

      // Step 2: Fetch stored face descriptor from server
      const res = await fetch('/api/auth/face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '人脸验证失败');
        setVerifying(false);
        return;
      }

      const storedDescriptor = data.data?.faceDescriptor;
      if (!storedDescriptor || !Array.isArray(storedDescriptor)) {
        setError('该员工未录入人脸信息，请联系HR或使用密码验证');
        setVerifying(false);
        return;
      }

      // Step 3: Compare descriptors
      const storedArray = new Float32Array(storedDescriptor);
      const match = isSamePerson(liveDescriptor, storedArray);

      if (!match) {
        setError('人脸比对失败，与系统录入照片不匹配');
        setVerifying(false);
        return;
      }

      // Step 4: Matched! Get auth token via face-verify endpoint
      const faceVerifyRes = await fetch('/api/auth/face-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), faceVerified: true }),
      });

      const faceVerifyData = await faceVerifyRes.json();
      if (!faceVerifyRes.ok || !faceVerifyData.success) {
        setError(faceVerifyData.error || '身份验证失败');
        setVerifying(false);
        return;
      }

      if (faceVerifyData.data?.token) {
        localStorage.setItem('exam-token', faceVerifyData.data.token);
      }
      if (faceVerifyData.data?.employee) {
        localStorage.setItem('exam-employee', JSON.stringify(faceVerifyData.data.employee));
      }

      stopCamera();
      toast('人脸验证成功', 'success');
      router.push('/instructions');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setVerifying(false);
      setStatusMsg('');
    }
  }, [name, computeDescriptor, isSamePerson, stopCamera, router, toast]);

  return (
    <div className="space-y-4">
      <Input
        label="姓名"
        placeholder="请输入您的姓名"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
      />

      {/* Model loading indicator */}
      {modelsLoading && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-700">正在加载人脸识别模型...</p>
        </div>
      )}
      {modelError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{modelError}</p>
        </div>
      )}

      {/* Webcam area */}
      <div className="relative mx-auto aspect-[4/3] w-full max-w-xs overflow-hidden rounded-lg border-2 border-dashed border-stone-300 bg-stone-50">
        {capturing ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            {/* Face detection overlay guide */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-40 w-32 rounded-full border-2 border-white/60" />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <svg
              className="mb-2 h-10 w-10 text-stone-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
              />
            </svg>
            <p className="text-sm text-stone-500">点击下方按钮开启摄像头</p>
          </div>
        )}
      </div>

      {/* Status message */}
      {statusMsg && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-700">{statusMsg}</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!capturing ? (
        <Button
          onClick={startCamera}
          className="w-full"
          disabled={modelsLoading || !modelsLoaded}
        >
          {modelsLoading ? '模型加载中...' : '开启摄像头'}
        </Button>
      ) : (
        <div className="flex gap-3">
          <Button variant="secondary" onClick={stopCamera} className="flex-1">
            取消
          </Button>
          <Button onClick={handleCapture} loading={verifying} className="flex-1">
            拍照验证
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main verify page
// ---------------------------------------------------------------------------

export default function VerifyPage() {
  const [activeTab, setActiveTab] = useState<string>('password');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Logo size="sm" className="mb-8" />

      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white shadow-sm">
        {/* Header */}
        <div className="border-b border-stone-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-stone-800">身份验证</h2>
          <p className="mt-1 text-sm text-stone-500">
            请先验证您的身份以进入考试
          </p>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4">
          <Tabs
            tabs={VERIFY_TABS as unknown as { key: string; label: string }[]}
            activeKey={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {/* Tab content */}
        <div className="px-6 py-6">
          {activeTab === 'password' ? <PasswordTab /> : <FaceTab />}
        </div>
      </div>

      <button
        onClick={() => window.history.back()}
        className="mt-6 text-sm text-stone-500 transition-colors hover:text-stone-700"
      >
        返回首页
      </button>
    </div>
  );
}
