'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Loader2,
  Check,
  MapPin,
  ExternalLink,
  Building2,
  Truck,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Facebook,
  User,
  UserCircle,
} from 'lucide-react';

// Lazy-loaded type-specific settings panels
const ConsignmentSettings = dynamic(() => import('./settings/ConsignmentSettings'), { ssr: false });
const DepartmentStoreSettings = dynamic(() => import('./settings/DepartmentStoreSettings'), { ssr: false });
import Checkbox from '@/components/ui/Checkbox';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import FormSelect from '@/components/ui/FormSelect';
import TagInput from '@/components/ui/TagInput';
import { Tag } from '@/components/ui/TagBadge';
import { useToast } from '@/lib/toast-context';
import { parseThaiAddress } from '@/lib/address-parser';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { type BrandGpRow } from '@/components/customers/BrandGpCommissions';

// Additional shipping address interface
export interface ShippingAddressData {
  address_name: string;
  contact_person: string;
  phone: string;
  address_line1: string;
  district: string;
  amphoe: string;
  province: string;
  postal_code: string;
  google_maps_link: string;
  delivery_notes: string;
}

// Existing DB address (edit mode)
export interface ExistingAddress {
  id: string;
  address_name: string;
  contact_person?: string;
  phone?: string;
  address_line1: string;
  district?: string;
  amphoe?: string;
  province: string;
  postal_code?: string;
  google_maps_link?: string;
  delivery_notes?: string;
  is_default: boolean;
}

// Linked chat contact (edit mode)
export interface LinkedContact {
  id: string;
  platform: 'line' | 'facebook';
  display_name: string;
  picture_url?: string;
  last_message_at?: string;
  account_name?: string;
}

// Form data interface
export interface CustomerFormData {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  customer_type: string;
  sale_type: string; // consignment | wholesale_cash | wholesale_credit | '' (retail/dropship/affiliate)
  credit_limit: number;
  credit_days: number;
  is_active: boolean;
  notes: string;
  // Shipping address (primary)
  has_multiple_branches: boolean;
  shipping_address_name: string;
  shipping_contact_person: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_district: string;
  shipping_amphoe: string;
  shipping_province: string;
  shipping_postal_code: string;
  shipping_google_maps_link: string;
  shipping_delivery_notes: string;
  // Tax invoice info (optional)
  needs_tax_invoice: boolean;
  tax_company_name: string;
  tax_id: string;
  tax_branch: string;
  // Billing address
  billing_address: string;
  billing_district: string;
  billing_amphoe: string;
  billing_province: string;
  billing_postal_code: string;
  billing_same_as_shipping: boolean;
  // Additional shipping addresses (new, not yet in DB)
  additional_addresses?: ShippingAddressData[];
  // Consignment fields (only for consignment_dealer)
  consignment_mode?: string;
  consignment_gp_rate?: number | '';
  consignment_gp_base_price?: 'retail' | 'discounted' | null;
  consignment_report_due_days?: number | '';
  consignment_payment_terms?: number | '';
  contract_number?: string;
  contract_date?: string;
  rd_submitted_at?: string;
}

interface CustomerFormProps {
  initialData?: Partial<CustomerFormData>;
  onSubmit: (data: CustomerFormData, resolvedCustomerId: string, brandGpRows?: BrandGpRow[]) => Promise<void>;
  onCancel: () => void;
  isEditing?: boolean;
  isLoading?: boolean;
  compact?: boolean;
  lineDisplayName?: string;
  customerId?: string; // pass existing ID when editing
  // Tags
  allTags?: Tag[];
  selectedTags?: Tag[];
  onTagsChange?: (tags: Tag[]) => void;
  onTagCreated?: (tag: Tag) => void;
  // Edit mode extras
  linkedContacts?: LinkedContact[];
  existingAddresses?: ExistingAddress[]; // non-default addresses already in DB
  onEditAddress?: (address: ExistingAddress) => void;
  onDeleteAddress?: (addressId: string) => void;
  onAddAddress?: () => void;
  onNavigateToChat?: (contactId: string, platform: string) => void;
}

// Phone number formatting utilities
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
  if (cleaned.startsWith('66')) {
    cleaned = '0' + cleaned.slice(2);
  }
  if (cleaned.length === 9 && !cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }
  return cleaned;
};

const validatePhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  return (cleaned.length === 10 || cleaned.length === 9) && cleaned.startsWith('0');
};

const emptyAddress: ShippingAddressData = {
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
};

// Customer types — some have sale_type sub-options
const ALL_CUSTOMER_TYPE_OPTIONS = [
  { id: 'retail',             label: 'ลูกค้าปลีก/ส่ง',     requiredFeature: null },
  { id: 'dealer',             label: 'ตัวแทน',             requiredFeature: 'consignment' as const },
  { id: 'department_store',   label: 'ห้าง/Modern Trade',  requiredFeature: 'department_store' as const },
  { id: 'corporate',          label: 'Corporate/B2B',       requiredFeature: null },
  { id: 'dropship',           label: 'Dropship',            requiredFeature: null },
  { id: 'affiliate',          label: 'Affiliate/KOL',       requiredFeature: null },
];

// Sub-type options per customer_type
const SALE_TYPE_OPTIONS: Record<string, { id: string; label: string; desc: string }[]> = {
  dealer: [
    { id: 'consignment',      label: 'ฝากขาย',           desc: 'สัญญา ม.78(3) — เก็บเงินเมื่อขายได้' },
    { id: 'wholesale_cash',   label: 'ขายขาดเงินสด',     desc: 'ส่งของแล้วเก็บเงินทันที' },
    { id: 'wholesale_credit', label: 'ขายขาดเครดิต',     desc: 'ส่งของก่อน เก็บเงินทีหลัง' },
  ],
  department_store: [
    { id: 'consignment',      label: 'ฝากขาย',           desc: 'ส่งของ + TAX ทันที — เก็บเงินเมื่อขายได้' },
    { id: 'wholesale_cash',   label: 'ขายขาดเงินสด',     desc: 'ส่งของแล้วเก็บเงินทันที' },
    { id: 'wholesale_credit', label: 'ขายขาดเครดิต',     desc: 'ส่งของก่อน เก็บเงินทีหลัง' },
  ],
  corporate: [
    { id: 'wholesale_cash',   label: 'เงินสด',            desc: 'ชำระเงินทันที' },
    { id: 'wholesale_credit', label: 'เครดิต',            desc: 'ส่งของก่อน เก็บเงินทีหลัง' },
  ],
};

/** Map customer_type + sale_type → internal DB customer_type (backward compat) */
function resolveDbCustomerType(type: string, saleType: string): string {
  if (type === 'dealer' && saleType === 'consignment') return 'consignment_dealer';
  if (type === 'dealer') return 'wholesale_dealer';
  if (type === 'department_store' && saleType === 'consignment') return 'department_store';
  if (type === 'department_store') return 'wholesale_department';
  return type; // retail, corporate, dropship, affiliate as-is
}

/** Map DB customer_type → form customer_type + sale_type */
function resolveFormType(dbType: string, dbSaleType: string | null): { customer_type: string; sale_type: string } {
  if (dbType === 'consignment_dealer') return { customer_type: 'dealer', sale_type: 'consignment' };
  if (dbType === 'wholesale_dealer') return { customer_type: 'dealer', sale_type: dbSaleType || 'wholesale_cash' };
  if (dbType === 'department_store') return { customer_type: 'department_store', sale_type: dbSaleType || 'consignment' };
  if (dbType === 'wholesale_department') return { customer_type: 'department_store', sale_type: dbSaleType || 'wholesale_cash' };
  if (dbType === 'credit') return { customer_type: 'corporate', sale_type: 'wholesale_credit' };
  if (dbType === 'corporate') return { customer_type: 'corporate', sale_type: dbSaleType || 'wholesale_credit' };
  return { customer_type: dbType || 'retail', sale_type: dbSaleType || '' };
}

const defaultFormData: CustomerFormData = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  customer_type: 'retail',
  sale_type: '',
  credit_limit: 0,
  credit_days: 0,
  is_active: true,
  notes: '',
  has_multiple_branches: false,
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
  needs_tax_invoice: false,
  tax_company_name: '',
  tax_id: '',
  tax_branch: 'สำนักงานใหญ่',
  billing_address: '',
  billing_district: '',
  billing_amphoe: '',
  billing_province: '',
  billing_postal_code: '',
  billing_same_as_shipping: true,
  consignment_mode: '',
  consignment_gp_rate: '',
  consignment_gp_base_price: null,
  consignment_report_due_days: '',
  consignment_payment_terms: '',
  contract_number: '',
  contract_date: '',
  rd_submitted_at: '',
};

/** Build API payload from form data — shared by all pages that create/update customers */
export function buildCustomerPayload(data: CustomerFormData, customerId?: string) {
  const billingAddress = data.billing_same_as_shipping
    ? [data.shipping_address, data.shipping_district, data.shipping_amphoe, data.shipping_province, data.shipping_postal_code].filter(Boolean).join(' ')
    : data.billing_address;

  const isConsignment = data.customer_type === 'consignment_dealer';

  return {
    ...(customerId ? { id: customerId } : {}),
    name: data.name,
    contact_person: data.contact_person,
    phone: data.phone,
    email: data.email,
    customer_type: data.customer_type,
    credit_limit: data.credit_limit,
    credit_days: data.credit_days,
    is_active: data.is_active,
    notes: data.notes,
    tax_id: data.needs_tax_invoice ? data.tax_id : '',
    tax_company_name: data.needs_tax_invoice ? data.tax_company_name : '',
    tax_branch: data.needs_tax_invoice ? data.tax_branch : '',
    billing_address: billingAddress,
    billing_district: '',
    billing_amphoe: '',
    billing_province: '',
    billing_postal_code: '',
    // Consignment fields — only sent when relevant
    ...(isConsignment ? {
      consignment_mode: data.consignment_mode || null,
      consignment_gp_rate: data.consignment_gp_rate !== '' ? data.consignment_gp_rate : null,
      consignment_report_due_days: data.consignment_report_due_days !== '' ? data.consignment_report_due_days : null,
      consignment_payment_terms: data.consignment_payment_terms !== '' ? data.consignment_payment_terms : null,
      contract_number: data.contract_number || null,
      contract_date: data.contract_date || null,
      rd_submitted_at: data.rd_submitted_at || null,
    } : {}),
  };
}

// Input class helpers
const inputFull = "w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] bg-white dark:bg-slate-800 text-gray-900 dark:text-white";
const inputCompact = "w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white";
const labelFull = "label";
const labelCompact = "block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1";

export default function CustomerForm({
  initialData,
  onSubmit,
  onCancel,
  isEditing = false,
  isLoading = false,
  compact = false,
  lineDisplayName,
  customerId,
  allTags,
  selectedTags,
  onTagsChange,
  onTagCreated,
  linkedContacts = [],
  existingAddresses = [],
  onEditAddress,
  onDeleteAddress,
  onAddAddress,
  onNavigateToChat,
}: CustomerFormProps) {
  const { showToast } = useToast();
  const { features } = useFeatures();

  // Stable customer ID
  const resolvedCustomerIdRef = useRef<string>(customerId || crypto.randomUUID());
  const resolvedCustomerId = resolvedCustomerIdRef.current;

  // Filter customer types based on enabled features
  const CUSTOMER_TYPE_OPTIONS = ALL_CUSTOMER_TYPE_OPTIONS.filter(opt => {
    if (!opt.requiredFeature) return true;
    return features[opt.requiredFeature];
  });

  // Resolve DB customer_type → form customer_type + sale_type
  const resolvedTypes = initialData?.customer_type
    ? resolveFormType(initialData.customer_type, (initialData as Record<string, unknown>).sale_type as string | null)
    : { customer_type: 'retail', sale_type: '' };

  const [formData, setFormData] = useState<CustomerFormData>({
    ...defaultFormData,
    ...initialData,
    customer_type: resolvedTypes.customer_type,
    sale_type: initialData?.sale_type || resolvedTypes.sale_type,
    name: initialData?.name || lineDisplayName || '',
    contact_person: initialData?.contact_person || lineDisplayName || ''
  });
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [showPhoneError, setShowPhoneError] = useState(false);
  const [showMapSection, setShowMapSection] = useState(false);

  // Brand GP rows (virtual — saved on form submit)
  const [brandGpRows, setBrandGpRows] = useState<BrandGpRow[]>([]);

  // Load existing brand GP commissions for edit mode
  useEffect(() => {
    if (!isEditing || !customerId) return;
    apiFetch(`/api/customer-brand-commissions?customer_id=${customerId}`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => {
        const rows: BrandGpRow[] = (d.data || []).map((c: { brand_id: string; gp_rate: number; gp_base_price?: string; brand?: { name: string } }) => ({
          brand_id: c.brand_id,
          brand_name: c.brand?.name,
          gp_rate: String(c.gp_rate ?? ''),
          gp_base_price: (c.gp_base_price as 'retail' | 'discounted') || 'retail',
        }));
        setBrandGpRows(rows);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, customerId]);

  // New addresses (not yet in DB — for new customer creation)
  const [additionalAddresses, setAdditionalAddresses] = useState<ShippingAddressData[]>(
    initialData?.additional_addresses || []
  );
  const [additionalPhoneDisplays, setAdditionalPhoneDisplays] = useState<string[]>([]);
  const [expandedAddresses, setExpandedAddresses] = useState<Set<number>>(new Set());

  // Initialize phone displays
  useEffect(() => {
    if (formData.phone) setPhoneDisplay(formatPhoneDisplay(formData.phone));
    setAdditionalPhoneDisplays(additionalAddresses.map(a => a.phone ? formatPhoneDisplay(a.phone) : ''));

  }, []);

  const handlePhoneChange = (value: string) => {
    const normalized = normalizePhone(value);
    const formatted = formatPhoneDisplay(normalized);
    setPhoneDisplay(formatted);
    setFormData(prev => ({ ...prev, phone: normalized }));
  };

  const handleAdditionalPhoneChange = (index: number, value: string) => {
    const normalized = normalizePhone(value);
    const formatted = formatPhoneDisplay(normalized);
    setAdditionalPhoneDisplays(prev => { const next = [...prev]; next[index] = formatted; return next; });
    setAdditionalAddresses(prev => prev.map((a, i) => i === index ? { ...a, phone: normalized } : a));
  };

  // Copy shipping to billing when checkbox changes
  useEffect(() => {
    if (formData.billing_same_as_shipping) {
      const combined = [formData.shipping_address, formData.shipping_district, formData.shipping_amphoe, formData.shipping_province, formData.shipping_postal_code].filter(Boolean).join(' ');
      setFormData(prev => ({ ...prev, billing_address: combined }));
    }
  }, [formData.billing_same_as_shipping, formData.shipping_address, formData.shipping_district,
      formData.shipping_amphoe, formData.shipping_province, formData.shipping_postal_code]);

  // Additional addresses helpers
  const addAddress = () => {
    setAdditionalAddresses(prev => [...prev, { ...emptyAddress }]);
    setAdditionalPhoneDisplays(prev => [...prev, '']);
    setExpandedAddresses(prev => new Set([...prev, additionalAddresses.length]));
  };

  const removeAddress = (index: number) => {
    setAdditionalAddresses(prev => prev.filter((_, i) => i !== index));
    setAdditionalPhoneDisplays(prev => prev.filter((_, i) => i !== index));
    setExpandedAddresses(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i < index) next.add(i); else if (i > index) next.add(i - 1); });
      return next;
    });
  };

  const updateAddress = (index: number, field: keyof ShippingAddressData, value: string) => {
    setAdditionalAddresses(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  };

  const toggleExpanded = (index: number) => {
    setExpandedAddresses(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const handlePrimaryAddressPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.length > 20) {
      const parsed = parseThaiAddress(pasted);
      if (parsed) {
        e.preventDefault();
        setFormData(prev => ({
          ...prev,
          shipping_address: parsed.address || pasted,
          shipping_district: parsed.district || prev.shipping_district,
          shipping_amphoe: parsed.amphoe || prev.shipping_amphoe,
          shipping_province: parsed.province || prev.shipping_province,
          shipping_postal_code: parsed.postal_code || prev.shipping_postal_code,
        }));
      }
    }
  };

  const handleAdditionalAddressPaste = (index: number, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.length > 20) {
      const parsed = parseThaiAddress(pasted);
      if (parsed) {
        e.preventDefault();
        setAdditionalAddresses(prev => prev.map((a, i) => i === index ? {
          ...a,
          address_line1: parsed.address || pasted,
          district: parsed.district || a.district,
          amphoe: parsed.amphoe || a.amphoe,
          province: parsed.province || a.province,
          postal_code: parsed.postal_code || a.postal_code,
        } : a));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showToast('กรุณากรอกชื่อร้าน/ชื่อลูกค้า', 'error');
      return;
    }

    if (formData.phone && !validatePhone(formData.phone)) {
      showToast('รูปแบบเบอร์โทรไม่ถูกต้อง (ต้องเป็นเบอร์ไทย 9-10 หลัก)', 'error');
      return;
    }

    if (formData.shipping_phone && !validatePhone(formData.shipping_phone)) {
      showToast('รูปแบบเบอร์โทรที่อยู่จัดส่งไม่ถูกต้อง', 'error');
      return;
    }

    for (let i = 0; i < additionalAddresses.length; i++) {
      if (additionalAddresses[i].phone && !validatePhone(additionalAddresses[i].phone)) {
        showToast(`เบอร์โทรที่อยู่ "${additionalAddresses[i].address_name || `ที่ ${i + 2}`}" ไม่ถูกต้อง`, 'error');
        return;
      }
    }

    try {
      const dbCustomerType = resolveDbCustomerType(formData.customer_type, formData.sale_type);
      const submissionData = {
        ...formData,
        customer_type: dbCustomerType,
        shipping_address_name: formData.shipping_address_name || 'ที่อยู่หลัก',
        has_multiple_branches: false,
        additional_addresses: additionalAddresses.filter(a => a.address_line1 || a.province),
      };
      await onSubmit(submissionData, resolvedCustomerId, brandGpRows);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  const getAddressSummary = (addr: ShippingAddressData) => {
    const parts = [addr.amphoe, addr.province, addr.postal_code].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'ยังไม่ได้กรอกที่อยู่';
  };

  const isConsignmentOrDept = formData.customer_type === 'consignment_dealer' || formData.customer_type === 'department_store';

  // =====================
  // COMPACT MODE (chat embed)
  // =====================
  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCompact}>ชื่อร้าน/ชื่อลูกค้า <span className="text-red-500">*</span></label>
          <input type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className={inputCompact} placeholder="ชื่อร้าน/ชื่อลูกค้า" />
        </div>
        <div>
          <label className={labelCompact}>ผู้ติดต่อ</label>
          <input type="text" value={formData.contact_person} onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
            className={inputCompact} placeholder="ชื่อผู้ติดต่อ" />
        </div>
        <div>
          <label className={labelCompact}>เบอร์โทร</label>
          <input type="tel" value={phoneDisplay} onChange={(e) => handlePhoneChange(e.target.value)}
            onBlur={() => setShowPhoneError(true)} onFocus={() => setShowPhoneError(false)}
            className={inputCompact} placeholder="0xx-xxx-xxxx" />
          {showPhoneError && formData.phone && !validatePhone(formData.phone) && (
            <p className="text-xs text-red-500 mt-1">รูปแบบเบอร์โทรไม่ถูกต้อง</p>
          )}
        </div>
        <div>
          <label className={labelCompact}>ประเภทลูกค้า</label>
          <FormSelect
            value={formData.customer_type}
            onChange={(val) => setFormData(prev => ({ ...prev, customer_type: val }))}
            options={CUSTOMER_TYPE_OPTIONS}
            placeholder="-- เลือกประเภท --"
          />
        </div>

        {allTags && onTagsChange && (
          <div>
            <label className={labelCompact}>แท็ก</label>
            <TagInput value={selectedTags || []} onChange={onTagsChange} allTags={allTags} onTagCreated={onTagCreated} size="sm" />
          </div>
        )}

        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3 flex items-center gap-2">
            <Truck className="w-4 h-4" /> ที่อยู่จัดส่ง
          </h4>
          <div className="space-y-3">
            <div>
              <label className={labelCompact}>ที่อยู่</label>
              <textarea value={formData.shipping_address} onChange={(e) => setFormData(prev => ({ ...prev, shipping_address: e.target.value }))}
                onPaste={handlePrimaryAddressPaste} rows={2} className={inputCompact}
                placeholder="วางที่อยู่เต็มได้เลย — ระบบจะแยกจังหวัด/อำเภอ/ตำบลให้อัตโนมัติ" />
            </div>
            <ThaiAddressInput
              district={formData.shipping_district} amphoe={formData.shipping_amphoe}
              province={formData.shipping_province} postalCode={formData.shipping_postal_code}
              onAddressChange={(addr) => setFormData(prev => ({
                ...prev,
                ...(addr.district !== undefined && { shipping_district: addr.district }),
                ...(addr.amphoe !== undefined && { shipping_amphoe: addr.amphoe }),
                ...(addr.province !== undefined && { shipping_province: addr.province }),
                ...(addr.postalCode !== undefined && { shipping_postal_code: addr.postalCode }),
              }))}
              inputClassName={inputCompact} labelClassName={labelCompact}
            />
            <div>
              <label className={`${labelCompact} flex items-center gap-1`}><MapPin className="w-3 h-3" />Google Maps Link</label>
              <div className="flex gap-2">
                <input type="url" value={formData.shipping_google_maps_link}
                  onChange={(e) => setFormData(prev => ({ ...prev, shipping_google_maps_link: e.target.value }))}
                  className={`flex-1 ${inputCompact}`} placeholder="วาง link Google Maps" />
                {formData.shipping_google_maps_link && (
                  <a href={formData.shipping_google_maps_link} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>

            {additionalAddresses.map((addr, i) => (
              <div key={i} className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden">
                <button type="button" onClick={() => toggleExpanded(i)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-slate-700/50 text-sm">
                  <span className="font-medium text-gray-700 dark:text-slate-300">
                    {addr.address_name || `ที่อยู่ที่ ${i + 2}`}
                    {!expandedAddresses.has(i) && <span className="text-xs text-gray-400 ml-2">{getAddressSummary(addr)}</span>}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeAddress(i); }}
                      className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    {expandedAddresses.has(i) ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
                {expandedAddresses.has(i) && (
                  <div className="p-3 space-y-3">
                    <input type="text" value={addr.address_name} onChange={(e) => updateAddress(i, 'address_name', e.target.value)}
                      className={inputCompact} placeholder="ชื่อที่อยู่" />
                    <textarea value={addr.address_line1} onChange={(e) => updateAddress(i, 'address_line1', e.target.value)}
                      onPaste={(e) => handleAdditionalAddressPaste(i, e)} rows={2} className={inputCompact}
                      placeholder="วางที่อยู่เต็มได้เลย" />
                    <ThaiAddressInput
                      district={addr.district} amphoe={addr.amphoe} province={addr.province} postalCode={addr.postal_code}
                      onAddressChange={(a) => {
                        if (a.district !== undefined) updateAddress(i, 'district', a.district);
                        if (a.amphoe !== undefined) updateAddress(i, 'amphoe', a.amphoe);
                        if (a.province !== undefined) updateAddress(i, 'province', a.province);
                        if (a.postalCode !== undefined) updateAddress(i, 'postal_code', a.postalCode);
                      }}
                      inputClassName={inputCompact} labelClassName={labelCompact}
                    />
                  </div>
                )}
              </div>
            ))}

            <button type="button" onClick={addAddress}
              className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-1">
              <Plus className="w-4 h-4" /> เพิ่มที่อยู่จัดส่ง
            </button>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setFormData(prev => ({ ...prev, needs_tax_invoice: !prev.needs_tax_invoice }))}>
            <Checkbox checked={formData.needs_tax_invoice} onChange={(v) => setFormData(prev => ({ ...prev, needs_tax_invoice: v }))} />
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> ใบกำกับภาษี
            </span>
          </div>
          {formData.needs_tax_invoice && (
            <div className="mt-3 space-y-3">
              <input type="text" value={formData.tax_company_name} onChange={(e) => setFormData(prev => ({ ...prev, tax_company_name: e.target.value }))}
                className={inputCompact} placeholder="บริษัท XXX จำกัด" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={formData.tax_id} onChange={(e) => setFormData(prev => ({ ...prev, tax_id: e.target.value }))}
                  className={inputCompact} placeholder="เลขผู้เสียภาษี" />
                <input type="text" value={formData.tax_branch} onChange={(e) => setFormData(prev => ({ ...prev, tax_branch: e.target.value }))}
                  className={inputCompact} placeholder="สาขา" />
              </div>
              <Checkbox checked={formData.billing_same_as_shipping} onChange={(v) => setFormData(prev => ({ ...prev, billing_same_as_shipping: v }))}
                label="ใช้ที่อยู่เดียวกับที่อยู่จัดส่ง" />
              {!formData.billing_same_as_shipping && (
                <textarea value={formData.billing_address} onChange={(e) => setFormData(prev => ({ ...prev, billing_address: e.target.value }))}
                  rows={3} className={inputCompact} placeholder="ที่อยู่ออกบิล" />
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <button type="button" onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
            ยกเลิก
          </button>
          <button type="submit" disabled={isLoading}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {isLoading ? (<><Loader2 className="w-4 h-4 animate-spin" />กำลังบันทึก...</>) : (<><Check className="w-4 h-4" />{isEditing ? 'บันทึก' : 'สร้างลูกค้า'}</>)}
          </button>
        </div>
      </form>
    );
  }

  // =====================
  // FULL FORM — 2-column layout
  // =====================
  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ===== LEFT COLUMN ===== */}
        <div className="space-y-6">

          {/* Section: ข้อมูลพื้นฐาน */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">ข้อมูลพื้นฐาน</h3>
            <div className="space-y-4">
              <div>
                <label className={labelFull}>ชื่อร้าน/ชื่อลูกค้า <span className="text-red-500">*</span></label>
                <input type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className={inputFull} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelFull}>ผู้ติดต่อ</label>
                  <input type="text" value={formData.contact_person} onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
                    className={inputFull} />
                </div>
                <div>
                  <label className={labelFull}>เบอร์โทร</label>
                  <input type="tel" value={phoneDisplay} onChange={(e) => handlePhoneChange(e.target.value)}
                    onBlur={() => setShowPhoneError(true)} onFocus={() => setShowPhoneError(false)}
                    className={inputFull} placeholder="0xx-xxx-xxxx" />
                  {showPhoneError && formData.phone && !validatePhone(formData.phone) && (
                    <p className="text-xs text-red-500 mt-1">รูปแบบเบอร์โทรไม่ถูกต้อง (ต้องเป็นเบอร์ไทย 9-10 หลัก)</p>
                  )}
                </div>
              </div>
              <div>
                <label className={labelFull}>อีเมล</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className={inputFull} />
              </div>
              {allTags && onTagsChange && (
                <div>
                  <label className={labelFull}>แท็ก</label>
                  <TagInput value={selectedTags || []} onChange={onTagsChange} allTags={allTags} onTagCreated={onTagCreated} />
                </div>
              )}
            </div>
          </div>

          {/* Section: ช่องทางแชท (edit mode only, when contacts exist) */}
          {linkedContacts.length > 0 && onNavigateToChat && (
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
                    type="button"
                    onClick={() => onNavigateToChat(lc.id, lc.platform)}
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

          {/* Section: ที่อยู่จัดส่ง */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
              <Truck className="w-5 h-5" /> ที่อยู่จัดส่ง
            </h3>

            <div className="space-y-3">
              {isEditing && (
                <div>
                  <label className={labelFull}>ชื่อที่อยู่</label>
                  <input type="text" value={formData.shipping_address_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, shipping_address_name: e.target.value }))}
                    className={inputFull} placeholder="เช่น บ้าน, ออฟฟิศ, สำนักงานใหญ่" />
                </div>
              )}

              <div>
                <label className={labelFull}>ที่อยู่</label>
                <textarea value={formData.shipping_address} onChange={(e) => setFormData(prev => ({ ...prev, shipping_address: e.target.value }))}
                  onPaste={handlePrimaryAddressPaste} className={inputFull} rows={2}
                  placeholder="วางที่อยู่เต็มได้เลย — ระบบจะแยกจังหวัด/อำเภอ/ตำบลให้อัตโนมัติ" />
              </div>

              <ThaiAddressInput
                district={formData.shipping_district} amphoe={formData.shipping_amphoe}
                province={formData.shipping_province} postalCode={formData.shipping_postal_code}
                onAddressChange={(addr) => setFormData(prev => ({
                  ...prev,
                  ...(addr.district !== undefined && { shipping_district: addr.district }),
                  ...(addr.amphoe !== undefined && { shipping_amphoe: addr.amphoe }),
                  ...(addr.province !== undefined && { shipping_province: addr.province }),
                  ...(addr.postalCode !== undefined && { shipping_postal_code: addr.postalCode }),
                }))}
                inputClassName={inputFull} labelClassName={labelFull}
              />

              {/* Collapsible: ผู้รับสินค้า, Google Maps & หมายเหตุ */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowMapSection(prev => !prev)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
                >
                  {showMapSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  ผู้รับ, Google Maps & หมายเหตุ
                  {(formData.shipping_contact_person || formData.shipping_phone || formData.shipping_google_maps_link || formData.shipping_delivery_notes) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#F4511E] ml-0.5" />
                  )}
                </button>

                {showMapSection && (
                  <div className="mt-3 space-y-3 pl-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelFull}>ผู้รับสินค้า</label>
                        <input type="text" value={formData.shipping_contact_person}
                          onChange={(e) => setFormData(prev => ({ ...prev, shipping_contact_person: e.target.value }))}
                          className={inputFull} placeholder="ชื่อผู้รับ (ถ้าต่างจากผู้ติดต่อ)" />
                      </div>
                      <div>
                        <label className={labelFull}>เบอร์โทรผู้รับ</label>
                        <input type="tel" value={formData.shipping_phone}
                          onChange={(e) => setFormData(prev => ({ ...prev, shipping_phone: normalizePhone(e.target.value) }))}
                          className={inputFull} placeholder="0xx-xxx-xxxx" />
                      </div>
                    </div>
                    <div>
                      <label className={`${labelFull} flex items-center gap-1`}><MapPin className="w-4 h-4" />Google Maps Link</label>
                      <div className="flex gap-2">
                        <input type="url" value={formData.shipping_google_maps_link}
                          onChange={(e) => setFormData(prev => ({ ...prev, shipping_google_maps_link: e.target.value }))}
                          className={`flex-1 ${inputFull}`} placeholder="วาง link Google Maps" />
                        {formData.shipping_google_maps_link && (
                          <a href={formData.shipping_google_maps_link} target="_blank" rel="noopener noreferrer"
                            className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-1 text-sm whitespace-nowrap">
                            <ExternalLink className="w-4 h-4" />เปิดแผนที่
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className={labelFull}>หมายเหตุสำหรับการจัดส่ง</label>
                      <textarea value={formData.shipping_delivery_notes}
                        onChange={(e) => setFormData(prev => ({ ...prev, shipping_delivery_notes: e.target.value }))}
                        className={inputFull} rows={2} placeholder="เช่น ส่งช่วงเช้า, โทรก่อนส่ง" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Existing DB addresses (edit mode) */}
            {existingAddresses.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <h4 className="font-medium text-gray-800 dark:text-slate-200">ที่อยู่เพิ่มเติม</h4>
                  <span className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                    {existingAddresses.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {existingAddresses.map((address) => (
                    <div key={address.id} className="border border-gray-200 dark:border-slate-700 rounded-lg p-3 hover:border-[#F4511E] transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <h5 className="font-semibold text-base text-gray-900 dark:text-white">{address.address_name}</h5>
                        {(onEditAddress || onDeleteAddress) && (
                          <div className="flex gap-1.5">
                            {onEditAddress && (
                              <button type="button" onClick={() => onEditAddress(address)} className="text-gray-400 hover:text-[#F4511E]">
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onDeleteAddress && (
                              <button type="button" onClick={() => onDeleteAddress(address.id)} className="text-gray-400 hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="data-text text-gray-600 dark:text-slate-400 space-y-0.5">
                        <p>{[address.address_line1, address.district, address.amphoe, address.province, address.postal_code].filter(Boolean).join(' ')}</p>
                        {address.contact_person && (
                          <p className="flex items-center gap-1"><UserCircle className="w-3 h-3" />{address.contact_person} {address.phone && `(${address.phone})`}</p>
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

            {/* New addresses (not yet in DB) */}
            {additionalAddresses.length > 0 && (
              <div className="mt-4 space-y-3">
                {additionalAddresses.map((addr, i) => (
                  <div key={i} className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <button type="button" onClick={() => toggleExpanded(i)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700/70 transition-colors">
                      <div className="flex items-center gap-2 text-left">
                        <Truck className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-700 dark:text-slate-300">
                          {addr.address_name || `ที่อยู่ที่ ${existingAddresses.length + i + 2}`}
                        </span>
                        {!expandedAddresses.has(i) && (
                          <span className="text-sm text-gray-400 dark:text-slate-500">{getAddressSummary(addr)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeAddress(i); }}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        {expandedAddresses.has(i) ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>
                    {expandedAddresses.has(i) && (
                      <div className="p-4 space-y-3">
                        <input type="text" value={addr.address_name} onChange={(e) => updateAddress(i, 'address_name', e.target.value)}
                          className={inputFull} placeholder="ชื่อที่อยู่ เช่น สาขาลาดพร้าว" />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelFull}>ผู้รับสินค้า</label>
                            <input type="text" value={addr.contact_person} onChange={(e) => updateAddress(i, 'contact_person', e.target.value)} className={inputFull} />
                          </div>
                          <div>
                            <label className={labelFull}>เบอร์โทรผู้รับ</label>
                            <input type="tel" value={additionalPhoneDisplays[i] || ''} onChange={(e) => handleAdditionalPhoneChange(i, e.target.value)} className={inputFull} placeholder="0xx-xxx-xxxx" />
                          </div>
                        </div>
                        <textarea value={addr.address_line1} onChange={(e) => updateAddress(i, 'address_line1', e.target.value)}
                          onPaste={(e) => handleAdditionalAddressPaste(i, e)} rows={2} className={inputFull}
                          placeholder="วางที่อยู่เต็มได้เลย" />
                        <ThaiAddressInput
                          district={addr.district} amphoe={addr.amphoe} province={addr.province} postalCode={addr.postal_code}
                          onAddressChange={(a) => {
                            if (a.district !== undefined) updateAddress(i, 'district', a.district);
                            if (a.amphoe !== undefined) updateAddress(i, 'amphoe', a.amphoe);
                            if (a.province !== undefined) updateAddress(i, 'province', a.province);
                            if (a.postalCode !== undefined) updateAddress(i, 'postal_code', a.postalCode);
                          }}
                          inputClassName={inputFull} labelClassName={labelFull}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add address button */}
            <button
              type="button"
              onClick={isEditing && onAddAddress ? onAddAddress : addAddress}
              className="mt-4 w-full py-2 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-[#F4511E] hover:text-[#F4511E] transition-colors flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" /> เพิ่มที่อยู่
            </button>
          </div>

        </div>

        {/* ===== RIGHT COLUMN ===== */}
        <div className="space-y-6">

          {/* Section: ประเภทลูกค้า */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">ประเภทลูกค้า</h3>
            <FormSelect
              value={formData.customer_type}
              onChange={(val) => {
                const subOptions = SALE_TYPE_OPTIONS[val];
                setFormData(prev => ({
                  ...prev,
                  customer_type: val,
                  sale_type: subOptions ? subOptions[0].id : '',
                }));
              }}
              options={CUSTOMER_TYPE_OPTIONS}
              placeholder="-- เลือกประเภท --"
            />

            {/* Sale type sub-options */}
            {SALE_TYPE_OPTIONS[formData.customer_type] && (
              <div className="mt-3 grid grid-cols-1 gap-2">
                {SALE_TYPE_OPTIONS[formData.customer_type].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, sale_type: opt.id }))}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      formData.sale_type === opt.id
                        ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/20'
                        : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                    }`}
                  >
                    <p className={`text-base font-medium ${formData.sale_type === opt.id ? 'text-[#F4511E]' : 'text-gray-700 dark:text-slate-300'}`}>
                      {opt.label}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-slate-500 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {/* GP/ส่วนลด Settings — show for dealer/dept_store/corporate with any sale_type */}
            {formData.sale_type && (formData.customer_type === 'dealer' || formData.customer_type === 'department_store' || formData.customer_type === 'corporate') && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                <ConsignmentSettings
                  data={{
                    consignment_gp_rate: formData.consignment_gp_rate,
                    consignment_gp_base_price: formData.consignment_gp_base_price,
                    consignment_report_due_days: formData.consignment_report_due_days,
                    consignment_payment_terms: formData.consignment_payment_terms,
                    contract_number: formData.contract_number,
                    contract_date: formData.contract_date,
                    rd_submitted_at: formData.rd_submitted_at,
                  }}
                  onChange={(patch) => setFormData(prev => ({ ...prev, ...patch }))}
                  inputClassName={inputFull}
                  labelClassName={labelFull}
                  brandGpRows={brandGpRows}
                  onBrandGpRowsChange={setBrandGpRows}
                  hideContract={formData.customer_type === 'department_store'}
                  wholesale={formData.sale_type !== 'consignment'}
                />
              </div>
            )}

            {/* Department Store Settings — show for department_store type */}
            {formData.customer_type === 'department_store' && (
              <div className="mt-4">
                <DepartmentStoreSettings />
              </div>
            )}
          </div>

          {/* Section: ใบกำกับภาษี */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-4 cursor-pointer"
              onClick={() => setFormData(prev => ({ ...prev, needs_tax_invoice: !prev.needs_tax_invoice }))}>
              <Checkbox checked={formData.needs_tax_invoice} onChange={(v) => setFormData(prev => ({ ...prev, needs_tax_invoice: v }))} />
              <span className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5" /> ใบกำกับภาษี
              </span>
            </div>

            {formData.needs_tax_invoice && (
              <div className="space-y-4">
                <div>
                  <label className={labelFull}>ชื่อบริษัท/ชื่อผู้เสียภาษี</label>
                  <input type="text" value={formData.tax_company_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, tax_company_name: e.target.value }))}
                    className={inputFull} placeholder="บริษัท XXX จำกัด" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelFull}>เลขประจำตัวผู้เสียภาษี</label>
                    <input type="text" value={formData.tax_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, tax_id: e.target.value }))}
                      className={inputFull} placeholder="X-XXXX-XXXXX-XX-X" />
                  </div>
                  <div>
                    <label className={labelFull}>สาขา</label>
                    <input type="text" value={formData.tax_branch}
                      onChange={(e) => setFormData(prev => ({ ...prev, tax_branch: e.target.value }))}
                      className={inputFull} placeholder="สำนักงานใหญ่" />
                  </div>
                </div>
                <div>
                  <div className="mb-3">
                    <Checkbox checked={formData.billing_same_as_shipping}
                      onChange={(v) => setFormData(prev => ({ ...prev, billing_same_as_shipping: v }))}
                      label="ใช้ที่อยู่เดียวกับที่อยู่จัดส่ง" />
                  </div>
                  {!formData.billing_same_as_shipping && (
                    <div>
                      <label className={labelFull}>ที่อยู่ออกบิล</label>
                      <textarea value={formData.billing_address}
                        onChange={(e) => setFormData(prev => ({ ...prev, billing_address: e.target.value }))}
                        className={inputFull} rows={3} placeholder="เลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Action Buttons */}
      {!isEditing && (
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onCancel} disabled={isLoading}
            className="px-6 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 dark:bg-slate-900 text-gray-700 dark:text-slate-300">
            ยกเลิก
          </button>
          <button type="submit" disabled={isLoading}
            className="bg-[#F4511E] text-white px-6 py-2.5 rounded-lg hover:bg-[#D63B0E] disabled:opacity-50 flex items-center gap-2">
            {isLoading ? (<><Loader2 className="w-4 h-4 animate-spin" />กำลังบันทึก...</>) : 'บันทึก'}
          </button>
        </div>
      )}
    </form>
  );
}
