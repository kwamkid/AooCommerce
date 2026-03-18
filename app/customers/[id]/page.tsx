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
  ExistingAddress,
  LinkedContact,
  buildCustomerPayload,
} from '@/components/customers/CustomerForm';
import { type BrandGpRow } from '@/components/customers/BrandGpCommissions';
import { Tag } from '@/components/ui/TagBadge';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import { parseThaiAddress } from '@/lib/address-parser';
import {
  ArrowLeft,
  MapPin,
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

// Phone formatting utilities
const formatPhoneDisplay = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10 && cleaned.startsWith('0')) return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  if (cleaned.length === 9 && cleaned.startsWith('0')) return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 5)}-${cleaned.slice(5)}`;
  return phone;
};

const normalizePhone = (phone: string): string => {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('66')) cleaned = '0' + cleaned.slice(2);
  if (cleaned.length === 9 && !cleaned.startsWith('0')) cleaned = '0' + cleaned;
  return cleaned;
};

export default function CustomerEditPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { confirmDialog, confirm } = useConfirmDialog();
  const { showToast } = useToast();
  const router = useRouter();
  const params = useParams();
  const customerId = params.id as string;

  const canEdit = userProfile?.roles?.includes('owner') || userProfile?.roles?.includes('admin') || userProfile?.roles?.includes('sales');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<ExistingAddress[]>([]);
  const [defaultAddressId, setDefaultAddressId] = useState<string | null>(null);
  const [linkedContacts, setLinkedContacts] = useState<LinkedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

  // Form data (populated from customer + default shipping address)
  const [formData, setFormData] = useState<CustomerFormData | null>(null);

  // Address modal (for editing/adding non-default addresses)
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ExistingAddress | null>(null);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [addressForm, setAddressForm] = useState({
    address_name: '',
    contact_person: '',
    phone: '',
    address_line1: '',
    district: '',
    amphoe: '',
    province: '',
    postal_code: '',
    google_maps_link: '',
    delivery_notes: '',
    is_default: false
  });
  const [addressPhoneDisplay, setAddressPhoneDisplay] = useState('');

  useEffect(() => {
    if (!authLoading && userProfile && customerId) {
      fetchData();
    }
  }, [authLoading, userProfile, customerId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [customerRes, addressRes, linkedRes, tagsRes, customerTagsRes] = await Promise.all([
        apiFetch(`/api/customers?search=${customerId}`),
        apiFetch(`/api/shipping-addresses?customer_id=${customerId}`),
        apiFetch(`/api/chat/contacts?customer_id=${customerId}`),
        apiFetch('/api/customers/tags'),
        apiFetch(`/api/customers/${customerId}/tags`),
      ]);

      const customerResult = await customerRes.json();
      const addressResult = await addressRes.json();
      const linkedResult = await linkedRes.json();
      setLinkedContacts(linkedResult.linked_contacts || []);
      const tagsResult = await tagsRes.json();
      if (tagsResult.tags) setAllTags(tagsResult.tags);
      const customerTagsResult = await customerTagsRes.json();
      if (customerTagsResult.tags) setSelectedTags(customerTagsResult.tags);

      if (!customerRes.ok) throw new Error(customerResult.error || 'Failed to fetch customer');

      const data = (customerResult.customers || []).find((c: Customer) => c.id === customerId);
      if (!data) throw new Error('Customer not found');

      const customerData: Customer = { ...data, customer_type: data.customer_type || 'retail' };
      setCustomer(customerData);

      const addrs: ExistingAddress[] = addressResult.addresses || [];
      setAddresses(addrs);

      const defaultAddr = addrs.find(a => a.is_default) || addrs[0] || null;
      setDefaultAddressId(defaultAddr?.id || null);

      const storedBilling = [customerData.billing_address, customerData.billing_district, customerData.billing_amphoe, customerData.billing_province, customerData.billing_postal_code].filter(Boolean).join(' ');
      const shippingCombined = defaultAddr
        ? [defaultAddr.address_line1, defaultAddr.district, defaultAddr.amphoe, defaultAddr.province, defaultAddr.postal_code].filter(Boolean).join(' ')
        : '';
      const billingSameAsShipping = !storedBilling || storedBilling === shippingCombined;

      setFormData({
        name: customerData.name || '',
        contact_person: customerData.contact_person || '',
        phone: customerData.phone || '',
        email: customerData.email || '',
        customer_type: customerData.customer_type,
        sale_type: (customerData as Record<string, unknown>).sale_type as string || '',
        credit_limit: customerData.credit_limit || 0,
        credit_days: customerData.credit_days || 0,
        is_active: customerData.is_active,
        notes: customerData.notes || '',
        has_multiple_branches: addrs.length > 1,
        shipping_address_name: defaultAddr?.address_name || 'ที่อยู่หลัก',
        shipping_contact_person: defaultAddr?.contact_person || '',
        shipping_phone: defaultAddr?.phone || '',
        shipping_address: defaultAddr?.address_line1 || '',
        shipping_district: defaultAddr?.district || '',
        shipping_amphoe: defaultAddr?.amphoe || '',
        shipping_province: defaultAddr?.province || '',
        shipping_postal_code: defaultAddr?.postal_code || '',
        shipping_google_maps_link: defaultAddr?.google_maps_link || '',
        shipping_delivery_notes: defaultAddr?.delivery_notes || '',
        needs_tax_invoice: !!(customerData.tax_id || customerData.tax_company_name),
        tax_company_name: customerData.tax_company_name || '',
        tax_id: customerData.tax_id || '',
        tax_branch: customerData.tax_branch || 'สำนักงานใหญ่',
        billing_same_as_shipping: !!billingSameAsShipping,
        billing_address: storedBilling || '',
        billing_district: '',
        billing_amphoe: '',
        billing_province: '',
        billing_postal_code: '',
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

  const fetchAddresses = async () => {
    try {
      const res = await apiFetch(`/api/shipping-addresses?customer_id=${customerId}`);
      const result = await res.json();
      if (res.ok) setAddresses(result.addresses || []);
    } catch (err) {
      console.error('Error fetching addresses:', err);
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

      // Update or create default shipping address
      const shippingPayload = {
        address_name: data.shipping_address_name || 'ที่อยู่หลัก',
        contact_person: data.shipping_contact_person || data.contact_person,
        phone: data.shipping_phone || data.phone,
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
        const addrRes = await apiFetch('/api/shipping-addresses', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: defaultAddressId, ...shippingPayload }),
        });
        const addrResult = await addrRes.json();
        if (!addrRes.ok) console.error('shipping PUT failed:', addrResult);
      } else if (data.shipping_province) {
        const addrRes = await apiFetch('/api/shipping-addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: customerId, ...shippingPayload }),
        });
        const addrResult = await addrRes.json();
        if (addrRes.ok && addrResult.address?.id) setDefaultAddressId(addrResult.address.id);
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

  // Address modal handlers
  const handleEditAddress = (address: ExistingAddress) => {
    setEditingAddress(address);
    setAddressForm({
      address_name: address.address_name,
      contact_person: address.contact_person || '',
      phone: address.phone || '',
      address_line1: address.address_line1,
      district: address.district || '',
      amphoe: address.amphoe || '',
      province: address.province,
      postal_code: address.postal_code || '',
      google_maps_link: address.google_maps_link || '',
      delivery_notes: address.delivery_notes || '',
      is_default: address.is_default
    });
    setAddressPhoneDisplay(address.phone ? formatPhoneDisplay(address.phone) : '');
    setShowAddressModal(true);
  };

  const handleAddAddress = () => {
    setEditingAddress(null);
    setAddressForm({
      address_name: '', contact_person: '', phone: '',
      address_line1: '', district: '', amphoe: '', province: '',
      postal_code: '', google_maps_link: '', delivery_notes: '', is_default: false
    });
    setAddressPhoneDisplay('');
    setShowAddressModal(true);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const method = editingAddress ? 'PUT' : 'POST';
      const payload = editingAddress
        ? { id: editingAddress.id, ...addressForm }
        : { customer_id: customerId, ...addressForm };

      const res = await apiFetch('/api/shipping-addresses', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }

      showToast(editingAddress ? 'อัพเดทที่อยู่สำเร็จ' : 'เพิ่มที่อยู่สำเร็จ', 'success');
      setShowAddressModal(false);
      fetchAddresses();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    const ok = await confirm({ title: 'ต้องการลบที่อยู่นี้?', variant: 'danger' });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/shipping-addresses?id=${addressId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('ลบที่อยู่สำเร็จ', 'success');
        fetchAddresses();
      }
    } catch {
      showToast('ไม่สามารถลบที่อยู่ได้', 'error');
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

  const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] dark:bg-slate-900 dark:text-white";

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

  // Non-default addresses (shown as existing cards in form)
  const additionalAddresses = addresses.filter(a => a.id !== defaultAddressId);

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
          {canEdit && (
            <button
              onClick={() => {
                const form = document.getElementById('customer-edit-form') as HTMLFormElement;
                form?.requestSubmit();
              }}
              disabled={saving}
              className="bg-[#F4511E] text-white px-5 py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          )}
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
            onSubmit={handleSave}
            onCancel={() => router.push('/customers')}
            allTags={allTags}
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            onTagCreated={(tag) => setAllTags(prev => [...prev, tag])}
            linkedContacts={linkedContacts}
            existingAddresses={additionalAddresses}
            onEditAddress={canEdit ? handleEditAddress : undefined}
            onDeleteAddress={canEdit ? handleDeleteAddress : undefined}
            onAddAddress={canEdit ? handleAddAddress : undefined}
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

      {/* Address Modal (for editing/adding non-default addresses) */}
      {showAddressModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAddressModal(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowAddressModal(false); }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6 dark:text-white">
                {editingAddress ? 'แก้ไขที่อยู่จัดส่ง' : 'เพิ่มที่อยู่จัดส่ง'}
              </h2>

              <form onSubmit={handleSaveAddress}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      ชื่อที่อยู่ <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={addressForm.address_name}
                      onChange={(e) => setAddressForm({ ...addressForm, address_name: e.target.value })}
                      className={inputClass}
                      placeholder="เช่น สาขาลาดพร้าว, คลังบางนา"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ผู้รับสินค้า</label>
                      <input type="text" value={addressForm.contact_person}
                        onChange={(e) => setAddressForm({ ...addressForm, contact_person: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทรผู้รับ</label>
                      <input type="tel" value={addressPhoneDisplay}
                        onChange={(e) => {
                          const normalized = normalizePhone(e.target.value);
                          setAddressPhoneDisplay(e.target.value);
                          setAddressForm({ ...addressForm, phone: normalized });
                        }}
                        className={inputClass} placeholder="0xx-xxx-xxxx" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่จัดส่ง</label>
                    <textarea
                      value={addressForm.address_line1}
                      onChange={(e) => setAddressForm({ ...addressForm, address_line1: e.target.value })}
                      onPaste={(e) => {
                        const pasted = e.clipboardData.getData('text');
                        if (pasted.length > 20) {
                          const parsed = parseThaiAddress(pasted);
                          if (parsed) {
                            e.preventDefault();
                            setAddressForm(prev => ({
                              ...prev,
                              address_line1: parsed.address || pasted,
                              district: parsed.district || prev.district,
                              amphoe: parsed.amphoe || prev.amphoe,
                              province: parsed.province || prev.province,
                              postal_code: parsed.postal_code || prev.postal_code,
                            }));
                          }
                        }
                      }}
                      className={inputClass}
                      rows={2}
                      placeholder="วางที่อยู่เต็ม — ระบบจะแยกตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ให้อัตโนมัติ"
                    />
                  </div>

                  <ThaiAddressInput
                    district={addressForm.district} amphoe={addressForm.amphoe}
                    province={addressForm.province} postalCode={addressForm.postal_code}
                    onAddressChange={(addr) => setAddressForm(prev => ({
                      ...prev,
                      ...(addr.district !== undefined && { district: addr.district }),
                      ...(addr.amphoe !== undefined && { amphoe: addr.amphoe }),
                      ...(addr.province !== undefined && { province: addr.province }),
                      ...(addr.postalCode !== undefined && { postal_code: addr.postalCode }),
                    }))}
                    inputClassName={inputClass}
                  />

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      <MapPin className="w-4 h-4" />Google Maps Link
                    </label>
                    <input type="url" value={addressForm.google_maps_link}
                      onChange={(e) => setAddressForm({ ...addressForm, google_maps_link: e.target.value })}
                      className={inputClass} placeholder="วาง link Google Maps" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุสำหรับการจัดส่ง</label>
                    <textarea value={addressForm.delivery_notes}
                      onChange={(e) => setAddressForm({ ...addressForm, delivery_notes: e.target.value })}
                      className={inputClass} rows={2} placeholder="เช่น ส่งช่วงเช้า, โทรก่อนส่ง" />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button type="button" onClick={() => setShowAddressModal(false)}
                    className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 dark:bg-slate-900" disabled={saving}>
                    ยกเลิก
                  </button>
                  <button type="submit"
                    className="bg-[#F4511E] text-white px-4 py-2 rounded-lg hover:bg-[#D63B0E] disabled:opacity-50 flex items-center" disabled={saving}>
                    {saving ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />กำลังบันทึก...</>) : 'บันทึก'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </Layout>
  );
}
