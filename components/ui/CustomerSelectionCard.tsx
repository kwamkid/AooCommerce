'use client';

import { useState } from 'react';
import { Users, X, UserPlus, MapPin, ChevronDown, CheckCircle, Plus, UserCheck, Loader2 } from 'lucide-react';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import CustomerInfoCard from '@/components/ui/CustomerInfoCard';
import TaxInvoiceInfo from '@/components/ui/TaxInvoiceInfo';
import TaxInvoiceEditModal from '@/components/ui/TaxInvoiceEditModal';
import FormInput from '@/components/ui/FormInput';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import { parseThaiAddress } from '@/lib/address-parser';

// ── Types ──────────────────────────────────────────────────

export interface CustomerOption {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
  customer_code?: string | null;
  customer_type?: string | null;
  sale_type?: string | null;
  // Billing/tax (for read-only display)
  billing_address?: string | null;
  billing_district?: string | null;
  billing_amphoe?: string | null;
  billing_province?: string | null;
  billing_postal_code?: string | null;
  tax_company_name?: string | null;
  tax_id?: string | null;
  tax_branch?: string | null;
}

export interface ShippingAddress {
  id: string;
  address_name: string;
  address_line1: string;
  district: string;
  amphoe: string;
  province: string;
  postal_code: string;
  phone: string;
  contact_person: string;
  delivery_notes?: string;
  is_default?: boolean;
}

export interface DeliveryFields {
  deliveryName: string;
  deliveryPhone: string;
  deliveryEmail: string;
  deliveryAddress: string;
  deliveryDistrict: string;
  deliveryAmphoe: string;
  deliveryProvince: string;
  deliveryPostalCode: string;
}

export interface TaxFields {
  taxType: 'personal' | 'corporate';
  taxName: string;
  taxTaxId: string;
  taxBranch: string;
  taxAddress: string;
}

interface Props {
  /** Label for customer field */
  customerLabel?: string;
  /** Placeholder for search input */
  searchPlaceholder?: string;
  /** URL to create new customer */
  createCustomerUrl?: string;
  /** Create button label */
  createButtonLabel?: string;
  /** Whether customer selection is required (shows * indicator) — default true */
  customerRequired?: boolean;

  // ── Customer data ──
  customers: CustomerOption[];
  selectedCustomer: CustomerOption | null;
  selectedCustomerId: string;
  onCustomerChange: (id: string) => void;
  onCustomerClear: () => void;
  /** Loading indicator (e.g., GP data loading) */
  loading?: boolean;
  /** Badge to show next to customer name */
  badge?: React.ReactNode;
  /** Disabled (read-only mode) */
  disabled?: boolean;

  // ── Delivery fields (editable mode) ──
  delivery?: DeliveryFields;
  onDeliveryChange?: (fields: Partial<DeliveryFields>) => void;

  /**
   * ตัวเลือก "สั่งเอง / ส่งให้คนอื่น" เหนือช่องที่อยู่
   *
   * อยู่ตรงนี้เพราะมันคือตัวบอกว่า **ที่อยู่ข้างล่างเป็นของใคร** — วางแยกการ์ด
   * แล้วผู้ใช้จะไม่รู้ว่าสองอย่างนี้เกี่ยวกัน (เคยลองแล้ว user ทักทันที)
   *
   * ไม่ผูกกับฟีเจอร์ delivery — ร้านที่ส่งพัสดุผ่านขนส่งก็ส่งของขวัญให้คนอื่นได้
   * ไม่ส่ง onShipToOtherChange มา = ไม่วาดตัวเลือกนี้เลย (ของเดิมทุกที่)
   */
  shipToOther?: boolean;
  onShipToOtherChange?: (v: boolean) => void;
  recipientNameError?: string;

  // ── Shipping addresses (address dropdown) ──
  shippingAddresses?: ShippingAddress[];
  selectedAddressId?: string;
  onAddressSelect?: (addressId: string, address: ShippingAddress) => void;
  onNewAddress?: () => void;

  // ── Tax invoice fields ──
  /** Show tax invoice section */
  showTaxInvoice?: boolean;
  /** VAT registered company — show TaxInvoiceInfo inline */
  vatRegistered?: boolean;
  taxFields?: TaxFields;
  onTaxFieldsChange?: (fields: TaxFields) => void;
  /** Show "ขอใบกำกับภาษี" checkbox (for non-VAT companies) */
  showTaxCheckbox?: boolean;
  taxInvoiceRequested?: boolean;
  onTaxInvoiceRequestedChange?: (checked: boolean) => void;
  /** True if the selected customer already has tax info saved on file.
   *  Drives modal UX: when false → first save auto-persists to customer;
   *  when true → modal shows a 2nd button "บันทึก + อัพเดทลูกค้า". */
  customerHasTax?: boolean;
  /** Persist tax fields back to the customer master record. Parent owns
   *  the API call (PATCH /api/customers) so this component stays presentational. */
  onUpdateCustomerTax?: (fields: TaxFields) => void;

  // ── New customer mode (toggle) ──
  /** Allow toggling between existing/new customer */
  allowNewCustomer?: boolean;
  /** Whether "new customer" mode is active */
  newCustomerMode?: boolean;
  /** Callback when toggle changes */
  onNewCustomerModeChange?: (isNew: boolean) => void;
  /** New customer name (editable in new customer mode) */
  newCustomerName?: string;
  /** Callback when new customer name changes */
  onNewCustomerNameChange?: (name: string) => void;

  // ── Read-only display mode ──
  /** Show customer info as read-only (no editable fields) */
  readOnly?: boolean;
}

// ── Helper: get badge for sale_type ──────────────────────

function getSaleTypeBadge(customer: CustomerOption): React.ReactNode {
  // Resolve sale_type with fallback based on customer_type
  let st = customer.sale_type || '';
  if (!st && customer.customer_type) {
    const fallback: Record<string, string> = {
      consignment_dealer: 'consignment',
      wholesale_dealer: 'wholesale_cash',
      wholesale_department: 'wholesale_cash',
      department_store: 'consignment',
      corporate: 'wholesale_credit',
    };
    st = fallback[customer.customer_type] || '';
  }
  if (!st) return undefined;
  const map: Record<string, { label: string; cls: string }> = {
    wholesale_credit: { label: 'เครดิต', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    wholesale_cash: { label: 'เงินสด', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    consignment: { label: 'ฝากขาย', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  };
  const m = map[st];
  if (!m) return undefined;
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

// ── Component ──────────────────────────────────────────────

export default function CustomerSelectionCard({
  customerLabel = 'ลูกค้า',
  searchPlaceholder = 'ค้นหาชื่อ, รหัส, หรือเบอร์โทร...',
  createCustomerUrl,
  createButtonLabel = 'เพิ่มลูกค้า',
  customerRequired = true,
  customers,
  selectedCustomer,
  selectedCustomerId,
  onCustomerChange,
  onCustomerClear,
  loading = false,
  badge,
  disabled = false,
  delivery,
  onDeliveryChange,
  shipToOther = false,
  onShipToOtherChange,
  recipientNameError,
  shippingAddresses = [],
  selectedAddressId,
  onAddressSelect,
  onNewAddress,
  showTaxInvoice = false,
  vatRegistered = false,
  taxFields,
  onTaxFieldsChange,
  showTaxCheckbox = false,
  taxInvoiceRequested = false,
  onTaxInvoiceRequestedChange,
  customerHasTax = false,
  onUpdateCustomerTax,
  allowNewCustomer = false,
  newCustomerMode = false,
  onNewCustomerModeChange,
  newCustomerName = '',
  onNewCustomerNameChange,
  readOnly = false,
}: Props) {
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const isEditable = !disabled && !readOnly;
  const hasDelivery = !!delivery && !!onDeliveryChange;
  const resolvedBadge = badge ?? (selectedCustomer ? getSaleTypeBadge(selectedCustomer) : undefined);

  // Build search options with badges
  const searchOptions = customers.map(c => {
    const b = getSaleTypeBadge(c);
    return {
      id: c.id,
      label: c.name,
      subtitle: c.phone || undefined,
      icon: <Users className="w-4 h-4 text-gray-400" />,
      badge: b ? b : undefined,
    };
  });

  const showDeliveryCol = !!(selectedCustomer || hasDelivery);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        {/* Section header — Left (toggle moved out, sits inline with the input below) */}
        <div className="flex items-center gap-1.5 pb-1 border-b border-gray-100 dark:border-slate-700">
          <Users className="w-4 h-4 text-gray-500 dark:text-slate-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            {customerLabel}
            {customerRequired && <span className="text-red-500 ml-0.5">*</span>}
          </span>
        </div>

        {/* Section header — Right */}
        {showDeliveryCol ? (
          <div className="hidden sm:flex items-center gap-1.5 pb-1 border-b border-gray-100 dark:border-slate-700 sm:border-l sm:border-l-transparent sm:pl-4">
            <MapPin className="w-4 h-4 text-gray-500 dark:text-slate-400" />
            <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
              {onShipToOtherChange ? 'จัดส่งถึง' : 'ที่อยู่จัดส่ง'}
            </span>
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}

      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 items-start">
        <div className="space-y-3 min-w-0">
        {/* Row 1 Left: [toggle] + [search/name input] OR [selected customer card] */}
        <div className="relative flex flex-col">

          {/* Mode: New Customer — toggle + name input side by side */}
          {newCustomerMode && !selectedCustomer ? (
            <div className="flex items-stretch gap-2">
              {allowNewCustomer && isEditable && (
                <div className="flex items-center gap-0 bg-gray-100 dark:bg-slate-700 rounded-lg p-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { onNewCustomerModeChange?.(false); onNewCustomerNameChange?.(''); }}
                    className="px-3 py-1.5 text-sm font-medium rounded-md transition-all text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
                  >
                    เก่า
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm font-medium rounded-md transition-all bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm"
                  >
                    ใหม่
                  </button>
                </div>
              )}
              <input
                type="text"
                value={newCustomerName}
                onChange={(e) => onNewCustomerNameChange?.(e.target.value)}
                placeholder="ชื่อลูกค้าใหม่"
                className="flex-1 min-w-0 px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          ) : selectedCustomer ? (
            <div className="relative flex-1">
              {/* Selected-customer chip — single-line, matches input height (h-10).
                  Layout: [icon + name + badge (+ chevron when multi-address)] — [X clear on far right] */}
              <div className="flex items-center h-10 bg-orange-50 dark:bg-orange-900/20 border border-primary/30 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => { if (shippingAddresses.length > 1 && isEditable) setShowAddressDropdown(!showAddressDropdown); }}
                  disabled={!(shippingAddresses.length > 1 && isEditable)}
                  className={`flex items-center gap-2 flex-1 min-w-0 h-full pl-3 text-left ${shippingAddresses.length > 1 && isEditable ? 'cursor-pointer hover:bg-orange-100/40 dark:hover:bg-orange-900/30' : 'cursor-default'}`}
                >
                  {loading
                    ? <Loader2 className="w-4 h-4 text-primary flex-shrink-0 animate-spin" />
                    : <UserCheck className="w-4 h-4 text-primary flex-shrink-0" />
                  }
                  <span className="text-base font-medium text-gray-900 dark:text-slate-200 truncate">{selectedCustomer.name}</span>
                  {resolvedBadge && <span className="flex-shrink-0">{resolvedBadge}</span>}
                  {shippingAddresses.length > 1 && (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 ml-auto mr-2" />
                  )}
                </button>
                {isEditable && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCustomerClear(); onNewCustomerModeChange?.(false); }}
                    className="h-full px-3 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors flex-shrink-0 border-l border-primary/20"
                    title="ล้างลูกค้า"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>
              {/* Address dropdown */}
              {showAddressDropdown && shippingAddresses.length > 1 && isEditable && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowAddressDropdown(false)} />
                  <div className="absolute z-[999] w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                    {shippingAddresses.map(addr => (
                      <button key={addr.id} type="button" onClick={() => {
                        onAddressSelect?.(addr.id, addr);
                        setShowAddressDropdown(false);
                      }} className={`w-full px-3 py-2.5 text-left flex items-center gap-2 transition-colors ${selectedAddressId === addr.id ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}>
                        <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${selectedAddressId === addr.id ? 'text-primary' : 'text-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm ${selectedAddressId === addr.id ? 'font-medium text-primary' : 'text-gray-700 dark:text-slate-300'}`}>{addr.address_name}</div>
                          <div className="text-xs text-gray-400 dark:text-slate-500 truncate">{[addr.address_line1, addr.district, addr.amphoe, addr.province].filter(Boolean).join(', ')}</div>
                        </div>
                        {selectedAddressId === addr.id && <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />}
                      </button>
                    ))}
                    {onNewAddress && (
                      <button type="button" onClick={() => { onNewAddress(); setShowAddressDropdown(false); }}
                        className="w-full px-3 py-2.5 text-left flex items-center gap-2 border-t border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                        <Plus className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm text-gray-500 dark:text-slate-400">ที่อยู่ใหม่</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-stretch gap-2">
              {allowNewCustomer && isEditable && (
                <div className="flex items-center gap-0 bg-gray-100 dark:bg-slate-700 rounded-lg p-0.5 flex-shrink-0">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm font-medium rounded-md transition-all bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm"
                  >
                    เก่า
                  </button>
                  <button
                    type="button"
                    onClick={() => { onNewCustomerModeChange?.(true); onCustomerClear(); }}
                    className="px-3 py-1.5 text-sm font-medium rounded-md transition-all text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
                  >
                    ใหม่
                  </button>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <EntitySearchInput
                  value=""
                  onChange={onCustomerChange}
                  options={searchOptions}
                  placeholder={searchPlaceholder}
                  emptyMessage="ไม่พบลูกค้า"
                />
              </div>
            </div>
          )}
        </div>


        {/* Row 2 Left: เบอร์โทร + อีเมล + ภาษี */}
        {(selectedCustomer || hasDelivery) && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">เบอร์โทร</label>
                <input type="text" inputMode="tel" value={delivery?.deliveryPhone || selectedCustomer?.phone || ''} onChange={(e) => onDeliveryChange?.({ deliveryPhone: e.target.value })} placeholder="0xx-xxx-xxxx" disabled={!isEditable}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 dark:disabled:bg-slate-800" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">อีเมล</label>
                <input type="text" inputMode="email" value={delivery?.deliveryEmail || selectedCustomer?.email || ''} onChange={(e) => onDeliveryChange?.({ deliveryEmail: e.target.value })} placeholder="email@example.com" disabled={!isEditable}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 dark:disabled:bg-slate-800" />
              </div>
            </div>

            {/* Tax invoice — VAT registered: show TaxInvoiceInfo */}
            {showTaxInvoice && vatRegistered && taxFields && (
              <TaxInvoiceInfo
                customerName={selectedCustomer?.name || ''}
                taxCompanyName={taxFields.taxName} taxId={taxFields.taxTaxId}
                taxBranch={taxFields.taxBranch} billingAddress={taxFields.taxAddress}
                onEdit={isEditable && onTaxFieldsChange ? (data) => {
                  onTaxFieldsChange({
                    taxType: data.tax_type,
                    taxName: data.tax_company_name,
                    taxTaxId: data.tax_id,
                    taxBranch: data.tax_branch,
                    taxAddress: data.billing_address,
                  });
                } : undefined}
              />
            )}

            {/* Tax checkbox (non-VAT) — checking it opens an edit modal so the
                fields don't expand inline. After save, a compact one-line
                summary shows below with a small "แก้ไข" link. */}
            {showTaxCheckbox && !vatRegistered && (selectedCustomer || hasDelivery) && isEditable && (
              <div className="mt-1 pt-2.5 space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taxInvoiceRequested}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      onTaxInvoiceRequestedChange?.(checked);
                      // First-time check with no data yet → auto-open modal
                      if (checked && taxFields && !taxFields.taxTaxId && !taxFields.taxName) {
                        setShowTaxModal(true);
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-primary focus:ring-primary accent-primary"
                  />
                  <span className="text-base font-medium text-primary dark:text-orange-400">ขอใบกำกับภาษี</span>
                </label>
                {/* Compact summary line: shows when checked + has any data */}
                {taxInvoiceRequested && taxFields && (taxFields.taxName || taxFields.taxTaxId) && (
                  <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-slate-400 pl-6">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="break-words">
                        {[taxFields.taxName, taxFields.taxTaxId, taxFields.taxBranch].filter(Boolean).join(' · ')}
                      </div>
                      {taxFields.taxAddress && (
                        <div className="text-xs text-gray-500 dark:text-slate-500 break-words">
                          {taxFields.taxAddress}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTaxModal(true)}
                      className="text-primary hover:underline flex-shrink-0"
                    >
                      แก้ไข
                    </button>
                  </div>
                )}
                {/* Checked but no data yet → prompt to fill */}
                {taxInvoiceRequested && taxFields && !taxFields.taxName && !taxFields.taxTaxId && (
                  <div className="pl-6">
                    <button
                      type="button"
                      onClick={() => setShowTaxModal(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      + กรอกข้อมูลภาษี
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        </div>

        <div className="space-y-3 min-w-0">
        {/* Row 1 Right: ที่อยู่ textarea (label is in the section header above) */}
        {showDeliveryCol && (
        <div className="flex flex-col sm:border-l sm:border-gray-200 dark:sm:border-slate-700 sm:pl-4">
          {onShipToOtherChange && (
            <div className="mb-3">
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: false, title: 'สั่งเอง', desc: 'ผู้สั่งเป็นผู้รับ', on: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20', dot: 'border-blue-500 bg-blue-500' },
                  { key: true, title: 'ส่งให้คนอื่น', desc: 'เป็นของขวัญ', on: 'border-pink-500 bg-pink-50 dark:bg-pink-900/20', dot: 'border-pink-500 bg-pink-500' },
                ] as const).map(o => {
                  const active = shipToOther === o.key;
                  return (
                    <button
                      key={String(o.key)}
                      type="button"
                      disabled={!isEditable}
                      onClick={() => onShipToOtherChange(o.key)}
                      aria-pressed={active}
                      className={`flex items-center gap-2 text-left px-3 py-2 rounded-lg border transition-colors disabled:cursor-not-allowed ${
                        active ? o.on : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 grid place-items-center ${
                        active ? o.dot : 'border-gray-300 dark:border-slate-500'
                      }`}>
                        {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-base font-medium text-gray-800 dark:text-slate-200 leading-tight">{o.title}</span>
                        <span className="block text-sm text-gray-500 dark:text-slate-400 leading-tight">{o.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* ชื่อ/เบอร์ผู้รับ แทรกเหนือที่อยู่ — ที่อยู่ข้างล่างจึงเป็นของคนนี้ชัดเจน */}
              {shipToOther && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">
                      ชื่อผู้รับ <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={delivery?.deliveryName || ''}
                      onChange={(e) => onDeliveryChange?.({ deliveryName: e.target.value })}
                      disabled={!isEditable}
                      placeholder="ชื่อคนที่จะได้รับของ"
                      className={`w-full px-3 py-2.5 border rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 dark:disabled:bg-slate-800 ${
                        recipientNameError ? 'border-red-400' : 'border-gray-300 dark:border-slate-600'
                      }`}
                    />
                    {recipientNameError && <p className="text-red-500 text-sm mt-1">{recipientNameError}</p>}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">เบอร์ผู้รับ</label>
                    <input
                      type="text"
                      inputMode="tel"
                      value={delivery?.deliveryPhone || ''}
                      onChange={(e) => onDeliveryChange?.({ deliveryPhone: e.target.value })}
                      disabled={!isEditable}
                      placeholder="ให้คนส่งของโทรหาได้"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 dark:disabled:bg-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <textarea
            value={delivery?.deliveryAddress || ''}
            onChange={(e) => onDeliveryChange?.({ deliveryAddress: e.target.value })}
            onPaste={isEditable ? (e) => {
              const pasted = e.clipboardData.getData('text');
              if (pasted.length > 10) {
                const parsed = parseThaiAddress(pasted);
                if (parsed) {
                  e.preventDefault();
                  onDeliveryChange?.({
                    deliveryAddress: parsed.address,
                    deliveryDistrict: parsed.district,
                    deliveryAmphoe: parsed.amphoe,
                    deliveryProvince: parsed.province,
                    deliveryPostalCode: parsed.postal_code,
                  });
                }
              }
            } : undefined}
            rows={2}
            disabled={!isEditable}
            placeholder="วางที่อยู่ยาวๆ ได้เลย — ระบบจะแยก ตำบล อำเภอ จังหวัด ให้อัตโนมัติ"
            className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base font-sans bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 dark:disabled:bg-slate-800 resize-none"
          />
          {onShipToOtherChange && isEditable && !delivery?.deliveryAddress && (
            <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">
              ไม่กรอกก็บันทึกได้ — ส่งลิงก์บิลให้ลูกค้ากรอกที่อยู่เองทีหลัง
            </p>
          )}
        </div>
        )}


        {/* Row 2 Right: ThaiAddressInput */}
        {(selectedCustomer || hasDelivery) && (
          <div className="sm:border-l sm:border-gray-200 dark:sm:border-slate-700 sm:pl-4">
            <ThaiAddressInput
              compact
              district={delivery?.deliveryDistrict || ''}
              amphoe={delivery?.deliveryAmphoe || ''}
              province={delivery?.deliveryProvince || ''}
              postalCode={delivery?.deliveryPostalCode || ''}
              onAddressChange={isEditable ? (addr) => {
                const updates: Partial<DeliveryFields> = {};
                if (addr.district !== undefined) updates.deliveryDistrict = addr.district;
                if (addr.amphoe !== undefined) updates.deliveryAmphoe = addr.amphoe;
                if (addr.province !== undefined) updates.deliveryProvince = addr.province;
                if (addr.postalCode !== undefined) updates.deliveryPostalCode = addr.postalCode;
                onDeliveryChange?.(updates);
              } : () => {}}
              disabled={!isEditable}
            />
          </div>
        )}
        </div>
      </div>

        {/* Tax invoice modal — opens from checkbox above or the แก้ไข link */}
        {showTaxModal && taxFields && onTaxFieldsChange && (
          <TaxInvoiceEditModal
            data={{
              tax_type: taxFields.taxType,
              tax_company_name: taxFields.taxName,
              tax_id: taxFields.taxTaxId,
              tax_branch: taxFields.taxBranch,
              billing_address: taxFields.taxAddress,
            }}
            onSave={(data) => {
              const fields: TaxFields = {
                taxType: data.tax_type,
                taxName: data.tax_company_name,
                taxTaxId: data.tax_id,
                taxBranch: data.tax_branch,
                taxAddress: data.billing_address,
              };
              onTaxFieldsChange(fields);
              setShowTaxModal(false);
              // First-time fill (customer had no tax info on file) → auto-persist
              // back to the customer so next order is pre-filled. When the
              // customer already had tax info, this primary button is the
              // "snapshot-only" path; user must use the secondary button to
              // overwrite the customer master.
              if (!customerHasTax) {
                onUpdateCustomerTax?.(fields);
              }
            }}
            onSaveAndUpdateCustomer={customerHasTax && onUpdateCustomerTax ? (data) => {
              const fields: TaxFields = {
                taxType: data.tax_type,
                taxName: data.tax_company_name,
                taxTaxId: data.tax_id,
                taxBranch: data.tax_branch,
                taxAddress: data.billing_address,
              };
              onTaxFieldsChange(fields);
              onUpdateCustomerTax(fields);
              setShowTaxModal(false);
            } : undefined}
            onClose={() => {
              setShowTaxModal(false);
              // If the user opened the modal via the checkbox but cancelled
              // before filling anything, treat it as "don't request" — uncheck.
              // (Cancelling an EDIT of existing data should not uncheck.)
              if (!taxFields.taxName && !taxFields.taxTaxId) {
                onTaxInvoiceRequestedChange?.(false);
              }
            }}
          />
        )}
    </div>
  );
}
