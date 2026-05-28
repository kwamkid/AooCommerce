'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  Loader2, Save, Settings, ChevronDown, Clock, CheckCircle, MapPin, FileText, Receipt,
  QrCode, Copy, Camera, Link2, AlertTriangle, Eye, Printer,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import NumberInput from '@/components/ui/NumberInput';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import { useCompany } from '@/lib/company-context';
import { formatNumber } from '@/lib/utils/format';
import ProductSearchInput, { ProductSearchItem } from '@/components/ui/ProductSearchInput';
import ItemsTable, { type TableItem } from '@/components/ui/ItemsTable';
import { productDisplayName, productSubtitle } from '@/lib/product-display';
import OrderSummaryBox from '@/components/ui/OrderSummaryBox';
import CustomerSelectionCard from '@/components/ui/CustomerSelectionCard';
import { useCustomerPrefill } from '@/lib/useCustomerPrefill';
import { type GpResolverContext, resolveGp, fetchCustomerOrderContext } from '@/lib/gp-resolver';
import { generateReplenishmentPdf, type ReplenishmentPdfData } from '@/lib/replenishment-pdf';
import { showPdfPreview } from '@/lib/print-pdf';

interface Customer {
  id: string;
  name: string;
  customer_code: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  address_line1: string | null;
  district: string | null;
  amphoe: string | null;
  province: string | null;
  postal_code: string | null;
  customer_type: string | null;
  tax_type?: 'personal' | 'corporate' | null;
  tax_company_name: string | null;
  tax_id: string | null;
  tax_branch: string | null;
  billing_address: string | null;
  billing_district: string | null;
  billing_amphoe: string | null;
  billing_province: string | null;
  billing_postal_code: string | null;
}

interface ReplenishmentItem {
  id?: string; // existing item id (for edit mode)
  product_id: string;
  variation_id: string | null;
  product_name: string;
  variation_label: string | null;
  sku: string | null;
  image: string | null;
  quantity: number;
  received_quantity: number;
  confirmed_quantity: number;
  unit_price: number;
  brand_id: string | null;
  default_price: number;
  discount_price: number;
  gp_rate: number;
  gp_base_price: 'retail' | 'discounted';
  gp_level: number;
  discount_type?: 'percent' | 'amount';
}

interface StockRecord { variation_id: string; quantity: number; available: number; }

export interface ReplenishmentFormState {
  status: string;
  replenishmentNumber: string;
  receiveToken: string;
  warehouseId: string | null;
  existingData: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  selectedCustomer: Customer | null;
  items: ReplenishmentItem[];
  printing: boolean;
  submitting: boolean;
  confirmSubmitting: boolean;
  handlePrint: () => void;
  handleConfirm: () => void;
  handleSaveEdit: () => void;
  handleSubmit: () => void;
}

interface Props {
  warehouseId?: string;
  replenishmentId?: string;
  viewMode?: boolean;
  onLoad?: (state: ReplenishmentFormState) => void;
  /** Department order mode: uses /api/department-orders instead of /api/replenishments */
  mode?: 'replenishment' | 'department_order';
}

export default function ReplenishmentForm({ warehouseId, replenishmentId, viewMode = false, onLoad, mode = 'replenishment' }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const vatRegistered = currentCompany?.vat_registered || false;
  const isDeptOrder = mode === 'department_order';
  const apiBase = isDeptOrder ? '/api/department-orders' : '/api/replenishments';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [items, setItems] = useState<ReplenishmentItem[]>([]);
  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [expiryMode, setExpiryMode] = useState<'default' | 'custom' | 'none'>('default');
  const [customExpiryDays, setCustomExpiryDays] = useState(7);
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState<'percent' | 'amount'>('percent');
  const [shippingFee, setShippingFee] = useState(0);

  // Customer prefill hook (delivery + tax + addresses)
  const customerPrefill = useCustomerPrefill();
  const { shippingAddresses, selectedAddressId, delivery: deliveryFields } = customerPrefill;
  const { deliveryName, deliveryPhone, deliveryEmail, deliveryAddress, deliveryDistrict, deliveryAmphoe, deliveryProvince, deliveryPostalCode } = deliveryFields;
  const { setDeliveryName, setDeliveryPhone, setDeliveryEmail, setDeliveryAddress, setDeliveryDistrict, setDeliveryAmphoe, setDeliveryProvince, setDeliveryPostalCode } = customerPrefill;
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Edit mode state
  const [loadingExisting, setLoadingExisting] = useState(!!replenishmentId);
  const [existingStatus, setExistingStatus] = useState('');
  const [existingData, setExistingData] = useState<any>(null);
  const [receiveToken, setReceiveToken] = useState('');
  const [replenishmentNumber, setReplenishmentNumber] = useState('');

  // Confirm mode state (for pending_confirm)
  const [confirmedQuantities, setConfirmedQuantities] = useState<Record<string, number>>({});
  const confirmedQuantitiesRef = useRef(confirmedQuantities);
  confirmedQuantitiesRef.current = confirmedQuantities;
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // Print state (declared early — used in onLoad useEffect dependency array below)
  const [printing, setPrinting] = useState(false);

  // GP resolution
  const [gpContext, setGpContext] = useState<GpResolverContext | null>(null);
  const [loadingGpData, setLoadingGpData] = useState(false);
  const latestCustomerIdRef = useRef('');

  // Stock lookups for columns
  const [sourceInventory, setSourceInventory] = useState<StockRecord[]>([]);
  const [dealerInventory, setDealerInventory] = useState<StockRecord[]>([]);
  const [allowOversell, setAllowOversell] = useState(true);

  const isEditMode = !!replenishmentId;
  const isDisabled = viewMode || (isEditMode && existingStatus !== 'pending');
  const isPendingConfirm = existingStatus === 'pending_confirm';
  const isShipped = existingStatus === 'shipped';
  const isCompleted = ['received', 'partial_received', 'cancelled'].includes(existingStatus);

  // Has mismatch: any item where received ≠ quantity
  const hasReceiveData = items.some(i => i.received_quantity > 0) || ['pending_confirm', 'received', 'partial_received'].includes(existingStatus);
  const hasMismatch = hasReceiveData && items.some(i => i.received_quantity !== i.quantity);

  // Notify parent whenever relevant state changes (for header action buttons)
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  useEffect(() => {
    if (!onLoadRef.current || !isEditMode) return;
    onLoadRef.current({
      status: existingStatus,
      replenishmentNumber,
      receiveToken,
      warehouseId: existingData?.warehouse_id || warehouseId || null,
      existingData,
      selectedCustomer,
      items,
      printing,
      submitting,
      confirmSubmitting,
      handlePrint,
      handleConfirm,
      handleSaveEdit,
      handleSubmit,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingStatus, replenishmentNumber, receiveToken, printing, submitting, confirmSubmitting, isEditMode]);

  useEffect(() => {
    apiFetch(`/api/customers?active=true&type=${isDeptOrder ? 'department_store' : 'consignment_dealer'}`)
      .then(r => r.json())
      .then(d => setCustomers(d.data || d.customers || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    {
      setLoadingProducts(true);
      apiFetch('/api/products?limit=9999&active=true')
        .then(r => r.json())
        .then(result => {
          const flat: ProductSearchItem[] = [];
          for (const p of result.products || []) {
            if (p.product_type === 'simple') {
              const v = p.variations?.[0];
              flat.push({
                id: v?.variation_id || p.product_id,
                product_id: p.product_id,
                code: p.code,
                name: p.name,
                image: p.main_image_url || p.image || null,
                variation_label: p.simple_variation_label || null,
                sku: p.simple_sku || null,
                barcode: v?.barcode || null,
                default_price: p.simple_default_price || 0,
                discount_price: p.simple_discount_price || 0,
                brand_id: p.brand_id || null,
              });
            } else {
              for (const v of p.variations || []) {
                flat.push({
                  id: v.variation_id,
                  product_id: p.product_id,
                  code: p.code ? `${p.code}-${v.variation_label}` : p.code,
                  name: p.name,
                  image: v.image_url || p.main_image_url || null,
                  variation_label: v.variation_label || null,
                  sku: v.sku || null,
                  barcode: v.barcode || null,
                  default_price: v.default_price || 0,
                  discount_price: v.discount_price || 0,
                  brand_id: p.brand_id || null,
                });
              }
            }
          }
          setProducts(flat);
        })
        .catch(() => {})
        .finally(() => setLoadingProducts(false));
    }
  }, [isEditMode]);

  // Fetch existing replenishment for edit/view
  useEffect(() => {
    if (!replenishmentId) return;
    setLoadingExisting(true);
    apiFetch(`${apiBase}/${replenishmentId}`)
      .then(r => r.json())
      .then(data => {
        const rp = isDeptOrder ? data.order : data.replenishment;
        if (!rp) return;
        setExistingData(rp);
        setExistingStatus(rp.status);
        setReplenishmentNumber(isDeptOrder ? rp.department_order_number || '' : rp.replenishment_number || '');
        setReceiveToken(rp.receive_token || '');
        setNotes(rp.notes || '');
        setInternalNotes(rp.internal_notes || '');
        setSelectedCustomerId(rp.customer?.id || '');
        setSelectedCustomer(rp.customer || null);

        // Prefill delivery fields from customer's shipping_address (same as create mode)
        if (rp.customer?.id) {
          customerPrefill.prefillCustomer(rp.customer.id, { includeTax: false }).then(ctx => {
            if (!ctx) return;
            setSelectedCustomer(prev => prev ? { ...prev, ...ctx.customer } : prev);
            setGpContext(ctx.gpContext);
          }).catch(() => {});
        }

        // Map items
        const mappedItems: ReplenishmentItem[] = (rp.items || []).map((item: any) => ({
          id: item.id,
          product_id: item.product_id || '',
          variation_id: item.variation_id || null,
          product_name: item.product_name,
          variation_label: item.variation_label || null,
          sku: item.sku || null,
          image: item.image || null,
          quantity: item.quantity,
          received_quantity: item.received_quantity || 0,
          confirmed_quantity: item.confirmed_quantity || 0,
          unit_price: item.unit_price || 0,
          brand_id: item.brand_id || null,
          default_price: item.default_price || 0,
          discount_price: item.discount_price || 0,
          gp_rate: item.gp_rate || 0,
          gp_base_price: item.gp_base_price || 'retail',
          gp_level: item.gp_level || 0,
        }));
        setItems(mappedItems);

        // Init confirmed quantities
        // For completed statuses: use confirmed_quantity as-is (even if 0 — that's the actual confirmed value)
        // For pending_confirm: default to received_quantity (confirmed_quantity is still 0 = unset)
        const isAlreadyConfirmed = ['received', 'partial_received'].includes(rp.status);
        const initConfirmed: Record<string, number> = {};
        for (const item of mappedItems) {
          if (item.id) {
            initConfirmed[item.id] = isAlreadyConfirmed ? item.confirmed_quantity : (item.confirmed_quantity > 0 ? item.confirmed_quantity : item.received_quantity);
          }
        }
        setConfirmedQuantities(initConfirmed);
      })
      .catch(() => showToast('ไม่สามารถโหลดข้อมูลได้', 'error'))
      .finally(() => setLoadingExisting(false));
  }, [replenishmentId]);

  // Fetch allowOversell from stock config
  useEffect(() => {
    apiFetch('/api/warehouses')
      .then(r => r.json())
      .then(d => { if (d.stockConfig) setAllowOversell(d.stockConfig.allowOversell !== false); })
      .catch(() => {});
  }, []);

  // Fetch source warehouse inventory (for stock_source column)
  useEffect(() => {
    if (!warehouseId) { setSourceInventory([]); return; }
    apiFetch(`/api/inventory?warehouse_id=${warehouseId}&limit=9999`)
      .then(r => r.json())
      .then(d => setSourceInventory((d.items || []).map((i: { variation_id: string; quantity: number; available: number }) => ({ variation_id: i.variation_id, quantity: i.quantity, available: i.available ?? i.quantity }))))
      .catch(() => setSourceInventory([]));
  }, [warehouseId, isEditMode]);

  // Fetch dealer consignment inventory (for stock_dest column)
  useEffect(() => {
    if (!selectedCustomerId) { setDealerInventory([]); return; }
    apiFetch(`/api/inventory?dealer_id=${selectedCustomerId}&limit=9999`)
      .then(r => r.json())
      .then(d => {
        const records: StockRecord[] = (d.items || []).map((i: {
          variation_id: string; consign_breakdown: { customer_id: string; qty: number }[];
        }) => {
          const b = i.consign_breakdown?.find((x: { customer_id: string }) => x.customer_id === selectedCustomerId);
          return { variation_id: i.variation_id, quantity: b?.qty ?? 0, available: b?.qty ?? 0 };
        }).filter((r: StockRecord) => r.quantity > 0);
        setDealerInventory(records);
      })
      .catch(() => setDealerInventory([]));
  }, [selectedCustomerId, isEditMode]);

  // ── Customer change: fetch GP data & recalculate items ────────────────

  const handleCustomerChange = async (id: string) => {
    setSelectedCustomerId(id);
    const cust = customers.find(c => c.id === id) || null;
    setSelectedCustomer(cust);
    latestCustomerIdRef.current = id;

    if (!id) {
      setGpContext(null);
      customerPrefill.clearPrefill();
      return;
    }

    setLoadingGpData(true);
    try {
      const ctx = await customerPrefill.prefillCustomer(id, { includeTax: false });
      if (!ctx) return;
      setGpContext(ctx.gpContext);
      setSelectedCustomer(prev => prev ? { ...prev, ...ctx.customer } : prev);

      if (items.length > 0) {
        setItems(prev => prev.map(item => {
          const resolution = resolveGp(ctx.gpContext, {
            brand_id: item.brand_id,
            default_price: item.default_price,
            discount_price: item.discount_price,
          });
          return { ...item, unit_price: resolution.unit_price, gp_rate: resolution.gp_rate, gp_base_price: resolution.gp_base_price, gp_level: resolution.gp_level };
        }));
      }
    } catch (err) {
      console.error('Failed to fetch GP data:', err);
      showToast('ไม่สามารถโหลดข้อมูล GP ได้', 'error');
    } finally {
      if (latestCustomerIdRef.current === id) setLoadingGpData(false);
    }
  };

  const handleCustomerClear = () => {
    setSelectedCustomerId('');
    setSelectedCustomer(null);
    setGpContext(null);
    latestCustomerIdRef.current = '';
    customerPrefill.clearPrefill();
  };

  // ── Add product with GP pricing ──────────────────────────────────────

  const handleAddProduct = (p: ProductSearchItem) => {
    if (!gpContext) return;

    const exists = items.findIndex(i => i.variation_id === p.id || (!i.variation_id && i.product_id === p.product_id));
    if (exists >= 0) {
      setItems(prev => prev.map((item, idx) => idx === exists ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      const resolution = resolveGp(gpContext, {
        brand_id: p.brand_id || null,
        default_price: p.default_price || 0,
        discount_price: p.discount_price || 0,
      });

      setItems(prev => [...prev, {
        product_id: p.product_id,
        variation_id: p.id !== p.product_id ? p.id : null,
        product_name: p.name,
        variation_label: p.variation_label || null,
        sku: p.sku || null,
        image: p.image || null,
        quantity: 1,
        received_quantity: 0,
        confirmed_quantity: 0,
        unit_price: resolution.unit_price,
        brand_id: p.brand_id || null,
        default_price: p.default_price || 0,
        discount_price: p.discount_price || 0,
        gp_rate: resolution.gp_rate,
        gp_base_price: resolution.gp_base_price,
        gp_level: resolution.gp_level,
      }]);
    }
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const updateItem = (idx: number, field: 'quantity' | 'unit_price' | 'gp_rate' | 'discount_type', value: number | string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      if (field === 'discount_type') {
        return { ...item, discount_type: value as 'percent' | 'amount', gp_rate: 0, unit_price: item.gp_base_price === 'discounted' && item.discount_price > 0 ? item.discount_price : item.default_price };
      }
      const updated = { ...item, [field]: value };
      if (field === 'gp_rate') {
        const basePrice = updated.gp_base_price === 'discounted' && updated.discount_price > 0 ? updated.discount_price : updated.default_price;
        if (updated.discount_type === 'amount') {
          updated.unit_price = Math.max(0, Math.round((basePrice - (value as number)) * 100) / 100);
        } else {
          updated.unit_price = Math.round(basePrice * (1 - (value as number) / 100) * 100) / 100;
        }
      }
      return updated;
    }));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const gpInfoText = (item: ReplenishmentItem): string => {
    const basePriceLabel = item.gp_base_price === 'discounted' ? 'ลด' : 'ปลีก';
    const basePrice = item.gp_base_price === 'discounted' && item.discount_price > 0 ? item.discount_price : item.default_price;
    if (item.discount_type === 'amount') {
      return `฿${formatNumber(basePrice)}(${basePriceLabel}) - ฿${formatNumber(item.gp_rate)} = ฿${formatNumber(item.unit_price)}`;
    }
    return `฿${formatNumber(basePrice)}(${basePriceLabel}) - GP${formatNumber(item.gp_rate)}% = ฿${formatNumber(item.unit_price)}`;
  };

  const subtotalBeforeDiscount = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const discountAmount = orderDiscountType === 'percent'
    ? subtotalBeforeDiscount * orderDiscount / 100
    : orderDiscount;
  const totalWithVAT = Math.max(0, subtotalBeforeDiscount - discountAmount + shippingFee);
  const subtotalExVAT = vatRegistered ? Math.round((totalWithVAT / 1.07) * 100) / 100 : totalWithVAT;
  const vat = vatRegistered ? totalWithVAT - subtotalExVAT : 0;
  const totalAmount = totalWithVAT;

  // Confirmed subtotal (for pending_confirm / completed with mismatch)
  const confirmedSubtotal = (isPendingConfirm || isCompleted) && hasMismatch
    ? items.reduce((sum, i) => {
        const cQty = confirmedQuantities[i.id!] ?? i.received_quantity;
        return sum + cQty * i.unit_price;
      }, 0)
    : null;
  const confirmedDiscountAmount = confirmedSubtotal !== null
    ? (orderDiscountType === 'percent' ? confirmedSubtotal * orderDiscount / 100 : orderDiscount)
    : 0;
  const confirmedTotalWithVAT = confirmedSubtotal !== null
    ? Math.max(0, confirmedSubtotal - confirmedDiscountAmount + shippingFee)
    : null;
  const hasItems = items.length > 0;

  // Submit (create new)
  const handleSubmit = async () => {
    if (!selectedCustomerId) { showToast('กรุณาเลือกตัวแทน', 'error'); return; }
    if (items.length === 0) { showToast('กรุณาเพิ่มสินค้า', 'error'); return; }
    setSubmitting(true);
    try {
      const res = await apiFetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomerId,
          warehouse_id: warehouseId || null,
          notes,
          internal_notes: internalNotes,
          items: items.map(i => ({ ...i, sku: i.sku })),
          discount_amount: discountAmount,
          discount_type: orderDiscountType,
          discount_value: orderDiscount,
          shipping_fee: shippingFee,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast(`สร้างใบเติมสินค้า ${data.replenishment_number} สำเร็จ`, 'success');
      router.push(isDeptOrder ? '/department-orders' : '/replenishments');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Save edit (pending status only)
  const handleSaveEdit = async () => {
    if (!replenishmentId) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`${apiBase}/${replenishmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          notes, internal_notes: internalNotes,
          customer_id: selectedCustomerId,
          total_amount: totalAmount,
          items: items.map(i => ({ ...i, sku: i.sku })),
        }),
      });
      if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'Failed'); }
      showToast('บันทึกเรียบร้อย', 'success');
      router.push(isDeptOrder ? '/department-orders' : '/replenishments');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm action (pending_confirm)
  const handleConfirm = async () => {
    if (!replenishmentId) return;
    setConfirmSubmitting(true);
    try {
      const currentConfirmed = confirmedQuantitiesRef.current;
      const confirmed_items = items
        .filter(i => i.id)
        .map(i => ({ id: i.id!, confirmed_quantity: currentConfirmed[i.id!] ?? i.received_quantity }));

      const res = await apiFetch(`${apiBase}/${replenishmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', confirmed_items }),
      });
      if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'Failed'); }
      const data = await res.json();
      showToast(data.status === 'received' ? 'ยืนยันเรียบร้อย — รับครบ' : 'ยืนยันเรียบร้อย — รับไม่ครบ', 'success');
      router.push(isDeptOrder ? '/department-orders' : '/replenishments');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setConfirmSubmitting(false);
    }
  };

  // Copy receive link
  const copyReceiveLink = () => {
    if (!receiveToken) return;
    const url = `${window.location.origin}/${isDeptOrder ? 'department-orders' : 'replenishments'}/receive/${receiveToken}`;
    navigator.clipboard.writeText(url);
    showToast('คัดลอกลิงก์แล้ว', 'success');
  };
  const handlePrint = async () => {
    if (!existingData) return;
    setPrinting(true);
    try {
      const pdfData: ReplenishmentPdfData = {
        id: existingData.id,
        replenishment_number: replenishmentNumber,
        status: existingStatus,
        notes: existingData.notes,
        created_at: existingData.created_at,
        receive_token: receiveToken,
        total_amount: existingData.total_amount,
        shipping_fee: existingData.shipping_fee,
        customer: selectedCustomer ? {
          name: selectedCustomer.name,
          customer_code: selectedCustomer.customer_code,
          phone: selectedCustomer.phone,
          billing_address: selectedCustomer.billing_address,
          billing_district: selectedCustomer.billing_district,
          billing_amphoe: selectedCustomer.billing_amphoe,
          billing_province: selectedCustomer.billing_province,
          billing_postal_code: selectedCustomer.billing_postal_code,
        } : null,
        created_by_name: existingData.created_by_profile?.name,
        items: items.map(i => ({
          product_name: i.product_name,
          variation_label: i.variation_label,
          sku: i.sku,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
      };
      const blob = await generateReplenishmentPdf({ data: pdfData });
      showPdfPreview(blob, 'ใบส่งสินค้า');
    } catch {
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrinting(false);
    }
  };

  // Loading state
  if (loadingExisting) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Invoice Info (Invoice Mode — auto-issued on ship) — hide for dept orders (TAX managed by page wrapper) */}
      {existingData?.tax_invoice_number && !isDeptOrder && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-purple-200 dark:border-purple-800 p-5">
          <div className="flex items-center gap-2 mb-2 text-purple-700 dark:text-purple-400">
            <Receipt className="w-5 h-5" />
            <span className="font-bold">
              {['tax', 'tax_only', 'tax_invoice'].includes(existingData.tax_invoice_doc_type) ? 'ใบกำกับภาษี' : 'ใบเสร็จรับเงิน'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500 dark:text-slate-400">เลขที่: </span>
              <span className="font-medium text-gray-900 dark:text-white">{existingData.tax_invoice_number}</span>
            </div>
            {existingData.tax_invoice_date && (
              <div>
                <span className="text-gray-500 dark:text-slate-400">วันที่: </span>
                <span className="text-gray-700 dark:text-slate-300">
                  {new Date(existingData.tax_invoice_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* QR Code Block (shipped status) */}
      {isShipped && receiveToken && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-amber-800 p-5">
          <div className="flex items-center gap-2 mb-3 text-amber-700 dark:text-amber-400">
            <QrCode className="w-5 h-5" />
            <span className="font-bold">ลิงก์รับสินค้า</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
            ส่ง QR Code หรือลิงก์ด้านล่างให้ตัวแทนเพื่อยืนยันรับสินค้า
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="bg-white p-3 rounded-lg">
              <QRCodeBlock value={`${typeof window !== 'undefined' ? window.location.origin : ''}/${isDeptOrder ? 'department-orders' : 'replenishments'}/receive/${receiveToken}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 px-3 py-2 bg-gray-50 dark:bg-slate-700 rounded-lg text-sm text-gray-600 dark:text-slate-300 truncate font-mono">
                  {typeof window !== 'undefined' ? `${window.location.origin}/${isDeptOrder ? 'department-orders' : 'replenishments'}/receive/${receiveToken}` : ''}
                </div>
                <button
                  onClick={copyReceiveLink}
                  className="flex-shrink-0 p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                  title="คัดลอกลิงก์"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receiver Info + Mismatch Warning (compact) */}
      {(isPendingConfirm || isCompleted) && existingData?.receiver_name && (
        <div className={`rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm ${
          isPendingConfirm && hasMismatch
            ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
            : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
        }`}>
          {isPendingConfirm && hasMismatch ? (
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
          )}
          <span className={`font-bold ${isPendingConfirm && hasMismatch ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'}`}>
            {isPendingConfirm && hasMismatch ? 'รับสินค้าไม่ตรง' : 'รับสินค้าแล้ว'}
          </span>
          <span className="text-gray-500 dark:text-slate-400">ผู้รับ: <span className="font-medium text-gray-700 dark:text-slate-300">{existingData.receiver_name}</span></span>
          {existingData.receive_notes && (
            <span className="text-gray-500 dark:text-slate-400">หมายเหตุ: <span className="text-gray-700 dark:text-slate-300">{existingData.receive_notes}</span></span>
          )}
          {isPendingConfirm && hasMismatch && (
            <span className="text-amber-600 dark:text-amber-400/80">— กรุณาตรวจสอบจำนวน แล้วกดปุ่ม &quot;ยืนยัน&quot;</span>
          )}
          {existingData.receive_photo_url && (
            <ProductImageThumb src={existingData.receive_photo_url} alt="รูปรับสินค้า" size="sm" />
          )}
        </div>
      )}

      {/* Customer + Address Section */}
      <CustomerSelectionCard
        customerLabel={isDeptOrder ? 'ห้างสรรพสินค้า' : 'ตัวแทน'}
        searchPlaceholder="ค้นหาชื่อหรือรหัสตัวแทน..."
        createCustomerUrl={isDeptOrder ? '/customers/new?type=department_store' : '/customers/new?type=consignment_dealer'}
        createButtonLabel="เพิ่มตัวแทน"
        customers={customers}
        selectedCustomer={selectedCustomer}
        selectedCustomerId={selectedCustomerId}
        onCustomerChange={handleCustomerChange}
        onCustomerClear={() => { handleCustomerClear(); setItems([]); }}
        loading={loadingGpData}
        disabled={isDisabled}
        shippingAddresses={shippingAddresses}
        selectedAddressId={selectedAddressId}
        onAddressSelect={(id, addr) => customerPrefill.handleAddressSelect(id, addr, selectedCustomer)}
        onNewAddress={customerPrefill.handleNewAddress}
        delivery={deliveryFields}
        onDeliveryChange={customerPrefill.handleDeliveryChange}
        showTaxInvoice
        vatRegistered={vatRegistered}
        taxFields={selectedCustomer?.tax_company_name ? {
          taxType: (selectedCustomer.tax_type === 'personal' ? 'personal' : 'corporate'),
          taxName: selectedCustomer.tax_company_name || '',
          taxTaxId: selectedCustomer.tax_id || '',
          taxBranch: selectedCustomer.tax_branch || '',
          taxAddress: [selectedCustomer.billing_address, selectedCustomer.billing_district, selectedCustomer.billing_amphoe, selectedCustomer.billing_province, selectedCustomer.billing_postal_code].filter(Boolean).join(' '),
        } : undefined}
      />

      {/* 2-Column Layout */}
      <div className="flex flex-wrap gap-4 items-start">
        {/* Left Column */}
        <div className="flex-1 basis-[400px] min-w-0 space-y-4">

          {/* Items Table */}
          {isPendingConfirm ? (
            /* Confirm mode: show 3 qty columns */
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">รายการสินค้า</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-700/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-slate-300">สินค้า</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-slate-300 w-20">ส่ง</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-slate-300 w-20">รับ</th>
                      {hasMismatch && (
                        <th className="text-center px-3 py-2 font-medium text-amber-600 dark:text-amber-400 w-24">ยืนยัน</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const diff = item.quantity - item.received_quantity;
                      const isMismatch = item.received_quantity !== item.quantity;
                      return (
                        <tr key={item.id || item.variation_id} className="border-t border-gray-100 dark:border-slate-700">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <ProductImageThumb src={item.image} alt={productDisplayName(item)} size="sm" />
                              <div className="min-w-0">
                                <div className="font-medium text-gray-900 dark:text-white line-clamp-2">{productDisplayName(item)}</div>
                                {productSubtitle(item) && <div className="text-xs text-gray-500 dark:text-slate-400 truncate">{productSubtitle(item)}</div>}
                                <div className="text-xs text-amber-600 dark:text-amber-400">฿{formatNumber(item.unit_price)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="text-center px-3 py-3 font-medium text-gray-700 dark:text-slate-300">{item.quantity}</td>
                          <td className={`text-center px-3 py-3 font-bold ${isMismatch ? (diff < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400') : 'text-green-600 dark:text-green-400'}`}>
                            {item.received_quantity}
                            {diff > 0 && <div className="text-xs text-red-500">ขาด {diff}</div>}
                            {diff < 0 && <div className="text-xs text-blue-500">เกิน {Math.abs(diff)}</div>}
                          </td>
                          {hasMismatch && (
                            <td className="text-center px-3 py-3">
                              <NumberInput
                                min={0}
                                value={confirmedQuantities[item.id!] ?? item.received_quantity}
                                onChange={(n) => {
                                  const v = Math.max(0, n);
                                  setConfirmedQuantities(prev => ({ ...prev, [item.id!]: v }));
                                }}
                                className="w-16 px-2 py-1.5 text-center border border-amber-300 dark:border-amber-700 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : isCompleted && items.some(i => i.received_quantity > 0) ? (
            /* Read-only: show sent/received (and confirmed if mismatch) */
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">รายการสินค้า</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-700/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-slate-300">สินค้า</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-slate-300 w-20">ส่ง</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-slate-300 w-20">รับ</th>
                      {hasMismatch && (
                        <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-slate-300 w-20">ยืนยัน</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const diff = item.quantity - item.received_quantity;
                      const isMismatch = item.received_quantity !== item.quantity;
                      return (
                        <tr key={item.id || item.variation_id} className="border-t border-gray-100 dark:border-slate-700">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <ProductImageThumb src={item.image} alt={productDisplayName(item)} size="sm" />
                              <div className="min-w-0">
                                <div className="font-medium text-gray-900 dark:text-white line-clamp-2">{productDisplayName(item)}</div>
                                {productSubtitle(item) && <div className="text-xs text-gray-500 dark:text-slate-400 truncate">{productSubtitle(item)}</div>}
                                <div className="text-xs text-amber-600 dark:text-amber-400">฿{formatNumber(item.unit_price)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="text-center px-3 py-3 text-gray-700 dark:text-slate-300">{item.quantity}</td>
                          <td className={`text-center px-3 py-3 font-bold ${isMismatch ? (diff < 0 ? 'text-blue-600' : 'text-amber-600') : 'text-green-600'}`}>
                            {item.received_quantity}
                            {diff > 0 && <div className="text-xs text-red-500">ขาด {diff}</div>}
                            {diff < 0 && <div className="text-xs text-blue-500">เกิน {Math.abs(diff)}</div>}
                          </td>
                          {hasMismatch && (
                            <td className="text-center px-3 py-3 font-bold text-gray-700 dark:text-slate-300">
                              {item.confirmed_quantity}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Normal ItemsTable (create / edit pending / shipped view) */
            <ItemsTable
              items={items.map((i): TableItem => ({
                variation_id: i.variation_id ?? i.product_id,
                product_id: i.product_id,
                product_name: i.product_name,
                variation_label: i.variation_label,
                sku: i.sku,
                image: i.image,
                quantity: i.quantity,
                unit_price: i.gp_base_price === 'discounted' && i.discount_price > 0 ? i.discount_price : i.default_price,
                discount_value: i.gp_rate,
                discount_type: (i.discount_type || 'percent') as 'percent' | 'amount',
                gpInfo: gpInfoText(i),
                stock_dest: selectedCustomerId ? (dealerInventory.find(s => s.variation_id === (i.variation_id ?? i.product_id))?.quantity ?? 0) : null,
              }))}
              columns={['stock_dest', 'qty', 'unit_price', 'discount', 'total']}
              stockMap={warehouseId ? Object.fromEntries(sourceInventory.map(s => [s.variation_id, s.available])) : {}}
              disableOutOfStock={!allowOversell}
              disableDestWarning
              products={isDisabled ? undefined : products}
              loadingProducts={loadingProducts}
              inputRef={searchInputRef}
              onAdd={!isDisabled && selectedCustomerId && gpContext ? handleAddProduct : undefined}
              searchDisabledMessage={isDisabled ? undefined : !selectedCustomerId ? 'กรุณาเลือกตัวแทนก่อนเพิ่มสินค้า' : loadingGpData ? 'กำลังโหลดข้อมูลราคา...' : undefined}
              onUpdateField={isDisabled ? undefined : (idx, field, value) => {
                if (field === 'quantity') updateItem(idx, 'quantity', value as number);
                if (field === 'unit_price') {
                  const item = items[idx];
                  const basePrice = value as number;
                  // Update base price + recalc unit_price with GP
                  setItems(prev => prev.map((it, i) => {
                    if (i !== idx) return it;
                    const updated = { ...it, default_price: basePrice };
                    if (updated.gp_base_price !== 'discounted') {
                      updated.unit_price = Math.round(basePrice * (1 - updated.gp_rate / 100) * 100) / 100;
                    }
                    return updated;
                  }));
                }
                if (field === 'discount_value') updateItem(idx, 'gp_rate', value as number);
                if (field === 'discount_type') updateItem(idx, 'discount_type', value as string);
              }}
              onRemove={isDisabled ? undefined : removeItem}
              showSummary={false}
            />
          )}

          {/* Notes */}
          {hasItems && !isPendingConfirm && !isCompleted && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
                  หมายเหตุ <span className="text-gray-400 dark:text-slate-500 font-normal">(แสดงในบิล / การจัดส่ง)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  disabled={isDisabled}
                  placeholder="หมายเหตุสำหรับตัวแทน, การจัดส่ง..."
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary text-base disabled:opacity-60"
                />
              </div>
              {!isDisabled && (
                <div>
                  <label className="block text-base font-medium text-orange-700 dark:text-orange-400 mb-1">
                    หมายเหตุภายใน <span className="text-orange-400 dark:text-orange-500 font-normal">(ไม่แสดงในบิล)</span>
                  </label>
                  <textarea
                    value={internalNotes}
                    onChange={e => setInternalNotes(e.target.value)}
                    rows={2}
                    placeholder="หมายเหตุภายใน..."
                    className="w-full px-3 py-2.5 border border-orange-300 dark:border-orange-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-base bg-orange-50 dark:bg-orange-900/20 text-gray-900 dark:text-slate-200"
                  />
                </div>
              )}

              {!isDisabled && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors mt-1"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    ตั้งค่าขั้นสูง
                    <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`} />
                  </button>

                  {showAdvancedSettings && (
                    <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-3 space-y-2 bg-gray-50 dark:bg-slate-700/30">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-slate-300">
                        <Clock className="w-4 h-4" />
                        วันหมดอายุบิล
                      </div>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" name="replenExpiry" checked={expiryMode === 'default'} onChange={() => setExpiryMode('default')} className="accent-primary" />
                          <span className="text-gray-700 dark:text-slate-300">ใช้ที่ตั้งค่าไว้ <span className="text-gray-400 dark:text-slate-500">(7 วัน)</span></span>
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" name="replenExpiry" checked={expiryMode === 'custom'} onChange={() => setExpiryMode('custom')} className="accent-primary" />
                          <span className="text-gray-700 dark:text-slate-300">กำหนดเอง</span>
                          {expiryMode === 'custom' && (
                            <span className="flex items-center gap-1 ml-1">
                              <NumberInput
                                min={1} max={90} value={customExpiryDays}
                                onChange={(n) => setCustomExpiryDays(Math.max(1, Math.min(90, n || 1)))}
                                className="w-14 px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-sm text-center bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <span className="text-gray-500 dark:text-slate-400 text-xs">วัน</span>
                            </span>
                          )}
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" name="replenExpiry" checked={expiryMode === 'none'} onChange={() => setExpiryMode('none')} className="accent-primary" />
                          <span className="text-gray-700 dark:text-slate-300">ไม่หมดอายุ</span>
                        </label>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Notes read-only for shipped/completed */}
          {(isShipped || isCompleted) && notes && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
              <label className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">หมายเหตุ</label>
              <p className="text-gray-700 dark:text-slate-300">{notes}</p>
            </div>
          )}
        </div>

        {/* Right Column — Summary */}
        {hasItems && (
          <div className="w-full sm:w-[300px] flex-shrink-0 sm:sticky sm:top-4">
            {confirmedTotalWithVAT !== null && confirmedTotalWithVAT !== totalWithVAT ? (
              /* Comparison mode: original vs confirmed side-by-side */
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-3">{isDeptOrder ? 'สรุปใบส่งห้าง' : 'สรุปใบเติมสินค้า'}</h3>
                {/* Header row */}
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-xs text-gray-400 dark:text-slate-500 mb-1.5">
                  <span />
                  <span className="text-right w-20">ยอดส่ง</span>
                  <span className="text-right w-20 font-bold text-amber-600 dark:text-amber-400">ยอดยืนยัน</span>
                </div>
                {/* Subtotal row */}
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center text-sm py-1">
                  <span className="text-gray-500 dark:text-slate-400">รวมสินค้า{vatRegistered ? ' (VAT)' : ''}</span>
                  <span className="text-right w-20 text-gray-400 dark:text-slate-500 line-through">฿{formatNumber(subtotalBeforeDiscount)}</span>
                  <span className="text-right w-20 font-medium text-gray-900 dark:text-white">฿{formatNumber(confirmedSubtotal!)}</span>
                </div>
                {/* VAT breakdown */}
                {vatRegistered && (
                  <>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center text-sm py-1 border-t border-gray-100 dark:border-slate-700">
                      <span className="text-gray-500 dark:text-slate-400">ก่อน VAT</span>
                      <span className="text-right w-20 text-gray-400 dark:text-slate-500 line-through">฿{formatNumber(subtotalExVAT)}</span>
                      <span className="text-right w-20 text-gray-600 dark:text-slate-300">฿{formatNumber(Math.round((confirmedTotalWithVAT / 1.07) * 100) / 100)}</span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center text-sm py-1">
                      <span className="text-gray-500 dark:text-slate-400">VAT 7%</span>
                      <span className="text-right w-20 text-gray-400 dark:text-slate-500 line-through">฿{formatNumber(vat)}</span>
                      <span className="text-right w-20 text-gray-600 dark:text-slate-300">฿{formatNumber(confirmedTotalWithVAT - Math.round((confirmedTotalWithVAT / 1.07) * 100) / 100)}</span>
                    </div>
                  </>
                )}
                {/* Total comparison */}
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center pt-2 mt-1 border-t border-gray-200 dark:border-slate-600">
                  <span className="font-bold text-gray-900 dark:text-white">ยอดรวมสุทธิ</span>
                  <span className="text-right w-20 text-gray-400 dark:text-slate-500 line-through text-sm">฿{formatNumber(totalWithVAT)}</span>
                  <span className="text-right w-20 font-bold text-lg text-primary">฿{formatNumber(confirmedTotalWithVAT)}</span>
                </div>
                {/* Difference badge */}
                <div className={`mt-2 flex items-center justify-end gap-1.5 text-sm font-medium ${confirmedTotalWithVAT < totalWithVAT ? 'text-red-500' : 'text-blue-500'}`}>
                  <span>{confirmedTotalWithVAT < totalWithVAT ? 'ลดลง' : 'เพิ่มขึ้น'}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    confirmedTotalWithVAT < totalWithVAT
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  }`}>
                    {confirmedTotalWithVAT < totalWithVAT ? '-' : '+'}฿{formatNumber(Math.abs(totalWithVAT - confirmedTotalWithVAT))}
                  </span>
                </div>
              </div>
            ) : (
              /* Normal mode */
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                <OrderSummaryBox
                  title={isDeptOrder ? 'สรุปใบส่งห้าง' : 'สรุปใบเติมสินค้า'}
                  subtotalAmount={subtotalBeforeDiscount}
                  vatRegistered={vatRegistered}
                  shippingFee={shippingFee}
                  onShippingChange={!isDisabled ? setShippingFee : undefined}
                  discountValue={orderDiscount}
                  discountType={orderDiscountType}
                  onDiscountChange={!isDisabled ? setOrderDiscount : undefined}
                  onDiscountTypeToggle={!isDisabled ? () => { setOrderDiscountType(orderDiscountType === 'percent' ? 'amount' : 'percent'); setOrderDiscount(0); } : undefined}
                  readOnly={isDisabled}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions (create/edit only) */}
      {!isEditMode && (
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => router.push(isDeptOrder ? '/department-orders' : '/replenishments')}
            disabled={submitting}
          >
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!selectedCustomerId || items.length === 0}
            loading={submitting}
            icon={<Save className="w-4 h-4" />}
          >
            สร้างใบเติมสินค้า
          </Button>
        </div>
      )}
      {isEditMode && existingStatus === 'pending' && !viewMode && (
        <div className="flex justify-end gap-3">
          <Button
            variant="primary"
            onClick={handleSaveEdit}
            disabled={!selectedCustomerId || items.length === 0}
            loading={submitting}
            icon={<Save className="w-4 h-4" />}
          >
            บันทึก
          </Button>
        </div>
      )}

    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: 'ที่ต้องจัดส่ง', color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' },
    shipped: { label: 'กำลังส่ง', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/40' },
    pending_confirm: { label: 'รอยืนยัน', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/40' },
    received: { label: 'รับครบแล้ว', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40' },
    partial_received: { label: 'รับไม่ครบ', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40' },
    cancelled: { label: 'ยกเลิก', color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/40' },
  };
  const c = config[status] || config.pending;
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.color}`}>{c.label}</span>;
}

// QR Code component (lazy-loaded to avoid SSR issues)
function QRCodeBlock({ value }: { value: string }) {
  const [QRCodeSVG, setQRCodeSVG] = useState<any>(null);
  useEffect(() => {
    import('qrcode.react').then(mod => setQRCodeSVG(() => mod.QRCodeSVG));
  }, []);
  if (!QRCodeSVG) return <div className="w-[120px] h-[120px] bg-gray-100 animate-pulse rounded" />;
  return <QRCodeSVG value={value} size={120} />;
}
