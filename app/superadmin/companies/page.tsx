'use client';

import { useState, useEffect, useCallback } from 'react';
import SuperAdminLayout from '../components/SuperAdminLayout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { Search, Building2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';

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
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const limit = 50;

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

  const totalPages = Math.ceil(total / limit);
  const activePackages = packages.filter(p => p.is_active);

  return (
    <SuperAdminLayout title="Companies" subtitle={`ทั้งหมด ${total} บริษัท`}>
      <div className="space-y-4">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="ค้นหาชื่อบริษัท..."
            className="w-full pl-9 pr-3 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-violet-500 animate-spin" /></div>
        ) : companies.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">ไม่พบบริษัท</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
              <table className="w-full text-[16px]">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/80">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">บริษัท</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Owner</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Package</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">สมาชิก</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">สถานะ</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">สร้างเมื่อ</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {companies.map(c => (
                    <tr key={c.id} className="hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.logo_url ? (
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
                      </td>
                      <td className="px-4 py-3">
                        <FormSelect
                          value={c.package_id || ''}
                          onChange={val => handleChangePackage(c.id, val)}
                          options={activePackages.map(p => ({ id: p.id, label: p.name }))}
                          searchThreshold={99}
                        />
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-white">{c.member_count}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${c.is_active ? 'bg-green-900/30 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                          {c.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {new Date(c.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleActive(c.id, c.is_active)}
                          disabled={togglingId === c.id}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                            c.is_active ? 'bg-green-500' : 'bg-slate-600'
                          } ${togglingId === c.id ? 'opacity-50' : ''}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${c.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
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
                <div key={c.id} className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      {c.logo_url ? (
                        <img src={c.logo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-white">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.owner_email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleActive(c.id, c.is_active)}
                      disabled={togglingId === c.id}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                        c.is_active ? 'bg-green-500' : 'bg-slate-600'
                      } ${togglingId === c.id ? 'opacity-50' : ''}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${c.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <FormSelect
                        value={c.package_id || ''}
                        onChange={val => handleChangePackage(c.id, val)}
                        options={activePackages.map(p => ({ id: p.id, label: p.name }))}
                        searchThreshold={99}
                      />
                      <span className="text-slate-400">สมาชิก: {c.member_count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-slate-400">
                  แสดง {(page - 1) * limit + 1}-{Math.min(page * limit, total)} จาก {total}
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
    </SuperAdminLayout>
  );
}
