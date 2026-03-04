// Path: app/customers/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import { parseThaiAddress } from '@/lib/address-parser';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import {
  ArrowLeft,
  Edit2,
  MapPin,
  Building2,
  CreditCard,
  Plus,
  Trash2,
  Star,
  ExternalLink,
  Loader2,
  AlertCircle,
  Check,
  Truck,
  Save,
  UserCircle,
  MessageCircle,
  Facebook,
  User
} from 'lucide-react';
import Checkbox from '@/components/ui/Checkbox';
import FormSelect from '@/components/ui/FormSelect';
import TagInput from '@/components/ui/TagInput';
import { Tag } from '@/components/ui/TagBadge';

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
  tax_company_name?: string;
  tax_branch?: string;
  customer_type: string;
  customer_type_new?: string;
  credit_limit: number;
  credit_days: number;
  is_active: boolean;
  notes?: string;
  created_at: string;
}

// Shipping Address interface
interface ShippingAddress {
  id: string;
  customer_id: string;
  address_name: string;
  contact_person?: string;
  phone?: string;
  address_line1: string;
  address_line2?: string;
  district?: string;
  amphoe?: string;
  province: string;
  postal_code?: string;
  google_maps_link?: string;
  delivery_notes?: string;
  is_default: boolean;
  is_active: boolean;
}

// Phone formatting utilities
const formatPhoneDisplay = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 9 && cleaned.startsWith('0')) {
    return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 5)}-${cleaned.slice(5)}`;
  }
  return phone;
};

const normalizePhone = (phone: string): string => {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('66')) cleaned = '0' + cleaned.slice(2);
  if (cleaned.length === 9 && !cleaned.startsWith('0')) cleaned = '0' + cleaned;
  return cleaned;
};

// parseThaiAddress is now imported from @/lib/address-parser

export default function CustomerEditPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { confirmDialog, confirm } = useConfirmDialog();
  const router = useRouter();
  const params = useParams();
  const customerId = params.id as string;

  // Permission: admin & sales can edit
  const canEdit = userProfile?.roles?.includes('owner') || userProfile?.roles?.includes('admin') || userProfile?.roles?.includes('sales');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [linkedContacts, setLinkedContacts] = useState<{ id: string; platform: 'line' | 'facebook'; display_name: string; picture_url?: string; last_message_at?: string; account_name?: string }[]>([]);
  const [defaultAddressId, setDefaultAddressId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Address modal (for additional branches only)
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ShippingAddress | null>(null);

  // Main form state (customer + default shipping + billing/tax)
  const [form, setForm] = useState({
    // Basic info
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    customer_type: 'retail',
    // Shipping address (default branch)
    shipping_address_name: 'ที่อยู่หลัก',
    shipping_contact_person: '',
    shipping_phone: '',
    shipping_address: '',
    shipping_district: '',
    shipping_amphoe: '',
    shipping_province: '',
    shipping_postal_code: '',
    shipping_google_maps_link: '',
    shipping_delivery_notes: '',
    // Tax invoice
    needs_tax_invoice: false,
    tax_company_name: '',
    tax_id: '',
    tax_branch: 'สำนักงานใหญ่',
    // Billing address
    billing_same_as_shipping: true,
    billing_address: '',
    billing_district: '',
    billing_amphoe: '',
    billing_province: '',
    billing_postal_code: '',
    // Credit
    credit_limit: 0,
    credit_days: 0,
    // Other
    notes: '',
    is_active: true,
  });

  // Tags
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

  // Phone display states
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [shippingPhoneDisplay, setShippingPhoneDisplay] = useState('');

  // Address modal form
  const [addressForm, setAddressForm] = useState({
    address_name: '',
    contact_person: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    district: '',
    amphoe: '',
    province: '',
    postal_code: '',
    google_maps_link: '',
    delivery_notes: '',
    is_default: false
  });

  // Fetch data
  useEffect(() => {
    if (!authLoading && userProfile && customerId) {
      fetchData();
    }
  }, [authLoading, userProfile, customerId]);

  // Sync billing with shipping when checkbox is on
  useEffect(() => {
    if (form.billing_same_as_shipping) {
      const combined = [form.shipping_address, form.shipping_district, form.shipping_amphoe, form.shipping_province, form.shipping_postal_code].filter(Boolean).join(' ');
      setForm(prev => ({
        ...prev,
        billing_address: combined,
      }));
    }
  }, [form.billing_same_as_shipping, form.shipping_address, form.shipping_district,
      form.shipping_amphoe, form.shipping_province, form.shipping_postal_code]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch customer, addresses, linked contacts, and tags in parallel
      const [customerRes, addressRes, linkedRes, tagsRes, customerTagsRes] = await Promise.all([
        apiFetch('/api/customers'),
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

      const customerData = {
        ...data,
        customer_type: data.customer_type_new || data.customer_type || 'retail'
      };
      setCustomer(customerData);

      const addrs: ShippingAddress[] = addressResult.addresses || [];
      setAddresses(addrs);

      // Find default shipping address
      const defaultAddr = addrs.find(a => a.is_default) || addrs[0] || null;
      setDefaultAddressId(defaultAddr?.id || null);

      // Check if billing == shipping (compare combined address)
      const shippingCombined = defaultAddr
        ? [defaultAddr.address_line1, defaultAddr.district, defaultAddr.amphoe, defaultAddr.province, defaultAddr.postal_code].filter(Boolean).join(' ')
        : '';
      const storedBilling = [customerData.tax_address, customerData.tax_district, customerData.tax_amphoe, customerData.tax_province, customerData.tax_postal_code].filter(Boolean).join(' ');
      const billingSameAsShipping = !storedBilling || storedBilling === shippingCombined;

      // Populate form
      setForm({
        name: customerData.name || '',
        contact_person: customerData.contact_person || '',
        phone: customerData.phone || '',
        email: customerData.email || '',
        customer_type: customerData.customer_type,
        // Shipping from default address
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
        // Tax
        needs_tax_invoice: !!(customerData.tax_id || customerData.tax_company_name),
        tax_company_name: customerData.tax_company_name || '',
        tax_id: customerData.tax_id || '',
        tax_branch: customerData.tax_branch || 'สำนักงานใหญ่',
        // Billing
        billing_same_as_shipping: !!billingSameAsShipping,
        billing_address: storedBilling || '',
        billing_district: '',
        billing_amphoe: '',
        billing_province: '',
        billing_postal_code: '',
        // Credit
        credit_limit: customerData.credit_limit || 0,
        credit_days: customerData.credit_days || 0,
        // Other
        notes: customerData.notes || '',
        is_active: customerData.is_active,
      });

      // Phone displays
      if (customerData.phone) setPhoneDisplay(formatPhoneDisplay(customerData.phone));
      if (defaultAddr?.phone) setShippingPhoneDisplay(formatPhoneDisplay(defaultAddr.phone));

    } catch (err) {
      console.error('Error fetching customer:', err);
      setError('ไม่สามารถโหลดข้อมูลลูกค้าได้');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (value: string, isShipping: boolean = false) => {
    const normalized = normalizePhone(value);
    const formatted = formatPhoneDisplay(normalized);
    if (isShipping) {
      setShippingPhoneDisplay(formatted);
      setForm(prev => ({ ...prev, shipping_phone: normalized }));
    } else {
      setPhoneDisplay(formatted);
      setForm(prev => ({ ...prev, phone: normalized }));
    }
  };

  // Save customer + default shipping address
  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Determine billing address
      const billingAddress = form.billing_same_as_shipping
        ? [form.shipping_address, form.shipping_district, form.shipping_amphoe, form.shipping_province, form.shipping_postal_code].filter(Boolean).join(' ')
        : form.billing_address;

      // 1. Update customer
      const customerPayload = {
        id: customerId,
        name: form.name,
        contact_person: form.contact_person,
        phone: form.phone,
        email: form.email,
        customer_type: form.customer_type,
        credit_limit: form.credit_limit,
        credit_days: form.credit_days,
        is_active: form.is_active,
        notes: form.notes,
        tax_id: form.needs_tax_invoice ? form.tax_id : '',
        tax_company_name: form.needs_tax_invoice ? form.tax_company_name : '',
        tax_branch: form.needs_tax_invoice ? form.tax_branch : '',
        tax_address: billingAddress,
        tax_district: '',
        tax_amphoe: '',
        tax_province: '',
        tax_postal_code: '',
      };

      const customerRes = await apiFetch('/api/customers', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(customerPayload)
      });

      if (!customerRes.ok) {
        const result = await customerRes.json();
        throw new Error(result.error || 'ไม่สามารถบันทึกข้อมูลลูกค้าได้');
      }

      // 2. Update or create default shipping address
      const shippingPayload = {
        address_name: form.shipping_address_name || 'ที่อยู่หลัก',
        contact_person: form.shipping_contact_person || form.contact_person,
        phone: form.shipping_phone || form.phone,
        address_line1: form.shipping_address,
        district: form.shipping_district,
        amphoe: form.shipping_amphoe,
        province: form.shipping_province,
        postal_code: form.shipping_postal_code,
        google_maps_link: form.shipping_google_maps_link,
        delivery_notes: form.shipping_delivery_notes,
        is_default: true,
      };

      if (defaultAddressId) {
        // Update existing
        await apiFetch('/api/shipping-addresses', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: defaultAddressId, ...shippingPayload })
        });
      } else if (form.shipping_address || form.shipping_province) {
        // Create new default shipping address
        const addrRes = await apiFetch('/api/shipping-addresses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ customer_id: customerId, ...shippingPayload })
        });
        if (addrRes.ok) {
          const result = await addrRes.json();
          if (result.address?.id) setDefaultAddressId(result.address.id);
        }
      }

      // 3. Save tags
      await apiFetch(`/api/customers/${customerId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_ids: selectedTags.map(t => t.id) }),
      });

      setSuccess('บันทึกข้อมูลลูกค้าสำเร็จ');
      setTimeout(() => setSuccess(''), 3000);
      fetchAddresses();
    } catch (err) {
      console.error('Error saving customer:', err);
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
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

  // Additional branch addresses (non-default)
  const additionalAddresses = addresses.filter(a => a.id !== defaultAddressId);

  // Address modal handlers
  const resetAddressForm = () => {
    setAddressForm({
      address_name: '', contact_person: '', phone: '',
      address_line1: '', address_line2: '', district: '',
      amphoe: '', province: '', postal_code: '',
      google_maps_link: '', delivery_notes: '', is_default: false
    });
    setEditingAddress(null);
  };

  const handleEditAddress = (address: ShippingAddress) => {
    setEditingAddress(address);
    setAddressForm({
      address_name: address.address_name,
      contact_person: address.contact_person || '',
      phone: address.phone || '',
      address_line1: address.address_line1,
      address_line2: address.address_line2 || '',
      district: address.district || '',
      amphoe: address.amphoe || '',
      province: address.province,
      postal_code: address.postal_code || '',
      google_maps_link: address.google_maps_link || '',
      delivery_notes: address.delivery_notes || '',
      is_default: address.is_default
    });
    setShowAddressModal(true);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const method = editingAddress ? 'PUT' : 'POST';
      const payload = editingAddress
        ? { id: editingAddress.id, ...addressForm }
        : { customer_id: customerId, ...addressForm };

      const res = await apiFetch('/api/shipping-addresses', {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }

      setSuccess(editingAddress ? 'อัพเดทที่อยู่สำเร็จ' : 'เพิ่มที่อยู่สำเร็จ');
      setShowAddressModal(false);
      resetAddressForm();
      fetchAddresses();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    const ok = await confirm({ title: 'ต้องการลบที่อยู่นี้?', variant: 'danger' }); if (!ok) return;
    try {
      const res = await apiFetch(`/api/shipping-addresses?id=${addressId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSuccess('ลบที่อยู่สำเร็จ');
        fetchAddresses();
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch {
      setError('ไม่สามารถลบที่อยู่ได้');
    }
  };

  // Input class helper
  const inputClass = `w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] ${!canEdit ? 'bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-slate-400' : 'dark:bg-slate-900 dark:text-white'}`;

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!customer) {
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
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#F4511E] text-white px-5 py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          )}
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

        {!canEdit && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            คุณสามารถดูข้อมูลได้อย่างเดียว (ต้องเป็น Admin หรือ Manager เพื่อแก้ไข)
          </div>
        )}

        {/* 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ===== LEFT COLUMN ===== */}
          <div className="space-y-6">

            {/* Section 1: Basic Information */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">ข้อมูลพื้นฐาน</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    ชื่อลูกค้า <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    className={inputClass}
                    disabled={!canEdit}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ประเภทลูกค้า</label>
                    <FormSelect
                      value={form.customer_type}
                      onChange={(val) => setForm(prev => ({ ...prev, customer_type: val }))}
                      disabled={!canEdit}
                      options={[
                        { id: 'retail', label: 'ลูกค้าปลีก' },
                        { id: 'wholesale', label: 'ลูกค้าส่ง' },
                        { id: 'cash_dealer', label: 'ตัวแทนฯ เงินสด' },
                        { id: 'credit_dealer', label: 'ตัวแทนฯ เครดิต' },
                        { id: 'consignment_dealer', label: 'ตัวแทนฯ ฝากขาย' },
                        { id: 'sub_dealer', label: 'ตัวแทนย่อย' },
                        { id: 'department_store', label: 'ห้าง/Modern Trade' },
                        { id: 'distributor', label: 'ตัวกระจายสินค้า' },
                        { id: 'corporate', label: 'องค์กร/B2B' },
                        { id: 'project', label: 'ลูกค้าโครงการ' },
                        { id: 'marketplace_dealer', label: 'ตัวแทน Marketplace' },
                        { id: 'dropship', label: 'Dropship' },
                        { id: 'affiliate', label: 'Affiliate/KOL' },
                        { id: 'oem_odm', label: 'OEM/ODM' },
                        { id: 'regional_agent', label: 'ตัวแทนภูมิภาค' },
                        { id: 'government', label: 'ราชการ/หน่วยงานรัฐ' },
                      ]}
                      placeholder="-- เลือกประเภท --"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">อีเมล</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                      className={inputClass}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">แท็ก</label>
                  <TagInput
                    value={selectedTags}
                    onChange={setSelectedTags}
                    allTags={allTags}
                    onTagCreated={(tag) => setAllTags(prev => [...prev, tag])}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุ</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                    className={inputClass}
                    disabled={!canEdit}
                    rows={2}
                  />
                </div>

              </div>
            </div>

            {/* Section: Chat Channels */}
            {linkedContacts.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                ช่องทางแชท
                <span className="text-sm font-normal text-gray-500 dark:text-slate-400">({linkedContacts.length})</span>
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {linkedContacts.map(lc => (
                  <button
                    key={`${lc.platform}-${lc.id}`}
                    onClick={() => router.push(`/chat?contact_id=${lc.id}&platform=${lc.platform}`)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                  >
                    <div className="relative flex-shrink-0">
                      {lc.picture_url ? (
                        <img src={lc.picture_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center">
                          <User className="w-5 h-5 text-gray-500 dark:text-slate-400" />
                        </div>
                      )}
                      <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ${lc.platform === 'line' ? 'bg-[#06C755]' : 'bg-[#1877F2]'}`}>
                        {lc.platform === 'line' ? <MessageCircle className="w-2.5 h-2.5 text-white" /> : <Facebook className="w-2.5 h-2.5 text-white" />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="data-primary text-gray-900 dark:text-white truncate">{lc.display_name}</p>
                      <p className="data-secondary text-gray-500 dark:text-slate-400 truncate">
                        {lc.account_name || (lc.platform === 'line' ? 'LINE' : 'Facebook')}
                        {lc.last_message_at && (
                          <> · {new Date(lc.last_message_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</>
                        )}
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
            )}

            {/* Section: Tax Invoice (Optional) */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <div className="flex items-center gap-2 mb-4 cursor-pointer" onClick={() => { if (canEdit) setForm(prev => ({ ...prev, needs_tax_invoice: !prev.needs_tax_invoice })); }}>
                <Checkbox
                  checked={form.needs_tax_invoice}
                  onChange={(v) => setForm(prev => ({ ...prev, needs_tax_invoice: v }))}
                  disabled={!canEdit}
                />
                <span className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  ใบกำกับภาษี
                </span>
              </div>

              {form.needs_tax_invoice && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อบริษัท/ชื่อผู้เสียภาษี</label>
                    <input
                      type="text"
                      value={form.tax_company_name}
                      onChange={(e) => setForm(prev => ({ ...prev, tax_company_name: e.target.value }))}
                      className={inputClass}
                      disabled={!canEdit}
                      placeholder="บริษัท XXX จำกัด"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เลขประจำตัวผู้เสียภาษี</label>
                      <input
                        type="text"
                        value={form.tax_id}
                        onChange={(e) => setForm(prev => ({ ...prev, tax_id: e.target.value }))}
                        className={inputClass}
                        disabled={!canEdit}
                        placeholder="X-XXXX-XXXXX-XX-X"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">สาขา</label>
                      <input
                        type="text"
                        value={form.tax_branch}
                        onChange={(e) => setForm(prev => ({ ...prev, tax_branch: e.target.value }))}
                        className={inputClass}
                        disabled={!canEdit}
                        placeholder="สำนักงานใหญ่"
                      />
                    </div>
                  </div>

                  {/* Billing Address */}
                  <div>
                    <div className="mb-3">
                      <Checkbox
                        checked={form.billing_same_as_shipping}
                        onChange={(v) => setForm(prev => ({ ...prev, billing_same_as_shipping: v }))}
                        label="ใช้ที่อยู่เดียวกับที่อยู่จัดส่ง"
                        disabled={!canEdit}
                      />
                    </div>

                    {!form.billing_same_as_shipping && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่ออกบิล</label>
                        <textarea
                          value={form.billing_address}
                          onChange={(e) => setForm(prev => ({ ...prev, billing_address: e.target.value }))}
                          className={inputClass}
                          disabled={!canEdit}
                          rows={3}
                          placeholder="เลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Section: Credit Terms */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                เงื่อนไขเครดิต
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">วงเงินเครดิต (บาท)</label>
                  <input
                    type="number"
                    value={form.credit_limit}
                    onChange={(e) => setForm(prev => ({ ...prev, credit_limit: parseFloat(e.target.value) || 0 }))}
                    className={inputClass}
                    disabled={!canEdit}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ระยะเวลาเครดิต (วัน)</label>
                  <input
                    type="number"
                    value={form.credit_days}
                    onChange={(e) => setForm(prev => ({ ...prev, credit_days: parseInt(e.target.value) || 0 }))}
                    className={inputClass}
                    disabled={!canEdit}
                    min="0"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* ===== RIGHT COLUMN ===== */}
          <div className="space-y-6">

            {/* Section: Shipping Addresses */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  ที่อยู่จัดส่ง
                  {addresses.length > 1 && (
                    <span className="text-sm font-normal text-gray-500 dark:text-slate-400">
                      ({addresses.length} ที่อยู่)
                    </span>
                  )}
                </h3>
              </div>

              {/* Default address form */}
              <div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อที่อยู่</label>
                    <input
                      type="text"
                      value={form.shipping_address_name}
                      onChange={(e) => setForm(prev => ({ ...prev, shipping_address_name: e.target.value }))}
                      className={inputClass}
                      disabled={!canEdit}
                      placeholder="เช่น บ้าน, ออฟฟิศ, สำนักงานใหญ่"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ผู้รับสินค้า</label>
                      <input
                        type="text"
                        value={form.shipping_contact_person}
                        onChange={(e) => setForm(prev => ({ ...prev, shipping_contact_person: e.target.value }))}
                        className={inputClass}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทร</label>
                      <input
                        type="tel"
                        value={shippingPhoneDisplay}
                        onChange={(e) => handlePhoneChange(e.target.value, true)}
                        className={inputClass}
                        disabled={!canEdit}
                        placeholder="0xx-xxx-xxxx"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่</label>
                    <textarea
                      value={form.shipping_address}
                      onChange={(e) => setForm(prev => ({ ...prev, shipping_address: e.target.value }))}
                      onPaste={(e) => {
                        const pasted = e.clipboardData.getData('text');
                        if (pasted.length > 20) {
                          const parsed = parseThaiAddress(pasted);
                          if (parsed) {
                            e.preventDefault();
                            setForm(prev => ({
                              ...prev,
                              shipping_address: parsed.address || pasted,
                              shipping_district: parsed.district || prev.shipping_district,
                              shipping_amphoe: parsed.amphoe || prev.shipping_amphoe,
                              shipping_province: parsed.province || prev.shipping_province,
                              shipping_postal_code: parsed.postal_code || prev.shipping_postal_code,
                            }));
                          }
                        }
                      }}
                      className={inputClass}
                      disabled={!canEdit}
                      rows={2}
                      placeholder="วางที่อยู่เต็ม — ระบบจะแยกตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ให้อัตโนมัติ"
                    />
                  </div>

                  <ThaiAddressInput
                    district={form.shipping_district}
                    amphoe={form.shipping_amphoe}
                    province={form.shipping_province}
                    postalCode={form.shipping_postal_code}
                    onAddressChange={(addr) => setForm(prev => ({
                      ...prev,
                      ...(addr.district !== undefined && { shipping_district: addr.district }),
                      ...(addr.amphoe !== undefined && { shipping_amphoe: addr.amphoe }),
                      ...(addr.province !== undefined && { shipping_province: addr.province }),
                      ...(addr.postalCode !== undefined && { shipping_postal_code: addr.postalCode }),
                    }))}
                    disabled={!canEdit}
                    inputClassName={inputClass}
                  />

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      Google Maps Link
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={form.shipping_google_maps_link}
                        onChange={(e) => setForm(prev => ({ ...prev, shipping_google_maps_link: e.target.value }))}
                        className={`flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] ${!canEdit ? 'bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-slate-400' : ''}`}
                        disabled={!canEdit}
                        placeholder="วาง link Google Maps"
                      />
                      {form.shipping_google_maps_link && (
                        <a
                          href={form.shipping_google_maps_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1 text-sm whitespace-nowrap"
                        >
                          <ExternalLink className="w-4 h-4" />
                          เปิดแผนที่
                        </a>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุสำหรับการจัดส่ง</label>
                    <textarea
                      value={form.shipping_delivery_notes}
                      onChange={(e) => setForm(prev => ({ ...prev, shipping_delivery_notes: e.target.value }))}
                      className={inputClass}
                      disabled={!canEdit}
                      rows={2}
                      placeholder="เช่น ส่งช่วงเช้า, โทรก่อนส่ง"
                    />
                  </div>
                </div>
              </div>

              {/* Additional addresses — dynamic, only shows when they exist */}
              {additionalAddresses.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-500" />
                      <h4 className="font-medium text-gray-800 dark:text-slate-200">ที่อยู่เพิ่มเติม</h4>
                      <span className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                        {additionalAddresses.length}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {additionalAddresses.map((address) => (
                      <div
                        key={address.id}
                        className="border border-gray-200 dark:border-slate-700 rounded-lg p-3 hover:border-[#F4511E] transition-colors"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <h5 className="font-semibold text-base text-gray-900 dark:text-white">{address.address_name}</h5>
                          {canEdit && (
                            <div className="flex gap-1.5">
                              <button onClick={() => handleEditAddress(address)} className="text-gray-400 hover:text-[#F4511E]">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteAddress(address.id)} className="text-gray-400 hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="data-text text-gray-600 dark:text-slate-400 space-y-0.5">
                          <p>
                            {[address.address_line1, address.district,
                              address.amphoe, address.province, address.postal_code].filter(Boolean).join(' ')}
                          </p>
                          {address.contact_person && (
                            <p className="flex items-center gap-1"><Building2 className="w-3 h-3" />{address.contact_person} {address.phone && `(${address.phone})`}</p>
                          )}
                          {address.google_maps_link && (
                            <a href={address.google_maps_link} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[#F4511E] hover:underline">
                              <ExternalLink className="w-3 h-3" />Google Maps
                            </a>
                          )}
                          {address.delivery_notes && (
                            <p className="text-gray-500 dark:text-slate-500 bg-gray-50 dark:bg-slate-700/50 rounded px-2 py-1 mt-1">
                              {address.delivery_notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add address button */}
              {canEdit && (
                <div className="mt-4">
                  <button
                    onClick={() => { resetAddressForm(); setShowAddressModal(true); }}
                    className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-[#F4511E] hover:text-[#F4511E] transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    เพิ่มที่อยู่
                  </button>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Bottom Buttons */}
        {canEdit && (
          <div className="flex justify-end gap-3">
            <button
              onClick={() => router.push('/customers')}
              disabled={saving}
              className="px-6 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#F4511E] text-white px-6 py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        )}
      </div>

      {/* Address Modal (for additional branches) */}
      {showAddressModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => { setShowAddressModal(false); resetAddressForm(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setShowAddressModal(false); resetAddressForm(); } }}
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
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      placeholder="เช่น สาขาลาดพร้าว, คลังบางนา"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ผู้รับสินค้า</label>
                      <input
                        type="text"
                        value={addressForm.contact_person}
                        onChange={(e) => setAddressForm({ ...addressForm, contact_person: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทรผู้รับ</label>
                      <input
                        type="tel"
                        value={addressForm.phone}
                        onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                        placeholder="0xx-xxx-xxxx"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      ที่อยู่จัดส่ง <span className="text-red-500">*</span>
                    </label>
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
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      rows={2}
                      placeholder="วางที่อยู่เต็ม — ระบบจะแยกตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ให้อัตโนมัติ"
                      required
                    />
                  </div>

                  <ThaiAddressInput
                    district={addressForm.district}
                    amphoe={addressForm.amphoe}
                    province={addressForm.province}
                    postalCode={addressForm.postal_code}
                    onAddressChange={(addr) => setAddressForm(prev => ({
                      ...prev,
                      ...(addr.district !== undefined && { district: addr.district }),
                      ...(addr.amphoe !== undefined && { amphoe: addr.amphoe }),
                      ...(addr.province !== undefined && { province: addr.province }),
                      ...(addr.postalCode !== undefined && { postal_code: addr.postalCode }),
                    }))}
                    inputClassName="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  />

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      Google Maps Link
                    </label>
                    <input
                      type="url"
                      value={addressForm.google_maps_link}
                      onChange={(e) => setAddressForm({ ...addressForm, google_maps_link: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      placeholder="วาง link Google Maps"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุสำหรับการจัดส่ง</label>
                    <textarea
                      value={addressForm.delivery_notes}
                      onChange={(e) => setAddressForm({ ...addressForm, delivery_notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      rows={2}
                      placeholder="เช่น ส่งช่วงเช้า, โทรก่อนส่ง"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => { setShowAddressModal(false); resetAddressForm(); }}
                    className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 dark:bg-slate-900"
                    disabled={saving}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="bg-[#F4511E] text-white px-4 py-2 rounded-lg hover:bg-[#D63B0E] disabled:opacity-50 flex items-center"
                    disabled={saving}
                  >
                    {saving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />กำลังบันทึก...</>
                    ) : 'บันทึก'}
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
