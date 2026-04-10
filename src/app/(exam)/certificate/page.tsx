'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { formatDate } from '@/lib/utils';
import type { ApiResponse, ExamResultData, EmployeeData } from '@/types/exam';

// ---------------------------------------------------------------------------
// Grade determination
// ---------------------------------------------------------------------------

function getGrade(percentage: number): { label: string; color: string } {
  if (percentage >= 90) return { label: 'A', color: 'text-green-600' };
  if (percentage >= 80) return { label: 'B', color: 'text-blue-600' };
  if (percentage >= 70) return { label: 'C', color: 'text-yellow-600' };
  if (percentage >= 60) return { label: 'D', color: 'text-orange-600' };
  return { label: 'F', color: 'text-red-600' };
}

// ---------------------------------------------------------------------------
// Certificate page
// ---------------------------------------------------------------------------

export default function CertificatePage() {
  const router = useRouter();

  const [result, setResult] = useState<ExamResultData | null>(null);
  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ---- Load data -----------------------------------------------------------

  useEffect(() => {
    const sessionId = localStorage.getItem('exam-result-session');
    const token = localStorage.getItem('exam-token');

    // Load employee data from localStorage
    try {
      const empStr = localStorage.getItem('exam-employee');
      if (empStr) {
        setEmployee(JSON.parse(empStr));
      }
    } catch {
      // ignore
    }

    if (!sessionId) {
      setError('未找到考试记录');
      setLoading(false);
      return;
    }

    async function fetchResult() {
      try {
        const res = await fetch(`/api/exam/${sessionId}/result`);
        const data: ApiResponse<{ result: ExamResultData }> = await res.json();

        if (!res.ok || !data.success || !data.data) {
          setError(data.error || '获取成绩失败');
          return;
        }

        setResult(data.data.result);
      } catch {
        setError('网络错误，请稍后重试');
      } finally {
        setLoading(false);
      }
    }

    fetchResult();
  }, []);

  // ---- Derived data --------------------------------------------------------

  const displayScore = useMemo(
    () => (result ? (result.totalScore ?? result.autoScore) : 0),
    [result],
  );

  const percentage = useMemo(
    () => (result && result.maxPossibleScore > 0
      ? Math.round((displayScore / result.maxPossibleScore) * 100)
      : 0),
    [result, displayScore],
  );

  const grade = useMemo(() => getGrade(percentage), [percentage]);
  const today = formatDate(new Date());

  // ---- Download as PDF (browser print) -------------------------------------

  const handleDownload = useCallback(() => {
    window.print();
  }, []);

  // ---- Render --------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <Logo size="sm" className="mb-8" />
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            {error || '暂无证书'}
          </h2>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => router.push('/')}
          >
            返回首页
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        {/* Print-hidden controls */}
        <div className="mb-6 text-center print:hidden">
          <Logo size="sm" className="mx-auto mb-4 justify-center" />
          <h1 className="text-xl font-bold text-gray-900">考核证书</h1>
        </div>

        {/* ================================================================ */}
        {/* Certificate card */}
        {/* ================================================================ */}
        <div
          className="relative overflow-hidden rounded-xl border-2 border-indigo-200 bg-white shadow-lg print:border print:shadow-none"
          id="certificate"
        >
          {/* Decorative top border */}
          <div className="h-2 bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-500" />

          {/* Inner border frame */}
          <div className="m-4 border border-indigo-100 p-6 sm:m-6 sm:p-8">
            {/* Company name */}
            <div className="mb-6 text-center">
              <p className="text-lg font-bold tracking-widest text-indigo-900 sm:text-xl">
                强茂科技有限公司
              </p>
              <p className="mt-1 text-xs tracking-wider text-gray-500 sm:text-sm">
                PANJIT INTERNATIONAL INC.
              </p>
            </div>

            {/* Divider */}
            <div className="mx-auto mb-6 h-px w-32 bg-indigo-200" />

            {/* Certificate title */}
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                技能考核证书
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Certificate of Completion
              </p>
            </div>

            {/* Certificate body */}
            <div className="mb-8 space-y-4 text-center">
              <p className="text-sm text-gray-600">兹证明</p>
              <p className="text-2xl font-bold text-gray-900">
                {employee?.name || '---'}
              </p>
              <p className="text-sm text-gray-600">
                {employee?.department || '---'}
                {employee?.role ? ` / ${employee.role}` : ''}
              </p>
              <p className="text-sm text-gray-600">
                已完成 2026 年度技能考核，成绩如下：
              </p>
            </div>

            {/* Score stats */}
            <div className="mx-auto mb-8 grid max-w-sm grid-cols-3 gap-4 text-center">
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-4">
                <p className="text-2xl font-bold text-gray-900">
                  {displayScore}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  总分 / {result.maxPossibleScore}
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-4">
                <p className="text-2xl font-bold text-gray-900">
                  {result.correctCount}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  答对 / {result.totalQuestions}
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-4">
                <p className={`text-2xl font-bold ${grade.color}`}>
                  {result.gradeLabel || grade.label}
                </p>
                <p className="mt-1 text-xs text-gray-500">等级</p>
              </div>
            </div>

            {/* Divider */}
            <div className="mx-auto mb-6 h-px w-32 bg-indigo-200" />

            {/* Issue date */}
            <div className="text-center">
              <p className="text-sm text-gray-500">
                颁发日期：{today}
              </p>
            </div>
          </div>

          {/* Decorative bottom border */}
          <div className="h-2 bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-500" />
        </div>

        {/* ================================================================ */}
        {/* Action buttons */}
        {/* ================================================================ */}
        <div className="mt-6 flex flex-col gap-3 print:hidden sm:flex-row sm:justify-center">
          <Button onClick={handleDownload}>
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            下载PDF
          </Button>
          <Button variant="secondary" onClick={() => router.push('/')}>
            返回首页
          </Button>
        </div>
      </div>
    </div>
  );
}
