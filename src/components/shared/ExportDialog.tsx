'use client';

import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { CustomSelect } from '@/components/ui/CustomSelect';

interface ExamOption {
  id: string;
  title: string;
}

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** If true, show "全部考试" option */
  allowAll?: boolean;
  onExport: (examId: string | null) => Promise<void>;
}

export function ExportDialog({
  open,
  onClose,
  title,
  description,
  allowAll = false,
  onExport,
}: ExportDialogProps) {
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedExamId('');
    setFetching(true);
    fetch('/api/admin/exams?pageSize=999')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const items = json.data?.items || json.data || [];
          const list = items.map((e: { id: string; title: string }) => ({
            id: e.id,
            title: e.title,
          }));
          setExams(list);
          if (!allowAll && list.length > 0) {
            setSelectedExamId(list[0].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [open, allowAll]);

  async function handleExport() {
    setLoading(true);
    try {
      await onExport(selectedExamId || null);
      onClose();
    } catch {
      // error handled by caller
    } finally {
      setLoading(false);
    }
  }

  const canExport = allowAll || selectedExamId;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      contentClassName="overflow-visible"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleExport} loading={loading} disabled={!canExport || fetching}>
            导出
          </Button>
        </>
      }
    >
      {description && <p className="text-sm text-stone-500 mb-4">{description}</p>}

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">选择考试</label>
        {fetching ? (
          <div className="text-sm text-stone-400 py-2">加载中...</div>
        ) : (
          <CustomSelect
            placeholder="请选择考试"
            value={selectedExamId}
            onChange={(v) => setSelectedExamId(v)}
            options={[
              ...(allowAll ? [{ value: '', label: '全部考试' }] : []),
              ...exams.map((e) => ({ value: e.id, label: e.title })),
            ]}
          />
        )}
      </div>
    </Dialog>
  );
}
