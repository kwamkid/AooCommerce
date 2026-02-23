// Path: app/customers/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import Checkbox from '@/components/ui/Checkbox';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import {
  UserCircle,
  Plus,
  Search,
  AlertCircle,
  Check,
  X,
  Loader2,
  Phone,
  Trash2,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';

// Column toggle system
type ColumnKey = 'customer' | 'type' | 'phone' | 'email' | 'address' | 'totalOrder' | 'orderCount' | 'branch';

const COLUMN_CONFIGS: { key: ColumnKey; label: string; defaultVisible: boolean; alwaysVisible?: boolean }[] = [
  { key: 'customer', label: 'ลูกค้า', defaultVisible: true, alwaysVisible: true },
  { key: 'type', label: 'ประเภท', defaultVisible: true },
  { key: 'phone', label: 'เบอร์โทร', defaultVisible: true },
  { key: 'email', label: 'อีเมล', defaultVisible: true },
  { key: 'address', label: 'ที่อยู่', defaultVisible: true },
  { key: 'orderCount', label: 'จำนวนบิล', defaultVisible: true },
  { key: 'totalOrder', label: 'ยอดสั่งซื้อ', defaultVisible: true },
  { key: 'branch', label: 'สาขา', defaultVisible: true },
];

const STORAGE_KEY = 'customers-visible-columns';

function getDefaultColumns(): ColumnKey[] {
  return COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key);
}

// Customer interface
interface Customer {
  id: string;
  customer_code: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  tax_address?: string;
  tax_district?: string;
  tax_amphoe?: string;
  tax_province?: string;
  tax_postal_code?: string;
  tax_id?: string;
  customer_type: string;
  customer_type_new?: string; // From database
  credit_limit: number;
  credit_days: number;
  assigned_salesperson?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Stats from API
  shipping_address_count?: number;
  default_address?: { address_line1: string; district: string; amphoe: string; province: string; postal_code: string } | null;
  line_display_name?: string | null;
  total_order_amount?: number;
  order_count?: number;
}

// Customer type config
const CUSTOMER_TYPES: Record<string, { label: string; color: string }> = {
  retail: { label: 'ลูกค้าปลีก', color: 'bg-blue-100 text-blue-800' },
  wholesale: { label: 'ลูกค้าส่ง', color: 'bg-purple-100 text-purple-800' },
  cash_dealer: { label: 'ตัวแทนฯ เงินสด', color: 'bg-green-100 text-green-800' },
  consignment_dealer: { label: 'ตัวแทนฯ ฝากขาย', color: 'bg-amber-100 text-amber-800' },
  department_store: { label: 'ห้าง/Modern Trade', color: 'bg-pink-100 text-pink-800' },
  distributor: { label: 'ตัวกระจายสินค้า', color: 'bg-teal-100 text-teal-800' },
  credit_dealer: { label: 'ตัวแทนฯ เครดิต', color: 'bg-orange-100 text-orange-800' },
  sub_dealer: { label: 'ตัวแทนย่อย', color: 'bg-indigo-100 text-indigo-800' },
  corporate: { label: 'องค์กร/B2B', color: 'bg-slate-100 text-slate-800' },
  project: { label: 'ลูกค้าโครงการ', color: 'bg-cyan-100 text-cyan-800' },
  marketplace_dealer: { label: 'ตัวแทน Marketplace', color: 'bg-violet-100 text-violet-800' },
  dropship: { label: 'Dropship', color: 'bg-sky-100 text-sky-800' },
  affiliate: { label: 'Affiliate/KOL', color: 'bg-fuchsia-100 text-fuchsia-800' },
  oem_odm: { label: 'OEM/ODM', color: 'bg-rose-100 text-rose-800' },
  regional_agent: { label: 'ตัวแทนภูมิภาค', color: 'bg-emerald-100 text-emerald-800' },
  government: { label: 'ราชการ/หน่วยงานรัฐ', color: 'bg-yellow-100 text-yellow-800' },
};

function CustomerTypeBadge({ type }: { type: string }) {
  const config = CUSTOMER_TYPES[type] || { label: type, color: 'bg-gray-100 text-gray-800' };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

export default function CustomersPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataFetched, setDataFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAmount, setFilterAmount] = useState<string>('all');
  const [filterOrderCount, setFilterOrderCount] = useState<string>('all');

  // Selection & bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
    if (selectedIds.size === 0) return;
    if (!confirm(`ลบลูกค้า ${selectedIds.size} รายการ ถาวร?\n\nที่อยู่จัดส่ง, กิจกรรม จะถูกลบ\nออเดอร์จะถูก unlink`)) return;

    setBulkDeleting(true);
    try {
      const ids = [...selectedIds].join(',');
      const res = await apiFetch(`/api/customers?ids=${ids}&hard=true`, { method: 'DELETE' });
      if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'ไม่สามารถลบได้'); }

      showToast(`ลบลูกค้า ${selectedIds.size} รายการสำเร็จ`);
      setCustomers(prev => prev.filter(c => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถลบได้', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  // Single delete handler
  const handleDeleteCustomer = async (customerId: string, customerName: string) => {
    if (!confirm(`ลบลูกค้า "${customerName}" ถาวร?`)) return;

    try {
      const res = await apiFetch(`/api/customers?id=${customerId}&hard=true`, { method: 'DELETE' });
      if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'ไม่สามารถลบได้'); }

      showToast('ลบลูกค้าสำเร็จ');
      setCustomers(prev => prev.filter(c => c.id !== customerId));
      setSelectedIds(prev => { const next = new Set(prev); next.delete(customerId); return next; });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถลบได้', 'error');
    }
  };

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchTerm, filterType, filterAmount, filterOrderCount, currentPage]);

  // Check auth
  useEffect(() => {
    if (authLoading) return;

    if (!userProfile) {
      router.push('/login');
      return;
    }

    // Check role permission
    if (!userProfile.roles?.some((r: string) => ['owner', 'admin', 'sales', 'account'].includes(r))) {
      router.push('/dashboard');
    }
  }, [userProfile, authLoading, router]);

  // Fetch customers - once when auth is ready
  useFetchOnce(async () => {
    try {
      setLoading(true);

      const customersResponse = await apiFetch('/api/customers?with_stats=true');
      const customersResult = await customersResponse.json();

      if (!customersResponse.ok) {
        throw new Error(customersResult.error || 'Failed to fetch customers');
      }

      const data = customersResult.customers || [];

      const customersWithType = data.map((customer: any) => ({
        ...customer,
        customer_type: customer.customer_type_new || customer.customer_type || 'retail'
      }));

      setCustomers(customersWithType as Customer[]);
      setDataFetched(true);
    } catch (error) {
      console.error('Error fetching customers:', error);
      setError('ไม่สามารถโหลดข้อมูลลูกค้าได้');
    } finally {
      setLoading(false);
    }
  }, !authLoading && !!userProfile);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Filter customers
  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = searchTerm === '' ||
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.customer_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'all' || customer.customer_type === filterType;

    const amt = customer.total_order_amount || 0;
    const matchesAmount = filterAmount === 'all' ||
      (filterAmount === '0' ? amt === 0 :
       filterAmount === '<10000' ? amt > 0 && amt < 10000 :
       filterAmount === '10000-50000' ? amt >= 10000 && amt <= 50000 :
       filterAmount === '50000-100000' ? amt > 50000 && amt <= 100000 :
       filterAmount === '>100000' ? amt > 100000 : true);

    const cnt = customer.order_count || 0;
    const matchesOrderCount = filterOrderCount === 'all' ||
      (filterOrderCount === '0' ? cnt === 0 :
       filterOrderCount === '1-5' ? cnt >= 1 && cnt <= 5 :
       filterOrderCount === '6-20' ? cnt >= 6 && cnt <= 20 :
       filterOrderCount === '>20' ? cnt > 20 : true);

    return matchesSearch && matchesType && matchesAmount && matchesOrderCount;
  });

  // Types that exist in customer data (for filter dropdown)
  const activeTypes = useMemo(() => {
    const types = new Set(customers.map(c => c.customer_type));
    return Object.entries(CUSTOMER_TYPES).filter(([key]) => types.has(key));
  }, [customers]);

  // Pagination
  const totalPages = Math.ceil(filteredCustomers.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedCustomers = filteredCustomers.slice(startIndex, endIndex);

  const allPageSelected = paginatedCustomers.length > 0 &&
    paginatedCustomers.every(c => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    const pageIds = paginatedCustomers.map(c => c.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
  };

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
              <UserCircle className="w-8 h-8 mr-3 text-[#F4511E]" />
              ลูกค้า
            </h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">จัดการข้อมูลลูกค้าและความสัมพันธ์</p>
          </div>

          <button
            onClick={() => router.push('/customers/new')}
            className="bg-[#F4511E] text-white px-4 py-2 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center font-medium"
          >
            <Plus className="w-5 h-5 mr-2" />
            เพิ่มลูกค้า
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Filters and Search */}
        <div className="data-filter-card">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="ค้นหาชื่อ, รหัส, เบอร์โทร..." className="py-2" />
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            >
              <option value="all">ประเภททั้งหมด</option>
              {activeTypes.map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>

            {/* Order Amount Filter */}
            <select
              value={filterAmount}
              onChange={(e) => { setFilterAmount(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            >
              <option value="all">ยอดทั้งหมด</option>
              <option value="0">ยังไม่มียอด</option>
              <option value="<10000">น้อยกว่า ฿10,000</option>
              <option value="10000-50000">฿10,000 - ฿50,000</option>
              <option value="50000-100000">฿50,000 - ฿100,000</option>
              <option value=">100000">มากกว่า ฿100,000</option>
            </select>

            {/* Order Count Filter */}
            <select
              value={filterOrderCount}
              onChange={(e) => { setFilterOrderCount(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            >
              <option value="all">จำนวนบิลทั้งหมด</option>
              <option value="0">ยังไม่มีบิล</option>
              <option value="1-5">1 - 5 บิล</option>
              <option value="6-20">6 - 20 บิล</option>
              <option value=">20">มากกว่า 20 บิล</option>
            </select>


          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
            <span className="text-sm text-red-700 dark:text-red-300 font-medium">
              เลือก {selectedIds.size} รายการ
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                {bulkDeleting ? 'กำลังลบ...' : `ลบ ${selectedIds.size} รายการ`}
              </button>
            </div>
          </div>
        )}

        {/* Customer Table */}
        <div className="data-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  <th className="w-[44px] px-3 py-3 text-center">
                    <Checkbox checked={allPageSelected} onChange={toggleSelectAll} />
                  </th>
                  {isCol('customer') && <th className="data-th min-w-[200px]">ลูกค้า</th>}
                  {isCol('type') && <th className="data-th w-[100px]">ประเภท</th>}
                  {isCol('phone') && <th className="data-th w-[110px]">เบอร์โทร</th>}
                  {isCol('email') && <th className="data-th min-w-[160px]">อีเมล</th>}
                  {isCol('address') && <th className="data-th min-w-[200px]">ที่อยู่</th>}
                  {isCol('orderCount') && <th className="data-th text-center w-[100px]">จำนวนบิล</th>}
                  {isCol('totalOrder') && <th className="data-th text-right w-[130px]">ยอดสั่งซื้อ</th>}
                  {isCol('branch') && <th className="data-th text-center w-[60px]">สาขา</th>}
                  <th className="w-[44px]"></th>
                </tr>
              </thead>
              <tbody className="data-tbody">
                {paginatedCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => router.push(`/customers/${customer.id}`)}
                    className="data-tr cursor-pointer"
                  >
                    {/* Checkbox */}
                    <td className="w-[44px] px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(customer.id)} onChange={() => toggleSelect(customer.id)} />
                    </td>

                    {/* ลูกค้า: ชื่อ (เด่น) + รหัส (จาง) */}
                    {isCol('customer') && (
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-semibold text-[15px] text-gray-900 dark:text-white">{customer.name}</div>
                        <div className="text-xs text-gray-400 dark:text-slate-500">{customer.customer_code}</div>
                      </div>
                    </td>
                    )}

                    {/* ประเภท */}
                    {isCol('type') && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      <CustomerTypeBadge type={customer.customer_type} />
                    </td>
                    )}

                    {/* เบอร์โทร - กดโทรได้ */}
                    {isCol('phone') && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      {customer.phone ? (
                        <a
                          href={`tel:${customer.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 hover:underline"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {customer.phone}
                        </a>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    )}

                    {/* อีเมล */}
                    {isCol('email') && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      {customer.email ? (
                        <span className="text-sm text-gray-700 dark:text-slate-300">{customer.email}</span>
                      ) : (
                        <span className="text-gray-300 text-sm">-</span>
                      )}
                    </td>
                    )}

                    {/* ที่อยู่ (default shipping address) */}
                    {isCol('address') && (
                    <td className="px-3 py-3">
                      {customer.default_address ? (
                        <span className="text-sm text-gray-700 dark:text-slate-300 line-clamp-1">
                          {[customer.default_address.address_line1, customer.default_address.amphoe, customer.default_address.province].filter(Boolean).join(' ')}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">-</span>
                      )}
                    </td>
                    )}


                    {/* จำนวนบิล */}
                    {isCol('orderCount') && (
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {customer.order_count && customer.order_count > 0 ? (
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{customer.order_count}</span>
                      ) : (
                        <span className="text-gray-300 text-sm">-</span>
                      )}
                    </td>
                    )}

                    {/* ยอดสั่งซื้อรวม */}
                    {isCol('totalOrder') && (
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {customer.total_order_amount && customer.total_order_amount > 0 ? (
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          ฿{formatPrice(customer.total_order_amount)}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    )}

                    {/* สาขา */}
                    {isCol('branch') && (
                    <td className="px-3 py-3 text-center">
                      {customer.shipping_address_count && customer.shipping_address_count > 0 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#F4511E]/10 text-[#F4511E] text-sm font-semibold">
                          {customer.shipping_address_count}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">-</span>
                      )}
                    </td>
                    )}

                    {/* ลบ */}
                    <td className="w-[44px] px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDeleteCustomer(customer.id, customer.name)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="ลบลูกค้า"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={filteredCustomers.length}
            startIdx={startIndex}
            endIdx={Math.min(endIndex, filteredCustomers.length)}
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
        </div>

        {/* Empty State */}
        {filteredCustomers.length === 0 && (
          <div className="text-center py-12">
            <UserCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">ไม่พบข้อมูลลูกค้า</p>
            {searchTerm && (
              <p className="text-gray-400 text-sm mt-2">ลองค้นหาด้วยคำอื่น</p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
