'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { ChevronRight, Users } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdMember {
  username: string;
  displayName: string;
  department?: string | null;
  title?: string | null;
}

interface OrgTreeNode {
  name: string;
  dn: string;
  type: string;
  members: AdMember[];
  children: OrgTreeNode[];
  memberCount: number;
  totalCount: number;
}

interface OrgUnit {
  name: string;
  dn: string;
  path: string[];
  memberCount: number;
  members: AdMember[];
}

interface OrgData {
  domain: string;
  domains: { code: string; label: string }[];
  totalUnits: number;
  totalMembers: number;
  tree: OrgTreeNode | null;
  units: OrgUnit[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrganizationPage() {
  const { toast } = useToast();

  const [domain, setDomain] = useState('PJXZ');
  const [data, setData] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [selected, setSelected] = useState<OrgTreeNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');

  const fetchOrg = useCallback(
    async (targetDomain: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/ad/organizations?domain=${targetDomain}`);
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? '加载失败');
        setData(json.data);
        // 预设展开根节点的第一层
        const root: OrgTreeNode | null = json.data.tree;
        const init = new Set<string>();
        if (root) {
          init.add(root.dn);
          root.children.forEach((c) => init.add(c.dn));
        }
        setExpanded(init);
        setSelected(root);
      } catch (err) {
        toast(err instanceof Error ? err.message : '加载组织信息失败', 'error');
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    fetchOrg(domain);
  }, [fetchOrg, domain]);

  const toggleExpand = (dn: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dn)) next.delete(dn);
      else next.add(dn);
      return next;
    });
  };

  /** 搜寻人员：跨单位扁平比对姓名／工号 */
  const matchedMembers = useMemo(() => {
    if (!data || !keyword.trim()) return [];
    const q = keyword.trim().toLowerCase();
    return data.units
      .flatMap((u) => u.members.map((m) => ({ ...m, unit: u.name })))
      .filter(
        (m) => m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)
      )
      .slice(0, 100);
  }, [data, keyword]);

  if (forbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="组织查询" />
        <EmptyState title="无权限" description="仅人资与系统管理员可查看组织信息" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="组织查询"
        actions={
          <div className="flex gap-2">
            <div className="w-40">
              <CustomSelect
                options={(data?.domains ?? [{ code: 'PJXZ', label: '强茂徐州' }]).map((d) => ({
                  value: d.code,
                  label: d.label,
                }))}
                value={domain}
                onChange={setDomain}
              />
            </div>
            <Button variant="outline" onClick={() => fetchOrg(domain)}>
              重新整理
            </Button>
          </div>
        }
      />

      {loading ? (
        <LoadingSpinner />
      ) : !data || !data.tree ? (
        <EmptyState title="无资料" description="未取得组织信息" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {[
              { label: '网域', value: data.domain },
              { label: '单位数', value: data.totalUnits },
              { label: '人员数', value: data.totalMembers },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 shadow-sm sm:px-5 sm:py-4"
              >
                <p className="text-xs font-medium text-stone-500 sm:text-sm">{s.label}</p>
                <p className="mt-0.5 text-xl font-bold text-stone-800 sm:mt-1 sm:text-2xl">
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜寻姓名或工号"
            className="block w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 sm:max-w-md"
          />

          {/* 人员搜寻结果：固定高度，内建捲轴 */}
          {matchedMembers.length > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-stone-700">
                符合的人员（{matchedMembers.length}）
              </h3>
              <div className="max-h-72 overflow-y-auto pr-1">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {matchedMembers.map((m) => (
                    <div
                      key={`${m.unit}-${m.username}`}
                      className="rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-stone-800">{m.displayName}</p>
                      <p className="text-xs text-stone-500">
                        {m.username} · {m.unit}
                        {m.title ? ` · ${m.title}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 组织树（可展开收合）+ 成员，两栏各自内建捲轴 */}
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <div className="h-[560px] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-2 shadow-sm">
              <TreeNode
                node={data.tree}
                depth={0}
                expanded={expanded}
                selectedDn={selected?.dn ?? null}
                onToggle={toggleExpand}
                onSelect={setSelected}
              />
            </div>

            <div className="flex h-[560px] flex-col rounded-2xl border border-stone-200 bg-white shadow-sm">
              {selected ? (
                <>
                  <div className="shrink-0 border-b border-stone-100 p-4">
                    <h3 className="text-sm font-semibold text-stone-800">{selected.name}</h3>
                    <p className="mt-0.5 text-xs text-stone-400">
                      直属 {selected.memberCount} 人 · 含下级共 {selected.totalCount} 人
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {selected.members.length === 0 ? (
                      <p className="py-8 text-center text-sm text-stone-400">
                        此单位无直属人员，请展开下级单位
                      </p>
                    ) : (
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-white text-xs uppercase tracking-wider text-stone-500">
                          <tr className="border-b border-stone-200">
                            <th className="px-3 py-2">工号</th>
                            <th className="px-3 py-2">姓名</th>
                            <th className="px-3 py-2">职称</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {selected.members.map((m) => (
                            <tr key={m.username}>
                              <td className="px-3 py-2 font-mono text-xs text-stone-600">
                                {m.username}
                              </td>
                              <td className="px-3 py-2 text-stone-800">{m.displayName}</td>
                              <td className="px-3 py-2 text-stone-500">{m.title ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : (
                <p className="p-4 text-sm text-stone-400">请从左侧选择单位</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 树状节点（递归）
// ---------------------------------------------------------------------------

function TreeNode({
  node,
  depth,
  expanded,
  selectedDn,
  onToggle,
  onSelect,
}: {
  node: OrgTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedDn: string | null;
  onToggle: (dn: string) => void;
  onSelect: (node: OrgTreeNode) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.dn);
  const isSelected = selectedDn === node.dn;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 rounded-lg py-1.5 pr-2 text-sm transition-colors',
          isSelected ? 'bg-teal-50 text-teal-700' : 'hover:bg-stone-50'
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {/* 展开/收合 icon */}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.dn)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-stone-400 hover:bg-stone-200 hover:text-stone-600"
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')} />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}

        {/* 名称（点击选取） */}
        <button
          type="button"
          onClick={() => onSelect(node)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
        >
          <span className="truncate">{node.name}</span>
          {node.memberCount > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">
              <Users className="h-3 w-3" />
              {node.memberCount}
            </span>
          )}
        </button>
      </div>

      {hasChildren && isOpen && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.dn || child.name}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedDn={selectedDn}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
