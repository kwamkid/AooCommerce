// Path: app/customers/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import CustomerForm, {
  CustomerFormData,
  LinkedContact,
  buildCustomerPayload,
} from '@/components/customers/CustomerForm';
import { type BrandGpRow } from '@/components/customers/BrandGpCommissions';
import { Tag } from '@/components/ui/TagBadge';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Save,
  UserCircle,
  Link2,
  Copy,
  ExternalLink,
  RefreshCw,
  KeyRound,
} from 'lucide-react';

// Customer interface
interface Customer {
  id: string;
  customer_code: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  billing_address?: string;
  billing_district?: string;
  billing_amphoe?: string;
  billing_province?: string;
  billing_postal_code?: string;
  tax_id?: string;
  tax_company_name?: string;
  tax_branch?: string;
  customer_type: string;
  sale_type?: string;
  tax_type?: string;
  credit_limit: number;
  credit_days: number;
  is_active: boolean;
  notes?: string;
  created_at: string;
  consignment_gp_rate?: number | null;
  consignment_gp_base_price?: string | null;
  portal_token?: string | null;
  portal_access_code?: string | null;
}

export default function CustomerEditPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { confirmDialog } = useConfirmDialog();
  const { showToast } = useToast();
  const router = useRouter();
  const params = useParams();
  const customerId = params.id as string;

  const canEdit = userProfile?.roles?.includes('owner') || userProfile?.roles?.includes('admin') || userProfile?.roles?.includes('sales');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [linkedContacts, setLinkedContacts] = useState<LinkedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [hasOrders, setHasOrders] = useState(false);

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [defaultAddressId, setDefaultAddressId] = useState<string | null>(null);

  // Form data
  const [formData, setFormData] = useState<CustomerFormData | null>(null);

  useEffect(() => {
    if (!authLoading && userProfile && customerId) {
      fetchData();
    }
  }, [authLoading, userProfile, customerId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [customerRes, linkedRes, tagsRes, customerTagsRes, ordersRes, addressRes] = await Promise.all([
        apiFetch(`/api/customers?search=${customerId}`),
        apiFetch(`/api/chat/contacts?customer_id=${customerId}`),
        apiFetch('/api/customers/tags'),
        apiFetch(`/api/customers/${customerId}/tags`),
        apiFetch(`/api/orders?customer_id=${customerId}&limit=1`),
        apiFetch(`/api/shipping-addresses?customer_id=${customerId}`),
      ]);

      const customerResult = await customerRes.json();
      const linkedResult = await linkedRes.json();
      setLinkedContacts(linkedResult.linked_contacts || []);
      const tagsResult = await tagsRes.json();
      if (tagsResult.tags) setAllTags(tagsResult.tags);
      const customerTagsResult = await customerTagsRes.json();
      if (customerTagsResult.tags) setSelectedTags(customerTagsResult.tags);
      const ordersResult = await ordersRes.json();
      setHasOrders((ordersResult.orders?.length || 0) > 0);
      const addressResult = await addressRes.json();
      const addrs = addressResult.addresses || [];
      const defaultAddr = addrs.find((a: { is_default: boolean }) => a.is_default) || addrs[0] || null;
      setDefaultAddressId(defaultAddr?.id || null);

      if (!customerRes.ok) throw new Error(customerResult.error || 'Failed to fetch customer');

      const data = (customerResult.customers || []).find((c: Customer) => c.id === customerId);
      if (!data) throw new Error('Customer not found');

      const customerData: Customer = { ...data, customer_type: data.customer_type || 'retail' };
      setCustomer(customerData);

      setFormData({
        name: customerData.name || '',
        contact_person: customerData.contact_person || '',
        phone: customerData.phone || '',
        email: customerData.email || '',
        customer_type: customerData.customer_type,
        sale_type: customerData.sale_type || '',
        credit_limit: customerData.credit_limit || 0,
        credit_days: customerData.credit_days || 0,
        is_active: customerData.is_active,
        notes: customerData.notes || '',
        shipping_address: defaultAddr?.address_line1 || '',
        shipping_district: defaultAddr?.district || '',
        shipping_amphoe: defaultAddr?.amphoe || '',
        shipping_province: defaultAddr?.province || '',
        shipping_postal_code: defaultAddr?.postal_code || '',
        shipping_google_maps_link: defaultAddr?.google_maps_link || '',
        shipping_delivery_notes: defaultAddr?.delivery_notes || '',
        billing_address: [customerData.billing_address, customerData.billing_district, customerData.billing_amphoe, customerData.billing_province, customerData.billing_postal_code].filter(Boolean).join(' '),
        needs_tax_invoice: !!(customerData.tax_id || customerData.tax_company_name),
        tax_type: (customerData.tax_type as 'personal' | 'corporate') || 'corporate',
        tax_company_name: customerData.tax_company_name || '',
        tax_id: customerData.tax_id || '',
        tax_branch: customerData.tax_branch || 'สำนักงานใหญ่',
        consignment_gp_rate: customerData.consignment_gp_rate ?? '',
        consignment_gp_base_price: (customerData.consignment_gp_base_price as 'retail' | 'discounted' | null) ?? null,
      });

    } catch (err) {
      console.error('Error fetching customer:', err);
      showToast('ไม่สามารถโหลดข้อมูลลูกค้าได้', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Called by CustomerForm onSubmit
  const handleSave = async (data: CustomerFormData, _resolvedCustomerId: string, brandGpRows?: BrandGpRow[]) => {
    if (!canEdit) return;
    setSaving(true);

    try {
      const customerPayload = buildCustomerPayload(data, customerId);

      const customerRes = await apiFetch('/api/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerPayload),
      });

      const customerResult = await customerRes.json();
      if (!customerRes.ok) throw new Error(customerResult.error || 'ไม่สามารถบันทึกข้อมูลลูกค้าได้');

      // Save/update shipping address
      if (data.shipping_address || data.shipping_province) {
        const shippingPayload = {
          address_name: 'ที่อยู่หลัก',
          contact_person: data.contact_person || '',
          phone: data.phone || '',
          address_line1: data.shipping_address,
          district: data.shipping_district,
          amphoe: data.shipping_amphoe,
          province: data.shipping_province,
          postal_code: data.shipping_postal_code,
          google_maps_link: data.shipping_google_maps_link,
          delivery_notes: data.shipping_delivery_notes,
          is_default: true,
        };
        if (defaultAddressId) {
          await apiFetch('/api/shipping-addresses', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: defaultAddressId, ...shippingPayload }),
          });
        } else {
          const addrRes = await apiFetch('/api/shipping-addresses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id: customerId, ...shippingPayload }),
          });
          const addrResult = await addrRes.json();
          if (addrRes.ok && addrResult.address?.id) setDefaultAddressId(addrResult.address.id);
        }
      }

      // Save tags
      await apiFetch(`/api/customers/${customerId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_ids: selectedTags.map(t => t.id) }),
      });

      // Save brand GP commissions (replace all)
      if (brandGpRows && (data.customer_type === 'consignment_dealer' || data.customer_type === 'dealer' || data.sale_type === 'consignment')) {
        await apiFetch(`/api/customer-brand-commissions/sync`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: customerId,
            rows: brandGpRows.filter(r => r.brand_id).map(r => ({
              brand_id: r.brand_id,
              gp_rate: parseFloat(r.gp_rate) || 0,
              gp_base_price: r.gp_base_price || 'retail',
            })),
          }),
        });
      }

      showToast('บันทึกข้อมูลลูกค้าสำเร็จ', 'success');
      router.back();
    } catch (err) {
      console.error('[CustomerEdit] Save error:', err);
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก', 'error');
      throw err; // re-throw so CustomerForm knows save failed
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateCode = async () => {
    if (!customer) return;
    setRegeneratingCode(true);
    try {
      const res = await apiFetch(`/api/customers/${customerId}/regenerate-portal-code`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'ไม่สามารถสร้างรหัสใหม่ได้');
      setCustomer(prev => prev ? { ...prev, portal_access_code: result.data.portal_access_code } : prev);
      showToast('สร้างรหัส Portal ใหม่สำเร็จ', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setRegeneratingCode(false);
    }
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

  if (!customer || !formData) {
    return (
      <Layout>
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">ไม่พบข้อมูลลูกค้า</p>
          <button onClick={() => router.push('/customers')} className="mt-4 text-[#F4511E] hover:underline">
            กลับหน้ารายการลูกค้า
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push('/customers')}
              className="flex items-center text-gray-600 hover:text-gray-900 mb-2 text-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              กลับ
            </button>
            <div className="flex items-center gap-3">
              <UserCircle className="w-8 h-8 text-[#F4511E]" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{customer.name}</h1>
                <p className="data-secondary text-gray-500 dark:text-slate-400">รหัส: {customer.customer_code}</p>
              </div>
            </div>
          </div>
        </div>

        {!canEdit && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            คุณสามารถดูข้อมูลได้อย่างเดียว (ต้องเป็น Admin หรือ Manager เพื่อแก้ไข)
          </div>
        )}

        {/* Portal ตัวแทน — แสดงเฉพาะ consignment_dealer ที่มี portal_token */}
        {customer.customer_type === 'consignment_dealer' && customer.portal_token && (
          <div className="p-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-amber-500" />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Portal ตัวแทน</h3>
            </div>

            {/* Portal link row */}
            <div className="flex items-center gap-2 flex-wrap">
              <code className="flex-1 text-xs font-mono bg-gray-100 dark:bg-slate-900 text-gray-500 dark:text-slate-400 px-3 py-2 rounded-lg truncate min-w-0">
                {typeof window !== 'undefined'
                  ? `${window.location.origin}/portal/consignment/${customer.portal_token}`
                  : `/portal/consignment/${customer.portal_token}`}
              </code>
              <button
                type="button"
                onClick={() => {
                  const url = `${window.location.origin}/portal/consignment/${customer.portal_token}`;
                  navigator.clipboard.writeText(url).then(() => {
                    showToast('คัดลอกลิงก์แล้ว', 'success');
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                คัดลอก
              </button>
              <a
                href={`/portal/consignment/${customer.portal_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 rounded-lg transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                เปิด
              </a>
            </div>

            {/* Access code row */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <KeyRound className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">รหัส Portal:</span>
                {customer.portal_access_code ? (
                  <code className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400 tracking-wider">
                    {customer.portal_access_code}
                  </code>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-slate-500 italic">ยังไม่มีรหัส</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleRegenerateCode}
                disabled={regeneratingCode}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {regeneratingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                สร้างรหัสใหม่
              </button>
              {customer.portal_access_code && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(customer.portal_access_code!).then(() => {
                      showToast('คัดลอกรหัสแล้ว', 'success');
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Copy className="w-3.5 h-3.5" />
                  คัดลอกรหัส
                </button>
              )}
            </div>
          </div>
        )}

        {/* Customer Form */}
        <div id="customer-edit-form-wrapper">
          <CustomerForm
            key={customer.id}
            initialData={formData}
            customerId={customerId}
            isEditing={true}
            isLoading={saving}
            lockCustomerType={hasOrders}
            onSubmit={handleSave}
            onCancel={() => router.push('/customers')}
            allTags={allTags}
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            onTagCreated={(tag) => setAllTags(prev => [...prev, tag])}
            linkedContacts={linkedContacts}
            onNavigateToChat={(id, platform) => router.push(`/chat?contact_id=${id}&platform=${platform}`)}
          />
        </div>

        {/* Bottom Buttons */}
        {canEdit && (
          <div className="flex justify-end gap-3">
            <button
              onClick={() => router.push('/customers')}
              disabled={saving}
              className="px-6 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={() => {
                const form = document.getElementById('customer-edit-form-wrapper')?.querySelector('form');
                form?.requestSubmit();
              }}
              disabled={saving}
              className="bg-[#F4511E] text-white px-6 py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        )}
      </div>
      {confirmDialog}
    </Layout>
  );
}
