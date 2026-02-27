'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import OrderForm from '@/components/orders/OrderForm';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import { useCompany } from '@/lib/company-context';
import { getInvoiceMenuLabel } from '@/lib/invoice-utils';
import {
  ArrowLeft,
  Loader2,
  Printer,
  XCircle,
  Truck,
  Link2,
  ChevronRight,
  X,
  Banknote,
  CreditCard,
  Eye,
  ShieldCheck,
  ShieldX,
  PackageCheck,
  FileText,
  ChevronDown,
  Package,
  ClipboardList,
  Pencil,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import PaymentModal from '../components/PaymentModal';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import { generateOrderInvoicePdf } from '@/lib/order-invoice-pdf';
import { generatePackingPdf } from '@/lib/orders-packing-pdf';
import { generateShippingLabelPdf } from '@/lib/order-shipping-label-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import { isMarketplaceSource } from '@/lib/marketplace/types';

// Status badge components
function OrderStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    new: { label: 'ใหม่', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/30 dark:text-blue-100' },
    ready_to_ship: { label: 'รอกดรับออเดอร์', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/30 dark:text-cyan-100' },
    processing: { label: 'ที่ต้องจัดส่ง', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/30 dark:text-indigo-100' },
    shipping: { label: 'กำลังส่ง', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/30 dark:text-yellow-100' },
    completed: { label: 'สำเร็จ', color: 'bg-green-100 text-green-700 dark:bg-green-500/30 dark:text-green-100' },
    cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700 dark:bg-red-500/30 dark:text-red-100' }
  };
  const config = statusConfig[status] || statusConfig.new;
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'รอชำระ', color: 'bg-orange-100 text-orange-700 dark:bg-orange-500/30 dark:text-orange-100' },
    verifying: { label: 'รอตรวจสอบ', color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/30 dark:text-purple-100' },
    paid: { label: 'ชำระแล้ว', color: 'bg-green-100 text-green-700 dark:bg-green-500/30 dark:text-green-100' },
    cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700 dark:bg-red-500/30 dark:text-red-100' }
  };
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

function ShopeeExternalStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    UNPAID: { label: 'ยังไม่ชำระ', color: 'bg-gray-100 text-gray-600 dark:bg-gray-500/30 dark:text-gray-100' },
    READY_TO_SHIP: { label: 'รอกดรับออเดอร์', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/30 dark:text-blue-100' },
    PROCESSED: { label: 'พร้อมส่ง', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/30 dark:text-indigo-100' },
    SHIPPED: { label: 'กำลังจัดส่ง', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/30 dark:text-yellow-100' },
    TO_CONFIRM_RECEIVE: { label: 'รอยืนยันรับ', color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/30 dark:text-purple-100' },
    COMPLETED: { label: 'สำเร็จ', color: 'bg-green-100 text-green-700 dark:bg-green-500/30 dark:text-green-100' },
    CANCELLED: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700 dark:bg-red-500/30 dark:text-red-100' },
    IN_CANCEL: { label: 'กำลังยกเลิก', color: 'bg-red-50 text-red-600 dark:bg-red-500/30 dark:text-red-100' },
  };
  const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-600 dark:bg-gray-500/30 dark:text-gray-100' };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

interface PaymentRecord {
  id: string;
  order_id: string;
  payment_method: string;
  payment_date: string;
  amount: number;
  collected_by?: string;
  transfer_date?: string;
  transfer_time?: string;
  notes?: string;
  slip_image_url?: string;
  status?: string; // 'pending' | 'verified' | 'rejected'
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { features } = useFeatures();
  const { currentCompany } = useCompany();
  const vatRegistered = currentCompany?.vat_registered || false;

  // Order header info (loaded separately from OrderForm)
  const [orderNumber, setOrderNumber] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Receipt number (POS)
  const [receiptNumber, setReceiptNumber] = useState('');

  // Shopee-specific state
  const [orderSource, setOrderSource] = useState('manual');
  const [externalStatus, setExternalStatus] = useState('');
  const [externalOrderSn, setExternalOrderSn] = useState('');
  const [shopeeActionLoading, setShopeeActionLoading] = useState(false);
  const [fullOrderData, setFullOrderData] = useState<any>(null);
  const isShopeeOrder = orderSource === 'shopee';
  const isMarketplaceOrder = isMarketplaceSource(orderSource);
  const isPosOrder = orderSource === 'pos';

  // Print
  const [printMode, setPrintMode] = useState<'order' | 'packing' | null>(null);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Status management
  const [updating, setUpdating] = useState(false);

  // Payment record
  const [paymentRecord, setPaymentRecord] = useState<PaymentRecord | null>(null);

  // Status update confirmation modal (same UX as orders list)
  const [statusModal, setStatusModal] = useState<{
    show: boolean;
    nextStatus: string;
    statusType: 'order' | 'payment';
  }>({ show: false, nextStatus: '', statusType: 'order' });

  // Payment modal
  const [paymentModalShow, setPaymentModalShow] = useState(false);

  // Slip preview modal
  const [showSlipModal, setShowSlipModal] = useState(false);

  // Shopee financial details toggle
  const [showFinancial, setShowFinancial] = useState(false);

  // Delivery info edit
  const [editingDelivery, setEditingDelivery] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({
    delivery_name: '', delivery_phone: '', delivery_email: '',
    delivery_address: '', delivery_district: '', delivery_amphoe: '',
    delivery_province: '', delivery_postal_code: '',
  });
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deliveryErrors, setDeliveryErrors] = useState<Record<string, string>>({});

  // Toast (using global)

  useEffect(() => {
    if (!authLoading && userProfile && orderId) {
      fetchOrderHeader();
    }
  }, [authLoading, userProfile, orderId]);

  // Close modal on ESC key
  useEffect(() => {
    if (!statusModal.show) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStatusModal({ show: false, nextStatus: '', statusType: 'order' });
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [statusModal.show]);

  const fetchOrderHeader = async () => {
    try {
      setLoading(true);

      const response = await apiFetch(`/api/orders?id=${orderId}`);
      if (!response.ok) throw new Error('Failed to fetch order');

      const result = await response.json();
      const order = result.order;

      setOrderNumber(order.order_number);
      setOrderDate(order.order_date);
      setOrderStatus(order.order_status);
      setPaymentStatus(order.payment_status);
      setOrderSource(order.source || 'manual');
      setReceiptNumber(order.receipt_number || '');
      setExternalStatus(order.external_status || '');
      setExternalOrderSn(order.external_order_sn || '');
      setFullOrderData(order);

      // Pre-fill delivery form when incomplete (has some but not all required fields)
      if (!order.delivery_name || !order.delivery_phone || !order.delivery_address) {
        setDeliveryForm({
          delivery_name: order.delivery_name || '',
          delivery_phone: order.delivery_phone || '',
          delivery_email: order.delivery_email || '',
          delivery_address: order.delivery_address || '',
          delivery_district: order.delivery_district || '',
          delivery_amphoe: order.delivery_amphoe || '',
          delivery_province: order.delivery_province || '',
          delivery_postal_code: order.delivery_postal_code || '',
        });
      }

      if (order.payment_status === 'paid' || order.payment_status === 'verifying') {
        await fetchPaymentRecord();
      }
    } catch (err) {
      console.error('Error fetching order:', err);
      setError('ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้');
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentRecord = async () => {
    try {
      const response = await apiFetch(`/api/payment-records?order_id=${orderId}`);
      if (!response.ok) return;
      const result = await response.json();
      if (result.payment_records?.length > 0) {
        setPaymentRecord(result.payment_records[0]);
      }
    } catch (err) {
      console.error('Error fetching payment record:', err);
    }
  };

  // Delivery info handlers
  const handleEditDelivery = () => {
    if (!fullOrderData) return;
    setDeliveryForm({
      delivery_name: fullOrderData.delivery_name || '',
      delivery_phone: fullOrderData.delivery_phone || '',
      delivery_email: fullOrderData.delivery_email || '',
      delivery_address: fullOrderData.delivery_address || '',
      delivery_district: fullOrderData.delivery_district || '',
      delivery_amphoe: fullOrderData.delivery_amphoe || '',
      delivery_province: fullOrderData.delivery_province || '',
      delivery_postal_code: fullOrderData.delivery_postal_code || '',
    });
    setDeliveryErrors({});
    setEditingDelivery(true);
  };

  const handleSaveDelivery = async () => {
    const errors: Record<string, string> = {};
    if (!deliveryForm.delivery_name.trim()) errors.name = 'กรุณากรอกชื่อผู้รับ';
    const cleanPhone = deliveryForm.delivery_phone.replace(/[-\s]/g, '');
    if (!deliveryForm.delivery_phone.trim()) {
      errors.phone = 'กรุณากรอกเบอร์โทรศัพท์';
    } else if (!/^0\d{9}$/.test(cleanPhone)) {
      errors.phone = 'เบอร์โทรต้องเป็นตัวเลข 10 หลัก เริ่มด้วย 0';
    }
    if (deliveryForm.delivery_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deliveryForm.delivery_email)) {
      errors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
    }
    if (!deliveryForm.delivery_address.trim()) errors.address = 'กรุณากรอกที่อยู่จัดส่ง';
    if (!deliveryForm.delivery_province.trim()) errors.province = 'กรุณากรอกจังหวัด';
    if (!deliveryForm.delivery_postal_code.trim()) {
      errors.postal_code = 'กรุณากรอกรหัสไปรษณีย์';
    } else if (!/^\d{5}$/.test(deliveryForm.delivery_postal_code.trim())) {
      errors.postal_code = 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก';
    }
    if (Object.keys(errors).length > 0) {
      setDeliveryErrors(errors);
      return;
    }
    setDeliveryErrors({});
    setSavingDelivery(true);
    try {
      const response = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, ...deliveryForm }),
      });
      if (!response.ok) throw new Error('Failed to update');
      showToast('บันทึกข้อมูลจัดส่งสำเร็จ');
      setEditingDelivery(false);
      fetchOrderHeader();
    } catch {
      showToast('ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
      setSavingDelivery(false);
    }
  };

  // Status flow helpers
  const getNextOrderStatus = (status: string): string | null => {
    const flow: Record<string, string> = { new: 'ready_to_ship', ready_to_ship: 'processing', processing: 'shipping', shipping: 'completed' };
    return flow[status] || null;
  };

  const getOrderStatusLabel = (status: string): string => {
    if (status === 'cancelled' && fullOrderData?.cancellation_reason === 'expired') return 'หมดอายุ';
    const labels: Record<string, string> = { new: 'ใหม่', ready_to_ship: 'รอกดรับออเดอร์', processing: 'ที่ต้องจัดส่ง', shipping: 'กำลังส่ง', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };
    return labels[status] || status;
  };

  const getPaymentStatusLabel = (status: string): string => {
    const labels: Record<string, string> = { pending: 'รอชำระ', verifying: 'รอตรวจสอบ', paid: 'ชำระแล้ว', cancelled: 'ยกเลิก' };
    return labels[status] || status;
  };

  // Open status change confirmation modal
  const handleOrderStatusClick = () => {
    const nextStatus = getNextOrderStatus(orderStatus);
    if (!nextStatus) return;
    setStatusModal({ show: true, nextStatus, statusType: 'order' });
  };

  const handlePaymentStatusClick = () => {
    if (paymentStatus !== 'pending') return;
    setPaymentModalShow(true);
  };

  const handleCancelClick = () => {
    setStatusModal({ show: true, nextStatus: 'cancelled', statusType: 'order' });
  };

  const closeStatusModal = () => {
    setStatusModal({ show: false, nextStatus: '', statusType: 'order' });
  };

  // Confirm status update (order status only — payment handled by PaymentModal)
  const confirmStatusUpdate = async () => {
    try {
      setUpdating(true);

      const updateData: any = { id: orderId };
      updateData.order_status = statusModal.nextStatus;
      if (statusModal.nextStatus === 'cancelled') {
        updateData.payment_status = 'cancelled';
      }

      const response = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) throw new Error('Failed to update status');

      // Update local state
      setOrderStatus(statusModal.nextStatus);
      if (statusModal.nextStatus === 'cancelled') {
        setPaymentStatus('cancelled');
      }

      closeStatusModal();
      showToast(statusModal.nextStatus === 'cancelled' ? 'ยกเลิกคำสั่งซื้อสำเร็จ' : 'เปลี่ยนสถานะสำเร็จ');
    } catch (err) {
      console.error('Error updating status:', err);
      showToast('ไม่สามารถเปลี่ยนสถานะได้ กรุณาลองใหม่อีกครั้ง', 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Approve customer-initiated payment
  const handleApprovePayment = async () => {
    if (!paymentRecord) return;
    try {
      setUpdating(true);

      // Update payment_records.status = 'verified'
      const verifyRes = await apiFetch('/api/payment-records/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ payment_record_id: paymentRecord.id, action: 'verify' })
      });
      if (!verifyRes.ok) throw new Error('Failed to verify payment');

      // Update orders.payment_status = 'paid'
      await apiFetch('/api/orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: orderId, payment_status: 'paid' })
      });

      setPaymentStatus('paid');
      showToast('ยืนยันการชำระเงินสำเร็จ');
      await fetchPaymentRecord();
    } catch (err) {
      console.error('Error approving payment:', err);
      showToast('ไม่สามารถยืนยันการชำระเงินได้', 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Reject customer-initiated payment
  const handleRejectPayment = async () => {
    if (!paymentRecord) return;
    if (!confirm('ต้องการปฏิเสธการชำระเงินนี้หรือไม่?\n\nสถานะจะกลับเป็น "รอชำระ" ให้ลูกค้าแจ้งใหม่ได้')) return;

    try {
      setUpdating(true);

      // Update payment_records.status = 'rejected'
      await apiFetch('/api/payment-records/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ payment_record_id: paymentRecord.id, action: 'reject' })
      });

      // Update orders.payment_status = 'pending'
      await apiFetch('/api/orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: orderId, payment_status: 'pending' })
      });

      setPaymentStatus('pending');
      setPaymentRecord(null);
      showToast('ปฏิเสธการชำระเงินแล้ว');
    } catch (err) {
      console.error('Error rejecting payment:', err);
      showToast('ไม่สามารถปฏิเสธการชำระเงินได้', 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Shopee action handlers
  const handleAcceptShopeeOrder = async () => {
    try {
      setShopeeActionLoading(true);
      const response = await apiFetch('/api/shopee/orders/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to accept order');
      }
      showToast('รับออเดอร์ Shopee สำเร็จ');
      setExternalStatus('PROCESSED');
      setOrderStatus('shipping');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setShopeeActionLoading(false);
    }
  };

  // Key to force OrderForm remount after re-sync
  const [orderFormKey, setOrderFormKey] = useState(0);

  const handleResyncOrder = async () => {
    if (!externalOrderSn) return;
    try {
      setShopeeActionLoading(true);
      showToast('กำลัง sync ข้อมูลจาก Shopee...');
      const response = await apiFetch('/api/shopee/sync-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_sn: externalOrderSn,
          marketplace_account_id: fullOrderData?.marketplace_account_id,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }
      if (result.errors?.length > 0) {
        showToast(`Sync มีข้อผิดพลาด: ${result.errors[0]}`, 'error');
      } else {
        showToast('Sync ข้อมูลสำเร็จ');
      }
      // Fetch fresh order data (cache-bust to avoid stale response)
      const freshRes = await apiFetch(`/api/orders?id=${orderId}&_t=${Date.now()}`);
      if (freshRes.ok) {
        const freshResult = await freshRes.json();
        const freshOrder = freshResult.order;
        setOrderNumber(freshOrder.order_number);
        setOrderDate(freshOrder.order_date);
        setOrderStatus(freshOrder.order_status);
        setPaymentStatus(freshOrder.payment_status);
        setOrderSource(freshOrder.source || 'manual');
        setExternalStatus(freshOrder.external_status || '');
        setExternalOrderSn(freshOrder.external_order_sn || '');
        setFullOrderData(freshOrder);
        // Force OrderForm remount with fresh data
        setOrderFormKey(k => k + 1);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sync ไม่สำเร็จ', 'error');
    } finally {
      setShopeeActionLoading(false);
    }
  };

  const handlePrint = (mode: 'order' | 'packing') => {
    setShowPrintMenu(false);
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
      setPrintMode(null);
    }, 150);
  };

  const handlePrintInvoice = async () => {
    if (!fullOrderData) return;
    setShowPrintMenu(false);
    setGeneratingPdf(true);
    try {
      const blob = await generateOrderInvoicePdf({ data: fullOrderData });
      showPdfPreview(blob, getInvoiceMenuLabel(fullOrderData.payment_status, vatRegistered));
    } catch (err) {
      console.error('Error generating invoice PDF:', err);
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handlePrintPackingList = async () => {
    if (!fullOrderData) return;
    setShowPrintMenu(false);
    setGeneratingPdf(true);
    try {
      // Build order list (expand split parcels as separate entries)
      const ordersData: any[] = [];
      if (fullOrderData.is_split && fullOrderData.parcels?.length > 0) {
        for (const parcel of fullOrderData.parcels) {
          const parcelItems = (parcel.items || []).map((pi: any) => {
            const fullItem = fullOrderData.items?.find((i: any) => i.id === pi.order_item_id);
            return {
              product_name: pi.product_name || fullItem?.product_name || '',
              variation_label: pi.variation_label || fullItem?.variation_label || null,
              quantity: pi.quantity,
              image: pi.image || fullItem?.image || null,
              barcode: fullItem?.barcode || null,
              sku: fullItem?.sku || null,
              product_code: fullItem?.product_code || null,
            };
          });
          ordersData.push({
            ...fullOrderData,
            items: parcelItems.length > 0 ? parcelItems : fullOrderData.items,
            order_number: `${fullOrderData.order_number} (กล่อง ${parcel.parcel_number}/${fullOrderData.parcels.length})`,
          });
        }
      } else {
        ordersData.push(fullOrderData);
      }

      const blob = await generatePackingPdf(ordersData);
      showPdfPreview(blob, 'ใบจัดของ');
    } catch (err) {
      console.error('Error generating packing list PDF:', err);
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handlePrintShippingLabel = async () => {
    if (!fullOrderData) return;
    setShowPrintMenu(false);
    setGeneratingPdf(true);
    try {
      const blob = await generateShippingLabelPdf({ data: fullOrderData });
      showPdfPreview(blob, 'ใบปะหน้า');
    } catch (err) {
      console.error('Error generating shipping label PDF:', err);
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handlePrintShopeeLabel = async () => {
    try {
      setShopeeActionLoading(true);
      showToast('กำลังสร้างใบปะหน้า Shopee...');
      const response = await apiFetch('/api/shopee/orders/shipping-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate label');
      }
      const blob = await response.blob();
      showPdfPreview(blob, 'ใบปะหน้า Shopee');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setShopeeActionLoading(false);
    }
  };

  const handleOrderSaved = (savedOrderId: string) => {
    // Reload header to reflect changes
    fetchOrderHeader();
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="text-red-600 mb-4">{error}</div>
          <button
            onClick={() => router.push('/orders')}
            className="text-[#F4511E] hover:underline"
          >
            กลับไปหน้ารายการคำสั่งซื้อ
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 print:space-y-3 print:bg-white print:text-black">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/orders')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors print:hidden"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-slate-300" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1
                  className="text-2xl font-bold text-gray-900 dark:text-white print:text-black hover:text-[#F4511E] cursor-pointer transition-colors"
                  onClick={() => { navigator.clipboard.writeText(orderNumber).then(() => showToast('คัดลอกเลขคำสั่งซื้อแล้ว')); }}
                  title="คัดลอกเลขคำสั่งซื้อ"
                >{orderNumber}</h1>
                {isShopeeOrder && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    <img src="/marketplace/shopee.svg" alt="Shopee" className="w-3.5 h-3.5" />
                    Shopee
                  </span>
                )}
                {isPosOrder && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                    POS
                  </span>
                )}
                <OrderStatusBadge status={orderStatus} />
              </div>
              {features.delivery_date.enabled && orderDate && (
                <p className="text-sm text-gray-500 mt-0.5">
                  เปิดบิล {new Date(orderDate + 'T00:00:00').toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              )}
              {isPosOrder && receiptNumber && (
                <p className="text-sm text-gray-500 mt-0.5">
                  เลขที่ใบเสร็จ: {receiptNumber}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            {/* Manual: Record payment button (new + pending) */}
            {orderSource === 'manual' && orderStatus === 'new' && paymentStatus === 'pending' && (
              <button
                onClick={handlePaymentStatusClick}
                disabled={updating}
                className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5 text-sm font-medium disabled:opacity-50"
              >
                <Banknote className="w-4 h-4" />
                บันทึกชำระเงิน
              </button>
            )}
            {/* Manual: Accept Order button (ready_to_ship → processing) */}
            {orderSource === 'manual' && orderStatus === 'ready_to_ship' && (
              <button
                onClick={handleOrderStatusClick}
                disabled={updating}
                className="bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-1.5 text-sm font-medium disabled:opacity-50"
              >
                {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                รับออเดอร์
              </button>
            )}
            {/* Bill online - only for manual orders */}
            {orderSource === 'manual' && (
              <button
                onClick={() => {
                  const billUrl = `${window.location.origin}/bills/${orderId}`;
                  navigator.clipboard.writeText(billUrl).then(() => {
                    showToast('คัดลอกลิงก์บิลออนไลน์แล้ว');
                  });
                }}
                className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-1.5 text-sm"
              >
                <Link2 className="w-4 h-4" />
                บิลออนไลน์
              </button>
            )}
            {/* Manual: Cancel order icon button */}
            {orderSource === 'manual' && orderStatus !== 'completed' && orderStatus !== 'cancelled' && (
              <button
                onClick={handleCancelClick}
                disabled={updating}
                className="text-red-500 dark:text-red-400 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                title="ยกเลิกคำสั่งซื้อ"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
            {/* Shopee: Accept Order button */}
            {isShopeeOrder && externalStatus === 'READY_TO_SHIP' && (
              <button
                onClick={handleAcceptShopeeOrder}
                disabled={shopeeActionLoading}
                className="bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-1.5 text-sm font-medium disabled:opacity-50"
              >
                {shopeeActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                รับออเดอร์
              </button>
            )}
            {/* Shopee: Sync button */}
            {isShopeeOrder && (
              <button
                onClick={handleResyncOrder}
                disabled={shopeeActionLoading}
                className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                title="Sync ข้อมูลจาก Shopee ใหม่"
              >
                <RefreshCw className={`w-4 h-4 ${shopeeActionLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            {/* Print dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowPrintMenu(!showPrintMenu)}
                className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-1.5 text-sm"
              >
                <Printer className="w-4 h-4" />
                พิมพ์
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showPrintMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowPrintMenu(false)} />
                  <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg z-50 py-1">
                    {['processing', 'shipping', 'completed'].includes(orderStatus) && (
                      <button
                        onClick={handlePrintInvoice}
                        disabled={generatingPdf}
                        className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5 disabled:opacity-50"
                      >
                        {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Banknote className="w-4 h-4 text-gray-400" />}
                        {getInvoiceMenuLabel(paymentStatus, vatRegistered)}
                      </button>
                    )}
                    <button
                      onClick={() => handlePrint('order')}
                      className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5"
                    >
                      <FileText className="w-4 h-4 text-gray-400" />
                      ใบออเดอร์
                    </button>
                    {['processing', 'shipping', 'completed'].includes(orderStatus) && (
                      <button
                        onClick={handlePrintPackingList}
                        disabled={generatingPdf}
                        className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5 disabled:opacity-50"
                      >
                        <ClipboardList className="w-4 h-4 text-gray-400" />
                        ใบจัดของ
                      </button>
                    )}
                    {orderSource === 'manual' && ['processing', 'shipping'].includes(orderStatus) && (
                      <>
                        <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                        <button
                          onClick={handlePrintShippingLabel}
                          disabled={generatingPdf}
                          className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5 disabled:opacity-50"
                        >
                          <Package className="w-4 h-4 text-gray-400" />
                          ใบปะหน้า
                        </button>
                      </>
                    )}
                    {isShopeeOrder && externalStatus === 'PROCESSED' && (
                      <>
                        <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                        <button
                          onClick={() => {
                            setShowPrintMenu(false);
                            handlePrintShopeeLabel();
                          }}
                          disabled={shopeeActionLoading}
                          className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5 disabled:opacity-50"
                        >
                          <img src="/marketplace/shopee.svg" alt="Shopee" className="w-4 h-4" />
                          ใบปะหน้า Shopee
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Read-only warnings */}
        {isShopeeOrder && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40 text-orange-800 dark:text-orange-300 px-4 py-3 rounded-lg text-sm flex items-center gap-2 print:hidden">
            <img src="/marketplace/shopee.svg" alt="Shopee" className="w-4 h-4" />
            ออเดอร์จาก Shopee ไม่สามารถแก้ไขได้
          </div>
        )}
        {!isMarketplaceOrder && (() => {
          const isManualReadOnly = orderStatus !== 'new' || paymentStatus !== 'pending';
          if (!isManualReadOnly) return null;
          const statusLabels: Record<string, string> = { new: 'ใหม่', ready_to_ship: 'รอกดรับออเดอร์', processing: 'ที่ต้องจัดส่ง', shipping: 'กำลังส่ง', completed: 'สำเร็จ', cancelled: fullOrderData?.cancellation_reason === 'expired' ? 'หมดอายุ' : 'ยกเลิก' };
          const paymentLabels: Record<string, string> = { pending: 'รอชำระ', verifying: 'รอตรวจสอบ', paid: 'ชำระแล้ว', cancelled: 'ยกเลิก' };
          const reasonMessage = orderStatus !== 'new'
            ? `สถานะออเดอร์ "${statusLabels[orderStatus] || orderStatus}"`
            : `สถานะชำระเงิน "${paymentLabels[paymentStatus] || paymentStatus}"`;
          return (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 text-yellow-800 dark:text-yellow-300 px-4 py-3 rounded-lg text-sm print:hidden">
              คำสั่งซื้อ {orderNumber} ({reasonMessage}) — ไม่สามารถแก้ไขได้
            </div>
          );
        })()}

        {/* Status Management + Customer — 2-column layout (hidden on print) */}
        {orderStatus !== 'cancelled' && !isMarketplaceOrder && !isPosOrder && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:hidden">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            {/* Status badges row */}
            <div>
              <div className="text-base font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">สถานะ</div>
              <div className="flex items-center gap-2 flex-wrap">
                <OrderStatusBadge status={orderStatus} />
                <PaymentStatusBadge status={paymentStatus} />
              </div>
            </div>

            {/* Divider between badges and actions/payment info */}
            <div className="border-t border-gray-200 dark:border-slate-600" />

            {/* Order status actions — advance button (skip new & ready_to_ship, handled by header) */}
            {getNextOrderStatus(orderStatus) && orderStatus !== 'ready_to_ship' && orderStatus !== 'new' && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleOrderStatusClick}
                  disabled={updating}
                  className="px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors font-medium text-sm flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                >
                  <Truck className="w-4 h-4" />
                  เปลี่ยนเป็น &quot;{getOrderStatusLabel(getNextOrderStatus(orderStatus)!)}&quot;
                </button>
              </div>
            )}

            {/* Payment actions (skip for 'new' — header handles it) */}
            {paymentStatus === 'pending' && orderStatus !== 'new' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePaymentStatusClick}
                  disabled={updating}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                >
                  <Banknote className="w-4 h-4" />
                  บันทึกชำระเงิน
                </button>
              </div>
            )}
            {paymentStatus === 'verifying' && paymentRecord && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                    {paymentRecord.payment_method === 'transfer' ? 'โอนเงิน' : 'เงินสด'}
                    {paymentRecord.transfer_date && ` ${new Date(paymentRecord.transfer_date).toLocaleDateString('th-TH')}`}
                  </span>
                  {paymentRecord.slip_image_url && (
                    <button
                      onClick={() => setShowSlipModal(true)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 underline flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      ดูสลิป
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRejectPayment}
                    disabled={updating}
                    className="px-3 py-1.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <ShieldX className="w-4 h-4" />
                    ปฏิเสธ
                  </button>
                  <button
                    onClick={handleApprovePayment}
                    disabled={updating}
                    className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    ยืนยันการชำระเงิน
                  </button>
                </div>
              </div>
            )}
            {paymentStatus === 'paid' && paymentRecord && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded">
                  {paymentRecord.payment_method === 'cash' && 'เงินสด'}
                  {paymentRecord.payment_method === 'transfer' && 'โอนเงิน'}
                  {paymentRecord.payment_method === 'credit' && 'เครดิต'}
                  {paymentRecord.payment_method === 'cheque' && 'เช็ค'}
                  {paymentRecord.amount > 0 && ` ฿${formatPrice(paymentRecord.amount)}`}
                </span>
                {paymentRecord.payment_method === 'cash' && paymentRecord.collected_by && (
                  <span className="text-xs text-gray-500 dark:text-slate-400">คนเก็บ: {paymentRecord.collected_by}</span>
                )}
                {paymentRecord.payment_method === 'transfer' && paymentRecord.transfer_date && (
                  <span className="text-xs text-gray-500 dark:text-slate-400">{new Date(paymentRecord.transfer_date).toLocaleDateString('th-TH')}</span>
                )}
                {paymentRecord.slip_image_url && (
                  <button
                    onClick={() => setShowSlipModal(true)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 underline flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    ดูสลิป
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: Customer + Delivery Info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-base font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">ลูกค้า</div>
              {['new', 'ready_to_ship'].includes(orderStatus) && !editingDelivery && (
                <button
                  onClick={handleEditDelivery}
                  className="text-xs text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300 flex items-center gap-1 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  แก้ไข
                </button>
              )}
            </div>
            {fullOrderData?.customer && (
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0" />
                <span className="text-sm font-medium text-gray-900 dark:text-slate-200">{fullOrderData.customer.name}</span>
                {fullOrderData.customer.phone && (
                  <span className="text-xs text-gray-400 dark:text-slate-500">· {fullOrderData.customer.phone}</span>
                )}
              </div>
            )}
            {/* Delivery Info */}
            {(fullOrderData?.delivery_name || fullOrderData?.delivery_address) && (
              <div className="space-y-1.5 text-sm">
                <div className="text-xs font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wide">ข้อมูลจัดส่ง</div>
                {fullOrderData.delivery_name && (
                  <div className="text-gray-800 dark:text-slate-200 font-medium">{fullOrderData.delivery_name}{fullOrderData.delivery_phone ? ` · ${fullOrderData.delivery_phone}` : ''}</div>
                )}
                {fullOrderData.delivery_address && (
                  <div className="text-gray-600 dark:text-slate-400">
                    {[fullOrderData.delivery_address, fullOrderData.delivery_district, fullOrderData.delivery_amphoe, fullOrderData.delivery_province, fullOrderData.delivery_postal_code].filter(Boolean).join(' ')}
                  </div>
                )}
              </div>
            )}
            {!fullOrderData?.customer && !fullOrderData?.delivery_name && !fullOrderData?.delivery_address && (
              <div className="text-sm text-gray-400 dark:text-slate-500">ไม่มีข้อมูลลูกค้า</div>
            )}
            {/* Tracking / Parcels */}
            {fullOrderData?.is_split && fullOrderData?.parcels?.length > 0 ? (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600">
                <div className="text-xs font-medium text-gray-400 dark:text-slate-500 mb-2">กล่องพัสดุ ({fullOrderData.parcels.length} กล่อง)</div>
                <div className="space-y-2">
                  {fullOrderData.parcels.map((parcel: any) => (
                    <div key={parcel.id} className="p-2.5 rounded-lg bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-600">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700 dark:text-slate-200 flex items-center gap-1">
                          <Package className="w-3 h-3 text-purple-500" />
                          กล่องที่ {parcel.parcel_number}/{fullOrderData.parcels.length}
                        </span>
                        {parcel.status && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            parcel.status === 'shipped' || parcel.status === 'delivered'
                              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-600 dark:text-gray-300'
                          }`}>
                            {parcel.status === 'pending' ? 'รอจัดส่ง' : parcel.status === 'shipped' ? 'จัดส่งแล้ว' : parcel.status === 'delivered' ? 'ส่งถึงแล้ว' : parcel.status}
                          </span>
                        )}
                      </div>
                      {(parcel.tracking_number || parcel.shipping_carrier) && (
                        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-slate-400">
                          {parcel.shipping_carrier && <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {parcel.shipping_carrier}</span>}
                          {parcel.tracking_number && <span className="font-mono">{parcel.tracking_number}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (fullOrderData?.tracking_number || fullOrderData?.shipping_carrier) ? (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600 flex items-center gap-4 text-sm">
                {fullOrderData.shipping_carrier && (
                  <span className="text-gray-700 dark:text-slate-300 flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> {fullOrderData.shipping_carrier}</span>
                )}
                {fullOrderData.tracking_number && (
                  <span className="font-mono text-gray-600 dark:text-slate-400">{fullOrderData.tracking_number}</span>
                )}
              </div>
            ) : null}
            {/* Tax Invoice */}
            {fullOrderData?.tax_invoice_requested && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600 space-y-1.5">
                <span className="text-xs font-medium text-[#F4511E] bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded">ขอใบกำกับภาษี</span>
                {fullOrderData.tax_invoice_name && (
                  <div className="text-sm text-gray-700 dark:text-slate-300">{fullOrderData.tax_invoice_name}</div>
                )}
                {fullOrderData.tax_invoice_tax_id && (
                  <div className="text-xs text-gray-500 dark:text-slate-400">เลขผู้เสียภาษี: {fullOrderData.tax_invoice_tax_id}</div>
                )}
              </div>
            )}
          </div>
          </div>
        )}

        {/* Marketplace Status + Customer — 2-column layout (hidden on print) */}
        {orderStatus !== 'cancelled' && isMarketplaceOrder && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:hidden">
            {/* Left: Status */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
              <div>
                <div className="text-base font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">สถานะ</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <OrderStatusBadge status={orderStatus} />
                  <PaymentStatusBadge status={paymentStatus} />
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-900/20 text-xs font-medium text-orange-600 dark:text-orange-400">
                    <img src="/marketplace/shopee.svg" alt="Shopee" className="w-3.5 h-3.5" />
                    Shopee
                  </span>
                </div>
              </div>

              {/* Buyer's note */}
              {fullOrderData?.external_data?.note && (
                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-500 dark:text-slate-400">ข้อความจากผู้ซื้อ:</span>
                  <p className="text-sm text-gray-700 dark:text-slate-200 mt-0.5">{fullOrderData.external_data.note}</p>
                </div>
              )}

              {/* Financial Breakdown (collapsible) */}
              {(() => {
                const escrow = fullOrderData?.external_data?.escrow_detail;
                const orderIncome = escrow?.order_income || escrow;
                if (!escrow) {
                  const estShipping = fullOrderData?.external_data?.estimated_shipping_fee;
                  if (estShipping && estShipping > 0) {
                    return (
                      <div className="border-t border-gray-200 dark:border-slate-600 pt-3">
                        <div className="flex justify-between text-sm text-gray-600 dark:text-slate-300">
                          <span>ค่าส่ง (ประมาณ)</span>
                          <span>฿{formatPrice(estShipping)}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }

                const buyerTotal = Number(orderIncome?.buyer_total_amount ?? escrow?.buyer_total_amount ?? 0);
                const actualShipping = Number(orderIncome?.actual_shipping_fee ?? escrow?.actual_shipping_fee ?? 0);
                const originalPrice = Number(orderIncome?.original_price ?? escrow?.original_price ?? 0);
                const voucherSeller = Number(orderIncome?.voucher_from_seller ?? escrow?.voucher_from_seller ?? 0);
                const voucherShopee = Number(orderIncome?.voucher_from_shopee ?? escrow?.voucher_from_shopee ?? 0);
                const coins = Number(orderIncome?.coins ?? escrow?.coins ?? 0);
                const sellerDiscount = Number(orderIncome?.seller_discount ?? escrow?.seller_discount ?? 0);
                const shopeeDiscount = Number(orderIncome?.shopee_discount ?? escrow?.shopee_discount ?? 0);
                const commissionFee = Number(orderIncome?.commission_fee ?? escrow?.commission_fee ?? 0);
                const serviceFee = Number(orderIncome?.service_fee ?? escrow?.service_fee ?? 0);
                const escrowAmount = Number(orderIncome?.escrow_amount ?? escrow?.escrow_amount ?? 0);

                const itemList = fullOrderData?.external_data?.item_list || [];
                const sellingPrice = itemList.reduce((sum: number, item: any) => {
                  const price = item.model_discounted_price || item.model_original_price || 0;
                  const qty = item.model_quantity_purchased || 1;
                  return sum + (price * qty);
                }, 0);

                const basePrice = sellingPrice > 0 ? sellingPrice : originalPrice;
                const pct = (val: number) => basePrice > 0 ? ((val / basePrice) * 100).toFixed(1) : '0';
                const totalSellerDiscount = voucherSeller + sellerDiscount;
                const totalShopeeDiscount = voucherShopee + shopeeDiscount + coins;
                const totalFees = commissionFee + serviceFee;

                return (
                  <div className="border-t border-gray-200 dark:border-slate-600 pt-3">
                    <button
                      onClick={() => setShowFinancial(!showFinancial)}
                      className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-slate-300 hover:text-gray-800 dark:hover:text-slate-100 transition-colors w-full"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${showFinancial ? 'rotate-0' : '-rotate-90'}`} />
                      <span>รายละเอียดทางการเงิน</span>
                      <span className="ml-auto text-green-600 dark:text-green-400 font-semibold">฿{formatPrice(escrowAmount)}</span>
                    </button>
                    {showFinancial && (
                      <div className="mt-3 space-y-2 pl-6">
                        <div className="flex justify-between text-sm font-medium">
                          <span className="text-gray-600 dark:text-slate-300">ราคาขาย</span>
                          <span className="text-gray-800 dark:text-slate-200">฿{formatPrice(basePrice)}</span>
                        </div>
                        {totalSellerDiscount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-slate-300">ส่วนลดจากร้าน</span>
                            <span className="text-red-500 dark:text-red-400">-฿{formatPrice(totalSellerDiscount)} <span className="text-gray-400 dark:text-slate-500">({pct(totalSellerDiscount)}%)</span></span>
                          </div>
                        )}
                        {totalShopeeDiscount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-slate-300">ส่วนลดจาก Shopee</span>
                            <span className="text-orange-500 dark:text-orange-400">-฿{formatPrice(totalShopeeDiscount)} <span className="text-gray-400 dark:text-slate-500">({pct(totalShopeeDiscount)}%)</span></span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm pt-1 border-t border-gray-100 dark:border-slate-700">
                          <span className="text-gray-600 dark:text-slate-300">ยอดที่ผู้ซื้อจ่าย</span>
                          <span className="text-gray-800 dark:text-slate-200">฿{formatPrice(buyerTotal)}</span>
                        </div>
                        {actualShipping > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-slate-300">ค่าส่ง (ผู้ซื้อจ่าย)</span>
                            <span className="text-gray-800 dark:text-slate-200">฿{formatPrice(actualShipping)}</span>
                          </div>
                        )}
                        {totalFees > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-slate-300">ค่าธรรมเนียม Shopee</span>
                            <span className="text-red-500 dark:text-red-400">-฿{formatPrice(totalFees)} <span className="text-gray-400 dark:text-slate-500">({pct(totalFees)}%)</span></span>
                          </div>
                        )}
                        <div className="flex justify-between text-base font-semibold pt-2 border-t border-gray-200 dark:border-slate-600">
                          <span className="text-gray-700 dark:text-slate-200">ยอดที่ได้รับจริง</span>
                          <span className="text-green-600 dark:text-green-400">฿{formatPrice(escrowAmount)} {basePrice > 0 && <span className="text-sm font-normal text-gray-400 dark:text-slate-500">({(escrowAmount / basePrice * 100).toFixed(1)}%)</span>}</span>
                        </div>
                        {basePrice > 0 && (() => {
                          const totalDeducted = basePrice - escrowAmount;
                          const deductedPct = (totalDeducted / basePrice * 100).toFixed(1);
                          return (
                            <div className="text-xs pt-1 text-right">
                              <span className="text-gray-400 dark:text-slate-500">ขาย ฿{formatPrice(basePrice)} โดนหักรวม ฿{formatPrice(totalDeducted)} ({deductedPct}%)</span>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Right: Customer Info */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
              <div className="text-base font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">ลูกค้า</div>
              {fullOrderData?.customer ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-slate-200">{fullOrderData.customer.name}</span>
                  </div>
                  {fullOrderData.customer.phone && (
                    <div className="text-sm text-gray-600 dark:text-slate-400 pl-6">{fullOrderData.customer.phone}</div>
                  )}
                  {fullOrderData.delivery_address && (
                    <div className="text-sm text-gray-600 dark:text-slate-400 pl-6">
                      {[fullOrderData.delivery_address, fullOrderData.delivery_district, fullOrderData.delivery_amphoe, fullOrderData.delivery_province, fullOrderData.delivery_postal_code].filter(Boolean).join(' ')}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400 dark:text-slate-500">ไม่มีข้อมูลลูกค้า</div>
              )}
              {fullOrderData?.tax_invoice_requested && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600 space-y-1.5">
                  <span className="text-xs font-medium text-[#F4511E] bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded">ขอใบกำกับภาษี</span>
                  {fullOrderData.tax_invoice_name && (
                    <div className="text-sm text-gray-700 dark:text-slate-300">{fullOrderData.tax_invoice_name}</div>
                  )}
                  {fullOrderData.tax_invoice_tax_id && (
                    <div className="text-xs text-gray-500 dark:text-slate-400">เลขผู้เสียภาษี: {fullOrderData.tax_invoice_tax_id}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* POS Order Status + Customer — 2-column layout */}
        {orderStatus !== 'cancelled' && isPosOrder && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:hidden">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <div className="text-base font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">สถานะ</div>
            <div className="flex items-center gap-2 flex-wrap">
              <OrderStatusBadge status={orderStatus} />
              <PaymentStatusBadge status={paymentStatus} />
              <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                POS — ชำระเงินแล้ว
              </span>
            </div>
          </div>

          {/* Right: Customer Info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <div className="text-base font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">ลูกค้า</div>
            {fullOrderData?.customer ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-200">{fullOrderData.customer.name}</span>
                </div>
                {fullOrderData.customer.phone && (
                  <div className="text-sm text-gray-600 dark:text-slate-400 pl-6">{fullOrderData.customer.phone}</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-400 dark:text-slate-500">ลูกค้าหน้าร้าน</div>
            )}
          </div>
          </div>
        )}

        {/* Cancelled status info */}
        {orderStatus === 'cancelled' && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl p-5">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">คำสั่งซื้อนี้ถูกยกเลิกแล้ว</span>
            </div>
          </div>
        )}

        {/* Delivery Edit Form — only show when editing or delivery info incomplete */}
        {fullOrderData && !isMarketplaceOrder && !isPosOrder && (() => {
          const deliveryComplete = !!(fullOrderData.delivery_name && fullOrderData.delivery_phone && fullOrderData.delivery_address);
          // Only show this section when editing OR when delivery info is incomplete and status allows editing
          if (deliveryComplete && !editingDelivery) return null;
          if (!deliveryComplete && !['new', 'ready_to_ship'].includes(orderStatus)) return null;
          return (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 print:hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">{editingDelivery ? 'แก้ไขข้อมูลจัดส่ง' : 'กรอกข้อมูลจัดส่ง'}</div>
            </div>

            <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">ชื่อผู้รับ *</label>
                    <input type="text" value={deliveryForm.delivery_name}
                      onChange={e => { setDeliveryForm(f => ({ ...f, delivery_name: e.target.value })); setDeliveryErrors(prev => { const { name, ...rest } = prev; return rest; }); }}
                      className={`w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 ${deliveryErrors.name ? 'border-red-500' : 'border-gray-300 dark:border-slate-600'}`} />
                    {deliveryErrors.name && <p className="text-red-500 text-xs mt-1">{deliveryErrors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">เบอร์โทร *</label>
                    <input type="text" inputMode="tel" value={deliveryForm.delivery_phone}
                      onChange={e => { setDeliveryForm(f => ({ ...f, delivery_phone: e.target.value })); setDeliveryErrors(prev => { const { phone, ...rest } = prev; return rest; }); }}
                      className={`w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 ${deliveryErrors.phone ? 'border-red-500' : 'border-gray-300 dark:border-slate-600'}`} />
                    {deliveryErrors.phone && <p className="text-red-500 text-xs mt-1">{deliveryErrors.phone}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">อีเมล</label>
                  <input type="text" inputMode="email" value={deliveryForm.delivery_email}
                    onChange={e => { setDeliveryForm(f => ({ ...f, delivery_email: e.target.value })); setDeliveryErrors(prev => { const { email, ...rest } = prev; return rest; }); }}
                    className={`w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 ${deliveryErrors.email ? 'border-red-500' : 'border-gray-300 dark:border-slate-600'}`} />
                  {deliveryErrors.email && <p className="text-red-500 text-xs mt-1">{deliveryErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">ที่อยู่ *</label>
                  <textarea value={deliveryForm.delivery_address}
                    onChange={e => { setDeliveryForm(f => ({ ...f, delivery_address: e.target.value })); setDeliveryErrors(prev => { const { address, ...rest } = prev; return rest; }); }}
                    rows={2}
                    className={`w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 ${deliveryErrors.address ? 'border-red-500' : 'border-gray-300 dark:border-slate-600'}`} />
                  {deliveryErrors.address && <p className="text-red-500 text-xs mt-1">{deliveryErrors.address}</p>}
                </div>
                <ThaiAddressInput
                  district={deliveryForm.delivery_district}
                  amphoe={deliveryForm.delivery_amphoe}
                  province={deliveryForm.delivery_province}
                  postalCode={deliveryForm.delivery_postal_code}
                  onAddressChange={(addr) => {
                    setDeliveryForm(f => ({
                      ...f,
                      ...(addr.district !== undefined && { delivery_district: addr.district }),
                      ...(addr.amphoe !== undefined && { delivery_amphoe: addr.amphoe }),
                      ...(addr.province !== undefined && { delivery_province: addr.province }),
                      ...(addr.postalCode !== undefined && { delivery_postal_code: addr.postalCode }),
                    }));
                  }}
                />
                {(deliveryErrors.province || deliveryErrors.postal_code) && (
                  <p className="text-red-500 text-xs -mt-1">{deliveryErrors.province || deliveryErrors.postal_code}</p>
                )}
                <div className="flex gap-2 pt-1">
                  {editingDelivery && (
                    <button
                      onClick={() => setEditingDelivery(false)}
                      className="flex-1 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      ยกเลิก
                    </button>
                  )}
                  <button
                    onClick={handleSaveDelivery}
                    disabled={savingDelivery || !deliveryForm.delivery_name || !deliveryForm.delivery_phone || !deliveryForm.delivery_address || !deliveryForm.delivery_province || !deliveryForm.delivery_postal_code}
                    className="flex-1 py-2 bg-[#F4511E] text-white rounded-lg text-sm font-medium hover:bg-[#D63B0E] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                  >
                    {savingDelivery && <Loader2 className="w-4 h-4 animate-spin" />}
                    บันทึก
                  </button>
                </div>
              </div>
          </div>
          );
        })()}

        {/* OrderForm - Edit or Read-only */}
        <OrderForm
          key={orderFormKey}
          editOrderId={orderId}
          preloadedOrder={fullOrderData}
          onSuccess={handleOrderSaved}
          onCancel={() => router.push('/orders')}
          printMode={printMode}
        />

        {/* Status Update Confirmation Modal (order status only) */}
        {statusModal.show && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={closeStatusModal}
          >
            <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {statusModal.nextStatus === 'cancelled'
                    ? 'ยืนยันการยกเลิกคำสั่งซื้อ'
                    : 'ยืนยันการเปลี่ยนสถานะคำสั่งซื้อ'
                  }
                </h3>
                <button onClick={closeStatusModal} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="mb-6 space-y-3">
                <p className="text-gray-700 dark:text-slate-300">
                  คำสั่งซื้อ: <span className="font-medium">{orderNumber}</span>
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600 dark:text-slate-400">เปลี่ยนจาก:</span>
                  <OrderStatusBadge status={orderStatus} />
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <OrderStatusBadge status={statusModal.nextStatus} />
                </div>

                {/* Warning for cancel */}
                {statusModal.nextStatus === 'cancelled' && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    การยกเลิกคำสั่งซื้อจะไม่สามารถกลับคืนได้
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={closeStatusModal}
                  disabled={updating}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={confirmStatusUpdate}
                  disabled={updating}
                  className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 font-medium ${
                    statusModal.nextStatus === 'cancelled'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-[#F4511E] text-white hover:bg-[#D63B0E]'
                  }`}
                >
                  {updating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <span>{statusModal.nextStatus === 'cancelled' ? 'ยืนยันยกเลิก' : 'ยืนยัน'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment Modal (shared component) */}
        <PaymentModal
          show={paymentModalShow}
          orderId={orderId as string}
          orderNumber={orderNumber}
          totalAmount={fullOrderData?.total_amount || 0}
          onClose={() => setPaymentModalShow(false)}
          onSuccess={async () => {
            setPaymentModalShow(false);
            setPaymentStatus('paid');
            fetchPaymentRecord();
            // Refetch order to get updated order_status (auto-advance new → ready_to_ship)
            const freshRes = await apiFetch(`/api/orders?id=${orderId}&_t=${Date.now()}`);
            if (freshRes.ok) {
              const freshResult = await freshRes.json();
              const freshOrder = freshResult.order;
              setOrderStatus(freshOrder.order_status);
              setFullOrderData(freshOrder);
            }
          }}
        />
        {/* Slip Preview Modal */}
        {showSlipModal && paymentRecord?.slip_image_url && (
          <div
            className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
            onClick={() => setShowSlipModal(false)}
          >
            <div className="relative max-w-lg w-full max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowSlipModal(false)}
                className="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors z-10"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
              <img
                src={paymentRecord.slip_image_url}
                alt="สลิปการชำระเงิน"
                className="w-full max-h-[85vh] object-contain rounded-lg bg-white"
              />
            </div>
          </div>
        )}

      </div>

    </Layout>
  );
}
