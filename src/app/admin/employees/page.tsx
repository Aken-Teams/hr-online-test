'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Dialog } from '@/components/ui/Dialog';
import { CustomSelect } from '@/components/ui/CustomSelect';
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
import { DEPARTMENTS } from '@/lib/constants';
import type { EmployeeData } from '@/types/exam';

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const DEPARTMENT_OPTIONS = [
  { value: '', label: '全部部门' },
  ...DEPARTMENTS.map((d) => ({ value: d, label: d })),
];

export default function EmployeeListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [examOptions, setExamOptions] = useState<{ value: string; label: string }[]>([{ value: '', label: '全部考试' }]);

  // Add employee dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    employeeNo: '',
    department: DEPARTMENTS[0] as string,
    role: '',
    idCardLast6: '',
  });

  // Load exam list for filter
  useEffect(() => {
    async function loadExams() {
      try {
        const res = await fetch('/api/admin/exams?pageSize=100');
        const json = await res.json();
        if (json.success && json.data?.items) {
          const opts = json.data.items.map((e: { id: string; title: string }) => ({
            value: e.id,
            label: e.title,
          }));
          setExamOptions([{ value: '', label: '全部考试' }, ...opts]);
        }
      } catch { /* ignore */ }
    }
    loadExams();
  }, []);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '10');
      if (search.trim()) params.set('search', search.trim());
      if (deptFilter) params.set('department', deptFilter);
      if (roleFilter) params.set('role', roleFilter);
      if (examFilter) params.set('examId', examFilter);

      const res = await fetch(`/api/admin/employees?${params.toString()}`);
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json();
      const data = json.data;
      setEmployees(data?.items ?? []);
      setTotal(data?.total ?? 0);
      setTotalPages(data?.totalPages ?? 1);
    } catch {
      toast('加载员工列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, deptFilter, roleFilter, examFilter, toast]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, deptFilter, roleFilter, examFilter]);

  async function handleAddEmployee() {
    const missing: string[] = [];
    if (!newEmployee.name.trim()) missing.push('姓名');
    if (!newEmployee.employeeNo.trim()) missing.push('工号');
    if (!newEmployee.role.trim()) missing.push('岗位');
    if (!newEmployee.idCardLast6.trim()) missing.push('身份证后6位');
    if (newEmployee.idCardLast6.trim() && newEmployee.idCardLast6.trim().length !== 6) missing.push('身份证后6位必须为6位');
    if (missing.length > 0) {
      toast(`请完善以下必填项：${missing.join('、')}`, 'warning');
      return;
    }

    setAddSaving(true);
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newEmployee.name.trim(),
          employeeNo: newEmployee.employeeNo.trim(),
          department: newEmployee.department,
          role: newEmployee.role.trim(),
          idCardLast6: newEmployee.idCardLast6.trim() || null,
          isActive: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '添加失败');
      }

      toast('员工已添加', 'success');
      setAddOpen(false);
      setNewEmployee({
        name: '',
        employeeNo: '',
        department: DEPARTMENTS[0] as string,
        role: '',
        idCardLast6: '',
      });
      fetchEmployees();
    } catch (err) {
      toast(err instanceof Error ? err.message : '添加失败', 'error');
    } finally {
      setAddSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="员工管理"
        description="管理参加考试的员工信息"
        actions={
          <Button onClick={() => setAddOpen(true)}>添加员工</Button>
        }
      />

      {/* Filters */}
      <Card className="overflow-visible">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CustomSelect
            label="关联考试"
            options={examOptions}
            value={examFilter}
            onChange={(val) => setExamFilter(val)}
          />
          <CustomSelect
            label="部门"
            options={DEPARTMENT_OPTIONS}
            value={deptFilter}
            onChange={(val) => setDeptFilter(val)}
          />
          <Input
            label="岗位"
            placeholder="如 SAW, 仓管..."
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          />
          <Input
            label="搜索"
            placeholder="搜索姓名..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Card>

      {/* Table */}
      {loading ? (
        <LoadingSpinner />
      ) : employees.length === 0 ? (
        <EmptyState
          title="暂无员工数据"
          description="添加或导入员工信息"
          action={
            <Button onClick={() => setAddOpen(true)}>添加员工</Button>
          }
        />
      ) : (
        <>
          <Card>
            {/* Mobile: card list */}
            <div className="space-y-3 md:hidden">
              {employees.map((emp) => (
                <div
                  key={emp.id ?? emp.employeeNo}
                  className="cursor-pointer rounded-lg border border-stone-100 bg-stone-50/50 px-3.5 py-3 transition-colors hover:border-teal-200 hover:bg-teal-50/40"
                  onClick={() => router.push(`/admin/employees/${emp.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-stone-800">{emp.name}</span>
                        <Badge variant={emp.isActive ? 'success' : 'default'}>
                          {emp.isActive ? '在职' : '离职'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {emp.department}{emp.role ? ` · ${emp.role}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>部门</TableHead>
                    <TableHead>岗位</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp) => (
                    <TableRow
                      key={emp.id ?? emp.employeeNo}
                      className="cursor-pointer transition-colors hover:bg-teal-50/40"
                      onClick={() => router.push(`/admin/employees/${emp.id}`)}
                    >
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell>{emp.department}</TableCell>
                      <TableCell>{emp.role}</TableCell>
                      <TableCell>
                        <Badge variant={emp.isActive ? 'success' : 'default'}>
                          {emp.isActive ? '在职' : '离职'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
              <p className="text-xs text-stone-500 sm:text-sm">
                第 {page} / {totalPages} 页，共 {total} 条
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add employee dialog */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="添加员工"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={addSaving}>
              取消
            </Button>
            <Button onClick={handleAddEmployee} loading={addSaving}>
              添加
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="姓名"
            required
            value={newEmployee.name}
            onChange={(e) =>
              setNewEmployee((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="员工姓名"
          />
          <Input
            label="工号"
            required
            value={newEmployee.employeeNo}
            onChange={(e) =>
              setNewEmployee((prev) => ({ ...prev, employeeNo: e.target.value }))
            }
            placeholder="员工工号"
          />
          <CustomSelect
            label="部门"
            required
            options={DEPARTMENT_OPTIONS}
            value={newEmployee.department}
            onChange={(val) =>
              setNewEmployee((prev) => ({ ...prev, department: val }))
            }
          />
          <Input
            label="岗位"
            required
            value={newEmployee.role}
            onChange={(e) =>
              setNewEmployee((prev) => ({ ...prev, role: e.target.value }))
            }
            placeholder="例如：仓管员"
          />
          <Input
            label="身份证后6位"
            required
            value={newEmployee.idCardLast6}
            onChange={(e) =>
              setNewEmployee((prev) => ({ ...prev, idCardLast6: e.target.value }))
            }
            placeholder="用于登录验证"
            maxLength={6}
          />
        </div>
      </Dialog>

    </div>
  );
}
