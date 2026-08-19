'use client';

import { useState, useEffect, useRef } from 'react';
import { useCopy } from '@/lib/useCopy';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import NumberInput from '@/components/ui/NumberInput';
import FormInput from '@/components/ui/FormInput';
import { LoadingCard } from '@/components/ui/StateCard';
import OrderForm from '@/components/orders/OrderForm';
import TaxInvoiceEditModal, { type TaxInvoiceSnapshot } from '@/components/ui/TaxInvoiceEditModal';
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
  ReceiptText,
  Undo2,
  Repeat,
  Copy,
} from 'lucide-react';
import PaymentModal from '../components/PaymentModal';
import ShopeeShipModal from '../components/ShopeeShipModal';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import { generateOrderInvoicePdf } from '@/lib/order-invoice-pdf';
import { generatePackingPdf } from '@/lib/orders-packing-pdf';
import { generateShippingLabelPdf } from '@/lib/order-shipping-label-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import { isMarketplaceSource } from '@/lib/marketplace/types';
import { PLATFORM_ICONS, getTrackingUrl, getCarrierLabel } from '../components/types';
import { useCarriers } from '@/lib/carrier-lookup';
import FormSelect from '@/components/ui/FormSelect';
import { useConfirmDialog } from '@/lib/useConfirmDialog';

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

export default function OrderDetailPage({ overrideBackUrl }: { overrideBackUrl?: string } = {}) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = params.id as string;
  const backUrl = overrideBackUrl || searchParams.get('back') || '/orders';
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const copy = useCopy();
  const { features } = useFeatures();
  const { currentCompany } = useCompany();
  const vatRegistered = currentCompany?.vat_registered || false;
  const { confirmDialog, confirm } = useConfirmDialog();
  const { active: activeCarriers } = useCarriers();
  const carrierOptions = activeCarriers.map(c => ({ id: c.code, label: c.name }));

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
  const [showShopeeShipModal, setShowShopeeShipModal] = useState(false);
  const [fullOrderData, setFullOrderData] = useState<any>(null);
  const isShopeeOrder = orderSource === 'shopee';
  const isMarketplaceOrder = isMarketplaceSource(orderSource);
  const isPosOrder = orderSource === 'pos';

  // Print
  const [printMode, setPrintMode] = useState<'order' | 'packing' | null>(null);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);

  // Ship modal
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipCarrier, setShipCarrier] = useState('');
  const [shipTracking, setShipTracking] = useState('');
  const [shipLoading, setShipLoading] = useState(false);
  const [editingShipping, setEditingShipping] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Status management
  const [updating, setUpdating] = useState(false);

  // Payment record
  const [paymentRecord, setPaymentRecord] = useState<PaymentRecord | null>(null);

  // Status update confirmation modal (same UX as orders list)
  // Payment modal
  const [paymentModalShow, setPaymentModalShow] = useState(false);

  // Slip preview modal
  const [showSlipModal, setShowSlipModal] = useState(false);

  // Shopee financial details toggle
  const [showFinancial, setShowFinancial] = useState(false);

  // Credit Notes
  const [creditNotes, setCreditNotes] = useState<any[]>([]);
  const [voidLoading, setVoidLoading] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundItems, setRefundItems] = useState<{ order_item_id: string; quantity: number; max: number; name: string; image?: string | null }[]>([]);
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [showActionTypeModal, setShowActionTypeModal] = useState(false);

  // Delivery info edit (modal)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({
    delivery_name: '', delivery_phone: '', delivery_email: '',
    delivery_address: '', delivery_district: '', delivery_amphoe: '',
    delivery_province: '', delivery_postal_code: '',
  });
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deliveryErrors, setDeliveryErrors] = useState<Record<string, string>>({});

  // Tax invoice edit (modal)
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [savingTax, setSavingTax] = useState(false);

  // Portal refs for warehouse + sales channel pickers (rendered by OrderForm)
  const warehouseRef = useRef<HTMLDivElement>(null);
  const salesChannelRef = useRef<HTMLDivElement>(null);

  // Toast (using global)

  useEffect(() => {
    if (!authLoading && userProfile && orderId) {
      fetchOrderHeader();
    }
  }, [authLoading, userProfile, orderId]);

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
    setShowDeliveryModal(true);
  };

  // Tax invoice edit handlers
  const taxSnapshot: TaxInvoiceSnapshot = {
    tax_type: (fullOrderData?.tax_invoice_type === 'corporate' ? 'corporate' : 'personal') as 'personal' | 'corporate',
    tax_company_name: fullOrderData?.tax_invoice_name || '',
    tax_id: fullOrderData?.tax_invoice_tax_id || '',
    tax_branch: fullOrderData?.tax_invoice_branch || '',
    billing_address: fullOrderData?.tax_invoice_address || '',
  };
  const handleSaveTaxInvoice = async (snap: TaxInvoiceSnapshot, alsoUpdateCustomer = false) => {
    try {
      setSavingTax(true);
      const orderPatch = {
        id: orderId,
        tax_invoice_requested: true,
        tax_invoice_type: snap.tax_type,
        tax_invoice_name: snap.tax_company_name,
        tax_invoice_tax_id: snap.tax_id,
        tax_invoice_branch: snap.tax_branch,
        tax_invoice_address: snap.billing_address,
      };
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPatch),
      });
      if (!res.ok) throw new Error('Failed to update tax invoice');

      if (alsoUpdateCustomer && fullOrderData?.customer?.id) {
        await apiFetch('/api/customers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: fullOrderData.customer.id,
            tax_type: snap.tax_type,
            tax_company_name: snap.tax_company_name,
            tax_id: snap.tax_id,
            tax_branch: snap.tax_branch,
            billing_address: snap.billing_address,
          }),
        });
      }
      showToast(alsoUpdateCustomer ? 'บันทึกใบกำกับและอัพเดทข้อมูลลูกค้าสำเร็จ' : 'บันทึกใบกำกับสำเร็จ');
      setShowTaxModal(false);
      await fetchOrderHeader();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถบันทึกใบกำกับได้', 'error');
    } finally {
      setSavingTax(false);
    }
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
      setShowDeliveryModal(false);
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

  // Accept order directly (no confirm modal)
  const handleOrderStatusClick = async () => {
    const nextStatus = getNextOrderStatus(orderStatus);
    if (!nextStatus) return;
    try {
      setUpdating(true);
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, order_status: nextStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      showToast('รับออเดอร์สำเร็จ');
      await fetchOrderHeader();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถรับออเดอร์ได้', 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Ship order with tracking (manual → completed directly) / Edit tracking
  const handleShipOrder = async () => {
    try {
      setShipLoading(true);
      const payload: Record<string, unknown> = {
        id: orderId,
        tracking_number: shipTracking || null,
        shipping_carrier: shipCarrier || null,
      };
      // Only change status if not editing existing shipping info
      if (!editingShipping) {
        payload.order_status = 'completed';
      }
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      showToast(editingShipping ? 'แก้ไขข้อมูลจัดส่งสำเร็จ' : 'จัดส่งสำเร็จ');
      setShowShipModal(false);
      setEditingShipping(false);
      setShipCarrier('');
      setShipTracking('');
      await fetchOrderHeader();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setShipLoading(false);
    }
  };

  const handlePaymentStatusClick = () => {
    if (paymentStatus !== 'pending') return;
    setPaymentModalShow(true);
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
    const ok = await confirm({ title: 'ต้องการปฏิเสธการชำระเงินนี้?', description: 'สถานะจะกลับเป็น "รอชำระ" ให้ลูกค้าแจ้งใหม่ได้', variant: 'danger' }); if (!ok) return;

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
  const handleAcceptShopeeOrder = () => {
    setShowShopeeShipModal(true);
  };

  const handleShopeeShipSuccess = () => {
    setShowShopeeShipModal(false);
    setExternalStatus('PROCESSED');
    setOrderStatus('processing');
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
      const dropshipSender = fullOrderData.customer?.customer_type === 'dropship'
        ? { sender_name: fullOrderData.customer.name || '', sender_phone: fullOrderData.customer.phone || '' }
        : {};
      const blob = await generateShippingLabelPdf({ data: { ...fullOrderData, ...dropshipSender } });
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

  // Credit Notes
  const fetchCreditNotes = async () => {
    try {
      const res = await apiFetch(`/api/credit-notes?order_id=${orderId}`);
      if (res.ok) {
        const result = await res.json();
        setCreditNotes(result.data || []);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (orderId && !authLoading && userProfile) {
      fetchCreditNotes();
    }
  }, [orderId, authLoading, userProfile]);

  const handleVoid = async () => {
    const isPaid = paymentStatus === 'paid';
    const ok = await confirm({
      title: 'ยกเลิกบิล',
      description: isPaid
        ? 'ระบบจะออกใบลดหนี้ (Credit Note) และยกเลิกบิลนี้ สต๊อกจะถูกคืนอัตโนมัติ'
        : 'ระบบจะยกเลิกบิลนี้ สต๊อกจะถูกคืนอัตโนมัติ',
      variant: 'danger',
      confirmLabel: 'ยืนยันยกเลิกบิล',
      cancelLabel: 'ยกเลิก',
      icon: <ReceiptText className="w-6 h-6" />,
    });
    if (!ok) return;

    try {
      setVoidLoading(true);

      if (isPaid) {
        // Paid → create CN void
        const res = await apiFetch('/api/credit-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId, type: 'void' }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to void');
        }
        const result = await res.json();
        showToast(`ยกเลิกบิลสำเร็จ — ใบลดหนี้ ${result.cn_number}`);
        fetchCreditNotes();
      } else {
        // Not paid → just cancel order
        const res = await apiFetch('/api/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: orderId, order_status: 'cancelled', payment_status: 'cancelled' }),
        });
        if (!res.ok) throw new Error('Failed to cancel');
        showToast('ยกเลิกบิลสำเร็จ');
      }

      setOrderStatus('cancelled');
      setPaymentStatus('cancelled');
      fetchOrderHeader();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setVoidLoading(false);
    }
  };

  const handleOpenRefund = () => {
    if (!fullOrderData?.items || fullOrderData.items.length === 0) {
      showToast('ไม่พบรายการสินค้า', 'error');
      return;
    }
    const items = fullOrderData.items.map((oi: any) => ({
      order_item_id: oi.id,
      quantity: 0,
      max: Number(oi.quantity),
      name: `${oi.product_name || ''}${oi.variation_label ? ` (${oi.variation_label})` : ''}`,
      image: oi.image || null,
    }));
    setRefundItems(items);
    setRefundReason('');
    setShowRefundModal(true);
  };

  const handleRefundSubmit = async () => {
    const selected = refundItems.filter(i => i.quantity > 0);
    if (selected.length === 0) {
      showToast('กรุณาเลือกรายการที่ต้องการคืน', 'error');
      return;
    }
    // If returning ALL items at full quantity → switch to void flow instead
    const isReturningAll = refundItems.every(i => i.quantity === i.max);
    if (isReturningAll) {
      setShowRefundModal(false);
      handleVoid();
      return;
    }
    try {
      setRefundLoading(true);
      const res = await apiFetch('/api/credit-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          type: 'refund',
          reason: refundReason || 'คืนสินค้า',
          items: selected.map(i => ({ order_item_id: i.order_item_id, quantity: i.quantity })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to refund');
      }
      const result = await res.json();
      showToast(`คืนสินค้าสำเร็จ — ใบลดหนี้ ${result.cn_number}`);
      setShowRefundModal(false);
      fetchCreditNotes();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setRefundLoading(false);
    }
  };

  const handleOpenExchange = () => {
    if (!fullOrderData?.items || fullOrderData.items.length === 0) {
      showToast('ไม่พบรายการสินค้า', 'error');
      return;
    }
    // Send all items at full quantity — go straight to new order page
    const exchangeData = {
      items: fullOrderData.items.map((oi: any) => ({
        order_item_id: oi.id,
        quantity: Number(oi.quantity),
      })),
      reason: 'เปลี่ยนสินค้า',
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(exchangeData)));
    router.push(`/orders/new?from_order=${orderId}&exchange_data=${encoded}`);
  };

  const handleOrderSaved = (savedOrderId: string) => {
    // Reload header to reflect changes
    fetchOrderHeader();
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <Container size="full">
          <LoadingCard />
        </Container>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Container size="full">
          <div className="text-center py-12">
            <div className="text-red-600 mb-4">{error}</div>
            <Button variant="ghost" onClick={() => router.push('/orders')}>
              กลับไปหน้ารายการคำสั่งซื้อ
            </Button>
          </div>
        </Container>
      </Layout>
    );
  }

  return (
    <Layout>
      <Container size="full" className="print:space-y-3 print:bg-white print:text-black">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              icon={<ArrowLeft className="w-5 h-5" />}
              onClick={() => router.push(backUrl)}
              className="print:hidden"
              aria-label="กลับ"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="text-2xl font-bold font-mono text-gray-900 dark:text-white print:text-black hover:text-primary cursor-pointer transition-colors"
                  onClick={() => { copy(orderNumber, 'เลขคำสั่งซื้อ'); }}
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
                {/* Status badges inline next to order number — replaces removed Status card */}
                {orderStatus !== 'cancelled' && (
                  <>
                    <OrderStatusBadge status={orderStatus} />
                    <PaymentStatusBadge status={paymentStatus} />
                  </>
                )}
                {orderStatus === 'cancelled' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-500/30 dark:text-red-100 text-sm font-medium">
                    <XCircle className="w-3.5 h-3.5" />
                    {fullOrderData?.cancellation_reason === 'expired' ? 'หมดอายุ' : 'ยกเลิก'}
                  </span>
                )}
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
                  เลขที่ใบเสร็จ: <span className="font-mono cursor-pointer hover:text-primary transition-colors" onClick={() => copy(receiptNumber, 'เลขที่ใบเสร็จ')} title="คัดลอก">{receiptNumber}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {/* Record payment button (new + pending) — all non-marketplace */}
            {!isMarketplaceOrder && orderStatus === 'new' && paymentStatus === 'pending' && (
              <Button
                variant="success"
                icon={<Banknote className="w-4 h-4" />}
                disabled={updating}
                onClick={handlePaymentStatusClick}
              >
                บันทึกชำระเงิน
              </Button>
            )}
            {/* Approve / reject slip (verifying state) */}
            {!isMarketplaceOrder && paymentStatus === 'verifying' && paymentRecord && (
              <>
                {paymentRecord.slip_image_url && (
                  <Button
                    variant="secondary"
                    icon={<Eye className="w-4 h-4" />}
                    onClick={() => setShowSlipModal(true)}
                  >
                    ดูสลิป
                  </Button>
                )}
                <Button
                  variant="secondary"
                  icon={<ShieldX className="w-4 h-4" />}
                  disabled={updating}
                  onClick={handleRejectPayment}
                  className="!text-red-600 !border-red-300 hover:!bg-red-50"
                >
                  ปฏิเสธ
                </Button>
                <Button
                  variant="success"
                  icon={<ShieldCheck className="w-4 h-4" />}
                  loading={updating}
                  onClick={handleApprovePayment}
                >
                  ยืนยันสลิป
                </Button>
              </>
            )}
            {/* Accept Order button (ready_to_ship → processing) — all non-marketplace */}
            {!isMarketplaceOrder && (orderStatus === 'ready_to_ship' || (updating && orderStatus === 'processing')) && (
              <Button
                variant="primary"
                icon={updating ? undefined : <PackageCheck className="w-4 h-4" />}
                loading={updating}
                onClick={handleOrderStatusClick}
              >
                {updating ? 'กำลังดำเนินการ...' : 'รับออเดอร์'}
              </Button>
            )}
            {/* Ship button (processing → open ship modal) — all non-marketplace */}
            {!isMarketplaceOrder && orderStatus === 'processing' && (
              <Button
                variant="primary"
                icon={<Package className="w-4 h-4" />}
                onClick={() => setShowShipModal(true)}
                className="!bg-amber-500 hover:!bg-amber-600 !border-amber-500"
              >
                จัดส่งแล้ว
              </Button>
            )}
            {/* Shipping → completed */}
            {!isMarketplaceOrder && orderStatus === 'shipping' && (
              <Button
                variant="success"
                icon={<CheckCircle className="w-4 h-4" />}
                loading={updating}
                onClick={handleOrderStatusClick}
              >
                สำเร็จ
              </Button>
            )}
            {/* Shopee: Accept Order button */}
            {isShopeeOrder && externalStatus === 'READY_TO_SHIP' && (
              <Button
                variant="primary"
                icon={<PackageCheck className="w-4 h-4" />}
                loading={shopeeActionLoading}
                onClick={handleAcceptShopeeOrder}
                className="!bg-orange-500 hover:!bg-orange-600 !border-orange-500"
              >
                รับออเดอร์
              </Button>
            )}
            {/* Shopee: Sync button */}
            {isShopeeOrder && (
              <Button
                variant="secondary"
                icon={<RefreshCw className={`w-4 h-4 ${shopeeActionLoading ? 'animate-spin' : ''}`} />}
                disabled={shopeeActionLoading}
                onClick={handleResyncOrder}
                title="Sync ข้อมูลจาก Shopee ใหม่"
                aria-label="Sync Shopee"
              />
            )}
            {/* Action menu (จัดการ) */}
            {orderStatus !== 'cancelled' && (
              <div className="relative">
                <Button
                  variant="secondary"
                  icon={<Pencil className="w-4 h-4" />}
                  iconRight={<ChevronDown className="w-3.5 h-3.5" />}
                  onClick={() => setShowActionMenu(!showActionMenu)}
                >
                  <span className="hidden md:inline">จัดการ</span>
                </Button>
                {showActionMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowActionMenu(false)} />
                    <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg z-50 py-1">
                      {/* Bill online link — all non-marketplace */}
                      {!isMarketplaceOrder && (
                        <button
                          onClick={() => {
                            setShowActionMenu(false);
                            const billUrl = `${window.location.origin}/bills/${orderId}`;
                            copy(billUrl, 'ลิงก์บิลออนไลน์');
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5"
                        >
                          <Link2 className="w-4 h-4 text-gray-400" />
                          คัดลอกลิงก์บิลออนไลน์
                        </button>
                      )}
                      {/* Edit shipping — only when carrier/tracking exists */}
                      {!isMarketplaceOrder && (fullOrderData?.shipping_carrier || fullOrderData?.tracking_number) && (
                        <button
                          onClick={() => {
                            setShowActionMenu(false);
                            setShipCarrier(fullOrderData.shipping_carrier || '');
                            setShipTracking(fullOrderData.tracking_number || '');
                            setEditingShipping(true);
                            setShowShipModal(true);
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5"
                        >
                          <Truck className="w-4 h-4 text-gray-400" />
                          แก้ไขข้อมูลจัดส่ง
                        </button>
                      )}
                      {/* Exchange/Refund — paid, not cancelled */}
                      {paymentStatus === 'paid' && (
                        <button
                          onClick={() => { setShowActionMenu(false); setShowActionTypeModal(true); }}
                          className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5"
                        >
                          <Repeat className="w-4 h-4 text-blue-500" />
                          เปลี่ยน/คืนสินค้า
                        </button>
                      )}
                      {/* Void/Cancel bill — all non-marketplace */}
                      {!isMarketplaceOrder && (
                        <>
                          <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                          <button
                            onClick={() => { setShowActionMenu(false); handleVoid(); }}
                            disabled={voidLoading}
                            className="w-full text-left px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4" />
                            ยกเลิกบิล
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            {/* Print dropdown */}
            <div className="relative">
              <Button
                variant="secondary"
                icon={<Printer className="w-4 h-4" />}
                iconRight={<ChevronDown className="w-3.5 h-3.5" />}
                onClick={() => setShowPrintMenu(!showPrintMenu)}
              >
                <span className="hidden md:inline">พิมพ์</span>
              </Button>
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
                    {!isMarketplaceOrder && ['processing', 'shipping'].includes(orderStatus) && (
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

        {/* Customer + Tax Invoice — 2-column layout */}
        {orderStatus !== 'cancelled' && !isMarketplaceOrder && !isPosOrder && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:hidden">
          <Card padding="md">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="text-base font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">ลูกค้า</div>
              {['new', 'ready_to_ship', 'processing'].includes(orderStatus) && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Pencil className="w-3.5 h-3.5" />}
                  onClick={handleEditDelivery}
                >
                  แก้ไขข้อมูลจัดส่ง
                </Button>
              )}
            </div>

            {/* Customer row */}
            {fullOrderData?.customer ? (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="data-primary text-gray-900 dark:text-slate-200">{fullOrderData.customer.name}</span>
                {fullOrderData.customer.phone && (
                  <span className="data-secondary text-gray-400 dark:text-slate-500">· {fullOrderData.customer.phone}</span>
                )}
                {fullOrderData?.customer?.email && (
                  <span className="data-secondary text-gray-400 dark:text-slate-500">· {fullOrderData.customer.email}</span>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-400 dark:text-slate-500 mb-3">ไม่มีข้อมูลลูกค้า</div>
            )}

            {/* Delivery info — full width now (tax moved to its own card) */}
            {(fullOrderData?.delivery_name || fullOrderData?.delivery_address) && (
              <div className="space-y-1.5 text-sm">
                <div className="text-xs font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wide">ข้อมูลจัดส่ง</div>
                {fullOrderData.delivery_name && (
                  <div className="text-gray-800 dark:text-slate-200 font-medium">
                    {fullOrderData.delivery_name}
                    {fullOrderData.delivery_phone ? ` · ${fullOrderData.delivery_phone}` : ''}
                  </div>
                )}
                {fullOrderData.delivery_address && (
                  <div className="text-gray-600 dark:text-slate-400">
                    {[fullOrderData.delivery_address, fullOrderData.delivery_district, fullOrderData.delivery_amphoe, fullOrderData.delivery_province, fullOrderData.delivery_postal_code].filter(Boolean).join(' ')}
                  </div>
                )}
                {/* จุดส่ง + วันส่ง + ช่วงเวลา (snapshot จากตอนสร้างออเดอร์) */}
                {(fullOrderData.delivery_zone_label || fullOrderData.delivery_date || fullOrderData.delivery_slot_label) && (
                  <div className="text-gray-600 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                    {fullOrderData.delivery_zone_label && (
                      <span className="badge badge-sm badge-pill badge-emerald">{fullOrderData.delivery_zone_label}</span>
                    )}
                    {fullOrderData.delivery_date && (
                      <span>ส่ง {new Date(fullOrderData.delivery_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    )}
                    {fullOrderData.delivery_slot_label && (
                      <span className="badge badge-sm badge-pill badge-indigo">{fullOrderData.delivery_slot_label}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Payment record (paid / verifying state — actions live in header) */}
            {(paymentStatus === 'paid' || paymentStatus === 'verifying') && paymentRecord && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600 flex items-center gap-2 flex-wrap text-sm">
                <Banknote className="w-4 h-4 text-gray-400" />
                <span className={`badge badge-sm badge-pill ${paymentStatus === 'paid' ? 'badge-emerald' : 'badge-purple'}`}>
                  {paymentRecord.payment_method === 'cash' && 'เงินสด'}
                  {paymentRecord.payment_method === 'transfer' && 'โอนเงิน'}
                  {paymentRecord.payment_method === 'credit' && 'เครดิต'}
                  {paymentRecord.payment_method === 'cheque' && 'เช็ค'}
                  {paymentRecord.amount > 0 && ` · ฿${formatPrice(paymentRecord.amount)}`}
                </span>
                {paymentRecord.payment_method === 'cash' && paymentRecord.collected_by && (
                  <span className="text-gray-500 dark:text-slate-400">คนเก็บ: {paymentRecord.collected_by}</span>
                )}
                {paymentRecord.payment_method === 'transfer' && paymentRecord.transfer_date && (
                  <span className="text-gray-500 dark:text-slate-400">{new Date(paymentRecord.transfer_date).toLocaleDateString('th-TH')}</span>
                )}
                {paymentRecord.slip_image_url && (
                  <button
                    onClick={() => setShowSlipModal(true)}
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    ดูสลิป
                  </button>
                )}
              </div>
            )}

            {/* Shipping info */}
            {(fullOrderData?.shipping_carrier || fullOrderData?.tracking_number) && (() => {
              const trackUrl = fullOrderData.shipping_carrier && fullOrderData.tracking_number
                ? getTrackingUrl(fullOrderData.shipping_carrier, fullOrderData.tracking_number)
                : null;
              return (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600 flex items-center gap-2 flex-wrap text-sm">
                  <Truck className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  {fullOrderData.shipping_carrier && (
                    <span className="text-gray-700 dark:text-slate-300">{getCarrierLabel(fullOrderData.shipping_carrier)}</span>
                  )}
                  {fullOrderData.tracking_number && (
                    trackUrl ? (
                      <a
                        href={trackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="code-text bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                      >
                        {fullOrderData.tracking_number}
                      </a>
                    ) : (
                      <span className="code-text bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded">{fullOrderData.tracking_number}</span>
                    )
                  )}
                  {fullOrderData.tracking_number && (
                    <button
                      onClick={() => {
                        const text = trackUrl
                          ? `${getCarrierLabel(fullOrderData.shipping_carrier)}: ${fullOrderData.tracking_number}\nติดตามพัสดุ: ${trackUrl}`
                          : fullOrderData.tracking_number;
                        copy(text, 'ข้อมูลพัสดุ')
                      }}
                      className="text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                      title="คัดลอกข้อมูลพัสดุ"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Legacy chat-source label — only when no sales_channel is set (picker handles the rest) */}
            {orderSource && orderSource !== 'manual' && !fullOrderData?.sales_channel && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600 flex items-center gap-2 flex-wrap text-sm">
                <span className="text-gray-500 dark:text-slate-400">ที่มา:</span>
                <span className="inline-flex items-center gap-1 text-gray-600 dark:text-slate-300">
                  {PLATFORM_ICONS[orderSource] && (
                    <img src={PLATFORM_ICONS[orderSource]} alt={orderSource} className="w-4 h-4" />
                  )}
                  {fullOrderData?.source_name || orderSource}
                </span>
              </div>
            )}

            {/* Parcels (split shipment) */}
            {fullOrderData?.is_split && fullOrderData?.parcels?.length > 0 && (
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
            )}

            {/* Order status advance button — for skipped statuses (shipping → completed handled by header) */}
            {getNextOrderStatus(orderStatus) && orderStatus !== 'new' && orderStatus !== 'ready_to_ship' && orderStatus !== 'processing' && orderStatus !== 'shipping' && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600">
                <Button
                  variant="primary"
                  loading={updating}
                  icon={<Truck className="w-4 h-4" />}
                  onClick={handleOrderStatusClick}
                >
                  {updating ? 'กำลังดำเนินการ...' : `เปลี่ยนเป็น "${getOrderStatusLabel(getNextOrderStatus(orderStatus)!)}"`}
                </Button>
              </div>
            )}
          </Card>

          {/* Tax Invoice card — right column */}
          <div className={`rounded-xl border ${
            fullOrderData?.tax_invoice_requested
              ? 'bg-orange-50/60 dark:bg-orange-900/15 border-orange-200 dark:border-orange-800/40'
              : 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700 border-dashed'
          } p-5`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <ReceiptText className={`w-4 h-4 ${fullOrderData?.tax_invoice_requested ? 'text-primary' : 'text-gray-400'}`} />
                <div className="text-base font-medium text-gray-700 dark:text-slate-200 uppercase tracking-wide">ใบกำกับภาษี</div>
                {fullOrderData?.tax_invoice_requested && (
                  <span className="badge badge-sm badge-pill badge-orange">ขอใบกำกับ</span>
                )}
              </div>
              {['new', 'ready_to_ship', 'processing'].includes(orderStatus) && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Pencil className="w-3.5 h-3.5" />}
                  onClick={() => setShowTaxModal(true)}
                >
                  {fullOrderData?.tax_invoice_requested ? 'แก้ไขใบกำกับ' : 'ขอใบกำกับ'}
                </Button>
              )}
            </div>

            {fullOrderData?.tax_invoice_requested ? (
              <div className="text-sm space-y-1 mt-3">
                {fullOrderData.tax_invoice_name && (
                  <div className="text-gray-900 dark:text-slate-100 font-medium">{fullOrderData.tax_invoice_name}</div>
                )}
                <div className="flex items-center gap-4 flex-wrap text-gray-600 dark:text-slate-400">
                  {fullOrderData.tax_invoice_tax_id && (
                    <span>เลขผู้เสียภาษี: <span className="text-gray-800 dark:text-slate-200 font-mono">{fullOrderData.tax_invoice_tax_id}</span></span>
                  )}
                  {fullOrderData.tax_invoice_branch && (
                    <span>สาขา: <span className="text-gray-800 dark:text-slate-200">{fullOrderData.tax_invoice_branch}</span></span>
                  )}
                </div>
                {fullOrderData.tax_invoice_address && (
                  <div className="text-gray-600 dark:text-slate-400">{fullOrderData.tax_invoice_address}</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                ลูกค้ายังไม่ได้ขอใบกำกับภาษี — กด "ขอใบกำกับ" เพื่อเพิ่มได้
              </div>
            )}
          </div>
          </div>
        )}

        {/* Warehouse + Sales channel picker row (portaled from OrderForm) */}
        {!isMarketplaceOrder && !isPosOrder && (
          <div className="flex justify-end items-center gap-2 print:hidden">
            <div ref={warehouseRef} />
            <div ref={salesChannelRef} />
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
                    <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="data-primary text-gray-900 dark:text-slate-200">{fullOrderData.customer.name}</span>
                  </div>
                  {fullOrderData.customer.phone && (
                    <div className="data-secondary text-gray-600 dark:text-slate-400 pl-6">{fullOrderData.customer.phone}</div>
                  )}
                  {fullOrderData.delivery_address && (
                    <div className="data-secondary text-gray-600 dark:text-slate-400 pl-6">
                      {[fullOrderData.delivery_address, fullOrderData.delivery_district, fullOrderData.delivery_amphoe, fullOrderData.delivery_province, fullOrderData.delivery_postal_code].filter(Boolean).join(' ')}
                    </div>
                  )}
                </div>
              ) : (
                <div className="data-secondary text-gray-400 dark:text-slate-500">ไม่มีข้อมูลลูกค้า</div>
              )}
              {fullOrderData?.tax_invoice_requested && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600 space-y-1.5">
                  <span className="text-xs font-medium text-primary bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded">ขอใบกำกับภาษี</span>
                  {fullOrderData.tax_invoice_name && (
                    <div className="data-text text-gray-700 dark:text-slate-300">{fullOrderData.tax_invoice_name}</div>
                  )}
                  {fullOrderData.tax_invoice_tax_id && (
                    <div className="data-secondary text-gray-500 dark:text-slate-400">เลขผู้เสียภาษี: {fullOrderData.tax_invoice_tax_id}</div>
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
                  <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="data-primary text-gray-900 dark:text-slate-200">{fullOrderData.customer.name}</span>
                </div>
                {fullOrderData.customer.phone && (
                  <div className="data-secondary text-gray-600 dark:text-slate-400 pl-6">{fullOrderData.customer.phone}</div>
                )}
              </div>
            ) : (
              <div className="data-secondary text-gray-400 dark:text-slate-500">ลูกค้าหน้าร้าน</div>
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

        {/* Inline "Delivery info missing" banner — visible only when delivery is empty AND editable */}
        {fullOrderData && !isMarketplaceOrder && !isPosOrder && (() => {
          const deliveryComplete = !!(fullOrderData.delivery_name && fullOrderData.delivery_phone && fullOrderData.delivery_address);
          if (deliveryComplete) return null;
          if (!['new', 'ready_to_ship'].includes(orderStatus)) return null;
          return (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-4 py-3 flex items-center justify-between gap-3 print:hidden">
              <span className="text-sm text-amber-800 dark:text-amber-300">ยังไม่มีข้อมูลจัดส่ง — กรอกก่อนเพื่อพิมพ์ใบปะหน้า</span>
              <Button variant="primary" size="sm" icon={<Pencil className="w-3.5 h-3.5" />} onClick={handleEditDelivery}>
                กรอกข้อมูลจัดส่ง
              </Button>
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
          warehousePortalRef={warehouseRef}
          salesChannelPortalRef={salesChannelRef}
        />

        {/* Shopee Ship Modal */}
        {showShopeeShipModal && (
          <ShopeeShipModal
            orderId={orderId}
            orderSn={externalOrderSn || ''}
            onClose={() => setShowShopeeShipModal(false)}
            onSuccess={handleShopeeShipSuccess}
            apiFetch={apiFetch}
            showToast={showToast}
          />
        )}

        {/* Ship Modal */}
        {showShipModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => !shipLoading && (setShowShipModal(false), setEditingShipping(false), setShipCarrier(''), setShipTracking(''))}>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{editingShipping ? 'แก้ไขข้อมูลจัดส่ง' : 'จัดส่งออเดอร์'}</h3>
              <p className="text-base text-gray-500 dark:text-slate-400 mb-5">{orderNumber} — {fullOrderData?.customer_name || fullOrderData?.delivery_name || 'ลูกค้าทั่วไป'}</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">ขนส่ง</label>
                  <FormSelect
                    value={shipCarrier}
                    onChange={(val) => setShipCarrier(val)}
                    options={carrierOptions}
                    placeholder="-- เลือกขนส่ง --"
                    searchThreshold={99}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">เลขพัสดุ</label>
                  <input type="text" value={shipTracking} onChange={(e) => setShipTracking(e.target.value)} placeholder="กรอกเลขพัสดุ (ไม่บังคับ)"
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm" />
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button onClick={() => { setShowShipModal(false); setEditingShipping(false); setShipCarrier(''); setShipTracking(''); }} disabled={shipLoading}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50">ยกเลิก</button>
                <button onClick={handleShipOrder} disabled={shipLoading}
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2">
                  {shipLoading ? (<><Loader2 className="w-4 h-4 animate-spin" /> กำลังดำเนินการ...</>) : editingShipping ? (<><Pencil className="w-4 h-4" /> บันทึก</>) : (<><Package className="w-4 h-4" /> จัดส่งแล้ว</>)}
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

        {/* Delivery Edit Modal */}
        <Modal
          open={showDeliveryModal}
          onClose={() => !savingDelivery && setShowDeliveryModal(false)}
          title="แก้ไขข้อมูลจัดส่ง"
          size="2xl"
          footer={
            <div className="flex justify-end gap-3 px-6 py-4">
              <Button variant="secondary" disabled={savingDelivery} onClick={() => setShowDeliveryModal(false)}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                loading={savingDelivery}
                disabled={!deliveryForm.delivery_name || !deliveryForm.delivery_phone || !deliveryForm.delivery_address || !deliveryForm.delivery_province || !deliveryForm.delivery_postal_code}
                onClick={handleSaveDelivery}
              >
                บันทึก
              </Button>
            </div>
          }
        >
          <div className="px-6 py-5 space-y-4">
            <FormInput
              label="ชื่อผู้รับ"
              required
              value={deliveryForm.delivery_name}
              onChange={(e) => { setDeliveryForm(f => ({ ...f, delivery_name: e.target.value })); setDeliveryErrors(prev => { const { name, ...rest } = prev; return rest; }); }}
              error={deliveryErrors.name}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormInput
                label="เบอร์โทร"
                required
                inputMode="tel"
                value={deliveryForm.delivery_phone}
                onChange={(e) => { setDeliveryForm(f => ({ ...f, delivery_phone: e.target.value })); setDeliveryErrors(prev => { const { phone, ...rest } = prev; return rest; }); }}
                error={deliveryErrors.phone}
              />
              <FormInput
                label="อีเมล"
                type="email"
                inputMode="email"
                value={deliveryForm.delivery_email}
                onChange={(e) => { setDeliveryForm(f => ({ ...f, delivery_email: e.target.value })); setDeliveryErrors(prev => { const { email, ...rest } = prev; return rest; }); }}
                error={deliveryErrors.email}
              />
            </div>
            <div>
              <label className="field-label">ที่อยู่ <span className="text-red-500">*</span></label>
              <textarea
                value={deliveryForm.delivery_address}
                onChange={(e) => { setDeliveryForm(f => ({ ...f, delivery_address: e.target.value })); setDeliveryErrors(prev => { const { address, ...rest } = prev; return rest; }); }}
                rows={2}
                placeholder="บ้านเลขที่ ถนน หมู่บ้าน"
                className={`w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 ${deliveryErrors.address ? 'border-red-500' : 'border-gray-300 dark:border-slate-600'}`}
              />
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
          </div>
        </Modal>

        {/* Tax Invoice Edit Modal */}
        {showTaxModal && (
          <TaxInvoiceEditModal
            data={taxSnapshot}
            onSave={(snap) => handleSaveTaxInvoice(snap, false)}
            onSaveAndUpdateCustomer={fullOrderData?.customer?.id ? (snap) => handleSaveTaxInvoice(snap, true) : undefined}
            onClose={() => !savingTax && setShowTaxModal(false)}
          />
        )}

      </Container>

      {/* Credit Notes list */}
      {creditNotes.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 print:hidden">
          <div className="text-base font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <ReceiptText className="w-4 h-4" />
            ใบลดหนี้ ({creditNotes.length})
          </div>
          <div className="space-y-2">
            {creditNotes.map((cn: any) => (
              <button
                key={cn.id}
                onClick={() => router.push(`/credit-notes/${cn.id}`)}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    cn.type === 'void'
                      ? 'bg-red-100 text-red-700 dark:bg-red-500/30 dark:text-red-200'
                      : cn.type === 'refund'
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/30 dark:text-orange-200'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-500/30 dark:text-blue-200'
                  }`}>
                    {cn.type === 'void' ? 'ยกเลิกบิล' : cn.type === 'refund' ? 'คืนสินค้า' : 'เปลี่ยนสินค้า'}
                  </span>
                  <span className="id-text text-gray-900 dark:text-white">{cn.cn_number}</span>
                  <span className="data-timestamp text-gray-400 dark:text-slate-500">
                    {new Date(cn.issued_at).toLocaleDateString('th-TH')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {cn.type === 'exchange' && cn.exchange_order_id && (
                    <span
                      className="data-secondary text-blue-500 dark:text-blue-400 hover:underline cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); router.push(`/orders/${cn.exchange_order_id}`); }}
                    >
                      บิลใหม่ →
                    </span>
                  )}
                  <span className="data-number text-gray-700 dark:text-slate-300">
                    ฿{formatPrice(cn.total_amount)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action Type Selection Modal — เปลี่ยน or คืน */}
      {showActionTypeModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowActionTypeModal(false)}
        >
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">เลือกการดำเนินการ</h3>
              <button onClick={() => setShowActionTypeModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => { setShowActionTypeModal(false); handleOpenExchange(); }}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 dark:border-slate-600 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                  <Repeat className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">เปลี่ยนสินค้า</div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">คืนสินค้าเดิม แล้วเลือกสินค้าใหม่แทน</div>
                </div>
              </button>
              <button
                onClick={() => { setShowActionTypeModal(false); handleOpenRefund(); }}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 dark:border-slate-600 rounded-xl hover:border-orange-400 dark:hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
                  <Undo2 className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">คืนสินค้า</div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">คืนสินค้าและออกใบลดหนี้ (ไม่สร้างบิลใหม่)</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {showRefundModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowRefundModal(false)}
        >
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Undo2 className="w-5 h-5 text-orange-500" />
                คืนสินค้า
              </h3>
              <button onClick={() => setShowRefundModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">เลือกรายการที่ต้องการคืนและกำหนดจำนวน</p>

            <div className="space-y-3 mb-4">
              {refundItems.map((item, idx) => (
                <div key={item.order_item_id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                  {/* Product image */}
                  <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-white dark:bg-slate-600 border border-gray-200 dark:border-slate-500 group relative">
                    {item.image ? (
                      <>
                        <img src={item.image} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <img src={item.image} alt="" className="max-w-[200px] max-h-[200px] object-contain rounded shadow-lg pointer-events-none absolute bottom-full left-0 mb-2" />
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-5 h-5 text-gray-300 dark:text-slate-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="data-primary text-gray-900 dark:text-white line-clamp-2">{item.name}</div>
                    <div className="data-muted text-gray-400 dark:text-slate-500">สั่ง {item.max} ชิ้น</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 dark:text-slate-400">คืน</span>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...refundItems];
                        updated[idx].quantity = Math.max(0, updated[idx].quantity - 1);
                        setRefundItems(updated);
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors text-sm font-medium"
                    >
                      -
                    </button>
                    <NumberInput
                      min={0}
                      max={item.max}
                      value={item.quantity}
                      onChange={(n) => {
                        const updated = [...refundItems];
                        updated[idx].quantity = Math.min(item.max, Math.max(0, n));
                        setRefundItems(updated);
                      }}
                      className="w-12 text-center text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white py-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...refundItems];
                        updated[idx].quantity = Math.min(item.max, updated[idx].quantity + 1);
                        setRefundItems(updated);
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors text-sm font-medium"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">เหตุผลการคืน</label>
              <input
                type="text"
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                placeholder="ระบุเหตุผล (ไม่บังคับ)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRefundModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-sm"
              >
                ยกเลิก
              </button>
              {refundItems.every(i => i.quantity === i.max) ? (
                <button
                  onClick={() => { setShowRefundModal(false); handleVoid(); }}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  ยกเลิกบิล
                </button>
              ) : (
                <button
                  onClick={handleRefundSubmit}
                  disabled={refundLoading || refundItems.every(i => i.quantity === 0)}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {refundLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  ออกใบลดหนี้
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDialog}
    </Layout>
  );
}
