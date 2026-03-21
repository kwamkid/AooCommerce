// Path: app/settings/suppliers/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import Checkbox from '@/components/ui/Checkbox';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import {
  Factory,
  Plus,
  Loader2,
  Phone,
  Trash2,
  Copy,
  ExternalLink,
  RefreshCw,
  Clock,
  KeyRound,
} from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';
import ActionMenu, { type ActionItem } from '@/app/orders/components/ActionMenu';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getBankByCode } from '@/lib/constants/banks';

// Column toggle system
type ColumnKey = 'name' | 'type' | 'contact' | 'phone' | 'email' | 'bank';

const COLUMN_CONFIGS: { key: ColumnKey; label: string; defaultVisible: boolean; alwaysVisible?: boolean }[] = [
  { key: 'name', label: 'ซัพพลายเออร์', defaultVisible: true, alwaysVisible: true },
  { key: 'type', label: 'ประเภท', defaultVisible: true },
  { key: 'contact', label: 'ผู้ติดต่อ', defaultVisible: true },
  { key: 'phone', label: 'เบอร์โทร', defaultVisible: true },
  { key: 'email', label: 'อีเมล', defaultVisible: true },
  { key: 'bank', label: 'ธนาคาร', defaultVisible: true },
];

const STORAGE_KEY = 'suppliers-visible-columns';

function getDefaultColumns(): ColumnKey[] {
  return COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key);
}

interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  supplier_type: 'cash' | 'credit' | 'consignment';
  payment_terms: number;
  bank_code: string | null;
  bank_name: string | null;
  bank_account: string | null;
  notes: string | null;
  access_code: string | null;
  portal_enabled: boolean;
  portal_enabled_at: string | null;
}

const SUPPLIER_TYPES: Record<string, { label: string; color: string }> = {
  cash: { label: 'Cash', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  credit: { label: 'Credit', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  consignment: { label: 'ฝากขาย', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
};

function SupplierTypeBadge({ type }: { type: string }) {
  const config = SUPPLIER_TYPES[type] || { label: type, color: 'bg-gray-100 text-gray-800' };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

export default function SuppliersPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { features } = useFeatures();
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('');

  // Selection & bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Confirm dialogs
  const [regenerateTarget, setRegenerateTarget] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try { return new Set(JSON.parse(stored) as ColumnKey[]); } catch { /* use defaults */ }
      }
    }
    return new Set(getDefaultColumns());
  });

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const isCol = (key: ColumnKey) => visibleColumns.has(key);

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      for (const id of selectedIds) {
        const res = await apiFetch(`/api/suppliers?id=${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('ไม่สามารถลบได้');
      }
      showToast(`ลบซัพพลายเออร์ ${selectedIds.size} รายการสำเร็จ`);
      setSuppliers(prev => prev.filter(s => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถลบได้', 'error');
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  };

  // Single delete handler
  const handleDelete = async (id: string) => {
    try {
      const res = await apiFetch(`/api/suppliers?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('ลบสำเร็จ');
      setSuppliers(prev => prev.filter(s => s.id !== id));
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    } catch {
      showToast('ลบไม่สำเร็จ', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Portal helpers
  const handleRegenerateCode = async (supplier: Supplier) => {
    try {
      const res = await apiFetch(`/api/suppliers/${supplier.id}/regenerate-code`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const newCode = data.data?.access_code || data.access_code;
      if (newCode) navigator.clipboard.writeText(newCode);
      showToast(newCode ? `สร้างรหัสใหม่สำเร็จ — คัดลอก ${newCode} แล้ว` : 'สร้างรหัสใหม่สำเร็จ');
      setSuppliers(prev => prev.map(s => s.id === supplier.id ? { ...s, access_code: newCode, portal_enabled: true, portal_enabled_at: data.data?.portal_enabled_at || new Date().toISOString() } : s));
    } catch {
      showToast('สร้างรหัสไม่สำเร็จ', 'error');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    showToast('คัดลอกรหัสแล้ว');
  };

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchTerm, filterType, currentPage]);

  // Feature gate
  useEffect(() => {
    if (features && !features.supplier) {
      router.replace('/inventory/receives');
    }
  }, [features, router]);

  // Fetch suppliers
  useFetchOnce(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/suppliers');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSuppliers(data.data || []);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, !authLoading && !!userProfile);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Filter suppliers
  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = searchTerm === '' ||
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === '' || supplier.supplier_type === filterType;

    return matchesSearch && matchesType;
  });

  // Types that exist
  const activeTypes = useMemo(() => {
    const types = new Set(suppliers.map(s => s.supplier_type));
    return Object.entries(SUPPLIER_TYPES).filter(([key]) => types.has(key as Supplier['supplier_type']));
  }, [suppliers]);

  // Pagination
  const totalPages = Math.ceil(filteredSuppliers.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedSuppliers = filteredSuppliers.slice(startIndex, endIndex);

  const allPageSelected = paginatedSuppliers.length > 0 &&
    paginatedSuppliers.every(s => selectedIds.has(s.id));

  const toggleSelectAll = () => {
    const pageIds = paginatedSuppliers.map(s => s.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
  };

  // Admin guard
  if (userProfile && !userProfile.roles?.includes('admin') && !userProfile.roles?.includes('owner')) {
    return (
      <Layout>
        <div className="text-center py-16 text-gray-500 dark:text-slate-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Layout>
    );
  }

  if (!features.supplier) return null;

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
              <Factory className="w-8 h-8 mr-3 text-[#F4511E]" />
              ซัพพลายเออร์
            </h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">จัดการข้อมูลซัพพลายเออร์และผู้จัดจำหน่าย</p>
          </div>

          <button
            onClick={() => router.push('/settings/suppliers/new')}
            className="bg-[#F4511E] text-white px-4 py-2 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center font-medium"
          >
            <Plus className="w-5 h-5 mr-2" />
            เพิ่ม<span className="hidden md:inline">ซัพพลายเออร์</span>
          </button>
        </div>

        {/* Filters and Search */}
        <div className="data-filter-card">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="ค้นหาชื่อ, ผู้ติดต่อ, เบอร์โทร..." className="py-2" />
            </div>

            <div className="w-44">
              <FormSelect
                value={filterType}
                onChange={value => { setFilterType(value); setCurrentPage(1); }}
                options={activeTypes.map(([key, { label }]) => ({ id: key, label }))}
                clearLabel="ประเภททั้งหมด"
                searchThreshold={99}
              />
            </div>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 shadow-lg px-6 py-3">
            <div className="max-w-screen-xl mx-auto flex items-center justify-between">
              <button onClick={() => setSelectedIds(new Set())} className="text-sm text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
                clear all
              </button>
              <button
                onClick={() => setBulkDeleteOpen(true)}
                disabled={bulkDeleting}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {bulkDeleting ? 'กำลังลบ...' : `ลบ ${selectedIds.size} รายการ`}
              </button>
            </div>
          </div>
        )}

        {/* Supplier Table */}
        <div className="data-table-wrap hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  <th className="w-[44px] px-3 py-3 text-center">
                    <Checkbox checked={allPageSelected} onChange={toggleSelectAll} />
                  </th>
                  {isCol('name') && <th className="data-th min-w-[200px]">ซัพพลายเออร์</th>}
                  {isCol('type') && <th className="data-th w-[100px]">ประเภท</th>}
                  {isCol('contact') && <th className="data-th min-w-[130px]">ผู้ติดต่อ</th>}
                  {isCol('phone') && <th className="data-th w-[120px]">เบอร์โทร</th>}
                  {isCol('email') && <th className="data-th min-w-[160px]">อีเมล</th>}
                  {isCol('bank') && <th className="data-th min-w-[150px]">ธนาคาร</th>}
                  <th className="w-[44px]"></th>
                </tr>
              </thead>
              <tbody className="data-tbody">
                {paginatedSuppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    onClick={() => router.push(`/settings/suppliers/${supplier.id}/edit`)}
                    className="data-tr cursor-pointer"
                  >
                    <td className="w-[44px] px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(supplier.id)} onChange={() => toggleSelect(supplier.id)} />
                    </td>

                    {isCol('name') && (
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[16px] text-gray-900 dark:text-white">{supplier.name}</div>
                      {supplier.address && <div className="data-muted text-gray-400 dark:text-slate-500 line-clamp-1">{supplier.address}</div>}
                    </td>
                    )}

                    {isCol('type') && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      <SupplierTypeBadge type={supplier.supplier_type} />
                    </td>
                    )}

                    {isCol('contact') && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="data-text text-gray-700 dark:text-slate-300">{supplier.contact_name || '-'}</span>
                    </td>
                    )}

                    {isCol('phone') && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      {supplier.phone ? (
                        <a href={`tel:${supplier.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                          <Phone className="w-3.5 h-3.5" />{supplier.phone}
                        </a>
                      ) : <span className="data-muted text-gray-400 dark:text-slate-500">-</span>}
                    </td>
                    )}

                    {isCol('email') && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="data-text text-gray-700 dark:text-slate-300">{supplier.email || '-'}</span>
                    </td>
                    )}

                    {isCol('bank') && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      {supplier.bank_name ? (() => {
                        const bank = supplier.bank_code ? getBankByCode(supplier.bank_code) : null;
                        return (
                          <div className="flex items-center gap-2">
                            {bank && (bank.logo ? (
                              <img src={bank.logo} alt="" className="w-5 h-5 rounded-full flex-shrink-0 object-contain" />
                            ) : (
                              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[8px] font-bold" style={{ backgroundColor: bank.color }}>
                                {bank.code.slice(0, 2)}
                              </div>
                            ))}
                            <span className="data-text text-gray-700 dark:text-slate-300">{supplier.bank_name} {supplier.bank_account ? `(${supplier.bank_account})` : ''}</span>
                          </div>
                        );
                      })() : <span className="data-muted text-gray-400 dark:text-slate-500">-</span>}
                    </td>
                    )}

                    <td className="w-[44px] px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu items={(() => {
                        const items: ActionItem[] = [];
                        if (supplier.access_code) {
                          items.push({
                            key: 'portal',
                            label: 'ลิงก์ซัพออนไลน์',
                            icon: <ExternalLink className="w-4 h-4" />,
                            onClick: () => window.open(`/supplier-portal/${supplier.id}`, '_blank'),
                          });
                          items.push({
                            key: 'copy-link',
                            label: 'คัดลอกลิงก์',
                            icon: <Copy className="w-4 h-4" />,
                            onClick: () => { navigator.clipboard.writeText(`${window.location.origin}/supplier-portal/${supplier.id}`).then(() => showToast('คัดลอกลิงก์แล้ว')); },
                          });
                          items.push({
                            key: 'copy-code',
                            label: `รหัส: ${supplier.access_code}`,
                            icon: <KeyRound className="w-4 h-4" />,
                            onClick: () => copyCode(supplier.access_code!),
                            suffix: <Copy className="w-3.5 h-3.5 text-gray-400" />,
                          });
                          items.push({
                            key: 'regenerate',
                            label: 'สร้างรหัสใหม่',
                            icon: <RefreshCw className="w-4 h-4" />,
                            onClick: () => setRegenerateTarget(supplier),
                          });
                          if (supplier.portal_enabled_at) {
                            items.push({
                              key: 'portal-date',
                              label: `เปิด Portal เมื่อ ${new Date(supplier.portal_enabled_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} ${new Date(supplier.portal_enabled_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`,
                              icon: <Clock className="w-4 h-4" />,
                              disabled: true,
                              dividerBefore: true,
                            });
                          }
                        } else {
                          items.push({
                            key: 'enable-portal',
                            label: 'เปิด Portal',
                            icon: <ExternalLink className="w-4 h-4" />,
                            onClick: () => handleRegenerateCode(supplier),
                          });
                        }
                        items.push({
                          key: 'delete',
                          label: 'ลบ',
                          icon: <Trash2 className="w-4 h-4" />,
                          onClick: () => setDeleteTarget({ id: supplier.id, name: supplier.name }),
                          danger: true,
                          dividerBefore: true,
                        });
                        return items;
                      })()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={filteredSuppliers.length}
          startIdx={startIndex}
          endIdx={Math.min(endIndex, filteredSuppliers.length)}
          recordsPerPage={rowsPerPage}
          setRecordsPerPage={setRowsPerPage}
          setPage={setCurrentPage}
        >
          <ColumnSettingsDropdown
            configs={COLUMN_CONFIGS}
            visible={visibleColumns}
            toggle={toggleColumn}
            buttonClassName="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
            dropUp
          />
        </Pagination>

        {/* Mobile Cards */}
        <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          {paginatedSuppliers.length === 0 ? (
            <div className="text-center py-16">
              <Factory className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-slate-400 text-sm">ไม่พบซัพพลายเออร์</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {paginatedSuppliers.map(supplier => (
                <div
                  key={supplier.id}
                  className="p-4 cursor-pointer active:bg-gray-50 dark:active:bg-slate-700/50"
                  onClick={() => router.push(`/settings/suppliers/${supplier.id}/edit`)}
                >
                  {/* Row 1: Name + Type + Menu */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-[15px] truncate">{supplier.name}</p>
                      {supplier.address && <p className="text-sm text-gray-400 dark:text-slate-500 truncate">{supplier.address}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <SupplierTypeBadge type={supplier.supplier_type} />
                      <div onClick={e => e.stopPropagation()}>
                        <ActionMenu items={(() => {
                          const items: ActionItem[] = [];
                          if (supplier.access_code) {
                            items.push({
                              key: 'portal',
                              label: 'ลิงก์ซัพออนไลน์',
                              icon: <ExternalLink className="w-4 h-4" />,
                              onClick: () => window.open(`/supplier-portal/${supplier.id}`, '_blank'),
                            });
                            items.push({
                              key: 'copy-link',
                              label: 'คัดลอกลิงก์',
                              icon: <Copy className="w-4 h-4" />,
                              onClick: () => { navigator.clipboard.writeText(`${window.location.origin}/supplier-portal/${supplier.id}`).then(() => showToast('คัดลอกลิงก์แล้ว')); },
                            });
                            items.push({
                              key: 'copy-code',
                              label: `รหัส: ${supplier.access_code}`,
                              icon: <KeyRound className="w-4 h-4" />,
                              onClick: () => copyCode(supplier.access_code!),
                              suffix: <Copy className="w-3.5 h-3.5 text-gray-400" />,
                            });
                            items.push({
                              key: 'regenerate',
                              label: 'สร้างรหัสใหม่',
                              icon: <RefreshCw className="w-4 h-4" />,
                              onClick: () => setRegenerateTarget(supplier),
                            });
                            if (supplier.portal_enabled_at) {
                              items.push({
                                key: 'portal-date',
                                label: `เปิด Portal เมื่อ ${new Date(supplier.portal_enabled_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} ${new Date(supplier.portal_enabled_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`,
                                icon: <Clock className="w-4 h-4" />,
                                disabled: true,
                                dividerBefore: true,
                              });
                            }
                          } else {
                            items.push({
                              key: 'enable-portal',
                              label: 'เปิด Portal',
                              icon: <ExternalLink className="w-4 h-4" />,
                              onClick: () => handleRegenerateCode(supplier),
                            });
                          }
                          items.push({
                            key: 'delete',
                            label: 'ลบ',
                            icon: <Trash2 className="w-4 h-4" />,
                            onClick: () => setDeleteTarget({ id: supplier.id, name: supplier.name }),
                            danger: true,
                            dividerBefore: true,
                          });
                          return items;
                        })()} />
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Contact + Phone */}
                  <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-slate-400">
                    {supplier.contact_name && <span>{supplier.contact_name}</span>}
                    {supplier.phone && (
                      <a href={`tel:${supplier.phone}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-blue-600">
                        <Phone className="w-3 h-3" />{supplier.phone}
                      </a>
                    )}
                  </div>

                  {/* Row 3: Email + Bank */}
                  <div className="flex items-center justify-between mt-1 text-sm">
                    {supplier.email && <span className="text-gray-400 dark:text-slate-500">{supplier.email}</span>}
                    {supplier.bank_name && (() => {
                      const bank = supplier.bank_code ? getBankByCode(supplier.bank_code) : null;
                      return (
                        <div className="flex items-center gap-1.5">
                          {bank && (bank.logo ? (
                            <img src={bank.logo} alt="" className="w-4 h-4 rounded-full object-contain" />
                          ) : (
                            <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold" style={{ backgroundColor: bank.color }}>
                              {bank.code.slice(0, 2)}
                            </div>
                          ))}
                          <span className="text-gray-500 dark:text-slate-400 text-xs">{supplier.bank_name}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={filteredSuppliers.length}
            startIdx={startIndex}
            endIdx={Math.min(endIndex, filteredSuppliers.length)}
            recordsPerPage={rowsPerPage}
            setRecordsPerPage={setRowsPerPage}
            setPage={setCurrentPage}
          />
        </div>

        {/* Confirm Dialogs */}
        <ConfirmDialog
          open={!!regenerateTarget}
          onClose={() => setRegenerateTarget(null)}
          onConfirm={() => { if (regenerateTarget) handleRegenerateCode(regenerateTarget); setRegenerateTarget(null); }}
          icon={<RefreshCw className="w-6 h-6 text-[#F4511E]" />}
          title="สร้างรหัส Portal ใหม่?"
          description="รหัสเดิมจะถูกยกเลิกทันที ซัพพลายเออร์ต้องใช้รหัสใหม่ในการเข้า Portal"
          confirmLabel="สร้างรหัสใหม่"
          confirmIcon={<RefreshCw className="w-4 h-4" />}
        />

        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget.id); }}
          icon={<Trash2 className="w-6 h-6 text-red-600" />}
          title={`ลบ "${deleteTarget?.name}"?`}
          description="การลบจะไม่สามารถกู้คืนได้"
          variant="danger"
          confirmLabel="ลบ"
          confirmIcon={<Trash2 className="w-4 h-4" />}
        />

        <ConfirmDialog
          open={bulkDeleteOpen}
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={handleBulkDelete}
          icon={<Trash2 className="w-6 h-6 text-red-600" />}
          title={`ลบซัพพลายเออร์ ${selectedIds.size} รายการ?`}
          description="การลบจะไม่สามารถกู้คืนได้"
          variant="danger"
          confirmLabel={bulkDeleting ? 'กำลังลบ...' : 'ลบทั้งหมด'}
          confirmIcon={<Trash2 className="w-4 h-4" />}
        />

        {/* Empty State */}
        {filteredSuppliers.length === 0 && !loading && (
          <div className="text-center py-12 hidden md:block">
            <Factory className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">ไม่พบซัพพลายเออร์</p>
            {searchTerm ? (
              <p className="text-gray-400 text-sm mt-2">ลองค้นหาด้วยคำอื่น</p>
            ) : (
              <button onClick={() => router.push('/settings/suppliers/new')} className="mt-3 text-sm text-[#F4511E] hover:underline">
                เพิ่มซัพพลายเออร์ตัวแรก
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
