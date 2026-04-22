'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { ArrowLeft } from 'lucide-react';

interface Assignment {
  id: string;
  examId: string;
  examTitle: string;
  examStatus: string;
  process: string | null;
  level: string | null;
}

interface SessionRecord {
  sessionId: string;
  examId: string;
  examTitle: string;
  process: string | null;
  level: string | null;
  attemptNumber: number;
  status: string;
  submittedAt: string | null;
  autoScore: number;
  maxPossibleScore: number;
  practicalScore: number | null;
  combinedScore: number | null;
  isPassed: boolean | null;
}

interface EmployeeDetail {
  id: string;
  employeeNo: string;
  name: string;
  department: string;
  subDepartment: string | null;
  role: string;
  photoUrl: string | null;
  hireDate: string | null;
  isActive: boolean;
  createdAt: string;
  assignments: Assignment[];
  sessions: SessionRecord[];
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ACTIVE: '进行中',
  CLOSED: '已关闭',
  ARCHIVED: '已归档',
};

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const employeeId = params.id as string;

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}`);
      const json = await res.json();
      if (json.success) {
        setEmployee(json.data);
      } else {
        toast(json.error || '加载失败', 'error');
      }
    } catch {
      toast('加载员工详情失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [employeeId, toast]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) return <LoadingSpinner />;
  if (!employee) {
    return (
      <EmptyState
        title="员工不存在"
        description="未找到该员工信息"
        action={<Button onClick={() => router.push('/admin/employees')}>返回列表</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={employee.name}
        description={`${employee.employeeNo} · ${employee.department}${employee.role ? ` · ${employee.role}` : ''}`}
        actions={
          <Button variant="outline" onClick={() => router.push('/admin/employees')}>
            <ArrowLeft className="h-4 w-4" />
            返回列表
          </Button>
        }
      />

      {/* Basic info */}
      <Card title="基本信息">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <InfoItem label="姓名" value={employee.name} />
          <InfoItem label="工号" value={employee.employeeNo} />
          <InfoItem label="部门" value={employee.department} />
          <InfoItem label="岗位" value={employee.role || '—'} />
          {employee.subDepartment && (
            <InfoItem label="子部门" value={employee.subDepartment} />
          )}
          <InfoItem
            label="状态"
            value={
              <Badge variant={employee.isActive ? 'success' : 'default'}>
                {employee.isActive ? '在职' : '离职'}
              </Badge>
            }
          />
          {employee.hireDate && (
            <InfoItem label="入职日期" value={new Date(employee.hireDate).toLocaleDateString('zh-CN')} />
          )}
          <InfoItem label="创建时间" value={new Date(employee.createdAt).toLocaleDateString('zh-CN')} />
        </div>
      </Card>

      {/* Exam assignments */}
      <Card title={`考试指派记录 (${employee.assignments.length})`}>
        {employee.assignments.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-400">暂无考试指派</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {employee.assignments.map((a) => (
                <div key={a.id} className="rounded-lg border border-stone-100 bg-stone-50/50 px-3.5 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-800">{a.examTitle}</span>
                    <Badge variant={a.examStatus === 'ACTIVE' ? 'success' : 'default'}>
                      {STATUS_LABELS[a.examStatus] ?? a.examStatus}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {a.process ?? '—'} · {a.level ?? '—'}
                  </p>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>考试名称</TableHead>
                    <TableHead>工序</TableHead>
                    <TableHead>级别</TableHead>
                    <TableHead>考试状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employee.assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.examTitle}</TableCell>
                      <TableCell>{a.process ?? '—'}</TableCell>
                      <TableCell>{a.level ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={a.examStatus === 'ACTIVE' ? 'success' : 'default'}>
                          {STATUS_LABELS[a.examStatus] ?? a.examStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {/* Historical scores */}
      <Card title={`历史成绩 (${employee.sessions.length})`}>
        {employee.sessions.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-400">暂无考试成绩</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {employee.sessions.map((s) => (
                <div key={s.sessionId} className="rounded-lg border border-stone-100 bg-stone-50/50 px-3.5 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-800">{s.examTitle}</span>
                    {s.isPassed != null && (
                      <Badge variant={s.isPassed ? 'success' : 'danger'}>
                        {s.isPassed ? '合格' : '不合格'}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {s.process ?? '—'} · {s.level ?? '—'}
                    {s.submittedAt && ` · ${new Date(s.submittedAt).toLocaleDateString('zh-CN')}`}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 rounded-md bg-white px-2 py-1.5 text-center">
                    <div>
                      <p className="text-[11px] text-stone-400">线上分</p>
                      <p className="text-sm font-semibold text-stone-800">{s.autoScore}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-stone-400">实操分</p>
                      <p className="text-sm font-semibold text-stone-800">{s.practicalScore ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-stone-400">综合分</p>
                      <p className="text-sm font-bold text-teal-700">{s.combinedScore ?? '—'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>考试名称</TableHead>
                    <TableHead>工序</TableHead>
                    <TableHead>级别</TableHead>
                    <TableHead>线上分</TableHead>
                    <TableHead>实操分</TableHead>
                    <TableHead>综合分</TableHead>
                    <TableHead>是否合格</TableHead>
                    <TableHead>交卷时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employee.sessions.map((s) => (
                    <TableRow key={s.sessionId}>
                      <TableCell className="font-medium">{s.examTitle}</TableCell>
                      <TableCell>{s.process ?? '—'}</TableCell>
                      <TableCell>{s.level ?? '—'}</TableCell>
                      <TableCell>{s.autoScore}</TableCell>
                      <TableCell>{s.practicalScore ?? '—'}</TableCell>
                      <TableCell className="font-semibold">{s.combinedScore ?? '—'}</TableCell>
                      <TableCell>
                        {s.isPassed != null ? (
                          <Badge variant={s.isPassed ? 'success' : 'danger'}>
                            {s.isPassed ? '合格' : '不合格'}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-stone-400 whitespace-nowrap">
                        {s.submittedAt ? new Date(s.submittedAt).toLocaleString('zh-CN') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-stone-400">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-stone-800">{value}</div>
    </div>
  );
}
