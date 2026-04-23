'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Upload, Users, Loader2, Search, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface Participant {
  id: string;
  userId: string | null;
  department: string | null;
  process: string | null;
  level: string | null;
  user: { employeeNo: string; name: string; department: string } | null;
  sessionStatus: string;
}

interface Props {
  examId: string;
}

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: '未考',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  SUBMITTED: '已完成',
  AUTO_SUBMITTED: '已完成',
};

function getStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export default function TabParticipants({ examId }: Props) {
  const { toast } = useToast();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterProcess, setFilterProcess] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadParticipants();
  }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadParticipants() {
    try {
      const res = await fetch(`/api/admin/exams/${examId}/participants`);
      const json = await res.json();
      if (json.success) setParticipants(json.data);
    } catch {
      toast('加载人员列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/admin/exams/${examId}/participants`, { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(json.message || '导入成功', 'success');
      await loadParticipants();
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/exams/${examId}/participants/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setParticipants((prev) => prev.filter((p) => p.id !== id));
      toast('已删除', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  }

  async function handleDeleteAll() {
    if (!confirm('确定要删除所有应考人员吗？此操作不可恢复。')) return;
    try {
      const res = await fetch(`/api/admin/exams/${examId}/participants/all`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(`已删除 ${json.data?.deletedCount ?? 0} 人`, 'success');
      setParticipants([]);
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  }

  // Extract unique filter options
  const filterOptions = useMemo(() => {
    const depts = new Set<string>();
    const processes = new Set<string>();
    const levels = new Set<string>();
    const statuses = new Set<string>();

    for (const p of participants) {
      const dept = p.department || p.user?.department;
      if (dept) depts.add(dept);
      if (p.process) processes.add(p.process);
      if (p.level) levels.add(p.level);
      const sl = getStatusLabel(p.sessionStatus);
      statuses.add(sl);
    }

    return {
      departments: [...depts].sort(),
      processes: [...processes].sort(),
      levels: [...levels].sort(),
      statuses: [...statuses],
    };
  }, [participants]);

  const hasActiveFilters = filterDept || filterProcess || filterLevel || filterStatus;

  const filtered = useMemo(() => {
    return participants.filter((p) => {
      // Text search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = (p.user?.name ?? '').toLowerCase();
        const dept = (p.department || p.user?.department || '').toLowerCase();
        const process = (p.process ?? '').toLowerCase();
        if (!name.includes(q) && !dept.includes(q) && !process.includes(q)) return false;
      }

      // Dropdown filters
      if (filterDept) {
        const dept = p.department || p.user?.department || '';
        if (dept !== filterDept) return false;
      }
      if (filterProcess && (p.process ?? '') !== filterProcess) return false;
      if (filterLevel && (p.level ?? '') !== filterLevel) return false;
      if (filterStatus && getStatusLabel(p.sessionStatus) !== filterStatus) return false;

      return true;
    });
  }, [participants, searchQuery, filterDept, filterProcess, filterLevel, filterStatus]);

  function clearFilters() {
    setFilterDept('');
    setFilterProcess('');
    setFilterLevel('');
    setFilterStatus('');
    setSearchQuery('');
  }

  const selectClass = 'rounded-md border border-stone-200 bg-white py-1.5 pl-2.5 pr-7 text-sm text-stone-700 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%2712%27%20height%3D%2712%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%2378716c%27%20stroke-width%3D%272%27%3E%3Cpath%20d%3D%27M6%209l6%206%206-6%27%2F%3E%3C%2Fsvg%3E")] bg-[length:12px] bg-[right_6px_center] bg-no-repeat';

  return (
    <div className="space-y-6">
      <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleUpload} />

      <Card
        title={
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            应考人员
            <span className="text-sm font-normal text-stone-400">({participants.length}人)</span>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-stone-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : (
          <div className="space-y-3">
            {/* Toolbar: search + filters + buttons in one row */}
            {participants.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[140px] max-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
                  <input
                    type="text"
                    placeholder="搜索姓名..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-md border border-stone-200 bg-white py-1.5 pl-8 pr-3 text-sm text-stone-700 placeholder:text-stone-400 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
                  />
                </div>
                {filterOptions.departments.length > 1 && (
                  <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className={selectClass}>
                    <option value="">全部部门</option>
                    {filterOptions.departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                )}
                {filterOptions.processes.length > 1 && (
                  <select value={filterProcess} onChange={(e) => setFilterProcess(e.target.value)} className={selectClass}>
                    <option value="">全部工序</option>
                    {filterOptions.processes.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
                {filterOptions.levels.length > 1 && (
                  <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className={selectClass}>
                    <option value="">全部等级</option>
                    {filterOptions.levels.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                )}
                {filterOptions.statuses.length > 1 && (
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectClass}>
                    <option value="">全部状态</option>
                    {filterOptions.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                  >
                    <X className="h-3 w-3" />
                    清除
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="outline" size="sm" onClick={handleDeleteAll}>
                    <Trash2 className="h-3.5 w-3.5" />
                    清空名单
                  </Button>
                  <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
                    <Upload className="h-3.5 w-3.5" />
                    导入名单
                  </Button>
                </div>
              </div>
            )}
            {participants.length === 0 && (
              <div className="flex items-center gap-2 justify-end">
                <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
                  <Upload className="h-3.5 w-3.5" />
                  导入名单
                </Button>
              </div>
            )}

            {participants.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-8">尚未导入应考人员</p>
            ) : (
              <>
                {(searchQuery || hasActiveFilters) && (
                  <p className="text-xs text-stone-400">
                    筛选结果 {filtered.length} / {participants.length} 人
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-100 text-left text-xs text-stone-500">
                        <th className="py-2 pr-3 font-medium">姓名</th>
                        <th className="py-2 pr-3 font-medium">部门</th>
                        <th className="py-2 pr-3 font-medium">工序</th>
                        <th className="py-2 pr-3 font-medium">等级</th>
                        <th className="py-2 pr-3 font-medium">状态</th>
                        <th className="py-2 font-medium w-16">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p) => (
                        <tr key={p.id} className="border-b border-stone-50">
                          <td className="py-2 pr-3 font-medium">{p.user?.name ?? '-'}</td>
                          <td className="py-2 pr-3 text-stone-600">{p.department || p.user?.department || '-'}</td>
                          <td className="py-2 pr-3 text-stone-600">{p.process ?? '-'}</td>
                          <td className="py-2 pr-3 text-stone-600">{p.level ?? '-'}</td>
                          <td className="py-2 pr-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                p.sessionStatus === 'NOT_STARTED'
                                  ? 'bg-stone-100 text-stone-600'
                                  : p.sessionStatus === 'COMPLETED' || p.sessionStatus === 'SUBMITTED' || p.sessionStatus === 'AUTO_SUBMITTED'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {getStatusLabel(p.sessionStatus)}
                            </span>
                          </td>
                          <td className="py-2">
                            {p.sessionStatus === 'NOT_STARTED' && (
                              <button
                                type="button"
                                onClick={() => handleDelete(p.id)}
                                className="text-xs text-red-500 hover:text-red-700"
                              >
                                移除
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-sm text-stone-400">
                            没有符合条件的人员
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
