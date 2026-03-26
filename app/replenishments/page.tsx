'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import FormSelect from '@/components/ui/FormSelect';
import ActionMenu, { ActionItem } from '@/app/orders/components/ActionMenu';
import { getTabColor, getBadgeColor } from '@/lib/status-tab-colors';
import ShipModal, { type ShipResult } from '@/components/ui/ShipModal';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  ArrowUpFromLine, Plus, Loader2, RefreshCw,
  Package, Truck, CheckCircle2, XCircle, Clock,
  Send, Copy, Eye, X, AlertTriangle, Printer,
  ClipboardList, FileText, User, Ban, Pencil,
} from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import { generateReplenishmentPdf, type ReplenishmentPdfData } from '@/lib/replenishment-pdf';
import { generatePackingPdf } from '@/lib/orders-packing-pdf';
import { generateReplenishmentLabelPdf } from '@/lib/order-shipping-label-pdf';
import { showPdfPreview, mergePdfBlobs } from '@/lib/print-pdf';
import { markPrinted } from '@/lib/print-tracking';

interface Replenishment {
  id: string;
  replenishment_number: string;
  status: string;
  total_amount: number;
  confirmed_total?: number | null;
  shipping_method?: string | null;
  shipping_carrier?: string | null;
  tracking_number?: string | null;
  printed_packing_at?: string | null;
  printed_dn_at?: string | null;
  printed_label_at?: string | null;
  receive_token?: string | null;
  receiver_name?: string | null;
  receive_photo_url?: string | null;
  created_at: string;
  shipped_at?: string | null;
  received_at?: string | null;
  customer: { id: string; name: string; customer_code: string | null } | null;
  created_by_profile?: { id: string; name: string } | null;
  replenishment_items?: { id: string }[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'ที่ต้องจัดส่ง', ...getBadgeColor('pending') },
  shipped: { label: 'กำลังส่ง', ...getBadgeColor('shipped') },
  pending_confirm: { label: 'รอยืนยัน', ...getBadgeColor('pending_confirm') },
  received: { label: 'รับครบแล้ว', ...getBadgeColor('completed') },
  partial_received: { label: 'รับไม่ครบ', ...getBadgeColor('partial_received') },
  cancelled: { label: 'ยกเลิก', ...getBadgeColor('cancelled') },
};

const STATUS_TABS = [
  { key: 'all',            label: 'ทั้งหมด',       ...getTabColor('all') },
  { key: 'pending',        label: 'ที่ต้องจัดส่ง', ...getTabColor('pending') },
  { key: 'shipped',        label: 'กำลังส่ง',       ...getTabColor('shipped') },
  { key: 'pending_confirm',label: 'รอยืนยัน',       ...getTabColor('pending_confirm'),
    tooltip: 'ตัวแทนแจ้งรับของแล้ว แต่จำนวนไม่ตรง รอ Admin ตรวจสอบและยืนยัน' },
  { key: 'received',       label: 'รับแล้ว',         ...getTabColor('completed') },
  { key: 'cancelled',      label: 'ยกเลิก',          ...getTabColor('cancelled') },
];

const SHIPPING_METHODS = [
  { id: 'own_vehicle', label: 'รถเราเอง' },
  { id: 'courier', label: 'ขนส่ง (Kerry, Flash, J&T, ฯลฯ)' },
  { id: 'lalamove', label: 'Lalamove' },
];

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อกี้';
  if (mins < 60) return `${mins}นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}ชม.ที่แล้ว`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}วันที่แล้ว`;
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function ReplenishmentsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  // Derive filter state from URL params
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
    router.replace(qs ? `?${qs}` : '/replenishments', { scroll: false });
  }, [searchParams, router]);

  const [replenishments, setReplenishments] = useState<Replenishment[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Ship modal
  const [shipModalId, setShipModalId] = useState<string | null>(null);
  const [shipMethod, setShipMethod] = useState('courier');
  const [shipCarrier, setShipCarrier] = useState('');
  const [shipTracking, setShipTracking] = useState('');
  const [shipNotes, setShipNotes] = useState('');
  const [shipSubmitting, setShipSubmitting] = useState(false);

  // Edit shipping modal
  const [editShipModalId, setEditShipModalId] = useState<string | null>(null);
  const [editShipMethod, setEditShipMethod] = useState('courier');
  const [editShipCarrier, setEditShipCarrier] = useState('');
  const [editShipTracking, setEditShipTracking] = useState('');
  const [editShipNotes, setEditShipNotes] = useState('');
  const [editShipSubmitting, setEditShipSubmitting] = useState(false);

  // Cancel confirm
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Lightbox for receiver photo
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!lightboxSrc) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxSrc(null); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [lightboxSrc]);

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true); else setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(recordsPerPage),
      });
      if (activeStatus !== 'all') params.set('status', activeStatus);
      if (search) params.set('search', search);

      const res = await apiFetch(`/api/replenishments?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setReplenishments(data.replenishments || []);
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

  // Debounced search — local input state, update URL after 400ms idle
  const [searchInput, setSearchInput] = useState(search);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setParams({ q: val });
    }, 400);
  };
  // Sync local input when URL changes externally (e.g. back button)
  useEffect(() => { setSearchInput(search); }, [search]);

  const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const getTabCount = (key: string) => key === 'all' ? totalCount : (statusCounts[key] || 0);

  // Ship action
  const handleShip = async () => {
    if (!shipModalId) return;
    setShipSubmitting(true);
    try {
      const res = await apiFetch(`/api/replenishments/${shipModalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ship',
          shipping_method: shipMethod,
          shipping_carrier: shipMethod === 'courier' ? shipCarrier : shipMethod === 'lalamove' ? 'Lalamove' : 'รถเราเอง',
          tracking_number: shipMethod === 'courier' ? shipTracking : null,
          notes: shipNotes || null,
        }),
      });
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || 'Failed');
      }
      const data = await res.json();
      const dnNum = data.dn_number || data.tax_invoice_number;
      const taxNum = data.tax_invoice_number;
      const docNums = [dnNum, taxNum].filter(Boolean);
      if (docNums.length > 0) {
        showToast(`จัดส่งเรียบร้อย + ออกเอกสาร ${docNums.join(' + ')}`, 'success');
      } else {
        showToast('จัดส่งเรียบร้อย', 'success');
      }
      const shippedId = shipModalId;
      setShipModalId(null);
      resetShipForm();
      fetchData(true);
      // Auto print DN after ship
      if (dnNum) {
        try {
          const rp = await fetchReplenishmentForPdf(shippedId);
          if (!dnNum && taxNum) {
            // TAX only (Flow D dept store) — shouldn't happen normally since DN always issued
            const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
            const blob = await generateFullInvoicePdf({
              ...rp,
              tax_invoice_number: taxNum,
              tax_invoice_date: new Date().toISOString().split('T')[0],
              tax_invoice_doc_type: 'tax',
            });
            showPdfPreview(blob, `ใบกำกับภาษี ${taxNum}`);
          } else {
            const pdfData: ReplenishmentPdfData = {
              id: rp.id,
              replenishment_number: rp.replenishment_number,
              status: rp.status,
              notes: rp.notes,
              created_at: rp.created_at,
              receive_token: rp.receive_token,
              total_amount: rp.total_amount,
              shipping_fee: rp.shipping_fee,
              customer: rp.customer ? {
                name: rp.customer.name,
                customer_code: rp.customer.customer_code,
                phone: rp.customer.phone,
                billing_address: rp.customer.billing_address,
                billing_district: rp.customer.billing_district,
                billing_amphoe: rp.customer.billing_amphoe,
                billing_province: rp.customer.billing_province,
                billing_postal_code: rp.customer.billing_postal_code,
              } : null,
              created_by_name: rp.created_by_profile?.name,
              confirm_notes: rp.confirm_notes,
              items: (rp.items || []).map((i: any) => ({
                product_name: i.product_name,
                variation_label: i.variation_label,
                sku: i.sku,
                quantity: i.quantity,
                confirmed_quantity: i.confirmed_quantity,
                unit_price: i.unit_price || 0,
                image: i.image,
              })),
            };
            const blob = await generateReplenishmentPdf({ data: pdfData });
            showPdfPreview(blob, `ใบส่งสินค้า ${dnNum}`);
          }
          markPrintedAndUpdate(shippedId, 'dn');
        } catch (printErr) {
          console.error('Auto-print after ship failed:', printErr);
        }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setShipSubmitting(false);
    }
  };

  const resetShipForm = () => {
    setShipMethod('courier');
    setShipCarrier('');
    setShipTracking('');
    setShipNotes('');
  };

  const openEditShipping = (r: Replenishment) => {
    setEditShipMethod(r.shipping_method || 'courier');
    setEditShipCarrier(r.shipping_carrier || '');
    setEditShipTracking(r.tracking_number || '');
    setEditShipNotes(r.shipping_method !== 'courier' ? (r.tracking_number || '') : '');
    setEditShipModalId(r.id);
  };

  const handleEditShipping = async () => {
    if (!editShipModalId) return;
    setEditShipSubmitting(true);
    try {
      const res = await apiFetch(`/api/replenishments/${editShipModalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_shipping',
          shipping_method: editShipMethod,
          shipping_carrier: editShipMethod === 'courier' ? editShipCarrier : editShipMethod === 'lalamove' ? 'Lalamove' : 'รถเราเอง',
          tracking_number: editShipMethod === 'courier' ? editShipTracking : editShipNotes || null,
        }),
      });
      if (res.ok) {
        showToast('แก้ไขข้อมูลขนส่งเรียบร้อย', 'success');
        setEditShipModalId(null);
        fetchData(true);
      } else {
        const data = await res.json();
        showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setEditShipSubmitting(false);
    }
  };

  // Cancel action
  const handleCancel = async () => {
    if (!cancelId) return;
    setCancelSubmitting(true);
    try {
      const res = await apiFetch(`/api/replenishments/${cancelId}`, {
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

  // Copy receive link
  const copyReceiveLink = (token: string) => {
    const url = `${window.location.origin}/replenishments/receive/${token}`;
    navigator.clipboard.writeText(url);
    showToast('คัดลอกลิงก์แล้ว', 'success');
  };

  // Print state tracking (DB-backed via printed_*_at columns)
  const isPrintedDoc = (r: Replenishment, docType: string) => {
    const col = `printed_${docType}_at` as keyof Replenishment;
    return !!r[col];
  };
  const markPrintedAndUpdate = useCallback((id: string, docType: string) => {
    // Fire-and-forget DB update
    markPrinted('replenishment', [id], docType);
    // Optimistic local state update
    const col = `printed_${docType}_at` as keyof Replenishment;
    setReplenishments(prev => prev.map(r =>
      r.id === id ? { ...r, [col]: new Date().toISOString() } : r
    ));
  }, []);

  // Fetch replenishment data for PDF
  const fetchReplenishmentForPdf = async (id: string) => {
    const res = await apiFetch(`/api/replenishments/${id}`);
    if (!res.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');
    const { replenishment } = await res.json();
    return replenishment;
  };

  // Print actions
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printingType, setPrintingType] = useState<string | null>(null);

  const handlePrintDN = async (id: string) => {
    setPrintingId(id);
    setPrintingType('dn');
    try {
      const replenishment = await fetchReplenishmentForPdf(id);
      const pdfData: ReplenishmentPdfData = {
        id: replenishment.id,
        replenishment_number: replenishment.replenishment_number,
        status: replenishment.status,
        notes: replenishment.notes,
        created_at: replenishment.created_at,
        receive_token: replenishment.receive_token,
        total_amount: replenishment.total_amount,
        shipping_fee: replenishment.shipping_fee,
        customer: replenishment.customer ? {
          name: replenishment.customer.name,
          customer_code: replenishment.customer.customer_code,
          phone: replenishment.customer.phone,
          billing_address: replenishment.customer.billing_address,
          billing_district: replenishment.customer.billing_district,
          billing_amphoe: replenishment.customer.billing_amphoe,
          billing_province: replenishment.customer.billing_province,
          billing_postal_code: replenishment.customer.billing_postal_code,
        } : null,
        created_by_name: replenishment.created_by_profile?.name,
        confirm_notes: replenishment.confirm_notes,
        items: (replenishment.items || []).map((i: any) => ({
          product_name: i.product_name,
          variation_label: i.variation_label,
          sku: i.sku,
          quantity: i.quantity,
          confirmed_quantity: i.confirmed_quantity,
          unit_price: i.unit_price || 0,
          image: i.image,
        })),
      };
      const blob = await generateReplenishmentPdf({ data: pdfData });
      showPdfPreview(blob, 'ใบส่งสินค้า / DN');
      markPrintedAndUpdate(id, 'dn');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  const handlePrintLabel = async (id: string) => {
    setPrintingId(id);
    setPrintingType('label');
    try {
      const replenishment = await fetchReplenishmentForPdf(id);
      const labelData = {
        order_number: replenishment.replenishment_number,
        created_at: replenishment.created_at,
        shipping_carrier: replenishment.shipping_carrier || '',
        tracking_number: replenishment.tracking_number || '',
        delivery_name: replenishment.customer?.name || '',
        delivery_phone: replenishment.customer?.phone || '',
        delivery_address: replenishment.customer?.billing_address || '',
        delivery_district: replenishment.customer?.billing_district || '',
        delivery_amphoe: replenishment.customer?.billing_amphoe || '',
        delivery_province: replenishment.customer?.billing_province || '',
        delivery_postal_code: replenishment.customer?.billing_postal_code || '',
        items: (replenishment.items || []).map((i: any) => ({
          product_name: i.product_name,
          variation_label: i.variation_label,
          quantity: i.quantity,
        })),
      };
      const blob = await generateReplenishmentLabelPdf({ data: labelData });
      showPdfPreview(blob, 'ใบปะหน้า');
      markPrintedAndUpdate(id, 'label');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  const handlePrintPacking = async (id: string) => {
    setPrintingId(id);
    setPrintingType('packing');
    try {
      const replenishment = await fetchReplenishmentForPdf(id);
      // Build order-shaped data for packing PDF
      const orderData = {
        order_number: replenishment.replenishment_number,
        customer_name: replenishment.customer?.name || '',
        delivery_name: replenishment.customer?.name || '',
        delivery_phone: replenishment.customer?.phone || '',
        delivery_address: [
          replenishment.customer?.billing_address,
          replenishment.customer?.billing_district,
          replenishment.customer?.billing_amphoe,
          replenishment.customer?.billing_province,
          replenishment.customer?.billing_postal_code,
        ].filter(Boolean).join(' '),
        tracking_number: replenishment.tracking_number || '',
        shipping_carrier: replenishment.shipping_carrier || '',
        notes: replenishment.notes || '',
        created_at: replenishment.created_at || new Date().toISOString(),
        items: (replenishment.items || []).map((i: any) => ({
          product_name: i.product_name,
          variation_label: i.variation_label,
          quantity: i.quantity,
          image: i.image || null,
          barcode: i.barcode || null,
          sku: i.sku || null,
        })),
      };
      const blob = await generatePackingPdf([orderData]);
      showPdfPreview(blob, 'ใบจัดของ');
      markPrintedAndUpdate(id, 'packing');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  // Print all documents at once (skipDn=true for pending status — DN hasn't been issued yet)
  const handlePrintAll = async (id: string, skipDn = false) => {
    setPrintingId(id);
    setPrintingType('all');
    try {
      const replenishment = await fetchReplenishmentForPdf(id);

      // 1. Packing slip
      const packingOrderData = {
        order_number: replenishment.replenishment_number,
        customer_name: replenishment.customer?.name || '',
        delivery_name: replenishment.customer?.name || '',
        delivery_phone: replenishment.customer?.phone || '',
        delivery_address: [
          replenishment.customer?.billing_address,
          replenishment.customer?.billing_district,
          replenishment.customer?.billing_amphoe,
          replenishment.customer?.billing_province,
          replenishment.customer?.billing_postal_code,
        ].filter(Boolean).join(' '),
        tracking_number: replenishment.tracking_number || '',
        shipping_carrier: replenishment.shipping_carrier || '',
        notes: replenishment.notes || '',
        created_at: replenishment.created_at || new Date().toISOString(),
        items: (replenishment.items || []).map((i: any) => ({
          product_name: i.product_name,
          variation_label: i.variation_label,
          quantity: i.quantity,
          image: i.image || null,
          barcode: i.barcode || null,
          sku: i.sku || null,
        })),
      };
      const packingBlob = await generatePackingPdf([packingOrderData]);

      // 2. DN (skip if not yet shipped)
      let dnBlob: Blob | null = null;
      if (!skipDn) {
        const pdfData: ReplenishmentPdfData = {
          id: replenishment.id,
          replenishment_number: replenishment.replenishment_number,
          status: replenishment.status,
          notes: replenishment.notes,
          created_at: replenishment.created_at,
          receive_token: replenishment.receive_token,
          total_amount: replenishment.total_amount,
          shipping_fee: replenishment.shipping_fee,
          customer: replenishment.customer ? {
            name: replenishment.customer.name,
            customer_code: replenishment.customer.customer_code,
            phone: replenishment.customer.phone,
            billing_address: replenishment.customer.billing_address,
            billing_district: replenishment.customer.billing_district,
            billing_amphoe: replenishment.customer.billing_amphoe,
            billing_province: replenishment.customer.billing_province,
            billing_postal_code: replenishment.customer.billing_postal_code,
          } : null,
          created_by_name: replenishment.created_by_profile?.name,
          confirm_notes: replenishment.confirm_notes,
          items: (replenishment.items || []).map((i: any) => ({
            product_name: i.product_name,
            variation_label: i.variation_label,
            sku: i.sku,
            quantity: i.quantity,
            confirmed_quantity: i.confirmed_quantity,
            unit_price: i.unit_price || 0,
            image: i.image,
          })),
        };
        dnBlob = await generateReplenishmentPdf({ data: pdfData });
      }

      // 3. Label (A4)
      const labelData = {
        order_number: replenishment.replenishment_number,
        created_at: replenishment.created_at,
        shipping_carrier: replenishment.shipping_carrier || '',
        tracking_number: replenishment.tracking_number || '',
        delivery_name: replenishment.customer?.name || '',
        delivery_phone: replenishment.customer?.phone || '',
        delivery_address: replenishment.customer?.billing_address || '',
        delivery_district: replenishment.customer?.billing_district || '',
        delivery_amphoe: replenishment.customer?.billing_amphoe || '',
        delivery_province: replenishment.customer?.billing_province || '',
        delivery_postal_code: replenishment.customer?.billing_postal_code || '',
        items: (replenishment.items || []).map((i: any) => ({
          product_name: i.product_name,
          variation_label: i.variation_label,
          quantity: i.quantity,
        })),
      };
      const labelBlob = await generateReplenishmentLabelPdf({ data: labelData });

      const blobs = [packingBlob, dnBlob, labelBlob].filter((b): b is Blob => b !== null);
      const merged = await mergePdfBlobs(blobs);
      showPdfPreview(merged, 'เอกสารทั้งหมด');
      markPrintedAndUpdate(id, 'packing');
      if (!skipDn) markPrintedAndUpdate(id, 'dn');
      markPrintedAndUpdate(id, 'label');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  // Action menu items per status
  const getMenuItems = (r: Replenishment): ActionItem[] => {
    const isPrinting = printingId === r.id;
    const dot = (key: string) => isPrintedDoc(r, key)
      ? <span className="ml-auto w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
      : null;

    const items: ActionItem[] = [];

    if (r.status === 'pending') {
      // ยังไม่จัดส่ง — ใบจัดของ + ใบปะหน้า (เตรียมของ) แต่ไม่มี DN (ออกตอนกดจัดส่ง)
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
          className: 'text-[#F4511E] font-medium',
          onClick: () => handlePrintAll(r.id, true),
          disabled: isPrinting,
        },
        {
          key: 'cancel',
          label: 'ยกเลิก',
          icon: <Ban className="w-4 h-4" />,
          onClick: () => setCancelId(r.id),
          danger: true,
          dividerBefore: true,
        },
      );
    } else if (r.status === 'shipped' || r.status === 'received' || r.status === 'partial_received') {
      // Can always reprint DN after shipping
      items.push(
        {
          key: 'dn',
          label: 'ใบส่งของ (DN)',
          icon: isPrinting && printingType === 'dn' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />,
          suffix: dot('dn'),
          onClick: () => handlePrintDN(r.id),
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
      // คัดลอกลิงก์ is now a primary action button, not in menu
      if (r.status === 'shipped') {
        items.push({
          key: 'edit_shipping',
          label: 'แก้ไขขนส่ง',
          icon: <Pencil className="w-4 h-4" />,
          onClick: () => openEditShipping(r),
          dividerBefore: true,
        });
      }
    }

    return items;
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArrowUpFromLine className="w-8 h-8 text-[#F4511E]" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">เติมสินค้าตัวแทน</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-white transition-colors disabled:opacity-50"
              title="รีเฟรช"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => router.push('/replenishments/new')}
              className="bg-[#F4511E] text-white px-4 py-2 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              สร้าง<span className="hidden md:inline">ใบเติมสินค้า</span>
            </button>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_TABS.map(tab => {
            const count = getTabCount(tab.key);
            const isActive = activeStatus === tab.key;
            return (
              <div key={tab.key} className="flex-shrink-0">
                {'tooltip' in tab && tab.tooltip ? (
                  <Tooltip text={tab.tooltip}>
                    <button
                      onClick={() => handleStatusChange(tab.key)}
                      className={`rounded-xl px-4 py-2 min-w-[80px] text-center transition-all ${
                        isActive ? `${tab.active} text-white shadow-md` : `${tab.inactive} hover:opacity-80`
                      }`}
                    >
                      <div className={`text-xs font-medium ${isActive ? 'text-white/80' : tab.labelColor}`}>{tab.label}</div>
                      <div className={`text-xl font-bold ${isActive ? 'text-white' : tab.countColor}`}>{count}</div>
                    </button>
                  </Tooltip>
                ) : (
                  <button
                    onClick={() => handleStatusChange(tab.key)}
                    className={`rounded-xl px-4 py-2 min-w-[80px] text-center transition-all ${
                      isActive ? `${tab.active} text-white shadow-md` : `${tab.inactive} hover:opacity-80`
                    }`}
                  >
                    <div className={`text-xs font-medium ${isActive ? 'text-white/80' : tab.labelColor}`}>{tab.label}</div>
                    <div className={`text-xl font-bold ${isActive ? 'text-white' : tab.countColor}`}>{count}</div>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchInput value={searchInput} onChange={handleSearchChange} placeholder="ค้นหาเลขใบเติมสินค้า, ชื่อตัวแทน..." />
          </div>
        </div>

        {/* Table + Mobile Cards via DataTable */}
        <DataTable<Replenishment>
          storageKey="replenishments-columns"
          columns={[
            {
              key: 'number', label: 'เลขที่', alwaysVisible: true,
              headerClassName: 'min-w-[140px]', cellClassName: 'whitespace-nowrap',
              render: (r) => (
                <>
                  <p
                    className="id-text-clickable text-gray-900 dark:text-white"
                    title="คัดลอก"
                    onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(r.replenishment_number).then(() => showToast('คัดลอกเลขที่แล้ว')); }}
                  >
                    {r.replenishment_number}
                  </p>
                  <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(r.created_at)}</p>
                </>
              ),
            },
            {
              key: 'customer', label: 'ตัวแทน',
              render: (r) => <p className="data-text text-gray-900 dark:text-white font-medium">{r.customer?.name || '-'}</p>,
            },
            {
              key: 'amount', label: 'มูลค่า / รายการ', headerClassName: 'text-right', cellClassName: 'text-right',
              render: (r) => {
                const itemCount = r.replenishment_items?.length || 0;
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
                const statusCfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
                return (
                  <>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>
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
              key: 'createdBy', label: 'ผู้ทำรายการ',
              render: (r) => <span className="data-text text-gray-700 dark:text-slate-300">{r.created_by_profile?.name || '-'}</span>,
            },
            {
              key: 'receiver', label: 'ผู้รับ', stopPropagation: true,
              render: (r) => r.receiver_name ? (
                <div className="flex items-center gap-2">
                  {r.receive_photo_url && (
                    <img
                      src={r.receive_photo_url}
                      alt="รูปรับสินค้า"
                      className="w-8 h-8 rounded object-cover cursor-pointer hover:opacity-80 flex-shrink-0"
                      onClick={() => setLightboxSrc(r.receive_photo_url!)}
                    />
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
                  {r.status === 'pending' && (
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
                      onClick={() => router.push(`/replenishments/new?id=${r.id}`)}
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
          data={replenishments}
          loading={isLoading}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/replenishments/new?id=${r.id}${r.status !== 'pending' ? '&view=1' : ''}`)}
          rowClassName={(r) => r.status === 'cancelled' ? 'opacity-50' : ''}
          emptyMessage="ไม่มีรายการ"
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={totalRecords}
          recordsPerPage={recordsPerPage}
          onPageChange={(v) => setParams({ page: String(v) })}
          onRecordsPerPageChange={(v) => setParams({ limit: String(v) })}
          mobileCardRender={(r) => {
            const statusCfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
            const isPrinting = printingId === r.id;
            return (
              <>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="id-text-clickable text-gray-900 dark:text-white" onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(r.replenishment_number).then(() => showToast('คัดลอกเลขที่แล้ว')); }}>
                      {r.replenishment_number}
                    </p>
                    <p className="data-timestamp text-gray-400 dark:text-slate-500">{formatDate(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>
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
                    <span>{(r.replenishment_items?.length || 0)} รายการ</span>
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
                {r.receiver_name && (
                  <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
                    {r.receive_photo_url && (
                      <img src={r.receive_photo_url} alt="" className="w-6 h-6 rounded object-cover cursor-pointer" onClick={() => setLightboxSrc(r.receive_photo_url!)} />
                    )}
                    <span className="text-xs text-gray-500 dark:text-slate-400">ผู้รับ: {r.receiver_name}</span>
                  </div>
                )}
                {/* Primary action buttons */}
                {(r.status === 'pending' || r.status === 'pending_confirm' || (r.status === 'shipped' && r.receive_token)) && (
                  <div className="mt-3 flex gap-2" onClick={e => e.stopPropagation()}>
                    {r.status === 'pending' && (
                      <button onClick={() => setShipModalId(r.id)} className="btn-focus-action amber flex-1 justify-center">
                        <Send className="w-4 h-4" /> จัดส่ง
                      </button>
                    )}
                    {r.status === 'pending_confirm' && (
                      <button onClick={() => router.push(`/replenishments/new?id=${r.id}`)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                        <CheckCircle2 className="w-4 h-4" /> ยืนยัน
                      </button>
                    )}
                    {r.status === 'shipped' && r.receive_token && (
                      <button onClick={() => copyReceiveLink(r.receive_token!)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                        <Copy className="w-4 h-4" /> ลิงก์รับของ
                      </button>
                    )}
                  </div>
                )}
              </>
            );
          }}
        />
      </div>

      {/* Ship Modal */}
      {shipModalId && (() => {
        const shipRep = replenishments.find(r => r.id === shipModalId);
        return (
          <ShipModal
            orderNumber={shipRep?.replenishment_number || ''}
            customerName={shipRep?.customer?.name || '-'}
            onSubmit={async (result: ShipResult) => {
              setShipSubmitting(true);
              try {
                const res = await apiFetch(`/api/replenishments/${shipModalId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'ship',
                    shipping_method: result.method,
                    shipping_carrier: result.method === 'courier' ? result.carrier : result.method === 'lalamove' ? 'Lalamove' : 'รถเราเอง',
                    tracking_number: result.method === 'courier' ? result.tracking : null,
                    notes: result.notes || null,
                  }),
                });
                if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'Failed'); }
                const data = await res.json();
                const dnNum = data.dn_number || data.tax_invoice_number;
                const taxNum = data.tax_invoice_number;
                const docNums = [dnNum, taxNum].filter(Boolean);
                showToast(docNums.length > 0 ? `จัดส่งเรียบร้อย + ออกเอกสาร ${docNums.join(' + ')}` : 'จัดส่งเรียบร้อย', 'success');
                const shippedId = shipModalId;
                setShipModalId(null);
                resetShipForm();
                fetchData(true);
                // Auto print DN after ship
                if (dnNum) {
                  try {
                    const rp = await fetchReplenishmentForPdf(shippedId);
                    if (rp) {
                      const { generateReplenishmentPdf } = await import('@/lib/replenishment-pdf');
                      const blob = await generateReplenishmentPdf(rp);
                      showPdfPreview(blob, `ใบส่งสินค้า ${dnNum}`);
                    }
                  } catch (err) { console.error('Auto print DN error:', err); }
                }
              } catch (err) {
                showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
              } finally {
                setShipSubmitting(false);
              }
            }}
            onClose={() => { setShipModalId(null); resetShipForm(); }}
          />
        );
      })()}

      {/* Edit Shipping Modal */}
      {editShipModalId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !editShipSubmitting && setEditShipModalId(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Pencil className="w-5 h-5 text-[#F4511E]" /> แก้ไขข้อมูลขนส่ง
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">วิธีส่ง</label>
                <FormSelect
                  value={editShipMethod}
                  onChange={setEditShipMethod}
                  options={SHIPPING_METHODS}
                  placeholder="เลือกวิธีส่ง"
                />
              </div>

              {editShipMethod === 'courier' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อขนส่ง</label>
                    <input
                      type="text"
                      value={editShipCarrier}
                      onChange={e => setEditShipCarrier(e.target.value)}
                      placeholder="เช่น Kerry, Flash, J&T"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เลข Tracking</label>
                    <input
                      type="text"
                      value={editShipTracking}
                      onChange={e => setEditShipTracking(e.target.value)}
                      placeholder="เลขพัสดุ"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    />
                  </div>
                </>
              )}

              {editShipMethod === 'lalamove' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทรคนขับ / รายละเอียด</label>
                  <input
                    type="text"
                    value={editShipNotes}
                    onChange={e => setEditShipNotes(e.target.value)}
                    placeholder="เบอร์โทรติดต่อ Lalamove"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  />
                </div>
              )}

              {editShipMethod === 'own_vehicle' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุ</label>
                  <input
                    type="text"
                    value={editShipNotes}
                    onChange={e => setEditShipNotes(e.target.value)}
                    placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditShipModalId(null)}
                disabled={editShipSubmitting}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleEditShipping}
                disabled={editShipSubmitting}
                className="flex-1 px-4 py-2.5 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {editShipSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="รูปรับสินค้า" className="max-w-full max-h-[85vh] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {cancelId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !cancelSubmitting && setCancelId(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">ยืนยันยกเลิก</h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-6">ต้องการยกเลิกใบเติมสินค้านี้หรือไม่?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelId(null)}
                disabled={cancelSubmitting}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                ไม่
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelSubmitting}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cancelSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default function ReplenishmentsPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    }>
      <ReplenishmentsPageContent />
    </Suspense>
  );
}
