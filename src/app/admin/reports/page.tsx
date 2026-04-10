'use client';

import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExamOption {
  id: string;
  title: string;
}

interface RankingItem {
  rank: number;
  employeeName: string;
  employeeNo: string;
  department: string;
  totalScore: number;
  timeTakenSeconds: number;
  isPassed: boolean;
  submittedAt: string | null;
}

interface AbsenceItem {
  employeeName: string;
  employeeNo: string;
  department: string;
}

interface AnalyticsData {
  totalParticipants: number;
  avgScore: number;
  passRate: number;
  highestScore: number;
  lowestScore: number;
  avgTimeTaken: number;
  scoreDistribution: { range: string; count: number }[];
  difficultyAnalysis: { questionType: string; avgScoreRate: number; totalParticipants: number }[];
  rankings: RankingItem[];
  absences: AbsenceItem[];
  absentCount: number;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { toast } = useToast();

  const [exams, setExams] = useState<ExamOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [examsLoading, setExamsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Load exam list
  useEffect(() => {
    async function loadExams() {
      try {
        const res = await fetch('/api/admin/exams');
        if (!res.ok) throw new Error('加载失败');
        const json = await res.json();
        const items = json.data?.items ?? json.data ?? [];
        setExams(
          items.map((e: { id: string; title: string }) => ({
            id: e.id,
            title: e.title,
          }))
        );
      } catch {
        toast('加载考试列表失败', 'error');
      } finally {
        setExamsLoading(false);
      }
    }
    loadExams();
  }, [toast]);

  // Load analytics when exam selected
  const fetchAnalytics = useCallback(async () => {
    if (!selectedExamId) {
      setAnalytics(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/analytics?examId=${selectedExamId}`);
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json();
      setAnalytics(json.data);
    } catch {
      toast('加载分析数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedExamId, toast]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  async function handleExport() {
    if (!selectedExamId) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/reports/export?examId=${selectedExamId}`);
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `报表_${selectedExamId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('导出成功', 'success');
    } catch {
      toast('导出失败', 'error');
    } finally {
      setExporting(false);
    }
  }

  const examOptions = exams.map((e) => ({ value: e.id, label: e.title }));

  // Find the max count for chart scaling
  const maxDistCount = analytics?.scoreDistribution
    ? Math.max(...analytics.scoreDistribution.map((d) => d.count), 1)
    : 1;
  const _maxDiffCount = analytics?.difficultyAnalysis
    ? Math.max(...analytics.difficultyAnalysis.map((d) => d.avgScoreRate), 1)
    : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="数据报表"
        description="查看考试数据分析和统计报表"
        actions={
          selectedExamId ? (
            <Button variant="secondary" onClick={handleExport} loading={exporting}>
              导出报表
            </Button>
          ) : undefined
        }
      />

      {/* Exam selector */}
      <Card>
        <div className="max-w-md">
          {examsLoading ? (
            <div className="h-10 animate-pulse rounded-lg bg-gray-200" />
          ) : (
            <Select
              label="选择考试"
              options={examOptions}
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              placeholder="请选择考试"
            />
          )}
        </div>
      </Card>

      {!selectedExamId && (
        <EmptyState title="请选择考试" description="从上方下拉菜单中选择一场考试以查看报表" />
      )}

      {loading && <LoadingSpinner />}

      {analytics && !loading && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-sm font-medium text-gray-500">参考人数</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {analytics.totalParticipants}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-sm font-medium text-gray-500">平均分</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {analytics.avgScore?.toFixed(1) ?? '--'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-sm font-medium text-gray-500">通过率</p>
              <p className="mt-1 text-2xl font-bold text-green-600">
                {analytics.passRate != null
                  ? `${analytics.passRate.toFixed(1)}%`
                  : '--'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-sm font-medium text-gray-500">最高分</p>
              <p className="mt-1 text-2xl font-bold text-indigo-600">
                {analytics.highestScore ?? '--'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-sm font-medium text-gray-500">最低分</p>
              <p className="mt-1 text-2xl font-bold text-red-600">
                {analytics.lowestScore ?? '--'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-sm font-medium text-gray-500">缺考人数</p>
              <p className="mt-1 text-2xl font-bold text-orange-600">
                {analytics.absentCount ?? 0}
              </p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-6">
            {/* Score distribution */}
            <Card title="成绩分布图">
              {analytics.scoreDistribution && analytics.scoreDistribution.length > 0 ? (
                <div className="space-y-2">
                  {analytics.scoreDistribution.map((item) => (
                    <div key={item.range} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-sm text-gray-600 text-right">
                        {item.range}
                      </span>
                      <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded transition-all duration-300"
                          style={{
                            width: `${(item.count / maxDistCount) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-sm font-medium text-gray-700 text-right">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-gray-400">暂无数据</p>
              )}
            </Card>

            {/* Department pass rates */}
            <Card title="题型得分率">
              {analytics.difficultyAnalysis &&
              analytics.difficultyAnalysis.length > 0 ? (
                <div className="space-y-2">
                  {analytics.difficultyAnalysis.map((item) => {
                    const typeLabels: Record<string, string> = {
                      SINGLE_CHOICE: '单选题',
                      MULTI_CHOICE: '多选题',
                      TRUE_FALSE: '判断题',
                      SHORT_ANSWER: '简答题',
                      FILL_BLANK: '填空题',
                      CASE_ANALYSIS: '案例分析题',
                      PRACTICAL: '实操题',
                    };
                    return (
                      <div key={item.questionType} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-sm text-gray-600 text-right truncate">
                          {typeLabels[item.questionType] || item.questionType}
                        </span>
                        <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded transition-all duration-300"
                            style={{ width: `${item.avgScoreRate}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-sm font-medium text-gray-700 text-right">
                          {item.avgScoreRate.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-gray-400">暂无数据</p>
              )}
            </Card>
          </div>

          {/* Ranking table */}
          {analytics.rankings && analytics.rankings.length > 0 && (
            <Card title="成绩排名">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="pb-3 pr-4 font-medium">排名</th>
                      <th className="pb-3 pr-4 font-medium">姓名</th>
                      <th className="pb-3 pr-4 font-medium">工号</th>
                      <th className="pb-3 pr-4 font-medium">部门</th>
                      <th className="pb-3 pr-4 font-medium text-right">得分</th>
                      <th className="pb-3 pr-4 font-medium text-right">用时</th>
                      <th className="pb-3 font-medium text-center">结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.rankings.map((r) => (
                      <tr key={`${r.employeeNo}-${r.rank}`} className="border-b border-gray-100 last:border-0">
                        <td className="py-2.5 pr-4">
                          <span className={
                            r.rank <= 3
                              ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-100 text-xs font-bold text-yellow-800'
                              : 'text-gray-500'
                          }>
                            {r.rank}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-medium text-gray-900">{r.employeeName}</td>
                        <td className="py-2.5 pr-4 text-gray-500">{r.employeeNo}</td>
                        <td className="py-2.5 pr-4 text-gray-500">{r.department}</td>
                        <td className="py-2.5 pr-4 text-right font-medium text-gray-900">{r.totalScore}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-500">
                          {Math.floor(r.timeTakenSeconds / 60)}分{r.timeTakenSeconds % 60}秒
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.isPassed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {r.isPassed ? '合格' : '不合格'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Absence table */}
          {analytics.absences && analytics.absences.length > 0 && (
            <Card title={`缺考名单 (${analytics.absences.length} 人)`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="pb-3 pr-4 font-medium">序号</th>
                      <th className="pb-3 pr-4 font-medium">姓名</th>
                      <th className="pb-3 pr-4 font-medium">工号</th>
                      <th className="pb-3 font-medium">部门</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.absences.map((a, idx) => (
                      <tr key={a.employeeNo} className="border-b border-gray-100 last:border-0">
                        <td className="py-2.5 pr-4 text-gray-500">{idx + 1}</td>
                        <td className="py-2.5 pr-4 font-medium text-gray-900">{a.employeeName}</td>
                        <td className="py-2.5 pr-4 text-gray-500">{a.employeeNo}</td>
                        <td className="py-2.5 text-gray-500">{a.department}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
