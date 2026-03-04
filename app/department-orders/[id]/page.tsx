'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  ArrowLeft, Building2, Loader2, Package, Truck,
  CheckCircle2, RefreshCw, XCircle, Receipt, Banknote,
} from 'lucide-react';
import Link from 'next/link';
import FormSelect from '@/components/ui/FormSelect';
import { SHIPPING_CARRIERS } from '@/app/orders/components/types';

interface DeptOrderItem {
  id: string;
  product_name: string;
  variation_label: string | null;
  quantity: number;
  unit_price: number;
  image?: string | null;
}

interface DeptOrderDetail {
  id: string;
  department_order_number: string;
  status: string;
  notes: string | null;
  total_amount: number;
  tax_invoice_number: string | null;
  tax_invoice_date: string | null;
  tax_invoice_name: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  created_at: string;
  customer: { id: string; name: string; customer_code: string | null; phone: string | null } | null;
  created_by_profile: { id: string; name: string } | null;
  items: DeptOrderItem[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'แบบร่าง', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/40' },
  confirmed: { label: 'ยืนยันแล้ว', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/40' },
  shipped: { label: 'จัดส่งแล้ว', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/40' },
  invoiced: { label: 'ออก Invoice แล้ว', color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  paid: { label: 'ได้รับเงินแล้ว', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40' },
  cancelled: { label: 'ยกเลิก', color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/40' },
};

export default function DepartmentOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const id = params.id as string;

  const [data, setData] = useState<DeptOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [shipModal, setShipModal] = useState(false);
  const [shipCarrier, setShipCarrier] = useState('');
  const [shipTracking, setShipTracking] = useState('');

  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/department-orders/${id}`);
      if (!res.ok) { router.push('/department-orders'); return; }
      const d = await res.json();
      setData(d.order);
    } catch {
      showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = async (updates: Record<string, unknown>) => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/department-orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      showToast('อัปเดตสำเร็จ', 'success');
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleShip = async () => {
    await handleAction({ status: 'shipped', shipping_carrier: shipCarrier || null, tracking_number: shipTracking || null });
    setShipModal(false);
  };

  const handleInvoice = async () => {
    if (!invoiceNumber) { showToast('กรุณากรอกเลข invoice', 'error'); return; }
    await handleAction({ status: 'invoiced', tax_invoice_number: invoiceNumber, tax_invoice_date: invoiceDate || null });
    setInvoiceModal(false);
  };

  if (isLoading) {
    return <Layout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div></Layout>;
  }

  if (!data) return null;

  const statusCfg = STATUS_CONFIG[data.status] || STATUS_CONFIG.draft;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/department-orders" className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Building2 className="w-5 h-5 text-[#F4511E] flex-shrink-0" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{data.department_order_number}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusCfg.bg} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Info Card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{data.customer?.name}</p>
              {data.customer?.customer_code && <p className="text-xs text-gray-400">{data.customer.customer_code}</p>}
              {data.customer?.phone && <p className="text-xs text-gray-400">{data.customer.phone}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">ยอดรวม</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                ฿{data.total_amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          {data.tax_invoice_number && (
            <div className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
              <Receipt className="w-4 h-4" />
              Invoice: {data.tax_invoice_number}
              {data.tax_invoice_date && <span className="text-gray-400">· {new Date(data.tax_invoice_date).toLocaleDateString('th-TH')}</span>}
            </div>
          )}
          {data.shipping_carrier && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
              <Truck className="w-4 h-4 text-gray-400" />
              {data.shipping_carrier}
              {data.tracking_number && <span className="font-mono text-xs bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded">{data.tracking_number}</span>}
            </div>
          )}
          {data.notes && <p className="text-sm text-gray-500 dark:text-slate-400 italic">{data.notes}</p>}
          <p className="text-xs text-gray-400">
            สร้างโดย {data.created_by_profile?.name || 'ระบบ'} · {new Date(data.created_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
          </p>
        </div>

        {/* Items */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">รายการสินค้า ({data.items.length} รายการ)</h2>
          <div className="space-y-2">
            {data.items.map(item => (
              <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-slate-700/50 last:border-0">
                {item.image ? (
                  <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-gray-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-white truncate">{item.product_name}</p>
                  {item.variation_label && <p className="text-xs text-gray-400">{item.variation_label}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-white">{item.quantity} ชิ้น</p>
                  <p className="text-xs text-gray-400">฿{item.unit_price.toLocaleString()}/ชิ้น</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        {data.status === 'draft' && (
          <div className="flex gap-3">
            <button onClick={() => handleAction({ status: 'cancelled' })} disabled={actionLoading} className="btn btn-ghost flex-1 gap-2">
              <XCircle className="w-4 h-4" /> ยกเลิก
            </button>
            <button onClick={() => handleAction({ status: 'confirmed' })} disabled={actionLoading} className="btn btn-primary flex-1 gap-2">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              ยืนยัน
            </button>
          </div>
        )}

        {data.status === 'confirmed' && (
          <div className="flex gap-3">
            <button onClick={() => handleAction({ status: 'cancelled' })} disabled={actionLoading} className="btn btn-ghost flex-1 gap-2">
              <XCircle className="w-4 h-4" /> ยกเลิก
            </button>
            <button onClick={() => { setShipCarrier(data.shipping_carrier || ''); setShipTracking(data.tracking_number || ''); setShipModal(true); }} disabled={actionLoading} className="btn btn-primary flex-1 gap-2">
              <Truck className="w-4 h-4" /> จัดส่งแล้ว
            </button>
          </div>
        )}

        {data.status === 'shipped' && (
          <button onClick={() => { setInvoiceNumber(data.tax_invoice_number || ''); setInvoiceDate(data.tax_invoice_date || ''); setInvoiceModal(true); }} disabled={actionLoading} className="btn btn-primary w-full gap-2">
            <Receipt className="w-4 h-4" /> ออก Tax Invoice
          </button>
        )}

        {data.status === 'invoiced' && (
          <button onClick={() => handleAction({ status: 'paid' })} disabled={actionLoading} className="btn btn-primary w-full gap-2">
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
            บันทึกรับเงิน
          </button>
        )}

        {data.status === 'paid' && (
          <div className="rounded-xl p-4 flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">
              ได้รับเงินแล้ว{data.paid_at ? ` · ${new Date(data.paid_at).toLocaleDateString('th-TH')}` : ''}
            </p>
          </div>
        )}
      </div>

      {/* Ship Modal */}
      {shipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => !actionLoading && setShipModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">บันทึกการจัดส่ง</h3>
            <div className="space-y-3">
              <div>
                <label className="label-text text-xs mb-1 block">ขนส่ง</label>
                <FormSelect value={shipCarrier} onChange={setShipCarrier}
                  options={SHIPPING_CARRIERS.map(c => ({ id: c.value, label: c.label }))}
                  placeholder="เลือกขนส่ง" searchThreshold={99} />
              </div>
              <div>
                <label className="label-text text-xs mb-1 block">เลขพัสดุ</label>
                <input type="text" value={shipTracking} onChange={e => setShipTracking(e.target.value)}
                  placeholder="เลข tracking" className="input w-full" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShipModal(false)} disabled={actionLoading} className="btn btn-ghost flex-1">ยกเลิก</button>
              <button onClick={handleShip} disabled={actionLoading} className="btn btn-primary flex-1 gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />} จัดส่ง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {invoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => !actionLoading && setInvoiceModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">ออก Tax Invoice</h3>
            <div className="space-y-3">
              <div>
                <label className="label-text text-xs mb-1 block">เลข Invoice <span className="text-red-500">*</span></label>
                <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder="เช่น IV-202603-0001" className="input w-full" autoFocus />
              </div>
              <div>
                <label className="label-text text-xs mb-1 block">วันที่ออก Invoice</label>
                <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="input w-full" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setInvoiceModal(false)} disabled={actionLoading} className="btn btn-ghost flex-1">ยกเลิก</button>
              <button onClick={handleInvoice} disabled={actionLoading || !invoiceNumber} className="btn btn-primary flex-1 gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />} บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
