'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { useFaceAuth } from '@/hooks/useFaceAuth';

// ---------------------------------------------------------------------------
// Feature list items
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    title: '综合题型',
    desc: '单选 + 多选 + 判断，全面考核专业技能',
    icon: (
      <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  },
  {
    title: '限时作答',
    desc: '考试全程计时，到时自动交卷',
    icon: (
      <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: '即时出分',
    desc: '客观题自动判分，交卷即时出分',
    icon: (
      <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
];

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
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
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
      const liveDescriptor = await computeDescriptor(videoRef.current);

      if (!liveDescriptor) {
        setError('未检测到人脸，请确保面部正对摄像头并在光线充足的环境中');
        setVerifying(false);
        return;
      }

      setStatusMsg('正在验证身份...');

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

      const storedArray = new Float32Array(storedDescriptor);
      const match = isSamePerson(liveDescriptor, storedArray);

      if (!match) {
        setError('人脸比对失败，与系统录入照片不匹配');
        setVerifying(false);
        return;
      }

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

      {modelsLoading && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
          <p className="text-sm text-teal-700">正在加载人脸识别模型...</p>
        </div>
      )}
      {modelError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{modelError}</p>
        </div>
      )}

      <div className="relative mx-auto aspect-[4/3] w-full max-w-xs overflow-hidden rounded-xl border-2 border-dashed border-stone-300 bg-stone-50">
        {capturing ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
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

      {statusMsg && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
          <p className="text-sm text-teal-700">{statusMsg}</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
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
// Homepage — left/right split layout
// ---------------------------------------------------------------------------

export default function WelcomePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>('password');

  // If user already has a token and an active exam session, redirect to test page
  useEffect(() => {
    const token = localStorage.getItem('exam-token');
    if (!token) return;

    fetch('/api/exam/available')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.existingSession) {
          // Active session exists — send them to instructions which will auto-resume
          router.replace('/instructions');
        }
      })
      .catch(() => {});
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* ===== Left: Introduction (hidden on mobile) ===== */}
      <div className="relative hidden flex-col justify-center overflow-hidden bg-gradient-to-br from-teal-600 via-teal-700 to-teal-800 px-6 py-12 md:flex md:w-[55%] md:px-12 lg:px-20">
        {/* Decorative shapes */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute bottom-1/3 right-10 h-24 w-24 rounded-full bg-white/5" />

        <div className="relative mx-auto w-full max-w-lg">
          {/* Logo — white version */}
          <div className="mb-8 flex items-center gap-2.5">
            <Image src="/logo.png" alt="智考云" width={48} height={48} className="h-12 w-12 shrink-0" />
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-white leading-tight">
                智考云
              </span>
              <span className="text-xs leading-tight text-white/60">
                企业考核平台
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            员工在线技能考核
          </h1>
          <p className="mt-2 text-sm text-amber-50/70 sm:text-base">
            企业员工入职及技能在线测试平台
          </p>

          {/* Divider */}
          <div className="mt-8 h-px w-12 bg-amber-100/40" />

          {/* Feature list */}
          <div className="mt-6 space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50/20">
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-amber-50">{f.title}</h3>
                  <p className="text-xs text-white/60 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ===== Right: Login ===== */}
      <div className="flex min-h-screen flex-col items-center justify-start px-5 pt-10 pb-6 md:min-h-0 md:justify-center md:px-10 md:py-10 md:w-[45%] lg:px-16">
        <div className="w-full max-w-sm">
          {/* Mobile-only compact header */}
          <div className="mb-5 flex flex-col items-center md:hidden">
            <Logo size="sm" />
            <h1 className="mt-2 text-base font-bold text-stone-800">身份验证</h1>
            <p className="mt-0.5 text-xs text-stone-400">请先验证您的身份以进入考试</p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
            {/* Card header (desktop only) */}
            <div className="hidden border-b border-stone-100 px-6 py-5 md:block">
              <h2 className="text-lg font-semibold text-stone-800">身份验证</h2>
              <p className="mt-1 text-xs text-stone-400">
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

          {/* Footer */}
          <a href="https://www.zh-aoi.com/" target="_blank" rel="noopener noreferrer" className="mt-6 block text-center text-xs text-stone-400 hover:text-teal-600 transition-colors">
            Powered by 智合科技 © 2026
          </a>
        </div>
      </div>
    </div>
  );
}
