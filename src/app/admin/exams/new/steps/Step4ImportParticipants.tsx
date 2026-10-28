'use client';

import { useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Upload, Users, UserPlus, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface EmpItem {
  id: string;
  employeeNo: string;
  name: string;
  department: string;
  role: string;
}

export interface ParticipantResult {
  created: number;
  replaced: number;
  usersCreated: number;
  errors: string[];
}

interface ParticipantRow {
  id: string;
  userId: string | null;
  department: string | null;
  process: string | null;
  level: string | null;
  user: { employeeNo: string; name: string; department: string } | null;
  sessionStatus: string;
}

interface Props {
  examId: string | null;
  participants: ParticipantRow[];
  onParticipantsChange: (participants: ParticipantRow[]) => void;
}

export default function Step4ImportParticipants({ examId, participants, onParticipantsChange }: Props) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<ParticipantResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 从员工管理批量选择
  const [pickerOpen, setPickerOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [empResults, setEmpResults] = useState<EmpItem[]>([]);
  const [empSearching, setEmpSearching] = useState(false);
  const [selectedEmps, setSelectedEmps] = useState<Record<string, EmpItem>>({});
  const [batchLevel, setBatchLevel] = useState('');
  const [adding, setAdding] = useState(false);
  const selectedList = Object.values(selectedEmps);

  async function searchEmployees(q: string) {
    if (!q.trim()) { setEmpResults([]); return; }
    setEmpSearching(true);
    try {
      const res = await fetch(`/api/admin/employees?search=${encodeURIComponent(q)}&pageSize=20`);
      const json = await res.json();
      if (json.success) setEmpResults(json.data.items);
    } catch { /* ignore */ } finally {
      setEmpSearching(false);
    }
  }

  function toggleEmp(emp: EmpItem) {
    setSelectedEmps((prev) => {
      const next = { ...prev };
      if (next[emp.id]) delete next[emp.id]; else next[emp.id] = emp;
      return next;
    });
  }

  async function handleBatchAdd() {
    if (!examId) return;
    if (selectedList.length === 0) { toast('请先勾选员工', 'warning'); return; }
    if (!batchLevel.trim()) { toast('请填写报考等级', 'warning'); return; }
    const noProcess = selectedList.filter((e) => !e.role?.trim());
    if (noProcess.length > 0) {
      toast(`${noProcess.length} 人无工序（员工管理的岗位为空），无法加入`, 'error');
      return;
    }
    setAdding(true);
    let ok = 0; const fails: string[] = [];
    for (const emp of selectedList) {
      try {
        const res = await fetch(`/api/admin/exams/${examId}/participants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: emp.id, process: emp.role.trim(), level: batchLevel.trim(), department: emp.department || undefined }),
        });
        if (res.ok) ok++;
        else { const j = await res.json().catch(() => ({})); fails.push(`${emp.name}：${j.error || '失败'}`); }
      } catch { fails.push(`${emp.name}：网络错误`); }
    }
    setAdding(false);
    if (ok > 0) toast(`已加入 ${ok} 人${fails.length ? `，${fails.length} 人失败` : ''}`, fails.length ? 'warning' : 'success');
    else toast(fails[0] || '加入失败', 'error');
    setSelectedEmps({});
    setBatchLevel('');
    setPickerOpen(false);
    await refreshParticipants();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !examId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/admin/exams/${examId}/participants`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '导入失败');

      setImportResult(json.data);
      toast(json.message || '导入成功', 'success');

      // Refresh participants list
      await refreshParticipants();
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function refreshParticipants() {
    if (!examId) return;
    try {
      const res = await fetch(`/api/admin/exams/${examId}/participants`);
      const json = await res.json();
      if (json.success) {
        onParticipantsChange(json.data);
      }
    } catch {
      // ignore
    }
  }

  async function handleDelete(assignmentId: string) {
    if (!examId) return;
    try {
      const res = await fetch(`/api/admin/exams/${examId}/participants/${assignmentId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '删除失败');
      onParticipantsChange(participants.filter((p) => p.id !== assignmentId));
      toast('已删除', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <Card title="导入应考人员">
        <div className="space-y-4">
          {/* 说明：两种带入方式 */}
          <div className="rounded-lg border border-teal-200 bg-teal-50/50 px-4 py-3 text-sm leading-relaxed text-stone-700">
            应考人员需<strong>明确指定「谁考这场」</strong>（系统不会自动带入全部员工）。两种方式：
            <strong>「从员工选择」</strong>直接勾选系统员工管理里的人（工序取自其岗位）；或<strong>「上传名单」</strong>用 Excel 批量导入。
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-stone-600">
                上传应考名单 Excel 文件，需包含列：<code className="text-xs bg-stone-100 px-1 py-0.5 rounded">姓名、报考工序、报考等级</code>
              </p>
              <p className="mt-1 text-xs text-stone-500">
                可选列：部门、身份证后6位（验证码）、工号
              </p>
            </div>

            {!examId ? (
              <p className="shrink-0 text-xs text-amber-600">请先保存草稿</p>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  <UserPlus className="h-4 w-4" />
                  从员工选择
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xls,.xlsx"
                  className="hidden"
                  onChange={handleUpload}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  loading={uploading}
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? '导入中...' : '上传名单'}
                </Button>
              </div>
            )}
          </div>

          {importResult && (
            <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 text-sm text-teal-800">
              导入 {importResult.created} 人{importResult.replaced > 0 ? `（覆盖）` : ''}
              {importResult.usersCreated > 0 && `，新建 ${importResult.usersCreated} 个用户`}
              {importResult.errors.length > 0 && (
                <div className="mt-2 text-xs text-red-600">
                  {importResult.errors.slice(0, 5).map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card
        title={
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            应考人员列表
            <span className="text-sm font-normal text-stone-400">({participants.length} 人)</span>
          </div>
        }
      >
        {participants.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-8">尚未导入应考人员</p>
        ) : (
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
                {participants.map((p) => (
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
                            : p.sessionStatus === 'COMPLETED' || p.sessionStatus === 'SUBMITTED'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {p.sessionStatus === 'NOT_STARTED'
                          ? '未考'
                          : p.sessionStatus === 'COMPLETED' || p.sessionStatus === 'SUBMITTED'
                            ? '已完成'
                            : '进行中'}
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
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 从员工管理批量选择 */}
      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="从员工管理选择应考人员"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-stone-500">已选 {selectedList.length} 人</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPickerOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleBatchAdd} loading={adding} disabled={selectedList.length === 0}>
                添加选中 {selectedList.length} 人
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="报考等级（套用到所选全部）"
              required
              value={batchLevel}
              onChange={(e) => setBatchLevel(e.target.value)}
              placeholder="如：Ⅰ级"
            />
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">搜索员工</label>
              <input
                value={empSearch}
                onChange={(e) => { setEmpSearch(e.target.value); searchEmployees(e.target.value); }}
                placeholder="姓名或工号"
                className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <p className="text-xs text-stone-500">工序取自员工的「岗位」；等级统一用上方填写值。岗位为空的员工无法加入。</p>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-stone-100">
            {empSearching ? (
              <div className="flex items-center justify-center py-8 text-sm text-stone-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 搜索中...
              </div>
            ) : empResults.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-400">{empSearch ? '无匹配员工' : '输入姓名或工号搜索'}</p>
            ) : (
              empResults.map((emp) => {
                const checked = !!selectedEmps[emp.id];
                return (
                  <label key={emp.id} className="flex cursor-pointer items-center gap-3 border-b border-stone-50 px-3 py-2 last:border-0 hover:bg-stone-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-stone-300 text-teal-600 accent-teal-600"
                      checked={checked}
                      onChange={() => toggleEmp(emp)}
                    />
                    <span className="flex-1 text-sm font-medium text-stone-800">{emp.name}</span>
                    <span className="text-xs text-stone-500">
                      {emp.department || '—'} · {emp.role || <span className="text-amber-600">无岗位</span>} · {emp.employeeNo}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {selectedList.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedList.map((emp) => (
                <span key={emp.id} className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-700">
                  {emp.name}
                  <button type="button" onClick={() => toggleEmp(emp)} className="text-teal-500 hover:text-teal-800">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
