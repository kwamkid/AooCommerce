'use client';

import { useState, useEffect } from 'react';
import {
  Loader2,
  Check,
  AlertCircle,
  MapPin,
  ExternalLink,
  Building2,
  Truck
} from 'lucide-react';

// Form data interface
export interface CustomerFormData {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  customer_type: 'retail' | 'wholesale' | 'distributor';
  credit_limit: number;
  credit_days: number;
  is_active: boolean;
  notes: string;
  // Shipping address (first branch) - Primary
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
  tax_branch: string; // "สำนักงานใหญ่" or "สาขาที่ XXX"
  // Billing address
  billing_address: string;
  billing_district: string;
  billing_amphoe: string;
  billing_province: string;
  billing_postal_code: string;
  // Flag to indicate if billing is same as shipping
  billing_same_as_shipping: boolean;
}

interface CustomerFormProps {
  initialData?: Partial<CustomerFormData>;
  onSubmit: (data: CustomerFormData) => Promise<void>;
  onCancel: () => void;
  isEditing?: boolean;
  isLoading?: boolean;
  error?: string;
  // Compact mode for embedded use (LINE Chat)
  compact?: boolean;
  // Pre-fill LINE display name
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
  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '');

  // Handle Thai mobile numbers
  if (cleaned.startsWith('66')) {
    cleaned = '0' + cleaned.slice(2);
  }

  // Ensure it starts with 0 for Thai numbers
  if (cleaned.length === 9 && !cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }

  return cleaned;
};

const validatePhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  // Thai mobile: 10 digits starting with 0
  // Thai landline: 9 digits starting with 0
  return (cleaned.length === 10 || cleaned.length === 9) && cleaned.startsWith('0');
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
  // Shipping address (primary)
  has_multiple_branches: false,
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
  // Tax invoice info
  needs_tax_invoice: false,
  tax_company_name: '',
  tax_id: '',
  tax_branch: 'สำนักงานใหญ่',
  // Billing address
  billing_address: '',
  billing_district: '',
  billing_amphoe: '',
  billing_province: '',
  billing_postal_code: '',
  billing_same_as_shipping: true
};

export default function CustomerForm({
  initialData,
  onSubmit,
  onCancel,
  isEditing = false,
  isLoading = false,
  error: externalError,
  compact = false,
  lineDisplayName
}: CustomerFormProps) {
  const [formData, setFormData] = useState<CustomerFormData>({
    ...defaultFormData,
    ...initialData,
    name: initialData?.name || lineDisplayName || '',
    contact_person: initialData?.contact_person || lineDisplayName || ''
  });
  const [error, setError] = useState('');
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [shippingPhoneDisplay, setShippingPhoneDisplay] = useState('');
  const [showPhoneError, setShowPhoneError] = useState(false);
  const [showShippingPhoneError, setShowShippingPhoneError] = useState(false);

  // Initialize phone display
  useEffect(() => {
    if (formData.phone) {
      setPhoneDisplay(formatPhoneDisplay(formData.phone));
    }
    if (formData.shipping_phone) {
      setShippingPhoneDisplay(formatPhoneDisplay(formData.shipping_phone));
    }
  }, []);

  // Handle phone input with auto-format
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('กรุณากรอกชื่อร้าน/ชื่อลูกค้า');
      return;
    }

    if (formData.phone && !validatePhone(formData.phone)) {
      setError('รูปแบบเบอร์โทรไม่ถูกต้อง (ต้องเป็นเบอร์ไทย 9-10 หลัก)');
      return;
    }

    if (formData.shipping_phone && !validatePhone(formData.shipping_phone)) {
      setError('รูปแบบเบอร์โทรที่อยู่จัดส่งไม่ถูกต้อง');
      return;
    }

    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  const displayError = externalError || error;

  // Extract Google Maps coordinates from link
  const extractCoordsFromLink = (link: string): { lat?: number; lng?: number } => {
    // Try various Google Maps URL formats
    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,  // @lat,lng format
      /place\/.*?\/(-?\d+\.\d+),(-?\d+\.\d+)/, // place format
      /q=(-?\d+\.\d+),(-?\d+\.\d+)/, // query format
      /ll=(-?\d+\.\d+),(-?\d+\.\d+)/ // ll format
    ];

    for (const pattern of patterns) {
      const match = link.match(pattern);
      if (match) {
        return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
      }
    }
    return {};
  };

  // Compact form for LINE Chat
  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {displayError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {displayError}
          </div>
        )}

        {/* Basic Info */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            ชื่อร้าน/ชื่อลูกค้า <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ชื่อร้าน/ชื่อลูกค้า"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ผู้ติดต่อ</label>
          <input
            type="text"
            value={formData.contact_person}
            onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ชื่อผู้ติดต่อ"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทร</label>
          <input
            type="tel"
            value={phoneDisplay}
            onChange={(e) => handlePhoneChange(e.target.value)}
            onBlur={() => setShowPhoneError(true)}
            onFocus={() => setShowPhoneError(false)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0xx-xxx-xxxx"
          />
          {showPhoneError && formData.phone && !validatePhone(formData.phone) && (
            <p className="text-xs text-red-500 mt-1">รูปแบบเบอร์โทรไม่ถูกต้อง</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ประเภทลูกค้า</label>
          <select
            value={formData.customer_type}
            onChange={(e) => setFormData(prev => ({ ...prev, customer_type: e.target.value as 'retail' | 'wholesale' | 'distributor' }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="retail">ขายปลีก</option>
            <option value="wholesale">ขายส่ง</option>
            <option value="distributor">ตัวแทนจำหน่าย</option>
          </select>
        </div>

        {/* Shipping Address */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3 flex items-center gap-2">
            <Truck className="w-4 h-4" />
            ที่อยู่จัดส่ง
          </h4>

          <div className="space-y-3">
            {/* Multiple branches checkbox */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.has_multiple_branches}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  has_multiple_branches: e.target.checked,
                  shipping_address_name: e.target.checked ? prev.shipping_address_name : 'สาขาหลัก'
                }))}
                className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-600 dark:text-slate-400">มีหลายสาขา</span>
            </label>

            {/* Branch name - only show if has multiple branches */}
            {formData.has_multiple_branches && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">ชื่อสาขา/ที่อยู่</label>
                <input
                  type="text"
                  value={formData.shipping_address_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, shipping_address_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="เช่น สาขาหลัก, โกดังสินค้า"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">ที่อยู่</label>
              <textarea
                value={formData.shipping_address}
                onChange={(e) => setFormData(prev => ({ ...prev, shipping_address: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="บ้านเลขที่ ซอย ถนน"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">จังหวัด</label>
                <input
                  type="text"
                  value={formData.shipping_province}
                  onChange={(e) => setFormData(prev => ({ ...prev, shipping_province: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="จังหวัด"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">รหัสไปรษณีย์</label>
                <input
                  type="text"
                  value={formData.shipping_postal_code}
                  onChange={(e) => setFormData(prev => ({ ...prev, shipping_postal_code: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="xxxxx"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Google Maps Link
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={formData.shipping_google_maps_link}
                  onChange={(e) => setFormData(prev => ({ ...prev, shipping_google_maps_link: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="วาง link Google Maps"
                />
                {formData.shipping_google_maps_link && (
                  <a
                    href={formData.shipping_google_maps_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tax Invoice Section (Optional) */}
        <div className="border-t pt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.needs_tax_invoice}
              onChange={(e) => setFormData(prev => ({ ...prev, needs_tax_invoice: e.target.checked }))}
              className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              ต้องการออกใบกำกับภาษี
            </span>
          </label>

          {formData.needs_tax_invoice && (
            <div className="mt-3 space-y-3 pl-6 border-l-2 border-blue-200">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">ชื่อบริษัท/ชื่อผู้เสียภาษี</label>
                <input
                  type="text"
                  value={formData.tax_company_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, tax_company_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="บริษัท XXX จำกัด"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">เลขประจำตัวผู้เสียภาษี</label>
                  <input
                    type="text"
                    value={formData.tax_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, tax_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="X-XXXX-XXXXX-XX-X"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">สาขา</label>
                  <input
                    type="text"
                    value={formData.tax_branch}
                    onChange={(e) => setFormData(prev => ({ ...prev, tax_branch: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="สำนักงานใหญ่"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs mb-2">
                  <input
                    type="checkbox"
                    checked={formData.billing_same_as_shipping}
                    onChange={(e) => setFormData(prev => ({ ...prev, billing_same_as_shipping: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-gray-600 dark:text-slate-400">ใช้ที่อยู่เดียวกับที่อยู่จัดส่ง</span>
                </label>

                {!formData.billing_same_as_shipping && (
                  <div className="space-y-2">
                    <textarea
                      value={formData.billing_address}
                      onChange={(e) => setFormData(prev => ({ ...prev, billing_address: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="ที่อยู่ออกบิล"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={formData.billing_province}
                        onChange={(e) => setFormData(prev => ({ ...prev, billing_province: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="จังหวัด"
                      />
                      <input
                        type="text"
                        value={formData.billing_postal_code}
                        onChange={(e) => setFormData(prev => ({ ...prev, billing_postal_code: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="รหัสไปรษณีย์"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุ</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="หมายเหตุเพิ่มเติม"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                {isEditing ? 'บันทึก' : 'สร้างลูกค้า'}
              </>
            )}
          </button>
        </div>
      </form>
    );
  }

  // Full form for customers page
  return (
    <form onSubmit={handleSubmit}>
      {displayError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
          <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
          <span className="text-red-800">{displayError}</span>
        </div>
      )}

      {/* Basic Information */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-slate-300">ข้อมูลพื้นฐาน</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              ชื่อร้าน/ชื่อลูกค้า <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ประเภทลูกค้า</label>
            <select
              value={formData.customer_type}
              onChange={(e) => setFormData(prev => ({ ...prev, customer_type: e.target.value as 'retail' | 'wholesale' | 'distributor' }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
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
              value={formData.contact_person}
              onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทร</label>
            <input
              type="tel"
              value={phoneDisplay}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onBlur={() => setShowPhoneError(true)}
              onFocus={() => setShowPhoneError(false)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
              placeholder="0xx-xxx-xxxx"
            />
            {showPhoneError && formData.phone && !validatePhone(formData.phone) && (
              <p className="text-xs text-red-500 mt-1">รูปแบบเบอร์โทรไม่ถูกต้อง (ต้องเป็นเบอร์ไทย 9-10 หลัก)</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">อีเมล</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            />
          </div>
        </div>
      </div>

      {/* Shipping Address - Primary */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-slate-300 flex items-center gap-2">
          <Truck className="w-5 h-5" />
          ที่อยู่จัดส่ง
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Multiple branches checkbox */}
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.has_multiple_branches}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  has_multiple_branches: e.target.checked,
                  // Reset to default if unchecking
                  shipping_address_name: e.target.checked ? prev.shipping_address_name : 'สาขาหลัก'
                }))}
                className="rounded border-gray-300 text-[#F4511E] focus:ring-[#F4511E]"
              />
              <span className="text-sm text-gray-700 dark:text-slate-300">มีหลายสาขา</span>
            </label>
          </div>

          {/* Branch name - only show if has multiple branches */}
          {formData.has_multiple_branches && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อสาขา/ที่อยู่</label>
              <input
                type="text"
                value={formData.shipping_address_name}
                onChange={(e) => setFormData(prev => ({ ...prev, shipping_address_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                placeholder="เช่น สาขาหลัก, โกดังสินค้า"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ผู้รับสินค้า</label>
            <input
              type="text"
              value={formData.shipping_contact_person}
              onChange={(e) => setFormData(prev => ({ ...prev, shipping_contact_person: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทรผู้รับ</label>
            <input
              type="tel"
              value={shippingPhoneDisplay}
              onChange={(e) => handlePhoneChange(e.target.value, true)}
              onBlur={() => setShowShippingPhoneError(true)}
              onFocus={() => setShowShippingPhoneError(false)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
              placeholder="0xx-xxx-xxxx"
            />
            {showShippingPhoneError && formData.shipping_phone && !validatePhone(formData.shipping_phone) && (
              <p className="text-xs text-red-500 mt-1">รูปแบบเบอร์โทรไม่ถูกต้อง</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่จัดส่ง</label>
            <textarea
              value={formData.shipping_address}
              onChange={(e) => setFormData(prev => ({ ...prev, shipping_address: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
              rows={2}
              placeholder="บ้านเลขที่ ซอย ถนน"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ตำบล/แขวง</label>
            <input
              type="text"
              value={formData.shipping_district}
              onChange={(e) => setFormData(prev => ({ ...prev, shipping_district: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">อำเภอ/เขต</label>
            <input
              type="text"
              value={formData.shipping_amphoe}
              onChange={(e) => setFormData(prev => ({ ...prev, shipping_amphoe: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">จังหวัด</label>
            <input
              type="text"
              value={formData.shipping_province}
              onChange={(e) => setFormData(prev => ({ ...prev, shipping_province: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">รหัสไปรษณีย์</label>
            <input
              type="text"
              value={formData.shipping_postal_code}
              onChange={(e) => setFormData(prev => ({ ...prev, shipping_postal_code: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              Google Maps Link
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={formData.shipping_google_maps_link}
                onChange={(e) => setFormData(prev => ({ ...prev, shipping_google_maps_link: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                placeholder="วาง link Google Maps เพื่อให้พนักงานส่งของนำทางได้"
              />
              {formData.shipping_google_maps_link && (
                <a
                  href={formData.shipping_google_maps_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  เปิดแผนที่
                </a>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              วิธีใช้: เปิด Google Maps &gt; ค้นหาสถานที่ &gt; กด &quot;แชร์&quot; &gt; คัดลอก Link มาวาง
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุสำหรับการจัดส่ง</label>
            <textarea
              value={formData.shipping_delivery_notes}
              onChange={(e) => setFormData(prev => ({ ...prev, shipping_delivery_notes: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
              rows={2}
              placeholder="เช่น ส่งช่วงเช้า, โทรก่อนส่ง, ประตูสีเขียว"
            />
          </div>
        </div>
      </div>

      {/* Tax Invoice Section (Optional) */}
      <div className="mb-6">
        <label className="flex items-center gap-2 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={formData.needs_tax_invoice}
            onChange={(e) => setFormData(prev => ({ ...prev, needs_tax_invoice: e.target.checked }))}
            className="rounded border-gray-300 text-[#F4511E] focus:ring-[#F4511E]"
          />
          <span className="text-lg font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            ต้องการออกใบกำกับภาษี
          </span>
        </label>

        {formData.needs_tax_invoice && (
          <div className="pl-6 border-l-2 border-[#F4511E] space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อบริษัท/ชื่อผู้เสียภาษี</label>
                <input
                  type="text"
                  value={formData.tax_company_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, tax_company_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  placeholder="บริษัท XXX จำกัด"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เลขประจำตัวผู้เสียภาษี</label>
                <input
                  type="text"
                  value={formData.tax_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, tax_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  placeholder="X-XXXX-XXXXX-XX-X"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">สาขา</label>
                <input
                  type="text"
                  value={formData.tax_branch}
                  onChange={(e) => setFormData(prev => ({ ...prev, tax_branch: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  placeholder="สำนักงานใหญ่ หรือ สาขาที่ XXXXX"
                />
              </div>
            </div>

            {/* Billing Address */}
            <div>
              <label className="flex items-center gap-2 text-sm mb-3">
                <input
                  type="checkbox"
                  checked={formData.billing_same_as_shipping}
                  onChange={(e) => setFormData(prev => ({ ...prev, billing_same_as_shipping: e.target.checked }))}
                  className="rounded border-gray-300 text-[#F4511E] focus:ring-[#F4511E]"
                />
                <span className="text-gray-700 dark:text-slate-300">ใช้ที่อยู่เดียวกับที่อยู่จัดส่ง</span>
              </label>

              {!formData.billing_same_as_shipping && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่ออกบิล</label>
                    <textarea
                      value={formData.billing_address}
                      onChange={(e) => setFormData(prev => ({ ...prev, billing_address: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      rows={2}
                      placeholder="บ้านเลขที่ ซอย ถนน"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ตำบล/แขวง</label>
                    <input
                      type="text"
                      value={formData.billing_district}
                      onChange={(e) => setFormData(prev => ({ ...prev, billing_district: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">อำเภอ/เขต</label>
                    <input
                      type="text"
                      value={formData.billing_amphoe}
                      onChange={(e) => setFormData(prev => ({ ...prev, billing_amphoe: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">จังหวัด</label>
                    <input
                      type="text"
                      value={formData.billing_province}
                      onChange={(e) => setFormData(prev => ({ ...prev, billing_province: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">รหัสไปรษณีย์</label>
                    <input
                      type="text"
                      value={formData.billing_postal_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, billing_postal_code: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Credit Terms */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-slate-300">เงื่อนไขเครดิต</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">วงเงินเครดิต (บาท)</label>
            <input
              type="number"
              value={formData.credit_limit}
              onChange={(e) => setFormData(prev => ({ ...prev, credit_limit: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
              min="0"
              step="0.01"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ระยะเวลาเครดิต (วัน)</label>
            <input
              type="number"
              value={formData.credit_days}
              onChange={(e) => setFormData(prev => ({ ...prev, credit_days: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
              min="0"
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุ</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
          rows={3}
        />
      </div>

      {/* Status */}
      <div className="mb-6">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={formData.is_active}
            onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
            className="mr-2 rounded border-gray-300 text-[#F4511E] focus:ring-[#F4511E]"
          />
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">ใช้งาน</span>
        </label>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 dark:bg-slate-900"
          disabled={isLoading}
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          className="bg-[#F4511E] text-white px-4 py-2 rounded-lg hover:bg-[#D63B0E] disabled:opacity-50 flex items-center"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              กำลังบันทึก...
            </>
          ) : (
            'บันทึก'
          )}
        </button>
      </div>
    </form>
  );
}
