'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdMember {
  username: string;
  displayName: string;
  department?: string | null;
  title?: string | null;
  jobCategory?: string | null;
  email?: string | null;
}

interface OrgUnit {
  name: string;
  dn: string;
  type: string;
  path: string[];
  memberCount: number;
  members: AdMember[];
}

interface OrgData {
  domain: string;
  domains: { code: string; label: string }[];
  totalUnits: number;
  totalMembers: number;
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
  const [selected, setSelected] = useState<OrgUnit | null>(null);
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
        setSelected(json.data.units[0] ?? null);
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

  /** 关键字同时比对单位名称、姓名、工号 */
  const filteredUnits = useMemo(() => {
    if (!data) return [];
    const q = keyword.trim().toLowerCase();
    if (!q) return data.units;
    return data.units.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.members.some(
          (m) =>
            m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)
        )
    );
  }, [data, keyword]);

  const matchedMembers = useMemo(() => {
    if (!data || !keyword.trim()) return [];
    const q = keyword.trim().toLowerCase();
    return data.units
      .flatMap((u) => u.members.map((m) => ({ ...m, unit: u.name })))
      .filter(
        (m) => m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)
      )
      .slice(0, 50);
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
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              {(data?.domains ?? [{ code: 'PJXZ', label: '强茂徐州' }]).map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => fetchOrg(domain)}>
              重新整理
            </Button>
          </div>
        }
      />

      {loading ? (
        <LoadingSpinner />
      ) : !data ? (
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
            placeholder="搜寻单位、姓名或工号"
            className="block w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 sm:max-w-md"
          />

          {/* 人员搜寻结果 */}
          {matchedMembers.length > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-stone-700">
                符合的人员（{matchedMembers.length}）
              </h3>
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
          )}

          {/* 组织树 + 成员 */}
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="max-h-[520px] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-2 shadow-sm">
              {filteredUnits.map((u) => (
                <button
                  key={u.dn || u.name}
                  type="button"
                  onClick={() => setSelected(u)}
                  className={cn(
                    'mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    selected?.dn === u.dn ? 'bg-teal-50 text-teal-700' : 'hover:bg-stone-50'
                  )}
                  style={{ paddingLeft: `${12 + Math.max(0, u.path.length - 1) * 12}px` }}
                >
                  <span className="truncate">{u.name}</span>
                  <Badge variant="default">{u.memberCount}</Badge>
                </button>
              ))}
              {filteredUnits.length === 0 && (
                <p className="px-3 py-4 text-sm text-stone-400">无符合的单位</p>
              )}
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              {selected ? (
                <>
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-stone-800">{selected.name}</h3>
                    <p className="text-xs text-stone-400">
                      {[...selected.path, selected.name].join(' / ')} · {selected.memberCount} 人
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wider text-stone-500">
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
                  </div>
                </>
              ) : (
                <p className="text-sm text-stone-400">请从左侧选择单位</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
