'use client';

import { useState, useEffect, Suspense } from 'react';
import { useCopy } from '@/lib/useCopy';
import { useSearchParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import FormInput from '@/components/ui/FormInput';
import { useFormValidation } from '@/lib/useFormValidation';
import { LoadingCard } from '@/components/ui/StateCard';
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
import { getBadgeColor } from '@/lib/status-tab-colors';

interface WarehouseItem {
  id: string;
  name: string;
  is_default: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'ที่ต้องจัดส่ง', ...getBadgeColor('pending') },
  shipped: { label: 'กำลังส่ง', ...getBadgeColor('shipped') },
  pending_confirm: { label: 'รอยืนยัน', ...getBadgeColor('pending_confirm') },
  received: { label: 'รับครบแล้ว', ...getBadgeColor('completed') },
  partial_received: { label: 'รับไม่ครบ', ...getBadgeColor('partial_received') },
  cancelled: { label: 'ยกเลิก', ...getBadgeColor('cancelled') },
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
  const copy = useCopy();

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
  const status = formState?.status || '';
  const title = viewMode ? 'ดูใบเติมสินค้า' : status === 'pending_confirm' ? 'คอนเฟิร์มรับของ' : isEdit ? 'แก้ไขใบเติมสินค้า' : 'สร้างใบเติมสินค้า';

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

  const shipForm = useFormValidation();

  const handleShip = async () => {
    if (!replenishmentId) return;
    if (!shipForm.validateAll()) return;
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
      const dnNum = data.dn_number || data.tax_invoice_number; // dn_number (new) or tax_invoice_number (legacy)
      const taxNum = data.tax_invoice_number;
      const docNums = [dnNum, taxNum].filter(Boolean);
      if (docNums.length > 0) {
        showToast(`จัดส่งเรียบร้อย + ออกเอกสาร ${docNums.join(' + ')}`, 'success');
      } else {
        showToast('จัดส่งเรียบร้อย', 'success');
      }
      setShowShipModal(false);
      resetShipForm();

      // Auto-print DN after ship
      let pdfBlob: Blob | null = null;
      let pdfTitle = '';
      try {
        if (dnNum) {
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
            pdfTitle = `ใบส่งสินค้า ${dnNum}`;
          }
        }
        // Also print TAX if issued (Flow D: dept store)
        if (!pdfBlob && taxNum) {
          const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
          const rpRes = await apiFetch(`/api/replenishments/${replenishmentId}`);
          if (rpRes.ok) {
            const rpData = await rpRes.json();
            const rp = rpData.replenishment;
            pdfBlob = await generateFullInvoicePdf({
              ...rp,
              tax_invoice_number: taxNum,
              tax_invoice_date: new Date().toISOString().split('T')[0],
              tax_invoice_doc_type: 'tax',
            });
            pdfTitle = `ใบกำกับภาษี ${taxNum}`;
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
    copy(url, 'ลิงก์')
  };

  // Set warehouse from loaded replenishment (edit mode)
  useEffect(() => {
    if (isEdit && formState?.warehouseId && !selectedWarehouseId) {
      setSelectedWarehouseId(formState.warehouseId);
    }
  }, [isEdit, formState?.warehouseId, selectedWarehouseId]);

  const statusCfg = STATUS_CONFIG[status];

  return (
    <Layout>
      <Container size="full" gap="sm">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/replenishments"
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              aria-label="ย้อนกลับ"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <ArrowUpFromLine className="w-6 h-6 text-primary" />
              <h1 className="heading-2">{title}</h1>
              {isEdit && formState?.replenishmentNumber && (
                <span className="id-text text-primary">
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
              <Button
                variant="secondary"
                size="sm"
                icon={formState.printing ? undefined : <Printer className="w-4 h-4" />}
                loading={formState.printing}
                onClick={formState.handlePrint}
              >
                พิมพ์
              </Button>

              {status === 'shipped' && formState.receiveToken && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Copy className="w-4 h-4" />}
                  onClick={copyReceiveLink}
                  className="!border-amber-300 dark:!border-amber-700 !bg-amber-50 dark:!bg-amber-900/20 !text-amber-700 dark:!text-amber-400 hover:!bg-amber-100 dark:hover:!bg-amber-900/30"
                >
                  คัดลอกลิงก์รับสินค้า
                </Button>
              )}

              {status === 'pending' && !viewMode && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Send className="w-4 h-4" />}
                  onClick={() => setShowShipModal(true)}
                >
                  จัดส่ง
                </Button>
              )}

              {status === 'pending_confirm' && (
                <Button
                  variant="success"
                  size="sm"
                  icon={formState.confirmSubmitting ? undefined : <CheckCircle2 className="w-4 h-4" />}
                  loading={formState.confirmSubmitting}
                  onClick={formState.handleConfirm}
                >
                  ยืนยัน
                </Button>
              )}

              {status === 'pending' && !viewMode && (
                <Button
                  variant="danger"
                  size="sm"
                  icon={<XCircle className="w-4 h-4" />}
                  onClick={() => setShowCancelConfirm(true)}
                >
                  ยกเลิก
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Warehouse picker */}
        {warehouses.length > 0 && (
          <div className="inline-block min-w-[160px]">
            <FormSelect
              value={selectedWarehouseId}
              onChange={isEdit ? () => {} : setSelectedWarehouseId}
              options={warehouses.map(w => ({
                id: w.id,
                label: `${w.is_default ? '⭐ ' : ''}${w.name}`,
              }))}
              icon={<Warehouse className="w-4 h-4" />}
              placeholder="-- เลือกคลัง --"
              searchThreshold={99}
              disabled={isEdit}
            />
          </div>
        )}

        <ReplenishmentForm
          warehouseId={selectedWarehouseId}
          replenishmentId={replenishmentId}
          viewMode={viewMode}
          onLoad={setFormState}
        />
      </Container>

      {/* Ship Modal */}
      <Modal
        open={showShipModal}
        onClose={() => !shipSubmitting && setShowShipModal(false)}
        title={
          <span className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" /> จัดส่งสินค้า
          </span>
        }
        size="md"
        footer={
          <div className="flex gap-3 p-4">
            <Button
              variant="secondary"
              fullWidth
              disabled={shipSubmitting}
              onClick={() => { setShowShipModal(false); resetShipForm(); }}
            >
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              fullWidth
              loading={shipSubmitting}
              icon={!shipSubmitting ? <Send className="w-4 h-4" /> : undefined}
              onClick={handleShip}
            >
              จัดส่ง
            </Button>
          </div>
        }
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="field-label">วิธีส่ง</label>
            <FormSelect
              value={shipMethod}
              onChange={setShipMethod}
              options={SHIPPING_METHODS}
              placeholder="เลือกวิธีส่ง"
            />
          </div>

          {shipMethod === 'courier' && (
            <>
              <FormInput
                ref={shipForm.register('carrier')}
                label="ชื่อขนส่ง"
                required
                requiredMessage="กรุณาระบุชื่อขนส่ง"
                type="text"
                value={shipCarrier}
                onChange={e => setShipCarrier(e.target.value)}
                placeholder="เช่น Kerry, Flash, J&T"
              />
              <FormInput
                label="เลข Tracking"
                type="text"
                value={shipTracking}
                onChange={e => setShipTracking(e.target.value)}
                placeholder="เลขพัสดุ (ไม่บังคับ)"
              />
            </>
          )}

          {shipMethod === 'lalamove' && (
            <FormInput
              ref={shipForm.register('lalamove')}
              label="เบอร์โทรคนขับ / รายละเอียด"
              required
              requiredMessage="กรุณาระบุเบอร์โทรหรือรายละเอียด"
              type="text"
              value={shipNotes}
              onChange={e => setShipNotes(e.target.value)}
              placeholder="เบอร์โทรติดต่อ Lalamove"
            />
          )}

          {shipMethod === 'own_vehicle' && (
            <FormInput
              label="หมายเหตุ"
              type="text"
              value={shipNotes}
              onChange={e => setShipNotes(e.target.value)}
              placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
            />
          )}
        </div>
      </Modal>

      {/* Cancel Confirm Modal */}
      <Modal
        open={showCancelConfirm}
        onClose={() => !cancelSubmitting && setShowCancelConfirm(false)}
        title="ยืนยันยกเลิก"
        size="sm"
        footer={
          <div className="flex gap-3 p-4">
            <Button
              variant="secondary"
              fullWidth
              disabled={cancelSubmitting}
              onClick={() => setShowCancelConfirm(false)}
            >
              ไม่
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={cancelSubmitting}
              onClick={handleCancel}
            >
              ยืนยันยกเลิก
            </Button>
          </div>
        }
      >
        <p className="p-6 text-sm text-gray-600 dark:text-slate-400">ต้องการยกเลิกใบเติมสินค้านี้หรือไม่?</p>
      </Modal>
    </Layout>
  );
}

export default function NewReplenishmentPage() {
  return (
    <Suspense fallback={
      <Layout>
        <Container size="full">
          <LoadingCard />
        </Container>
      </Layout>
    }>
      <NewReplenishmentPageContent />
    </Suspense>
  );
}
