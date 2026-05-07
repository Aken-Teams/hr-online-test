'use client';

import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

export interface TypeToConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  /** The exact text the user must type to enable the confirm button */
  confirmValue: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
}

export function TypeToConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmValue,
  confirmText = '确认删除',
  cancelText = '取消',
  loading = false,
}: TypeToConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');

  // Reset input when dialog opens/closes
  useEffect(() => {
    if (!open) setInputValue('');
  }, [open]);

  const isMatch = inputValue.trim() === confirmValue.trim();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            loading={loading}
            disabled={!isMatch}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{message}</p>
        <div className="space-y-2">
          <p className="text-sm text-gray-700">
            请输入 <span className="font-semibold text-red-600">{confirmValue}</span> 以确认：
          </p>
          <input
            type="text"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            placeholder={confirmValue}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
          />
        </div>
      </div>
    </Dialog>
  );
}
