'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { CustomSelect } from '@/components/ui/CustomSelect';
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
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog } from '@/components/ui/Dialog';
import { ArrowLeft, Pencil } from 'lucide-react';

interface Assignment {
  id: string;
  examId: string;
  examTitle: string;
  examStatus: string;
  process: string | null;
  level: string | null;
  examCreatedAt: string;
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
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', employeeNo: '', department: '', role: '' });
  const [saving, setSaving] = useState(false);
  const [assignEditOpen, setAssignEditOpen] = useState(false);
  const [assignEditTarget, setAssignEditTarget] = useState<Assignment | null>(null);
  const [assignForm, setAssignForm] = useState({ process: '', level: '' });
  const [assignOptions, setAssignOptions] = useState<{ processes: string[]; levels: string[] }>({ processes: [], levels: [] });
  const [assignSaving, setAssignSaving] = useState(false);

  // 考试记录：查询 / 筛选 / 分页
  const [recQuery, setRecQuery] = useState('');
  const [recResult, setRecResult] = useState('');
  const [recPage, setRecPage] = useState(1);
  const REC_PAGE_SIZE = 10;

  const allRecords = useMemo(() => {
    if (!employee) return [];
    const records = employee.assignments.map((a) => ({
      key: a.id,
      examTitle: a.examTitle,
      process: a.process,
      level: a.level,
      examStatus: a.examStatus,
      assignment: a as Assignment | null,
      session: employee.sessions.find((x) => x.examId === a.examId) ?? null,
    }));
    const orphans = employee.sessions
      .filter((x) => !employee.assignments.some((a) => a.examId === x.examId))
      .map((x) => ({
        key: x.sessionId,
        examTitle: x.examTitle,
        process: x.process,
        level: x.level,
        examStatus: x.status,
        assignment: null as Assignment | null,
        session: x,
      }));
    return [...records, ...orphans];
  }, [employee]);

  const filteredRecords = useMemo(() => {
    const q = recQuery.trim().toLowerCase();
    return allRecords.filter((r) => {
      if (recResult === 'passed' && r.session?.isPassed !== true) return false;
      if (recResult === 'failed' && r.session?.isPassed !== false) return false;
      if (recResult === 'untaken' && r.session) return false;
      if (q) {
        const hay = [r.examTitle, r.process ?? '', r.level ?? ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRecords, recQuery, recResult]);

  const recTotalPages = Math.max(1, Math.ceil(filteredRecords.length / REC_PAGE_SIZE));
  const recPageSafe = Math.min(recPage, recTotalPages);
  const pagedRecords = filteredRecords.slice(
    (recPageSafe - 1) * REC_PAGE_SIZE,
    recPageSafe * REC_PAGE_SIZE
  );

  useEffect(() => {
    setRecPage(1);
  }, [recQuery, recResult]);

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

  function openEdit() {
    if (!employee) return;
    setEditForm({
      name: employee.name,
      employeeNo: employee.employeeNo?.startsWith('AUTO_') ? '' : employee.employeeNo,
      department: employee.department,
      role: employee.role === '未分配' ? '' : employee.role,
    });
    setEditOpen(true);
  }

  async function handleEditSave() {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (editForm.name.trim()) payload.name = editForm.name.trim();
      if (editForm.employeeNo.trim()) payload.employeeNo = editForm.employeeNo.trim();
      if (editForm.department.trim()) payload.department = editForm.department.trim();
      payload.role = editForm.role.trim() || '未分配';

      const res = await fetch(`/api/admin/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '保存失败');
      toast('员工信息已更新', 'success');
      setEditOpen(false);
      fetchDetail();
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function openAssignEdit(a: Assignment) {
    setAssignEditTarget(a);
    setAssignForm({ process: a.process || '', level: a.level || '' });
    setAssignEditOpen(true);
    try {
      const res = await fetch(`/api/admin/exams/${a.examId}/assignment-options`);
      const json = await res.json();
      if (json.success) {
        setAssignOptions(json.data);
      }
    } catch {
      // keep empty options – user can still type via fallback
    }
  }

  async function handleAssignSave() {
    if (!assignEditTarget) return;
    setAssignSaving(true);
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}/assignments/${assignEditTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '保存失败');
      toast('指派信息已更新', 'success');
      setAssignEditOpen(false);
      fetchDetail();
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setAssignSaving(false);
    }
  }

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
        backHref="/admin/employees"
        description={`${employee.employeeNo?.startsWith('AUTO_') ? '待分配工号' : employee.employeeNo} · ${employee.department}${employee.role && employee.role !== '未分配' ? ` · ${employee.role}` : ''}`}
      />

      {/* Basic info */}
      <Card
        title="基本信息"
        actions={
          <button
            onClick={openEdit}
            className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
          >
            <Pencil className="h-3 w-3" />
            编辑
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <InfoItem label="姓名" value={employee.name} />
          <InfoItem label="工号" value={employee.employeeNo?.startsWith('AUTO_') ? <span className="text-stone-400 italic">待分配</span> : employee.employeeNo} />
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

      {/* 考试记录（指派 + 成绩合并） */}
      <Card title={`考试记录 (${filteredRecords.length})`}>
        {/* 查询 / 筛选 */}
        {allRecords.length > 0 && (
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={recQuery}
              onChange={(e) => setRecQuery(e.target.value)}
              placeholder="搜寻考试名称或工序"
              className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 sm:max-w-xs"
            />
            <div className="w-full sm:w-36">
              <CustomSelect
                options={[
                  { value: '', label: '全部结果' },
                  { value: 'passed', label: '合格' },
                  { value: 'failed', label: '不合格' },
                  { value: 'untaken', label: '未考' },
                ]}
                value={recResult}
                onChange={setRecResult}
              />
            </div>
          </div>
        )}

        {allRecords.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-400">暂无考试记录</p>
        ) : filteredRecords.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-400">没有符合条件的记录</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {pagedRecords.map((r) => (
                <div key={r.key} className="rounded-lg border border-stone-100 bg-stone-50/50 px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-stone-800">{r.examTitle}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={r.examStatus === 'ACTIVE' ? 'success' : 'default'}>
                        {STATUS_LABELS[r.examStatus] ?? r.examStatus}
                      </Badge>
                      {r.session?.isPassed != null && (
                        <Badge variant={r.session.isPassed ? 'success' : 'danger'}>
                          {r.session.isPassed ? '合格' : '不合格'}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {r.process ?? '—'} · {r.level ?? '—'}
                    {r.session?.submittedAt && ` · 交卷 ${new Date(r.session.submittedAt).toLocaleDateString('zh-CN')}`}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 rounded-md bg-white px-2 py-1.5 text-center">
                    <div>
                      <p className="text-[11px] text-stone-400">线上分</p>
                      <p className="text-sm font-semibold text-stone-800">{r.session ? r.session.autoScore : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-stone-400">实操分</p>
                      <p className="text-sm font-semibold text-stone-800">{r.session?.practicalScore ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-stone-400">综合分</p>
                      <p className="text-sm font-bold text-teal-700">{r.session?.combinedScore ?? '—'}</p>
                    </div>
                  </div>
                  {r.assignment && ['DRAFT', 'PUBLISHED'].includes(r.examStatus) && (
                    <button onClick={() => openAssignEdit(r.assignment!)} className="mt-1.5 text-xs text-teal-600 hover:text-teal-700">编辑指派</button>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>考试名称</TableHead>
                    <TableHead>工序</TableHead>
                    <TableHead>级别</TableHead>
                    <TableHead>考试状态</TableHead>
                    <TableHead className="text-right">线上分</TableHead>
                    <TableHead className="text-right">实操分</TableHead>
                    <TableHead className="text-right">综合分</TableHead>
                    <TableHead>结果</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRecords.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.examTitle}</TableCell>
                      <TableCell>{r.process ?? '—'}</TableCell>
                      <TableCell>{r.level ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={r.examStatus === 'ACTIVE' ? 'success' : 'default'}>
                          {STATUS_LABELS[r.examStatus] ?? r.examStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{r.session ? r.session.autoScore : <span className="text-stone-300">—</span>}</TableCell>
                      <TableCell className="text-right">{r.session?.practicalScore ?? <span className="text-stone-300">—</span>}</TableCell>
                      <TableCell className="text-right font-semibold text-teal-700">{r.session?.combinedScore ?? <span className="font-normal text-stone-300">—</span>}</TableCell>
                      <TableCell>
                        {r.session?.isPassed != null ? (
                          <Badge variant={r.session.isPassed ? 'success' : 'danger'}>
                            {r.session.isPassed ? '合格' : '不合格'}
                          </Badge>
                        ) : (
                          <span className="text-xs text-stone-400">{r.session ? '待定' : '未考'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.assignment && ['DRAFT', 'PUBLISHED'].includes(r.examStatus) ? (
                          <button
                            onClick={() => openAssignEdit(r.assignment!)}
                            className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                          >
                            <Pencil className="h-3 w-3" />
                            编辑指派
                          </button>
                        ) : (
                          <span className="text-xs text-stone-300">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {recTotalPages > 1 && (
              <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3 text-sm">
                <span className="text-stone-500">第 {recPageSafe} / {recTotalPages} 页，共 {filteredRecords.length} 条</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={recPageSafe <= 1} onClick={() => setRecPage((x) => Math.max(1, x - 1))}>上一页</Button>
                  <Button size="sm" variant="outline" disabled={recPageSafe >= recTotalPages} onClick={() => setRecPage((x) => Math.min(recTotalPages, x + 1))}>下一页</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Assignment edit dialog */}
      <Dialog
        open={assignEditOpen}
        onClose={() => setAssignEditOpen(false)}
        title={`编辑指派 — ${assignEditTarget?.examTitle ?? ''}`}
        contentClassName="overflow-visible"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignEditOpen(false)} disabled={assignSaving}>取消</Button>
            <Button variant="primary" onClick={handleAssignSave} loading={assignSaving}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="工序"
            value={assignForm.process}
            onChange={(e) => setAssignForm((f) => ({ ...f, process: e.target.value }))}
            options={assignOptions.processes.map((p) => ({ value: p, label: p }))}
            placeholder="请选择工序"
          />
          <Select
            label="级别"
            value={assignForm.level}
            onChange={(e) => setAssignForm((f) => ({ ...f, level: e.target.value }))}
            options={assignOptions.levels.map((l) => ({ value: l, label: l }))}
            placeholder="请选择级别"
          />
        </div>
      </Dialog>

      {/* Employee edit dialog */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="编辑员工信息"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>取消</Button>
            <Button variant="primary" onClick={handleEditSave} loading={saving}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="姓名"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="工号"
            value={editForm.employeeNo}
            onChange={(e) => setEditForm((f) => ({ ...f, employeeNo: e.target.value }))}
            placeholder="留空保持自动生成"
          />
          <Input
            label="部门"
            value={editForm.department}
            onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
          />
          <Input
            label="岗位"
            value={editForm.role}
            onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
            placeholder="如 SAW&DB&WB&QCgate"
          />
        </div>
      </Dialog>
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
