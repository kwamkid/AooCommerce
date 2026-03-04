'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  ArrowLeft, ArrowUpFromLine, Loader2, Package, Truck,
  CheckCircle2, RefreshCw, ClipboardCheck, XCircle,
} from 'lucide-react';
import Link from 'next/link';
import FormSelect from '@/components/ui/FormSelect';
import { SHIPPING_CARRIERS } from '@/app/orders/components/types';

interface ReplenishmentItem {
  id: string;
  product_name: string;
  variation_label: string | null;
  quantity: number;
  received_quantity: number;
  unit_price: number;
  image?: string | null;
}

interface ReplenishmentDetail {
  id: string;
  replenishment_number: string;
  status: string;
  notes: string | null;
  total_amount: number;
  shipping_carrier: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  received_at: string | null;
  created_at: string;
  customer: { id: string; name: string; customer_code: string | null; phone: string | null } | null;
  created_by_profile: { id: string; name: string } | null;
  items: ReplenishmentItem[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'แบบร่าง', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/40' },
  confirmed: { label: 'ยืนยันแล้ว', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/40' },
  shipped: { label: 'จัดส่งแล้ว', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/40' },
  received: { label: 'รับครบแล้ว', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40' },
  partial_received: { label: 'รับบางส่วน', color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' },
  cancelled: { label: 'ยกเลิก', color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/40' },
};

export default function ReplenishmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const id = params.id as string;

  const [data, setData] = useState<ReplenishmentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Ship modal
  const [shipModal, setShipModal] = useState(false);
  const [shipCarrier, setShipCarrier] = useState('');
  const [shipTracking, setShipTracking] = useState('');

  // Receive modal
  const [receiveModal, setReceiveModal] = useState(false);
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({});

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/replenishments/${id}`);
      if (!res.ok) { router.push('/replenishments'); return; }
      const d = await res.json();
      setData(d.replenishment);
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
      const res = await apiFetch(`/api/replenishments/${id}`, {
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

  const handleConfirm = () => handleAction({ status: 'confirmed' });
  const handleCancel = () => handleAction({ status: 'cancelled' });

  const handleShip = async () => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/replenishments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'shipped',
          shipping_carrier: shipCarrier || null,
          tracking_number: shipTracking || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      showToast('บันทึกการจัดส่งแล้ว', 'success');
      setShipModal(false);
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const openReceiveModal = () => {
    if (!data) return;
    const qtys: Record<string, number> = {};
    for (const item of data.items) qtys[item.id] = item.quantity;
    setReceivedQtys(qtys);
    setReceiveModal(true);
  };

  const handleReceive = async () => {
    if (!data) return;
    setActionLoading(true);
    try {
      const received_items = data.items.map(item => ({
        id: item.id,
        received_quantity: receivedQtys[item.id] ?? item.quantity,
      }));
      const res = await apiFetch(`/api/replenishments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'receive', received_items }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      showToast('บันทึกการรับสินค้าแล้ว', 'success');
      setReceiveModal(false);
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  if (!data) return null;

  const statusCfg = STATUS_CONFIG[data.status] || STATUS_CONFIG.draft;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/replenishments" className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <ArrowUpFromLine className="w-5 h-5 text-[#F4511E] flex-shrink-0" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{data.replenishment_number}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusCfg.bg} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>
          <button onClick={() => fetchData()} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
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
                  <p className="text-sm font-medium text-gray-800 dark:text-white">
                    {item.quantity} ชิ้น
                    {data.status === 'received' || data.status === 'partial_received' ? (
                      <span className={`ml-1 text-xs ${item.received_quantity >= item.quantity ? 'text-green-600' : 'text-orange-500'}`}>
                        (รับ {item.received_quantity})
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-gray-400">฿{item.unit_price.toLocaleString()}/ชิ้น</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        {data.status === 'draft' && (
          <div className="flex gap-3">
            <button onClick={handleCancel} disabled={actionLoading} className="btn btn-ghost flex-1 gap-2">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              ยกเลิก
            </button>
            <button onClick={handleConfirm} disabled={actionLoading} className="btn btn-primary flex-1 gap-2">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              ยืนยัน
            </button>
          </div>
        )}

        {data.status === 'confirmed' && (
          <div className="flex gap-3">
            <button onClick={handleCancel} disabled={actionLoading} className="btn btn-ghost flex-1 gap-2">
              <XCircle className="w-4 h-4" /> ยกเลิก
            </button>
            <button onClick={() => { setShipCarrier(data.shipping_carrier || ''); setShipTracking(data.tracking_number || ''); setShipModal(true); }} disabled={actionLoading} className="btn btn-primary flex-1 gap-2">
              <Truck className="w-4 h-4" /> จัดส่งแล้ว
            </button>
          </div>
        )}

        {data.status === 'shipped' && (
          <button onClick={openReceiveModal} disabled={actionLoading} className="btn btn-primary w-full gap-2">
            <ClipboardCheck className="w-4 h-4" /> บันทึกรับสินค้า
          </button>
        )}

        {(data.status === 'received' || data.status === 'partial_received') && (
          <div className={`rounded-xl p-4 flex items-center gap-2 ${data.status === 'received' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400'}`}>
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">
              {data.status === 'received' ? 'รับสินค้าครบแล้ว' : 'รับสินค้าบางส่วนแล้ว'}
              {data.received_at ? ` · ${new Date(data.received_at).toLocaleDateString('th-TH')}` : ''}
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
                <FormSelect
                  value={shipCarrier}
                  onChange={setShipCarrier}
                  options={SHIPPING_CARRIERS.map(c => ({ id: c.value, label: c.label }))}
                  placeholder="เลือกขนส่ง"
                  searchThreshold={99}
                />
              </div>
              <div>
                <label className="label-text text-xs mb-1 block">เลขพัสดุ</label>
                <input type="text" value={shipTracking} onChange={e => setShipTracking(e.target.value)} placeholder="เลข tracking (ถ้ามี)" className="input w-full" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShipModal(false)} disabled={actionLoading} className="btn btn-ghost flex-1">ยกเลิก</button>
              <button onClick={handleShip} disabled={actionLoading} className="btn btn-primary flex-1 gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                จัดส่ง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {receiveModal && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => !actionLoading && setReceiveModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">บันทึกรับสินค้า</h3>
            <div className="flex-1 overflow-y-auto space-y-2">
              {data.items.map(item => (
                <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-slate-700/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-white truncate">{item.product_name}</p>
                    {item.variation_label && <p className="text-xs text-gray-400">{item.variation_label}</p>}
                    <p className="text-xs text-gray-400">สั่ง {item.quantity} ชิ้น</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">รับ</span>
                    <input
                      type="number"
                      min={0}
                      max={item.quantity}
                      value={receivedQtys[item.id] ?? item.quantity}
                      onChange={e => setReceivedQtys(prev => ({ ...prev, [item.id]: Math.max(0, Math.min(item.quantity, parseInt(e.target.value) || 0)) }))}
                      className="input w-16 text-center text-sm px-2 py-1"
                    />
                    <span className="text-xs text-gray-500">ชิ้น</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4 pt-4 border-t dark:border-slate-700">
              <button onClick={() => setReceiveModal(false)} disabled={actionLoading} className="btn btn-ghost flex-1">ยกเลิก</button>
              <button onClick={handleReceive} disabled={actionLoading} className="btn btn-primary flex-1 gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
