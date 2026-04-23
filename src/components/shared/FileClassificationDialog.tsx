'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { FileSpreadsheet, CheckSquare, Square, Info } from 'lucide-react';

type Category = 'BASIC' | 'PROFESSIONAL';

interface Props {
  open: boolean;
  onClose: () => void;
  files: File[];
  onConfirm: (classifications: Map<string, Category>) => void;
}

const TABS = [
  { key: 'BASIC', label: '基本知识' },
  { key: 'PROFESSIONAL', label: '专业知识' },
];

/**
 * Auto-classify files based on filename keywords.
 */
function autoClassify(files: File[]): Map<string, Category> {
  const map = new Map<string, Category>();
  for (const f of files) {
    const name = f.name.toLowerCase();
    if (
      name.includes('基本') ||
      name.includes('基础') ||
      name.includes('basic')
    ) {
      map.set(f.name, 'BASIC');
    }
  }
  return map;
}

export function FileClassificationDialog({ open, onClose, files, onConfirm }: Props) {
  const [classifications, setClassifications] = useState<Map<string, Category>>(new Map());
  const [activeTab, setActiveTab] = useState<string>('BASIC');
  const [showAutoHint, setShowAutoHint] = useState(false);

  // Auto-classify on open
  useEffect(() => {
    if (open && files.length > 0) {
      const auto = autoClassify(files);
      setClassifications(auto);
      setShowAutoHint(auto.size > 0);
      setActiveTab('BASIC');
    }
  }, [open, files]);

  const stats = useMemo(() => {
    let basic = 0;
    let professional = 0;
    for (const cat of classifications.values()) {
      if (cat === 'BASIC') basic++;
      else professional++;
    }
    return { basic, professional, unclassified: files.length - basic - professional };
  }, [classifications, files.length]);

  function toggleFile(fileName: string) {
    const tabCategory = activeTab as Category;
    setClassifications((prev) => {
      const next = new Map(prev);
      if (next.get(fileName) === tabCategory) {
        // Uncheck: remove classification
        next.delete(fileName);
      } else {
        // Check: set to current tab's category
        next.set(fileName, tabCategory);
      }
      return next;
    });
  }

  function selectAllInTab() {
    const tabCategory = activeTab as Category;
    setClassifications((prev) => {
      const next = new Map(prev);
      for (const f of files) {
        // Only set files that aren't already classified to the OTHER tab
        const current = next.get(f.name);
        if (!current || current === tabCategory) {
          next.set(f.name, tabCategory);
        }
      }
      return next;
    });
  }

  function unselectAllInTab() {
    const tabCategory = activeTab as Category;
    setClassifications((prev) => {
      const next = new Map(prev);
      for (const f of files) {
        if (next.get(f.name) === tabCategory) {
          next.delete(f.name);
        }
      }
      return next;
    });
  }

  // Files visible in the current tab: those classified to this tab OR unclassified
  const visibleFiles = files.filter((f) => {
    const cat = classifications.get(f.name);
    return !cat || cat === activeTab;
  });

  const allCheckedInTab = visibleFiles.length > 0 &&
    visibleFiles.every((f) => classifications.get(f.name) === activeTab);

  const canConfirm = stats.unclassified === 0 && files.length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="文件分类"
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() => onConfirm(classifications)}
          >
            确认上传
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {showAutoHint && (
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">
              系统已根据文件名自动预分类，请检查并调整
            </p>
          </div>
        )}

        <Tabs tabs={TABS} activeKey={activeTab} onChange={setActiveTab} />

        {/* Select all / Unselect all */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-500">
            {activeTab === 'BASIC' ? '基本知识' : '专业知识'}
            <span className="ml-1">
              ({visibleFiles.filter((f) => classifications.get(f.name) === activeTab).length} / {visibleFiles.length} 个已选)
            </span>
          </span>
          <div className="flex gap-2">
            <button
              className="text-xs text-teal-600 hover:text-teal-700 font-medium"
              onClick={selectAllInTab}
            >
              全选
            </button>
            <span className="text-stone-300">|</span>
            <button
              className="text-xs text-stone-500 hover:text-stone-700 font-medium"
              onClick={unselectAllInTab}
            >
              取消全选
            </button>
          </div>
        </div>

        {/* File list */}
        <div className="space-y-1 max-h-[40vh] overflow-y-auto">
          {visibleFiles.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-6">
              所有文件已分类到另一个类别
            </p>
          ) : (
            visibleFiles.map((f) => {
              const isChecked = classifications.get(f.name) === activeTab;
              return (
                <button
                  key={f.name}
                  onClick={() => toggleFile(f.name)}
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-left hover:bg-stone-50 transition-colors"
                >
                  {isChecked ? (
                    <CheckSquare className="h-4 w-4 text-teal-600 shrink-0" />
                  ) : (
                    <Square className="h-4 w-4 text-stone-300 shrink-0" />
                  )}
                  <FileSpreadsheet className="h-4 w-4 text-stone-400 shrink-0" />
                  <span className="text-sm text-stone-700 truncate">{f.name}</span>
                  <span className="ml-auto text-xs text-stone-400 shrink-0">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 border-t border-stone-100 pt-3">
          <span className="text-xs text-stone-600">
            基本知识: <strong>{stats.basic}</strong> 个
          </span>
          <span className="text-xs text-stone-600">
            专业知识: <strong>{stats.professional}</strong> 个
          </span>
          {stats.unclassified > 0 && (
            <span className="text-xs text-amber-600 font-medium">
              未分类: {stats.unclassified} 个
            </span>
          )}
          {canConfirm && (
            <span className="text-xs text-green-600 font-medium ml-auto">
              全部已分类
            </span>
          )}
        </div>
      </div>
    </Dialog>
  );
}
