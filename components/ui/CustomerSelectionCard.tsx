'use client';

import { useEffect, useRef, useState } from 'react';
import { PHONE_INPUT_PROPS, onPhoneChange } from '@/lib/numeric-input';
import Link from 'next/link';
import { Users, X, UserPlus, MapPin, ChevronDown, CheckCircle, Plus, UserCheck, Loader2, Pencil, Gift, Search } from 'lucide-react';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import Tabs from '@/components/ui/Tabs';
import Tooltip from '@/components/ui/Tooltip';
import CustomerInfoCard from '@/components/ui/CustomerInfoCard';
import TaxInvoiceInfo from '@/components/ui/TaxInvoiceInfo';
import TaxInvoiceEditModal from '@/components/ui/TaxInvoiceEditModal';
import FormInput from '@/components/ui/FormInput';
import FormSelect from '@/components/ui/FormSelect';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import { parseThaiAddress } from '@/lib/address-parser';

import { isValidEmail, EMAIL_INVALID_MESSAGE } from '@/lib/email';
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
  /** true = ที่อยู่ "ผู้รับของขวัญ" (โหมดส่งให้คนอื่น)
   *  สองสมุดนี้แยกกันเด็ดขาด: dropdown ใต้ชิปลูกค้า = ที่อยู่ของลูกค้าเอง (false),
   *  FormSelect "ที่อยู่ที่บันทึกไว้" ในโหมดส่งให้คนอื่น = ที่อยู่ผู้รับ (true) */
  is_recipient?: boolean;
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
  /**
   * โหมดค้นลูกค้าฝั่ง server — ส่งต่อให้ `EntitySearchInput` เป็น `onSearchChange`
   * เมื่อส่งมา `customers` = ผลค้นหา (หรือลูกค้าล่าสุด) ที่ผู้เรียกเตรียมไว้แล้ว
   * ใช้กับร้านที่มีลูกค้าหลักพัน ซึ่งโหลดมาทั้งก้อนไม่ได้ (เพดาน 1,000 แถวของ Supabase)
   *
   * ฝั่ง parent ให้ต่อกับ `useServerSearch` ([lib/useServerSearch.ts](lib/useServerSearch.ts))
   * — guard ลำดับ response · จำผล 30 วิ · กรองต่อในเครื่องเมื่อพิมพ์ต่อจากคำเดิม
   */
  onCustomerSearchChange?: (search: string) => void;
  /**
   * ลูกค้าเดิมที่ "เบอร์โทรตรงกัน" ตอนกำลังสร้างลูกค้าใหม่ — ฟอร์มแม่เป็นคนหาให้
   * (การ์ดนี้ไม่ยิง API เอง ตั้งใจให้เป็นตัววาดล้วน) · null/ไม่ส่ง = ไม่เตือน
   *
   * เตือนอย่างเดียว **ไม่บล็อก** เพราะเบอร์ซ้ำถูกต้องก็มี (เบอร์บ้านเดียวกัน เบอร์ร้าน)
   */
  duplicatePhoneMatch?: { id: string; name: string; hint?: string; editUrl?: string } | null;
  /** กด "ใช้ลูกค้ารายนี้" จากแถบเตือนเบอร์ซ้ำ */
  onUseDuplicateCustomer?: (id: string) => void;
  /** ตรวจเบอร์ซ้ำใหม่ — หลังผู้ใช้ไปแก้เบอร์ของรายเดิมในอีกแท็บแล้วกลับมา */
  onRecheckDuplicate?: () => void;
  /** สปินเนอร์ระหว่างค้นลูกค้า (คู่กับ onCustomerSearchChange) */
  customersLoading?: boolean;
  /** Badge to show next to customer name */
  badge?: React.ReactNode;
  /** Disabled (read-only mode) */
  disabled?: boolean;
  /**
   * แก้ข้อมูลลูกค้าที่เลือกอยู่ (ชื่อ/เบอร์/ที่อยู่หลัก) — ดินสอบนชิปลูกค้า
   *
   * ช่องเบอร์/อีเมล/ที่อยู่ในการ์ดนี้เป็นของ **บิลใบนี้** ไม่ใช่ของลูกค้า — แก้ชื่อลูกค้า
   * จึงไม่มีทางทำจากในการ์ด ต้องมีทางออกไปแก้ที่ตัวลูกค้าจริง (เจ้าของถาม 8 ก.ย. 2026)
   * ส่ง callback = แก้ในแผงเดียวกัน (หน้าแชท) · ไม่ส่ง = ใช้ `editCustomerUrl` เปิดแท็บใหม่
   */
  onEditCustomer?: () => void;
  /** ลิงก์หน้าแก้ไขลูกค้า — ใช้เมื่อไม่มี `onEditCustomer` (เปิดแท็บใหม่ ไม่ทิ้งบิลที่กรอกค้าง) */
  editCustomerUrl?: string;
  /** ไม่วาดกรอบ/พื้นการ์ด — ใช้ในที่แคบ (แผงแชท/มือถือ) ให้เนื้อหากว้างเต็มพื้นที่ */
  bare?: boolean;

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
  /** error อีเมลจากตอนกดบันทึก (ฟอร์มแม่ตรวจด้วย isValidEmail ตัวเดียวกัน) */
  emailError?: string;

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

  /** Stack customer/delivery vertically regardless of viewport breakpoints —
   *  for narrow containers (chat panel) where the viewport is wide but the
   *  card itself is ~600px, so sm:grid-cols-2 would crush both columns. */
  singleColumn?: boolean;

  /** ล็อคเฉพาะ "การเปลี่ยนตัวลูกค้า" (ซ่อนปุ่มล้าง/toggle ลูกค้าใหม่) แต่ช่องจัดส่ง/ภาษี
   *  ยังกรอกได้ — ใช้กับ flow ที่ลูกค้าถูกกำหนดมาแล้ว เช่นเปิดบิลจากแชท
   *  ห้ามใช้ `disabled` แทน: มันดับทั้งใบ ทำให้กรอกเบอร์/อีเมล/ที่อยู่ไม่ได้ (เจอจริง 2026-08-28) */
  lockCustomerSelection?: boolean;
}

/** sentinel id ของตัวเลือก "กรอกที่อยู่ใหม่" ในสมุดที่อยู่ผู้รับ (ไม่ใช่ id จริงใน DB) */
const NEW_ADDRESS_OPTION_ID = '__new_address__';

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
  searchPlaceholder = 'ค้นหาชื่อ, เบอร์โทร, อีเมล หรือรหัส...',
  createCustomerUrl,
  createButtonLabel = 'เพิ่มลูกค้า',
  customerRequired = true,
  customers,
  selectedCustomer,
  selectedCustomerId,
  onCustomerChange,
  onCustomerClear,
  loading = false,
  onCustomerSearchChange,
  duplicatePhoneMatch,
  onUseDuplicateCustomer,
  onRecheckDuplicate,
  customersLoading = false,
  badge,
  disabled = false,
  delivery,
  onDeliveryChange,
  shipToOther = false,
  onShipToOtherChange,
  recipientNameError,
  emailError,
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
  singleColumn = false,
  lockCustomerSelection = false,
  onEditCustomer,
  editCustomerUrl,
  bare = false,
}: Props) {
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  /**
   * เข้าโหมด "ลูกค้าใหม่" = ชื่อถูกเติมจากคำที่ค้นไปแล้ว ⇒ ช่องถัดไปที่ต้องกรอกคือ **เบอร์โทร**
   * โฟกัสให้เลย พิมพ์ชื่อ → Enter → พิมพ์เบอร์ต่อได้ทันทีโดยไม่ต้องละมือไปกดเมาส์
   * (เบอร์ยังเป็นตัวที่ใช้เช็คซ้ำด้วย ยิ่งควรให้กรอกต่อทันที)
   */
  const newCustomerPhoneRef = useRef<HTMLInputElement>(null);
  /** อีเมลเตือนตอน "ออกจากช่อง" ไม่ใช่ตอนพิมพ์ — "dv12" คือสถานะกลางทางของ "dv12@gmail.com" */
  const [emailTouched, setEmailTouched] = useState(false);
  const emailValue = delivery?.deliveryEmail || selectedCustomer?.email || '';
  const emailShownError = emailError || (emailTouched && !isValidEmail(emailValue) ? EMAIL_INVALID_MESSAGE : undefined);
  useEffect(() => {
    if (newCustomerMode) newCustomerPhoneRef.current?.focus();
  }, [newCustomerMode]);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const isEditable = !disabled && !readOnly;
  const canChangeCustomer = isEditable && !lockCustomerSelection;
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

  // สมุดที่อยู่ 2 เล่ม แยกกันเด็ดขาด
  //  - ownAddresses = ที่อยู่ของลูกค้าเอง → dropdown บนชิปลูกค้า
  //  - recipientAddresses = ที่อยู่ผู้รับของขวัญ → FormSelect ในโหมด "ส่งให้คนอื่น"
  const ownAddresses = shippingAddresses.filter(a => !a.is_recipient);
  const recipientAddresses = shippingAddresses.filter(a => a.is_recipient);
  // โหมดส่งให้คนอื่น: ที่อยู่ของบิลนี้เป็นของผู้รับ — ปิด dropdown ที่อยู่ลูกค้า
  // ไม่งั้นเผลอกดแล้วทับที่อยู่ผู้รับที่กรอกไว้
  const canPickOwnAddress = !shipToOther && ownAddresses.length > 1 && isEditable;

  const canEditCustomer = isEditable && !!selectedCustomer && !!(onEditCustomer || editCustomerUrl);

  return (
    <div className={bare ? '' : 'bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4'}>
      <div className={`grid grid-cols-1 ${singleColumn ? '' : 'sm:grid-cols-2'} gap-x-4 gap-y-3`}>
        {/* Section header — Left (toggle moved out, sits inline with the input below) */}
        <div className="flex items-center gap-1.5 pb-1 border-b border-gray-100 dark:border-slate-700">
          <Users className="w-4 h-4 text-gray-500 dark:text-slate-400" />
          <span className="heading-4">
            {customerLabel}
            {customerRequired && <span className="text-red-500 ml-0.5">*</span>}
          </span>
        </div>

        {/* Section header — Right */}
        {/* มีแท็บ "สั่งเอง / ส่งให้คนอื่น" แล้วไม่ต้องมีหัวข้อซ้ำ — แท็บเป็นหัวข้อของบล็อกนั้นในตัว */}
        {showDeliveryCol && !onShipToOtherChange ? (
          <div className={`${singleColumn ? 'hidden' : 'hidden sm:flex'} items-center gap-1.5 pb-1 border-b border-gray-100 dark:border-slate-700 sm:border-l sm:border-l-transparent sm:pl-4`}>
            <MapPin className="w-4 h-4 text-gray-500 dark:text-slate-400" />
            <span className="heading-4">
              ที่อยู่จัดส่ง
            </span>
          </div>
        ) : (
          <div className={singleColumn ? 'hidden' : 'hidden sm:block'} />
        )}

      </div>

      <div className={`grid grid-cols-1 ${singleColumn ? '' : 'sm:grid-cols-2'} gap-x-4 gap-y-3 items-start`}>
        <div className="space-y-3 min-w-0">
        {/* Row 1 Left: [toggle] + [search/name input] OR [selected customer card] */}
        <div className="relative flex flex-col">

          {/* โหมด "ลูกค้าใหม่" — เข้ามาได้ทางเดียวคือกด "＋ สร้างลูกค้าใหม่" ในผลค้นหา
              (เลิกใช้ปุ่มสลับ เก่า|ใหม่ แล้ว — ปุ่มนั้นให้กดสร้างใหม่ได้โดยไม่ต้องค้นก่อน
               ซึ่งเป็นบ่อเกิดของลูกค้าซ้ำ · เจ้าของเลือกไว้ 9 ก.ย. 2026) */}
          {newCustomerMode && !selectedCustomer ? (
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                value={newCustomerName}
                onChange={(e) => onNewCustomerNameChange?.(e.target.value)}
                placeholder="ชื่อลูกค้าใหม่"
                className="flex-1 min-w-0 px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {canChangeCustomer && (
                <Tooltip text="กลับไปค้นลูกค้าเดิม">
                  <button
                    type="button"
                    onClick={() => { onNewCustomerModeChange?.(false); onNewCustomerNameChange?.(''); }}
                    aria-label="กลับไปค้นลูกค้าเดิม"
                    className="flex-shrink-0 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-500 hover:text-primary hover:border-primary transition-colors"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </Tooltip>
              )}
            </div>
          ) : selectedCustomer ? (
            <div className="relative flex-1">
              {/* Selected-customer chip — single-line, matches input height (h-10).
                  Layout: [icon + name + badge (+ chevron when multi-address)] — [X clear on far right] */}
              <div className="flex items-center h-10 bg-orange-50 dark:bg-orange-900/20 border border-primary/30 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => { if (canPickOwnAddress) setShowAddressDropdown(!showAddressDropdown); }}
                  disabled={!canPickOwnAddress}
                  className={`flex items-center gap-2 flex-1 min-w-0 h-full pl-3 text-left ${canPickOwnAddress ? 'cursor-pointer hover:bg-orange-100/40 dark:hover:bg-orange-900/30' : 'cursor-default'}`}
                >
                  {loading
                    ? <Loader2 className="w-4 h-4 text-primary flex-shrink-0 animate-spin" />
                    : <UserCheck className="w-4 h-4 text-primary flex-shrink-0" />
                  }
                  <span className="text-base font-medium text-gray-900 dark:text-slate-200 truncate">{selectedCustomer.name}</span>
                  {resolvedBadge && <span className="flex-shrink-0">{resolvedBadge}</span>}
                  {canPickOwnAddress && (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 ml-auto mr-2" />
                  )}
                </button>
                {/* แก้ข้อมูลลูกค้า (ชื่อ/เบอร์หลัก) — ช่องในการ์ดนี้เป็นของบิล ไม่ใช่ของลูกค้า */}
                {canEditCustomer && (
                  <Tooltip text="แก้ข้อมูลลูกค้า (ชื่อ, เบอร์, ที่อยู่หลัก)">
                    {onEditCustomer ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEditCustomer(); }}
                        aria-label="แก้ข้อมูลลูกค้า"
                        className="h-full px-3 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors flex-shrink-0 border-l border-primary/20 flex items-center"
                      >
                        <Pencil className="w-4 h-4 text-gray-400" />
                      </button>
                    ) : (
                      <Link
                        href={editCustomerUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="แก้ข้อมูลลูกค้า"
                        className="h-full px-3 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors flex-shrink-0 border-l border-primary/20 flex items-center"
                      >
                        <Pencil className="w-4 h-4 text-gray-400" />
                      </Link>
                    )}
                  </Tooltip>
                )}
                {canChangeCustomer && (
                  <Tooltip text="ล้างลูกค้า — เลือกคนใหม่">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onCustomerClear(); onNewCustomerModeChange?.(false); }}
                      aria-label="ล้างลูกค้า"
                      className="h-full px-3 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors flex-shrink-0 border-l border-primary/20 flex items-center"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </Tooltip>
                )}
              </div>
              {/* Address dropdown */}
              {showAddressDropdown && canPickOwnAddress && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowAddressDropdown(false)} />
                  <div className="absolute z-[999] w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                    {ownAddresses.map(addr => (
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
            <EntitySearchInput
              value=""
              onChange={onCustomerChange}
              options={searchOptions}
              placeholder={searchPlaceholder}
              emptyMessage="ไม่พบลูกค้า"
              onSearchChange={onCustomerSearchChange}
              loading={onCustomerSearchChange ? customersLoading : undefined}
              minSearchLength={onCustomerSearchChange ? 2 : undefined}
              // "＋ สร้างลูกค้าใหม่" อยู่ท้ายผลค้นหาเสมอ ไม่ใช่เฉพาะตอนไม่เจอ —
              // เคส "เจอชื่อเดียวกันแต่คนละคน" มีจริง (ชื่อเล่นซ้ำกันเยอะ) ถ้าโชว์เฉพาะตอนว่างจะติดตัน
              onCreate={allowNewCustomer && canChangeCustomer ? (q) => {
                onNewCustomerModeChange?.(true);
                onNewCustomerNameChange?.(q);
                onCustomerClear();
              } : undefined}
              createLabel={(q) => `สร้างลูกค้าใหม่ "${q}"`}
            />
          )}
        </div>


        {/* Row 2 Left: เบอร์โทร + อีเมล + ภาษี */}
        {(selectedCustomer || hasDelivery) && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">เบอร์โทร</label>
                <input ref={newCustomerPhoneRef} {...PHONE_INPUT_PROPS} value={delivery?.deliveryPhone || selectedCustomer?.phone || ''} onChange={onPhoneChange(v => onDeliveryChange?.({ deliveryPhone: v }))} placeholder="0xx-xxx-xxxx" disabled={!isEditable}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 dark:disabled:bg-slate-800" />
                {/* เบอร์คือตัวชี้ขาดว่าเป็นคนเดิมไหม — ชื่อพึ่งไม่ได้ (ชื่อเล่นซ้ำเยอะ
                    บางคนบันทึกชื่อจริง บางคนบันทึกชื่อเล่น)
                    **บันทึกไม่ได้จนกว่าจะเลือกรายเดิมหรือแก้เบอร์** — สีแดงเพราะเป็นตัวขวาง
                    ไม่ใช่คำเตือนที่กดผ่านได้ (ดูเหตุผลที่ validate() ใน OrderForm) */}
                {newCustomerMode && duplicatePhoneMatch && (
                  <div className="mt-1.5 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2.5 py-2">
                    <UserCheck className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="subtitle-text text-red-800 dark:text-red-300">
                        เบอร์นี้เป็นของ <b>{duplicatePhoneMatch.name}</b> อยู่แล้ว
                        {duplicatePhoneMatch.hint && <span className="text-red-700 dark:text-red-400"> ({duplicatePhoneMatch.hint})</span>}
                      </p>
                      {/* ทางออกทั้งสองทางต้องกดได้จริงจากตรงนี้ — ตอนโดนบล็อกยังไม่ได้เลือกลูกค้า
                          ปุ่มดินสอบนชิปลูกค้าจึงยังไม่มี ถ้าไม่ใส่ลิงก์นี้ "ไปแก้เบอร์รายเดิม"
                          จะเป็นทางที่พูดถึงได้แต่เดินไปไม่ถึง */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                        {onUseDuplicateCustomer && (
                          <button
                            type="button"
                            onClick={() => onUseDuplicateCustomer(duplicatePhoneMatch.id)}
                            className="helper-text font-medium text-red-800 dark:text-red-300 underline"
                          >
                            ใช้ลูกค้ารายนี้แทน
                          </button>
                        )}
                        {duplicatePhoneMatch.editUrl && (
                          <Link
                            href={duplicatePhoneMatch.editUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="helper-text font-medium text-red-800 dark:text-red-300 underline"
                          >
                            แก้เบอร์ของรายเดิม
                          </Link>
                        )}
                        {onRecheckDuplicate && (
                          <button
                            type="button"
                            onClick={onRecheckDuplicate}
                            className="helper-text text-red-700 dark:text-red-400 underline"
                          >
                            ตรวจใหม่
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="field-label">อีเมล</label>
                <input type="email" inputMode="email" autoComplete="email" value={emailValue} onChange={(e) => onDeliveryChange?.({ deliveryEmail: e.target.value })} onBlur={() => setEmailTouched(true)} placeholder="email@example.com" disabled={!isEditable}
                  className={`w-full px-3 py-2.5 border rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 dark:disabled:bg-slate-800 ${emailShownError ? 'border-red-400' : 'border-gray-300 dark:border-slate-600'}`} />
                {emailShownError && <p className="text-red-500 text-sm mt-1">{emailShownError}</p>}
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
        <div className={`flex flex-col ${singleColumn ? 'pt-3 border-t border-gray-100 dark:border-slate-700' : 'sm:border-l sm:border-gray-200 dark:sm:border-slate-700 sm:pl-4'}`}>
          {onShipToOtherChange && (
            <div className="mb-3">
              {/* แท็บ = หัวข้อของบล็อกนี้ในตัว · ช่องที่อยู่/ผู้รับข้างล่างคือเนื้อของแท็บที่เลือก
                  (ของเดิมเป็นปุ่มสองใบลอย ๆ ผู้ใช้ไม่เห็นความเชื่อมโยงกับช่องข้างล่าง) */}
              <Tabs
                className="!mb-3"
                activeKey={shipToOther ? 'other' : 'self'}
                onSelect={(k) => {
                  if (!isEditable) return;
                  setShowAddressDropdown(false);
                  onShipToOtherChange(k === 'other');
                }}
                /* พื้นหลังคนละสีต่อแท็บ — เหลือบตาแล้วรู้ทันทีว่าที่อยู่ข้างล่างเป็นของผู้สั่งหรือของผู้รับ
                    (สีเดียวกับปุ่มชุดเดิม: ฟ้า = สั่งเอง · ชมพู = ของขวัญ) */
                tabs={[
                  {
                    key: 'self',
                    label: 'สั่งเอง',
                    icon: <UserCheck className="w-4 h-4" />,
                    activeColorClass: 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-t-lg',
                  },
                  {
                    key: 'other',
                    label: 'ส่งให้คนอื่น',
                    icon: <Gift className="w-4 h-4" />,
                    activeColorClass: 'border-pink-500 text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20 rounded-t-lg',
                  },
                ]}
              />

              {/* สมุดที่อยู่ผู้รับ — ส่งของขวัญให้คนเดิมซ้ำโดยไม่ต้องพิมพ์ใหม่
                  (dropdown ในชิปลูกค้าหาไม่เจอเวลาอยู่โหมดนี้ เพราะสายตาอยู่คอลัมน์ขวา) */}
              {shipToOther && isEditable && onAddressSelect && recipientAddresses.length > 0 && (
                <div className="mt-2">
                  <label className="field-label">ที่อยู่ที่บันทึกไว้</label>
                  <FormSelect
                    /* แสดงว่า "เลือกอยู่" เฉพาะเมื่อช่องด้านล่างยังตรงกับที่อยู่นั้นจริง ๆ
                       (พิมพ์แก้เองแล้ว = ที่อยู่ใหม่ ไม่ใช่ของเดิม) */
                    value={recipientAddresses.find(a =>
                      a.id === selectedAddressId &&
                      (a.address_line1 || '') === (delivery?.deliveryAddress || '') &&
                      (a.contact_person || '') === (delivery?.deliveryName || ''),
                    )?.id || ''}
                    onChange={(id) => {
                      if (id === NEW_ADDRESS_OPTION_ID) { onNewAddress?.(); return; }
                      const addr = recipientAddresses.find(a => a.id === id);
                      if (addr) onAddressSelect(id, addr);
                    }}
                    options={[
                      ...recipientAddresses.map(a => ({
                        id: a.id,
                        label: a.contact_person?.trim() || a.address_name,
                        subtitle: [
                          a.contact_person?.trim() && a.address_name !== a.contact_person.trim() ? a.address_name : '',
                          a.amphoe || a.district,
                          a.province,
                        ].filter(Boolean).join(' · '),
                        icon: <MapPin className="w-4 h-4 text-gray-400" />,
                      })),
                      { id: NEW_ADDRESS_OPTION_ID, label: 'กรอกที่อยู่ใหม่', icon: <Plus className="w-4 h-4 text-gray-400" /> },
                    ]}
                    placeholder="เลือกผู้รับที่เคยส่ง"
                    portal
                  />
                </div>
              )}

              {/* ชื่อ/เบอร์ผู้รับ แทรกเหนือที่อยู่ — ที่อยู่ข้างล่างจึงเป็นของคนนี้ชัดเจน */}
              {shipToOther && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="field-label">
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
                    <label className="field-label">เบอร์ผู้รับ</label>
                    <input
                      {...PHONE_INPUT_PROPS}
                      value={delivery?.deliveryPhone || ''}
                      onChange={onPhoneChange(v => onDeliveryChange?.({ deliveryPhone: v }))}
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
          <div className={singleColumn ? 'pt-3 border-t border-gray-100 dark:border-slate-700' : 'sm:border-l sm:border-gray-200 dark:sm:border-slate-700 sm:pl-4'}>
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
