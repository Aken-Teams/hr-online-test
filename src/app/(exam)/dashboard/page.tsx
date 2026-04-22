'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ClipboardList, BarChart3 } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('exam-token');
    if (!token) {
      router.replace('/');
      return;
    }
    try {
      const emp = JSON.parse(localStorage.getItem('exam-employee') || '{}');
      setEmployeeName(emp.name || '考生');
    } catch {
      setEmployeeName('考生');
    }
  }, [router]);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="rounded-xl border border-teal-100 bg-gradient-to-r from-teal-50 to-white px-6 py-5">
        <h1 className="text-lg font-bold text-stone-800">
          你好，{employeeName}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          欢迎使用员工在线技能考核系统，请查看您的考试安排。
        </p>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col items-center rounded-2xl border border-stone-200 bg-white px-4 py-6 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-100 text-teal-600">
            <ClipboardList className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-stone-800">我的考试</h3>
          <p className="mt-1 text-xs text-stone-500">查看已安排的考试并开始作答</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => router.push('/my-exams')}>
            前往考试
          </Button>
        </div>

        <div className="flex flex-col items-center rounded-2xl border border-stone-200 bg-white px-4 py-6 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <BarChart3 className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-stone-800">成绩查询</h3>
          <p className="mt-1 text-xs text-stone-500">查看您的考试成绩和综合得分</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => router.push('/scores')}>
            查看成绩
          </Button>
        </div>
      </div>

      {/* System info */}
      <Card title="系统说明">
        <div className="space-y-3 text-sm text-stone-600">
          <p>本系统用于公司内部员工技能考核，请在考试开放时间内完成作答。</p>
          <ul className="list-disc pl-5 space-y-1 text-xs text-stone-500">
            <li>每场考试根据您报考的工序和等级随机出题</li>
            <li>题目包含基本题和专业题两个类别</li>
            <li>综合成绩 = 线上理论分 × 理论权重 + 实操分 × 实操权重</li>
            <li>成绩在管理员设定的查询时间开放后可查看</li>
          </ul>
        </div>
      </Card>

      {/* Privacy */}
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
        <p className="text-xs text-stone-400">
          隐私声明：本系统仅用于公司内部技能考核，所有数据严格保密，不会用于其他用途。
        </p>
      </div>
    </div>
  );
}
