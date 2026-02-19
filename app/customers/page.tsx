// Path: app/customers/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
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
  MessageCircle,
  Eye,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';

// Column toggle system
type ColumnKey = 'customer' | 'type' | 'phone' | 'line' | 'totalOrder' | 'branch' | 'status';

const COLUMN_CONFIGS: { key: ColumnKey; label: string; defaultVisible: boolean; alwaysVisible?: boolean }[] = [
  { key: 'customer', label: 'ลูกค้า', defaultVisible: true, alwaysVisible: true },
  { key: 'type', label: 'ประเภท', defaultVisible: true },
  { key: 'phone', label: 'เบอร์โทร', defaultVisible: true },
  { key: 'line', label: 'LINE', defaultVisible: true },
  { key: 'totalOrder', label: 'ยอดสั่งซื้อ', defaultVisible: true },
  { key: 'branch', label: 'สาขา', defaultVisible: true },
  { key: 'status', label: 'สถานะ', defaultVisible: true },
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
  address?: string;
  district?: string;
  amphoe?: string;
  province?: string;
  postal_code?: string;
  tax_id?: string;
  customer_type: 'retail' | 'wholesale' | 'distributor';
  customer_type_new?: 'retail' | 'wholesale' | 'distributor'; // From database
  credit_limit: number;
  credit_days: number;
  assigned_salesperson?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Stats from API
  shipping_address_count?: number;
  line_display_name?: string | null;
  total_order_amount?: number;
}

// Status badge component
function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="flex items-center text-green-600">
      <Check className="w-4 h-4 mr-1" />
      <span className="text-sm">ใช้งาน</span>
    </span>
  ) : (
    <span className="flex items-center text-red-600">
      <X className="w-4 h-4 mr-1" />
      <span className="text-sm">ปิดใช้งาน</span>
    </span>
  );
}

// Customer type badge
function CustomerTypeBadge({ type }: { type: string }) {
  const colors = {
    retail: 'bg-blue-100 text-blue-800',
    wholesale: 'bg-purple-100 text-purple-800',
    distributor: 'bg-green-100 text-green-800'
  };

  const labels = {
    retail: 'ขายปลีก',
    wholesale: 'ขายส่ง',
    distributor: 'ตัวแทนจำหน่าย'
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[type as keyof typeof colors]}`}>
      {labels[type as keyof typeof labels]}
    </span>
  );
}

export default function CustomersPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataFetched, setDataFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<string>('all');
  const [filterLine, setFilterLine] = useState<string>('all');

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

  // Check auth
  useEffect(() => {
    if (authLoading) return;

    if (!userProfile) {
      router.push('/login');
      return;
    }

    // Check role permission
    if (!userProfile.roles?.some((r: string) => ['owner', 'admin', 'manager', 'sales'].includes(r))) {
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
    const matchesActive = filterActive === 'all' ||
      (filterActive === 'true' ? customer.is_active : !customer.is_active);
    const matchesLine = filterLine === 'all' ||
      (filterLine === 'linked' ? !!customer.line_display_name : !customer.line_display_name);

    return matchesSearch && matchesType && matchesActive && matchesLine;
  });

  // Pagination
  const totalPages = Math.ceil(filteredCustomers.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedCustomers = filteredCustomers.slice(startIndex, endIndex);

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
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ, รหัส, เบอร์โทร..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
              />
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            >
              <option value="all">ประเภททั้งหมด</option>
              <option value="retail">ขายปลีก</option>
              <option value="wholesale">ขายส่ง</option>
              <option value="distributor">ตัวแทนจำหน่าย</option>
            </select>

            {/* Active Filter */}
            <select
              value={filterActive}
              onChange={(e) => { setFilterActive(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            >
              <option value="all">สถานะทั้งหมด</option>
              <option value="true">ใช้งาน</option>
              <option value="false">ปิดใช้งาน</option>
            </select>

            {/* LINE Filter */}
            <select
              value={filterLine}
              onChange={(e) => { setFilterLine(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            >
              <option value="all">LINE ทั้งหมด</option>
              <option value="linked">เชื่อมต่อ LINE แล้ว</option>
              <option value="not_linked">ยังไม่เชื่อมต่อ</option>
            </select>
          </div>
        </div>

        {/* Customer Table */}
        <div className="data-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  {isCol('customer') && <th className="data-th min-w-[200px]">ลูกค้า</th>}
                  {isCol('type') && <th className="data-th w-[100px]">ประเภท</th>}
                  {isCol('phone') && <th className="data-th w-[110px]">เบอร์โทร</th>}
                  {isCol('line') && <th className="data-th min-w-[200px]">LINE</th>}
                  {isCol('totalOrder') && <th className="data-th text-right w-[100px]">ยอดสั่งซื้อ</th>}
                  {isCol('branch') && <th className="data-th text-center w-[60px]">สาขา</th>}
                  {isCol('status') && <th className="data-th text-center w-[90px]">สถานะ</th>}
                </tr>
              </thead>
              <tbody className="data-tbody">
                {paginatedCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => router.push(`/customers/${customer.id}`)}
                    className="data-tr cursor-pointer"
                  >
                    {/* ลูกค้า: ชื่อ (เด่น) + รหัส (จาง) */}
                    {isCol('customer') && (
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <Eye className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{customer.name}</div>
                          <div className="text-xs text-gray-400 dark:text-slate-500">{customer.customer_code}</div>
                        </div>
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

                    {/* LINE status */}
                    {isCol('line') && (
                    <td className="px-3 py-3">
                      {customer.line_display_name ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-[#06C755]" title="เชื่อมต่อ LINE แล้ว">
                          <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{customer.line_display_name}</span>
                        </span>
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

                    {/* สถานะ */}
                    {isCol('status') && (
                    <td className="px-3 py-3 text-center">
                      <StatusBadge isActive={customer.is_active} />
                    </td>
                    )}
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
