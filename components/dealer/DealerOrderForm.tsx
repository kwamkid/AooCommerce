'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useRouter } from 'next/navigation';
import { useCompany } from '@/lib/company-context';
import CustomerSelectionCard, { type DeliveryFields, type ShippingAddress } from '@/components/ui/CustomerSelectionCard';
import { useCustomerPrefill } from '@/lib/useCustomerPrefill';
import { Loader2, Save, Warehouse } from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';
import ItemsTable, { type TableItem } from '@/components/ui/ItemsTable';
import { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import { resolveGp, fetchCustomerOrderContext, type GpResolverContext } from '@/lib/gp-resolver';
import OrderSummaryBox from '@/components/ui/OrderSummaryBox';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import OrderStatusBar from '@/components/dealer/OrderStatusBar';
import OrderPrintButtons from '@/components/ui/OrderPrintButtons';
import { formatNumber } from '@/lib/utils/format';

// ── Types ──────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  customer_type: string;
  sale_type: string | null;
  customer_code?: string;
  // Billing (populated after fetch /api/customers/:id)
  billing_address?: string | null;
  billing_district?: string | null;
  billing_amphoe?: string | null;
  billing_province?: string | null;
  billing_postal_code?: string | null;
  tax_company_name?: string | null;
  tax_id?: string | null;
  tax_branch?: string | null;
}


interface OrderItem {
  variation_id: string;
  product_id: string;
  product_name: string;
  variation_label: string | null;
  sku: string | null;
  quantity: number;
  original_price: number;
  discount_rate: number;
  discount_type?: 'percent' | 'amount';
  unit_price: number;
  gp_level: number;
  brand_id: string | null;
  image: string | null;
  // For consignment: store base prices for GP recalc
  default_price: number;
  discount_price: number;
  gp_base_price: 'retail' | 'discounted';
}

export type OrderMode =
  | 'wholesale'          // ขายขาด (ตัวแทน + ห้าง) → POST /api/orders
  | 'consignment'        // ฝากขาย ตัวแทน → POST /api/consignment/reports
  | 'dept_consignment'   // ฝากขาย ห้าง (คีย์ยอด) → POST /api/department-store/reports
  | 'department';        // ใบส่งห้าง → POST /api/department-orders

interface Props {
  mode: OrderMode;
  customerTypeFilter: string;
  defaultFlowType?: 'w_cash' | 'w_credit';
  backUrl: string;
  /** Label for customer field */
  customerLabel?: string;
  /** Label for submit button */
  submitLabel?: string;
  /** Summary box title */
  summaryTitle?: string;
  /** Show warehouse picker */
  showWarehousePicker?: boolean;
  /** Callback after successful submit — receives API response data */
  onSubmitSuccess?: (data: any) => void | Promise<void>;
  /** Edit mode: existing order ID to load */
  orderId?: string;
}

// ── Component ──────────────────────────────────────────────

export default function DealerOrderForm({
  mode,
  customerTypeFilter,
  defaultFlowType,
  backUrl,
  customerLabel = 'ลูกค้า',
  submitLabel,
  summaryTitle,
  showWarehousePicker = false,
  onSubmitSuccess,
  orderId,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const latestCustomerIdRef = useRef('');

  const isConsignment = mode === 'consignment' || mode === 'dept_consignment';
  const isDepartment = mode === 'department';
  const isWholesale = mode === 'wholesale';
  const isEditMode = !!orderId;

  // Edit mode state
  const [orderNumber, setOrderNumber] = useState('');
  const [orderStatus, setOrderStatus] = useState('new');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [loadingOrder, setLoadingOrder] = useState(!!orderId);

  // Customer
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [gpContext, setGpContext] = useState<GpResolverContext | null>(null);
  const [loadingGp, setLoadingGp] = useState(false);
  const [flowType, setFlowType] = useState<'w_cash' | 'w_credit'>(defaultFlowType || 'w_cash');

  // Customer prefill hook (delivery + tax + addresses)
  const customerPrefill = useCustomerPrefill();
  const { shippingAddresses, selectedAddressId, delivery: deliveryFields, taxFields: taxFieldsState } = customerPrefill;
  const { deliveryName, deliveryPhone, deliveryEmail, deliveryAddress, deliveryDistrict, deliveryAmphoe, deliveryProvince, deliveryPostalCode } = deliveryFields;
  const { taxName, taxTaxId, taxBranch, taxAddress } = taxFieldsState;
  const { setTaxName, setTaxTaxId, setTaxBranch, setTaxAddress, setShippingAddresses, setSelectedAddressId } = customerPrefill;
  const { setDeliveryName, setDeliveryPhone, setDeliveryEmail, setDeliveryAddress, setDeliveryDistrict, setDeliveryAmphoe, setDeliveryProvince, setDeliveryPostalCode } = customerPrefill;

  // Tax invoice
  const [taxInvoiceRequested, setTaxInvoiceRequested] = useState(false);

  // Products
  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Summary
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState<'percent' | 'amount'>('amount');
  const [shippingFee, setShippingFee] = useState(0);

  // Warehouse picker
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');

  // Consignment-specific: period picker + dealer stock
  const now = new Date();
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [dealerStockMap, setDealerStockMap] = useState<Record<string, number>>({});

  // VAT status
  const vatRegistered = isDepartment ? true : (currentCompany?.vat_registered ?? false);

  // Fetch warehouses
  useEffect(() => {
    if (!showWarehousePicker) return;
    apiFetch('/api/warehouses')
      .then(r => r.json())
      .then(d => {
        const whs = d.warehouses || [];
        setWarehouses(whs);
        if (!isEditMode) {
          const def = whs.find((w: any) => w.is_default) || whs[0];
          if (def) setSelectedWarehouseId(def.id);
        }
      })
      .catch(() => {});
  }, [showWarehousePicker]);

  // Fetch customers (skip in edit mode — customer already loaded from order)
  useEffect(() => {
    if (isEditMode) return;
    apiFetch(`/api/customers?active=true&type=${customerTypeFilter}`)
      .then(r => r.json())
      .then(d => setCustomers(d.data || d.customers || []))
      .catch(() => {});
  }, [customerTypeFilter, isEditMode]);

  // Fetch products (skip in read-only edit mode)
  useEffect(() => {
    if (isEditMode && isReadOnly) { setLoadingProducts(false); return; }
    setLoadingProducts(true);
    apiFetch('/api/products?limit=999&active=true')
      .then(r => r.json())
      .then(result => {
        const flat: ProductSearchItem[] = [];
        for (const p of result.products || []) {
          for (const v of p.variations || []) {
            const vid = v.variation_id || v.id;
            if (!vid) continue;
            flat.push({
              id: vid,
              product_id: p.product_id || p.id,
              code: p.code || v.sku || '',
              name: p.name,
              variation_label: v.variation_label,
              sku: v.sku,
              default_price: v.default_price || 0,
              discount_price: v.discount_price || 0,
              brand_id: p.brand_id || null,
              image: v.image_url || ((p.variations?.length || 0) <= 1 ? (p.main_image_url || p.image) : null) || null,
            });
          }
        }
        setProducts(flat);
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  // Consignment: load dealer inventory when customer changes
  useEffect(() => {
    if (!isConsignment || !selectedCustomerId) { setDealerStockMap({}); return; }
    apiFetch(`/api/inventory?dealer_id=${selectedCustomerId}&limit=9999`)
      .then(r => r.json())
      .then(d => {
        const map: Record<string, number> = {};
        for (const i of d.items || []) {
          const b = i.consign_breakdown?.find((x: { customer_id: string }) => x.customer_id === selectedCustomerId);
          if (b && b.qty > 0) map[i.variation_id] = b.qty;
        }
        setDealerStockMap(map);
      })
      .catch(() => setDealerStockMap({}));
  }, [isConsignment, selectedCustomerId]);

  // Reuse from hook
  const { fillDeliveryFromAddress } = customerPrefill;
  const resetForm = useCallback(() => {
    customerPrefill.clearPrefill();
    setTaxInvoiceRequested(false);
  }, [customerPrefill]);

  // Load existing order for edit mode
  const orderLoaded = useRef(false);
  useEffect(() => {
    if (!orderId || orderLoaded.current) return;
    orderLoaded.current = true;
    setLoadingOrder(true);

    (async () => {
      try {
        const apiUrl = isDepartment ? `/api/department-orders/${orderId}` : `/api/orders/${orderId}`;
        const res = await apiFetch(apiUrl);
        if (!res.ok) throw new Error('Order not found');
        const data = await res.json();
        const order = data.order;
        const orderItems = order.items || [];

        let gpCtx: GpResolverContext | null = null;
        let productMap: Record<string, { default_price: number; discount_price: number; brand_id: string | null }> = {};

        setOrderNumber(isDepartment ? order.department_order_number : order.order_number);
        setOrderStatus(isDepartment ? order.status : order.order_status);
        setPaymentStatus(isDepartment ? 'paid' : order.payment_status);
        setNotes(order.notes || '');
        setInternalNotes(order.internal_notes || '');
        setShippingFee(parseFloat(order.shipping_fee) || 0);
        const discType = order.order_discount_type || 'amount';
        setOrderDiscountType(discType);
        setOrderDiscount(parseFloat(order.discount_amount) || 0);
        if (order.warehouse_id) setSelectedWarehouseId(order.warehouse_id);

        // Set customer
        if (order.customer) {
          const cust: Customer = {
            id: order.customer.id,
            name: order.customer.name,
            phone: order.customer.phone,
            email: order.customer.email || null,
            contact_person: order.customer.contact_person || null,
            customer_type: order.customer.customer_type,
            sale_type: null,
            customer_code: order.customer.customer_code,
          };
          setSelectedCustomerId(cust.id);
          setSelectedCustomer(cust);
          latestCustomerIdRef.current = cust.id;

          if (order.flow_type === 'w_credit') setFlowType('w_credit');
          else if (order.flow_type === 'w_cash') setFlowType('w_cash');

          // Single RPC: GP context + addresses + tax + delivery prefill
          try {
            const ctx = await customerPrefill.prefillCustomer(cust.id);
            if (ctx) {
              gpCtx = ctx.gpContext;
              setGpContext(gpCtx);
              // Override address selection if order has specific shipping_address_id
              if (order.shipping_address_id) {
                const addr = ctx.shippingAddresses.find(a => a.id === order.shipping_address_id);
                if (addr) {
                  customerPrefill.setSelectedAddressId(order.shipping_address_id);
                  customerPrefill.fillDeliveryFromAddress(addr, cust);
                }
              }
              setSelectedCustomer(prev => prev ? {
                ...prev,
                billing_address: ctx.customer.billing_address || null,
                billing_district: ctx.customer.billing_district || null,
                billing_amphoe: ctx.customer.billing_amphoe || null,
                billing_province: ctx.customer.billing_province || null,
                billing_postal_code: ctx.customer.billing_postal_code || null,
                tax_company_name: ctx.customer.tax_company_name || null,
                tax_id: ctx.customer.tax_id || null,
                tax_branch: ctx.customer.tax_branch || null,
              } : prev);
            }
          } catch { /* ignore */ }

          // Fetch product default prices for GP recalc
          if (gpCtx && orderItems.length > 0) {
            try {
              const prodRes = await apiFetch('/api/products?limit=999&active=true');
              if (prodRes.ok) {
                const prodData = await prodRes.json();
                for (const p of prodData.products || []) {
                  for (const v of p.variations || []) {
                    const vid = v.variation_id || v.id;
                    if (vid) productMap[vid] = { default_price: v.default_price || 0, discount_price: v.discount_price || 0, brand_id: p.brand_id || null };
                  }
                }
              }
            } catch { /* ignore */ }
          }
        }

        // Set items — recalculate GP from gpContext + product prices
        if (orderItems.length > 0) {
          setItems(orderItems.map((i: any) => {
            const unitPrice = parseFloat(i.unit_price) || 0;
            const prod = productMap[i.variation_id];

            // If we have GP context + product data → resolve GP properly
            if (gpCtx && prod) {
              const resolution = resolveGp(gpCtx, {
                brand_id: prod.brand_id,
                default_price: prod.default_price,
                discount_price: prod.discount_price,
              });
              return {
                variation_id: i.variation_id,
                product_id: i.product_id,
                product_name: i.product_name,
                variation_label: i.variation_label || null,
                sku: i.sku || null,
                quantity: i.quantity,
                original_price: resolution.base_price,
                discount_rate: resolution.gp_rate,
                unit_price: resolution.unit_price,
                gp_level: resolution.gp_level,
                brand_id: prod.brand_id,
                image: i.image || null,
                default_price: prod.default_price,
                discount_price: prod.discount_price,
                gp_base_price: resolution.gp_base_price,
              };
            }

            // Fallback: use saved unit_price as-is
            return {
              variation_id: i.variation_id,
              product_id: i.product_id,
              product_name: i.product_name,
              variation_label: i.variation_label || null,
              sku: i.sku || null,
              quantity: i.quantity,
              original_price: unitPrice,
              discount_rate: 0,
              unit_price: unitPrice,
              gp_level: 4,
              brand_id: null,
              image: i.image || null,
              default_price: unitPrice,
              discount_price: 0,
              gp_base_price: 'retail' as const,
            };
          }));
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้', 'error');
      } finally {
        setLoadingOrder(false);
      }
    })();
  }, [orderId, fillDeliveryFromAddress, showToast]);

  // GP context + address when customer changes
  const handleCustomerChange = useCallback(async (custId: string) => {
    setSelectedCustomerId(custId);
    latestCustomerIdRef.current = custId;
    const cust = customers.find(c => c.id === custId) || null;
    setSelectedCustomer(cust);
    setItems([]);

    if (isWholesale) {
      if (cust?.sale_type === 'wholesale_credit') setFlowType('w_credit');
      else if (cust?.sale_type === 'wholesale_cash') setFlowType('w_cash');
      else if (defaultFlowType) setFlowType(defaultFlowType);
    }

    resetForm();

    if (custId) {
      setLoadingGp(true);
      try {
        const ctx = await customerPrefill.prefillCustomer(custId);
        if (latestCustomerIdRef.current !== custId) return;
        if (ctx) {
          setGpContext(ctx.gpContext);
          setSelectedCustomer(prev => prev ? {
            ...prev,
            billing_address: ctx.customer.billing_address || null,
            billing_district: ctx.customer.billing_district || null,
            billing_amphoe: ctx.customer.billing_amphoe || null,
            billing_province: ctx.customer.billing_province || null,
            billing_postal_code: ctx.customer.billing_postal_code || null,
            tax_company_name: ctx.customer.tax_company_name || null,
            tax_id: ctx.customer.tax_id || null,
            tax_branch: ctx.customer.tax_branch || null,
          } : prev);
        }
      } catch { setGpContext(null); }
      finally { setLoadingGp(false); }
    } else {
      setGpContext(null);
    }
  }, [customers, defaultFlowType, fillDeliveryFromAddress, isWholesale, resetForm]);

  // Add product
  const handleAddProduct = (p: ProductSearchItem) => {
    if (!p.id) return;
    const existingIdx = items.findIndex(i => i.variation_id === p.id);
    if (existingIdx >= 0) {
      setItems(prev => prev.map((i, idx) =>
        idx === existingIdx ? { ...i, quantity: i.quantity + 1 } : i
      ));
      return;
    }

    const resolution = gpContext ? resolveGp(gpContext, {
      brand_id: p.brand_id || null,
      default_price: p.default_price || 0,
      discount_price: p.discount_price || 0,
    }) : null;

    setItems(prev => [...prev, {
      variation_id: p.id,
      product_id: p.product_id,
      product_name: p.name,
      variation_label: p.variation_label || null,
      sku: p.sku || null,
      quantity: 1,
      original_price: resolution?.base_price || p.default_price || 0,
      discount_rate: resolution?.gp_rate || 0,
      unit_price: resolution?.unit_price || p.default_price || 0,
      gp_level: resolution?.gp_level || 4,
      brand_id: p.brand_id || null,
      image: p.image || null,
      default_price: p.default_price || 0,
      discount_price: p.discount_price || 0,
      gp_base_price: resolution?.gp_base_price || 'retail',
    }]);
  };

  const updateItem = (idx: number, field: string, value: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'discount_rate') {
        updated.unit_price = Math.round(updated.original_price * (1 - value / 100) * 100) / 100;
      }
      if (field === 'original_price') {
        updated.unit_price = Math.round(value * (1 - updated.discount_rate / 100) * 100) / 100;
      }
      return updated;
    }));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  // GP info text for each item
  const gpInfoText = (item: OrderItem) => {
    if (!item.discount_rate) return null;
    const baseLabel = item.gp_base_price === 'discounted' ? 'ลด' : 'ปลีก';
    const basePrice = item.gp_base_price === 'discounted' && item.discount_price > 0 ? item.discount_price : item.default_price;
    const prefix = isConsignment ? 'GP' : '';
    if (item.discount_type === 'amount') {
      return `฿${formatNumber(basePrice)}(${baseLabel}) - ฿${formatNumber(item.discount_rate)} = ฿${formatNumber(item.unit_price)}`;
    }
    return `฿${formatNumber(basePrice)}(${baseLabel}) - ${prefix}${formatNumber(item.discount_rate)}% = ฿${formatNumber(item.unit_price)}`;
  };

  // Available products (consignment: filter by dealer stock)
  const availableProducts = isConsignment && selectedCustomerId
    ? products.filter(p => (dealerStockMap[p.id] ?? 0) > 0)
    : products;

  // Totals
  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const hasProducts = items.length > 0;

  // Columns for ItemsTable
  const tableColumns: ('stock_dest' | 'qty' | 'unit_price' | 'discount' | 'total')[] = isConsignment
    ? ['stock_dest', 'qty', 'unit_price', 'discount', 'total']
    : ['qty', 'unit_price', 'discount', 'total'];

  // ── Submit ──────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!selectedCustomerId) { showToast(`กรุณาเลือก${customerLabel}`, 'error'); return; }
    if (items.length === 0) { showToast('กรุณาเพิ่มสินค้า', 'error'); return; }

    setSubmitting(true);
    try {
      let responseData: any;

      if (isConsignment) {
        // ── Consignment / Dept-consignment report ──
        const apiUrl = mode === 'dept_consignment' ? '/api/department-store/reports' : '/api/consignment/reports';
        const res = await apiFetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: selectedCustomerId,
            period_year: periodYear,
            period_month: periodMonth,
            ...(mode === 'consignment' ? { source: 'admin' } : {}),
            notes,
            items: items.map(i => ({
              variation_id: i.variation_id,
              qty_sold: i.quantity,
              qty_returned: 0,
              unit_price: i.unit_price,
              gp_rate: i.discount_rate,
            })),
          }),
        });
        responseData = await res.json();
        if (!res.ok) throw new Error(responseData.error || 'Failed');

        if (responseData.statement_number) {
          showToast(`สร้างรายงาน ${responseData.report_number} + ใบวางบิล ${responseData.statement_number} สำเร็จ`, 'success');
        } else {
          showToast(`สร้างรายงาน ${responseData.report_number} สำเร็จ`, 'success');
        }

      } else if (isDepartment) {
        // ── Department order ──
        const res = await apiFetch('/api/department-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: selectedCustomerId,
            warehouse_id: selectedWarehouseId || null,
            notes,
            internal_notes: internalNotes,
            items: items.map(i => ({
              product_id: i.product_id,
              variation_id: i.variation_id || null,
              product_name: i.product_name,
              variation_label: i.variation_label,
              sku: i.sku,
              image: i.image,
              quantity: i.quantity,
              unit_price: i.unit_price,
            })),
            discount_amount: orderDiscountType === 'percent'
              ? subtotal * orderDiscount / 100
              : orderDiscount,
            discount_type: orderDiscountType,
            discount_value: orderDiscount,
          }),
        });
        responseData = await res.json();
        if (!res.ok) throw new Error(responseData.error || 'Failed');
        showToast(`สร้างใบส่งห้าง ${responseData.department_order_number} สำเร็จ`, 'success');

      } else {
        // ── Wholesale order ──
        // Save or update shipping address
        let addrId = selectedAddressId;

        if (selectedAddressId === 'new' || !selectedAddressId) {
          const createRes = await apiFetch('/api/shipping-addresses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: selectedCustomerId,
              address_name: deliveryName || 'ที่อยู่หลัก',
              contact_person: deliveryName,
              phone: deliveryPhone,
              address_line1: deliveryAddress,
              district: deliveryDistrict,
              amphoe: deliveryAmphoe,
              province: deliveryProvince,
              postal_code: deliveryPostalCode,
              is_default: shippingAddresses.length === 0,
            }),
          });
          if (createRes.ok) {
            const created = await createRes.json();
            addrId = (created.address || created).id;
          } else {
            throw new Error('ไม่สามารถสร้างที่อยู่จัดส่งได้');
          }
        } else {
          await apiFetch(`/api/shipping-addresses/${addrId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contact_person: deliveryName,
              phone: deliveryPhone,
              address_line1: deliveryAddress,
              district: deliveryDistrict,
              amphoe: deliveryAmphoe,
              province: deliveryProvince,
              postal_code: deliveryPostalCode,
            }),
          });
        }

        const res = await apiFetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: selectedCustomerId,
            source: 'manual',
            warehouse_id: selectedWarehouseId || undefined,
            notes,
            internal_notes: internalNotes || undefined,
            discount_amount: orderDiscountType === 'amount' ? orderDiscount : undefined,
            discount_percent: orderDiscountType === 'percent' ? orderDiscount : undefined,
            tax_invoice_requested: (vatRegistered || taxInvoiceRequested) || undefined,
            tax_company_name: (vatRegistered || taxInvoiceRequested) ? taxName : undefined,
            tax_id: (vatRegistered || taxInvoiceRequested) ? taxTaxId : undefined,
            tax_branch: (vatRegistered || taxInvoiceRequested) ? taxBranch : undefined,
            tax_address: (vatRegistered || taxInvoiceRequested) ? taxAddress : undefined,
            shipping_address_id: addrId,
            items: items.map(i => ({
              variation_id: i.variation_id,
              product_id: i.product_id,
              product_name: i.product_name,
              variation_label: i.variation_label,
              sku: i.sku,
              quantity: i.quantity,
              unit_price: i.unit_price,
              shipments: [{ shipping_address_id: addrId, quantity: i.quantity }],
            })),
          }),
        });
        responseData = await res.json();
        if (!res.ok) throw new Error(responseData.error || 'Failed');
        showToast(`สร้างคำสั่งซื้อ ${responseData.order_number} สำเร็จ`, 'success');
      }

      // Callback for post-submit actions (e.g. auto-print PDF)
      if (onSubmitSuccess) {
        await onSubmitSuccess(responseData);
      }

      router.push(backUrl);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived labels ──────────────────────────────────────────

  const resolvedSubmitLabel = submitLabel || (
    isEditMode
      ? 'บันทึกการแก้ไข'
      : isConsignment ? 'บันทึกรายงาน' : isDepartment ? 'สร้างใบส่งห้าง' : 'สร้างคำสั่งซื้อ'
  );
  const resolvedSummaryTitle = summaryTitle || (
    isConsignment ? 'สรุปยอดขาย' : isDepartment ? 'สรุปใบส่งห้าง' : 'สรุปคำสั่งซื้อ'
  );

  // ── Edit mode: status actions ──────────────────────────────

  const deptReadOnlyStatuses = ['shipped', 'pending_confirm', 'received', 'partial_received', 'cancelled'];
  const isReadOnly = isEditMode && (isDepartment
    ? deptReadOnlyStatuses.includes(orderStatus)
    : ['processing', 'completed', 'cancelled'].includes(orderStatus));

  // ── Render ──────────────────────────────────────────────────

  if (loadingOrder) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Edit mode: Status header + Actions (not for department — handled by page wrapper) */}
      {isEditMode && orderId && !isDepartment && (
        <>
          <OrderStatusBar
            orderId={orderId}
            orderNumber={orderNumber}
            orderStatus={orderStatus}
            paymentStatus={paymentStatus}
            backUrl={backUrl}
            onStatusChange={setOrderStatus}
          />
          <OrderPrintButtons
            orderId={orderId}
            orderNumber={orderNumber}
            orderStatus={orderStatus}
            flowType={flowType}
          />
        </>
      )}

      {/* Consignment: Period Picker */}
      {isConsignment && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-500 dark:text-slate-400">งวด:</span>
          <div className="w-56">
            <MonthYearPicker
              month={periodMonth}
              year={periodYear}
              onChange={(m, y) => { setPeriodMonth(m); setPeriodYear(y); }}
            />
          </div>
        </div>
      )}

      {/* Warehouse Picker */}
      {showWarehousePicker && warehouses.length > 0 && (
        <div className="inline-block min-w-[160px]">
          <FormSelect
            value={selectedWarehouseId}
            onChange={setSelectedWarehouseId}
            options={warehouses.map(w => ({
              id: w.id,
              label: `${w.is_default ? '⭐ ' : ''}${w.name}`,
            }))}
            icon={<Warehouse className="w-4 h-4" />}
            placeholder="-- เลือกคลัง --"
            searchThreshold={99}
          />
        </div>
      )}

      {/* Customer + Delivery section */}
      <CustomerSelectionCard
        customerLabel={customerLabel}
        customers={customers}
        selectedCustomer={selectedCustomer}
        selectedCustomerId={selectedCustomerId}
        onCustomerChange={handleCustomerChange}
        onCustomerClear={() => {
          setSelectedCustomerId(''); setSelectedCustomer(null); setGpContext(null); setItems([]);
          latestCustomerIdRef.current = '';
          resetForm();
        }}
        loading={loadingGp}
        badge={isWholesale ? (
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${flowType === 'w_credit' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
            {flowType === 'w_credit' ? 'เครดิต' : 'เงินสด'}
          </span>
        ) : undefined}
        disabled={isReadOnly}
        delivery={deliveryFields}
        onDeliveryChange={customerPrefill.handleDeliveryChange}
        shippingAddresses={shippingAddresses}
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
      />

      {/* 2-column: Products+Notes (left) + Summary (right) */}
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-1 basis-[400px] min-w-0 space-y-4">

          {/* Products Section */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-visible">
            <ItemsTable
              items={items.map((i): TableItem => ({
                variation_id: i.variation_id,
                product_id: i.product_id,
                product_name: i.product_name,
                variation_label: i.variation_label,
                sku: i.sku,
                image: i.image,
                quantity: i.quantity,
                unit_price: i.original_price,
                discount_value: i.discount_rate,
                discount_type: (i.discount_type || 'percent') as 'percent' | 'amount',
                gpInfo: gpInfoText(i),
                stock_dest: isConsignment ? (dealerStockMap[i.variation_id] ?? 0) : undefined,
              }))}
              columns={tableColumns}
              products={availableProducts}
              loadingProducts={loadingProducts}
              inputRef={searchInputRef}
              searchPlaceholder="+ เพิ่มสินค้า — พิมพ์ชื่อหรือรหัส..."
              stockMap={isConsignment ? dealerStockMap : undefined}
              showStockInSearch={isConsignment}
              disableOutOfStock={isConsignment}
              disableDestWarning={isConsignment || isDepartment}
              onAdd={isReadOnly ? undefined : handleAddProduct}
              searchDisabledMessage={isReadOnly ? undefined : (loadingGp ? 'กำลังโหลดข้อมูลราคา...' : (!selectedCustomerId ? `กรุณาเลือก${customerLabel}ก่อน` : undefined))}
              onUpdateField={isReadOnly ? undefined : (idx, field, value) => {
                if (field === 'quantity') updateItem(idx, 'quantity', value as number);
                if (field === 'unit_price') updateItem(idx, 'original_price', value as number);
                if (field === 'discount_value') {
                  const item = items[idx];
                  setItems(prev => prev.map((it, i) => {
                    if (i !== idx) return it;
                    const v = value as number;
                    const updated = { ...it, discount_rate: v };
                    if (it.discount_type === 'amount') {
                      // THB discount: unit_price = original_price - discount_value
                      updated.unit_price = Math.max(0, Math.round((it.original_price - v) * 100) / 100);
                    } else {
                      // % discount: unit_price = original_price * (1 - rate/100)
                      updated.unit_price = Math.round(it.original_price * (1 - v / 100) * 100) / 100;
                    }
                    return updated;
                  }));
                }
                if (field === 'discount_type') {
                  // Reset discount value when toggling type
                  setItems(prev => prev.map((it, i) => i === idx ? { ...it, discount_rate: 0, discount_type: value as 'percent' | 'amount', unit_price: it.original_price } : it));
                }
              }}
              onRemove={isReadOnly ? undefined : removeItem}
              emptyMessage="เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน"
              showSummary={false}
            />
          </div>

          {/* Notes */}
          {hasProducts && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <div className="space-y-3">
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
                  หมายเหตุ <span className="text-gray-400 dark:text-slate-500 font-normal">(แสดงในบิล / การจัดส่ง)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary text-base"
                  placeholder="หมายเหตุสำหรับลูกค้า, การจัดส่ง..."
                />
              </div>
              <div>
                <label className="block text-base font-medium text-orange-700 dark:text-orange-400 mb-1">
                  หมายเหตุภายใน <span className="text-orange-400 dark:text-orange-500 font-normal">(ไม่แสดงในบิล)</span>
                </label>
                <textarea
                  value={internalNotes}
                  onChange={e => setInternalNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-orange-300 dark:border-orange-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-base bg-orange-50 dark:bg-orange-900/20 text-gray-900 dark:text-slate-200"
                  placeholder="หมายเหตุภายใน..."
                />
              </div>
            </div>
          </div>
          )}

        </div>{/* End left column */}

        {/* Order Summary — right column */}
        {hasProducts && (
          <div className="w-full lg:w-[340px] flex-shrink-0 lg:sticky lg:top-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <OrderSummaryBox
                title={resolvedSummaryTitle}
                subtotalAmount={subtotal}
                vatRegistered={vatRegistered}
                shippingFee={!isConsignment ? shippingFee : undefined}
                onShippingChange={!isConsignment ? setShippingFee : undefined}
                discountValue={orderDiscount}
                discountType={orderDiscountType}
                onDiscountChange={setOrderDiscount}
                onDiscountTypeToggle={() => { setOrderDiscountType(orderDiscountType === 'percent' ? 'amount' : 'percent'); setOrderDiscount(0); }}
              />
            </div>
          </div>
        )}
      </div>{/* End 2-column wrapper */}

      {/* Action Buttons — show for create mode and editable orders */}
      {hasProducts && !isReadOnly && (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push(backUrl)}
            className="px-5 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-sm font-medium"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !selectedCustomerId || items.length === 0}
            className="bg-primary text-white px-5 py-2 rounded-lg hover:bg-primary-hover transition-colors flex items-center gap-2 disabled:opacity-50 text-sm font-medium"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {resolvedSubmitLabel}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
