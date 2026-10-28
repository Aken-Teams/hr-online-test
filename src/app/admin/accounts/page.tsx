'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountRow {
  id: string;
  username: string;
  displayName: string;
  role: 'SUPER_ADMIN' | 'HR' | 'GRADER';
  isActive: boolean;
  isShared: boolean;
  authSource: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  processes: string[];
  gradedCount: number;
}

const ROLE_LABELS: Record<AccountRow['role'], string> = {
  SUPER_ADMIN: '系统管理员',
  HR: '人资',
  GRADER: '评卷人',
};

const ROLE_BADGE: Record<AccountRow['role'], 'danger' | 'info' | 'success'> = {
  SUPER_ADMIN: 'danger',
  HR: 'info',
  GRADER: 'success',
};

interface FormState {
  username: string;
  displayName: string;
  password: string;
  role: AccountRow['role'];
  isShared: boolean;
  processes: string[];
}

const EMPTY_FORM: FormState = {
  username: '',
  displayName: '',
  password: '',
  role: 'GRADER',
  isShared: false,
  processes: [],
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminAccountsPage() {
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [availableProcesses, setAvailableProcesses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [editProcesses, setEditProcesses] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState('');

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/accounts');
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? '加载失败');
      setAccounts(json.data.accounts);
      setAvailableProcesses(json.data.availableProcesses);
    } catch {
      toast('加载账号列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const graderCount = useMemo(
    () => accounts.filter((a) => a.role === 'GRADER' && a.isActive).length,
    [accounts]
  );
  const coveredProcesses = useMemo(() => {
    const set = new Set<string>();
    accounts.filter((a) => a.isActive).forEach((a) => a.processes.forEach((p) => set.add(p)));
    return set;
  }, [accounts]);
  const uncoveredProcesses = useMemo(
    () => availableProcesses.filter((p) => !coveredProcesses.has(p)),
    [availableProcesses, coveredProcesses]
  );

  // ---- actions ------------------------------------------------------------

  async function handleCreate() {
    if (!form.username || !form.displayName || !form.password) {
      toast('请填写账号、显示名称与密码', 'warning');
      return;
    }
    if (form.role === 'GRADER' && form.processes.length === 0) {
      toast('评卷人至少需指派一个工序，否则看不到任何试卷', 'warning');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? '建立失败');
      toast(`账号 ${form.username} 已建立`, 'success');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      await fetchAccounts();
    } catch (err) {
      toast(err instanceof Error ? err.message : '建立账号失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function patchAccount(id: string, body: Record<string, unknown>, successMsg: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? '更新失败');
      toast(successMsg, 'success');
      await fetchAccounts();
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : '更新失败', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openEdit(account: AccountRow) {
    setEditing(account);
    setEditProcesses(account.processes);
    setNewPassword('');
  }

  async function handleSaveEdit() {
    if (!editing) return;
    const body: Record<string, unknown> = { processes: editProcesses };
    if (newPassword) body.password = newPassword;
    const ok = await patchAccount(
      editing.id,
      body,
      newPassword ? '已更新工序并重设密码' : '已更新负责工序'
    );
    if (ok) setEditing(null);
  }

  // ---- render -------------------------------------------------------------

  if (forbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="账号管理" />
        <EmptyState title="无权限" description="仅系统管理员可管理后台账号" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="账号管理" />
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="账号管理"
        actions={<Button onClick={() => setCreateOpen(true)}>新增账号</Button>}
      />

      {/* 概览 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[
          { label: '账号总数', value: accounts.length, color: 'text-stone-800' },
          { label: '启用中评卷人', value: graderCount, color: 'text-teal-700' },
          { label: '已指派工序', value: coveredProcesses.size, color: 'text-blue-700' },
          { label: '未指派工序', value: uncoveredProcesses.length, color: 'text-orange-600' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 shadow-sm sm:px-5 sm:py-4"
          >
            <p className="text-xs font-medium text-stone-500 sm:text-sm">{s.label}</p>
            <p className={cn('mt-0.5 text-xl font-bold sm:mt-1 sm:text-2xl', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {uncoveredProcesses.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          以下工序尚未指派评卷人，这些考生的简答题将无人可批改：
          <span className="font-medium"> {uncoveredProcesses.join('、')}</span>
        </div>
      )}

      {/* 账号列表 */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-4 py-3">账号</th>
              <th className="px-4 py-3">角色</th>
              <th className="px-4 py-3">负责工序</th>
              <th className="px-4 py-3">已评份数</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {accounts.map((a) => (
              <tr key={a.id} className={cn(!a.isActive && 'bg-stone-50/60 text-stone-400')}>
                <td className="px-4 py-3">
                  <div className="font-medium text-stone-800">{a.displayName}</div>
                  <div className="text-xs text-stone-500">
                    {a.username}
                    {a.isShared && <span className="ml-1 text-amber-600">· 共用账号</span>}
                    {a.authSource === 'AD' && <span className="ml-1 text-blue-600">· AD</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={ROLE_BADGE[a.role]}>{ROLE_LABELS[a.role]}</Badge>
                </td>
                <td className="px-4 py-3">
                  {a.role === 'GRADER' ? (
                    a.processes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {a.processes.map((p) => (
                          <span
                            key={p}
                            className="rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-700"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-orange-600">未指派（看不到任何试卷）</span>
                    )
                  ) : (
                    <span className="text-xs text-stone-400">全部工序</span>
                  )}
                </td>
                <td className="px-4 py-3 text-stone-600">{a.gradedCount}</td>
                <td className="px-4 py-3">
                  {a.isActive ? (
                    <Badge variant="success">启用</Badge>
                  ) : (
                    <Badge variant="default">停用</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() =>
                        patchAccount(
                          a.id,
                          { isActive: !a.isActive },
                          a.isActive ? '账号已停用' : '账号已启用'
                        )
                      }
                    >
                      {a.isActive ? '停用' : '启用'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 新增账号 */}
      {createOpen && (
        <Dialog
          open
          onClose={() => setCreateOpen(false)}
          title="新增后台账号"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCreate} loading={saving}>
                建立
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="账号"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="grader_saw"
              />
              <Input
                label="显示名称"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="SAW 工序评卷人"
              />
            </div>

            <Input
              label="初始密码"
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="至少 6 个字符，首次登入须修改"
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">角色</label>
              <div className="flex gap-2">
                {(['GRADER', 'HR', 'SUPER_ADMIN'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm({ ...form, role: r })}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                      form.role === r
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                    )}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={form.isShared}
                onChange={(e) => setForm({ ...form, isShared: e.target.checked })}
                className="mt-0.5"
              />
              <span>
                共用账号（整个工序共用一组帐密）
                <span className="block text-xs text-stone-500">
                  稽核纪录只能追溯到工序，无法追溯到个人
                </span>
              </span>
            </label>

            {form.role === 'GRADER' && (
              <ProcessPicker
                all={availableProcesses}
                selected={form.processes}
                onChange={(processes) => setForm({ ...form, processes })}
              />
            )}
          </div>
        </Dialog>
      )}

      {/* 编辑账号 */}
      {editing && (
        <Dialog
          open
          onClose={() => setEditing(null)}
          title={`编辑 - ${editing.displayName}`}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                取消
              </Button>
              <Button onClick={handleSaveEdit} loading={saving}>
                保存
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Input
              label="重设密码（留空表示不变更）"
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 6 个字符"
            />
            {editing.role === 'GRADER' ? (
              <ProcessPicker
                all={availableProcesses}
                selected={editProcesses}
                onChange={setEditProcesses}
              />
            ) : (
              <p className="text-sm text-stone-500">
                {ROLE_LABELS[editing.role]} 可查看全部工序，无需指派。
              </p>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 工序多选
// ---------------------------------------------------------------------------

function ProcessPicker({
  all,
  selected,
  onChange,
}: {
  all: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (process: string) => {
    onChange(
      selected.includes(process)
        ? selected.filter((p) => p !== process)
        : [...selected, process]
    );
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-stone-700">
          负责工序（可多选，已选 {selected.length} 个）
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs text-teal-600 hover:underline"
            onClick={() => onChange(all)}
          >
            全选
          </button>
          <button
            type="button"
            className="text-xs text-stone-500 hover:underline"
            onClick={() => onChange([])}
          >
            清空
          </button>
        </div>
      </div>
      <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-stone-200 p-2">
        {all.length === 0 && (
          <p className="px-1 py-2 text-xs text-stone-400">尚无工序资料，请先汇入应考名单</p>
        )}
        {all.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs transition-colors',
              selected.includes(p)
                ? 'border-teal-500 bg-teal-50 text-teal-700'
                : 'border-stone-200 text-stone-600 hover:bg-stone-50'
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
