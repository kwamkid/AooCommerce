'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import OrderForm from '@/components/orders/OrderForm';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
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
} from 'lucide-react';

// Status badge components
function OrderStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    new: { label: 'ใหม่', color: 'bg-blue-100 text-blue-700' },
    shipping: { label: 'กำลังส่ง', color: 'bg-yellow-100 text-yellow-700' },
    completed: { label: 'สำเร็จ', color: 'bg-green-100 text-green-700' },
    cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700' }
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
    pending: { label: 'รอชำระ', color: 'bg-orange-100 text-orange-700' },
    verifying: { label: 'รอตรวจสอบ', color: 'bg-purple-100 text-purple-700' },
    paid: { label: 'ชำระแล้ว', color: 'bg-green-100 text-green-700' },
    cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700' }
  };
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/orders')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{orderNumber}</h1>
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
          <div className="flex gap-2">
            <button
              onClick={() => {
                const billUrl = `${window.location.origin}/bills/${orderId}`;
                navigator.clipboard.writeText(billUrl).then(() => {
                  showToast('คัดลอกลิงก์บิลออนไลน์แล้ว');
                });
              }}
              className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-1.5 text-sm"
            >
              <Link2 className="w-4 h-4" />
              บิลออนไลน์
            </button>
            <button
              onClick={() => window.open(`/orders/${orderId}/shipping-labels`, '_blank')}
              className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-1.5 text-sm"
            >
              <Printer className="w-4 h-4" />
              ใบปะหน้า
            </button>
            <button
              onClick={() => window.print()}
              className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-1.5 text-sm"
            >
              <Printer className="w-4 h-4" />
              พิมพ์
            </button>
          </div>
        </div>

        {/* Status Management — prominent buttons */}
        {orderStatus !== 'cancelled' && (
          <div className="bg-white rounded-xl border-2 border-gray-200 p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Order Status Section */}
              <div className="flex-1">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">สถานะออเดอร์</div>
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
              <div className="hidden sm:block w-px h-12 bg-gray-200" />
              <div className="block sm:hidden w-full h-px bg-gray-200" />

              {/* Payment Status Section */}
              <div className="flex-1">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">การชำระเงิน</div>
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

        {/* Cancelled status info */}
        {orderStatus === 'cancelled' && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5">
            <div className="flex items-center gap-2 text-red-700">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">คำสั่งซื้อนี้ถูกยกเลิกแล้ว</span>
            </div>
          </div>
        )}

        {/* OrderForm - Edit or Read-only */}
        <OrderForm
          editOrderId={orderId}
          onSuccess={handleOrderSaved}
          onCancel={() => router.push('/orders')}
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
