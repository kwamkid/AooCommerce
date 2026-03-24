'use client';

import { useState } from 'react';
import { Users, X, UserPlus, MapPin, ChevronDown, CheckCircle, Plus } from 'lucide-react';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import CustomerInfoCard from '@/components/ui/CustomerInfoCard';
import TaxInvoiceInfo from '@/components/ui/TaxInvoiceInfo';
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

  // ── Read-only display mode ──
  /** Show customer info as read-only (no editable fields) */
  readOnly?: boolean;
}

// ── Helper: get badge for sale_type ──────────────────────

function getSaleTypeBadge(customer: CustomerOption): React.ReactNode {
  const st = customer.sale_type || (customer.customer_type === 'consignment_dealer' ? 'consignment' : '');
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
  readOnly = false,
}: Props) {
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
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

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        {/* Row 1 Left: ลูกค้า */}
        <div className="relative flex flex-col">
          <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
            {customerLabel} {customerRequired && <span className="text-red-500">*</span>}
          </label>
          {selectedCustomer ? (
            <div className="relative flex-1">
              <div
                className={`flex items-start gap-2 px-3 py-2.5 bg-orange-50 dark:bg-orange-900/20 border border-[#F4511E]/30 rounded-lg h-full ${shippingAddresses.length > 1 && isEditable ? 'cursor-pointer' : ''}`}
                onClick={() => { if (shippingAddresses.length > 1 && isEditable) setShowAddressDropdown(!showAddressDropdown); }}
              >
                <CustomerInfoCard
                  customer={selectedCustomer}
                  loading={loading}
                  badge={resolvedBadge}
                >
                  {shippingAddresses.length > 1 && (
                    <div className="text-sm text-gray-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span>{selectedAddressId === 'new' ? 'ที่อยู่ใหม่' : (shippingAddresses.find(a => a.id === selectedAddressId)?.address_name || shippingAddresses[0]?.address_name)}</span>
                      <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </div>
                  )}
                </CustomerInfoCard>
                {isEditable && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onCustomerClear(); }}
                    className="p-1 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded transition-colors flex-shrink-0">
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                )}
              </div>
              {/* Address dropdown */}
              {showAddressDropdown && shippingAddresses.length > 1 && isEditable && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowAddressDropdown(false)} />
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                    {shippingAddresses.map(addr => (
                      <button key={addr.id} type="button" onClick={() => {
                        onAddressSelect?.(addr.id, addr);
                        setShowAddressDropdown(false);
                      }} className={`w-full px-3 py-2.5 text-left flex items-center gap-2 transition-colors ${selectedAddressId === addr.id ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}>
                        <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${selectedAddressId === addr.id ? 'text-[#F4511E]' : 'text-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm ${selectedAddressId === addr.id ? 'font-medium text-[#F4511E]' : 'text-gray-700 dark:text-slate-300'}`}>{addr.address_name}</div>
                          <div className="text-xs text-gray-400 dark:text-slate-500 truncate">{[addr.address_line1, addr.district, addr.amphoe, addr.province].filter(Boolean).join(', ')}</div>
                        </div>
                        {selectedAddressId === addr.id && <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0" />}
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
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <EntitySearchInput
                  value=""
                  onChange={onCustomerChange}
                  options={searchOptions}
                  placeholder={searchPlaceholder}
                  emptyMessage="ไม่พบลูกค้า"
                />
              </div>
              {createCustomerUrl && isEditable && (
                <button
                  type="button"
                  onClick={() => window.open(createCustomerUrl, '_blank')}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 h-[42px] rounded-lg border border-gray-300 dark:border-slate-600 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                >
                  <UserPlus className="w-4 h-4" /> {createButtonLabel}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Row 1 Right: ที่อยู่ */}
        <div className="flex flex-col sm:border-l sm:border-gray-200 dark:sm:border-slate-700 sm:pl-4">
          <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่</label>
          {hasDelivery && isEditable ? (
            <textarea
              value={delivery.deliveryAddress}
              onChange={(e) => onDeliveryChange!({ deliveryAddress: e.target.value })}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted.length > 10) {
                  const parsed = parseThaiAddress(pasted);
                  if (parsed) {
                    e.preventDefault();
                    onDeliveryChange!({
                      deliveryAddress: parsed.address,
                      deliveryDistrict: parsed.district,
                      deliveryAmphoe: parsed.amphoe,
                      deliveryProvince: parsed.province,
                      deliveryPostalCode: parsed.postal_code,
                    });
                  }
                }
              }}
              rows={2}
              placeholder="วางที่อยู่ยาวๆ ได้เลย — ระบบจะแยก ตำบล อำเภอ จังหวัด ให้อัตโนมัติ"
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] resize-none"
            />
          ) : selectedCustomer ? (
            <p className="text-sm text-gray-700 dark:text-slate-300 py-2">
              {delivery?.deliveryAddress
                || [selectedCustomer.phone].filter(Boolean).join(' ')
                || '-'}
            </p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-slate-500 py-2">เลือก{customerLabel}เพื่อแสดงที่อยู่</p>
          )}
        </div>

        {/* Row 2 Left: เบอร์โทร + อีเมล + ภาษี */}
        {(selectedCustomer || (hasDelivery && isEditable)) && (
          <div className="space-y-2">
            {hasDelivery && isEditable ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">เบอร์โทร</label>
                  <input type="text" inputMode="tel" value={delivery.deliveryPhone} onChange={(e) => onDeliveryChange!({ deliveryPhone: e.target.value })} placeholder="0xx-xxx-xxxx"
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E]" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">อีเมล</label>
                  <input type="text" inputMode="email" value={delivery.deliveryEmail} onChange={(e) => onDeliveryChange!({ deliveryEmail: e.target.value })} placeholder="email@example.com"
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E]" />
                </div>
              </div>
            ) : selectedCustomer ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">เบอร์โทร</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedCustomer.phone || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">อีเมล</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedCustomer.email || '-'}</p>
                </div>
              </div>
            ) : null}

            {/* Tax invoice — VAT registered: show TaxInvoiceInfo */}
            {showTaxInvoice && vatRegistered && taxFields && (
              <TaxInvoiceInfo
                customerName={selectedCustomer?.name || ''}
                taxCompanyName={taxFields.taxName} taxId={taxFields.taxTaxId}
                taxBranch={taxFields.taxBranch} billingAddress={taxFields.taxAddress}
                onEdit={isEditable && onTaxFieldsChange ? (data) => {
                  onTaxFieldsChange({
                    taxName: data.tax_company_name,
                    taxTaxId: data.tax_id,
                    taxBranch: data.tax_branch,
                    taxAddress: data.billing_address,
                  });
                } : undefined}
              />
            )}
          </div>
        )}

        {/* Row 2 Right: ThaiAddressInput (editable) or read-only display */}
        {(selectedCustomer || (hasDelivery && isEditable)) && (
          <div className="sm:border-l sm:border-gray-200 dark:sm:border-slate-700 sm:pl-4">
            {hasDelivery && isEditable ? (
              <ThaiAddressInput
                district={delivery.deliveryDistrict}
                amphoe={delivery.deliveryAmphoe}
                province={delivery.deliveryProvince}
                postalCode={delivery.deliveryPostalCode}
                onAddressChange={(addr) => {
                  const updates: Partial<DeliveryFields> = {};
                  if (addr.district !== undefined) updates.deliveryDistrict = addr.district;
                  if (addr.amphoe !== undefined) updates.deliveryAmphoe = addr.amphoe;
                  if (addr.province !== undefined) updates.deliveryProvince = addr.province;
                  if (addr.postalCode !== undefined) updates.deliveryPostalCode = addr.postalCode;
                  onDeliveryChange!(updates);
                }}
              />
            ) : (
              /* Read-only: show tax info if available */
              taxFields?.taxName ? (
                <TaxInvoiceInfo
                  customerName={selectedCustomer?.name || ''}
                  taxCompanyName={taxFields.taxName} taxId={taxFields.taxTaxId}
                  taxBranch={taxFields.taxBranch} billingAddress={taxFields.taxAddress}
                  compact
                />
              ) : null
            )}
          </div>
        )}

        {/* Tax Invoice checkbox (non-VAT companies) */}
        {showTaxCheckbox && !vatRegistered && (selectedCustomer || hasDelivery) && isEditable && (
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={taxInvoiceRequested}
                onChange={(e) => onTaxInvoiceRequestedChange?.(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-[#F4511E] focus:ring-[#F4511E] accent-[#F4511E]"
              />
              <span className="text-base font-medium text-[#F4511E] dark:text-orange-400">ขอใบกำกับภาษี</span>
            </label>
            {taxInvoiceRequested && taxFields && onTaxFieldsChange && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">ชื่อบริษัท/ชื่อผู้เสียภาษี</label>
                  <input type="text" value={taxFields.taxName} onChange={(e) => onTaxFieldsChange({ ...taxFields, taxName: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#F4511E]" placeholder="บริษัท XXX จำกัด" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">เลขประจำตัวผู้เสียภาษี</label>
                    <input type="text" value={taxFields.taxTaxId} onChange={(e) => onTaxFieldsChange({ ...taxFields, taxTaxId: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#F4511E]" placeholder="X-XXXX-XXXXX-XX-X" maxLength={17} />
                  </div>
                  <div>
                    <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">สาขา</label>
                    <input type="text" value={taxFields.taxBranch} onChange={(e) => onTaxFieldsChange({ ...taxFields, taxBranch: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#F4511E]" placeholder="สำนักงานใหญ่" />
                  </div>
                </div>
                <div>
                  <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">ที่อยู่ออกบิล</label>
                  <textarea value={taxFields.taxAddress} onChange={(e) => onTaxFieldsChange({ ...taxFields, taxAddress: e.target.value })} rows={2}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#F4511E] resize-none" placeholder="ที่อยู่สำหรับออกใบกำกับภาษี" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
