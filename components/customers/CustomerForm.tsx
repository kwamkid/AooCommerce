'use client';

import { useState, useEffect } from 'react';
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
  ChevronUp
} from 'lucide-react';
import Checkbox from '@/components/ui/Checkbox';
import { useToast } from '@/lib/toast-context';
import { parseThaiAddress } from '@/lib/address-parser';

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

// Form data interface
export interface CustomerFormData {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  customer_type: string;
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
  // Additional shipping addresses
  additional_addresses?: ShippingAddressData[];
}

interface CustomerFormProps {
  initialData?: Partial<CustomerFormData>;
  onSubmit: (data: CustomerFormData) => Promise<void>;
  onCancel: () => void;
  isEditing?: boolean;
  isLoading?: boolean;
  compact?: boolean;
  lineDisplayName?: string;
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

const defaultFormData: CustomerFormData = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  customer_type: 'retail',
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
  billing_same_as_shipping: true
};

// Input class helpers
const inputFull = "w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] bg-white dark:bg-slate-800 text-gray-900 dark:text-white";
const inputCompact = "w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white";
const labelFull = "block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1";
const labelCompact = "block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1";

export default function CustomerForm({
  initialData,
  onSubmit,
  onCancel,
  isEditing = false,
  isLoading = false,
  compact = false,
  lineDisplayName
}: CustomerFormProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<CustomerFormData>({
    ...defaultFormData,
    ...initialData,
    name: initialData?.name || lineDisplayName || '',
    contact_person: initialData?.contact_person || lineDisplayName || ''
  });
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [shippingPhoneDisplay, setShippingPhoneDisplay] = useState('');
  const [showPhoneError, setShowPhoneError] = useState(false);
  const [showShippingPhoneError, setShowShippingPhoneError] = useState(false);

  // Additional addresses state
  const [additionalAddresses, setAdditionalAddresses] = useState<ShippingAddressData[]>(
    initialData?.additional_addresses || []
  );
  const [additionalPhoneDisplays, setAdditionalPhoneDisplays] = useState<string[]>([]);
  const [expandedAddresses, setExpandedAddresses] = useState<Set<number>>(new Set());

  // Initialize phone displays
  useEffect(() => {
    if (formData.phone) setPhoneDisplay(formatPhoneDisplay(formData.phone));
    if (formData.shipping_phone) setShippingPhoneDisplay(formatPhoneDisplay(formData.shipping_phone));
    setAdditionalPhoneDisplays(additionalAddresses.map(a => a.phone ? formatPhoneDisplay(a.phone) : ''));
  }, []);

  const handlePhoneChange = (value: string, isShipping: boolean = false) => {
    const normalized = normalizePhone(value);
    const formatted = formatPhoneDisplay(normalized);
    if (isShipping) {
      setShippingPhoneDisplay(formatted);
      setFormData(prev => ({ ...prev, shipping_phone: normalized }));
    } else {
      setPhoneDisplay(formatted);
      setFormData(prev => ({ ...prev, phone: normalized }));
    }
  };

  const handleAdditionalPhoneChange = (index: number, value: string) => {
    const normalized = normalizePhone(value);
    const formatted = formatPhoneDisplay(normalized);
    setAdditionalPhoneDisplays(prev => { const next = [...prev]; next[index] = formatted; return next; });
    setAdditionalAddresses(prev => prev.map((a, i) => i === index ? { ...a, phone: normalized } : a));
  };

  // Copy shipping to billing when billing_same_as_shipping changes
  useEffect(() => {
    if (formData.billing_same_as_shipping) {
      setFormData(prev => ({
        ...prev,
        billing_address: prev.shipping_address,
        billing_district: prev.shipping_district,
        billing_amphoe: prev.shipping_amphoe,
        billing_province: prev.shipping_province,
        billing_postal_code: prev.shipping_postal_code
      }));
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

  // Thai address paste handler for primary shipping address
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

  // Thai address paste handler for additional addresses
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

    // Validate additional address phones
    for (let i = 0; i < additionalAddresses.length; i++) {
      if (additionalAddresses[i].phone && !validatePhone(additionalAddresses[i].phone)) {
        showToast(`เบอร์โทรที่อยู่ "${additionalAddresses[i].address_name || `ที่ ${i + 2}`}" ไม่ถูกต้อง`, 'error');
        return;
      }
    }

    try {
      const submissionData = {
        ...formData,
        shipping_address_name: formData.shipping_address_name || 'ที่อยู่หลัก',
        has_multiple_branches: false,
        additional_addresses: additionalAddresses.filter(a => a.address_line1 || a.province),
      };
      await onSubmit(submissionData);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  // Address summary for collapsed cards
  const getAddressSummary = (addr: ShippingAddressData) => {
    const parts = [addr.amphoe, addr.province, addr.postal_code].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'ยังไม่ได้กรอกที่อยู่';
  };

  // Shared address fields renderer
  const renderAddressFields = (
    addr: ShippingAddressData,
    index: number,
    onChange: (field: keyof ShippingAddressData, value: string) => void,
    onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void,
    phoneDisplay: string,
    onPhoneChange: (value: string) => void,
    cls: string,
    lbl: string,
    showName: boolean
  ) => (
    <div className={compact ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
      {showName && (
        <div className={compact ? "" : "md:col-span-2"}>
          <label className={lbl}>ชื่อที่อยู่</label>
          <input type="text" value={addr.address_name} onChange={(e) => onChange('address_name', e.target.value)}
            className={cls} placeholder="เช่น บ้าน, ที่ทำงาน, โกดัง" />
        </div>
      )}
      {!compact && (
        <>
          <div>
            <label className={lbl}>ผู้รับสินค้า</label>
            <input type="text" value={addr.contact_person} onChange={(e) => onChange('contact_person', e.target.value)} className={cls} />
          </div>
          <div>
            <label className={lbl}>เบอร์โทรผู้รับ</label>
            <input type="tel" value={phoneDisplay} onChange={(e) => onPhoneChange(e.target.value)} className={cls} placeholder="0xx-xxx-xxxx" />
          </div>
        </>
      )}
      <div className={compact ? "" : "md:col-span-2"}>
        <label className={lbl}>ที่อยู่</label>
        <textarea value={addr.address_line1} onChange={(e) => onChange('address_line1', e.target.value)}
          onPaste={onPaste} rows={2} className={cls} placeholder="วางที่อยู่เต็มได้เลย — ระบบจะแยกจังหวัด/อำเภอ/ตำบลให้อัตโนมัติ" />
      </div>
      <div className={compact ? "grid grid-cols-2 gap-2" : "contents"}>
        <div>
          <label className={lbl}>ตำบล/แขวง</label>
          <input type="text" value={addr.district} onChange={(e) => onChange('district', e.target.value)} className={cls} />
        </div>
        <div>
          <label className={lbl}>อำเภอ/เขต</label>
          <input type="text" value={addr.amphoe} onChange={(e) => onChange('amphoe', e.target.value)} className={cls} />
        </div>
      </div>
      <div className={compact ? "grid grid-cols-2 gap-2" : "contents"}>
        <div>
          <label className={lbl}>จังหวัด</label>
          <input type="text" value={addr.province} onChange={(e) => onChange('province', e.target.value)} className={cls} />
        </div>
        <div>
          <label className={lbl}>รหัสไปรษณีย์</label>
          <input type="text" value={addr.postal_code} onChange={(e) => onChange('postal_code', e.target.value)} className={cls} />
        </div>
      </div>
      {!compact && (
        <>
          <div className="md:col-span-2">
            <label className={`${lbl} flex items-center gap-1`}><MapPin className="w-4 h-4" />Google Maps Link</label>
            <div className="flex gap-2">
              <input type="url" value={addr.google_maps_link} onChange={(e) => onChange('google_maps_link', e.target.value)}
                className={`flex-1 ${cls}`} placeholder="วาง link Google Maps" />
              {addr.google_maps_link && (
                <a href={addr.google_maps_link} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center">
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={lbl}>หมายเหตุจัดส่ง</label>
            <textarea value={addr.delivery_notes} onChange={(e) => onChange('delivery_notes', e.target.value)}
              rows={2} className={cls} placeholder="เช่น ส่งช่วงเช้า, โทรก่อนส่ง" />
          </div>
        </>
      )}
    </div>
  );

  // Compact form for chat embed
  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Section 1: Basic Info */}
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
          <select value={formData.customer_type} onChange={(e) => setFormData(prev => ({ ...prev, customer_type: e.target.value as any }))}
            className={inputCompact}>
            <option value="retail">ลูกค้าปลีก</option>
            <option value="wholesale">ลูกค้าส่ง</option>
            <option value="cash_dealer">ตัวแทนฯ เงินสด</option>
            <option value="credit_dealer">ตัวแทนฯ เครดิต</option>
            <option value="consignment_dealer">ตัวแทนฯ ฝากขาย</option>
            <option value="sub_dealer">ตัวแทนย่อย</option>
            <option value="department_store">ห้าง/Modern Trade</option>
            <option value="distributor">ตัวกระจายสินค้า</option>
            <option value="corporate">องค์กร/B2B</option>
            <option value="project">ลูกค้าโครงการ</option>
            <option value="marketplace_dealer">ตัวแทน Marketplace</option>
            <option value="dropship">Dropship</option>
            <option value="affiliate">Affiliate/KOL</option>
            <option value="oem_odm">OEM/ODM</option>
            <option value="regional_agent">ตัวแทนภูมิภาค</option>
            <option value="government">ราชการ/หน่วยงานรัฐ</option>
          </select>
        </div>

        {/* Section 2: Shipping Address */}
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
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCompact}>ตำบล/แขวง</label>
                <input type="text" value={formData.shipping_district} onChange={(e) => setFormData(prev => ({ ...prev, shipping_district: e.target.value }))} className={inputCompact} />
              </div>
              <div>
                <label className={labelCompact}>อำเภอ/เขต</label>
                <input type="text" value={formData.shipping_amphoe} onChange={(e) => setFormData(prev => ({ ...prev, shipping_amphoe: e.target.value }))} className={inputCompact} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCompact}>จังหวัด</label>
                <input type="text" value={formData.shipping_province} onChange={(e) => setFormData(prev => ({ ...prev, shipping_province: e.target.value }))} className={inputCompact} />
              </div>
              <div>
                <label className={labelCompact}>รหัสไปรษณีย์</label>
                <input type="text" value={formData.shipping_postal_code} onChange={(e) => setFormData(prev => ({ ...prev, shipping_postal_code: e.target.value }))} className={inputCompact} />
              </div>
            </div>
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

            {/* Additional addresses (compact) */}
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
                    {renderAddressFields(
                      addr, i,
                      (field, value) => updateAddress(i, field, value),
                      (e) => handleAdditionalAddressPaste(i, e),
                      additionalPhoneDisplays[i] || '',
                      (v) => handleAdditionalPhoneChange(i, v),
                      inputCompact, labelCompact, true
                    )}
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

        {/* Section 3: Tax Invoice */}
        <div className="border-t pt-4">
          <div className="flex items-center gap-2">
            <Checkbox checked={formData.needs_tax_invoice} onChange={(v) => setFormData(prev => ({ ...prev, needs_tax_invoice: v }))} />
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> ต้องการออกใบกำกับภาษี
            </span>
          </div>
          {formData.needs_tax_invoice && (
            <div className="mt-3 space-y-3 pl-6 border-l-2 border-blue-200">
              <div>
                <label className={labelCompact}>ชื่อบริษัท/ชื่อผู้เสียภาษี</label>
                <input type="text" value={formData.tax_company_name} onChange={(e) => setFormData(prev => ({ ...prev, tax_company_name: e.target.value }))}
                  className={inputCompact} placeholder="บริษัท XXX จำกัด" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCompact}>เลขประจำตัวผู้เสียภาษี</label>
                  <input type="text" value={formData.tax_id} onChange={(e) => setFormData(prev => ({ ...prev, tax_id: e.target.value }))}
                    className={inputCompact} placeholder="X-XXXX-XXXXX-XX-X" />
                </div>
                <div>
                  <label className={labelCompact}>สาขา</label>
                  <input type="text" value={formData.tax_branch} onChange={(e) => setFormData(prev => ({ ...prev, tax_branch: e.target.value }))}
                    className={inputCompact} placeholder="สำนักงานใหญ่" />
                </div>
              </div>
              <div>
                <Checkbox checked={formData.billing_same_as_shipping} onChange={(v) => setFormData(prev => ({ ...prev, billing_same_as_shipping: v }))}
                  label="ใช้ที่อยู่เดียวกับที่อยู่จัดส่ง" />
                {!formData.billing_same_as_shipping && (
                  <div className="mt-2 space-y-2">
                    <textarea value={formData.billing_address} onChange={(e) => setFormData(prev => ({ ...prev, billing_address: e.target.value }))}
                      rows={2} className={inputCompact} placeholder="ที่อยู่ออกบิล" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={formData.billing_province} onChange={(e) => setFormData(prev => ({ ...prev, billing_province: e.target.value }))}
                        className={inputCompact} placeholder="จังหวัด" />
                      <input type="text" value={formData.billing_postal_code} onChange={(e) => setFormData(prev => ({ ...prev, billing_postal_code: e.target.value }))}
                        className={inputCompact} placeholder="รหัสไปรษณีย์" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className={`text-sm font-medium text-gray-700 dark:text-slate-300 mb-1`}>หมายเหตุ</label>
          <textarea value={formData.notes} onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            rows={2} className={inputCompact} placeholder="หมายเหตุเพิ่มเติม" />
        </div>

        {/* Action Buttons */}
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

  // Full form for customers page
  return (
    <form onSubmit={handleSubmit}>
      {/* Section 1: Customer Info */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-slate-300">ข้อมูลลูกค้า</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelFull}>ชื่อร้าน/ชื่อลูกค้า <span className="text-red-500">*</span></label>
            <input type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className={inputFull} required />
          </div>
          <div>
            <label className={labelFull}>ประเภทลูกค้า</label>
            <select value={formData.customer_type} onChange={(e) => setFormData(prev => ({ ...prev, customer_type: e.target.value as any }))}
              className={inputFull}>
              <option value="retail">ลูกค้าปลีก</option>
              <option value="wholesale">ลูกค้าส่ง</option>
              <option value="cash_dealer">ตัวแทนฯ เงินสด</option>
              <option value="credit_dealer">ตัวแทนฯ เครดิต</option>
              <option value="consignment_dealer">ตัวแทนฯ ฝากขาย</option>
              <option value="sub_dealer">ตัวแทนย่อย</option>
              <option value="department_store">ห้าง/Modern Trade</option>
              <option value="distributor">ตัวกระจายสินค้า</option>
              <option value="corporate">องค์กร/B2B</option>
              <option value="project">ลูกค้าโครงการ</option>
              <option value="marketplace_dealer">ตัวแทน Marketplace</option>
            <option value="dropship">Dropship</option>
            <option value="affiliate">Affiliate/KOL</option>
              <option value="oem_odm">OEM/ODM</option>
              <option value="regional_agent">ตัวแทนภูมิภาค</option>
              <option value="government">ราชการ/หน่วยงานรัฐ</option>
            </select>
          </div>
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
          <div>
            <label className={labelFull}>อีเมล</label>
            <input type="email" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className={inputFull} />
          </div>
        </div>
      </div>

      {/* Section 2: Shipping Address */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-slate-300 flex items-center gap-2">
          <Truck className="w-5 h-5" /> ที่อยู่จัดส่ง
        </h3>

        {/* Primary address fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelFull}>ผู้รับสินค้า</label>
            <input type="text" value={formData.shipping_contact_person} onChange={(e) => setFormData(prev => ({ ...prev, shipping_contact_person: e.target.value }))}
              className={inputFull} />
          </div>
          <div>
            <label className={labelFull}>เบอร์โทรผู้รับ</label>
            <input type="tel" value={shippingPhoneDisplay} onChange={(e) => handlePhoneChange(e.target.value, true)}
              onBlur={() => setShowShippingPhoneError(true)} onFocus={() => setShowShippingPhoneError(false)}
              className={inputFull} placeholder="0xx-xxx-xxxx" />
            {showShippingPhoneError && formData.shipping_phone && !validatePhone(formData.shipping_phone) && (
              <p className="text-xs text-red-500 mt-1">รูปแบบเบอร์โทรไม่ถูกต้อง</p>
            )}
          </div>
          <div className="md:col-span-2">
            <label className={labelFull}>ที่อยู่จัดส่ง</label>
            <textarea value={formData.shipping_address} onChange={(e) => setFormData(prev => ({ ...prev, shipping_address: e.target.value }))}
              onPaste={handlePrimaryAddressPaste} className={inputFull} rows={2}
              placeholder="วางที่อยู่เต็มได้เลย — ระบบจะแยกจังหวัด/อำเภอ/ตำบลให้อัตโนมัติ" />
          </div>
          <div>
            <label className={labelFull}>ตำบล/แขวง</label>
            <input type="text" value={formData.shipping_district} onChange={(e) => setFormData(prev => ({ ...prev, shipping_district: e.target.value }))}
              className={inputFull} />
          </div>
          <div>
            <label className={labelFull}>อำเภอ/เขต</label>
            <input type="text" value={formData.shipping_amphoe} onChange={(e) => setFormData(prev => ({ ...prev, shipping_amphoe: e.target.value }))}
              className={inputFull} />
          </div>
          <div>
            <label className={labelFull}>จังหวัด</label>
            <input type="text" value={formData.shipping_province} onChange={(e) => setFormData(prev => ({ ...prev, shipping_province: e.target.value }))}
              className={inputFull} />
          </div>
          <div>
            <label className={labelFull}>รหัสไปรษณีย์</label>
            <input type="text" value={formData.shipping_postal_code} onChange={(e) => setFormData(prev => ({ ...prev, shipping_postal_code: e.target.value }))}
              className={inputFull} />
          </div>
          <div className="md:col-span-2">
            <label className={`${labelFull} flex items-center gap-1`}><MapPin className="w-4 h-4" />Google Maps Link</label>
            <div className="flex gap-2">
              <input type="url" value={formData.shipping_google_maps_link}
                onChange={(e) => setFormData(prev => ({ ...prev, shipping_google_maps_link: e.target.value }))}
                className={`flex-1 ${inputFull}`} placeholder="วาง link Google Maps เพื่อให้พนักงานส่งของนำทางได้" />
              {formData.shipping_google_maps_link && (
                <a href={formData.shipping_google_maps_link} target="_blank" rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" /> เปิดแผนที่
                </a>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={labelFull}>หมายเหตุสำหรับการจัดส่ง</label>
            <textarea value={formData.shipping_delivery_notes} onChange={(e) => setFormData(prev => ({ ...prev, shipping_delivery_notes: e.target.value }))}
              className={inputFull} rows={2} placeholder="เช่น ส่งช่วงเช้า, โทรก่อนส่ง, ประตูสีเขียว" />
          </div>
        </div>

        {/* Additional addresses */}
        {additionalAddresses.length > 0 && (
          <div className="mt-4 space-y-3">
            {additionalAddresses.map((addr, i) => (
              <div key={i} className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <button type="button" onClick={() => toggleExpanded(i)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700/70 transition-colors">
                  <div className="flex items-center gap-2 text-left">
                    <Truck className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-700 dark:text-slate-300">
                      {addr.address_name || `ที่อยู่ที่ ${i + 2}`}
                    </span>
                    {!expandedAddresses.has(i) && (
                      <span className="text-sm text-gray-400 dark:text-slate-500">{getAddressSummary(addr)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeAddress(i); }}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="ลบที่อยู่นี้">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {expandedAddresses.has(i) ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
                {expandedAddresses.has(i) && (
                  <div className="p-4">
                    {renderAddressFields(
                      addr, i,
                      (field, value) => updateAddress(i, field, value),
                      (e) => handleAdditionalAddressPaste(i, e),
                      additionalPhoneDisplays[i] || '',
                      (v) => handleAdditionalPhoneChange(i, v),
                      inputFull, labelFull, true
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={addAddress}
          className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-[#F4511E] hover:text-[#F4511E] transition-colors flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> เพิ่มที่อยู่จัดส่ง
        </button>
      </div>

      {/* Section 3: Tax Invoice */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Checkbox checked={formData.needs_tax_invoice} onChange={(v) => setFormData(prev => ({ ...prev, needs_tax_invoice: v }))} />
          <span className="text-lg font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2">
            <Building2 className="w-5 h-5" /> ต้องการออกใบกำกับภาษี
          </span>
        </div>
        {formData.needs_tax_invoice && (
          <div className="pl-6 border-l-2 border-[#F4511E] space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelFull}>ชื่อบริษัท/ชื่อผู้เสียภาษี</label>
                <input type="text" value={formData.tax_company_name} onChange={(e) => setFormData(prev => ({ ...prev, tax_company_name: e.target.value }))}
                  className={inputFull} placeholder="บริษัท XXX จำกัด" />
              </div>
              <div>
                <label className={labelFull}>เลขประจำตัวผู้เสียภาษี</label>
                <input type="text" value={formData.tax_id} onChange={(e) => setFormData(prev => ({ ...prev, tax_id: e.target.value }))}
                  className={inputFull} placeholder="X-XXXX-XXXXX-XX-X" />
              </div>
              <div>
                <label className={labelFull}>สาขา</label>
                <input type="text" value={formData.tax_branch} onChange={(e) => setFormData(prev => ({ ...prev, tax_branch: e.target.value }))}
                  className={inputFull} placeholder="สำนักงานใหญ่ หรือ สาขาที่ XXXXX" />
              </div>
            </div>
            <div>
              <div className="mb-3">
                <Checkbox checked={formData.billing_same_as_shipping} onChange={(v) => setFormData(prev => ({ ...prev, billing_same_as_shipping: v }))}
                  label="ใช้ที่อยู่เดียวกับที่อยู่จัดส่ง" />
              </div>
              {!formData.billing_same_as_shipping && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={labelFull}>ที่อยู่ออกบิล</label>
                    <textarea value={formData.billing_address} onChange={(e) => setFormData(prev => ({ ...prev, billing_address: e.target.value }))}
                      className={inputFull} rows={2} placeholder="บ้านเลขที่ ซอย ถนน" />
                  </div>
                  <div>
                    <label className={labelFull}>ตำบล/แขวง</label>
                    <input type="text" value={formData.billing_district} onChange={(e) => setFormData(prev => ({ ...prev, billing_district: e.target.value }))} className={inputFull} />
                  </div>
                  <div>
                    <label className={labelFull}>อำเภอ/เขต</label>
                    <input type="text" value={formData.billing_amphoe} onChange={(e) => setFormData(prev => ({ ...prev, billing_amphoe: e.target.value }))} className={inputFull} />
                  </div>
                  <div>
                    <label className={labelFull}>จังหวัด</label>
                    <input type="text" value={formData.billing_province} onChange={(e) => setFormData(prev => ({ ...prev, billing_province: e.target.value }))} className={inputFull} />
                  </div>
                  <div>
                    <label className={labelFull}>รหัสไปรษณีย์</label>
                    <input type="text" value={formData.billing_postal_code} onChange={(e) => setFormData(prev => ({ ...prev, billing_postal_code: e.target.value }))} className={inputFull} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Section 4: Credit, Notes & Status */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-slate-300">เครดิต & อื่นๆ</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelFull}>วงเงินเครดิต (บาท)</label>
            <input type="number" value={formData.credit_limit}
              onChange={(e) => setFormData(prev => ({ ...prev, credit_limit: parseFloat(e.target.value) || 0 }))}
              className={inputFull} min="0" step="0.01" />
          </div>
          <div>
            <label className={labelFull}>ระยะเวลาเครดิต (วัน)</label>
            <input type="number" value={formData.credit_days}
              onChange={(e) => setFormData(prev => ({ ...prev, credit_days: parseInt(e.target.value) || 0 }))}
              className={inputFull} min="0" />
          </div>
          <div className="md:col-span-2">
            <label className={labelFull}>หมายเหตุ</label>
            <textarea value={formData.notes} onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className={inputFull} rows={3} />
          </div>
          <div className="md:col-span-2">
            <Checkbox checked={formData.is_active} onChange={(v) => setFormData(prev => ({ ...prev, is_active: v }))} label="ใช้งาน" />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={isLoading}
          className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 dark:bg-slate-900">
          ยกเลิก
        </button>
        <button type="submit" disabled={isLoading}
          className="bg-[#F4511E] text-white px-4 py-2 rounded-lg hover:bg-[#D63B0E] disabled:opacity-50 flex items-center">
          {isLoading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />กำลังบันทึก...</>) : 'บันทึก'}
        </button>
      </div>
    </form>
  );
}
