'use client';

import { useState, useRef } from 'react';
import { Loader2, Camera, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import imageCompression from 'browser-image-compression';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import DateRangePicker, { DateValueType } from '@/components/ui/DateRangePicker';
import TimePicker from '@/components/ui/TimePicker';
import Modal from '@/components/ui/Modal';

export interface PaymentModalProps {
  show: boolean;
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  defaultPaymentMethod?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaymentModal({
  show,
  orderId,
  orderNumber: _orderNumber,
  totalAmount,
  defaultPaymentMethod = 'cash',
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const { showToast } = useToast();

  const [paymentMethod, setPaymentMethod] = useState(defaultPaymentMethod);
  const [collectedBy, setCollectedBy] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [transferTime, setTransferTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Slip upload
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [compressingSlip, setCompressingSlip] = useState(false);
  const slipFileInputRef = useRef<HTMLInputElement>(null);

  // Reset when defaultPaymentMethod changes (modal opens)
  const resetForm = () => {
    setPaymentMethod(defaultPaymentMethod);
    setCollectedBy('');
    setTransferDate('');
    setTransferTime('');
    setNotes('');
    setSlipFile(null);
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    setSlipPreview(null);
  };

  const handleSlipSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    setCompressingSlip(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
      setSlipFile(compressed as File);
      setSlipPreview(URL.createObjectURL(compressed));
    } catch {
      if (file.size > 5 * 1024 * 1024) {
        showToast('ไฟล์ใหญ่เกินไป กรุณาเลือกรูปขนาดเล็กกว่านี้', 'error');
        setCompressingSlip(false);
        return;
      }
      setSlipFile(file);
      setSlipPreview(URL.createObjectURL(file));
    } finally {
      setCompressingSlip(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    // Validate
    if (paymentMethod === 'cash' && !collectedBy.trim()) {
      showToast('กรุณาระบุชื่อคนเก็บเงิน', 'error');
      return;
    }
    if (paymentMethod === 'transfer' && (!transferDate || !transferTime)) {
      showToast('กรุณาระบุวันที่และเวลาจากสลิป', 'error');
      return;
    }

    try {
      setSubmitting(true);

      // Update payment status
      const statusRes = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, payment_status: 'paid' }),
      });
      if (!statusRes.ok) throw new Error('Failed to update payment status');

      // Create payment record
      const formData = new FormData();
      formData.append('order_id', orderId);
      formData.append('payment_method', paymentMethod);
      formData.append('amount', String(totalAmount));
      if (paymentMethod === 'cash' && collectedBy) {
        formData.append('collected_by', collectedBy);
      }
      if (paymentMethod === 'transfer') {
        if (transferDate) formData.append('transfer_date', transferDate);
        if (transferTime) formData.append('transfer_time', transferTime);
      }
      if (notes) formData.append('notes', notes);
      if (slipFile) formData.append('slip_image', slipFile);

      const paymentRes = await apiFetch('/api/payment-records', {
        method: 'POST',
        body: formData,
      });
      if (!paymentRes.ok) {
        const errorData = await paymentRes.json();
        throw new Error(errorData.error || 'Failed to create payment record');
      }

      showToast('บันทึกชำระเงินสำเร็จ', 'success');
      resetForm();
      onSuccess();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={show}
      onClose={handleClose}
      title="รายละเอียดการชำระเงิน"
      size="lg"
      disableBackdropClose={submitting}
      footer={
        <div className="flex gap-3 justify-end p-5">
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            {submitting ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
          </Button>
        </div>
      }
    >
      <div className="p-5">
        <div className="space-y-4">
          {totalAmount > 0 && (
            <p className="text-sm text-gray-600 dark:text-slate-400">
              ยอดชำระ: <span className="font-semibold text-primary">฿{totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
            </p>
          )}

          {/* Payment method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
              วิธีการชำระเงิน <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                  paymentMethod === 'cash'
                    ? 'border-primary bg-primary bg-opacity-10 text-primary font-medium'
                    : 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-gray-400'
                }`}
              >
                เงินสด
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('transfer')}
                className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                  paymentMethod === 'transfer'
                    ? 'border-primary bg-primary bg-opacity-10 text-primary font-medium'
                    : 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-gray-400'
                }`}
              >
                โอนเงิน
              </button>
            </div>
          </div>

          {/* Cash fields */}
          {paymentMethod === 'cash' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                ชื่อคนเก็บเงิน <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={collectedBy}
                onChange={(e) => setCollectedBy(e.target.value)}
                placeholder="ระบุชื่อคนเก็บเงิน"
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {/* Transfer fields */}
          {paymentMethod === 'transfer' && (
            <div className="space-y-3">
              {/* Slip Upload first (for future auto-detect) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  อัพโหลดสลิป
                </label>
                {compressingSlip ? (
                  <div className="w-full border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg py-6 flex flex-col items-center gap-2 text-gray-400 dark:text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-sm">กำลังย่อรูป...</span>
                  </div>
                ) : slipPreview ? (
                  <div className="relative">
                    <img src={slipPreview} alt="สลิป" className="w-full max-h-48 object-contain rounded-lg border border-gray-200 dark:border-slate-600" />
                    <button
                      type="button"
                      onClick={() => { if (slipPreview) URL.revokeObjectURL(slipPreview); setSlipFile(null); setSlipPreview(null); }}
                      className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => slipFileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg py-6 flex flex-col items-center gap-2 text-gray-400 dark:text-slate-500 hover:border-primary hover:text-primary transition-colors"
                  >
                    <Camera className="w-8 h-8" />
                    <span className="text-sm">เลือกรูป / ถ่ายรูปสลิป</span>
                  </button>
                )}
                <input
                  ref={slipFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSlipSelect}
                  className="hidden"
                />
              </div>

              {/* Transfer date/time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    วันที่จากสลิป <span className="text-red-500">*</span>
                  </label>
                  <DateRangePicker
                    value={{ startDate: transferDate ? new Date(transferDate) : null, endDate: transferDate ? new Date(transferDate) : null }}
                    onChange={(val: DateValueType) => {
                      const d = val?.startDate;
                      if (!d) { setTransferDate(''); return; }
                      const dateStr = typeof d === 'string' ? d : d instanceof Date ? d.toISOString().split('T')[0] : '';
                      setTransferDate(dateStr);
                    }}
                    asSingle
                    useRange={false}
                    showShortcuts={false}
                    showFooter={false}
                    placeholder="เลือกวันที่"
                    popupDirection="up"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    เวลาจากสลิป <span className="text-red-500">*</span>
                  </label>
                  <TimePicker
                    value={transferTime}
                    onChange={setTransferTime}
                    placeholder="เลือกเวลา"
                    popupDirection="up"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">หมายเหตุ</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
              rows={2}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
