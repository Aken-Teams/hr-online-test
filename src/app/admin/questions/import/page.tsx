'use client';

import { useState, useRef, useCallback, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
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
import { QUESTION_TYPE_LABELS } from '@/lib/constants';
import type { QuestionType } from '@/types/exam';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreviewRow {
  type: string;
  content: string;
  department: string;
  level: string;
  correctAnswer: string;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function QuestionImportPage() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFileSelect(selectedFile: File | null) {
    if (!selectedFile) return;

    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls',
      '.xlsx',
    ];
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xls' && ext !== 'xlsx') {
      toast('请上传 .xls 或 .xlsx 格式的文件', 'warning');
      return;
    }

    setFile(selectedFile);
    setPreview([]);
    setImportResult(null);
    uploadPreview(selectedFile);
  }

  async function uploadPreview(selectedFile: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('preview', 'true');

      const res = await fetch('/api/admin/questions/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('解析文件失败');
      const json = await res.json();
      setPreview(json.data?.questions ?? []);
    } catch {
      toast('解析文件失败，请检查文件格式', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleImport() {
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('confirm', 'true');

      const res = await fetch('/api/admin/questions/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('导入失败');
      const json = await res.json();
      setImportResult({
        success: json.data?.imported ?? 0,
        failed: json.data?.failed ?? 0,
      });
      toast(`成功导入 ${json.data?.imported ?? 0} 道题目`, 'success');
    } catch {
      toast('导入失败', 'error');
    } finally {
      setImporting(false);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }

  function truncate(text: string, max: number) {
    return text.length > max ? text.slice(0, max) + '...' : text;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="导入题库"
        description="从 Excel 文件批量导入题目"
        actions={
          <Button variant="outline" onClick={() => router.push('/admin/questions')}>
            <ArrowLeft className="h-4 w-4" />
            返回列表
          </Button>
        }
      />

      {/* Upload zone */}
      <Card>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-teal-400 bg-teal-50/50'
              : 'border-stone-300 bg-stone-50/30 hover:border-gray-400'
          }`}
        >
          <svg
            className="h-10 w-10 text-stone-400 mb-3"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          <p className="text-sm font-medium text-stone-700">
            拖拽文件到此处，或点击选择文件
          </p>
          <p className="mt-1 text-xs text-stone-500">支持 .xls 和 .xlsx 格式</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
          />
        </div>

        {file && (
          <div className="mt-4 flex items-center gap-3 text-sm">
            <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-stone-700">{file.name}</span>
            <span className="text-stone-400">({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
        )}

        {uploading && (
          <div className="mt-4">
            <p className="text-sm text-stone-500 mb-2">解析中...</p>
            <Progress value={50} color="teal" />
          </div>
        )}
      </Card>

      {/* Preview table */}
      {preview.length > 0 && !importResult && (
        <Card title={`预览（共 ${preview.length} 道题目）`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>题型</TableHead>
                <TableHead>题目</TableHead>
                <TableHead>部门</TableHead>
                <TableHead>级别</TableHead>
                <TableHead>正确答案</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.slice(0, 50).map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Badge variant="info">
                      {QUESTION_TYPE_LABELS[row.type as QuestionType] ?? row.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <span className="text-sm" title={row.content}>
                      {truncate(row.content, 80)}
                    </span>
                  </TableCell>
                  <TableCell>{row.department}</TableCell>
                  <TableCell>{row.level}</TableCell>
                  <TableCell className="text-sm text-stone-500 max-w-32 truncate">
                    {row.correctAnswer || '--'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {preview.length > 50 && (
            <p className="mt-3 text-sm text-stone-500">
              仅显示前 50 条，共 {preview.length} 道题目
            </p>
          )}

          <div className="mt-4 flex items-center justify-end">
            <Button onClick={handleImport} loading={importing}>
              确认导入 ({preview.length} 道)
            </Button>
          </div>
        </Card>
      )}

      {/* Import result */}
      {importResult && (
        <Card title="导入结果">
          <div className="space-y-3">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-sm text-stone-500">成功导入：</span>
                <span className="ml-1 text-lg font-bold text-green-600">
                  {importResult.success}
                </span>
              </div>
              {importResult.failed > 0 && (
                <div>
                  <span className="text-sm text-stone-500">导入失败：</span>
                  <span className="ml-1 text-lg font-bold text-red-600">
                    {importResult.failed}
                  </span>
                </div>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFile(null);
                setPreview([]);
                setImportResult(null);
              }}
            >
              继续导入
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
