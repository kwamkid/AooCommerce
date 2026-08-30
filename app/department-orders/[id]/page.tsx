'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCopy } from '@/lib/useCopy';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import ShipModal from '@/components/ui/ShipModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getBadgeColor } from '@/lib/status-tab-colors';
import { showPdfPreview } from '@/lib/print-pdf';
import DealerOrderForm from '@/components/dealer/DealerOrderForm';
import ReplenishmentForm from '@/components/replenishments/ReplenishmentForm';
import {
  ArrowLeft, Building2, Loader2, Send, Copy, CheckCircle2,
  XCircle, Trash2, Printer,
} from 'lucide-react';
import Link from 'next/link';
import { LoadingCard } from '@/components/ui/StateCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { splitVatInclusive } from '@/lib/order-totals';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'ที่ต้องจัดส่ง', ...getBadgeColor('draft') },
  shipped: { label: 'กำลังส่ง', ...getBadgeColor('shipped') },
  pending_confirm: { label: 'รอยืนยัน', ...getBadgeColor('pending_confirm') },
  received: { label: 'รับครบแล้ว', ...getBadgeColor('completed') },
  partial_received: { label: 'รับไม่ครบ', ...getBadgeColor('partial_received') },
  cancelled: { label: 'ยกเลิก', ...getBadgeColor('cancelled') },
};

export default function DepartmentOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const copy = useCopy();
  const id = params.id as string;

  // Fetch order status + basic info for header
  const [orderInfo, setOrderInfo] = useState<{
    department_order_number: string;
    status: string;
    receive_token: string | null;
    customer_name: string;
    receiver_name: string | null;
  } | null>(null);
  // Full order data (for pending_confirm view)
  const [fullOrder, setFullOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Ship modal
  const [showShipModal, setShowShipModal] = useState(false);

  // Cancel confirm
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Void confirm
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voidSubmitting, setVoidSubmitting] = useState(false);

  // ReplenishmentForm state (for pending_confirm)
  const [repFormState, setRepFormState] = useState<any>(null);

  // Print state
  const [printing, setPrinting] = useState(false);

  const fetchOrderInfo = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/department-orders/${id}`);
      if (!res.ok) { router.push('/department-orders'); return; }
      const d = await res.json();
      const order = d.order;
      setOrderInfo({
        department_order_number: order.department_order_number,
        status: order.status,
        receive_token: order.receive_token,
        customer_name: order.customer?.name || '',
        receiver_name: order.receiver_name || null,
      });
      setFullOrder(order);
    } catch {
      showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrderInfo(); }, [fetchOrderInfo]);

  // === Build tax invoice PDF data from department order ===
  const buildTaxInvoiceData = (order: any) => {
    const hasConfirmed = (order.items || []).some((i: any) => i.confirmed_quantity != null && i.confirmed_quantity !== i.quantity);
    const orderItems = (order.items || [])
      .filter((i: any) => !(hasConfirmed && i.confirmed_quantity != null && i.confirmed_quantity <= 0))
      .map((i: any) => {
        const qty = hasConfirmed && i.confirmed_quantity != null ? i.confirmed_quantity : (i.quantity || 0);
        const lineTotal = qty * (i.unit_price || 0);
        return { product_name: i.product_name, variation_label: i.variation_label, quantity: qty, unit_price: i.unit_price || 0, subtotal: lineTotal, total: lineTotal };
      });
    const totalAmt = order.confirmed_total ?? order.total_amount ?? 0;
    // ใบกำกับของออเดอร์ห้างคิด VAT เสมอ (ออกให้เฉพาะร้านที่จด VAT อยู่แล้ว)
    // — ถอดด้วยสูตรกลาง lib/order-totals.ts ให้ปัดเศษตรงกับเอกสารใบอื่น
    const { subtotal: subtotalBeforeVat, vatAmount: vatAmt } = splitVatInclusive(totalAmt, true);
    return {
      order_number: order.department_order_number, created_at: order.created_at, payment_status: 'paid',
      subtotal: subtotalBeforeVat, discount_amount: 0, shipping_fee: 0, vat_amount: vatAmt, total_amount: totalAmt,
      notes: order.notes,
      customer: order.customer ? { name: order.customer.name, phone: order.customer.phone } : null,
      delivery_name: order.customer?.name, delivery_phone: order.customer?.phone,
      delivery_address: order.customer?.billing_address, delivery_district: order.customer?.billing_district,
      delivery_amphoe: order.customer?.billing_amphoe, delivery_province: order.customer?.billing_province,
      delivery_postal_code: order.customer?.billing_postal_code,
      tax_invoice_number: order.tax_invoice_number,
      tax_invoice_date: order.tax_invoice_date || new Date().toISOString().split('T')[0],
      tax_invoice_name: order.customer?.tax_company_name || order.customer?.name,
      tax_invoice_tax_id: order.customer?.tax_id,
      tax_invoice_address: [order.customer?.billing_address, order.customer?.billing_district, order.customer?.billing_amphoe, order.customer?.billing_province, order.customer?.billing_postal_code].filter(Boolean).join(' '),
      tax_invoice_branch: order.customer?.tax_branch || 'สำนักงานใหญ่',
      tax_invoice_doc_type: 'tax', items: orderItems,
    };
  };

  // === Ship action ===
  const handleShip = async (result: { method: string; carrier: string; tracking: string; notes: string }) => {
    try {
      const res = await apiFetch(`/api/department-orders/${id}`, {
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
      if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'Failed'); }
      const resData = await res.json();
      const dnNum = resData.dn_number;
      const taxNum = resData.tax_invoice_number;
      const docNums = [dnNum, taxNum].filter(Boolean);
      showToast(docNums.length > 0 ? `จัดส่งเรียบร้อย + ออกเอกสาร ${docNums.join(' + ')}` : 'จัดส่งเรียบร้อย', 'success');
      setShowShipModal(false);

      // Auto print TAX + DN after ship
      try {
        const orderRes = await apiFetch(`/api/department-orders/${id}`);
        if (orderRes.ok) {
          const { order } = await orderRes.json();
          const { showPdfPreview, mergePdfBlobs } = await import('@/lib/print-pdf');
          const blobs: Blob[] = [];

          if (taxNum) {
            const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
            const taxData = buildTaxInvoiceData(order);
            taxData.tax_invoice_number = taxNum;
            const taxBlob = await generateFullInvoicePdf(taxData);
            blobs.push(taxBlob);
          }

          if (dnNum) {
            const { generateReplenishmentPdf } = await import('@/lib/replenishment-pdf');
            const dnBlob = await generateReplenishmentPdf({
              data: {
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
              },
            });
            blobs.push(dnBlob);
          }

          if (blobs.length > 1) {
            const merged = await mergePdfBlobs(blobs);
            showPdfPreview(merged, `เอกสาร ${[taxNum, dnNum].filter(Boolean).join(' + ')}`);
          } else if (blobs.length === 1) {
            showPdfPreview(blobs[0], `เอกสาร ${taxNum || dnNum}`);
          }
        }
      } catch (printErr) {
        console.error('Auto-print after ship failed:', printErr);
      }

      router.push('/department-orders');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  // === Cancel action ===
  const handleCancel = async () => {
    setCancelSubmitting(true);
    try {
      const res = await apiFetch(`/api/department-orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'Failed'); }
      showToast('ยกเลิกเรียบร้อย', 'success');
      router.push('/department-orders');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setCancelSubmitting(false);
    }
  };

  // === Copy receive link ===
  // === Void action (shipped → draft) ===
  const handleVoid = async () => {
    setVoidSubmitting(true);
    try {
      const res = await apiFetch(`/api/department-orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void' }),
      });
      if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'Failed'); }
      showToast('Void เอกสารแล้ว — กลับเป็นที่ต้องจัดส่ง แก้ไขได้', 'success');
      setShowVoidConfirm(false);
      fetchOrderInfo();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setVoidSubmitting(false);
    }
  };


  const copyReceiveLink = () => {
    if (!orderInfo?.receive_token) return;
    const url = `${window.location.origin}/department-orders/receive/${orderInfo.receive_token}`;
    copy(url, 'ลิงก์รับของ')
  };

  // === Print DN ===
  const handlePrint = async () => {
    setPrinting(true);
    try {
      const res = await apiFetch(`/api/department-orders/${id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const { order } = await res.json();
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
          unit_price: i.unit_price,
          image: i.image,
        })),
      };
      const blob = await generateReplenishmentPdf({ data: pdfData });
      showPdfPreview(blob, `ใบส่งสินค้า ${order.department_order_number}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrinting(false);
    }
  };

  if (isLoading) {
    return <Layout><LoadingCard /></Layout>;
  }

  if (!orderInfo) return null;

  const status = orderInfo.status;
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const isViewOnly = status !== 'draft';

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header — same pattern as replenishments */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/department-orders" className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {isViewOnly ? 'ใบส่งห้าง' : 'แก้ไขใบส่งห้าง'}
              </h1>
              <span className="id-text text-primary">{orderInfo.department_order_number}</span>
              <StatusBadge status={status} colors={statusCfg}>{statusCfg.label}</StatusBadge>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handlePrint} disabled={printing} className="btn-secondary flex items-center gap-2">
              {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              พิมพ์
            </button>

            {status === 'shipped' && orderInfo.receive_token && (
              <button onClick={copyReceiveLink}
                className="btn-secondary flex items-center gap-2 !border-amber-300 dark:!border-amber-700 !bg-amber-50 dark:!bg-amber-900/20 !text-amber-700 dark:!text-amber-400 hover:!bg-amber-100 dark:hover:!bg-amber-900/30">
                <Copy className="w-4 h-4" /> คัดลอกลิงก์รับสินค้า
              </button>
            )}

            {status === 'draft' && (
              <button onClick={() => setShowShipModal(true)} className="btn-primary">
                <Send className="w-4 h-4" /> จัดส่ง
              </button>
            )}

            {status === 'draft' && (
              <button onClick={() => setShowCancelConfirm(true)} className="btn-danger flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> ยกเลิก
              </button>
            )}

            {status === 'pending_confirm' && repFormState && (
              <button onClick={repFormState.handleConfirm} disabled={repFormState.confirmSubmitting} className="btn-success">
                {repFormState.confirmSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                ยืนยัน
              </button>
            )}

            {status === 'shipped' && (
              <button onClick={() => setShowVoidConfirm(true)} className="btn-danger flex items-center gap-2">
                <XCircle className="w-4 h-4" /> Void
              </button>
            )}
          </div>
        </div>

        {/* pending_confirm / received / partial_received: use ReplenishmentForm (shared confirm view) */}
        {['pending_confirm', 'received', 'partial_received'].includes(status) ? (
          <ReplenishmentForm
            mode="department_order"
            replenishmentId={id}
            viewMode={status !== 'pending_confirm'}
            onLoad={setRepFormState}
          />
        ) : (
          /* Form — reuse DealerOrderForm for draft/shipped/cancelled */
          <DealerOrderForm
            mode="department"
            customerTypeFilter="department_store"
            customerLabel="ห้างสรรพสินค้า"
            summaryTitle="สรุปใบส่งห้าง"
            showWarehousePicker
            backUrl="/department-orders"
            orderId={id}
          />
        )}
      </div>

      {/* Ship Modal */}
      {showShipModal && (
        <ShipModal
          orderNumber={orderInfo.department_order_number}
          customerName={orderInfo.customer_name}
          onSubmit={handleShip}
          onClose={() => setShowShipModal(false)}
        />
      )}

      {/* Cancel Confirm */}
      <ConfirmDialog
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        title="ยืนยันยกเลิก"
        description="ต้องการยกเลิกใบส่งห้างนี้หรือไม่? สต๊อกที่จองไว้จะถูกคืนกลับ"
        confirmLabel="ยืนยันยกเลิก"
        variant="danger"
        loading={cancelSubmitting}
        onConfirm={handleCancel}
      />

      <ConfirmDialog
        open={showVoidConfirm}
        onClose={() => !voidSubmitting && setShowVoidConfirm(false)}
        title="ยกเลิก (Void)"
        description="ยกเลิกใบกำกับภาษี + ใบส่งสินค้าที่ออกไปแล้ว และกลับเป็นสถานะ 'ที่ต้องจัดส่ง' เพื่อแก้ไขหรือยกเลิกออเดอร์ได้"
        confirmLabel="Void เอกสาร"
        variant="danger"
        loading={voidSubmitting}
        onConfirm={handleVoid}
      />
    </Layout>
  );
}

