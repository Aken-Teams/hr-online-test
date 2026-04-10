'use client';

import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreviewEmployee {
  name: string;
  employeeNo: string;
  department: string;
  role: string;
  idCardLast6?: string;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function EmployeeImportPage() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Excel import
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewEmployee[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Photo upload
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);

  function handleFileSelect(selectedFile: File | null) {
    if (!selectedFile) return;
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

      const res = await fetch('/api/admin/employees/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('解析文件失败');
      const json = await res.json();
      setPreview(json.data?.employees ?? []);
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

      const res = await fetch('/api/admin/employees/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('导入失败');
      const json = await res.json();
      setImportResult({
        success: json.data?.imported ?? 0,
        failed: json.data?.failed ?? 0,
      });
      toast(`成功导入 ${json.data?.imported ?? 0} 名员工`, 'success');
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

  function handlePhotoSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const imageFiles = files.filter((f) =>
      f.type.startsWith('image/')
    );
    setPhotoFiles(imageFiles);
  }

  async function handlePhotoUpload() {
    if (photoFiles.length === 0) return;
    setPhotoUploading(true);
    setPhotoProgress(0);

    let uploaded = 0;
    for (const photo of photoFiles) {
      try {
        const formData = new FormData();
        formData.append('photo', photo);
        // Use filename (without ext) as employee identifier
        const name = photo.name.replace(/\.[^/.]+$/, '');
        formData.append('employeeNo', name);

        await fetch('/api/upload/photo', {
          method: 'POST',
          body: formData,
        });
        uploaded++;
      } catch {
        // continue uploading remaining files
      }
      setPhotoProgress(Math.round(((uploaded) / photoFiles.length) * 100));
    }

    setPhotoUploading(false);
    toast(`成功上传 ${uploaded}/${photoFiles.length} 张照片`, uploaded > 0 ? 'success' : 'error');
    setPhotoFiles([]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="批量导入员工"
        description="从 Excel 文件导入员工信息，并可批量上传照片"
        actions={
          <Button variant="ghost" onClick={() => router.push('/admin/employees')}>
            返回列表
          </Button>
        }
      />

      {/* Excel upload zone */}
      <Card title="Excel 文件导入">
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
        <Card title={`预览（共 ${preview.length} 名员工）`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>工号</TableHead>
                <TableHead>部门</TableHead>
                <TableHead>岗位</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.slice(0, 50).map((emp, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{emp.name}</TableCell>
                  <TableCell>{emp.employeeNo}</TableCell>
                  <TableCell>{emp.department}</TableCell>
                  <TableCell>{emp.role}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {preview.length > 50 && (
            <p className="mt-3 text-sm text-stone-500">
              仅显示前 50 条，共 {preview.length} 名员工
            </p>
          )}
          <div className="mt-4 flex items-center justify-end">
            <Button onClick={handleImport} loading={importing}>
              确认导入 ({preview.length} 名)
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

      {/* Photo upload */}
      <Card title="照片上传">
        <div className="space-y-4">
          <p className="text-sm text-stone-500">
            批量上传员工照片。文件名应为员工工号（例如：EMP001.jpg）。
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => photoInputRef.current?.click()}
            >
              选择照片
            </Button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoSelect}
            />
            {photoFiles.length > 0 && (
              <span className="text-sm text-stone-500">
                已选择 {photoFiles.length} 张照片
              </span>
            )}
          </div>

          {photoFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photoFiles.slice(0, 20).map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-lg bg-stone-50 px-2.5 py-1 text-xs text-stone-600"
                >
                  <svg className="h-3.5 w-3.5 text-stone-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 6v12.75A2.25 2.25 0 003.75 21z" />
                  </svg>
                  {f.name}
                </div>
              ))}
              {photoFiles.length > 20 && (
                <span className="text-xs text-stone-400">...等 {photoFiles.length - 20} 个文件</span>
              )}
            </div>
          )}

          {photoUploading && (
            <div>
              <p className="text-sm text-stone-500 mb-2">上传中...</p>
              <Progress value={photoProgress} color="teal" />
            </div>
          )}

          {photoFiles.length > 0 && !photoUploading && (
            <Button onClick={handlePhotoUpload}>
              上传照片 ({photoFiles.length} 张)
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
