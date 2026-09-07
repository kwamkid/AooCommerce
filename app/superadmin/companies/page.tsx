'use client';

// Companies = ศูนย์รวมของแต่ละธุรกิจ (แทนหน้า Users เดิมที่บอกได้แค่ "มีคนชื่อนี้อยู่")
//
// ตอบ 3 คำถามในหน้าเดียว: ใครใช้อยู่บ้าง · ร้านไหนเงียบจนน่าจะเลิกใช้แล้ว · ลบทิ้งได้หรือยัง
// กติกาลบถาวร (ตรวจซ้ำที่ API เสมอ): ปิดบริษัทครบ 30 วัน **หรือ** เป็นบริษัทที่ไม่มีข้อมูลเลย

import { Fragment, useState, useEffect, useCallback } from 'react';
import SuperAdminLayout from '../components/SuperAdminLayout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  Search, Building2, ChevronLeft, ChevronRight, ChevronDown,
  Trash2, AlertTriangle, Store, MessageSquare,
} from 'lucide-react';
import { LoadingCard } from '@/components/ui/StateCard';
import FormSelect from '@/components/ui/FormSelect';
import FormInput from '@/components/ui/FormInput';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import FilterChips from '@/components/ui/FilterChips';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { formatThaiDate, formatThaiDateTime, formatNumber } from '@/lib/utils/format';
import { mainRoleOf, ROLE_LEVELS } from '@/lib/permissions';

interface MemberItem {
  user_id: string;
  name: string | null;
  email: string | null;
  roles: string[] | null;
  is_active: boolean;
  last_sign_in_at: string | null;
}

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  deactivated_at: string | null;
  created_at: string;
  member_count: number;
  members_list: MemberItem[];
  orders: number;
  products: number;
  customers: number;
  shops: number;
  chat_channels: number;
  last_activity: string | null;
  last_login: string | null;
  last_order: string | null;
  last_chat: string | null;
  is_empty: boolean;
  quiet_days: number | null;
  is_quiet: boolean;
  can_purge: boolean;
  purge_available_at: string | null;
  owner_name: string;
  owner_email: string;
  package_id: string | null;
  package_name: string;
  package_slug: string;
}

interface PackageOption {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

type FilterKey = 'all' | 'quiet' | 'inactive';

const FILTER_CHIPS: { id: FilterKey; label: string; activeClass: string }[] = [
  { id: 'all', label: 'ทั้งหมด', activeClass: 'border-violet-500 text-violet-300 bg-violet-500/10' },
  { id: 'quiet', label: 'เงียบเกิน 30 วัน', activeClass: 'border-amber-500 text-amber-300 bg-amber-500/10' },
  { id: 'inactive', label: 'ปิดแล้ว', activeClass: 'border-slate-400 text-slate-200 bg-slate-500/20' },
];

const ROLE_LABEL = new Map(ROLE_LEVELS.map(r => [r.key, r.label]));

/** "วันนี้" / "3 วันก่อน" — ระยะเวลาอ่านง่ายกว่าวันที่เต็มเมื่อสิ่งที่ถามคือ "เงียบไปนานแค่ไหน" */
function relativeDays(days: number | null): string {
  if (days === null) return '-';
  if (days <= 0) return 'วันนี้';
  if (days === 1) return 'เมื่อวาน';
  return `${formatNumber(days)} วันก่อน`;
}

export default function SuperAdminCompanies() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const debouncedResetPage = useDebouncedCallback(() => setPage(1), 500);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Company | null>(null);
  const [purgeName, setPurgeName] = useState('');
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const limit = 50;

  // ตัวเฝ้าลิงก์มาที่นี่พร้อม ?filter=quiet — อ่านจาก location ตรง ๆ เพื่อไม่ต้องห่อ Suspense
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('filter');
    if (q === 'quiet' || q === 'inactive' || q === 'all') setFilter(q);
  }, []);

  useEffect(() => {
    const fetchPkgs = async () => {
      try {
        const res = await apiFetch('/api/superadmin/packages');
        if (res.ok) {
          const data = await res.json();
          setPackages(data.packages || []);
        }
      } catch { /* silent */ }
    };
    fetchPkgs();
  }, []);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      params.set('filter', filter);
      if (search) params.set('search', search);

      const res = await apiFetch(`/api/superadmin/companies?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCompanies(data.companies || []);
      setTotal(data.total || 0);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, filter, showToast]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const handleSearch = (val: string) => {
    setSearch(val);
    debouncedResetPage();
  };

  const handleFilter = (val: FilterKey) => {
    setFilter(val);
    setPage(1);
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    setTogglingId(id);
    try {
      const res = await apiFetch('/api/superadmin/companies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentActive }),
      });
      if (!res.ok) throw new Error();
      showToast(currentActive ? 'ปิดการใช้งานแล้ว' : 'เปิดการใช้งานแล้ว', 'success');
      fetchCompanies();
    } catch {
      showToast('อัปเดตไม่สำเร็จ', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleChangePackage = async (companyId: string, packageId: string) => {
    try {
      const res = await apiFetch('/api/superadmin/companies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: companyId, package_id: packageId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      showToast('เปลี่ยน package สำเร็จ', 'success');
      fetchCompanies();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ', 'error');
    }
  };

  const openPurge = (c: Company) => {
    setPurgeTarget(c);
    setPurgeName('');
    setPurgeError(null);
  };

  const doPurge = async () => {
    if (!purgeTarget) return;
    setPurging(true);
    setPurgeError(null);
    try {
      const res = await apiFetch('/api/superadmin/companies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: purgeTarget.id, confirm_name: purgeName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
      showToast(data.message || 'ลบบริษัทถาวรแล้ว', 'success');
      setPurgeTarget(null);
      fetchCompanies();
    } catch (error) {
      setPurgeError(error instanceof Error ? error.message : 'ลบไม่สำเร็จ');
    } finally {
      setPurging(false);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const activePackages = packages.filter(p => p.is_active);

  /** ป้ายบอกความเคลื่อนไหว — ร้านที่เงียบต้องสะดุดตาโดยไม่ต้องอ่านตัวเลข */
  const activityCell = (c: Company) => (
    <div className="flex flex-col gap-1">
      <span className="text-slate-300">{relativeDays(c.quiet_days)}</span>
      {c.is_quiet && (
        <span className="inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/30 text-amber-300">
          <AlertTriangle className="w-3 h-3" />
          เงียบ {formatNumber(c.quiet_days || 0)} วัน
        </span>
      )}
    </div>
  );

  /** สถานะ + เงื่อนไขลบถาวร (บอกวันที่ครบกำหนด ไม่ใช่แค่ "ยังลบไม่ได้") */
  const statusNote = (c: Company) => {
    if (c.is_active) {
      return c.is_empty
        ? <p className="text-xs text-slate-500 mt-1">ไม่มีข้อมูล ลบได้ทันที</p>
        : null;
    }
    return (
      <p className="text-xs text-slate-500 mt-1">
        ปิดเมื่อ {formatThaiDate(c.deactivated_at)}
        {' · '}
        {c.can_purge ? 'ลบถาวรได้แล้ว' : `ลบถาวรได้ ${formatThaiDate(c.purge_available_at)}`}
      </p>
    );
  };

  const memberRows = (c: Company) => (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 divide-y divide-slate-700/40">
      {c.members_list.length === 0 ? (
        <p className="px-4 py-3 text-slate-400">ยังไม่มีสมาชิก</p>
      ) : c.members_list.map(m => (
        <div key={m.user_id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 ${m.is_active ? '' : 'opacity-50'}`}>
          <span className="text-white min-w-[10rem]">{m.name || '(ไม่มีชื่อ)'}</span>
          <span className="text-slate-400 min-w-[14rem]">{m.email || '-'}</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-200">
            {ROLE_LABEL.get(mainRoleOf(m.roles)) || mainRoleOf(m.roles)}
          </span>
          <span className="text-slate-400 text-sm">
            เข้าใช้ล่าสุด {m.last_sign_in_at ? formatThaiDateTime(m.last_sign_in_at) : 'ไม่เคย'}
          </span>
          {!m.is_active && <span className="text-xs text-slate-500">(ปิดใช้งาน)</span>}
        </div>
      ))}
    </div>
  );

  const activeSwitch = (c: Company) => (
    <button
      onClick={() => toggleActive(c.id, c.is_active)}
      disabled={togglingId === c.id}
      aria-label={c.is_active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:ring-offset-2 focus:ring-offset-slate-800 ${
        c.is_active ? 'bg-green-500' : 'bg-slate-600'
      } ${togglingId === c.id ? 'opacity-50' : ''}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${c.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );

  return (
    <SuperAdminLayout title="Companies" subtitle={`ทั้งหมด ${formatNumber(total)} บริษัท`}>
      <div className="space-y-4">
        {/* Search + filter */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="ค้นหาชื่อบริษัท..."
              className="w-full pl-9 pr-3 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <FilterChips chips={FILTER_CHIPS} value={filter} onChange={handleFilter} />
        </div>

        {loading ? (
          <LoadingCard />
        ) : companies.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">ไม่พบบริษัท</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-x-auto">
              <table className="w-full text-[16px]">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/80">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">บริษัท</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">เจ้าของ</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Package</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">สมาชิก</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">ร้าน / แชท</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">ออเดอร์</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">ความเคลื่อนไหวล่าสุด</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">สถานะ</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">การกระทำ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {companies.map(c => (
                    <Fragment key={c.id}>
                      <tr className="hover:bg-slate-700/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {c.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.logo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                                <Building2 className="w-4 h-4 text-slate-400" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-white">{c.name}</p>
                              <p className="text-xs text-slate-400">{c.slug}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-white">{c.owner_name || '-'}</p>
                          <p className="text-xs text-slate-400">{c.owner_email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <FormSelect
                            value={c.package_id || ''}
                            onChange={val => handleChangePackage(c.id, val)}
                            options={activePackages.map(p => ({ id: p.id, label: p.name }))}
                            searchThreshold={99}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                            className="inline-flex items-center gap-1 font-medium text-white hover:text-violet-300 transition-colors"
                          >
                            {formatNumber(c.member_count)}
                            <ChevronDown className={`w-4 h-4 transition-transform ${expandedId === c.id ? 'rotate-180' : ''}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-300">
                          <span className="inline-flex items-center gap-1"><Store className="w-3.5 h-3.5 text-slate-500" />{formatNumber(c.shops)}</span>
                          <span className="mx-1.5 text-slate-600">·</span>
                          <span className="inline-flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5 text-slate-500" />{formatNumber(c.chat_channels)}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-300">{formatNumber(c.orders)}</td>
                        <td className="px-4 py-3">{activityCell(c)}</td>
                        <td className="px-4 py-3 text-center">
                          {activeSwitch(c)}
                          {statusNote(c)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c.can_purge ? (
                            <button
                              onClick={() => openPurge(c)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-900/30 text-red-300 hover:bg-red-900/50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              ลบถาวร
                            </button>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                      {expandedId === c.id && (
                        <tr className="bg-slate-900/30">
                          <td colSpan={9} className="px-4 py-3">{memberRows(c)}</td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {companies.map(c => (
                <div key={c.id} className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {c.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.logo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate">{c.name}</p>
                        <p className="text-xs text-slate-400 truncate">{c.owner_email || c.slug}</p>
                      </div>
                    </div>
                    {activeSwitch(c)}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
                    <span>สมาชิก {formatNumber(c.member_count)}</span>
                    <span>ร้าน {formatNumber(c.shops)}</span>
                    <span>แชท {formatNumber(c.chat_channels)}</span>
                    <span>ออเดอร์ {formatNumber(c.orders)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      {activityCell(c)}
                      {statusNote(c)}
                    </div>
                    <button
                      onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                      className="text-sm text-violet-300 hover:text-violet-200"
                    >
                      {expandedId === c.id ? 'ซ่อนสมาชิก' : 'ดูสมาชิก'}
                    </button>
                  </div>

                  {expandedId === c.id && memberRows(c)}

                  <div className="flex items-center justify-between gap-3">
                    <FormSelect
                      value={c.package_id || ''}
                      onChange={val => handleChangePackage(c.id, val)}
                      options={activePackages.map(p => ({ id: p.id, label: p.name }))}
                      searchThreshold={99}
                    />
                    {c.can_purge && (
                      <button
                        onClick={() => openPurge(c)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-900/30 text-red-300 hover:bg-red-900/50 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                        ลบถาวร
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-slate-400">
                  แสดง {(page - 1) * limit + 1}-{Math.min(page * limit, total)} จาก {formatNumber(total)}
                </p>
                <div className="flex gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 border border-slate-600 rounded-lg disabled:opacity-50 text-slate-300 hover:bg-slate-700">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 border border-slate-600 rounded-lg disabled:opacity-50 text-slate-300 hover:bg-slate-700">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ลบถาวร — ต้องพิมพ์ชื่อบริษัทให้ตรงก่อนปุ่มแดงจะกดได้ */}
      <Modal
        open={!!purgeTarget}
        onClose={() => !purging && setPurgeTarget(null)}
        size="lg"
        icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
        title="ลบบริษัทถาวร"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="secondary" onClick={() => setPurgeTarget(null)} disabled={purging}>ยกเลิก</Button>
            <Button
              variant="danger"
              loading={purging}
              disabled={purgeName !== purgeTarget?.name}
              onClick={doPurge}
            >
              ลบถาวร
            </Button>
          </div>
        }
      >
        {purgeTarget && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-gray-700 dark:text-slate-300">
              กำลังจะลบ <span className="font-semibold text-gray-900 dark:text-white">{purgeTarget.name}</span> ออกจากระบบถาวร
              — <span className="text-red-500 font-medium">กู้คืนไม่ได้</span>
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'ออเดอร์', value: purgeTarget.orders },
                { label: 'สินค้า', value: purgeTarget.products },
                { label: 'ลูกค้า', value: purgeTarget.customers },
                { label: 'สมาชิก', value: purgeTarget.member_count },
              ].map(item => (
                <div key={item.label} className="rounded-lg bg-gray-100 dark:bg-slate-900/50 px-3 py-2">
                  <p className="text-xs text-gray-500 dark:text-slate-400">{item.label}</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatNumber(item.value)}</p>
                </div>
              ))}
            </div>

            <p className="text-sm text-gray-500 dark:text-slate-400">
              ข้อมูลทุกตารางที่ผูกกับบริษัทนี้ รวมถึงไฟล์รูป/สลิปในสตอเรจ จะถูกลบไปด้วย
            </p>

            <FormInput
              label={`พิมพ์ "${purgeTarget.name}" เพื่อยืนยัน`}
              value={purgeName}
              onChange={e => setPurgeName(e.target.value)}
              placeholder={purgeTarget.name}
              autoComplete="off"
            />

            {purgeError && (
              <p className="text-sm text-red-500">{purgeError}</p>
            )}
          </div>
        )}
      </Modal>
    </SuperAdminLayout>
  );
}
