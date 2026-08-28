'use client';

import { useState, useEffect, useRef, useMemo, RefObject } from 'react';
import { useCopy } from '@/lib/useCopy';
import { createPortal } from 'react-dom';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { useCompany } from '@/lib/company-context';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { parseThaiAddress } from '@/lib/address-parser';
import {
  type DeliveryZone, type DeliverySlot,
  resolveZone, resolveDeliveryFee, getSlotAvailability,
  slotUnavailableLabel, formatSlotTime, getSlotWindow, buildWindowLabel,
} from '@/lib/delivery';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import ItemsTable, { type TableItem as OrderTableItem, type PromotionComponent } from '@/components/ui/ItemsTable';
import PromotionSelectModal, { type PromoData, type PromoItemData, type PromotionSelectResult } from '@/components/ui/PromotionSelectModal';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import NumberInput from '@/components/ui/NumberInput';
import { calculateQtyDiscount, type PromotionTier } from '@/lib/promotions';
import DateRangePicker, { DateValueType } from '@/components/ui/DateRangePicker';
import FormSelect from '@/components/ui/FormSelect';
import { formatPrice, formatNumber } from '@/lib/utils/format';
import OrderSummaryBox from '@/components/ui/OrderSummaryBox';
import CustomerInfoCard from '@/components/ui/CustomerInfoCard';
import TaxInvoiceInfo from '@/components/ui/TaxInvoiceInfo';
import CustomerSelectionCard, { type CustomerOption, type DeliveryFields, type TaxFields, type ShippingAddress as CSCShippingAddress } from '@/components/ui/CustomerSelectionCard';
import { useCustomerPrefill } from '@/lib/useCustomerPrefill';
import { fetchCustomerOrderContext } from '@/lib/gp-resolver';
import { isMarketplaceSource } from '@/lib/marketplace/types';
import StickyActionBar from '@/components/ui/StickyActionBar';
import Stepper, { type StepItem } from '@/components/ui/Stepper';
import { LoadingCard } from '@/components/ui/StateCard';
import Checkbox from '@/components/ui/Checkbox';
import FormInput from '@/components/ui/FormInput';
import Badge from '@/components/ui/Badge';
import {
  Plus,
  Loader2,
  MapPin,
  Copy,
  ChevronDown,
  CheckCircle,
  Send,
  Warehouse,
  Store,
  Settings,
  Clock
} from 'lucide-react';

// ข้อความเดียวกันทั้ง validate ตอนบันทึก และตอนกด "ถัดไป" ในเปลือก wizard
// (เขียนคนละที่แล้วดริฟต์กันคือวิธีที่ผู้ใช้เจอสองข้อความสำหรับเรื่องเดียวกัน)
const NO_ITEMS_ERROR = 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ';

// field ไหนอยู่ขั้นไหนของ wizard — ใช้พาผู้ใช้ไป "ขั้นที่ผิด" ตอน validate ไม่ผ่าน
// ไม่งั้น toast ขึ้นแต่ช่องที่ผิดอยู่คนละขั้นที่มองไม่เห็น = ปุ่มเงียบอีกแบบ
const WIZARD_STEP_BY_ERROR: Record<string, number> = {
  branches: 1,
  customer: 2,
  recipientName: 2,
  deliveryPhone: 2,
  deliveryEmail: 2,
  deliveryDate: 2,
};
const wizardStepForError = (key?: string) => (key && WIZARD_STEP_BY_ERROR[key]) || 3;

// Interfaces
interface Customer {
  id: string;
  customer_code: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  customer_type?: string;
}

interface ShippingAddress {
  id: string;
  address_name: string;
  contact_person?: string;
  phone?: string;
  address_line1: string;
  district?: string;
  amphoe?: string;
  province: string;
  postal_code?: string;
  is_default?: boolean;
  /** true = ที่อยู่ "ผู้รับของขวัญ" (โหมดส่งให้คนอื่น) — คนละสมุดกับที่อยู่ของลูกค้าเอง */
  is_recipient?: boolean;
  created_at?: string;
  delivery_notes?: string;
}

/** ที่อยู่ในสมุด → ข้อความก้อนเดียว (ใช้เป็น snapshot ที่อยู่ส่งเอกสาร) */
const addressToText = (a: ShippingAddress): string =>
  [a.address_line1, a.district, a.amphoe, a.province, a.postal_code].filter(Boolean).join(' ');

/** FormInput ไม่ได้ทำสีพื้นตอน disabled มาให้ — เติมให้ตรงกับ textarea ข้าง ๆ */
const GIFT_INPUT_CLASS = 'disabled:bg-gray-100 dark:disabled:bg-slate-800';
/** textarea ในการ์ดของขวัญ (ยังไม่มี shared component สำหรับ textarea) */
const GIFT_TEXTAREA_CLASS =
  'w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary text-base font-sans disabled:bg-gray-100 dark:disabled:bg-slate-800 resize-none';

interface Product {
  id: string;
  product_id: string;
  code: string;
  name: string;
  image?: string;
  variation_label?: string;
  product_type: 'simple' | 'variation';
  sku?: string;
  default_price: number;
  discount_price?: number;
  stock: number;
}

interface PromotionTierData { min_qty: number; discount_type: string; discount_value: number }

interface BranchProduct {
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variation_label?: string;
  product_type?: 'simple' | 'variation';
  sku?: string;
  image?: string;
  quantity: number;
  unit_price: number;
  discount_value: number;
  discount_type: 'percent' | 'amount';
  /** หมายเหตุเฉพาะรายการนี้ (order_items.notes) — เช่น "เปลี่ยนผลไม้", "ผูกโบว์สีแดง" */
  notes?: string;
  // Promotion fields
  promotion_id?: string;
  promotion_name?: string;
  promotion_type?: string;
  promotion_components?: PromotionComponent[];
  promotion_tiers?: PromotionTierData[];
}

interface BranchOrder {
  shipping_address_id: string;
  address_name: string;
  delivery_notes: string;
  shipping_fee: number;
  products: BranchProduct[];
}

interface InitialOrderData {
  customer_id: string;
  delivery_date?: string;
  notes?: string;
  internal_notes?: string;
  discount_amount?: number;
  branches: BranchOrder[];
}

interface OrderFormProps {
  // Pre-selected customer (e.g., from LINE Chat)
  preselectedCustomerId?: string;
  // Initial order data for copying from previous order
  initialOrderData?: InitialOrderData;
  // Edit existing order by ID
  editOrderId?: string;
  // Pre-loaded order data from parent to avoid duplicate fetch
  preloadedOrder?: any;
  // Callback when order is created/updated successfully
  onSuccess?: (orderId: string, customerId?: string, deliveryInfo?: { name?: string; phone?: string; email?: string }) => void;
  // Callback when cancelled
  onCancel?: () => void;
  // Embedded mode (no back button, different styling)
  embedded?: boolean;
  /** หน้าที่ห่อฟอร์มวาดการ์ดลูกค้า/ที่อยู่เองอยู่แล้ว (มีที่เดียว: /orders/[id])
   *  → ฟอร์มซ่อนส่วนนั้นกันซ้ำ · หน้าอื่นทุกหน้าต้องเห็น ไม่งั้นแก้บิลโดยไม่รู้ว่าของใคร */
  customerSectionHandledByHost?: boolean;
  // Callback to send bill to customer via LINE Chat (only from LINE Chat new order)
  onSendBillToChat?: (orderId: string, orderNumber: string, billUrl: string) => void;
  // Print mode: 'order' = order slip, 'packing' = packing list, null = normal view
  printMode?: 'order' | 'packing' | null;
  // Portal target for warehouse picker (renders into parent header)
  warehousePortalRef?: RefObject<HTMLDivElement | null>;
  // Portal target for sales channel picker (renders into parent header)
  salesChannelPortalRef?: RefObject<HTMLDivElement | null>;
  // Portal target for header actions (copy order button)
  headerActionsRef?: RefObject<HTMLDivElement | null>;
  // Order source (e.g., 'line', 'facebook') and channel name
  source?: string;
  sourceName?: string;
  // Originating chat account — when present, lock the sales channel selector to that
  // chat-linked sales_channels row so e.g. "LINE - ABC" orders can't be miscategorized.
  chatAccountId?: string;
  // Exchange data — items to return from original order (CN created atomically on save)
  exchangeData?: {
    from_order_id: string;
    items: { order_item_id: string; quantity: number }[];
    reason: string;
  };
  // Credit amount from returned items (for displaying price difference)
  exchangeCreditAmount?: number;
}

export default function OrderForm({
  preselectedCustomerId,
  initialOrderData,
  editOrderId,
  preloadedOrder,
  onSuccess,
  onCancel,
  embedded = false,
  customerSectionHandledByHost = false,
  onSendBillToChat,
  printMode = null,
  warehousePortalRef,
  salesChannelPortalRef,
  headerActionsRef,
  source,
  sourceName,
  chatAccountId,
  exchangeData,
  exchangeCreditAmount,
}: OrderFormProps) {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const copy = useCopy();
  const { features, billExpiryDays, giftCard } = useFeatures();
  const { currentCompany } = useCompany();
  const vatRegistered = currentCompany?.vat_registered || false;

  // State
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(!!editOrderId);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [addressConflict, setAddressConflict] = useState<{ mode: 'update' | 'new' | null; addressName: string } | null>(null);
  // showAddressDropdown removed — handled by CustomerSelectionCard
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedOrderId, setSavedOrderId] = useState('');
  const [savedOrderNumber, setSavedOrderNumber] = useState('');
  // customer id จริงจากผล save — API อาจสร้างลูกค้าใหม่ให้ (order ไม่มี customer เลือก)
  // ต้องรายงานกลับผ่าน onSuccess ไม่งั้นหน้าแชทคิดว่ายังไม่มีลูกค้าแล้วสร้างซ้อนอีกคน (fix-bug.md 2026-08-28)
  const [savedCustomerId, setSavedCustomerId] = useState<string | undefined>(undefined);
  const [billLinkCopied, setBillLinkCopied] = useState(false);

  // Edit mode
  const [editOrderNumber, setEditOrderNumber] = useState('');
  const [editOrderStatus, setEditOrderStatus] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState('');
  const [editOrderSource, setEditOrderSource] = useState('manual');
  const [storedExchangeCredit, setStoredExchangeCredit] = useState(0);
  const isEditMode = !!editOrderId;
  const isReadOnly = isEditMode && (editOrderSource === 'shopee' || editOrderStatus !== 'new' || editPaymentStatus !== 'pending');

  // Sales channel — manual orders track origin (เปิดบิลตรง / LINE OA "ABC" / Walk-in / ...).
  // chatAccountId prop, when set, locks this selector to the matching chat-linked row.
  const [salesChannels, setSalesChannels] = useState<Array<{
    id: string;
    code: string;
    name: string;
    channel_type: 'manual' | 'chat';
    platform: string | null;
    chat_account_id: string | null;
    is_active: boolean;
    is_default: boolean;
  }>>([]);
  const [selectedSalesChannelId, setSelectedSalesChannelId] = useState<string>('');
  const salesChannelLocked = !!chatAccountId;

  // Customer selection
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  // customerSearch removed — using selectedCustomer?.name directly

  // Customer prefill hook (delivery + tax + addresses)
  const customerPrefill = useCustomerPrefill();
  const { shippingAddresses, selectedAddressId, delivery: deliveryFields, taxFields: taxFieldsState } = customerPrefill;
  const { deliveryName, deliveryPhone, deliveryEmail, deliveryAddress, deliveryDistrict, deliveryAmphoe, deliveryProvince, deliveryPostalCode } = deliveryFields;
  const { taxType, taxName, taxTaxId, taxBranch, taxAddress } = taxFieldsState;
  const { setDeliveryName, setDeliveryPhone, setDeliveryEmail, setDeliveryAddress, setDeliveryDistrict, setDeliveryAmphoe, setDeliveryProvince, setDeliveryPostalCode } = customerPrefill;
  const { setTaxType, setTaxName, setTaxTaxId, setTaxBranch, setTaxAddress, setShippingAddresses, setSelectedAddressId } = customerPrefill;

  // True when the currently selected customer already has tax_id on file.
  // Drives the tax-modal UX: false → 1st save auto-persists; true → modal
  // shows extra "บันทึก + อัพเดทลูกค้า" button for explicit master update.
  const [customerHasTax, setCustomerHasTax] = useState(false);

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Top sellers (30d, prefer this customer's history, fall back to company)
  const [topSellers, setTopSellers] = useState<Product[]>([]);

  // Promotions (merged into product search)
  const [promotions, setPromotions] = useState<any[]>([]);
  const [promoModal, setPromoModal] = useState<{ promo: PromoData; triggerProduct?: { variation_id: string; product_name: string } } | null>(null);

  // Customer pricing
  const [customerPrices, setCustomerPrices] = useState<Record<string, { unit_price: number; discount_percent: number }>>({});

  // Branch Orders (single branch, kept for API compatibility)
  const [branchOrders, setBranchOrders] = useState<BranchOrder[]>([]);

  // Order details
  // การ์ดอวยพร — บริการระดับร้าน (companies.settings.gift_card) ใช้ได้ทุกช่องทาง
  // ที่เปิดออเดอร์ ไม่ใช่แค่หน้าร้านออนไลน์ · ค่าการ์ดบวกเข้าท้ายบิลเหมือนค่าส่ง
  const [shipToOther, setShipToOther] = useState(false);
  const [giftCardOn, setGiftCardOn] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [giftTo, setGiftTo] = useState('');
  const [giftFrom, setGiftFrom] = useState('');
  const [giftHidePrice, setGiftHidePrice] = useState(true);
  // เอกสาร (ใบกำกับ/ใบเสร็จ) ส่งทางไปรษณีย์ไปหา "ผู้ซื้อ" แทนการใส่ในกล่องของขวัญ
  // documentAddress = ข้อความที่อยู่ทั้งก้อน (snapshot ลง orders) — ไม่ผูก FK เพื่อให้
  // ใบปะหน้าซองพิมพ์ซ้ำได้เหมือนเดิมแม้ลูกค้าแก้ที่อยู่ในสมุดทีหลัง
  const [documentByPost, setDocumentByPost] = useState(false);
  const [documentRecipientName, setDocumentRecipientName] = useState('');
  // เบอร์ผู้รับเอกสาร — ไม่บังคับ (ไปรษณีย์ไม่ต้องใช้ แต่ขนส่งเอกชนขอเบอร์ปลายทาง)
  const [documentRecipientPhone, setDocumentRecipientPhone] = useState('');
  const [documentAddress, setDocumentAddress] = useState('');
  // id ที่อยู่ที่หยิบมาเติม (ใช้แค่ไฮไลต์ใน dropdown) — '' = พิมพ์เอง/ยังไม่ได้เลือก
  const [documentAddressId, setDocumentAddressId] = useState('');

  // สมุดที่อยู่ของ "ลูกค้าเอง" เท่านั้น — ที่อยู่ผู้รับของขวัญ (is_recipient) อยู่คนละเล่ม
  // เอกสารต้องไปหาผู้ซื้อ จึงห้ามให้ที่อยู่ผู้รับโผล่ใน dropdown นี้เด็ดขาด
  const ownAddresses = useMemo(
    () => shippingAddresses.filter((a: ShippingAddress) => !a.is_recipient),
    [shippingAddresses],
  );

  /** เลือกที่อยู่ลูกค้ามาเติมช่องเอกสาร (ผู้ใช้แก้ข้อความต่อได้) */
  const applyDocumentAddress = (addr: ShippingAddress) => {
    setDocumentAddressId(addr.id);
    setDocumentAddress(addressToText(addr));
    setDocumentRecipientName(prev => prev.trim() || addr.contact_person || selectedCustomer?.name || '');
    setDocumentRecipientPhone(prev => prev.trim() || addr.phone || '');
  };

  /** ปิดโหมด "ส่งเอกสารทางไปรษณีย์" แล้วล้างค่าที่กรอกไว้ทั้งชุด
   *  เรียกเมื่อเงื่อนไขต้นทางหายไป (เลิกซ่อนราคา / กลับไปโหมดสั่งเอง) —
   *  ปล่อยค้างไว้เฉย ๆ ไม่ได้ เพราะช่องถูกซ่อนแล้วแต่ค่ายังถูกบันทึกลงบิลเงียบ ๆ */
  const clearDocumentByPost = () => {
    setDocumentByPost(false);
    setDocumentRecipientName('');
    setDocumentRecipientPhone('');
    setDocumentAddress('');
    setDocumentAddressId('');
  };

  // ติ๊ก "ส่งเอกสารทางไปรษณีย์" ครั้งแรก → เติมที่อยู่ default ของลูกค้าให้เลย
  // (เคสปกติคือส่งไปที่อยู่เดิมของผู้สั่ง — ผู้ใช้ไม่ต้องกดอะไรเพิ่ม)
  useEffect(() => {
    if (!documentByPost) return;
    if (documentAddress.trim() || documentRecipientName.trim()) return;
    const def = ownAddresses.find(a => a.is_default) || ownAddresses[0];
    if (def) {
      applyDocumentAddress(def);
    } else if (selectedCustomer?.name) {
      setDocumentRecipientName(selectedCustomer.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentByPost, ownAddresses, selectedCustomer?.id]);

  // สลับกลับ "สั่งเอง" = ไม่มีเรื่องของขวัญแล้ว → ปิดธงเอกสาร + ล้างค่าที่กรอกไว้
  // ไม่งั้นค้างแล้วบันทึกไปทั้งที่ผู้ใช้ไม่เห็นช่องนี้อีกแล้ว
  useEffect(() => {
    if (!shipToOther && documentByPost) clearDocumentByPost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipToOther]);

  const [deliveryDateValue, setDeliveryDateValue] = useState<DateValueType>({
    startDate: null,
    endDate: null,
  });
  // Delivery zones + slots (feature-gated) — logic in lib/delivery.ts
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [deliverySlots, setDeliverySlots] = useState<DeliverySlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  // '' = จับคู่โซนอัตโนมัติจากที่อยู่ · id = staff เลือกโซนเอง (หรือมาจากออเดอร์เดิม)
  const [zoneOverrideId, setZoneOverrideId] = useState<string>('');
  // ค่าส่งล่าสุดที่ระบบ auto-fill — ใช้เช็คว่า staff แก้เองหรือยัง (แก้เองแล้วไม่ทับ)
  const lastAppliedZoneFeeRef = useRef<number | null>(null);

  const deliveryDate = deliveryDateValue?.startDate
    ? new Date(deliveryDateValue.startDate).toISOString().split('T')[0]
    : '';
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState<'percent' | 'amount'>('amount');
  const [taxInvoiceRequested, setTaxInvoiceRequested] = useState(false);

  // Bill expiry advance settings
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [expiryMode, setExpiryMode] = useState<'days' | 'none'>('days');
  const [expiryDays, setExpiryDays] = useState(7);
  const expirySyncedRef = useRef(false);

  // Sync expiry settings from company defaults on first load — preserve user edits after
  useEffect(() => {
    if (expirySyncedRef.current) return;
    if (billExpiryDays === undefined || billExpiryDays === null) return;
    expirySyncedRef.current = true;
    if (billExpiryDays === 0) setExpiryMode('none');
    else if (billExpiryDays > 0) setExpiryDays(billExpiryDays);
  }, [billExpiryDays]);

  // New customer mode
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');

  // Delivery info — managed by customerPrefill hook

  // Stock & Warehouse
  const [stockEnabled, setStockEnabled] = useState(false);
  const [allowOversell, setAllowOversell] = useState(true);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string; is_default: boolean }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [inventoryMap, setInventoryMap] = useState<Record<string, { quantity: number; reserved_quantity: number; available: number }>>({});


  // Copy from latest order
  const [loadingLatestOrder, setLoadingLatestOrder] = useState(false);

  // Refs
  const customerSectionRef = useRef<HTMLDivElement>(null);
  const deliveryDateRef = useRef<HTMLDivElement>(null);
  const productsSectionRef = useRef<HTMLDivElement>(null);
  const deliverySectionRef = useRef<HTMLDivElement>(null);
  const summarySectionRef = useRef<HTMLDivElement>(null);
  const [summaryWide, setSummaryWide] = useState(false);

  // Tailwind sm:/md: breakpoints see the VIEWPORT — inside the chat panel on a
  // notebook the form is ~600px while the viewport is 1280+, so 2-column grids
  // get crushed. Measure the form's own width and stack sections when cramped.
  const [narrowForm, setNarrowForm] = useState(false);
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setNarrowForm(entry.contentRect.width < 700);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // เปลือก wizard 3 ขั้น (สินค้า → จัดส่ง → สรุป) สำหรับที่แคบ — panel แชท / มือถือ
  // state + validation + save ใช้ชุดเดียวกับจอกว้างทั้งหมด เปลี่ยนแค่การจัดวาง
  //
  // หน้าที่วาดการ์ดลูกค้า/ที่อยู่เองแล้ว (/orders/[id]) ไม่มีของใส่ขั้น "จัดส่ง"
  // เลย — ทำ wizard ที่นั่นจะได้ขั้นว่างเปล่า จึงคงเปลือกเดิมไว้
  const useWizard = narrowForm && !customerSectionHandledByHost;
  const [step, setStep] = useState(1);

  // เปลี่ยนขั้นแล้วเลื่อนกลับขึ้นบนสุดของ panel — ไม่งั้นขั้นถัดไปเปิดมาค้างกลางหน้า
  // ตรงตำแหน่งที่เคยเลื่อนไว้ (ผู้ใช้ทัก 2026-08-29) · scrollIntoView ที่ตัวฟอร์มเอง
  // ทำให้ไม่ต้องรู้ว่า ancestor ตัวไหนเป็นตัวเลื่อน (panel แชท / หน้าเว็บ / มือถือ)
  useEffect(() => {
    if (!useWizard) return;
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step, useWizard]);

  // Watch summary section width for side-by-side vs stacked layout
  const hasProducts = branchOrders.length > 0 && branchOrders[0]?.products.length > 0;
  useEffect(() => {
    if (embedded) { setSummaryWide(false); return; }
    const el = summarySectionRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSummaryWide(entry.contentRect.width >= 560);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // useWizard อยู่ใน deps เพราะเปลือก wizard ไม่ได้ render กล่องที่ ref นี้เกาะ —
    // กลับมาจอกว้างต้อง observe ใหม่ ไม่งั้นค่าค้างจากก่อนหน้า
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProducts, embedded, useWizard]);

  // Initialize default branch (product-first flow for all modes)
  // This allows product section to show immediately without selecting a customer
  useEffect(() => {
    if (!isEditMode && !initialOrderData && branchOrders.length === 0) {
      setBranchOrders([{
        shipping_address_id: '',
        address_name: 'รายการสินค้า',
        delivery_notes: '',
        shipping_fee: 0,
        products: [],
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch customers, products, warehouses, and sales channels (once)
  // For marketplace orders (edit mode), skip customers/products — they're read-only
  useFetchOnce(() => {
    const isMarketplace = isMarketplaceSource(preloadedOrder?.source);
    if (isMarketplace) {
      setLoadingProducts(false);
      fetchWarehouses();
    } else {
      fetchInitBundle();
    }
  }, !authLoading && !!userProfile);

  // Promotions are non-critical for first paint — defer ~300ms so the
  // critical fetch burst (customers / products / warehouses / sales-channels)
  // can settle on the serverless side first.
  useEffect(() => {
    if (authLoading || !userProfile) return;
    if (isMarketplaceSource(preloadedOrder?.source)) return;
    const t = setTimeout(() => { fetchPromotions(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userProfile]);

  const fetchSalesChannels = async () => {
    try {
      const res = await apiFetch('/api/sales-channels?active=true');
      if (!res.ok) return;
      const json = await res.json();
      setSalesChannels(json.channels || []);
    } catch (e) {
      console.warn('fetchSalesChannels failed:', e);
    }
  };

  // Single round-trip mount fetch — replaces 4 parallel client calls
  // (customers + products + warehouses + sales-channels) with one consolidated
  // request whose DB queries fan out in parallel on the serverless side. Falls
  // back to the individual fetches if /init errors so a deploy gone wrong
  // doesn't brick the form.
  const fetchInitBundle = async () => {
    try {
      setLoadingProducts(true);
      const res = await apiFetch('/api/orders/new/init');
      if (!res.ok) throw new Error('init failed');
      const data = await res.json();

      // Customers — same retail-only filter + alphabetical sort as fetchCustomers
      const retailTypes = ['retail', 'dropship', 'affiliate', null, undefined, ''];
      const sortedCustomers = (data.customers || [])
        .filter((c: Customer & { is_active?: boolean; customer_type?: string }) =>
          c.is_active !== false && retailTypes.includes(c.customer_type || ''))
        .sort((a: Customer, b: Customer) => a.name.localeCompare(b.name));
      setCustomers(sortedCustomers);

      // Products — same flatten-variations pattern as fetchProducts
      const flatProducts: Product[] = [];
      (data.products || []).forEach((sp: any) => {
        if (sp.product_type === 'simple') {
          const variation_id = sp.variations && sp.variations.length > 0 ? sp.variations[0].variation_id : null;
          flatProducts.push({
            id: variation_id || sp.product_id,
            product_id: sp.product_id,
            code: sp.code,
            name: sp.name,
            image: sp.main_image_url || sp.image,
            variation_label: sp.simple_variation_label,
            product_type: 'simple',
            sku: sp.simple_sku,
            default_price: sp.simple_default_price || 0,
            discount_price: sp.simple_discount_price || 0,
            stock: sp.simple_stock || 0,
          });
        } else {
          (sp.variations || []).forEach((v: any) => {
            flatProducts.push({
              id: v.variation_id,
              product_id: sp.product_id,
              code: `${sp.code}-${v.variation_label}`,
              name: sp.name,
              image: v.image_url || sp.main_image_url || sp.image,
              variation_label: v.variation_label,
              product_type: 'variation',
              sku: v.sku,
              default_price: v.default_price || 0,
              discount_price: v.discount_price || 0,
              stock: v.stock || 0,
            });
          });
        }
      });
      setProducts(flatProducts);

      // Warehouses + stock config — same default-pick logic as fetchWarehouses,
      // but inventory for the default warehouse comes embedded so we skip the
      // separate /api/inventory round trip on mount.
      if (data.stockConfig?.stockEnabled) {
        setStockEnabled(true);
        setAllowOversell(data.stockConfig.allowOversell !== false);
        const wh = data.warehouses || [];
        setWarehouses(wh);
        const defaultWh = wh.find((w: any) => w.is_default);
        if (defaultWh && !selectedWarehouseId) {
          setSelectedWarehouseId(defaultWh.id);
          if (data.inventoryMap && data.defaultWarehouseId === defaultWh.id) {
            setInventoryMap(data.inventoryMap);
          } else {
            fetchInventoryForWarehouse(defaultWh.id);
          }
        }
      }

      // Sales channels
      setSalesChannels(data.salesChannels || []);
    } catch (e) {
      console.warn('init bundle failed, falling back to individual fetches:', e);
      fetchCustomers();
      fetchProducts();
      fetchSalesChannels();
      fetchWarehouses();
    } finally {
      setLoadingProducts(false);
    }
  };

  // Pick the default sales channel once the list loads. Priority:
  //   1. edit mode → use the order's existing sales_channel_id (set later from preloadedOrder)
  //   2. chat context → match the chat-linked row by chat_account_id
  //   3. company's default channel (is_default=true)
  //   4. fallback: first active row (handles companies whose default was deleted/disabled)
  useEffect(() => {
    if (salesChannels.length === 0) return;
    if (selectedSalesChannelId) return; // already set (e.g. from edit hydration)
    if (chatAccountId) {
      const chatRow = salesChannels.find(c => c.chat_account_id === chatAccountId);
      if (chatRow) {
        setSelectedSalesChannelId(chatRow.id);
        return;
      }
    }
    const def = salesChannels.find(c => c.is_default && c.is_active)
      ?? salesChannels.find(c => c.is_active);
    if (def) setSelectedSalesChannelId(def.id);
  }, [salesChannels, chatAccountId, selectedSalesChannelId]);

  // Auto-select preselected customer
  useEffect(() => {
    if (preselectedCustomerId && customers.length > 0 && !selectedCustomer) {
      const customer = customers.find(c => c.id === preselectedCustomerId);
      if (customer) {
        handleSelectCustomer(customer);
      }
    }
  }, [preselectedCustomerId, customers]);

  // Initialize from copied order data
  const initialDataApplied = useRef(false);
  useEffect(() => {
    if (!initialOrderData || initialDataApplied.current) return;
    // Don't apply if no meaningful data (branches empty = data not ready yet)
    if (initialOrderData.branches.length === 0 && !initialOrderData.customer_id) return;
    // Wait for customers/products to load (only if we have a customer to match)
    if (initialOrderData.customer_id && customers.length === 0) return;
    if (initialOrderData.branches.some(b => b.products.length > 0) && products.length === 0) return;

    initialDataApplied.current = true;

    // Set customer if available
    if (initialOrderData.customer_id) {
      const customer = customers.find(c => c.id === initialOrderData.customer_id);
      if (customer) {
        setSelectedCustomer(customer);
        // customerSearch removed
        // Fetch addresses and auto-select default
        (async () => {
          try {
            const addrResponse = await apiFetch(`/api/shipping-addresses?customer_id=${customer.id}`);
            if (addrResponse.ok) {
              const addrResult = await addrResponse.json();
              const addresses = addrResult.addresses || [];
              setShippingAddresses(addresses);
              // prefill จากที่อยู่ของลูกค้าเองเท่านั้น — ที่อยู่ผู้รับของขวัญเป็นคนละสมุด
              const ownAddresses = addresses.filter((a: ShippingAddress) => !a.is_recipient);
              if (ownAddresses.length > 0) {
                const defaultAddr = ownAddresses.find((a: ShippingAddress) => a.is_default) || ownAddresses[0];
                setSelectedAddressId(defaultAddr.id);
                setDeliveryName(defaultAddr.contact_person || customer.name);
                setDeliveryPhone(defaultAddr.phone || customer.phone || '');
                setDeliveryEmail(customer.email || '');
                setDeliveryAddress(defaultAddr.address_line1 || '');
                setDeliveryDistrict(defaultAddr.district || '');
                setDeliveryAmphoe(defaultAddr.amphoe || '');
                setDeliveryProvince(defaultAddr.province || '');
                setDeliveryPostalCode(defaultAddr.postal_code || '');
              }
            }
          } catch (error) {
            console.error('Error fetching shipping addresses:', error);
          }
          try {
            const response = await apiFetch(`/api/customer-prices?customer_id=${customer.id}`);
            if (response.ok) {
              const result = await response.json();
              setCustomerPrices(result.prices || {});
            }
          } catch (error) {
            console.error('Error fetching customer prices:', error);
          }
        })();
        // Pre-fill tax invoice fields
        (async () => {
          try {
            const res = await apiFetch(`/api/customers/${customer.id}`);
            if (res.ok) {
              const data = await res.json();
              const c = data.customer || data;
              if (c.tax_type === 'personal' || c.tax_type === 'corporate') setTaxType(c.tax_type);
              if (c.tax_company_name) setTaxName(c.tax_company_name);
              if (c.tax_id) setTaxTaxId(c.tax_id);
              if (c.tax_branch) setTaxBranch(c.tax_branch);
              const addrParts = [c.billing_address, c.billing_district, c.billing_amphoe, c.billing_province, c.billing_postal_code].filter(Boolean).join(' ');
              if (addrParts) setTaxAddress(addrParts);
              setCustomerHasTax(!!c.tax_id);
            }
          } catch {
            // Ignore tax pre-fill errors
          }
        })();
      }
    }

    // Set products from initial data (flatten all branches into one, enrich with product images)
    if (initialOrderData.branches.length > 0) {
      const allProducts = initialOrderData.branches.flatMap(branch =>
        branch.products.map(p => {
          const match = products.find(pr => pr.id === p.variation_id);
          return { ...p, image: match?.image || p.image };
        })
      );
      const firstBranch = initialOrderData.branches[0];
      setBranchOrders([{
        shipping_address_id: firstBranch.shipping_address_id || '',
        address_name: 'รายการสินค้า',
        delivery_notes: firstBranch.delivery_notes || '',
        shipping_fee: initialOrderData.branches.reduce((sum, b) => sum + (b.shipping_fee || 0), 0),
        products: allProducts,
      }]);
    } else if (branchOrders.length === 0) {
      // Exchange or customer-only init: create default empty branch so product section shows
      setBranchOrders([{
        shipping_address_id: '',
        address_name: 'รายการสินค้า',
        delivery_notes: '',
        shipping_fee: 0,
        products: [],
      }]);
    }

    // Set other fields
    if (initialOrderData.delivery_date) {
      setDeliveryDateValue({
        startDate: new Date(initialOrderData.delivery_date),
        endDate: new Date(initialOrderData.delivery_date)
      });
    }
    if (initialOrderData.notes) setNotes(initialOrderData.notes);
    if (initialOrderData.internal_notes) setInternalNotes(initialOrderData.internal_notes);
    if (initialOrderData.discount_amount) setOrderDiscount(initialOrderData.discount_amount);
  }, [initialOrderData, customers, products]);

  // Load existing order for editing
  useEffect(() => {
    if (!editOrderId || authLoading || !userProfile) return;

    const loadOrder = async () => {
      try {
        setLoading(true);

        // Use preloaded order data if available (avoids duplicate fetch)
        let order;
        if (preloadedOrder) {
          order = preloadedOrder;
        } else {
          const response = await apiFetch(`/api/orders?id=${editOrderId}`);
          if (!response.ok) throw new Error('Failed to fetch order');
          const result = await response.json();
          order = result.order;
        }
        if (!order) throw new Error('Order not found');

        setEditOrderNumber(order.order_number);
        setEditOrderStatus(order.order_status);
        setEditPaymentStatus(order.payment_status || 'pending');
        setEditOrderSource(order.source || 'manual');
        if (order.sales_channel_id) setSelectedSalesChannelId(order.sales_channel_id);

        // Set customer
        if (order.customer) {
          setSelectedCustomer(order.customer);
          // customerSearch removed
        }

        // Set delivery date
        if (order.delivery_date) {
          setDeliveryDateValue({
            startDate: new Date(order.delivery_date),
            endDate: new Date(order.delivery_date)
          });
        }

        // Zone/slot จากออเดอร์เดิม — lock override เป็นค่าที่บันทึกไว้ กันระบบ
        // จับคู่โซนใหม่เองตอนแก้ไข (ที่อยู่เดิมอาจ match โซนอื่นหลังแก้ผังโซน)
        if (order.delivery_zone_id) setZoneOverrideId(order.delivery_zone_id);
        if (order.delivery_slot_id) setSelectedSlotId(order.delivery_slot_id);

        // Set delivery info
        if (order.delivery_name) setDeliveryName(order.delivery_name);
        if (order.delivery_phone) setDeliveryPhone(order.delivery_phone);
        if (order.delivery_address) setDeliveryAddress(order.delivery_address);
        if (order.delivery_district) setDeliveryDistrict(order.delivery_district);
        if (order.delivery_amphoe) setDeliveryAmphoe(order.delivery_amphoe);
        if (order.delivery_province) setDeliveryProvince(order.delivery_province);
        if (order.delivery_postal_code) setDeliveryPostalCode(order.delivery_postal_code);
        if (order.delivery_email) setDeliveryEmail(order.delivery_email);
        if (order.shipping_address_id) setSelectedAddressId(order.shipping_address_id);

        // Set notes and discount
        if (order.notes) setNotes(order.notes);
        if (order.internal_notes) setInternalNotes(order.internal_notes);
        if (order.discount_amount) setOrderDiscount(order.discount_amount);
        if (order.order_discount_type) setOrderDiscountType(order.order_discount_type);
        if (order.exchange_credit) setStoredExchangeCredit(Number(order.exchange_credit));

        if (order.gift_card_requested || order.gift_hide_price || order.document_by_post) {
          setShipToOther(true);
          // "ส่งเอกสารทางไปรษณีย์" เป็นผลต่อเนื่องของ "ไม่แนบใบเสร็จไปกับของ" — บิลเก่า
          // ที่ติ๊กเอกสารไว้แต่ไม่ได้ซ่อนราคา (UI รุ่นก่อนติ๊กแยกกันได้) ถือว่าซ่อนราคาด้วย
          // ไม่งั้นติ๊กเอกสารจะถูกซ่อนตอนเปิดมาแก้ ทั้งที่ค่ายังอยู่ในบิล
          setGiftHidePrice(!!order.gift_hide_price || !!order.document_by_post);
        }
        // เอกสารส่งไปรษณีย์ — ต้อง map กลับ ไม่งั้นเปิดบิลเก่ามาแก้แล้วบันทึก ค่าจะหายเงียบ ๆ
        if (order.document_by_post) {
          setDocumentByPost(true);
          if (order.document_recipient_name) setDocumentRecipientName(order.document_recipient_name);
          if (order.document_recipient_phone) setDocumentRecipientPhone(order.document_recipient_phone);
          if (order.document_address) setDocumentAddress(order.document_address);
        }
        if (order.gift_card_requested) {
          setGiftCardOn(true);
          if (order.gift_message) setGiftMessage(order.gift_message);
          if (order.gift_to) setGiftTo(order.gift_to);
          if (order.gift_from) setGiftFrom(order.gift_from);
        }

        if (order.tax_invoice_requested) {
          setTaxInvoiceRequested(true);
          if (order.tax_invoice_type === 'personal' || order.tax_invoice_type === 'corporate') setTaxType(order.tax_invoice_type);
          if (order.tax_invoice_name) setTaxName(order.tax_invoice_name);
          if (order.tax_invoice_tax_id) setTaxTaxId(order.tax_invoice_tax_id);
          if (order.tax_invoice_branch) setTaxBranch(order.tax_invoice_branch);
          if (order.tax_invoice_address) setTaxAddress(order.tax_invoice_address);
        }

        // For marketplace orders, skip unnecessary fetches (read-only)
        const isMarketplace = isMarketplaceSource(order.source);

        if (order.customer?.id && !isMarketplace) {
          const addrResponse = await apiFetch(`/api/shipping-addresses?customer_id=${order.customer.id}`);
          if (addrResponse.ok) {
            const addrResult = await addrResponse.json();
            setShippingAddresses(addrResult.addresses || []);
          }

          // Fetch customer prices (only for manual orders)
          const priceResponse = await apiFetch(`/api/customer-prices?customer_id=${order.customer.id}`);
          if (priceResponse.ok) {
            const priceResult = await priceResponse.json();
            setCustomerPrices(priceResult.prices || {});
          }
        }

        // Fetch products (only for manual orders — needed for product search)
        if (!isMarketplace) {
          await fetchProducts();
        }

        // Convert order items to single branch
        const loadedProducts: BranchProduct[] = [];
        let loadedShippingFee = 0;

        for (const item of order.items || []) {
          const shipments = item.shipments || [];
          const qty = shipments.length > 0 ? shipments[0].quantity : item.quantity;
          if (shipments.length > 0 && loadedShippingFee === 0) {
            loadedShippingFee = shipments[0].shipping_fee || 0;
          }
          if (!loadedProducts.find(p => p.variation_id === item.variation_id)) {
            const isPromo = !!item.promotion_id;
            loadedProducts.push({
              variation_id: item.variation_id,
              product_id: item.product_id,
              product_code: isPromo ? 'โปรโมชั่น' : item.product_code,
              product_name: isPromo ? (item.promotion_name || item.product_name) : item.product_name,
              variation_label: isPromo ? undefined : item.variation_label,
              image: item.image,
              quantity: qty,
              unit_price: item.unit_price,
              // หมายเหตุรายสินค้า — ต้อง map กลับ ไม่งั้นเปิดบิลเก่ามาแก้แล้วหมายเหตุหายตอน save
              notes: item.notes || undefined,
              discount_value: item.discount_type === 'amount' ? (item.discount_amount || 0) : (item.discount_percent || 0),
              discount_type: item.discount_type || 'percent',
              // Promotion fields
              promotion_id: item.promotion_id || undefined,
              promotion_name: item.promotion_name || undefined,
              promotion_type: item.promotion_type || undefined,
              promotion_components: item.promotion_components || undefined,
            });
          }
        }

        setBranchOrders([{
          shipping_address_id: order.shipping_address_id || '',
          address_name: 'รายการสินค้า',
          delivery_notes: '',
          shipping_fee: loadedShippingFee,
          products: loadedProducts,
        }]);
      } catch (error) {
        console.error('Error loading order:', error);
        showToast('ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [editOrderId, authLoading, userProfile]);

  const fetchCustomers = async () => {
    try {
      const response = await apiFetch('/api/customers?active=true');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to fetch customers');

      // Only show retail-compatible customers (exclude dealers and department stores)
      const retailTypes = ['retail', 'dropship', 'affiliate', null, undefined, ''];
      const sortedCustomers = (result.customers || [])
        .filter((c: Customer & { is_active?: boolean; customer_type?: string }) =>
          c.is_active !== false && retailTypes.includes(c.customer_type || ''))
        .sort((a: Customer, b: Customer) => a.name.localeCompare(b.name));
      setCustomers(sortedCustomers);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoadingProducts(true);
      const productsResponse = await apiFetch('/api/products');

      if (!productsResponse.ok) throw new Error('Failed to fetch products');

      const result = await productsResponse.json();
      const fetchedProducts = result.products || [];

      const flatProducts: Product[] = [];
      fetchedProducts.forEach((sp: any) => {
        if (sp.product_type === 'simple') {
          const variation_id = sp.variations && sp.variations.length > 0 ? sp.variations[0].variation_id : null;
          flatProducts.push({
            id: variation_id || sp.product_id,
            product_id: sp.product_id,
            code: sp.code,
            name: sp.name,
            image: sp.main_image_url || sp.image,
            variation_label: sp.simple_variation_label,
            product_type: 'simple',
            sku: sp.simple_sku,
            default_price: sp.simple_default_price || 0,
            discount_price: sp.simple_discount_price || 0,
            stock: sp.simple_stock || 0
          });
        } else {
          (sp.variations || []).forEach((v: any) => {
            flatProducts.push({
              id: v.variation_id,
              product_id: sp.product_id,
              code: `${sp.code}-${v.variation_label}`,
              name: sp.name,
              image: v.image_url || sp.main_image_url || sp.image,
              variation_label: v.variation_label,
              product_type: 'variation',
              sku: v.sku,
              default_price: v.default_price || 0,
              discount_price: v.discount_price || 0,
              stock: v.stock || 0
            });
          });
        }
      });
      setProducts(flatProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoadingProducts(false);
    }
  };

  // Top sellers — prefer this customer's history; backend falls back to
  // company-wide if customer has none. Deferred ~300ms so it stays out of
  // the critical fetch burst on mount; refetches when the customer changes.
  useEffect(() => {
    let aborted = false;
    const customerId = selectedCustomer?.id;
    const timeout = setTimeout(async () => {
      try {
        const qs = new URLSearchParams();
        if (customerId) qs.set('customer_id', customerId);
        qs.set('days', '30');
        qs.set('limit', '5');
        const res = await apiFetch(`/api/products/top-sellers?${qs.toString()}`);
        if (!res.ok) return;
        const json = await res.json();
        if (aborted) return;
        const items: Product[] = (json.items || []).map((row: any) => ({
          id: row.id,
          product_id: row.product_id,
          code: row.code,
          name: row.name,
          image: row.image || undefined,
          variation_label: row.variation_label || undefined,
          product_type: 'variation' as const,
          sku: row.sku || undefined,
          default_price: Number(row.default_price) || 0,
          discount_price: Number(row.discount_price) || 0,
          stock: 0,
        }));
        setTopSellers(items);
      } catch (e) {
        // non-fatal — suggestions are an enhancement, not a requirement
        console.error('Top sellers fetch failed:', e);
      }
    }, 300);
    return () => { aborted = true; clearTimeout(timeout); };
  }, [selectedCustomer?.id]);


  const fetchPromotions = async () => {
    try {
      const res = await apiFetch('/api/promotions?status=active&limit=200');
      if (res.ok) {
        const result = await res.json();
        setPromotions(result.promotions || []);
      }
    } catch (e) { /* silent */ }
  };

  const fetchWarehouses = async () => {
    try {
      const response = await apiFetch('/api/warehouses');
      if (!response.ok) return;
      const result = await response.json();
      const { warehouses: wh, stockConfig } = result;
      if (stockConfig?.stockEnabled) {
        setStockEnabled(true);
        setAllowOversell(stockConfig.allowOversell !== false);
        setWarehouses(wh || []);
        const defaultWh = (wh || []).find((w: any) => w.is_default);
        if (defaultWh && !selectedWarehouseId) {
          setSelectedWarehouseId(defaultWh.id);
          fetchInventoryForWarehouse(defaultWh.id);
        }
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  };

  const fetchInventoryForWarehouse = async (warehouseId: string) => {
    if (!warehouseId) return;
    try {
      const response = await apiFetch(`/api/inventory?warehouse_id=${warehouseId}&limit=9999`);
      if (!response.ok) return;
      const result = await response.json();
      const map: Record<string, { quantity: number; reserved_quantity: number; available: number }> = {};
      for (const item of result.items || []) {
        map[item.variation_id] = {
          quantity: item.quantity,
          reserved_quantity: item.reserved_quantity,
          available: item.available,
        };
      }
      setInventoryMap(map);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  // Live inventory updates for the currently-selected warehouse so concurrent
  // sellers in the same company don't oversell. Subscribes to postgres_changes
  // on the inventory row for this warehouse and patches the local map per
  // variation. Channel name includes company + warehouse so cross-tenant
  // events can't leak and re-mounts don't collide.
  useEffect(() => {
    const companyId = currentCompany?.id;
    if (!companyId || !selectedWarehouseId) return;

    const channel = supabase
      .channel(`inv-${companyId}-${selectedWarehouseId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'inventory',
        filter: `warehouse_id=eq.${selectedWarehouseId}`,
      }, (payload) => {
        const row = (payload.new || payload.old) as { variation_id?: string; quantity?: number; reserved_quantity?: number } | null;
        if (!row?.variation_id) return;
        if (payload.eventType === 'DELETE') {
          setInventoryMap(prev => {
            if (!(row.variation_id! in prev)) return prev;
            const { [row.variation_id!]: _, ...rest } = prev;
            return rest;
          });
          return;
        }
        const quantity = Number(row.quantity) || 0;
        const reserved = Number(row.reserved_quantity) || 0;
        setInventoryMap(prev => ({
          ...prev,
          [row.variation_id!]: {
            quantity,
            reserved_quantity: reserved,
            available: quantity - reserved,
          },
        }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentCompany?.id, selectedWarehouseId]);

  // Reuse from hook
  const { fillDeliveryFromAddress } = customerPrefill;
  const handleCustomerClear = () => {
    setSelectedCustomer(null);
    setCustomerPrices({});
    customerPrefill.clearPrefill();
    setTaxInvoiceRequested(false);
    setCustomerHasTax(false);
  };

  const handleSelectCustomer = async (customerIdOrCustomer: string | Customer) => {
    // Support both ID (from CustomerSelectionCard) and object (from EntitySearchInput)
    const customerId = typeof customerIdOrCustomer === 'string' ? customerIdOrCustomer : customerIdOrCustomer.id;
    const customer = typeof customerIdOrCustomer === 'string'
      ? customers.find(c => c.id === customerIdOrCustomer) || null
      : customerIdOrCustomer;
    if (!customer) return;

    setSelectedCustomer(customer);
    setShippingAddresses([]);
    setDeliveryName(''); setDeliveryPhone(''); setDeliveryEmail('');
    setDeliveryAddress(''); setDeliveryDistrict(''); setDeliveryAmphoe('');
    setDeliveryProvince(''); setDeliveryPostalCode('');
    setSelectedAddressId('');

    // Keep existing products, just reset shipping address
    const existingShippingFee = branchOrders[0]?.shipping_fee || 0;
    setBranchOrders([{
      ...branchOrders[0],
      shipping_address_id: '',
      shipping_fee: existingShippingFee,
    }]);

    // Fetch customer context (addresses + tax) via hook
    try {
      const result = await customerPrefill.prefillCustomer(customerId);
      setCustomerHasTax(!!(result?.customer as { tax_id?: string } | undefined)?.tax_id);
    } catch (error) {
      console.error('Error fetching customer context:', error);
    }

    // Customer prices (separate call — not in RPC)
    try {
      const response = await apiFetch(`/api/customer-prices?customer_id=${customerId}`);
      if (response.ok) {
        const result = await response.json();
        setCustomerPrices(result.prices || {});
      }
    } catch (error) {
      console.error('Error fetching customer prices:', error);
    }
  };

  // Copy from latest order
  const handleCopyLatestOrder = async () => {
    if (!selectedCustomer) return;

    try {
      setLoadingLatestOrder(true);
      // Fetch latest order for this customer
      const response = await apiFetch(`/api/orders?customer_id=${selectedCustomer.id}&limit=1`);

      if (!response.ok) throw new Error('Failed to fetch orders');

      const result = await response.json();
      const orders = result.orders || [];

      if (orders.length === 0) {
        showToast('ลูกค้านี้ยังไม่มีคำสั่งซื้อเก่า', 'error');
        return;
      }

      const latestOrder = orders[0];

      // Fetch full order details
      const detailResponse = await apiFetch(`/api/orders?id=${latestOrder.id}`);

      if (!detailResponse.ok) throw new Error('Failed to fetch order details');

      const detailResult = await detailResponse.json();
      const order = detailResult.order;

      if (!order) throw new Error('Order not found');

      // Flatten all items into single branch
      const copiedProducts: BranchProduct[] = [];
      let copiedShippingFee = 0;

      for (const item of order.items || []) {
        const shipments = item.shipments || [];
        const qty = shipments.length > 0 ? shipments[0].quantity : item.quantity;
        if (shipments.length > 0 && copiedShippingFee === 0) {
          copiedShippingFee = shipments[0].shipping_fee || 0;
        }
        if (!copiedProducts.find(p => p.variation_id === item.variation_id)) {
          copiedProducts.push({
            variation_id: item.variation_id,
            product_id: item.product_id,
            product_code: item.product_code,
            product_name: item.product_name,
            variation_label: item.variation_label,
            image: item.image,
            quantity: qty,
            unit_price: item.unit_price,
            discount_value: item.discount_type === 'amount' ? (item.discount_amount || 0) : (item.discount_percent || 0),
            discount_type: item.discount_type || 'percent'
          });
        }
      }

      if (copiedProducts.length === 0) {
        showToast('ไม่พบข้อมูลสินค้าใน Order เก่า', 'error');
        return;
      }

      setBranchOrders([{
        shipping_address_id: '',
        address_name: 'รายการสินค้า',
        delivery_notes: '',
        shipping_fee: copiedShippingFee,
        products: copiedProducts,
      }]);

      // Copy delivery info
      if (order.delivery_name) setDeliveryName(order.delivery_name);
      if (order.delivery_phone) setDeliveryPhone(order.delivery_phone);
      if (order.delivery_address) setDeliveryAddress(order.delivery_address);
      if (order.delivery_district) setDeliveryDistrict(order.delivery_district);
      if (order.delivery_amphoe) setDeliveryAmphoe(order.delivery_amphoe);
      if (order.delivery_province) setDeliveryProvince(order.delivery_province);
      if (order.delivery_postal_code) setDeliveryPostalCode(order.delivery_postal_code);
      if (order.delivery_email) setDeliveryEmail(order.delivery_email);
      if (order.shipping_address_id) setSelectedAddressId(order.shipping_address_id);

      // Set other fields
      if (order.notes) setNotes(order.notes);
      if (order.internal_notes) setInternalNotes(order.internal_notes);
      if (order.discount_amount) setOrderDiscount(order.discount_amount);
      if (order.order_discount_type) setOrderDiscountType(order.order_discount_type);

      showToast(`คัดลอกจาก ${latestOrder.order_number} สำเร็จ`);

    } catch (error) {
      console.error('Error copying order:', error);
      showToast('ไม่สามารถคัดลอกคำสั่งซื้อได้', 'error');
    } finally {
      setLoadingLatestOrder(false);
    }
  };

  // Merge promotions into product search list
  const allSearchItems: Product[] = useMemo(() => {
    const promoAsProducts: Product[] = promotions.map(p => {
      // Calculate display price based on type
      let displayPrice = 0;
      const items = p.items || [];
      if (p.promotion_type === 'bundle_set' && p.bundle_price) {
        displayPrice = p.bundle_price;
      } else if (p.promotion_type === 'bundle_set' && p.discount_type === 'percent') {
        displayPrice = items.reduce((s: number, i: any) => s + (i.default_price || 0) * (i.quantity || 1), 0) * (1 - (p.discount_value || 0) / 100);
      } else if (p.promotion_type === 'bundle_set' && p.discount_type === 'fixed_discount') {
        displayPrice = items.reduce((s: number, i: any) => s + Math.max(0, (i.default_price || 0) - (p.discount_value || 0)) * (i.quantity || 1), 0);
      } else {
        displayPrice = items.reduce((s: number, i: any) => {
          if (i.role === 'gift') return s;
          const price = i.special_price ?? i.default_price ?? 0;
          return s + price * (i.quantity || 1);
        }, 0);
      }
      return {
        id: `promo_${p.id}`,
        product_id: `promo_${p.id}`,
        code: 'โปรโมชั่น',
        name: `🎁 ${p.name}`,
        image: p.image || items[0]?.image,
        product_type: 'simple' as const,
        default_price: Math.round(displayPrice * 100) / 100,
        stock: 999,
      };
    });
    return [...promoAsProducts, ...products];
  }, [products, promotions]);

  // Resolve top sellers against the loaded product list — pick up current
  // stock/price and drop ones that no longer exist in the catalog.
  const resolvedTopSellers = useMemo<Product[]>(() => {
    if (!topSellers.length || !products.length) return [];
    const byId = new Map(products.map(p => [p.id, p]));
    const out: Product[] = [];
    for (const t of topSellers) {
      const live = byId.get(t.id);
      if (live) out.push(live);
    }
    return out;
  }, [topSellers, products]);

  // Promotion modal confirm handler
  const handlePromoConfirm = (result: PromotionSelectResult) => {
    const promo = result.promotion;
    const promoId = promo.id;

    // Prevent duplicate
    if (branchOrders[0]?.products.some(p => p.promotion_id === promoId)) {
      showToast('โปรโมชั่นนี้ถูกเพิ่มแล้ว', 'error');
      setPromoModal(null);
      return;
    }

    const items = promo.items || [];
    const mainItem = items.find((i: any) => i.role === 'main' || i.role === 'component') || items[0];

    // Build components — for buy_get_discount, only include selected discounted items
    let displayItems = items;
    if (promo.promotion_type === 'buy_get_discount') {
      const mainAndComp = items.filter((i: any) => i.role !== 'discounted');
      const selectedDisc = result.selectedDiscounted.map(sel => {
        const orig = items.find((i: any) => i.variation_id === sel.variation_id);
        return orig ? { ...orig, quantity: sel.quantity } : null;
      }).filter((x): x is PromoItemData => x !== null);
      displayItems = [...mainAndComp, ...selectedDisc];
    }

    const components: PromotionComponent[] = displayItems.map((item: any) => ({
      variation_id: item.variation_id || item.product_id || '',
      product_name: item.product_name || '',
      product_code: item.product_code || null,
      sku: item.sku || null,
      barcode: item.barcode || null,
      image: item.image || null,
      role: item.role || 'main',
      quantity: item.quantity || 1,
      default_price: item.default_price || 0,
      special_price: item.special_price || null,
    }));

    // Calculate unit_price (original full price) and discount_value (savings)
    // All promo types: unit_price = full price, discount_value = how much saved
    let unitPrice = 0;
    let discountValue = 0;
    const discountType: 'percent' | 'amount' = 'amount';
    const qty = result.quantity;

    // Full price = sum of all default_price
    const fullPrice = displayItems.reduce((s: number, i: any) => s + (i.default_price || 0) * (i.quantity || 1), 0);

    if (promo.promotion_type === 'bundle_set') {
      unitPrice = fullPrice;
      let promoPrice = fullPrice;
      if (promo.bundle_price) {
        promoPrice = promo.bundle_price;
      } else {
        if (promo.discount_type === 'percent') promoPrice = fullPrice * (1 - (promo.discount_value || 0) / 100);
        else if (promo.discount_type === 'fixed_discount') promoPrice = items.reduce((s: number, i: any) => s + Math.max(0, (i.default_price || 0) - (promo.discount_value || 0)) * (i.quantity || 1), 0);
      }
      discountValue = Math.round((fullPrice - promoPrice) * 100) / 100;
    } else if (promo.promotion_type === 'buy_get_free') {
      unitPrice = fullPrice;
      // Gift items are free — discount = gift value
      const giftValue = items.filter((i: any) => i.role === 'gift').reduce((s: number, i: any) => s + (i.default_price || 0) * (i.quantity || 1), 0);
      discountValue = Math.round(giftValue * 100) / 100;
    } else if (promo.promotion_type === 'buy_get_discount') {
      unitPrice = fullPrice;
      // Discount = difference between default_price and special_price for discounted items
      const discSavings = result.selectedDiscounted.reduce((s, sel) => {
        const orig = items.find((i: any) => i.variation_id === sel.variation_id);
        if (!orig) return s;
        return s + ((orig.default_price || 0) - (orig.special_price ?? orig.default_price ?? 0)) * sel.quantity;
      }, 0);
      discountValue = Math.round(discSavings * 100) / 100;
    } else if (promo.promotion_type === 'qty_discount') {
      const basePrice = items[0]?.default_price || 0;
      unitPrice = basePrice;
      const tiers = promo.tiers || [];
      if (tiers.length > 0) {
        const discountedPerUnit = calculateQtyDiscount(tiers as PromotionTier[], qty, basePrice);
        discountValue = Math.round((basePrice - discountedPerUnit) * qty * 100) / 100;
      }
    }

    const newProduct: BranchProduct = {
      variation_id: mainItem?.variation_id || promoId,
      product_id: mainItem?.product_id || promoId,
      product_code: 'โปรโมชั่น',
      product_name: promo.name,
      image: promo.image || mainItem?.image || undefined,
      quantity: promo.promotion_type === 'qty_discount' ? qty : 1,
      unit_price: unitPrice,
      discount_value: discountValue,
      discount_type: discountType,
      promotion_id: promoId,
      promotion_name: promo.name,
      promotion_type: promo.promotion_type,
      promotion_components: components,
      promotion_tiers: promo.tiers || [],
    };

    const newBranchOrders = [...branchOrders];
    newBranchOrders[0].products.push(newProduct);
    setBranchOrders(newBranchOrders);
    setPromoModal(null);
  };

  // Product management
  const handleAddProductToBranch = (product: Product) => {
    // Promotion handling — open modal
    if (product.id.startsWith('promo_')) {
      const promoId = product.id.replace('promo_', '');
      const promo = promotions.find((p: any) => p.id === promoId);
      if (!promo) return;

      if (branchOrders[0]?.products.some(p => p.promotion_id === promoId)) {
        showToast('โปรโมชั่นนี้ถูกเพิ่มแล้ว', 'error');
        return;
      }

      setPromoModal({ promo: promo as PromoData });
      return;
    }

    // Check if this product is in a buy_get_discount promotion (auto-detect)
    const matchingPromo = promotions.find((p: any) =>
      p.promotion_type === 'buy_get_discount' &&
      (p.items || []).some((i: any) => i.variation_id === product.id && (i.role === 'main' || i.role === 'component'))
    );
    if (matchingPromo && !branchOrders[0]?.products.some(p => p.promotion_id === matchingPromo.id)) {
      setPromoModal({
        promo: matchingPromo as PromoData,
        triggerProduct: { variation_id: product.id, product_name: product.name },
      });
      return;
    }

    // Stock validation when oversell is not allowed
    if (!allowOversell && stockEnabled && selectedWarehouseId) {
      const inv = inventoryMap[product.id];
      const available = inv ? inv.available : 0;
      const currentQty = branchOrders[0]?.products.filter(p => p.variation_id === product.id).reduce((s, p) => s + p.quantity, 0) || 0;

      if (available <= 0 || currentQty >= available) {
        showToast('สินค้านี้ stock หมด ไม่สามารถเพิ่มได้', 'error');
        return;
      }
    }

    const existingProductIndex = branchOrders[0]?.products.findIndex(
      p => p.variation_id === product.id
    ) ?? -1;

    const newBranchOrders = [...branchOrders];

    if (existingProductIndex !== -1) {
      // Duplicate → increment quantity (barcode scan behavior)
      if (!allowOversell && stockEnabled && selectedWarehouseId) {
        const inv = inventoryMap[product.id];
        const available = inv ? inv.available : 0;
        const currentQty = branchOrders[0]?.products.filter(p => p.variation_id === product.id).reduce((s, p) => s + p.quantity, 0) || 0;
        if (currentQty >= available) {
          showToast(`สินค้านี้เหลือ stock ${available} ไม่สามารถเพิ่มได้อีก`, 'error');
          return;
        }
      }
      newBranchOrders[0].products[existingProductIndex].quantity += 1;
      setBranchOrders(newBranchOrders);
    } else {
      let unit_price = 0;
      let discount_value = 0;
      const customerLastPrice = customerPrices[product.id];
      if (customerLastPrice) {
        unit_price = customerLastPrice.unit_price;
        discount_value = customerLastPrice.discount_percent;
      } else if (product.discount_price && product.discount_price > 0) {
        unit_price = product.discount_price;
      } else {
        unit_price = product.default_price;
      }

      const newProduct: BranchProduct = {
        variation_id: product.id,
        product_id: product.product_id,
        product_code: product.code,
        product_name: product.name,
        variation_label: product.variation_label,
        product_type: product.product_type,
        sku: product.sku,
        image: product.image,
        quantity: 1,
        unit_price,
        discount_value,
        discount_type: 'percent'
      };

      newBranchOrders[0].products.push(newProduct);
      setBranchOrders(newBranchOrders);
    }
  };

  const handleRemoveProduct = (productIndex: number) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[0].products = newBranchOrders[0].products.filter((_, i) => i !== productIndex);
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateProductQuantity = (productIndex: number, quantity: number) => {
    let finalQty = Math.max(1, quantity);

    if (!allowOversell && stockEnabled && selectedWarehouseId) {
      const variationId = branchOrders[0].products[productIndex].variation_id;
      const inv = inventoryMap[variationId];
      const available = inv ? inv.available : 0;
      const otherQty = branchOrders[0].products.reduce((s, p, pi) =>
        pi === productIndex ? s : (p.variation_id === variationId ? s + p.quantity : s), 0);
      const maxAllowed = Math.max(1, available - otherQty);
      if (finalQty > maxAllowed) {
        finalQty = maxAllowed;
        showToast(`stock เหลือ ${available} จำกัดจำนวนที่ ${maxAllowed}`, 'error');
      }
    }

    const newBranchOrders = [...branchOrders];
    const product = newBranchOrders[0].products[productIndex];
    product.quantity = finalQty;

    // Qty discount: recalculate discount_value based on new quantity (keep unit_price as original price)
    if (product.promotion_type === 'qty_discount' && product.promotion_tiers && product.promotion_tiers.length > 0) {
      const originalPrice = product.promotion_components?.[0]?.default_price || product.unit_price;
      const discountedPerUnit = calculateQtyDiscount(product.promotion_tiers as PromotionTier[], finalQty, originalPrice);
      product.discount_value = Math.round((originalPrice - discountedPerUnit) * finalQty * 100) / 100;
      product.discount_type = 'amount';
    }

    setBranchOrders(newBranchOrders);
  };

  const handleUpdateProductPrice = (productIndex: number, price: number) => {
    const newBranchOrders = [...branchOrders];
    if (newBranchOrders[0].products[productIndex].promotion_id) return; // Promotion rows: price controlled by promotion
    newBranchOrders[0].products[productIndex].unit_price = Math.max(0, price);
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateProductDiscount = (productIndex: number, value: number) => {
    const newBranchOrders = [...branchOrders];
    const product = newBranchOrders[0].products[productIndex];
    if (product.promotion_id) return; // Promotion rows: discount controlled by promotion
    if (product.discount_type === 'percent') {
      product.discount_value = Math.max(0, Math.min(100, value));
    } else {
      product.discount_value = Math.max(0, value);
    }
    setBranchOrders(newBranchOrders);
  };

  const handleUpdateProductNotes = (productIndex: number, value: string) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[0].products[productIndex].notes = value;
    setBranchOrders(newBranchOrders);
  };

  const handleToggleProductDiscountType = (productIndex: number) => {
    const newBranchOrders = [...branchOrders];
    const product = newBranchOrders[0].products[productIndex];
    product.discount_type = product.discount_type === 'percent' ? 'amount' : 'percent';
    product.discount_value = 0;
    setBranchOrders(newBranchOrders);
  };

  // ── Delivery zones + slots ─────────────────────────────────────────
  const deliveryZoneSlotOn = features.delivery_zone || features.delivery_slot;
  useEffect(() => {
    if (!deliveryZoneSlotOn) return;
    let cancelled = false;
    (async () => {
      try {
        const [zRes, sRes] = await Promise.all([
          features.delivery_zone ? apiFetch('/api/delivery-zones?active=true') : null,
          features.delivery_slot ? apiFetch('/api/delivery-slots?active=true') : null,
        ]);
        if (cancelled) return;
        if (zRes?.ok) setDeliveryZones((await zRes.json()).zones || []);
        if (sRes?.ok) setDeliverySlots((await sRes.json()).slots || []);
      } catch { /* ignore — features stay usable without zone/slot data */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryZoneSlotOn, features.delivery_zone, features.delivery_slot]);

  // เปลี่ยนวันส่ง → ดึง booked_count ของวันนั้น (เช็ค capacity)
  useEffect(() => {
    if (!features.delivery_slot || !deliveryDate) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/delivery-slots?active=true&date=${deliveryDate}`);
        if (!cancelled && res.ok) setDeliverySlots((await res.json()).slots || []);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features.delivery_slot, deliveryDate]);

  // โซนที่ใช้จริง: staff เลือกเอง > จับคู่อัตโนมัติจากที่อยู่จัดส่ง
  const autoZone = useMemo(
    () => resolveZone(
      { province: deliveryProvince, amphoe: deliveryAmphoe, postal_code: deliveryPostalCode },
      deliveryZones,
    ),
    [deliveryProvince, deliveryAmphoe, deliveryPostalCode, deliveryZones],
  );
  const activeZone = zoneOverrideId
    ? deliveryZones.find(z => z.id === zoneOverrideId) || null
    : autoZone;

  const handleUpdateShippingFee = (fee: number) => {
    const newBranchOrders = [...branchOrders];
    newBranchOrders[0].shipping_fee = Math.max(0, fee);
    setBranchOrders(newBranchOrders);
  };

  // Calculate totals
  const calculateProductSubtotal = (product: BranchProduct) => product.quantity * product.unit_price;
  const calculateProductDiscount = (product: BranchProduct) => {
    if (product.discount_type === 'percent') {
      return calculateProductSubtotal(product) * (product.discount_value / 100);
    }
    return product.discount_value;
  };
  const calculateProductTotal = (product: BranchProduct) => calculateProductSubtotal(product) - calculateProductDiscount(product);
  const calculateBranchTotal = (branch: BranchOrder) => branch.products.reduce((sum, p) => sum + calculateProductTotal(p), 0);

  const itemsTotal = branchOrders.reduce((sum, branch) => sum + calculateBranchTotal(branch), 0);
  const totalShippingFee = branchOrders.reduce((sum, branch) => sum + (branch.shipping_fee || 0), 0);

  // การ์ดอวยพร: ร้านต้องเปิดบริการก่อน ถึงจะโผล่ให้ staff ติ๊ก
  const giftCardEnabled = giftCard.enabled;
  const giftCardFee = giftCardEnabled && shipToOther && giftCardOn ? (giftCard.fee || 0) : 0;

  // Auto-fill ค่าส่งจากโซน (เฉพาะ fixed) — ไม่ทับค่าที่ staff แก้เอง:
  // ทับได้เฉพาะเมื่อค่าปัจจุบัน = ค่าที่ระบบเคย fill (หรือยังเป็น 0)
  const zoneFeeResult = features.delivery_zone && activeZone
    ? resolveDeliveryFee(activeZone, itemsTotal)
    : null;
  useEffect(() => {
    if (!features.delivery_zone || isReadOnly || branchOrders.length === 0) return;
    if (!zoneFeeResult || zoneFeeResult.fee == null) return; // lalamove → staff กรอกยอด quote เอง
    const current = branchOrders[0]?.shipping_fee || 0;
    const untouched = current === 0 || current === lastAppliedZoneFeeRef.current;
    if (untouched && current !== zoneFeeResult.fee) {
      lastAppliedZoneFeeRef.current = zoneFeeResult.fee;
      handleUpdateShippingFee(zoneFeeResult.fee);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features.delivery_zone, activeZone?.id, zoneFeeResult?.fee, branchOrders.length]);
  const calculateOrderDiscount = () => {
    if (orderDiscountType === 'percent') {
      return itemsTotal * (orderDiscount / 100);
    }
    return orderDiscount;
  };
  const totalWithVAT = itemsTotal - calculateOrderDiscount() + totalShippingFee + giftCardFee;
  const subtotal = vatRegistered ? Math.round((totalWithVAT / 1.07) * 100) / 100 : totalWithVAT;
  const vat = vatRegistered ? totalWithVAT - subtotal : 0;
  const total = totalWithVAT;

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Inline validation
    const errors: Record<string, string> = {};
    // Customer is optional for all modes
    if (features.delivery_date.enabled && features.delivery_date.required && !deliveryDate) {
      errors.deliveryDate = 'กรุณาเลือกวันที่ส่งของ';
    }
    // ส่งให้คนอื่นแล้วไม่กรอกชื่อ = ระบบเอาชื่อลูกค้าผู้สั่งไปจ่าหน้ากล่องแทน
    if (shipToOther && !deliveryName.trim()) {
      errors.recipientName = 'กรุณากรอกชื่อผู้รับ';
    }
    // เบอร์จาก customer record/การพิมพ์มักมีขีดหรือเว้นวรรค (081-5554544) — ตัดทิ้งก่อนตรวจ
    const phoneDigits = deliveryPhone.replace(/[-\s()]/g, '');
    if (phoneDigits && !/^(0[0-9]{8,9}|[0-9]{9,10})$/.test(phoneDigits)) {
      errors.deliveryPhone = 'เบอร์โทรไม่ถูกต้อง';
    }
    // "-" คือธรรมเนียมกรอกแทน "ไม่มี" — ถือว่าว่าง อย่า block การบันทึก
    const emailTrimmed = deliveryEmail.trim() === '-' ? '' : deliveryEmail.trim();
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      errors.deliveryEmail = 'อีเมลไม่ถูกต้อง';
    }
    // Check that at least one product exists
    if (branchOrders.length === 0 || !branchOrders[0]?.products.length) {
      errors.branches = NO_ITEMS_ERROR;
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      // Never fail silently — some errors (phone/email) have no inline display,
      // so always toast the first one in addition to scrolling.
      showToast(Object.values(errors)[0], 'error');
      const scrollToError = () => {
        // Scroll to first error
        if (errors.customer || errors.recipientName || errors.deliveryPhone || errors.deliveryEmail) {
          // customerSectionRef ไม่เคยถูก attach — fallback ไปการ์ดลูกค้า/จัดส่งจริง
          (customerSectionRef.current || deliverySectionRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (errors.deliveryDate) {
          deliveryDateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (errors.branches) {
          productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };
      if (useWizard) {
        // wizard ซ่อนขั้นที่ไม่ได้อยู่ — ต้องพาไปขั้นที่ผิดก่อน ไม่งั้น toast ขึ้นมา
        // แล้วผู้ใช้หาช่องที่ผิดไม่เจอ · ขั้นที่ไปตรงกับ error ตัวที่ toast แสดง
        // scroll ต้องรอ render รอบใหม่ — node ของขั้นนั้นเพิ่งถูก mount
        setStep(wizardStepForError(Object.keys(errors)[0]));
        requestAnimationFrame(() => requestAnimationFrame(scrollToError));
      } else {
        scrollToError();
      }
      return;
    }

    // Check if delivery address differs from selected shipping_address (non-edit, has customer)
    // โหมด "ส่งให้คนอื่น" ไม่ถือว่าขัดแย้ง — ที่อยู่นี้เป็นของผู้รับ ตั้งใจให้ต่างจากที่อยู่ผู้สั่งอยู่แล้ว
    // (API จะเก็บเป็นที่อยู่ผู้รับแยกให้ ไม่ทับที่อยู่หลัก)
    if (!isEditMode && !shipToOther && selectedCustomer && selectedAddressId && selectedAddressId !== 'new') {
      const selectedAddr = shippingAddresses.find(a => a.id === selectedAddressId);
      if (selectedAddr) {
        const differs = (
          (deliveryAddress || '') !== (selectedAddr.address_line1 || '') ||
          (deliveryDistrict || '') !== (selectedAddr.district || '') ||
          (deliveryAmphoe || '') !== (selectedAddr.amphoe || '') ||
          (deliveryProvince || '') !== (selectedAddr.province || '') ||
          (deliveryPostalCode || '') !== (selectedAddr.postal_code || '')
        );
        if (differs && deliveryAddress.trim()) {
          setAddressConflict({ mode: null, addressName: selectedAddr.address_name });
          return; // Wait for user choice
        }
      }
    }

    doSave('auto');
  };

  const doSave = async (addressAction: 'update' | 'new' | 'auto') => {
    try {
      setSaving(true);
      setAddressConflict(null);

      const branch = branchOrders[0];
      const addrId = selectedAddressId && selectedAddressId !== 'new' ? selectedAddressId : branch?.shipping_address_id;

      // Determine primary shipping_address_id
      const primaryAddressId = selectedCustomer ? (addrId || undefined) : undefined;

      // Auto-populate delivery snapshot from selected address if delivery fields are empty
      let snapshotName = deliveryName;
      let snapshotPhone = deliveryPhone;
      let snapshotAddress = deliveryAddress;
      let snapshotDistrict = deliveryDistrict;
      let snapshotAmphoe = deliveryAmphoe;
      let snapshotProvince = deliveryProvince;
      let snapshotPostalCode = deliveryPostalCode;
      let snapshotEmail = deliveryEmail.trim() === '-' ? '' : deliveryEmail;

      if (selectedCustomer && !deliveryName && primaryAddressId) {
        const addr = shippingAddresses.find(a => a.id === primaryAddressId);
        if (addr) {
          snapshotName = addr.contact_person || selectedCustomer.name;
          snapshotPhone = addr.phone || selectedCustomer.phone || '';
          snapshotAddress = addr.address_line1 || '';
          snapshotDistrict = addr.district || '';
          snapshotAmphoe = addr.amphoe || '';
          snapshotProvince = addr.province || '';
          snapshotPostalCode = addr.postal_code || '';
          snapshotEmail = selectedCustomer.email || '';
        }
      }

      // Auto-create customer if in new customer mode
      let resolvedCustomerId = selectedCustomer?.id;
      let resolvedShippingAddressId: string | undefined;
      if (newCustomerMode && newCustomerName.trim() && !selectedCustomer) {
        try {
          // 1. Create customer
          const createRes = await apiFetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: newCustomerName.trim(),
              phone: snapshotPhone || undefined,
              email: snapshotEmail || undefined,
              customer_type: 'retail',
            }),
          });
          if (createRes.ok) {
            const createResult = await createRes.json();
            resolvedCustomerId = createResult.customer?.id || createResult.id;

            // 2. Create shipping address if delivery info provided
            if (resolvedCustomerId && snapshotAddress) {
              const addrRes = await apiFetch('/api/shipping-addresses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customer_id: resolvedCustomerId,
                  // ส่งให้คนอื่น = ที่อยู่ผู้รับ ห้ามกลายเป็นที่อยู่หลักของผู้สั่ง
                  address_name: shipToOther ? (snapshotName.trim() || 'ที่อยู่ผู้รับ') : 'ที่อยู่หลัก',
                  contact_person: snapshotName || newCustomerName.trim(),
                  phone: snapshotPhone || undefined,
                  address_line1: snapshotAddress,
                  district: snapshotDistrict || undefined,
                  amphoe: snapshotAmphoe || undefined,
                  province: snapshotProvince || undefined,
                  postal_code: snapshotPostalCode || undefined,
                  is_default: !shipToOther,
                  // แยกสมุด: ที่อยู่ผู้รับของขวัญห้ามโผล่ใน dropdown ที่อยู่ของลูกค้า
                  is_recipient: shipToOther,
                }),
              });
              if (addrRes.ok) {
                const addrResult = await addrRes.json();
                resolvedShippingAddressId = addrResult.address?.id || addrResult.id;
              }
            }
          }
        } catch (err) {
          console.error('Auto-create customer error:', err);
        }
      }

      // Auto-create shipping address for existing customer that has no address yet
      // (e.g. marketplace placeholder customers like "Lazada" before they have a real address)
      if (resolvedCustomerId && !primaryAddressId && !resolvedShippingAddressId && snapshotAddress) {
        try {
          const addrRes = await apiFetch('/api/shipping-addresses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: resolvedCustomerId,
              // ส่งให้คนอื่น = ที่อยู่ผู้รับ ห้ามกลายเป็นที่อยู่หลักของผู้สั่ง
              address_name: shipToOther ? (snapshotName.trim() || 'ที่อยู่ผู้รับ') : 'ที่อยู่หลัก',
              contact_person: snapshotName || selectedCustomer?.name || '',
              phone: snapshotPhone || undefined,
              address_line1: snapshotAddress,
              district: snapshotDistrict || undefined,
              amphoe: snapshotAmphoe || undefined,
              province: snapshotProvince || undefined,
              postal_code: snapshotPostalCode || undefined,
              is_default: !shipToOther,
              // แยกสมุด: ที่อยู่ผู้รับของขวัญห้ามโผล่ใน dropdown ที่อยู่ของลูกค้า
              is_recipient: shipToOther,
            }),
          });
          if (addrRes.ok) {
            const addrResult = await addrRes.json();
            resolvedShippingAddressId = addrResult.address?.id || addrResult.id;
          }
        } catch (err) {
          console.error('Auto-create address for existing customer error:', err);
        }
      }

      const finalAddressId = resolvedShippingAddressId || primaryAddressId;

      // Build items AFTER customer/address resolution so shipments get the right id
      const items = (branch?.products || []).map(product => {
        // For promotion rows: use first component's real variation_id
        let variationId = product.variation_id;
        if (product.promotion_id && product.promotion_components?.length) {
          const realComp = product.promotion_components.find(c => c.variation_id);
          if (realComp) variationId = realComp.variation_id;
        }

        return {
          variation_id: variationId,
          product_id: product.product_id || undefined,
          product_code: product.product_code || undefined,
          product_name: product.product_name,
          variation_label: product.variation_label || undefined,
          quantity: product.quantity,
          unit_price: product.unit_price,
          discount_value: product.discount_value,
          discount_type: product.discount_type,
          // หมายเหตุรายสินค้า → order_items.notes (API POST/PUT รับอยู่แล้ว)
          notes: product.notes?.trim() || undefined,
          promotion_id: product.promotion_id || undefined,
          promotion_components: product.promotion_id && product.promotion_components?.length
            ? product.promotion_components.map(c => ({
                variation_id: c.variation_id,
                product_name: c.product_name,
                product_code: c.product_code,
                sku: c.sku,
                barcode: c.barcode,
                image: c.image,
                role: c.role,
                quantity: c.quantity,
                default_price: c.default_price,
                special_price: c.special_price,
              }))
            : undefined,
          shipments: resolvedCustomerId && finalAddressId ? [{
            shipping_address_id: finalAddressId,
            quantity: product.quantity,
            shipping_fee: branch?.shipping_fee || 0,
          }] : [],
        };
      });

      const orderData: any = {
        ...(resolvedCustomerId ? { customer_id: resolvedCustomerId } : {}),
        ...(finalAddressId ? { shipping_address_id: finalAddressId } : {}),
        delivery_date: deliveryDate || undefined,
        ...(features.delivery_zone ? { delivery_zone_id: activeZone?.id || null } : {}),
        ...(features.delivery_slot ? { delivery_slot_id: selectedSlotId || null } : {}),
        discount_amount: calculateOrderDiscount(),
        order_discount_type: orderDiscountType,
        notes: notes || undefined,
        internal_notes: internalNotes || undefined,
        // การ์ดอวยพร — ส่งเมื่อร้านเปิดบริการและ staff ติ๊กเท่านั้น
        // ค่าการ์ดคิดต่อเมื่อ "ขอการ์ด" จริง (ไม่ใช่แค่พิมพ์ข้อความแล้วยกเลิกติ๊ก)
        // ส่งให้คนอื่น = ซ่อนราคาได้แม้ไม่ขอการ์ด (ตรงกับหน้าร้านออนไลน์)
        gift_hide_price: shipToOther && giftHidePrice,
        // บอก API ว่าที่อยู่ก้อนนี้เป็นของ "ผู้รับ" → เก็บเข้าสมุดที่อยู่แบบไม่ใช่ที่อยู่หลัก
        ship_to_other: shipToOther,
        // เอกสารส่งไปรษณีย์ไปหาผู้ซื้อ — ส่งค่าเสมอ (false/null เมื่อไม่ใช้) ไม่ปล่อยค้าง
        document_by_post: shipToOther && documentByPost,
        document_recipient_name: shipToOther && documentByPost
          ? (documentRecipientName.trim() || selectedCustomer?.name || newCustomerName.trim() || null)
          : null,
        // เบอร์ผู้รับเอกสาร — ไม่บังคับ ไม่ fallback เบอร์ลูกค้า (ผู้ใช้ตั้งใจเว้นว่างได้)
        document_recipient_phone: shipToOther && documentByPost
          ? (documentRecipientPhone.trim() || null)
          : null,
        document_address: shipToOther && documentByPost ? (documentAddress.trim() || null) : null,
        ...(giftCardEnabled && shipToOther && giftCardOn ? {
          gift_card_requested: true,
          gift_message: giftMessage.trim() || undefined,
          gift_to: giftTo.trim() || undefined,
          gift_from: giftFrom.trim() || undefined,
        } : {}),
        tax_invoice_requested: taxInvoiceRequested || undefined,
        ...(taxInvoiceRequested ? {
          tax_invoice_type: taxType,
          tax_invoice_name: taxName.trim() || undefined,
          tax_invoice_tax_id: taxTaxId.trim() || undefined,
          tax_invoice_branch: taxBranch.trim() || undefined,
          tax_invoice_address: taxAddress.trim() || undefined,
        } : {}),
        items,
        ...(stockEnabled && selectedWarehouseId ? { warehouse_id: selectedWarehouseId } : {}),
        // Non-customer: send shipping fee directly
        ...(!selectedCustomer ? { shipping_fee: branch?.shipping_fee || 0 } : {}),
        // Delivery info snapshot (both customer & non-customer) — ส่งเมื่อมีข้อมูล
        // "สักช่อง" ไม่ใช่เฉพาะตอนมีชื่อ: โหมดสั่งเองไม่มีช่องชื่อผู้รับแยก ลูกค้าใหม่
        // จากแชทจึงไม่มี snapshotName — เดิมทำให้ที่อยู่ที่พิมพ์ไว้หายทั้งก้อน
        ...((snapshotName || snapshotPhone || snapshotAddress) ? {
          delivery_name: snapshotName || newCustomerName.trim() || selectedCustomer?.name || undefined,
          delivery_phone: snapshotPhone || undefined,
          delivery_address: snapshotAddress || undefined,
          delivery_district: snapshotDistrict || undefined,
          delivery_amphoe: snapshotAmphoe || undefined,
          delivery_province: snapshotProvince || undefined,
          delivery_postal_code: snapshotPostalCode || undefined,
          delivery_email: snapshotEmail || undefined,
        } : {}),
        // Tell API how to handle address: 'update' = update existing, 'new' = create new
        ...(addressAction !== 'auto' ? { address_action: addressAction } : {}),
        // Source channel info (from chat)
        ...(source ? { source, source_name: sourceName || undefined } : {}),
        // Sales channel — manual order origin (NULL if list hadn't loaded yet)
        sales_channel_id: selectedSalesChannelId || null,
        // Bill expiry: compute expires_at based on mode
        ...(expiryMode === 'none' ? {
          expires_at: null, // explicitly no expiry
        } : {
          expires_at: new Date(Date.now() + expiryDays * 86400000).toISOString(),
        }),
        // Exchange: items to return from original order → API creates CN atomically
        ...(exchangeData ? { exchange: exchangeData } : {}),
      };

      if (isEditMode) {
        orderData.id = editOrderId;
      }

      const response = await apiFetch('/api/orders', {
        method: isEditMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'เกิดข้อผิดพลาด');

      const newOrderId = result.order?.id || result.id || editOrderId!;

      if (isEditMode) {
        showToast('บันทึกการแก้ไขสำเร็จ');
        if (onSuccess) {
          setTimeout(() => onSuccess(newOrderId, result.order?.customer_id || selectedCustomer?.id, deliveryName ? { name: deliveryName, phone: deliveryPhone, email: deliveryEmail } : undefined), 1000);
        } else {
          setTimeout(() => { router.push('/orders'); }, 1500);
        }
      } else {
        // New order: show success modal with bill online option
        setSavedOrderId(newOrderId);
        setSavedOrderNumber(result.order?.order_number || result.order_number || '');
        setSavedCustomerId(result.order?.customer_id || selectedCustomer?.id);

        setShowSuccessModal(true);
      }
    } catch (error) {
      console.error('Error saving order:', error);
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.back();
    }
  };

  if (authLoading || loading) {
    return (
      <LoadingCard />
    );
  }

  // Read-only banner (shown when order can't be edited)
  const readOnlyBanner = (() => {
    if (!isReadOnly) return null;
    // Shopee banner is shown in the order detail page header instead
    if (editOrderSource === 'shopee') return null;
    const statusLabels: Record<string, string> = { new: 'ใหม่', shipping: 'กำลังส่ง', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };
    const paymentLabels: Record<string, string> = { pending: 'รอชำระ', verifying: 'รอตรวจสอบ', paid: 'ชำระแล้ว', cancelled: 'ยกเลิก' };
    const reasonMessage = editOrderStatus !== 'new'
      ? `สถานะออเดอร์ "${statusLabels[editOrderStatus] || editOrderStatus}"`
      : `สถานะชำระเงิน "${paymentLabels[editPaymentStatus] || editPaymentStatus}"`;
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 text-yellow-800 dark:text-yellow-300 px-4 py-3 rounded-lg text-sm">
        คำสั่งซื้อ {editOrderNumber} ({reasonMessage}) — ไม่สามารถแก้ไขได้
      </div>
    );
  })();

  const getVariationLabelDisplay = (variationLabel?: string) => {
    return variationLabel || '';
  };

  // Print-only view
  const printView = printMode && (
    <div className="hidden print:block bg-white text-black p-6 text-sm">
      {/* Print Header */}
      <div className="flex justify-between items-start mb-4 pb-3 border-b-2 border-black">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            {printMode === 'order' ? 'ใบออเดอร์' : 'ใบจัดของ (Packing List)'}
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          {deliveryDate && (
            <div>วันที่ส่ง: {new Date(deliveryDate + 'T00:00:00').toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          )}
          <div>พิมพ์เมื่อ: {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>

      {/* Customer info - username only */}
      {selectedCustomer && (
        <div className="mb-4 text-sm">
          <span className="text-gray-500">ลูกค้า:</span> <span className="font-medium">{selectedCustomer.name}</span>
        </div>
      )}

      {/* Products per branch */}
      {branchOrders.map((branch, branchIndex) => (
        <div key={branchIndex} className="mb-4">
          {branchOrders.length > 1 && (
            <div className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>{branch.address_name}</span>
            </div>
          )}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-800">
                {printMode === 'packing' && <th className="py-1.5 text-left w-8"></th>}
                <th className="py-1.5 text-left w-[72px]">รูป</th>
                <th className="py-1.5 text-left">สินค้า</th>
                <th className="py-1.5 text-center w-16">จำนวน</th>
                {printMode === 'order' && (
                  <>
                    <th className="py-1.5 text-right w-20">ราคา</th>
                    <th className="py-1.5 text-right w-20">ส่วนลด</th>
                    <th className="py-1.5 text-right w-24">รวม</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {branch.products.map((product, productIndex) => {
                const productTotal = calculateProductTotal(product);
                const discountAmount = product.discount_type === 'percent'
                  ? (product.unit_price * product.quantity * product.discount_value / 100)
                  : product.discount_value;
                return (
                  <tr key={productIndex} className="border-b border-gray-200">
                    {printMode === 'packing' && (
                      <td className="py-2 text-center align-middle">
                        <span className="inline-block w-5 h-5 border-2 border-gray-400 rounded-sm"></span>
                      </td>
                    )}
                    <td className="py-2 align-middle">
                      {product.image ? (
                        <img src={product.image} alt={product.product_name} className="w-16 h-16 object-cover rounded border border-gray-200" />
                      ) : (
                        <div className="w-16 h-16 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-gray-400 text-xs">N/A</div>
                      )}
                    </td>
                    <td className="py-2 align-middle">
                      <div className="font-semibold text-sm">{product.product_name}</div>
                      <div className="text-xs text-gray-400">{product.product_code}</div>
                    </td>
                    <td className="py-2 text-center align-middle text-base font-bold">{product.quantity}</td>
                    {printMode === 'order' && (
                      <>
                        <td className="py-2 text-right align-middle">฿{formatNumber(product.unit_price)}</td>
                        <td className="py-2 text-right align-middle text-gray-500">
                          {discountAmount > 0 ? `-฿${formatPrice(discountAmount)}` : '-'}
                        </td>
                        <td className="py-2 text-right align-middle font-medium">฿{formatPrice(productTotal)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Branch shipping fee */}
          {printMode === 'order' && branch.shipping_fee > 0 && (
            <div className="flex justify-between text-xs text-gray-500 mt-1 px-1">
              <span>ค่าจัดส่ง</span>
              <span>฿{formatPrice(branch.shipping_fee)}</span>
            </div>
          )}
        </div>
      ))}

      {/* Order Summary - only for order mode */}
      {printMode === 'order' && (
        <div className="border-t-2 border-gray-800 pt-3 mt-4">
          <div className="flex justify-end">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>ยอดรวมสินค้า</span>
                <span>฿{formatPrice(itemsTotal)}</span>
              </div>
              {totalShippingFee > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>ค่าจัดส่ง</span>
                  <span>฿{formatPrice(totalShippingFee)}</span>
                </div>
              )}
              {giftCardFee > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>การ์ดอวยพร</span>
                  <span>฿{formatPrice(giftCardFee)}</span>
                </div>
              )}
              {orderDiscount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>ส่วนลดรวม</span>
                  <span>-฿{formatPrice(orderDiscountType === 'percent' ? (itemsTotal + totalShippingFee) * orderDiscount / 100 : orderDiscount)}</span>
                </div>
              )}
              {vatRegistered && (
                <>
                  <div className="flex justify-between text-gray-600 pt-1 border-t border-gray-300">
                    <span>ยอดก่อน VAT</span>
                    <span>฿{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>VAT 7%</span>
                    <span>฿{formatPrice(vat)}</span>
                  </div>
                </>
              )}
              {storedExchangeCredit > 0 ? (
                <>
                  <div className="flex justify-between font-bold text-base pt-1.5 border-t-2 border-black">
                    <span>ยอดรวมก่อนหักเครดิต</span>
                    <span>฿{formatPrice(total)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-700">
                    <span>เครดิตจากการเปลี่ยนสินค้า</span>
                    <span>-฿{formatPrice(storedExchangeCredit)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-1.5 mt-1 border-t-2 border-black">
                    <span>ยอดชำระสุทธิ</span>
                    <span>฿{formatPrice(Math.max(0, total - storedExchangeCredit))}</span>
                  </div>
                </>
              ) : (
                <div className={`flex justify-between font-bold text-base pt-1.5 border-t-2 border-black`}>
                  <span>ยอดรวมสุทธิ</span>
                  <span>฿{formatPrice(total)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div className="mt-4 pt-3 border-t border-gray-300">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">หมายเหตุ</div>
          <div className="text-sm whitespace-pre-wrap">{notes}</div>
        </div>
      )}
    </div>
  );

  // ── ชิ้นส่วนของฟอร์ม (D1) ────────────────────────────────────────────────
  // แตกเป็น fragment เพื่อให้จอกว้าง (เรียงเหมือนเดิมทุกประการ) กับจอแคบ (wizard)
  // ใช้ state / validation / save ชุดเดียวกัน — ไม่แตกเป็น child component
  // เพราะ state ร่วมกันหลายสิบตัว prop drilling เสี่ยงตกหล่นมากกว่า
  //
  // portal ทั้งสาม (ปุ่มหัวหน้า / คลัง / ช่องทางขาย) ต้อง render ทุกเปลือกเสมอ
  // ไม่งั้นตัวเลือกคลังบนหัวหน้าจะหายไปตอนอยู่ขั้นอื่นของ wizard
  const portalsFragment = (
    <>
      {/* Header actions portal — copy order button in parent header */}
      {headerActionsRef?.current && !isEditMode && selectedCustomer && createPortal(
        <button
          type="button"
          onClick={handleCopyLatestOrder}
          disabled={loadingLatestOrder}
          className="p-1.5 text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 flex items-center"
          title="คัดลอก Order ล่าสุด"
        >
          {loadingLatestOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
        </button>,
        headerActionsRef.current
      )}

      {/* Warehouse Picker — portal into header or inline fallback */}
      {stockEnabled && warehouses.length >= 1 && (() => {
        const warehousePicker = (
          <div className="inline-block min-w-[160px]">
            <FormSelect
              value={selectedWarehouseId}
              onChange={(val) => {
                setSelectedWarehouseId(val);
                fetchInventoryForWarehouse(val);
              }}
              disabled={isReadOnly}
              options={warehouses.map(wh => ({
                id: wh.id,
                label: `${wh.is_default ? '⭐ ' : ''}${wh.name}`,
              }))}
              icon={<Warehouse className="w-4 h-4" />}
              placeholder="-- เลือกคลัง --"
              searchThreshold={99}
            />
          </div>
        );
        if (warehousePortalRef?.current) {
          return createPortal(warehousePicker, warehousePortalRef.current);
        }
        return <div className="flex justify-end">{warehousePicker}</div>;
      })()}

      {/* Sales Channel Picker — portals into header when target ref is provided.
          Inline fallback lives in the form body (see below). */}
      {salesChannels.length > 0 && salesChannelPortalRef?.current && createPortal(
        <div className="inline-block min-w-[180px]" title={salesChannelLocked ? 'ล็อกตามที่มา chat' : undefined}>
          <FormSelect
            value={selectedSalesChannelId}
            onChange={setSelectedSalesChannelId}
            disabled={isReadOnly || salesChannelLocked}
            options={salesChannels.map(c => ({
              id: c.id,
              label: `${c.is_default ? '⭐ ' : ''}${c.name}`,
              subtitle: c.channel_type === 'chat' ? 'Chat' : undefined,
            }))}
            icon={<Store className="w-4 h-4" />}
            placeholder="-- ช่องทาง --"
          />
        </div>,
        salesChannelPortalRef.current,
      )}
    </>
  );

  // Customer + Delivery section
  // ซ่อนเฉพาะเมื่อหน้าที่ห่ออยู่วาดการ์ดลูกค้า/ที่อยู่เองแล้ว (/orders/[id]) — ที่เหลือต้องเห็น
  // เดิม gate ด้วย `!isEditMode` ทำให้ทั้งแชทและ /orders/[id]/edit เห็นแต่รายการสินค้า
  // ไม่รู้ว่าบิลนี้ของใคร ส่งที่ไหน และแก้ที่อยู่ไม่ได้ (เจอจริง 2026-08-28)
  const customerDeliveryFragment = !customerSectionHandledByHost && (
      <div ref={deliverySectionRef} className="space-y-4">
        <CustomerSelectionCard
          customerLabel="ลูกค้า"
          singleColumn={narrowForm}
          customerRequired={false}
          allowNewCustomer
          newCustomerMode={newCustomerMode}
          onNewCustomerModeChange={(isNew) => { setNewCustomerMode(isNew); if (isNew) setNewCustomerName(''); }}
          newCustomerName={newCustomerName}
          onNewCustomerNameChange={setNewCustomerName}
          searchPlaceholder="ค้นหาชื่อ, รหัส, หรือเบอร์โทร..."
          createCustomerUrl="/customers/new"
          customers={customers.map(c => ({
            id: c.id, name: c.name, phone: c.phone || null, email: c.email || null,
            contact_person: c.contact_person || null, customer_code: c.customer_code || null,
          }))}
          selectedCustomer={selectedCustomer ? {
            id: selectedCustomer.id, name: selectedCustomer.name,
            phone: selectedCustomer.phone || null, email: selectedCustomer.email || null,
            contact_person: selectedCustomer.contact_person || null,
            customer_code: selectedCustomer.customer_code || null,
          } : null}
          selectedCustomerId={selectedCustomer?.id || ''}
          onCustomerChange={(id) => handleSelectCustomer(id)}
          onCustomerClear={handleCustomerClear}
          disabled={isReadOnly}
          /* ล็อคเฉพาะการ "เปลี่ยนตัวลูกค้า" — เบอร์/อีเมล/ที่อยู่ยังแก้ได้
             โหมดแก้ไขก็ล็อค: ย้ายออเดอร์ที่มีอยู่ไปลูกค้าคนอื่นต้องทำจากหน้า order ไม่ใช่เผลอกดที่นี่ */
          lockCustomerSelection={!!selectedCustomer && (!!preselectedCustomerId || isEditMode)}
          delivery={deliveryFields}
          onDeliveryChange={customerPrefill.handleDeliveryChange}
          shipToOther={shipToOther}
          onShipToOtherChange={isReadOnly ? undefined : setShipToOther}
          recipientNameError={fieldErrors.recipientName}
          shippingAddresses={shippingAddresses as CSCShippingAddress[]}
          selectedAddressId={selectedAddressId}
          onAddressSelect={(id, addr) => customerPrefill.handleAddressSelect(id, addr, selectedCustomer)}
          onNewAddress={customerPrefill.handleNewAddress}
          showTaxInvoice
          vatRegistered={vatRegistered}
          taxFields={taxFieldsState}
          onTaxFieldsChange={customerPrefill.handleTaxFieldsChange}
          showTaxCheckbox
          taxInvoiceRequested={taxInvoiceRequested}
          onTaxInvoiceRequestedChange={setTaxInvoiceRequested}
          customerHasTax={customerHasTax}
          onUpdateCustomerTax={selectedCustomer ? async (fields) => {
            try {
              const res = await apiFetch('/api/customers', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: selectedCustomer.id,
                  tax_type: fields.taxType,
                  tax_company_name: fields.taxName,
                  tax_id: fields.taxTaxId,
                  tax_branch: fields.taxBranch,
                  tax_address: fields.taxAddress,
                }),
              });
              if (res.ok) {
                setCustomerHasTax(true);
                showToast(customerHasTax ? 'อัพเดทข้อมูลภาษีของลูกค้าแล้ว' : 'บันทึกข้อมูลภาษีให้ลูกค้าแล้ว', 'success');
              }
            } catch {
              // Silent — order snapshot still saved
            }
          } : undefined}
          readOnly={isReadOnly}
        />

        {/* Sales channel — when a portal target is provided (e.g. /orders/new
            header), the picker renders there as a compact control.
            Otherwise (embedded contexts, edit pages without portal), shown inline. */}
        {/* เปิดบิลจากแชท: ช่องทางถูกล็อกตามห้องแชทและแก้ไม่ได้อยู่แล้ว + หัวแชทบอกช่องทางอยู่แล้ว
            → ไม่ต้องกินพื้นที่ทั้งการ์ด · ยกเว้นล็อกแล้วแต่ยังจับคู่ช่องทางไม่ได้ (ค่าว่าง)
            อันนั้นต้องให้เห็น ไม่งั้นบิลบันทึกโดยไม่มีช่องทางแบบเงียบ ๆ */}
        {salesChannels.length > 0 && !salesChannelPortalRef && !(salesChannelLocked && selectedSalesChannelId) && (
          <div className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} p-4`}>
            <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
              ช่องทางการขาย
              {salesChannelLocked && (
                <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">(ยังจับคู่ช่องทางจากแชทไม่ได้)</span>
              )}
            </label>
            <FormSelect
              value={selectedSalesChannelId}
              onChange={setSelectedSalesChannelId}
              disabled={isReadOnly || salesChannelLocked}
              options={salesChannels.map(c => ({
                id: c.id,
                label: `${c.is_default ? '⭐ ' : ''}${c.name}`,
                subtitle: c.channel_type === 'chat' ? 'Chat' : undefined,
              }))}
              placeholder="-- เลือกช่องทาง --"
            />
          </div>
        )}

        {/* การจัดส่ง — วันที่ + ช่วงเวลา + โซน/ค่าส่ง รวมการ์ดเดียว
            ทั้งสามเรื่องคือ "ของชิ้นนี้ไปถึงเมื่อไหร่ ค่าเท่าไหร่" เหมือนกัน
            แยกเป็นสามการ์ดเตี้ย ๆ ทำให้จอ desktop เหลือที่ว่างเปล่า ๆ */}
        {(features.delivery_date.enabled || features.delivery_zone) && (
        <div ref={deliveryDateRef} className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} p-4`}>
          <div className={features.delivery_date.enabled && features.delivery_zone && !narrowForm
            ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 items-start' : 'space-y-4'}>
          {features.delivery_date.enabled && (<div>
          <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
            วันที่ส่งของ {features.delivery_date.required && <span className="text-red-500">*</span>}
          </label>
          <div className={fieldErrors.deliveryDate ? 'ring-2 ring-red-400 rounded-lg' : ''}>
            <DateRangePicker value={deliveryDateValue} onChange={(val) => { setDeliveryDateValue(val); setFieldErrors(prev => { const { deliveryDate, ...rest } = prev; return rest; }); }} asSingle={true} useRange={false} showShortcuts={false} showFooter={false} placeholder="เลือกวันที่ส่ง" disabled={isReadOnly} />
          </div>
          {fieldErrors.deliveryDate && <p className="text-red-500 text-xs mt-1">{fieldErrors.deliveryDate}</p>}

          {/* ช่วงเวลาส่ง — ช่วงที่เลือกไม่ได้แสดงจาง + บอกเหตุผล (ห้ามซ่อน) */}
          {features.delivery_slot && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1.5">ช่วงเวลาส่ง</label>
              {!deliveryDate ? (
                <p className="text-sm text-gray-400 dark:text-slate-500">เลือกวันที่ส่งก่อน แล้วเลือกรอบเวลา</p>
              ) : deliverySlots.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-slate-500">ยังไม่ได้ตั้งค่ารอบส่ง — ตั้งได้ที่ ตั้งค่า → การจัดส่ง</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {deliverySlots.map((slot) => {
                    const avail = getSlotAvailability(slot, deliveryDate, activeZone);
                    const isSelected = selectedSlotId === slot.id;
                    // แสดงช่วงที่ส่งได้จริง (หักเวลาที่ผ่านไปแล้ว) ไม่ใช่ช่วงเต็มของรอบ
                    const win = avail.available ? getSlotWindow(slot, deliveryDate, activeZone) : null;
                    return (
                      <button
                        type="button"
                        key={slot.id}
                        disabled={isReadOnly || (!avail.available && !isSelected)}
                        onClick={() => setSelectedSlotId(isSelected ? '' : slot.id)}
                        className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                          isSelected
                            ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-950/30 text-[#C2410C] font-medium'
                            : avail.available
                              ? 'border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-gray-300'
                              : 'border-gray-100 dark:border-slate-700 text-gray-300 dark:text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        {slot.name} · {win ? buildWindowLabel(win).replace(' น.', '') : `${formatSlotTime(slot.start_time)}-${formatSlotTime(slot.end_time)}`}
                        {!avail.available && avail.reason && (
                          <span className="ml-1.5 text-xs">({slotUnavailableLabel(avail.reason, activeZone)})</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          </div>)}

          {features.delivery_zone && (
          <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-base font-medium text-gray-700 dark:text-slate-300">จุดส่ง / ค่าส่ง</label>
            {zoneOverrideId && !isReadOnly && (
              <button type="button" onClick={() => setZoneOverrideId('')} className="text-sm text-[#F4511E] hover:underline">
                จับคู่อัตโนมัติตามที่อยู่
              </button>
            )}
          </div>
          {deliveryZones.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500">ยังไม่ได้ตั้งค่าจุดส่ง — ตั้งได้ที่ ตั้งค่า → การจัดส่ง</p>
          ) : (
            <>
              <FormSelect
                value={activeZone?.id || ''}
                onChange={(v) => setZoneOverrideId(v)}
                options={deliveryZones.map(z => ({
                  id: z.id,
                  label: z.name,
                  subtitle: z.fee_type === 'lalamove'
                    ? 'ค่าส่งตาม Lalamove'
                    : `ค่าส่ง ฿${z.fee.toLocaleString()}${z.free_over != null ? ` · ครบ ฿${z.free_over.toLocaleString()} ส่งฟรี` : ''}`,
                }))}
                placeholder="เลือกจุดส่ง"
                disabled={isReadOnly}
              />
              <div className="mt-2">
                {activeZone ? (
                  zoneFeeResult?.needsQuote ? (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      โซนนี้คิดค่าส่งตาม Lalamove — เช็คราคาแล้วกรอกในช่องค่าส่งของสรุปยอด
                    </p>
                  ) : zoneFeeResult?.freeApplied ? (
                    <p className="text-sm text-emerald-600 dark:text-emerald-400">ส่งฟรี — ยอดสั่งซื้อถึงขั้นต่ำของโซนนี้แล้ว</p>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-slate-400">
                      ค่าส่งโซนนี้ ฿{(zoneFeeResult?.fee ?? 0).toLocaleString()}
                      {!zoneOverrideId && ' (จับคู่จากที่อยู่จัดส่งอัตโนมัติ)'}
                    </p>
                  )
                ) : (deliveryProvince || deliveryPostalCode) ? (
                  <p className="text-sm text-red-500">ที่อยู่นี้อยู่นอกพื้นที่จัดส่งทุกโซน — เลือกโซนเอง หรือแจ้งลูกค้าว่าไม่รับส่ง</p>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-slate-500">กรอกที่อยู่จัดส่ง ระบบจะจับคู่โซนและค่าส่งให้อัตโนมัติ</p>
                )}
              </div>
            </>
          )}
          </div>
          )}
          </div>
        </div>
        )}

        {/* ของขวัญ — โผล่ทันทีที่เลือก "ส่งให้คนอื่น" (ตัวเลือกอยู่เหนือช่องที่อยู่
            ในการ์ดลูกค้า เพราะมันบอกว่าที่อยู่นั้นเป็นของใคร) ไม่ต้องรอเลือกสินค้า —
            พนักงานมักตั้งค่าของขวัญตามที่ลูกค้าบอกก่อน แล้วค่อยไล่ใส่สินค้า
            ไม่ผูกกับฟีเจอร์ delivery — ร้านส่งพัสดุก็ส่งของขวัญได้ */}
        {shipToOther && (
        <div className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} p-4`}>
          <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-2">ของขวัญ</label>

          {/* กติกาของการ์ดนี้: **ช่องกรอกอยู่ใต้ติ๊กของตัวเองเสมอ** (เยื้องเข้าให้เห็นว่าเป็นลูกของติ๊กไหน)
              ห้ามยกไปกองรวมท้ายการ์ด — ผู้ใช้ติ๊กแล้วต้องเห็นทันทีว่าต้องกรอกอะไรต่อ */}
          <div className="space-y-3">

            {/* ① ไม่แนบใบเสร็จไปกับของ → ② ส่งเอกสารทางไปรษณีย์ (เป็นผลต่อเนื่องของ ①) */}
            <div>
              <Checkbox
                checked={giftHidePrice}
                onChange={(v) => { setGiftHidePrice(v); if (!v) clearDocumentByPost(); }}
                disabled={isReadOnly}
                className="!items-start gap-3"
              >
                <span className="min-w-0">
                  <span className="block text-base text-gray-700 dark:text-slate-300">ไม่แนบใบเสร็จและราคาไปกับของ</span>
                  <span className="block text-sm text-gray-500 dark:text-slate-400">ใบเสร็จส่งให้ผู้สั่งแทน</span>
                </span>
              </Checkbox>

              {/* เอกสารส่งทางไปรษณีย์ — ขึ้นเฉพาะเมื่อไม่แนบใบเสร็จไปกับของ
                  (ใบเสร็จอยู่ในกล่องอยู่แล้ว = ไม่มีเหตุต้องส่งซองตามไปอีก)
                  ที่อยู่หยิบจาก **สมุดที่อยู่ของลูกค้าเอง** เท่านั้น (ที่อยู่ผู้รับของขวัญคนละเล่ม —
                  เอกสารต้องไปหาผู้ซื้อ) · เก็บเป็นข้อความ snapshot จึงพิมพ์ซ้ำได้เหมือนเดิม
                  แม้ลูกค้าแก้ที่อยู่ทีหลัง และแก้เองได้ถ้าจะส่งไปที่อื่น */}
              {giftHidePrice && (
                <div className={`mt-3 border-l-2 border-gray-100 dark:border-slate-700 ${narrowForm ? 'ml-4 pl-3' : 'ml-8 pl-4'}`}>
                  <Checkbox checked={documentByPost} onChange={setDocumentByPost} disabled={isReadOnly} className="!items-start gap-3">
                    <span className="min-w-0">
                      <span className="block text-base text-gray-700 dark:text-slate-300">ส่งเอกสารทางไปรษณีย์ (ไม่ใส่ในกล่อง)</span>
                      <span className="block text-sm text-gray-500 dark:text-slate-400">พิมพ์ใบปะหน้าซองเอกสารได้จากเมนูพิมพ์ของบิลนี้</span>
                    </span>
                  </Checkbox>

                  {documentByPost && (
                    <div className="mt-3 space-y-3">
                      {/* ชื่อ+เบอร์สั้นทั้งคู่ → บรรทัดเดียวกันเสมอ แม้ใน panel แชท (ผู้ใช้ขอ 2026-08-29) */}
                      <div className="grid grid-cols-2 gap-3">
                        <FormInput
                          label="ชื่อผู้รับเอกสาร"
                          value={documentRecipientName}
                          onChange={(e) => setDocumentRecipientName(e.target.value)}
                          disabled={isReadOnly}
                          placeholder={selectedCustomer?.name || newCustomerName || 'ชื่อผู้สั่ง'}
                          className={GIFT_INPUT_CLASS}
                        />
                        {/* เบอร์ = ไม่บังคับ · ไปรษณีย์ไม่ต้องใช้ แต่ขนส่งเอกชนขอเบอร์ปลายทาง */}
                        <FormInput
                          label="เบอร์ผู้รับเอกสาร"
                          type="tel"
                          inputMode="tel"
                          value={documentRecipientPhone}
                          onChange={(e) => setDocumentRecipientPhone(e.target.value)}
                          disabled={isReadOnly}
                          placeholder="ไม่บังคับ"
                          hint="ใส่เมื่อส่งซองด้วยขนส่งเอกชน (ไปรษณีย์ไม่ต้องใช้)"
                          className={GIFT_INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label className="field-label">ที่อยู่ส่งเอกสาร</label>
                        {ownAddresses.length > 0 && !isReadOnly && (
                          <FormSelect
                            /* "เลือกอยู่" เฉพาะเมื่อข้อความด้านล่างยังตรงกับที่อยู่นั้นจริง
                               (พิมพ์แก้เองแล้ว = ที่อยู่ใหม่ ไม่ใช่ของเดิม) */
                            value={ownAddresses.some(a => a.id === documentAddressId && addressToText(a) === documentAddress.trim())
                              ? documentAddressId : ''}
                            onChange={(id) => {
                              const addr = ownAddresses.find(a => a.id === id);
                              if (addr) applyDocumentAddress(addr);
                            }}
                            options={ownAddresses.map(a => ({
                              id: a.id,
                              label: a.address_name || a.contact_person || 'ที่อยู่ลูกค้า',
                              subtitle: [a.amphoe || a.district, a.province].filter(Boolean).join(' · '),
                            }))}
                            placeholder="เลือกจากที่อยู่ของลูกค้า"
                            portal
                          />
                        )}
                        <textarea
                          value={documentAddress}
                          onChange={(e) => { setDocumentAddress(e.target.value); setDocumentAddressId(''); }}
                          rows={3}
                          disabled={isReadOnly}
                          placeholder="ที่อยู่ที่จะส่งซองเอกสารไปถึง"
                          className={`${ownAddresses.length > 0 && !isReadOnly ? 'mt-2 ' : ''}${GIFT_TEXTAREA_CLASS}`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ③ การ์ดอวยพร — ช่องข้อความอยู่ใต้ติ๊กนี้เช่นกัน */}
            {giftCardEnabled && (
              <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
                <Checkbox checked={giftCardOn} onChange={setGiftCardOn} disabled={isReadOnly} className="!items-start gap-3">
                  <span className="min-w-0">
                    <span className="block text-base text-gray-700 dark:text-slate-300">
                      แนบการ์ดอวยพร
                      <span className="ml-2 align-middle">
                        {giftCard.fee > 0
                          ? <Badge tone="amber" size="sm">+฿{formatPrice(giftCard.fee)}</Badge>
                          : <Badge tone="emerald" size="sm">ฟรี</Badge>}
                      </span>
                    </span>
                    <span className="block text-sm text-gray-500 dark:text-slate-400">เขียนข้อความให้ แล้วแนบไปกับของ</span>
                  </span>
                </Checkbox>

                {giftCardOn && (
                  <div className={`mt-3 space-y-3 ${narrowForm ? 'ml-4' : 'ml-8'}`}>
                    {/* "จาก … ถึง …" บรรทัดเดียวกันเสมอ เรียงจาก→ถึง ตามที่พูดบนการ์ดจริง
                        (ผู้ใช้ขอ 2026-08-29 — เดิมเรียงถึง→จาก และซ้อนแนวตั้งใน panel แชท) */}
                    <div className="grid grid-cols-2 gap-3">
                      <FormInput
                        label="จาก"
                        value={giftFrom}
                        onChange={(e) => setGiftFrom(e.target.value)}
                        disabled={isReadOnly}
                        placeholder={selectedCustomer?.name || 'ชื่อผู้ให้'}
                        className={GIFT_INPUT_CLASS}
                      />
                      <FormInput
                        label="ถึง"
                        value={giftTo}
                        onChange={(e) => setGiftTo(e.target.value)}
                        disabled={isReadOnly}
                        placeholder={deliveryName || 'ชื่อที่จะขึ้นบนการ์ด'}
                        className={GIFT_INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label className="field-label">ข้อความบนการ์ด</label>
                      <textarea
                        value={giftMessage}
                        onChange={(e) => setGiftMessage(e.target.value.slice(0, 220))}
                        rows={3}
                        disabled={isReadOnly}
                        maxLength={220}
                        className={GIFT_TEXTAREA_CLASS}
                        placeholder="เช่น สุขสันต์วันเกิดนะครับ ขอให้มีความสุขมากๆ"
                      />
                      <p className="text-sm text-gray-400 dark:text-slate-500 mt-0.5 text-right">{giftMessage.length} / 220</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}
      </div>
  );

  // Products Section
  // ไม่ส่ง forceCompact เข้า ItemsTable แล้ว — ตารางวัดความกว้างของตัวเองและเลือก
  // เลย์เอาต์เอง ("อยู่ในแชท" ไม่ได้แปลว่าแคบ · panel กว้าง ~690px = ตารางเต็มความกว้าง)
  const productsFragment = branchOrders.length > 0 && (
        <div ref={productsSectionRef} className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} overflow-visible`}>
          <ItemsTable
            items={(branchOrders[0]?.products || []).map((p): OrderTableItem => ({
              variation_id: p.variation_id,
              product_name: p.product_name,
              variation_label: p.product_type === 'simple' ? p.variation_label : getVariationLabelDisplay(p.variation_label),
              product_code: p.product_code,
              sku: p.sku,
              image: p.image,
              quantity: p.quantity,
              unit_price: p.unit_price,
              discount_value: p.discount_value,
              discount_type: p.discount_type,
              notes: p.notes,
              promotion_id: p.promotion_id,
              promotion_name: p.promotion_name,
              promotion_type: p.promotion_type,
              promotion_components: p.promotion_components,
            }))}
            columns={['qty', 'unit_price', 'discount', 'total']}
            showItemNotes
            stockMap={stockEnabled && selectedWarehouseId
              ? Object.fromEntries(Object.entries(inventoryMap).map(([k, v]) => [k, v.available]))
              : {}}
            showStockInSearch={stockEnabled && !!selectedWarehouseId}
            disableOutOfStock={!allowOversell && stockEnabled && !!selectedWarehouseId}
            products={isReadOnly ? [] : allSearchItems}
            loadingProducts={loadingProducts}
            searchPlaceholder="เพิ่มสินค้าหรือโปรโมชั่น — พิมพ์ชื่อหรือรหัส..."
            searchSuggestions={isReadOnly ? undefined : resolvedTopSellers}
            onAdd={isReadOnly ? undefined : (p) => handleAddProductToBranch(p as Product)}
            onUpdateField={isReadOnly ? undefined : (idx, field, value) => {
              if (field === 'quantity') handleUpdateProductQuantity(idx, value as number);
              if (field === 'unit_price') handleUpdateProductPrice(idx, value as number);
              if (field === 'discount_value') handleUpdateProductDiscount(idx, value as number);
              if (field === 'discount_type') handleToggleProductDiscountType(idx);
              if (field === 'notes') handleUpdateProductNotes(idx, value as string);
            }}
            onRemove={isReadOnly ? undefined : handleRemoveProduct}
            emptyMessage={fieldErrors.branches || 'เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน'}
            showSummary={false}
          />
        </div>
  );

  // Notes + Settings — คอลัมน์ซ้ายในจอกว้าง / อยู่ขั้นสรุปใน wizard
  const notesFragment = hasProducts && (
        <div className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} p-4`}>
          <div className="space-y-3">
              {/* Notes side-by-side on desktop, stacked on mobile.
                  Both textareas use rows=3 so they line up visually. */}
              <div className={`grid grid-cols-1 ${narrowForm ? '' : 'md:grid-cols-2'} gap-3`}>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
                    หมายเหตุ <span className="text-gray-400 dark:text-slate-500 font-normal">(แสดงในบิล / การจัดส่ง)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    disabled={isReadOnly}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary text-base font-sans disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500 resize-none"
                    placeholder="หมายเหตุสำหรับลูกค้า, การจัดส่ง..."
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-orange-700 dark:text-orange-400 mb-1">
                    หมายเหตุภายใน <span className="text-orange-400 dark:text-orange-500 font-normal">(ไม่แสดงในบิล)</span>
                  </label>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={3}
                    disabled={isReadOnly}
                    className="w-full px-3 py-2.5 border border-orange-300 dark:border-orange-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-base font-sans bg-orange-50 dark:bg-orange-900/20 text-gray-900 dark:text-slate-200 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-500 dark:disabled:text-slate-500 disabled:border-gray-300 dark:disabled:border-slate-600 resize-none"
                    placeholder="หมายเหตุภายใน..."
                  />
                </div>
              </div>

              {/* Advance settings toggle */}
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors mt-1"
                >
                  <Settings className="w-3.5 h-3.5" />
                  ตั้งค่าขั้นสูง
                  <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`} />
                </button>
              )}

              {/* Advance settings panel */}
              {showAdvancedSettings && !isReadOnly && (
                <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-slate-700/30">
                  <div className="flex items-center gap-2 heading-4 text-gray-700 dark:text-slate-200">
                    <Clock className="w-4 h-4" />
                    วันหมดอายุบิล
                  </div>
                  <div className="space-y-2.5">
                    <label className="flex items-center gap-2 cursor-pointer body-text text-gray-700 dark:text-slate-300">
                      <input
                        type="radio"
                        name="expiryMode"
                        checked={expiryMode === 'days'}
                        onChange={() => setExpiryMode('days')}
                        className="accent-primary"
                      />
                      <span>หมดอายุภายใน</span>
                      <NumberInput
                        min={1}
                        max={90}
                        value={expiryDays}
                        onChange={(n) => {
                          setExpiryDays(Math.max(1, Math.min(90, n || 1)));
                          setExpiryMode('days');
                        }}
                        onFocus={() => setExpiryMode('days')}
                        className="w-16 px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-center bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <span>วัน</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer body-text text-gray-700 dark:text-slate-300">
                      <input
                        type="radio"
                        name="expiryMode"
                        checked={expiryMode === 'none'}
                        onChange={() => setExpiryMode('none')}
                        className="accent-primary"
                      />
                      <span>ไม่หมดอายุ</span>
                    </label>
                  </div>
                </div>
              )}
          </div>
        </div>
  );

  // Order Summary — คอลัมน์ขวาในจอกว้าง (sticky) · เต็มความกว้างเสมอใน wizard
  // (wizard ไม่ได้ render กล่องที่ summarySectionRef เกาะ ค่า summaryWide จึงเชื่อไม่ได้)
  const summaryFragment = hasProducts && (
        <div className={useWizard ? 'w-full' : `${summaryWide ? 'w-[340px] flex-shrink-0 sticky top-4' : 'w-full'}`}>
          <div className={`bg-white dark:bg-slate-800 rounded-lg ${embedded ? '' : 'border border-gray-200 dark:border-slate-700'} p-4`}>
            <OrderSummaryBox
              title="สรุปคำสั่งซื้อ"
              subtotalAmount={itemsTotal}
              vatRegistered={vatRegistered}
              shippingFee={branchOrders[0]?.shipping_fee || 0}
              onShippingChange={!isReadOnly ? handleUpdateShippingFee : undefined}
              discountValue={orderDiscount}
              discountType={orderDiscountType}
              onDiscountChange={!isReadOnly ? setOrderDiscount : undefined}
              onDiscountTypeToggle={!isReadOnly ? () => { setOrderDiscountType(orderDiscountType === 'percent' ? 'amount' : 'percent'); setOrderDiscount(0); } : undefined}
              readOnly={isReadOnly}
            >
              {(() => {
                const credit = exchangeCreditAmount || storedExchangeCredit || 0;
                if (credit <= 0) return null;
                const diff = total - credit;
                return (
                  <>
                    <div className="flex justify-between text-sm text-green-600 dark:text-green-400 pt-2 border-t border-gray-200 dark:border-slate-600">
                      <span>เครดิตจากการเปลี่ยนสินค้า</span>
                      <span>-฿{formatPrice(credit)}</span>
                    </div>
                    <div className={`flex justify-between items-center text-lg font-bold mt-1 px-3 py-2 rounded-lg ${
                      diff > 0
                        ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                        : 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                    }`}>
                      <span>{diff > 0 ? 'ลูกค้าจ่ายเพิ่ม' : diff < 0 ? 'คืนเงินลูกค้า' : 'ไม่มีส่วนต่าง'}</span>
                      <span>฿{formatPrice(Math.abs(diff))}</span>
                    </div>
                  </>
                );
              })()}
            </OrderSummaryBox>
          </div>
        </div>
  );

  // Action Buttons
  const actionsFragment = !isReadOnly && hasProducts && (
        <StickyActionBar
          saving={saving}
          onSave={() => formRef.current?.requestSubmit()}
          onCancel={handleCancel}
        />
  );

  // แถบขั้นตอนของ wizard — กดสลับได้ทุกขั้น ทั้งเดินหน้าและถอยหลัง (Stepper กลางของระบบ)
  const wizardSteps: StepItem[] = ['สินค้า', 'จัดส่ง', 'สรุป'].map((label, i) => ({
    key: String(i + 1),
    label,
    state: step === i + 1 ? 'current' : step > i + 1 ? 'done' : 'todo',
  }));

  // เดินขั้นได้อิสระทั้งเดินหน้าและถอยหลัง (validation จริงเกิดตอนกดบันทึก
  // ซึ่งพาไปขั้นที่ผิดให้เองอยู่แล้ว) — กติกาเดียวที่เหลือคือออกจากขั้น "สินค้า"
  // ไม่ได้ถ้ายังไม่มีของ เพราะอีกสองขั้นไม่มีอะไรให้ทำเลย
  // ข้อความเดียวกับตอนกดบันทึก (NO_ITEMS_ERROR) และโชว์ในตารางว่างด้วย
  const goToStep = (target: number) => {
    if (target > 1 && !hasProducts) {
      setFieldErrors(prev => ({ ...prev, branches: NO_ITEMS_ERROR }));
      showToast(NO_ITEMS_ERROR, 'error');
      return;
    }
    setStep(Math.max(1, Math.min(3, target)));
  };
  const goToNextStep = () => goToStep(step + 1);

  // แถบล่างของ wizard — ยอดรวมกับปุ่มอยู่บรรทัดเดียวกัน ติดขอบล่างทุกขั้น
  // (ขั้นสรุปใช้แถบนี้แทน actionsFragment ไม่ใช่ซ้อนกันสองแถบ)
  //
  // `inset` เพราะ panel แชทมี padding 1rem คงที่ทุกขนาดจอ — ไม่ใช่ p-4 lg:p-6
  // ของ page layout ที่คลาสเริ่มต้นเดาไว้
  const wizardStepTotal = step === 3 ? total : itemsTotal;
  const wizardBar = useWizard && (
    <StickyActionBar
      inset
      saving={saving}
      onSave={() => formRef.current?.requestSubmit()}
      onCancel={step > 1 ? () => goToStep(step - 1) : undefined}
      cancelLabel="ย้อนกลับ"
      primary={
        step < 3
          ? <Button variant="primary" onClick={goToNextStep}>ถัดไป</Button>
          : (isReadOnly || !hasProducts ? null : undefined)
      }
    >
      <span className="flex items-baseline gap-1.5 min-w-0">
        <span className="truncate">{step === 3 ? 'ยอดรวมทั้งสิ้น' : 'ยอดรวมสินค้า'}</span>
        <span className="text-base font-semibold text-gray-900 dark:text-slate-100 flex-shrink-0">
          ฿{formatPrice(wizardStepTotal)}
        </span>
      </span>
    </StickyActionBar>
  );

  return (
    <>
    {printView}
    {/* wizard: ฟอร์มสูงเต็มพื้นที่ที่เลื่อนได้ของ panel เพื่อดันแถบล่างไปติดก้นจอจริง
        (sticky อย่างเดียวไม่พอ — บิลเปล่า ๆ เนื้อหาสั้น แถบจะไปค้างกลางจอ) */}
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className={`space-y-4 ${useWizard ? 'min-h-full flex flex-col' : ''} ${printMode ? 'print:hidden' : ''}`}
    >
      {portalsFragment}

      {useWizard ? (
        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          <Stepper
            steps={wizardSteps}
            onSelect={(key) => goToStep(Number(key))}
            allowJumpAhead
            ariaLabel="ขั้นตอนเปิดบิล"
          />

          {/* เนื้อหาขั้นปัจจุบัน — กินที่ว่างที่เหลือทั้งหมด ดันแถบล่างลงไปติดก้น */}
          <div className="flex-1 space-y-4">
            {step === 1 && productsFragment}

            {step === 2 && customerDeliveryFragment}

            {step === 3 && (
              <div className="space-y-4">
                {summaryFragment}
                {notesFragment}
              </div>
            )}
          </div>

          {wizardBar}
        </div>
      ) : (
        <>
          {customerDeliveryFragment}

          {/* 2-column layout: Products+Notes (left) + Summary (right) on wide screens */}
          <div ref={summarySectionRef} className="flex flex-wrap gap-4 items-start">
            <div className="flex-1 basis-[400px] min-w-0 space-y-4">
              {productsFragment}
              {notesFragment}
            </div>
            {summaryFragment}
          </div>

          {actionsFragment}
        </>
      )}

      {/* Address Conflict Dialog */}
      <Modal
        open={!!addressConflict}
        onClose={() => setAddressConflict(null)}
        size="sm"
        hideCloseButton
      >
        {addressConflict && (
          <div className="p-5">
            <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mb-2">ที่อยู่ไม่ตรงกับ &quot;{addressConflict.addressName}&quot;</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">ที่อยู่ที่กรอกไม่ตรงกับที่อยู่เดิม ต้องการดำเนินการอย่างไร?</p>
            <div className="space-y-2">
              <Button
                variant="primary"
                fullWidth
                onClick={() => doSave('update')}
                loading={saving}
              >
                อัพเดท &quot;{addressConflict.addressName}&quot;
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => doSave('new')}
                disabled={saving}
              >
                บันทึกเป็นที่อยู่ใหม่
              </Button>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setAddressConflict(null)}
                disabled={saving}
              >
                ยกเลิก
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Success Modal with Bill Online */}
      <Modal
        open={showSuccessModal}
        onClose={() => { setShowSuccessModal(false); if (!onSuccess) router.push('/orders?status=new'); }}
        size="md"
      >
        <div className="p-6">
          <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">สร้างคำสั่งซื้อสำเร็จ!</h3>
              {savedOrderNumber && (
                <p className="text-gray-600 dark:text-slate-400 mb-4">เลขที่คำสั่งซื้อ: <span className="font-medium">{savedOrderNumber}</span></p>
              )}
              <div className="space-y-3">
                {/* Bill Online Link with copy */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1 text-left">บิลออนไลน์</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/bills/${savedOrderId}`}
                      className="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-700 dark:text-slate-300 select-all"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const billUrl = `${window.location.origin}/bills/${savedOrderId}`;
                        copy(billUrl)
                        setBillLinkCopied(true);
                        setTimeout(() => setBillLinkCopied(false), 2000);
                      }}
                      className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                        billLinkCopied
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                          : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                      }`}
                      title="คัดลอกลิงก์"
                    >
                      {billLinkCopied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                  {billLinkCopied && (
                    <p className="text-xs text-green-600 mt-1 text-left">คัดลอกแล้ว!</p>
                  )}
                </div>

                {onSendBillToChat && (
                  <Button
                    variant="primary"
                    fullWidth
                    icon={<Send className="w-4 h-4" />}
                    onClick={() => {
                      const billUrl = `${window.location.origin}/bills/${savedOrderId}`;
                      setShowSuccessModal(false);
                      onSendBillToChat(savedOrderId, savedOrderNumber, billUrl);
                      if (onSuccess) {
                        onSuccess(savedOrderId, savedCustomerId || selectedCustomer?.id, deliveryName ? { name: deliveryName, phone: deliveryPhone, email: deliveryEmail } : undefined);
                      }
                    }}
                  >
                    ส่งบิลให้ลูกค้า
                  </Button>
                )}
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => { setShowSuccessModal(false); router.push(`/orders/${savedOrderId}`); }}
                >
                  ดูคำสั่งซื้อ
                </Button>
              </div>
            </div>
        </div>
      </Modal>
    </form>

    {/* Promotion Select Modal */}
    {promoModal && (
      <PromotionSelectModal
        promotion={promoModal.promo}
        triggerProduct={promoModal.triggerProduct}
        onConfirm={handlePromoConfirm}
        onClose={() => setPromoModal(null)}
      />
    )}
    </>
  );
}
