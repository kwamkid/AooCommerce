// Path: app/customers/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import CustomerForm, { CustomerFormData } from '@/components/customers/CustomerForm';

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
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<string>('all');
  const [filterLine, setFilterLine] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Form error for CustomerForm
  const [formError, setFormError] = useState('');

  // Fetch customers function - optimized with single API call
  const fetchCustomers = useCallback(async () => {
    if (dataFetched) return;

    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No session');
      }

      // Fetch customers with stats in single API call
      const customersResponse = await fetch('/api/customers?with_stats=true', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const customersResult = await customersResponse.json();

      if (!customersResponse.ok) {
        throw new Error(customersResult.error || 'Failed to fetch customers');
      }

      const data = customersResult.customers || [];

      // Map customer_type from database
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
  }, [dataFetched]);

  // Check auth
  useEffect(() => {
    if (authLoading) return;

    if (!userProfile) {
      router.push('/login');
      return;
    }

    // Check role permission
    if (!['admin', 'manager', 'sales'].includes(userProfile.role)) {
      router.push('/dashboard');
    }
  }, [userProfile, authLoading, router]);

  // Fetch customers
  useEffect(() => {
    if (!authLoading && userProfile && !dataFetched) {
      fetchCustomers();
    }
  }, [authLoading, userProfile, dataFetched, fetchCustomers]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Handle create new customer (from CustomerForm component)
  const handleCreateCustomer = async (data: CustomerFormData) => {
    setSaving(true);
    setFormError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('กรุณาเข้าสู่ระบบใหม่');
      }

      // Determine billing address (use shipping if same_as_shipping is checked)
      const billingAddress = data.billing_same_as_shipping ? data.shipping_address : data.billing_address;
      const billingDistrict = data.billing_same_as_shipping ? data.shipping_district : data.billing_district;
      const billingAmphoe = data.billing_same_as_shipping ? data.shipping_amphoe : data.billing_amphoe;
      const billingProvince = data.billing_same_as_shipping ? data.shipping_province : data.billing_province;
      const billingPostalCode = data.billing_same_as_shipping ? data.shipping_postal_code : data.billing_postal_code;

      // 1. Create customer with billing address and tax info
      const customerPayload = {
        name: data.name,
        contact_person: data.contact_person,
        phone: data.phone,
        email: data.email,
        customer_type: data.customer_type,
        credit_limit: data.credit_limit,
        credit_days: data.credit_days,
        is_active: data.is_active,
        notes: data.notes,
        // Tax invoice info (if needed)
        tax_id: data.needs_tax_invoice ? data.tax_id : '',
        tax_company_name: data.needs_tax_invoice ? data.tax_company_name : '',
        tax_branch: data.needs_tax_invoice ? data.tax_branch : '',
        // Billing address fields
        address: billingAddress,
        district: billingDistrict,
        amphoe: billingAmphoe,
        province: billingProvince,
        postal_code: billingPostalCode
      };

      const createResponse = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(customerPayload)
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.error || 'Failed to create customer');
      }

      const newCustomer = await createResponse.json();

      // 2. Create shipping address if provided
      if (data.shipping_address || data.shipping_province) {
        const shippingPayload = {
          customer_id: newCustomer.id,
          address_name: data.shipping_address_name || 'สาขาหลัก',
          contact_person: data.shipping_contact_person || data.contact_person,
          phone: data.shipping_phone || data.phone,
          address_line1: data.shipping_address,
          district: data.shipping_district,
          amphoe: data.shipping_amphoe,
          province: data.shipping_province,
          postal_code: data.shipping_postal_code,
          google_maps_link: data.shipping_google_maps_link,
          delivery_notes: data.shipping_delivery_notes,
          is_default: true
        };

        await fetch('/api/shipping-addresses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(shippingPayload)
        });
      }

      setSuccess('สร้างลูกค้าสำเร็จ');
      setShowModal(false);
      setDataFetched(false);
      setTimeout(() => {
        setSuccess('');
        fetchCustomers();
      }, 1500);
    } catch (error) {
      console.error('Error creating customer:', error);
      setFormError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Handle update existing customer (from CustomerForm component)
  const handleUpdateCustomer = async (data: CustomerFormData) => {
    if (!editingCustomer) return;

    setSaving(true);
    setFormError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('กรุณาเข้าสู่ระบบใหม่');
      }

      // Determine billing address (use shipping if same_as_shipping is checked)
      const billingAddress = data.billing_same_as_shipping ? data.shipping_address : data.billing_address;
      const billingDistrict = data.billing_same_as_shipping ? data.shipping_district : data.billing_district;
      const billingAmphoe = data.billing_same_as_shipping ? data.shipping_amphoe : data.billing_amphoe;
      const billingProvince = data.billing_same_as_shipping ? data.shipping_province : data.billing_province;
      const billingPostalCode = data.billing_same_as_shipping ? data.shipping_postal_code : data.billing_postal_code;

      const payload = {
        id: editingCustomer.id,
        name: data.name,
        contact_person: data.contact_person,
        phone: data.phone,
        email: data.email,
        customer_type: data.customer_type,
        credit_limit: data.credit_limit,
        credit_days: data.credit_days,
        is_active: data.is_active,
        notes: data.notes,
        // Tax invoice info (if needed)
        tax_id: data.needs_tax_invoice ? data.tax_id : '',
        tax_company_name: data.needs_tax_invoice ? data.tax_company_name : '',
        tax_branch: data.needs_tax_invoice ? data.tax_branch : '',
        // Billing address fields
        address: billingAddress,
        district: billingDistrict,
        amphoe: billingAmphoe,
        province: billingProvince,
        postal_code: billingPostalCode
      };

      const response = await fetch('/api/customers', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }

      setSuccess('อัพเดทลูกค้าสำเร็จ');
      setShowModal(false);
      setDataFetched(false);
      setTimeout(() => {
        setSuccess('');
        fetchCustomers();
      }, 1500);

      resetForm();
    } catch (error) {
      console.error('Error updating customer:', error);
      setFormError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setEditingCustomer(null);
    setFormError('');
  };

  // Handle open modal
  const handleOpenModal = () => {
    resetForm();
    setShowModal(true);
  };

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

  // Reset to page 1 when filters change
  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#E9B308] animate-spin" />
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
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <UserCircle className="w-8 h-8 mr-3 text-[#E9B308]" />
              ลูกค้า
            </h1>
            <p className="text-gray-600 mt-1">จัดการข้อมูลลูกค้าและความสัมพันธ์</p>
          </div>

          <button
            onClick={handleOpenModal}
            className="bg-[#E9B308] text-[#00231F] px-4 py-2 rounded-lg hover:bg-[#d4a307] transition-colors flex items-center font-medium"
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

        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
            <Check className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
            <span className="text-green-800">{success}</span>
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
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E9B308]"
              />
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E9B308]"
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
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E9B308]"
            >
              <option value="all">สถานะทั้งหมด</option>
              <option value="true">ใช้งาน</option>
              <option value="false">ปิดใช้งาน</option>
            </select>

            {/* LINE Filter */}
            <select
              value={filterLine}
              onChange={(e) => { setFilterLine(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E9B308]"
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
                  <th className="data-th min-w-[200px]">
                    ลูกค้า
                  </th>
                  <th className="data-th w-[100px]">
                    ประเภท
                  </th>
                  <th className="data-th w-[110px]">
                    เบอร์โทร
                  </th>
                  <th className="data-th min-w-[200px]">
                    LINE
                  </th>
                  <th className="data-th text-right w-[100px]">
                    ยอดสั่งซื้อ
                  </th>
                  <th className="data-th text-center w-[60px]">
                    สาขา
                  </th>
                  <th className="data-th text-center w-[90px]">
                    สถานะ
                  </th>
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
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <Eye className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-gray-900">{customer.name}</div>
                          <div className="text-xs text-gray-400">{customer.customer_code}</div>
                        </div>
                      </div>
                    </td>

                    {/* ประเภท */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <CustomerTypeBadge type={customer.customer_type} />
                    </td>

                    {/* เบอร์โทร - กดโทรได้ */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {customer.phone ? (
                        <a
                          href={`tel:${customer.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {customer.phone}
                        </a>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>

                    {/* LINE status */}
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

                    {/* ยอดสั่งซื้อรวม */}
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {customer.total_order_amount && customer.total_order_amount > 0 ? (
                        <span className="text-sm font-medium text-gray-900">
                          ฿{customer.total_order_amount.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>

                    {/* สาขา */}
                    <td className="px-3 py-3 text-center">
                      {customer.shipping_address_count && customer.shipping_address_count > 0 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#E9B308]/10 text-[#E9B308] text-sm font-semibold">
                          {customer.shipping_address_count}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">-</span>
                      )}
                    </td>

                    {/* สถานะ */}
                    <td className="px-3 py-3 text-center">
                      <StatusBadge isActive={customer.is_active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredCustomers.length > 0 && (
            <div className="data-pagination">
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <span>{startIndex + 1} - {Math.min(endIndex, filteredCustomers.length)} จาก {filteredCustomers.length} รายการ</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="mx-1 px-1 py-0.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#E9B308] focus:border-transparent"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>/หน้า</span>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าแรก">
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าก่อน">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1">
                    {(() => {
                      const pages: (number | string)[] = [];
                      if (totalPages <= 3) {
                        for (let i = 1; i <= totalPages; i++) pages.push(i);
                      } else {
                        // current +-1, ..., last
                        const start = Math.max(1, currentPage - 1);
                        const end = Math.min(totalPages, currentPage + 1);
                        for (let i = start; i <= end; i++) pages.push(i);
                        if (end < totalPages - 1) pages.push('...');
                        if (end < totalPages) pages.push(totalPages);
                        if (start > 2) pages.unshift('...');
                        if (start > 1) pages.unshift(1);
                      }
                      return pages.map((page, idx) =>
                        page === '...' ? (
                          <span key={`dots-${idx}`} className="px-1 text-gray-400">...</span>
                        ) : (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page as number)}
                            className={`w-8 h-8 rounded text-sm font-medium ${
                              currentPage === page
                                ? 'bg-[#E9B308] text-[#00231F]'
                                : 'hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            {page}
                          </button>
                        )
                      );
                    })()}
                  </div>
                  <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าถัดไป">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าสุดท้าย">
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
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

        {/* Modal - New Customer */}
        {showModal && !editingCustomer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto relative">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-6">เพิ่มลูกค้าใหม่</h2>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setFormError('');
                  }}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                  type="button"
                >
                  <X className="w-6 h-6" />
                </button>

                <CustomerForm
                  onSubmit={handleCreateCustomer}
                  onCancel={() => {
                    setShowModal(false);
                    setFormError('');
                  }}
                  isLoading={saving}
                  error={formError}
                />
              </div>
            </div>
          </div>
        )}

        {/* Modal - Edit Customer */}
        {showModal && editingCustomer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto relative">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-6">แก้ไขลูกค้า</h2>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setFormError('');
                    resetForm();
                  }}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                  type="button"
                >
                  <X className="w-6 h-6" />
                </button>

                <CustomerForm
                  initialData={{
                    name: editingCustomer.name || '',
                    contact_person: editingCustomer.contact_person || '',
                    phone: editingCustomer.phone || '',
                    email: editingCustomer.email || '',
                    customer_type: editingCustomer.customer_type || 'retail',
                    credit_limit: editingCustomer.credit_limit || 0,
                    credit_days: editingCustomer.credit_days || 0,
                    is_active: editingCustomer.is_active,
                    notes: editingCustomer.notes || '',
                    // Tax info
                    needs_tax_invoice: !!(editingCustomer.tax_id),
                    tax_id: editingCustomer.tax_id || '',
                    // Billing address (from customer record)
                    billing_address: editingCustomer.address || '',
                    billing_district: editingCustomer.district || '',
                    billing_amphoe: editingCustomer.amphoe || '',
                    billing_province: editingCustomer.province || '',
                    billing_postal_code: editingCustomer.postal_code || '',
                    billing_same_as_shipping: false
                  }}
                  onSubmit={handleUpdateCustomer}
                  onCancel={() => {
                    setShowModal(false);
                    setFormError('');
                    resetForm();
                  }}
                  isEditing={true}
                  isLoading={saving}
                  error={formError}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
