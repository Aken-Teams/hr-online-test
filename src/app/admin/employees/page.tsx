'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
import { Upload } from 'lucide-react';
import { useFaceAuth } from '@/hooks/useFaceAuth';
import type { EmployeeData } from '@/types/exam';

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const DEPARTMENT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d, label: d }));

export default function EmployeeListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { loadModels, computeDescriptor, modelsLoaded, modelsLoading, modelError } = useFaceAuth();

  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  // Photo upload dialog
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<EmployeeData | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [faceStatus, setFaceStatus] = useState<'idle' | 'computing' | 'success' | 'no-face' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '10');
      if (search.trim()) params.set('search', search.trim());

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
  }, [page, search, toast]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  async function handleAddEmployee() {
    if (!newEmployee.name.trim() || !newEmployee.employeeNo.trim()) {
      toast('请填写姓名和工号', 'warning');
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

  // ---------------------------------------------------------------------------
  // Photo upload + face enrollment
  // ---------------------------------------------------------------------------

  function openPhotoDialog(emp: EmployeeData) {
    setPhotoTarget(emp);
    setPhotoFile(null);
    setPhotoPreview(null);
    setFaceStatus('idle');
    setPhotoDialogOpen(true);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setFaceStatus('idle');
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  }

  async function handlePhotoUpload() {
    if (!photoFile || !photoTarget?.id) return;

    setPhotoUploading(true);
    setFaceStatus('idle');

    try {
      // Step 1: Upload photo to server
      const formData = new FormData();
      formData.append('photo', photoFile);
      formData.append('employeeId', photoTarget.id);

      const uploadRes = await fetch('/api/upload/photo', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || '上传照片失败');
      }

      toast('照片上传成功', 'success');

      // Step 2: Compute face descriptor client-side
      setFaceStatus('computing');

      // Ensure models are loaded
      if (!modelsLoaded) {
        await loadModels();
      }

      // Load the image for face detection
      const img = imgRef.current;
      if (img) {
        // Wait for image to be fully loaded
        await new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
          } else {
            img.onload = () => resolve();
          }
        });

        const descriptor = await computeDescriptor(img);

        if (descriptor) {
          // Step 3: Save face descriptor to server
          const saveRes = await fetch(`/api/admin/employees/${photoTarget.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              faceDescriptor: Array.from(descriptor),
            }),
          });

          if (saveRes.ok) {
            setFaceStatus('success');
            toast('人脸特征已录入', 'success');
          } else {
            setFaceStatus('error');
            toast('保存人脸特征失败', 'error');
          }
        } else {
          setFaceStatus('no-face');
          toast('未检测到人脸，请使用正面清晰照片', 'warning');
        }
      }

      fetchEmployees();
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
      setFaceStatus('error');
    } finally {
      setPhotoUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="员工管理"
        description="管理参加考试的员工信息"
        actions={
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => router.push('/admin/employees/import')}>
              批量导入
            </Button>
            <Button onClick={() => setAddOpen(true)}>添加员工</Button>
          </div>
        }
      />

      {/* Search */}
      <Card>
        <div className="max-w-md">
          <Input
            placeholder="搜索姓名或工号..."
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
                  className="rounded-lg border border-stone-100 bg-stone-50/50 px-3.5 py-3"
                >
                  <div className="flex items-center gap-3">
                    {emp.photoUrl ? (
                      <img
                        src={emp.photoUrl}
                        alt={emp.name}
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-medium text-stone-600">
                        {emp.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-stone-800">{emp.name}</span>
                        <Badge variant={emp.isActive ? 'success' : 'default'}>
                          {emp.isActive ? '在职' : '离职'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {emp.employeeNo} · {emp.department}{emp.role ? ` · ${emp.role}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <Badge variant={emp.hasFaceDescriptor ? 'success' : 'default'}>
                      人脸: {emp.hasFaceDescriptor ? '已录入' : '未录入'}
                    </Badge>
                    <button
                      className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                      onClick={() => openPhotoDialog(emp)}
                    >
                      <Upload className="h-3 w-3" />
                      上传照片
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>照片</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>工号</TableHead>
                    <TableHead>部门</TableHead>
                    <TableHead>岗位</TableHead>
                    <TableHead>人脸</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp) => (
                    <TableRow key={emp.id ?? emp.employeeNo}>
                      <TableCell>
                        {emp.photoUrl ? (
                          <img
                            src={emp.photoUrl}
                            alt={emp.name}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-500">
                            {emp.name.charAt(0)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell>{emp.employeeNo}</TableCell>
                      <TableCell>{emp.department}</TableCell>
                      <TableCell>{emp.role}</TableCell>
                      <TableCell>
                        <Badge variant={emp.hasFaceDescriptor ? 'success' : 'default'}>
                          {emp.hasFaceDescriptor ? '已录入' : '未录入'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={emp.isActive ? 'success' : 'default'}>
                          {emp.isActive ? '在职' : '离职'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                          onClick={() => openPhotoDialog(emp)}
                        >
                          <Upload className="h-3 w-3" />
                          上传照片
                        </button>
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
            value={newEmployee.name}
            onChange={(e) =>
              setNewEmployee((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="员工姓名"
          />
          <Input
            label="工号"
            value={newEmployee.employeeNo}
            onChange={(e) =>
              setNewEmployee((prev) => ({ ...prev, employeeNo: e.target.value }))
            }
            placeholder="员工工号"
          />
          <CustomSelect
            label="部门"
            options={DEPARTMENT_OPTIONS}
            value={newEmployee.department}
            onChange={(val) =>
              setNewEmployee((prev) => ({ ...prev, department: val }))
            }
          />
          <Input
            label="岗位"
            value={newEmployee.role}
            onChange={(e) =>
              setNewEmployee((prev) => ({ ...prev, role: e.target.value }))
            }
            placeholder="例如：仓管员"
          />
          <Input
            label="身份证后6位"
            value={newEmployee.idCardLast6}
            onChange={(e) =>
              setNewEmployee((prev) => ({ ...prev, idCardLast6: e.target.value }))
            }
            placeholder="用于登录验证（可选）"
            maxLength={6}
          />
        </div>
      </Dialog>

      {/* Photo upload + face enrollment dialog */}
      <Dialog
        open={photoDialogOpen}
        onClose={() => {
          setPhotoDialogOpen(false);
          if (photoPreview) URL.revokeObjectURL(photoPreview);
        }}
        title={`上传照片 - ${photoTarget?.name ?? ''}`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setPhotoDialogOpen(false);
                if (photoPreview) URL.revokeObjectURL(photoPreview);
              }}
              disabled={photoUploading}
            >
              关闭
            </Button>
            <Button
              onClick={handlePhotoUpload}
              loading={photoUploading}
              disabled={!photoFile}
            >
              上传并录入人脸
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-500">
            上传正面免冠照片，系统将自动提取人脸特征用于人脸识别验证。
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />

          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={photoUploading}
          >
            选择照片
          </Button>

          {photoPreview && (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={photoPreview}
                alt="预览"
                className="max-h-64 rounded-lg border border-stone-200 object-contain"
                crossOrigin="anonymous"
              />
              <p className="text-xs text-stone-400">{photoFile?.name}</p>
            </div>
          )}

          {/* Face detection status */}
          {faceStatus === 'computing' && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <p className="text-sm text-blue-700">
                {modelsLoading ? '加载人脸识别模型...' : '正在识别人脸特征...'}
              </p>
            </div>
          )}
          {faceStatus === 'success' && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm text-green-700">人脸特征录入成功</p>
            </div>
          )}
          {faceStatus === 'no-face' && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
              <p className="text-sm text-yellow-700">
                照片已上传，但未检测到人脸。请使用正面清晰照片重新上传以启用人脸验证。
              </p>
            </div>
          )}
          {faceStatus === 'error' && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">
                {modelError || '人脸特征提取失败，请重试'}
              </p>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
