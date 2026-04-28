'use client';

import { useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Upload, Users, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

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
    </div>
  );
}
