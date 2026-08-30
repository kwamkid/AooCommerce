'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useCopy } from '@/lib/useCopy';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import SearchInput from '@/components/ui/SearchInput';
import FormSelect from '@/components/ui/FormSelect';
import ActionMenu, { ActionItem } from '@/components/ui/ActionMenu';
import { getBadgeColor } from '@/lib/status-tab-colors';
import StatusTabs from '@/components/ui/StatusTabs';
import ShipModal, { type ShipResult } from '@/components/ui/ShipModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  Building2, Plus, Loader2, RefreshCw,
  Package, Truck, CheckCircle2,
  Send, Copy, UserPlus, Ban, Trash2,
  ClipboardList, FileText, Printer, X,
} from 'lucide-react';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import Tooltip from '@/components/ui/Tooltip';
import DataTable from '@/components/ui/DataTable';
import { showPdfPreview, mergePdfBlobs } from '@/lib/print-pdf';
import { LoadingCard } from '@/components/ui/StateCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { splitVatInclusive } from '@/lib/order-totals';

interface DeptOrder {
  id: string;
  department_order_number: string;
  status: string;
  total_amount: number;
  confirmed_total?: number | null;
  shipping_method?: string | null;
  shipping_carrier?: string | null;
  tracking_number?: string | null;
  receive_token?: string | null;
  receiver_name?: string | null;
  receive_photo_url?: string | null;
  printed_packing_at?: string | null;
  printed_dn_at?: string | null;
  printed_label_at?: string | null;
  tax_invoice_number?: string | null;
  created_at: string;
  shipped_at?: string | null;
  received_at?: string | null;
  warehouse_id?: string | null;
  customer: { id: string; name: string; customer_code: string | null; phone?: string | null } | null;
  created_by_profile?: { id: string; name: string } | null;
  items?: { id: string }[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'ที่ต้องจัดส่ง', ...getBadgeColor('draft') },
  shipped: { label: 'กำลังส่ง', ...getBadgeColor('shipped') },
  pending_confirm: { label: 'รอยืนยัน', ...getBadgeColor('pending_confirm') },
  received: { label: 'รับครบแล้ว', ...getBadgeColor('completed') },
  partial_received: { label: 'รับไม่ครบ', ...getBadgeColor('partial_received') },
  cancelled: { label: 'ยกเลิก', ...getBadgeColor('cancelled') },
};

const STATUS_TABS = [
  { key: 'all',             label: 'ทั้งหมด' },
  { key: 'draft',           label: 'ที่ต้องจัดส่ง', colorKey: 'pending' },
  { key: 'shipped',         label: 'กำลังส่ง' },
  { key: 'pending_confirm', label: 'รอยืนยัน', tooltip: 'ผู้รับแจ้งรับของแล้ว — รอ admin ยืนยัน' },
  { key: 'received',        label: 'รับแล้ว', colorKey: 'completed' },
  { key: 'cancelled',       label: 'ยกเลิก' },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function isPrintedDoc(r: DeptOrder, key: string): boolean {
  if (key === 'packing') return !!r.printed_packing_at;
  if (key === 'label') return !!r.printed_label_at;
  if (key === 'dn') return !!r.printed_dn_at;
  return false;
}

function DepartmentOrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const copy = useCopy();

  // URL-based state
  const activeStatus = searchParams.get('status') || 'all';
  const search = searchParams.get('q') || '';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const recordsPerPage = parseInt(searchParams.get('limit') || '20', 10);

  const setParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    let pageReset = false;
    for (const [k, v] of Object.entries(updates)) {
      if (k !== 'page') pageReset = true;
      if (!v || v === 'all' || v === '' || v === '1' || v === '20') {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    }
    if (pageReset) params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '/department-orders', { scroll: false });
  }, [searchParams, router]);

  const [orders, setOrders] = useState<DeptOrder[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Ship modal
  const [shipModalId, setShipModalId] = useState<string | null>(null);
  const shipModalOrder = orders.find(o => o.id === shipModalId);

  // Edit shipping modal
  const [editShipModalId, setEditShipModalId] = useState<string | null>(null);
  const editShipOrder = orders.find(o => o.id === editShipModalId);

  // Cancel confirm
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Void confirm
  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidSubmitting, setVoidSubmitting] = useState(false);

  // Printing state
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printingType, setPrintingType] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOverlay, setBulkOverlay] = useState<{ show: boolean; message: string; progress: number }>({ show: false, message: '', progress: 0 });
  const isDraftTab = activeStatus === 'draft';

  // Clear selection on tab change
  useEffect(() => { setSelectedIds(new Set()); }, [activeStatus]);

  const handleBulkPrint = async (ids: string[], type: 'packing' | 'label') => {
    if (!ids.length) return;
    const label = type === 'packing' ? 'ใบจัดของ' : 'ใบปะหน้า';
    setBulkOverlay({ show: true, message: `กำลังโหลดข้อมูล... (0/${ids.length})`, progress: 5 });
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allOrders: any[] = [];
      for (let i = 0; i < ids.length; i++) {
        setBulkOverlay({ show: true, message: `กำลังโหลดข้อมูล... (${i + 1}/${ids.length})`, progress: Math.round(((i + 1) / ids.length) * 60) });
        try {
          const order = await fetchOrderForPdf(ids[i]);
          if (order) allOrders.push(order);
        } catch { /* skip */ }
      }
      if (!allOrders.length) { showToast('ไม่สามารถโหลดข้อมูลได้', 'error'); return; }

      setBulkOverlay({ show: true, message: `กำลังสร้าง${label}...`, progress: 75 });
      if (type === 'packing') {
        const { generatePackingPdf } = await import('@/lib/orders-packing-pdf');
        const packingData = allOrders.map(order => ({
          order_number: order.department_order_number,
          created_at: order.created_at,
          customer: order.customer ? { name: order.customer.name, phone: order.customer.phone } : null,
          delivery_name: order.customer?.name || '',
          delivery_phone: order.customer?.phone || '',
          delivery_address: [order.customer?.billing_address, order.customer?.billing_district, order.customer?.billing_amphoe, order.customer?.billing_province, order.customer?.billing_postal_code].filter(Boolean).join(' '),
          notes: order.notes || '',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: (order.items || []).map((i: any) => ({ product_name: i.product_name, variation_label: i.variation_label, quantity: i.quantity, image: i.image || null, barcode: i.barcode || null, sku: i.sku || null })),
        }));
        const blob = await generatePackingPdf(packingData);
        showPdfPreview(blob, `${label} ${allOrders.length} รายการ`);
      } else {
        const { generateReplenishmentLabelPdf } = await import('@/lib/order-shipping-label-pdf');
        const blobs: Blob[] = [];
        for (const order of allOrders) {
          try {
            blobs.push(await generateReplenishmentLabelPdf({ data: {
              order_number: order.department_order_number,
              created_at: order.created_at,
              shipping_carrier: order.shipping_carrier || '',
              tracking_number: order.tracking_number || '',
              delivery_name: order.customer?.name || '',
              delivery_phone: order.customer?.phone || '',
              delivery_address: order.customer?.billing_address || '',
              delivery_district: order.customer?.billing_district || '',
              delivery_amphoe: order.customer?.billing_amphoe || '',
              delivery_province: order.customer?.billing_province || '',
              delivery_postal_code: order.customer?.billing_postal_code || '',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              items: (order.items || []).map((i: any) => ({ product_name: i.product_name, variation_label: i.variation_label, quantity: i.quantity })),
            } }));
          } catch { /* skip */ }
        }
        if (!blobs.length) { showToast('ไม่สามารถสร้างเอกสารได้', 'error'); return; }
        setBulkOverlay({ show: true, message: 'กำลังรวมเอกสาร...', progress: 90 });
        const merged = blobs.length === 1 ? blobs[0] : await mergePdfBlobs(blobs);
        showPdfPreview(merged, `${label} ${allOrders.length} รายการ`);
      }
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
    finally { setBulkOverlay({ show: false, message: '', progress: 0 }); }
  };

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true); else setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(recordsPerPage),
      });
      if (activeStatus !== 'all') params.set('status', activeStatus);
      if (search) params.set('search', search);

      const res = await apiFetch(`/api/department-orders?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setOrders(data.orders || []);
      setTotalRecords(data.pagination?.total || 0);
      setTotalPages(data.pagination?.totalPages || 0);
      setStatusCounts(data.status_counts || {});
    } catch {
      showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeStatus, search, currentPage, recordsPerPage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatusChange = (s: string) => setParams({ status: s });

  // Debounced search
  const [searchInput, setSearchInput] = useState(search);
  const debouncedSetSearch = useDebouncedCallback((val: string) => setParams({ q: val }));
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    debouncedSetSearch(val);
  };
  useEffect(() => { setSearchInput(search); }, [search]);

  const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const getTabCount = (key: string) => {
    if (key === 'all') return totalCount;
    if (key === 'received') return (statusCounts['received'] || 0) + (statusCounts['partial_received'] || 0);
    return statusCounts[key] || 0;
  };

  // === Ship action ===
  const handleShip = async (result: ShipResult) => {
    if (!shipModalId) return;
    const shippedId = shipModalId;
    try {
      const res = await apiFetch(`/api/department-orders/${shippedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ship',
          shipping_method: result.method,
          shipping_carrier: result.carrier,
          tracking_number: result.tracking,
          notes: result.notes || null,
        }),
      });
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || 'Failed');
      }
      const data = await res.json();
      const dnNum = data.dn_number;
      const taxNum = data.tax_invoice_number;
      const docNums = [dnNum, taxNum].filter(Boolean);
      if (docNums.length > 0) {
        showToast(`จัดส่งเรียบร้อย + ออกเอกสาร ${docNums.join(' + ')}`, 'success');
      } else {
        showToast('จัดส่งเรียบร้อย', 'success');
      }
      setShipModalId(null);
      fetchData(true);

      // Auto print TAX + DN after ship (d_consign flow)
      try {
        const order = await fetchOrderForPdf(shippedId);
        const blobs: Blob[] = [];

        // 1. TAX Invoice (tax_only)
        if (taxNum) {
          const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
          const taxData = buildTaxInvoiceData(order);
          taxData.tax_invoice_number = taxNum; // use freshly issued number
          const taxBlob = await generateFullInvoicePdf(taxData);
          blobs.push(taxBlob);
        }

        // 2. DN (ใบส่งสินค้า)
        if (dnNum) {
          const { generateReplenishmentPdf } = await import('@/lib/replenishment-pdf');
          const pdfData = {
            id: order.id,
            replenishment_number: order.department_order_number,
            status: order.status,
            notes: order.notes,
            created_at: order.created_at,
            receive_token: order.receive_token,
            total_amount: order.confirmed_total ?? order.total_amount,
            shipping_fee: 0,
            customer: order.customer ? {
              name: order.customer.name,
              customer_code: order.customer.customer_code,
              phone: order.customer.phone,
              billing_address: order.customer.billing_address,
              billing_district: order.customer.billing_district,
              billing_amphoe: order.customer.billing_amphoe,
              billing_province: order.customer.billing_province,
              billing_postal_code: order.customer.billing_postal_code,
            } : null,
            created_by_name: order.created_by_profile?.name,
            items: (order.items || []).map((i: any) => ({
              product_name: i.product_name,
              variation_label: i.variation_label,
              sku: i.sku || null,
              quantity: i.quantity,
              confirmed_quantity: i.confirmed_quantity,
              unit_price: i.unit_price || 0,
              image: i.image,
            })),
          };
          const dnBlob = await generateReplenishmentPdf({ data: pdfData });
          blobs.push(dnBlob);
        }

        if (blobs.length > 1) {
          const merged = await mergePdfBlobs(blobs);
          showPdfPreview(merged, `เอกสาร ${[taxNum, dnNum].filter(Boolean).join(' + ')}`);
        } else if (blobs.length === 1) {
          showPdfPreview(blobs[0], `เอกสาร ${taxNum || dnNum}`);
        }

        markPrintedAndUpdate(shippedId, 'dn');
      } catch (printErr) {
        console.error('Auto-print after ship failed:', printErr);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  // === Edit shipping ===
  const handleEditShipping = async (result: ShipResult) => {
    if (!editShipModalId) return;
    try {
      const res = await apiFetch(`/api/department-orders/${editShipModalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_shipping',
          shipping_method: result.method,
          shipping_carrier: result.carrier,
          tracking_number: result.tracking,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast('อัพเดทข้อมูลขนส่งแล้ว', 'success');
      setEditShipModalId(null);
      fetchData(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  // === Cancel action ===
  const handleCancel = async () => {
    if (!cancelId) return;
    setCancelSubmitting(true);
    try {
      const res = await apiFetch(`/api/department-orders/${cancelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || 'Failed');
      }
      showToast('ยกเลิกเรียบร้อย', 'success');
      setCancelId(null);
      fetchData(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setCancelSubmitting(false);
    }
  };

  // === Void action (shipped → draft) ===
  const handleVoid = async () => {
    if (!voidId) return;
    setVoidSubmitting(true);
    try {
      const res = await apiFetch(`/api/department-orders/${voidId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void' }),
      });
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || 'Failed');
      }
      showToast('Void เอกสารแล้ว — กลับเป็นที่ต้องจัดส่ง แก้ไขได้', 'success');
      setVoidId(null);
      fetchData(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setVoidSubmitting(false);
    }
  };

  // === Copy receive link ===
  const copyReceiveLink = (token: string) => {
    const url = `${window.location.origin}/department-orders/receive/${token}`;
    copy(url, 'ลิงก์รับของ')
  };

  // === Mark printed helper ===
  const markPrintedAndUpdate = async (orderId: string, docType: string) => {
    try {
      await apiFetch(`/api/department-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_printed', doc_type: docType }),
      });
      // Optimistic update
      setOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o;
        const colMap: Record<string, string> = { packing: 'printed_packing_at', label: 'printed_label_at', dn: 'printed_dn_at' };
        return { ...o, [colMap[docType]]: new Date().toISOString() };
      }));
    } catch { /* ignore */ }
  };

  // === Print functions (using replenishment PDF generators — same layout) ===
  const fetchOrderForPdf = async (orderId: string) => {
    const res = await apiFetch(`/api/department-orders/${orderId}`);
    if (!res.ok) throw new Error('Failed to fetch order');
    const { order } = await res.json();
    return order;
  };

  const handlePrintPacking = async (orderId: string) => {
    setPrintingId(orderId);
    setPrintingType('packing');
    try {
      const order = await fetchOrderForPdf(orderId);
      const { generatePackingPdf } = await import('@/lib/orders-packing-pdf');
      const blob = await generatePackingPdf([{
        order_number: order.department_order_number,
        created_at: order.created_at,
        customer: order.customer ? { name: order.customer.name, phone: order.customer.phone } : null,
        delivery_name: order.customer?.name || '',
        delivery_phone: order.customer?.phone || '',
        delivery_address: [
          order.customer?.billing_address,
          order.customer?.billing_district,
          order.customer?.billing_amphoe,
          order.customer?.billing_province,
          order.customer?.billing_postal_code,
        ].filter(Boolean).join(' '),
        notes: order.notes || '',
        items: (order.items || []).map((i: any) => ({
          product_name: i.product_name,
          variation_label: i.variation_label,
          quantity: i.quantity,
          image: i.image || null,
          barcode: i.barcode || null,
          sku: i.sku || null,
        })),
      }]);
      showPdfPreview(blob, 'ใบจัดของ');
      markPrintedAndUpdate(orderId, 'packing');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  const handlePrintLabel = async (orderId: string) => {
    setPrintingId(orderId);
    setPrintingType('label');
    try {
      const order = await fetchOrderForPdf(orderId);
      const { generateReplenishmentLabelPdf } = await import('@/lib/order-shipping-label-pdf');
      const labelData = {
        order_number: order.department_order_number,
        created_at: order.created_at,
        shipping_carrier: order.shipping_carrier || '',
        tracking_number: order.tracking_number || '',
        delivery_name: order.customer?.name || '',
        delivery_phone: order.customer?.phone || '',
        delivery_address: order.customer?.billing_address || '',
        delivery_district: order.customer?.billing_district || '',
        delivery_amphoe: order.customer?.billing_amphoe || '',
        delivery_province: order.customer?.billing_province || '',
        delivery_postal_code: order.customer?.billing_postal_code || '',
        items: (order.items || []).map((i: any) => ({
          product_name: i.product_name,
          variation_label: i.variation_label,
          quantity: i.quantity,
        })),
      };
      const blob = await generateReplenishmentLabelPdf({ data: labelData });
      showPdfPreview(blob, 'ใบปะหน้า');
      markPrintedAndUpdate(orderId, 'label');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  const handlePrintDN = async (orderId: string) => {
    setPrintingId(orderId);
    setPrintingType('dn');
    try {
      const order = await fetchOrderForPdf(orderId);
      const { generateReplenishmentPdf } = await import('@/lib/replenishment-pdf');
      const pdfData = {
        id: order.id,
        replenishment_number: order.department_order_number,
        status: order.status,
        notes: order.notes,
        created_at: order.created_at,
        receive_token: order.receive_token,
        total_amount: order.confirmed_total ?? order.total_amount,
        shipping_fee: 0,
        customer: order.customer ? {
          name: order.customer.name,
          customer_code: order.customer.customer_code,
          phone: order.customer.phone,
          billing_address: order.customer.billing_address,
          billing_district: order.customer.billing_district,
          billing_amphoe: order.customer.billing_amphoe,
          billing_province: order.customer.billing_province,
          billing_postal_code: order.customer.billing_postal_code,
        } : null,
        created_by_name: order.created_by_profile?.name,
        confirm_notes: order.internal_notes,
        items: (order.items || []).map((i: any) => ({
          product_name: i.product_name,
          variation_label: i.variation_label,
          sku: i.sku || null,
          quantity: i.quantity,
          confirmed_quantity: i.confirmed_quantity,
          unit_price: i.unit_price || 0,
          image: i.image,
        })),
      };
      const blob = await generateReplenishmentPdf({ data: pdfData });
      showPdfPreview(blob, `ใบส่งสินค้า ${order.department_order_number}`);
      markPrintedAndUpdate(orderId, 'dn');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  const buildTaxInvoiceData = (order: any) => {
    const hasConfirmed = (order.items || []).some((i: any) => i.confirmed_quantity != null && i.confirmed_quantity !== i.quantity);
    const items = (order.items || [])
      .filter((i: any) => {
        // If confirmed, exclude items with confirmed_quantity = 0
        if (hasConfirmed && i.confirmed_quantity != null && i.confirmed_quantity <= 0) return false;
        return true;
      })
      .map((i: any) => {
        const qty = hasConfirmed && i.confirmed_quantity != null ? i.confirmed_quantity : (i.quantity || 0);
        const lineTotal = qty * (i.unit_price || 0);
        return {
          product_name: i.product_name,
          variation_label: i.variation_label,
          quantity: qty,
          unit_price: i.unit_price || 0,
          subtotal: lineTotal,
          total: lineTotal,
        };
      });
    const totalAmount = order.confirmed_total ?? order.total_amount ?? 0;
    // dept store = VAT inclusive price → ถอด VAT ด้วยสูตรกลาง lib/order-totals.ts
    const { subtotal: subtotalBeforeVat, vatAmount } = splitVatInclusive(totalAmount, true);

    return {
      order_number: order.department_order_number,
      created_at: order.created_at,
      payment_status: 'paid',
      subtotal: subtotalBeforeVat,
      discount_amount: 0,
      shipping_fee: 0,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      notes: order.notes,
      customer: order.customer ? { name: order.customer.name, phone: order.customer.phone } : null,
      delivery_name: order.customer?.name,
      delivery_phone: order.customer?.phone,
      delivery_address: order.customer?.billing_address,
      delivery_district: order.customer?.billing_district,
      delivery_amphoe: order.customer?.billing_amphoe,
      delivery_province: order.customer?.billing_province,
      delivery_postal_code: order.customer?.billing_postal_code,
      tax_invoice_number: order.tax_invoice_number,
      tax_invoice_date: order.tax_invoice_date || new Date().toISOString().split('T')[0],
      tax_invoice_name: order.customer?.tax_company_name || order.customer?.name,
      tax_invoice_tax_id: order.customer?.tax_id,
      tax_invoice_address: [order.customer?.billing_address, order.customer?.billing_district, order.customer?.billing_amphoe, order.customer?.billing_province, order.customer?.billing_postal_code].filter(Boolean).join(' '),
      tax_invoice_branch: order.customer?.tax_branch || 'สำนักงานใหญ่',
      tax_invoice_doc_type: 'tax',
      items,
    };
  };

  const handlePrintTax = async (orderId: string) => {
    setPrintingId(orderId);
    setPrintingType('tax');
    try {
      const order = await fetchOrderForPdf(orderId);
      const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
      const blob = await generateFullInvoicePdf(buildTaxInvoiceData(order));
      showPdfPreview(blob, `ใบกำกับภาษี ${order.tax_invoice_number || order.department_order_number}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  const handlePrintTaxDn = async (orderId: string) => {
    setPrintingId(orderId);
    setPrintingType('taxdn');
    try {
      const order = await fetchOrderForPdf(orderId);
      const blobs: Blob[] = [];

      // TAX
      if (order.tax_invoice_number) {
        const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
        const taxBlob = await generateFullInvoicePdf(buildTaxInvoiceData(order));
        blobs.push(taxBlob);
      }

      // DN
      const { generateReplenishmentPdf } = await import('@/lib/replenishment-pdf');
      const pdfData = {
        id: order.id,
        replenishment_number: order.department_order_number,
        status: order.status,
        notes: order.notes,
        created_at: order.created_at,
        receive_token: order.receive_token,
        total_amount: order.confirmed_total ?? order.total_amount,
        shipping_fee: 0,
        customer: order.customer ? {
          name: order.customer.name,
          customer_code: order.customer.customer_code,
          phone: order.customer.phone,
          billing_address: order.customer.billing_address,
          billing_district: order.customer.billing_district,
          billing_amphoe: order.customer.billing_amphoe,
          billing_province: order.customer.billing_province,
          billing_postal_code: order.customer.billing_postal_code,
        } : null,
        created_by_name: order.created_by_profile?.name,
        confirm_notes: order.internal_notes,
        items: (order.items || []).map((i: any) => ({
          product_name: i.product_name,
          variation_label: i.variation_label,
          sku: i.sku || null,
          quantity: i.quantity,
          confirmed_quantity: i.confirmed_quantity,
          unit_price: i.unit_price || 0,
          image: i.image,
        })),
      };
      const dnBlob = await generateReplenishmentPdf({ data: pdfData });
      blobs.push(dnBlob);

      if (blobs.length > 1) {
        const merged = await mergePdfBlobs(blobs);
        showPdfPreview(merged, 'ใบกำกับภาษี + ใบส่งสินค้า');
      } else {
        showPdfPreview(blobs[0], 'ใบส่งสินค้า');
      }
      markPrintedAndUpdate(orderId, 'dn');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  const handlePrintAll = async (orderId: string, skipDn = false) => {
    setPrintingId(orderId);
    setPrintingType('all');
    try {
      const order = await fetchOrderForPdf(orderId);

      // 1. Packing
      const { generatePackingPdf } = await import('@/lib/orders-packing-pdf');
      const packingBlob = await generatePackingPdf([{
        order_number: order.department_order_number,
        created_at: order.created_at,
        customer: order.customer ? { name: order.customer.name, phone: order.customer.phone } : null,
        delivery_name: order.customer?.name || '',
        delivery_phone: order.customer?.phone || '',
        delivery_address: [
          order.customer?.billing_address,
          order.customer?.billing_district,
          order.customer?.billing_amphoe,
          order.customer?.billing_province,
          order.customer?.billing_postal_code,
        ].filter(Boolean).join(' '),
        notes: order.notes || '',
        items: (order.items || []).map((i: any) => ({
          product_name: i.product_name,
          variation_label: i.variation_label,
          quantity: i.quantity,
          image: i.image || null,
          barcode: i.barcode || null,
          sku: i.sku || null,
        })),
      }]);

      // 2. DN (if not skip)
      let dnBlob: Blob | null = null;
      if (!skipDn) {
        const { generateReplenishmentPdf } = await import('@/lib/replenishment-pdf');
        const pdfData = {
          id: order.id,
          replenishment_number: order.department_order_number,
          status: order.status,
          notes: order.notes,
          created_at: order.created_at,
          receive_token: order.receive_token,
          total_amount: order.confirmed_total ?? order.total_amount,
          shipping_fee: 0,
          customer: order.customer ? {
            name: order.customer.name,
            customer_code: order.customer.customer_code,
            phone: order.customer.phone,
            billing_address: order.customer.billing_address,
            billing_district: order.customer.billing_district,
            billing_amphoe: order.customer.billing_amphoe,
            billing_province: order.customer.billing_province,
            billing_postal_code: order.customer.billing_postal_code,
          } : null,
          created_by_name: order.created_by_profile?.name,
          confirm_notes: order.internal_notes,
          items: (order.items || []).map((i: any) => ({
            product_name: i.product_name,
            variation_label: i.variation_label,
            sku: i.sku || null,
            quantity: i.quantity,
            confirmed_quantity: i.confirmed_quantity,
            unit_price: i.unit_price || 0,
            image: i.image,
          })),
        };
        dnBlob = await generateReplenishmentPdf({ data: pdfData });
      }

      // 3. Label
      const { generateReplenishmentLabelPdf } = await import('@/lib/order-shipping-label-pdf');
      const labelData = {
        order_number: order.department_order_number,
        created_at: order.created_at,
        shipping_carrier: order.shipping_carrier || '',
        tracking_number: order.tracking_number || '',
        delivery_name: order.customer?.name || '',
        delivery_phone: order.customer?.phone || '',
        delivery_address: order.customer?.billing_address || '',
        delivery_district: order.customer?.billing_district || '',
        delivery_amphoe: order.customer?.billing_amphoe || '',
        delivery_province: order.customer?.billing_province || '',
        delivery_postal_code: order.customer?.billing_postal_code || '',
        items: (order.items || []).map((i: any) => ({
          product_name: i.product_name,
          variation_label: i.variation_label,
          quantity: i.quantity,
        })),
      };
      const labelBlob = await generateReplenishmentLabelPdf({ data: labelData });

      const blobs = [packingBlob, dnBlob, labelBlob].filter((b): b is Blob => b !== null);
      const merged = await mergePdfBlobs(blobs);
      showPdfPreview(merged, 'เอกสารทั้งหมด');
      markPrintedAndUpdate(orderId, 'packing');
      if (!skipDn) markPrintedAndUpdate(orderId, 'dn');
      markPrintedAndUpdate(orderId, 'label');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  // === Action menu items per status ===
  const getMenuItems = (r: DeptOrder): ActionItem[] => {
    const isPrinting = printingId === r.id;
    const dot = (key: string) => isPrintedDoc(r, key)
      ? <span className="ml-auto w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
      : null;

    const items: ActionItem[] = [];

    if (r.status === 'draft') {
      items.push(
        {
          key: 'packing',
          label: 'ใบจัดของ',
          icon: isPrinting && printingType === 'packing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />,
          suffix: dot('packing'),
          onClick: () => handlePrintPacking(r.id),
          disabled: isPrinting,
        },
        {
          key: 'label',
          label: 'ใบปะหน้า',
          icon: isPrinting && printingType === 'label' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />,
          suffix: dot('label'),
          onClick: () => handlePrintLabel(r.id),
          disabled: isPrinting,
        },
        {
          key: 'all',
          label: isPrinting && printingType === 'all' ? 'กำลังสร้าง...' : 'พิมพ์ทั้งหมด',
          icon: isPrinting && printingType === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />,
          className: 'text-primary font-medium',
          onClick: () => handlePrintAll(r.id, true),
          disabled: isPrinting,
        },
        {
          key: 'cancel',
          label: 'ยกเลิก',
          icon: <Trash2 className="w-4 h-4" />,
          onClick: () => setCancelId(r.id),
          danger: true,
          dividerBefore: true,
        },
      );
    } else if (r.status === 'shipped' || r.status === 'received' || r.status === 'partial_received') {
      // Section 1: เอกสารการเงิน
      items.push(
        {
          key: 'tax',
          label: 'ใบกำกับภาษี',
          icon: isPrinting && printingType === 'tax' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />,
          onClick: () => handlePrintTax(r.id),
          disabled: isPrinting,
        },
        {
          key: 'dn',
          label: 'ใบส่งสินค้า',
          icon: isPrinting && printingType === 'dn' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />,
          suffix: dot('dn'),
          onClick: () => handlePrintDN(r.id),
          disabled: isPrinting,
        },
        {
          key: 'taxdn',
          label: isPrinting && printingType === 'taxdn' ? 'กำลังสร้าง...' : 'พิมพ์ทั้งหมด',
          icon: isPrinting && printingType === 'taxdn' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />,
          className: 'text-primary font-medium',
          onClick: () => handlePrintTaxDn(r.id),
          disabled: isPrinting,
        },
        // Section 2: เอกสารจัดส่ง
        {
          key: 'packing',
          label: 'ใบจัดของ',
          icon: isPrinting && printingType === 'packing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />,
          suffix: dot('packing'),
          dividerBefore: true,
          onClick: () => handlePrintPacking(r.id),
          disabled: isPrinting,
        },
        {
          key: 'label',
          label: 'ใบปะหน้า',
          icon: isPrinting && printingType === 'label' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />,
          suffix: dot('label'),
          onClick: () => handlePrintLabel(r.id),
          disabled: isPrinting,
        },
      );
      // Section 3: จัดการ
      if (r.status === 'shipped') {
        items.push(
          {
            key: 'edit_shipping',
            label: 'แก้ไขขนส่ง',
            icon: <Truck className="w-4 h-4" />,
            onClick: () => setEditShipModalId(r.id),
            dividerBefore: true,
          },
          {
            key: 'void',
            label: 'ยกเลิก (Void)',
            icon: <Trash2 className="w-4 h-4" />,
            onClick: () => setVoidId(r.id),
            danger: true,
            dividerBefore: true,
          },
        );
      }
    }

    return items;
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          icon={<Building2 />}
          title="ส่งห้าง"
          subtitle="Department Store Orders"
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => fetchData(true)}
                disabled={isRefreshing}
                title="รีเฟรช"
                icon={<RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />}
              />
              <Button
                variant="secondary"
                icon={<UserPlus className="w-4 h-4" />}
                onClick={() => router.push('/customers/new?type=department_store')}
              >
                เพิ่มลูกค้าห้าง
              </Button>
              <Button
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => router.push('/department-orders/new')}
              >
                สร้างใบส่งห้าง
              </Button>
            </>
          }
        />

        {/* Status Tabs */}
        <StatusTabs
          activeKey={activeStatus}
          onSelect={handleStatusChange}
          tabs={STATUS_TABS.map(t => ({ ...t, count: getTabCount(t.key) }))}
        />

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchInput value={searchInput} onChange={handleSearchChange} placeholder="ค้นหาเลขใบส่งห้าง, ชื่อห้าง..." />
          </div>
        </div>

        {/* Table + Mobile Cards via DataTable */}
        <DataTable<DeptOrder>
          storageKey="department-orders-columns"
          columns={[
            {
              key: 'number', label: 'เลขที่', alwaysVisible: true,
              headerClassName: 'min-w-[140px]', cellClassName: 'whitespace-nowrap',
              render: (r) => (
                <>
                  <p
                    className="id-text-clickable text-gray-900 dark:text-white"
                    title="คัดลอก"
                    onClick={e => { e.stopPropagation(); copy(r.department_order_number, 'เลขที่'); }}
                  >
                    {r.department_order_number}
                  </p>
                  <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(r.created_at)}</p>
                </>
              ),
            },
            {
              key: 'customer', label: 'ห้าง',
              render: (r) => <p className="data-text text-gray-900 dark:text-white font-medium">{r.customer?.name || '-'}</p>,
            },
            {
              key: 'amount', label: 'มูลค่า / รายการ', headerClassName: 'text-right', cellClassName: 'text-right',
              render: (r) => {
                const itemCount = r.items?.length || 0;
                return (
                  <>
                    <span className="data-number text-gray-900 dark:text-white font-semibold">
                      ฿{(r.confirmed_total ?? r.total_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </span>
                    <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{itemCount} รายการ</p>
                  </>
                );
              },
            },
            {
              key: 'status', label: 'สถานะ / วิธีส่ง',
              render: (r) => {
                const statusCfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.draft;
                return (
                  <>
                    <StatusBadge status={r.status} colors={statusCfg}>{statusCfg.label}</StatusBadge>
                    {r.shipping_carrier && (
                      <div className="flex items-center gap-1 mt-1">
                        <Truck className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="data-timestamp text-gray-500 dark:text-slate-400">{r.shipping_carrier}</span>
                      </div>
                    )}
                    {r.tracking_number && <p className="code-text text-gray-500 dark:text-slate-400 text-xs mt-0.5">{r.tracking_number}</p>}
                  </>
                );
              },
            },
            {
              key: 'taxInvoice', label: 'เลขใบกำกับ',
              render: (r) => r.tax_invoice_number ? (
                <span className="data-text text-indigo-600 dark:text-indigo-400">{r.tax_invoice_number}</span>
              ) : <span className="data-muted text-gray-400 dark:text-slate-500">-</span>,
            },
            {
              key: 'createdBy', label: 'ผู้ทำรายการ',
              render: (r) => <span className="data-text text-gray-700 dark:text-slate-300">{r.created_by_profile?.name || '-'}</span>,
            },
            {
              key: 'receiver', label: 'ผู้รับ', stopPropagation: true,
              render: (r) => r.receiver_name ? (
                <div className="flex items-center gap-2">
                  {r.receive_photo_url && (
                    <ProductImageThumb src={r.receive_photo_url} alt="รูปรับสินค้า" size="xs" />
                  )}
                  <span className="data-text text-gray-700 dark:text-slate-300">{r.receiver_name}</span>
                </div>
              ) : <span className="data-muted text-gray-400 dark:text-slate-500">-</span>,
            },
            {
              key: 'print', label: 'พิมพ์', headerClassName: 'text-center', cellClassName: 'text-center', stopPropagation: true, hideMobile: true,
              render: (r) => {
                const isPrinting = printingId === r.id;
                if (r.status === 'cancelled') return <span className="data-muted text-gray-400 dark:text-slate-500">-</span>;
                return (
                  <Tooltip text={`ใบจัดของ: ${isPrintedDoc(r, 'packing') ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}\nใบปะหน้า: ${isPrintedDoc(r, 'label') ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}\nใบส่งของ: ${isPrintedDoc(r, 'dn') ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}`}>
                    <div className="relative flex items-center justify-center gap-1">
                      {isPrinting && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin absolute" />}
                      <span className={`w-2.5 h-2.5 rounded-full transition-opacity ${isPrinting ? 'opacity-30' : ''} ${isPrintedDoc(r, 'packing') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                      <span className={`w-2.5 h-2.5 rounded-full transition-opacity ${isPrinting ? 'opacity-30' : ''} ${isPrintedDoc(r, 'label') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                      <span className={`w-2.5 h-2.5 rounded-full transition-opacity ${isPrinting ? 'opacity-30' : ''} ${isPrintedDoc(r, 'dn') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                    </div>
                  </Tooltip>
                );
              },
            },
            {
              key: 'actions', label: 'จัดการ', alwaysVisible: true, headerClassName: 'text-right', stopPropagation: true, hideMobile: true,
              render: (r) => (
                <div className="flex items-center justify-end gap-1">
                  {r.status === 'draft' && (
                    <button
                      onClick={() => setShipModalId(r.id)}
                      className="btn-focus-action amber"
                    >
                      <Send className="w-4 h-4" />
                      <span className="hidden md:inline">จัดส่ง</span>
                    </button>
                  )}
                  {r.status === 'pending_confirm' && (
                    <button
                      onClick={() => router.push(`/department-orders/${r.id}`)}
                      className="flex items-center gap-1.5 px-2.5 py-2 md:px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="hidden md:inline">ยืนยัน</span>
                    </button>
                  )}
                  {r.status === 'shipped' && r.receive_token && (
                    <button
                      onClick={() => copyReceiveLink(r.receive_token!)}
                      className="flex items-center gap-1.5 px-2.5 py-2 md:px-4 text-sm font-medium rounded-lg border border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 transition-colors whitespace-nowrap"
                    >
                      <Copy className="w-4 h-4" />
                      <span className="hidden md:inline">ลิงก์รับของ</span>
                    </button>
                  )}
                  <ActionMenu items={getMenuItems(r)} />
                </div>
              ),
            },
          ]}
          data={orders}
          loading={isLoading}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/department-orders/${r.id}`)}
          {...(isDraftTab ? { selectedIds, onSelectionChange: setSelectedIds } : {})}
          rowClassName={(r) => r.status === 'cancelled' ? 'opacity-50' : ''}
          emptyMessage="ไม่มีรายการ"
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={totalRecords}
          recordsPerPage={recordsPerPage}
          onPageChange={(v) => setParams({ page: String(v) })}
          onRecordsPerPageChange={(v) => setParams({ limit: String(v) })}
          mobileCardRender={(r) => {
            const statusCfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.draft;
            const isPrinting = printingId === r.id;
            return (
              <>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="id-text-clickable text-gray-900 dark:text-white" onClick={e => { e.stopPropagation(); copy(r.department_order_number, 'เลขที่'); }}>
                      {r.department_order_number}
                    </p>
                    <p className="data-timestamp text-gray-400 dark:text-slate-500">{formatDate(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <StatusBadge status={r.status} colors={statusCfg}>{statusCfg.label}</StatusBadge>
                    <ActionMenu items={getMenuItems(r)} />
                  </div>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="data-text text-gray-700 dark:text-slate-300 font-medium">{r.customer?.name || '-'}</span>
                  <span className="data-number text-gray-900 dark:text-white font-semibold">฿{(r.confirmed_total ?? r.total_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
                    {r.shipping_carrier && <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{r.shipping_carrier}</span>}
                    <span>{(r.items?.length || 0)} รายการ</span>
                    {r.created_by_profile?.name && <span>{r.created_by_profile.name}</span>}
                  </div>
                  {r.status !== 'cancelled' && (
                    <div className="relative flex items-center gap-1" title="สถานะการพิมพ์">
                      {isPrinting && <Loader2 className="w-3 h-3 text-gray-400 animate-spin absolute" />}
                      <span className={`w-2 h-2 rounded-full transition-opacity ${isPrinting ? 'opacity-30' : ''} ${isPrintedDoc(r, 'packing') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                      <span className={`w-2 h-2 rounded-full transition-opacity ${isPrinting ? 'opacity-30' : ''} ${isPrintedDoc(r, 'label') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                      <span className={`w-2 h-2 rounded-full transition-opacity ${isPrinting ? 'opacity-30' : ''} ${isPrintedDoc(r, 'dn') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                    </div>
                  )}
                </div>
                {/* Mobile focus action */}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700" onClick={e => e.stopPropagation()}>
                  {r.status === 'draft' && (
                    <button onClick={() => setShipModalId(r.id)} className="btn-focus-action amber flex-1">
                      <Send className="w-4 h-4" /> จัดส่ง
                    </button>
                  )}
                  {r.status === 'pending_confirm' && (
                    <button onClick={() => router.push(`/department-orders/${r.id}`)} className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex-1">
                      <CheckCircle2 className="w-4 h-4" /> ยืนยัน
                    </button>
                  )}
                  {r.status === 'shipped' && r.receive_token && (
                    <button onClick={() => copyReceiveLink(r.receive_token!)} className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-300 transition-colors flex-1">
                      <Copy className="w-4 h-4" /> ลิงก์รับของ
                    </button>
                  )}
                </div>
              </>
            );
          }}
        />

        {/* Ship Modal */}
        {shipModalId && shipModalOrder && (
          <ShipModal
            orderNumber={shipModalOrder.department_order_number}
            customerName={shipModalOrder.customer?.name || ''}
            onSubmit={handleShip}
            onClose={() => setShipModalId(null)}
          />
        )}

        {/* Edit Shipping Modal */}
        {editShipModalId && editShipOrder && (
          <ShipModal
            orderNumber={editShipOrder.department_order_number}
            customerName={editShipOrder.customer?.name || ''}
            initialMethod={editShipOrder.shipping_method || 'courier'}
            initialCarrier={editShipOrder.shipping_carrier || ''}
            initialTracking={editShipOrder.tracking_number || ''}
            onSubmit={handleEditShipping}
            onClose={() => setEditShipModalId(null)}
          />
        )}

        {/* Cancel Confirm Dialog */}
        <ConfirmDialog
          open={!!cancelId}
          onClose={() => setCancelId(null)}
          title="ยกเลิกใบส่งห้าง"
          description="ยืนยันการยกเลิกใบส่งห้างนี้? สต๊อกที่จองไว้จะถูกคืนกลับ"
          confirmLabel="ยกเลิกใบส่งห้าง"
          variant="danger"
          loading={cancelSubmitting}
          onConfirm={handleCancel}
        />

        {/* Void Confirm Dialog */}
        <ConfirmDialog
          open={!!voidId}
          onClose={() => !voidSubmitting && setVoidId(null)}
          title="ยกเลิก (Void)"
          description="ยกเลิกใบกำกับภาษี + ใบส่งสินค้าที่ออกไปแล้ว และกลับเป็นสถานะ 'ที่ต้องจัดส่ง' เพื่อแก้ไขหรือยกเลิกออเดอร์ได้"
          confirmLabel="Void เอกสาร"
          variant="danger"
          loading={voidSubmitting}
          onConfirm={handleVoid}
        />

      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 shadow-lg px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
            <button onClick={() => setSelectedIds(new Set())} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500">
              <X className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">เลือก {selectedIds.size} รายการ</span>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => handleBulkPrint([...selectedIds], 'packing')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                <ClipboardList className="w-4 h-4" />
                ใบจัดของ ({selectedIds.size})
              </button>
              <button onClick={() => handleBulkPrint([...selectedIds], 'label')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                <Printer className="w-4 h-4" />
                ใบปะหน้า ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>
      )}

      <LoadingOverlay isOpen={bulkOverlay.show} title={bulkOverlay.message} progress={bulkOverlay.progress} />
    </Layout>
  );
}

export default function DepartmentOrdersPage() {
  return (
    <Suspense fallback={<Layout><LoadingCard /></Layout>}>
      <DepartmentOrdersContent />
    </Suspense>
  );
}
