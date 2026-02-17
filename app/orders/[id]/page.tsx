'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import OrderForm from '@/components/orders/OrderForm';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
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
} from 'lucide-react';

// Status badge components
function OrderStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    new: { label: 'ใหม่', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/30 dark:text-blue-100' },
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
    READY_TO_SHIP: { label: 'รอรับออเดอร์', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/30 dark:text-blue-100' },
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

  // Order header info (loaded separately from OrderForm)
  const [orderNumber, setOrderNumber] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Shopee-specific state
  const [orderSource, setOrderSource] = useState('manual');
  const [externalStatus, setExternalStatus] = useState('');
  const [externalOrderSn, setExternalOrderSn] = useState('');
  const [shopeeActionLoading, setShopeeActionLoading] = useState(false);
  const [fullOrderData, setFullOrderData] = useState<any>(null);
  const isShopeeOrder = orderSource === 'shopee';

  // Print
  const [printMode, setPrintMode] = useState<'order' | 'packing' | null>(null);
  const [showPrintMenu, setShowPrintMenu] = useState(false);

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

  // Payment details (when marking as paid)
  const [paymentDetails, setPaymentDetails] = useState({
    paymentMethod: 'cash',
    collectedBy: '',
    transferDate: '',
    transferTime: '',
    notes: ''
  });

  // Slip preview modal
  const [showSlipModal, setShowSlipModal] = useState(false);

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
      setExternalStatus(order.external_status || '');
      setExternalOrderSn(order.external_order_sn || '');
      setFullOrderData(order);

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

  // Status flow helpers
  const getNextOrderStatus = (status: string): string | null => {
    const flow: Record<string, string> = { new: 'shipping', shipping: 'completed' };
    return flow[status] || null;
  };

  const getOrderStatusLabel = (status: string): string => {
    const labels: Record<string, string> = { new: 'ใหม่', shipping: 'กำลังส่ง', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };
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
    setPaymentDetails({ paymentMethod: 'cash', collectedBy: '', transferDate: '', transferTime: '', notes: '' });
    setStatusModal({ show: true, nextStatus: 'paid', statusType: 'payment' });
  };

  const handleCancelClick = () => {
    setStatusModal({ show: true, nextStatus: 'cancelled', statusType: 'order' });
  };

  const closeStatusModal = () => {
    setStatusModal({ show: false, nextStatus: '', statusType: 'order' });
  };

  // Confirm status update
  const confirmStatusUpdate = async () => {
    // Validate payment details if marking as paid
    if (statusModal.statusType === 'payment' && statusModal.nextStatus === 'paid') {
      if (paymentDetails.paymentMethod === 'cash' && !paymentDetails.collectedBy.trim()) {
        showToast('กรุณาระบุชื่อคนเก็บเงิน', 'error');
        return;
      }
      if (paymentDetails.paymentMethod === 'transfer' && (!paymentDetails.transferDate || !paymentDetails.transferTime)) {
        showToast('กรุณาระบุวันที่และเวลาจากสลิป', 'error');
        return;
      }
    }

    try {
      setUpdating(true);

      const updateData: any = { id: orderId };

      if (statusModal.statusType === 'order') {
        updateData.order_status = statusModal.nextStatus;
        if (statusModal.nextStatus === 'cancelled') {
          updateData.payment_status = 'cancelled';
        }
      } else {
        updateData.payment_status = statusModal.nextStatus;
      }

      const response = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) throw new Error('Failed to update status');

      // If marking as paid, create payment record
      if (statusModal.statusType === 'payment' && statusModal.nextStatus === 'paid') {
        await apiFetch('/api/payment-records', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            order_id: orderId,
            payment_method: paymentDetails.paymentMethod,
            amount: 0,
            collected_by: paymentDetails.paymentMethod === 'cash' ? paymentDetails.collectedBy : null,
            transfer_date: paymentDetails.paymentMethod === 'transfer' ? paymentDetails.transferDate : null,
            transfer_time: paymentDetails.paymentMethod === 'transfer' ? paymentDetails.transferTime : null,
            notes: paymentDetails.notes || null
          })
        });
        await fetchPaymentRecord();
      }

      // Update local state
      if (statusModal.statusType === 'order') {
        setOrderStatus(statusModal.nextStatus);
        if (statusModal.nextStatus === 'cancelled') {
          setPaymentStatus('cancelled');
        }
      } else {
        setPaymentStatus(statusModal.nextStatus);
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

  const handlePrint = (mode: 'order' | 'packing') => {
    setShowPrintMenu(false);
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
      setPrintMode(null);
    }, 150);
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
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      showToast('เปิดใบปะหน้า Shopee แล้ว');
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/orders')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors print:hidden"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-slate-300" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white print:text-black">{orderNumber}</h1>
                {isShopeeOrder && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    <img src="/marketplace/shopee.svg" alt="Shopee" className="w-3.5 h-3.5" />
                    Shopee
                  </span>
                )}
                <OrderStatusBadge status={orderStatus} />
              </div>
              {orderDate && (
                <p className="text-sm text-gray-500 mt-0.5">
                  เปิดบิล {new Date(orderDate + 'T00:00:00').toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
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
                    <button
                      onClick={() => handlePrint('order')}
                      className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5"
                    >
                      <FileText className="w-4 h-4 text-gray-400" />
                      ใบออเดอร์
                    </button>
                    <button
                      onClick={() => handlePrint('packing')}
                      className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5"
                    >
                      <ClipboardList className="w-4 h-4 text-gray-400" />
                      ใบจัดของ
                    </button>
                    <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                    {orderSource === 'manual' ? (
                      <button
                        onClick={() => {
                          setShowPrintMenu(false);
                          window.open(`/orders/${orderId}/shipping-labels`, '_blank');
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5"
                      >
                        <Package className="w-4 h-4 text-gray-400" />
                        ใบปะหน้า
                      </button>
                    ) : isShopeeOrder ? (
                      <button
                        onClick={() => {
                          setShowPrintMenu(false);
                          handlePrintShopeeLabel();
                        }}
                        disabled={shopeeActionLoading || externalStatus !== 'PROCESSED'}
                        className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={externalStatus !== 'PROCESSED' ? 'พิมพ์ใบปะหน้าได้เฉพาะสถานะ "พร้อมส่ง" เท่านั้น' : undefined}
                      >
                        <img src="/marketplace/shopee.svg" alt="Shopee" className="w-4 h-4" />
                        ใบปะหน้า Shopee
                        {externalStatus !== 'PROCESSED' && (
                          <span className="text-xs text-gray-400 ml-auto">เฉพาะสถานะพร้อมส่ง</span>
                        )}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Shopee Order Info Block (hidden on print) */}
        {isShopeeOrder && externalStatus && (
          <div className="bg-orange-50 dark:bg-slate-800 border border-orange-200 dark:border-orange-700/40 rounded-xl p-4 space-y-3 print:hidden">
            <div className="flex items-center gap-3">
              <img src="/marketplace/shopee.svg" alt="Shopee" className="w-5 h-5" />
              <div className="flex-1">
                <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
                  Shopee Order: {externalOrderSn}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500 dark:text-slate-400">สถานะ Shopee:</span>
                  <ShopeeExternalStatusBadge status={externalStatus} />
                </div>
              </div>
            </div>

            {/* Buyer's note */}
            {fullOrderData?.external_data?.note && (
              <div className="bg-white/60 dark:bg-slate-700/50 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-500 dark:text-slate-400">ข้อความจากผู้ซื้อ:</span>
                <p className="text-sm text-gray-700 dark:text-slate-200 mt-0.5">{fullOrderData.external_data.note}</p>
              </div>
            )}

            {/* Financial Breakdown (from escrow_detail) */}
            {(() => {
              const escrow = fullOrderData?.external_data?.escrow_detail;
              const orderIncome = escrow?.order_income || escrow;
              if (!escrow) {
                // No escrow yet — show estimated shipping fee if available
                const estShipping = fullOrderData?.external_data?.estimated_shipping_fee;
                if (estShipping && estShipping > 0) {
                  return (
                    <div className="border-t border-orange-200/50 dark:border-slate-600 pt-2">
                      <div className="flex justify-between text-sm text-gray-600 dark:text-slate-300">
                        <span>ค่าส่ง (ประมาณ)</span>
                        <span>฿{formatPrice(estShipping)}</span>
                      </div>
                      <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">ข้อมูลการเงินจะแสดงเมื่อ order เสร็จสิ้น</p>
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

              // ราคาขายจริง = sum(model_discounted_price * qty) จาก item_list
              const itemList = fullOrderData?.external_data?.item_list || [];
              const sellingPrice = itemList.reduce((sum: number, item: any) => {
                const price = item.model_discounted_price || item.model_original_price || 0;
                const qty = item.model_quantity_purchased || 1;
                return sum + (price * qty);
              }, 0);

              // ใช้ราคาขายจริง (sellingPrice) เป็นฐานคำนวณ %
              const basePrice = sellingPrice > 0 ? sellingPrice : originalPrice;
              const pct = (val: number) => basePrice > 0 ? ((val / basePrice) * 100).toFixed(1) : '0';
              // รวมส่วนลดทั้งหมด (ร้าน + Shopee)
              const totalSellerDiscount = voucherSeller + sellerDiscount;
              const totalShopeeDiscount = voucherShopee + shopeeDiscount + coins;
              const totalFees = commissionFee + serviceFee;

              return (
                <div className="border-t border-orange-200/50 dark:border-slate-600 pt-3 space-y-2">
                  <div className="text-sm font-medium text-orange-700 dark:text-orange-300 mb-2">รายละเอียดทางการเงิน</div>
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
                  <div className="flex justify-between text-sm pt-1 border-t border-orange-200/30 dark:border-slate-700">
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
                  <div className="flex justify-between text-base font-semibold pt-2 border-t border-orange-200/50 dark:border-slate-600">
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
              );
            })()}
          </div>
        )}

        {/* Status Management — prominent buttons (hidden on print) */}
        {orderStatus !== 'cancelled' && !isShopeeOrder && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 print:hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Order Status Section */}
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">สถานะออเดอร์</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <OrderStatusBadge status={orderStatus} />
                  {getNextOrderStatus(orderStatus) && (
                    <>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                      <button
                        onClick={handleOrderStatusClick}
                        disabled={updating}
                        className="px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors font-medium text-sm flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                      >
                        <Truck className="w-4 h-4" />
                        เปลี่ยนเป็น &quot;{getOrderStatusLabel(getNextOrderStatus(orderStatus)!)}&quot;
                      </button>
                    </>
                  )}
                  {orderStatus !== 'completed' && (
                    <button
                      onClick={handleCancelClick}
                      disabled={updating}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      ยกเลิกคำสั่งซื้อ
                    </button>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="hidden sm:block w-px h-12 bg-gray-200 dark:bg-slate-600" />
              <div className="block sm:hidden w-full h-px bg-gray-200 dark:bg-slate-600" />

              {/* Payment Status Section */}
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">การชำระเงิน</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <PaymentStatusBadge status={paymentStatus} />
                  {paymentStatus === 'pending' && (
                    <>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                      <button
                        onClick={handlePaymentStatusClick}
                        disabled={updating}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                      >
                        <Banknote className="w-4 h-4" />
                        บันทึกชำระเงิน
                      </button>
                    </>
                  )}
                  {paymentStatus === 'verifying' && paymentRecord && (
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
                  )}
                  {paymentStatus === 'paid' && paymentRecord && (
                    <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                      {paymentRecord.payment_method === 'cash' && paymentRecord.collected_by && `เงินสด: ${paymentRecord.collected_by}`}
                      {paymentRecord.payment_method === 'transfer' && paymentRecord.transfer_date && `โอนเงิน: ${new Date(paymentRecord.transfer_date).toLocaleDateString('th-TH')}`}
                      {paymentRecord.payment_method === 'credit' && 'เครดิต'}
                      {paymentRecord.payment_method === 'cheque' && 'เช็ค'}
                    </span>
                  )}
                </div>
                {/* Approve/Reject buttons for verifying */}
                {paymentStatus === 'verifying' && paymentRecord && (
                  <div className="flex items-center gap-2 mt-3">
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
                )}
              </div>

            </div>
          </div>
        )}

        {/* Shopee Status Management — read-only display (hidden on print) */}
        {orderStatus !== 'cancelled' && isShopeeOrder && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 print:hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">สถานะออเดอร์</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <OrderStatusBadge status={orderStatus} />
                  <span className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                    <img src="/marketplace/shopee.svg" alt="Shopee" className="w-3.5 h-3.5" />
                    จัดการผ่าน Shopee
                  </span>
                </div>
              </div>

              <div className="hidden sm:block w-px h-12 bg-gray-200 dark:bg-slate-600" />
              <div className="block sm:hidden w-full h-px bg-gray-200 dark:bg-slate-600" />

              <div className="flex-1">
                <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">การชำระเงิน</div>
                <div className="flex items-center gap-2">
                  <PaymentStatusBadge status={paymentStatus} />
                  <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-300 px-2 py-1 rounded">
                    <img src="/marketplace/shopee.svg" alt="Shopee" className="w-3 h-3" />
                    ชำระผ่าน Shopee
                  </span>
                </div>
              </div>
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

        {/* OrderForm - Edit or Read-only */}
        <OrderForm
          editOrderId={orderId}
          preloadedOrder={fullOrderData}
          onSuccess={handleOrderSaved}
          onCancel={() => router.push('/orders')}
          printMode={printMode}
        />

        {/* Status Update Confirmation Modal */}
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
                    : `ยืนยันการเปลี่ยน${statusModal.statusType === 'order' ? 'สถานะคำสั่งซื้อ' : 'สถานะการชำระเงิน'}`
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
                  {statusModal.statusType === 'order' ? (
                    <>
                      <OrderStatusBadge status={orderStatus} />
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <OrderStatusBadge status={statusModal.nextStatus} />
                    </>
                  ) : (
                    <>
                      <PaymentStatusBadge status={paymentStatus} />
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <PaymentStatusBadge status={statusModal.nextStatus} />
                    </>
                  )}
                </div>

                {/* Warning for cancel */}
                {statusModal.nextStatus === 'cancelled' && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    การยกเลิกคำสั่งซื้อจะไม่สามารถกลับคืนได้
                  </div>
                )}

                {/* Payment Details Form (when marking as paid) */}
                {statusModal.statusType === 'payment' && statusModal.nextStatus === 'paid' && (
                  <div className="mt-6 pt-6 border-t space-y-4">
                    <h4 className="font-medium text-gray-900 dark:text-white">รายละเอียดการชำระเงิน</h4>

                    {/* Payment Method Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        วิธีการชำระเงิน <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setPaymentDetails({ ...paymentDetails, paymentMethod: 'cash' })}
                          className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                            paymentDetails.paymentMethod === 'cash'
                              ? 'border-[#F4511E] bg-[#F4511E] bg-opacity-10 text-[#F4511E] font-medium'
                              : 'border-gray-300 text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          เงินสด
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentDetails({ ...paymentDetails, paymentMethod: 'transfer' })}
                          className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                            paymentDetails.paymentMethod === 'transfer'
                              ? 'border-[#F4511E] bg-[#F4511E] bg-opacity-10 text-[#F4511E] font-medium'
                              : 'border-gray-300 text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          โอนเงิน
                        </button>
                      </div>
                    </div>

                    {/* Cash Payment Fields */}
                    {paymentDetails.paymentMethod === 'cash' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          ชื่อคนเก็บเงิน <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={paymentDetails.collectedBy}
                          onChange={(e) => setPaymentDetails({ ...paymentDetails, collectedBy: e.target.value })}
                          placeholder="ระบุชื่อคนเก็บเงิน"
                          className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                        />
                      </div>
                    )}

                    {/* Transfer Payment Fields */}
                    {paymentDetails.paymentMethod === 'transfer' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              วันที่จากสลิป <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={paymentDetails.transferDate}
                              onChange={(e) => setPaymentDetails({ ...paymentDetails, transferDate: e.target.value })}
                              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              เวลาจากสลิป <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="time"
                              value={paymentDetails.transferTime}
                              onChange={(e) => setPaymentDetails({ ...paymentDetails, transferTime: e.target.value })}
                              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">หมายเหตุ</label>
                      <textarea
                        value={paymentDetails.notes}
                        onChange={(e) => setPaymentDetails({ ...paymentDetails, notes: e.target.value })}
                        placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                        rows={2}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      />
                    </div>
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
