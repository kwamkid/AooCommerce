// Path: app/customers/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
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
  UserCircle
} from 'lucide-react';

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
  tax_company_name?: string;
  tax_branch?: string;
  customer_type: 'retail' | 'wholesale' | 'distributor';
  customer_type_new?: 'retail' | 'wholesale' | 'distributor';
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

// Parse address (Thai + English): extract district, amphoe, province, postal_code
const parseThaiAddress = (text: string) => {
  const result = { address: '', district: '', amphoe: '', province: '', postal_code: '' };

  // Normalize whitespace
  let s = text.replace(/\s+/g, ' ').trim();

  // Extract postal code (5 digits)
  const postalMatch = s.match(/\b(\d{5})\b/);
  if (postalMatch) {
    result.postal_code = postalMatch[1];
    s = s.replace(postalMatch[0], '').trim();
  }

  // Extract province — Thai: จ./จังหวัด, English: "X Province" or "Province X"
  const provinceSuffixMatch = s.match(/([A-Za-z][A-Za-z ]+?)\s+[Pp]rovince/);
  const provincePrefixMatch = s.match(/(?:จ\.|จังหวัด|[Pp]rovince|[Pp]rov\.|[Cc]hangwat)\s+([^\s,]+(?:\s+[^\s,]+)?)/);
  const provinceMatch = provinceSuffixMatch || provincePrefixMatch;
  if (provinceMatch) {
    result.province = provinceMatch[1].trim();
    s = s.replace(provinceMatch[0], '').trim();
  }

  // Extract amphoe — Thai: อ./อำเภอ/เขต, English: "X District" or "District X"
  const amphoeSuffixMatch = s.match(/([A-Za-z][A-Za-z ]+?)\s+[Dd]istrict/);
  const amphoePrefixMatch = s.match(/(?:อ\.|อำเภอ|เขต|[Dd]istrict|[Dd]ist\.|[Aa]mphoe|[Kk]het)\s+([^\s,]+(?:\s+[^\s,]+)?)/);
  const amphoeMatch = amphoeSuffixMatch || amphoePrefixMatch;
  if (amphoeMatch) {
    result.amphoe = amphoeMatch[1].trim();
    s = s.replace(amphoeMatch[0], '').trim();
  }

  // Extract district (sub-district) — Thai: ต./ตำบล/แขวง, English: "X Sub-district" or "Sub-district X"
  const districtSuffixMatch = s.match(/([A-Za-z][A-Za-z ]+?)\s+[Ss]ub-?[Dd]istrict/);
  const districtPrefixMatch = s.match(/(?:ต\.|ตำบล|แขวง|[Ss]ub-?[Dd]istrict|[Tt]ambon|[Kk]hwaeng)\s+([^\s,]+(?:\s+[^\s,]+)?)/);
  const districtMatch = districtSuffixMatch || districtPrefixMatch;
  if (districtMatch) {
    result.district = districtMatch[1].trim();
    s = s.replace(districtMatch[0], '').trim();
  }

  // Clean up remaining separators
  result.address = s.replace(/[,\s]+$/, '').replace(/^[,\s]+/, '').replace(/,{2,}/g, ',').trim();

  // Only return parsed result if we found at least one field beyond address
  const hasParsed = result.district || result.amphoe || result.province || result.postal_code;
  return hasParsed ? result : null;
};

export default function CustomerEditPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const customerId = params.id as string;

  // Permission: admin & manager can edit
  const canEdit = userProfile?.role === 'owner' || userProfile?.role === 'admin' || userProfile?.role === 'manager';

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
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
    customer_type: 'retail' as 'retail' | 'wholesale' | 'distributor',
    // Shipping address (default branch)
    shipping_address_name: 'สาขาหลัก',
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
      setForm(prev => ({
        ...prev,
        billing_address: prev.shipping_address,
        billing_district: prev.shipping_district,
        billing_amphoe: prev.shipping_amphoe,
        billing_province: prev.shipping_province,
        billing_postal_code: prev.shipping_postal_code,
      }));
    }
  }, [form.billing_same_as_shipping, form.shipping_address, form.shipping_district,
      form.shipping_amphoe, form.shipping_province, form.shipping_postal_code]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch customer and addresses in parallel
      const [customerRes, addressRes] = await Promise.all([
        apiFetch('/api/customers'),
        apiFetch(`/api/shipping-addresses?customer_id=${customerId}`)
      ]);

      const customerResult = await customerRes.json();
      const addressResult = await addressRes.json();

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

      // Check if billing == shipping
      const billingSameAsShipping = !customerData.address ||
        (defaultAddr && customerData.address === defaultAddr.address_line1 &&
         (customerData.district || '') === (defaultAddr.district || '') &&
         (customerData.amphoe || '') === (defaultAddr.amphoe || '') &&
         (customerData.province || '') === (defaultAddr.province || '') &&
         (customerData.postal_code || '') === (defaultAddr.postal_code || ''));

      // Populate form
      setForm({
        name: customerData.name || '',
        contact_person: customerData.contact_person || '',
        phone: customerData.phone || '',
        email: customerData.email || '',
        customer_type: customerData.customer_type,
        // Shipping from default address
        shipping_address_name: defaultAddr?.address_name || 'สาขาหลัก',
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
        billing_address: customerData.address || '',
        billing_district: customerData.district || '',
        billing_amphoe: customerData.amphoe || '',
        billing_province: customerData.province || '',
        billing_postal_code: customerData.postal_code || '',
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
      const billingAddress = form.billing_same_as_shipping ? form.shipping_address : form.billing_address;
      const billingDistrict = form.billing_same_as_shipping ? form.shipping_district : form.billing_district;
      const billingAmphoe = form.billing_same_as_shipping ? form.shipping_amphoe : form.billing_amphoe;
      const billingProvince = form.billing_same_as_shipping ? form.shipping_province : form.billing_province;
      const billingPostalCode = form.billing_same_as_shipping ? form.shipping_postal_code : form.billing_postal_code;

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
        address: billingAddress,
        district: billingDistrict,
        amphoe: billingAmphoe,
        province: billingProvince,
        postal_code: billingPostalCode,
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
        address_name: form.shipping_address_name || 'สาขาหลัก',
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
    if (!confirm('คุณต้องการลบที่อยู่นี้ใช่หรือไม่?')) return;
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
                <p className="text-sm text-gray-500 dark:text-slate-400">รหัส: {customer.customer_code}</p>
              </div>
              {!form.is_active && (
                <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">ปิดใช้งาน</span>
              )}
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

        {/* Section 1: Basic Information */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">ข้อมูลพื้นฐาน</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                ชื่อร้าน/ชื่อลูกค้า <span className="text-red-500">*</span>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ประเภทลูกค้า</label>
              <select
                value={form.customer_type}
                onChange={(e) => setForm(prev => ({ ...prev, customer_type: e.target.value as 'retail' | 'wholesale' | 'distributor' }))}
                className={inputClass}
                disabled={!canEdit}
              >
                <option value="retail">ขายปลีก</option>
                <option value="wholesale">ขายส่ง</option>
                <option value="distributor">ตัวแทนจำหน่าย</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ผู้ติดต่อ</label>
              <input
                type="text"
                value={form.contact_person}
                onChange={(e) => setForm(prev => ({ ...prev, contact_person: e.target.value }))}
                className={inputClass}
                disabled={!canEdit}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทร</label>
              <input
                type="tel"
                value={phoneDisplay}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className={inputClass}
                disabled={!canEdit}
                placeholder="0xx-xxx-xxxx"
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
        </div>

        {/* Section 2: Shipping Addresses — left: default branch form, right: additional branches */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Truck className="w-5 h-5" />
              ที่อยู่จัดส่ง
              <span className="text-sm font-normal text-gray-500 dark:text-slate-400">
                (ทั้งหมด {addresses.length} สาขา)
              </span>
            </h3>
            {canEdit && (
              <button
                onClick={() => { resetAddressForm(); setShowAddressModal(true); }}
                className="bg-[#F4511E] text-white px-3 py-1.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center text-sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                เพิ่มสาขา
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Default branch form */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-[#F4511E]" />
                <h4 className="font-medium text-gray-800 dark:text-slate-200">สาขาหลัก <span className="text-xs font-normal text-gray-400 dark:text-slate-500">(ที่อยู่หลัก)</span></h4>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อสาขา</label>
                  <input
                    type="text"
                    value={form.shipping_address_name}
                    onChange={(e) => setForm(prev => ({ ...prev, shipping_address_name: e.target.value }))}
                    className={inputClass}
                    disabled={!canEdit}
                    placeholder="เช่น สำนักงานใหญ่, สาขาหลัก"
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทรผู้รับ</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่จัดส่ง</label>
                  <textarea
                    value={form.shipping_address}
                    onChange={(e) => setForm(prev => ({ ...prev, shipping_address: e.target.value }))}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text');
                      const parsed = parseThaiAddress(pasted);
                      if (parsed) {
                        e.preventDefault();
                        setForm(prev => ({
                          ...prev,
                          shipping_address: parsed.address || prev.shipping_address,
                          shipping_district: parsed.district || prev.shipping_district,
                          shipping_amphoe: parsed.amphoe || prev.shipping_amphoe,
                          shipping_province: parsed.province || prev.shipping_province,
                          shipping_postal_code: parsed.postal_code || prev.shipping_postal_code,
                        }));
                      }
                    }}
                    className={inputClass}
                    disabled={!canEdit}
                    rows={2}
                    placeholder="วางที่อยู่เต็ม — ระบบจะแยกตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ให้อัตโนมัติ"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ตำบล/แขวง</label>
                    <input
                      type="text"
                      value={form.shipping_district}
                      onChange={(e) => setForm(prev => ({ ...prev, shipping_district: e.target.value }))}
                      className={inputClass}
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">อำเภอ/เขต</label>
                    <input
                      type="text"
                      value={form.shipping_amphoe}
                      onChange={(e) => setForm(prev => ({ ...prev, shipping_amphoe: e.target.value }))}
                      className={inputClass}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">จังหวัด</label>
                    <input
                      type="text"
                      value={form.shipping_province}
                      onChange={(e) => setForm(prev => ({ ...prev, shipping_province: e.target.value }))}
                      className={inputClass}
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">รหัสไปรษณีย์</label>
                    <input
                      type="text"
                      value={form.shipping_postal_code}
                      onChange={(e) => setForm(prev => ({ ...prev, shipping_postal_code: e.target.value }))}
                      className={inputClass}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

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

            {/* Right: Additional branches */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-gray-500" />
                <h4 className="font-medium text-gray-800 dark:text-slate-200">สาขาเพิ่มเติม</h4>
                {additionalAddresses.length > 0 && (
                  <span className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                    {additionalAddresses.length}
                  </span>
                )}
              </div>

              {additionalAddresses.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-lg p-6 text-center text-gray-400 dark:text-slate-500">
                  <MapPin className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">ยังไม่มีสาขาเพิ่มเติม</p>
                  {canEdit && (
                    <button
                      onClick={() => { resetAddressForm(); setShowAddressModal(true); }}
                      className="mt-2 text-sm text-[#F4511E] hover:underline"
                    >
                      + เพิ่มสาขา
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {additionalAddresses.map((address) => (
                    <div
                      key={address.id}
                      className="border border-gray-200 dark:border-slate-700 rounded-lg p-3 hover:border-[#F4511E] transition-colors"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h5 className="font-semibold text-sm text-gray-900 dark:text-white">{address.address_name}</h5>
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
                      <div className="text-xs text-gray-600 dark:text-slate-400 space-y-0.5">
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
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Tax Invoice (Optional) */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <label className="flex items-center gap-2 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={form.needs_tax_invoice}
              onChange={(e) => setForm(prev => ({ ...prev, needs_tax_invoice: e.target.checked }))}
              className="rounded border-gray-300 text-[#F4511E] focus:ring-[#F4511E]"
              disabled={!canEdit}
            />
            <span className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              ใบกำกับภาษี
            </span>
          </label>

          {form.needs_tax_invoice && (
            <div className="pl-6 border-l-2 border-[#F4511E] space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
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
                <label className="flex items-center gap-2 text-sm mb-3">
                  <input
                    type="checkbox"
                    checked={form.billing_same_as_shipping}
                    onChange={(e) => setForm(prev => ({ ...prev, billing_same_as_shipping: e.target.checked }))}
                    className="rounded border-gray-300 text-[#F4511E] focus:ring-[#F4511E]"
                    disabled={!canEdit}
                  />
                  <span className="text-gray-700 dark:text-slate-300">ใช้ที่อยู่เดียวกับที่อยู่จัดส่ง</span>
                </label>

                {!form.billing_same_as_shipping && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่ออกบิล</label>
                      <textarea
                        value={form.billing_address}
                        onChange={(e) => setForm(prev => ({ ...prev, billing_address: e.target.value }))}
                        className={inputClass}
                        disabled={!canEdit}
                        rows={2}
                        placeholder="บ้านเลขที่ ซอย ถนน"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ตำบล/แขวง</label>
                      <input
                        type="text"
                        value={form.billing_district}
                        onChange={(e) => setForm(prev => ({ ...prev, billing_district: e.target.value }))}
                        className={inputClass}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">อำเภอ/เขต</label>
                      <input
                        type="text"
                        value={form.billing_amphoe}
                        onChange={(e) => setForm(prev => ({ ...prev, billing_amphoe: e.target.value }))}
                        className={inputClass}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">จังหวัด</label>
                      <input
                        type="text"
                        value={form.billing_province}
                        onChange={(e) => setForm(prev => ({ ...prev, billing_province: e.target.value }))}
                        className={inputClass}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">รหัสไปรษณีย์</label>
                      <input
                        type="text"
                        value={form.billing_postal_code}
                        onChange={(e) => setForm(prev => ({ ...prev, billing_postal_code: e.target.value }))}
                        className={inputClass}
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Credit Terms */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            เงื่อนไขเครดิต
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* Section 5: Notes & Status */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุ</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                className={inputClass}
                disabled={!canEdit}
                rows={3}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                className="rounded border-gray-300 text-[#F4511E] focus:ring-[#F4511E]"
                disabled={!canEdit}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">ใช้งาน</span>
            </label>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6 dark:text-white">
                {editingAddress ? 'แก้ไขที่อยู่จัดส่ง' : 'เพิ่มสาขาจัดส่ง'}
              </h2>

              <form onSubmit={handleSaveAddress}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      ชื่อสาขา <span className="text-red-500">*</span>
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
                        const parsed = parseThaiAddress(pasted);
                        if (parsed) {
                          e.preventDefault();
                          setAddressForm(prev => ({
                            ...prev,
                            address_line1: parsed.address || prev.address_line1,
                            district: parsed.district || prev.district,
                            amphoe: parsed.amphoe || prev.amphoe,
                            province: parsed.province || prev.province,
                            postal_code: parsed.postal_code || prev.postal_code,
                          }));
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      rows={2}
                      placeholder="วางที่อยู่เต็ม — ระบบจะแยกตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ให้อัตโนมัติ"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ตำบล/แขวง</label>
                      <input
                        type="text"
                        value={addressForm.district}
                        onChange={(e) => setAddressForm({ ...addressForm, district: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">อำเภอ/เขต</label>
                      <input
                        type="text"
                        value={addressForm.amphoe}
                        onChange={(e) => setAddressForm({ ...addressForm, amphoe: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        จังหวัด <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={addressForm.province}
                        onChange={(e) => setAddressForm({ ...addressForm, province: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">รหัสไปรษณีย์</label>
                      <input
                        type="text"
                        value={addressForm.postal_code}
                        onChange={(e) => setAddressForm({ ...addressForm, postal_code: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      />
                    </div>
                  </div>

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
    </Layout>
  );
}
