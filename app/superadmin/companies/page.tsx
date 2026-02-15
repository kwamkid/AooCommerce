'use client';

import { useState, useEffect, useCallback } from 'react';
import SuperAdminLayout from '../components/SuperAdminLayout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { Search, Building2, Loader2, ChevronLeft, ChevronRight, Package, X } from 'lucide-react';

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  member_count: number;
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

export default function SuperAdminCompanies() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const limit = 50;

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch packages for modal
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
  }, [page, search, showToast]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => setPage(1), 500));
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
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
    }
  };

  const openChangePackage = (company: Company) => {
    setSelectedCompany(company);
    setSelectedPackageId(company.package_id || '');
    setShowModal(true);
  };

  const handleChangePackage = async () => {
    if (!selectedCompany || !selectedPackageId) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/superadmin/companies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedCompany.id, package_id: selectedPackageId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      const data = await res.json();
      showToast(data.message || 'เปลี่ยน package สำเร็จ', 'success');
      setShowModal(false);
      fetchCompanies();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <SuperAdminLayout title="Companies" subtitle={`ทั้งหมด ${total} บริษัท`}>
      <div className="space-y-4">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="ค้นหาชื่อบริษัท..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" /></div>
        ) : companies.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400 text-sm">ไม่พบบริษัท</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">บริษัท</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Owner</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Package</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สมาชิก</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สถานะ</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สร้างเมื่อ</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {companies.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.logo_url ? (
                            <img src={c.logo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{c.name}</p>
                            <p className="text-xs text-gray-500 dark:text-slate-400">{c.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-900 dark:text-white text-sm">{c.owner_name || '-'}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{c.owner_email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openChangePackage(c)} className="group">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium cursor-pointer transition-colors ${
                            c.package_slug === 'enterprise' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                            c.package_slug === 'pro' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                            c.package_slug === 'free' ? 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300' :
                            'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
                          } group-hover:ring-2 group-hover:ring-[#F4511E]/30`}>
                            <Package className="w-3 h-3" />
                            {c.package_name}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-gray-900 dark:text-white">{c.member_count}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${c.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'}`}>
                          {c.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                        {new Date(c.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleActive(c.id, c.is_active)}
                          className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                            c.is_active
                              ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100'
                              : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100'
                          }`}
                        >
                          {c.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {companies.map(c => (
                <div key={c.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {c.logo_url ? (
                        <img src={c.logo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{c.name}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{c.owner_email}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0 ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                    <div className="flex items-center gap-3">
                      <button onClick={() => openChangePackage(c)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                        c.package_slug === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                        c.package_slug === 'pro' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        <Package className="w-3 h-3" />{c.package_name}
                      </button>
                      <span>สมาชิก: {c.member_count}</span>
                    </div>
                    <button onClick={() => toggleActive(c.id, c.is_active)} className="text-[#F4511E] font-medium">
                      {c.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  แสดง {(page - 1) * limit + 1}-{Math.min(page * limit, total)} จาก {total}
                </p>
                <div className="flex gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Change Package Modal */}
      {showModal && selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">เปลี่ยน Package</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3">
                <p className="font-medium text-gray-900 dark:text-white">{selectedCompany.name}</p>
                <p className="text-sm text-gray-500 dark:text-slate-400">Owner: {selectedCompany.owner_name || selectedCompany.owner_email}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                  Package ปัจจุบัน: <span className="font-medium">{selectedCompany.package_name}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">เลือก Package ใหม่</label>
                <div className="space-y-2">
                  {packages.filter(p => p.is_active).map(p => (
                    <label key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedPackageId === p.id
                        ? 'border-[#F4511E] bg-[#F4511E]/5'
                        : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                    }`}>
                      <input
                        type="radio"
                        name="package"
                        value={p.id}
                        checked={selectedPackageId === p.id}
                        onChange={() => setSelectedPackageId(p.id)}
                        className="accent-[#F4511E]"
                      />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{p.name}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{p.slug}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-slate-700">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleChangePackage} disabled={saving || !selectedPackageId} className="px-4 py-2 text-sm bg-[#F4511E] hover:bg-[#D63B0E] text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SuperAdminLayout>
  );
}
