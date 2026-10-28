'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { ChevronDown, Check, Eye, EyeOff, Shuffle, Pencil, Ban, CheckCircle2 } from 'lucide-react';

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
  adUsername: string | null;
  adDomain: string | null;
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

interface AdUser {
  username: string;
  displayName: string;
  department?: string | null;
  title?: string | null;
  email?: string | null;
}

interface FormState {
  /** LOCAL = 系统自建帐密；AD = 绑定网域账号 */
  authSource: 'LOCAL' | 'AD';
  username: string;
  displayName: string;
  password: string;
  role: AccountRow['role'];
  isShared: boolean;
  processes: string[];
  adUsername: string;
  adDomain: string;
}

const EMPTY_FORM: FormState = {
  authSource: 'AD',
  username: '',
  displayName: '',
  password: '',
  role: 'GRADER',
  isShared: false,
  processes: [],
  adUsername: '',
  adDomain: 'PJXZ',
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

  // 查询 / 筛选 / 分页
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [adConfig, setAdConfig] = useState<{
    configured: boolean;
    defaultDomain: string;
    domains: { code: string; label: string }[];
  }>({ configured: false, defaultDomain: 'PJXZ', domains: [] });
  const [adQuery, setAdQuery] = useState('');
  const [adResults, setAdResults] = useState<AdUser[]>([]);
  const [adSearching, setAdSearching] = useState(false);
  const [adSelected, setAdSelected] = useState<AdUser | null>(null);

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
      if (json.data.ad) {
        setAdConfig(json.data.ad);
        setForm((f) => (f.adDomain ? f : { ...f, adDomain: json.data.ad.defaultDomain }));
      }
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (roleFilter && a.role !== roleFilter) return false;
      if (statusFilter === 'active' && !a.isActive) return false;
      if (statusFilter === 'inactive' && a.isActive) return false;
      if (q) {
        const hay = [a.username, a.displayName, a.adUsername ?? '', ...a.processes]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [accounts, query, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  // 筛选条件变动时回到第一页
  useEffect(() => {
    setPage(1);
  }, [query, roleFilter, statusFilter]);

  // ---- actions ------------------------------------------------------------

  /** 以姓名或工号搜寻 AD 使用者（至少 2 个字） */
  async function handleAdSearch() {
    const q = adQuery.trim();
    if (q.length < 2) {
      toast('请输入至少 2 个字的姓名或完整工号', 'warning');
      return;
    }
    setAdSearching(true);
    try {
      // 先试工号精准查询，查无再走姓名模糊查询
      const byId = await fetch(
        `/api/admin/ad/users?username=${encodeURIComponent(q)}&domain=${form.adDomain}`
      );
      const byIdJson = await byId.json();
      if (byId.ok && byIdJson.success && byIdJson.data.user) {
        setAdResults([byIdJson.data.user]);
        return;
      }

      const res = await fetch(
        `/api/admin/ad/users?q=${encodeURIComponent(q)}&domain=${form.adDomain}&limit=20`
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? '查询失败');
      setAdResults(json.data.users);
      if (json.data.users.length === 0) toast('AD 中查无此人', 'warning');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'AD 查询失败', 'error');
    } finally {
      setAdSearching(false);
    }
  }

  function pickAdUser(user: AdUser) {
    setAdSelected(user);
    setForm((f) => ({
      ...f,
      adUsername: user.username,
      displayName: user.displayName || user.username,
    }));
  }

  async function handleCreate() {
    if (form.authSource === 'AD') {
      if (!form.adUsername) {
        toast('请先搜寻并选择要绑定的 AD 账号', 'warning');
        return;
      }
    } else if (!form.username || !form.displayName || !form.password) {
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
      toast(
        form.authSource === 'AD'
          ? `已绑定 AD 账号 ${form.adUsername}`
          : `账号 ${form.username} 已建立`,
        'success'
      );
      setCreateOpen(false);
      setForm({ ...EMPTY_FORM, adDomain: adConfig.defaultDomain });
      setAdQuery('');
      setAdResults([]);
      setAdSelected(null);
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

      {/* 查询 / 筛选工具列 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜寻账号、姓名或工序"
          className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 sm:max-w-xs"
        />
        <div className="w-full sm:w-36">
          <CustomSelect
            options={[
              { value: '', label: '全部角色' },
              { value: 'GRADER', label: '评卷人' },
              { value: 'HR', label: '人资' },
              { value: 'SUPER_ADMIN', label: '系统管理员' },
            ]}
            value={roleFilter}
            onChange={setRoleFilter}
          />
        </div>
        <div className="w-full sm:w-32">
          <CustomSelect
            options={[
              { value: '', label: '全部状态' },
              { value: 'active', label: '启用' },
              { value: 'inactive', label: '停用' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <span className="text-xs text-stone-400 sm:ml-auto">共 {filtered.length} 个账号</span>
      </div>

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
            {paged.map((a) => (
              <tr key={a.id} className={cn(!a.isActive && 'bg-stone-50/60 text-stone-400')}>
                <td className="px-4 py-3">
                  <div className="font-medium text-stone-800">{a.displayName}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {a.authSource === 'AD' ? (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                        AD · {a.adDomain} · {a.adUsername}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-stone-500">{a.username}</span>
                    )}
                    {a.isShared && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                        共用
                      </span>
                    )}
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
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(a)}
                      className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                    >
                      <Pencil className="h-3 w-3" />
                      编辑
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        patchAccount(
                          a.id,
                          { isActive: !a.isActive },
                          a.isActive ? '账号已停用' : '账号已启用'
                        )
                      }
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors disabled:opacity-50',
                        a.isActive
                          ? 'hover:border-red-300 hover:bg-red-50 hover:text-red-600'
                          : 'hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700'
                      )}
                    >
                      {a.isActive ? (
                        <>
                          <Ban className="h-3 w-3" />
                          停用
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          启用
                        </>
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-stone-400">没有符合条件的账号</p>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 text-sm">
            <span className="text-stone-500">
              第 {pageSafe} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pageSafe <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pageSafe >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 新增账号 */}
      {createOpen && (
        <Dialog
          open
          onClose={() => setCreateOpen(false)}
          title="新增后台账号"
          className="max-w-xl"
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
            {/* 账号来源 */}
            <div className="flex gap-2">
              {([
                { key: 'AD', label: 'AD 账号绑定' },
                { key: 'LOCAL', label: '系统自建账号' },
              ] as const).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  disabled={o.key === 'AD' && !adConfig.configured}
                  onClick={() => setForm({ ...form, authSource: o.key })}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                    form.authSource === o.key
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-stone-200 text-stone-600 hover:bg-stone-50',
                    o.key === 'AD' && !adConfig.configured && 'cursor-not-allowed opacity-50'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {form.authSource === 'AD' ? (
              <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                <div className="space-y-2">
                  <CustomSelect
                    label="组织"
                    options={adConfig.domains.map((d) => ({ value: d.code, label: d.label }))}
                    value={form.adDomain}
                    onChange={(v) => setForm({ ...form, adDomain: v })}
                  />
                  <div className="flex gap-2">
                    <input
                      value={adQuery}
                      onChange={(e) => setAdQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAdSearch();
                        }
                      }}
                      placeholder="输入姓名（至少 2 字）或完整工号"
                      className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <Button
                      variant="secondary"
                      loading={adSearching}
                      onClick={handleAdSearch}
                      className="shrink-0"
                    >
                      搜寻
                    </Button>
                  </div>
                </div>

                {adResults.length > 0 && (
                  <div className="max-h-44 space-y-1 overflow-y-auto">
                    {adResults.map((u) => (
                      <button
                        key={u.username}
                        type="button"
                        onClick={() => pickAdUser(u)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
                          adSelected?.username === u.username
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-stone-200 bg-white hover:bg-stone-50'
                        )}
                      >
                        <span>
                          <span className="font-medium text-stone-800">{u.displayName}</span>
                          <span className="ml-2 text-xs text-stone-500">{u.username}</span>
                        </span>
                        <span className="text-xs text-stone-400">
                          {u.department ?? ''} {u.title ?? ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {adSelected && (
                  <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
                    <Check className="h-4 w-4 shrink-0 text-teal-600" />
                    <div className="min-w-0 text-sm">
                      <span className="font-medium text-stone-800">{adSelected.displayName}</span>
                      <span className="ml-1.5 text-xs text-stone-500">
                        {adSelected.username}
                        {adSelected.department ? ` · ${adSelected.department}` : ''}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
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

                <PasswordField
                  label="初始密码"
                  value={form.password}
                  onChange={(v) => setForm({ ...form, password: v })}
                  placeholder="至少 6 个字符，首次登入须修改"
                />
              </>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">角色</label>
              <RoleTabs value={form.role} onChange={(role) => setForm({ ...form, role })} />
            </div>

            {/* 共用账号：仅评卷人 + 系统自建账号才有意义 */}
            {form.role === 'GRADER' && form.authSource !== 'AD' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-700">账号类型</label>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
                  {([
                    { shared: false, label: '个人账号' },
                    { shared: true, label: '工序共用' },
                  ] as const).map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => setForm({ ...form, isShared: o.shared })}
                      className={cn(
                        'rounded-md py-1.5 text-sm font-medium transition-colors',
                        form.isShared === o.shared
                          ? 'bg-white text-teal-700 shadow-sm'
                          : 'text-stone-500 hover:text-stone-700'
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {form.isShared
                    ? '整个工序共用一组帐密，评分仅追溯到工序'
                    : '每位评卷人各自的账号，评分可追溯到个人'}
                </p>
              </div>
            )}

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
            {editing.authSource === 'AD' ? (
              <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                AD 账号（{editing.adDomain}/{editing.adUsername}），密码由网域验证，系统不提供重设。
              </p>
            ) : (
              <PasswordField
                label="重设密码（留空表示不变更）"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="至少 6 个字符"
              />
            )}
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
// 角色等宽 Tab
// ---------------------------------------------------------------------------

function RoleTabs({
  value,
  onChange,
}: {
  value: AccountRow['role'];
  onChange: (role: AccountRow['role']) => void;
}) {
  const roles: AccountRow['role'][] = ['GRADER', 'HR', 'SUPER_ADMIN'];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-stone-100 p-1">
      {roles.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={cn(
            'rounded-md py-1.5 text-sm font-medium transition-colors',
            value === r ? 'bg-white text-teal-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'
          )}
        >
          {ROLE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 密码栏位（显示切换 + 随机产生）
// ---------------------------------------------------------------------------

/** 产生易读的随机密码：避开易混淆字元，含大小写、数字与符号 */
function randomPassword(length = 10): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%*'];
  const all = sets.join('');
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  // 确保每类至少一个，其余随机，再打散
  const chars = sets.map(pick);
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-stone-700">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete="new-password"
            className="block w-full rounded-lg border border-stone-300 px-3 py-2 pr-10 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            title={show ? '隐藏密码' : '显示密码'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          onClick={() => {
            onChange(randomPassword());
            setShow(true);
          }}
        >
          <Shuffle className="mr-1 h-4 w-4" />
          产生
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 工序多选下拉（面板内 checkbox）
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
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // 面板用 fixed 定位浮出对话框的捲动容器（避免被 overflow 裁切）
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(
    null
  );

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelHeight = 320; // 预估面板高度
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < panelHeight && r.top > spaceBelow;
    setPos({
      top: up ? r.top - 4 : r.bottom + 4,
      left: r.left,
      width: r.width,
      up,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    // 对话框内容捲动或视窗缩放时重新定位
    function onScrollOrResize() {
      updatePos();
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, updatePos]);

  const toggle = (process: string) => {
    onChange(
      selected.includes(process)
        ? selected.filter((p) => p !== process)
        : [...selected, process]
    );
  };

  const filtered = q.trim()
    ? all.filter((p) => p.toLowerCase().includes(q.trim().toLowerCase()))
    : all;

  return (
    <div ref={ref} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-stone-700">
        负责工序（可多选，已选 {selected.length} 个）
      </label>

      {/* 触发器 */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-stone-300 px-3 py-2 text-left text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {selected.length === 0 ? (
            <span className="text-stone-400">请选择负责工序</span>
          ) : (
            selected.map((p) => (
              <span
                key={p}
                className="rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-700"
              >
                {p}
              </span>
            ))
          )}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-stone-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* 下拉面板：fixed 浮层，z 高于对话框（z-50） */}
      {open && pos && (
        <div
          ref={panelRef}
          className="fixed z-[60] rounded-lg border border-stone-200 bg-white shadow-xl"
          style={{
            top: pos.up ? undefined : pos.top,
            bottom: pos.up ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            width: pos.width,
          }}
        >
          <div className="flex items-center gap-2 border-b border-stone-100 p-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜寻工序"
              className="min-w-0 flex-1 rounded-md border border-stone-200 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none"
            />
            <button
              type="button"
              className="shrink-0 text-xs text-teal-600 hover:underline"
              onClick={() => onChange(all)}
            >
              全选
            </button>
            <button
              type="button"
              className="shrink-0 text-xs text-stone-500 hover:underline"
              onClick={() => onChange([])}
            >
              清空
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {all.length === 0 && (
              <p className="px-2 py-3 text-xs text-stone-400">尚无工序资料，请先汇入题库</p>
            )}
            {filtered.map((p) => {
              const checked = selected.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggle(p)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-stone-50"
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      checked ? 'border-teal-500 bg-teal-600 text-white' : 'border-stone-300'
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="text-stone-700">{p}</span>
                </button>
              );
            })}
            {filtered.length === 0 && all.length > 0 && (
              <p className="px-2 py-3 text-xs text-stone-400">无符合的工序</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
