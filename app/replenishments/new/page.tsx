'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import {
  ArrowLeft, ArrowUpFromLine, Warehouse, Send, Copy, CheckCircle2,
  Loader2, Printer, XCircle,
} from 'lucide-react';
import Link from 'next/link';
import ReplenishmentForm, { type ReplenishmentFormState } from '@/components/replenishments/ReplenishmentForm';
import FormSelect from '@/components/ui/FormSelect';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { showPdfPreview } from '@/lib/print-pdf';

interface WarehouseItem {
  id: string;
  name: string;
  is_default: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'ที่ต้องจัดส่ง', color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' },
  shipped: { label: 'กำลังส่ง', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/40' },
  pending_confirm: { label: 'รอยืนยัน', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/40' },
  received: { label: 'รับครบแล้ว', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40' },
  partial_received: { label: 'รับไม่ครบ', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40' },
  cancelled: { label: 'ยกเลิก', color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/40' },
};

const SHIPPING_METHODS = [
  { id: 'own_vehicle', label: 'รถเราเอง' },
  { id: 'courier', label: 'ขนส่ง (Kerry, Flash, J&T, ฯลฯ)' },
  { id: 'lalamove', label: 'Lalamove' },
];

function NewReplenishmentPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const replenishmentId = searchParams.get('id') || undefined;
  const viewMode = searchParams.get('view') === '1';
  const { showToast } = useToast();

  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [formState, setFormState] = useState<ReplenishmentFormState | null>(null);

  // Ship modal state
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipMethod, setShipMethod] = useState('courier');
  const [shipCarrier, setShipCarrier] = useState('');
  const [shipTracking, setShipTracking] = useState('');
  const [shipNotes, setShipNotes] = useState('');
  const [shipSubmitting, setShipSubmitting] = useState(false);

  // Cancel confirm state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const isEdit = !!replenishmentId;
  const title = viewMode ? 'ดูใบเติมสินค้า' : isEdit ? 'แก้ไขใบเติมสินค้า' : 'สร้างใบเติมสินค้า';

  useEffect(() => {
    apiFetch('/api/warehouses')
      .then(r => r.json())
      .then(d => {
        const whs: WarehouseItem[] = d.warehouses || [];
        setWarehouses(whs);
        const def = whs.find(w => w.is_default) || whs[0];
        if (def) setSelectedWarehouseId(def.id);
      })
      .catch(() => {});
  }, []);

  const resetShipForm = () => {
    setShipMethod('courier');
    setShipCarrier('');
    setShipTracking('');
    setShipNotes('');
  };

  const handleShip = async () => {
    if (!replenishmentId) return;
    setShipSubmitting(true);
    try {
      const res = await apiFetch(`/api/replenishments/${replenishmentId}`, {
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
      if (data.tax_invoice_number) {
        showToast(`จัดส่งเรียบร้อย + ออกเอกสาร ${data.tax_invoice_number}`, 'success');
      } else {
        showToast('จัดส่งเรียบร้อย', 'success');
      }
      setShowShipModal(false);
      resetShipForm();

      // Auto-print the issued document (DN or TAX invoice)
      // Generate PDF before reload so the user sees it
      let pdfBlob: Blob | null = null;
      let pdfTitle = '';
      try {
        if (data.doc_type === 'dn' && data.tax_invoice_number) {
          const { generateReplenishmentPdf } = await import('@/lib/replenishment-pdf');
          const rpRes = await apiFetch(`/api/replenishments/${replenishmentId}`);
          if (rpRes.ok) {
            const rpData = await rpRes.json();
            const rp = rpData.replenishment;
            pdfBlob = await generateReplenishmentPdf({
              data: {
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
                items: (rp.items || []).map((i: any) => ({
                  product_name: i.product_name,
                  variation_label: i.variation_label,
                  sku: i.sku,
                  quantity: i.quantity,
                  unit_price: i.unit_price,
                })),
              },
            });
            pdfTitle = `ใบส่งสินค้า ${data.tax_invoice_number}`;
          }
        } else if (data.doc_type === 'tax' && data.tax_invoice_number) {
          const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
          const rpRes = await apiFetch(`/api/replenishments/${replenishmentId}`);
          if (rpRes.ok) {
            const rpData = await rpRes.json();
            const rp = rpData.replenishment;
            pdfBlob = await generateFullInvoicePdf({
              ...rp,
              tax_invoice_number: data.tax_invoice_number,
              tax_invoice_date: data.tax_invoice_date,
              tax_invoice_doc_type: 'tax',
            });
            pdfTitle = `ใบกำกับภาษี ${data.tax_invoice_number}`;
          }
        }
      } catch (printErr) {
        console.error('Auto-print after ship failed:', printErr);
      }

      if (pdfBlob) {
        // Open browser print dialog directly
        showPdfPreview(pdfBlob, pdfTitle);
      }

      // Navigate back to list
      router.push('/replenishments');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setShipSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!replenishmentId) return;
    setCancelSubmitting(true);
    try {
      const res = await apiFetch(`/api/replenishments/${replenishmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || 'Failed');
      }
      showToast('ยกเลิกเรียบร้อย', 'success');
      window.location.reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setCancelSubmitting(false);
    }
  };

  const copyReceiveLink = () => {
    if (!formState?.receiveToken) return;
    const url = `${window.location.origin}/replenishments/receive/${formState.receiveToken}`;
    navigator.clipboard.writeText(url);
    showToast('คัดลอกลิงก์แล้ว', 'success');
  };

  const status = formState?.status || '';
  const statusCfg = STATUS_CONFIG[status];

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/replenishments"
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <ArrowUpFromLine className="w-6 h-6 text-[#F4511E]" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
              {isEdit && formState?.replenishmentNumber && (
                <span className="id-text text-[#F4511E]">
                  {formState.replenishmentNumber}
                </span>
              )}
              {isEdit && statusCfg && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {isEdit && formState && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={formState.handlePrint}
                disabled={formState.printing}
                className="btn-secondary flex items-center gap-2"
              >
                {formState.printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                พิมพ์
              </button>

              {status === 'shipped' && formState.receiveToken && (
                <button
                  onClick={copyReceiveLink}
                  className="btn-secondary flex items-center gap-2 !border-amber-300 dark:!border-amber-700 !bg-amber-50 dark:!bg-amber-900/20 !text-amber-700 dark:!text-amber-400 hover:!bg-amber-100 dark:hover:!bg-amber-900/30"
                >
                  <Copy className="w-4 h-4" />
                  คัดลอกลิงก์รับสินค้า
                </button>
              )}

              {status === 'pending' && !viewMode && (
                <button onClick={() => setShowShipModal(true)} className="btn-primary">
                  <Send className="w-4 h-4" />
                  จัดส่ง
                </button>
              )}

              {status === 'pending_confirm' && (
                <button
                  onClick={formState.handleConfirm}
                  disabled={formState.confirmSubmitting}
                  className="btn-success"
                >
                  {formState.confirmSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  ยืนยัน
                </button>
              )}

              {status === 'pending' && !viewMode && (
                <button onClick={() => setShowCancelConfirm(true)} className="btn-danger flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  ยกเลิก
                </button>
              )}
            </div>
          )}
        </div>

        {/* Warehouse picker (only for new) */}
        {!isEdit && warehouses.length > 0 && (
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

        <ReplenishmentForm
          warehouseId={selectedWarehouseId}
          replenishmentId={replenishmentId}
          viewMode={viewMode}
          onLoad={setFormState}
        />
      </div>

      {/* Ship Modal */}
      {showShipModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !shipSubmitting && setShowShipModal(false)}
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Send className="w-5 h-5 text-[#F4511E]" /> จัดส่งสินค้า
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">วิธีส่ง</label>
                <FormSelect
                  value={shipMethod}
                  onChange={setShipMethod}
                  options={SHIPPING_METHODS}
                  placeholder="เลือกวิธีส่ง"
                />
              </div>

              {shipMethod === 'courier' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อขนส่ง</label>
                    <input
                      type="text"
                      value={shipCarrier}
                      onChange={e => setShipCarrier(e.target.value)}
                      placeholder="เช่น Kerry, Flash, J&T"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เลข Tracking</label>
                    <input
                      type="text"
                      value={shipTracking}
                      onChange={e => setShipTracking(e.target.value)}
                      placeholder="เลขพัสดุ"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                    />
                  </div>
                </>
              )}

              {shipMethod === 'lalamove' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทรคนขับ / รายละเอียด</label>
                  <input
                    type="text"
                    value={shipNotes}
                    onChange={e => setShipNotes(e.target.value)}
                    placeholder="เบอร์โทรติดต่อ Lalamove"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  />
                </div>
              )}

              {shipMethod === 'own_vehicle' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุ</label>
                  <input
                    type="text"
                    value={shipNotes}
                    onChange={e => setShipNotes(e.target.value)}
                    placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowShipModal(false); resetShipForm(); }}
                disabled={shipSubmitting}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleShip}
                disabled={shipSubmitting}
                className="flex-1 px-4 py-2.5 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {shipSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                จัดส่ง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !cancelSubmitting && setShowCancelConfirm(false)}
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">ยืนยันยกเลิก</h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-6">ต้องการยกเลิกใบเติมสินค้านี้หรือไม่?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
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
                ยืนยันยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default function NewReplenishmentPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    }>
      <NewReplenishmentPageContent />
    </Suspense>
  );
}
