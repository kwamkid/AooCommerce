'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Warehouse, Package, ArrowRightLeft, CheckCircle2,
  Clock, XCircle, AlertTriangle, Truck, User, FileText,
  ArrowLeft, PackageCheck, X,
} from 'lucide-react';

interface TransferItem {
  id: string;
  variation_id: string;
  qty_sent: number;
  qty_received: number | null;
  notes: string | null;
  variation: {
    id: string;
    variation_label: string | null;
    sku: string | null;
    attributes: Record<string, string> | null;
    product: {
      id: string;
      code: string;
      name: string;
      image: string | null;
    };
  };
}

interface Transfer {
  id: string;
  transfer_number: string;
  status: string;
  notes: string | null;
  receive_notes: string | null;
  created_at: string;
  shipped_at: string | null;
  received_at: string | null;
  from_warehouse: { id: string; name: string; code: string | null } | null;
  to_warehouse: { id: string; name: string; code: string | null } | null;
  created_by_user: { id: string; name: string; email: string } | null;
  shipped_by_user: { id: string; name: string; email: string } | null;
  received_by_user: { id: string; name: string; email: string } | null;
  items: TransferItem[];
}

const STATUS_MAP: Record<string, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'แบบร่าง', color: 'text-gray-700 dark:text-slate-300', bgColor: 'bg-gray-100 dark:bg-slate-700' },
  shipped: { label: 'จัดส่งแล้ว - รอรับสินค้า', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  received: { label: 'รับสินค้าครบแล้ว', color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  partial: { label: 'รับสินค้าไม่ครบ', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  cancelled: { label: 'ยกเลิกแล้ว', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' },
};

export default function TransferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const transferId = params.id as string;

  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Receive mode
  const [receiveMode, setReceiveMode] = useState(false);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const [receiveNotes, setReceiveNotes] = useState('');

  // Cancel confirm
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    if (!authLoading && userProfile && transferId) {
      fetchTransfer();
    }
  }, [authLoading, userProfile, transferId]);

  const fetchTransfer = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/inventory/transfers?id=${transferId}`);
      if (res.ok) {
        const data = await res.json();
        setTransfer(data.transfer);
        // Pre-fill receive quantities with qty_sent
        if (data.transfer?.items) {
          const qtys: Record<string, number> = {};
          data.transfer.items.forEach((item: TransferItem) => {
            qtys[item.id] = item.qty_sent;
          });
          setReceiveQtys(qtys);
        }
      } else {
        showToast('ไม่พบใบโอนย้าย', 'error');
        router.push('/inventory/transfers');
      }
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReceive = async () => {
    if (!transfer) return;
    try {
      setSubmitting(true);
      const items = transfer.items.map(item => ({
        item_id: item.id,
        qty_received: receiveQtys[item.id] ?? item.qty_sent,
      }));

      const res = await apiFetch('/api/inventory/transfers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer_id: transfer.id,
          action: 'receive',
          items,
          receive_notes: receiveNotes || undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาด');

      showToast(result.status === 'received' ? 'รับสินค้าครบแล้ว' : 'รับสินค้าไม่ครบ (บางรายการคืนคลังต้นทาง)', 'success');
      setReceiveMode(false);
      fetchTransfer();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!transfer) return;
    try {
      setSubmitting(true);
      const res = await apiFetch('/api/inventory/transfers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer_id: transfer.id,
          action: 'cancel',
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาด');

      showToast('ยกเลิกใบโอนย้ายเรียบร้อย (คืนสต็อกแล้ว)', 'success');
      setShowCancelConfirm(false);
      fetchTransfer();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getVariationLabel = (item: TransferItem): string => {
    const parts: string[] = [];
    if (item.variation?.variation_label) parts.push(item.variation.variation_label);
    if (item.variation?.attributes) {
      Object.values(item.variation.attributes).forEach(v => {
        if (v && v.trim()) parts.push(v.trim());
      });
    }
    return parts.join(' / ');
  };

  if (authLoading || loading) {
    return (
      <Layout
        title="รายละเอียดโอนย้าย"
        breadcrumbs={[
          { label: 'คลังสินค้า', href: '/inventory' },
          { label: 'รายการโอนย้าย', href: '/inventory/transfers' },
          { label: 'รายละเอียด' },
        ]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!transfer) {
    return (
      <Layout
        title="ไม่พบใบโอนย้าย"
        breadcrumbs={[
          { label: 'คลังสินค้า', href: '/inventory' },
          { label: 'รายการโอนย้าย', href: '/inventory/transfers' },
          { label: 'ไม่พบ' },
        ]}
      >
        <div className="text-center py-16">
          <XCircle className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-400">ไม่พบใบโอนย้ายนี้</p>
          <button
            onClick={() => router.push('/inventory/transfers')}
            className="mt-4 text-[#F4511E] hover:underline text-sm"
          >
            กลับไปรายการโอนย้าย
          </button>
        </div>
      </Layout>
    );
  }

  const st = STATUS_MAP[transfer.status] || STATUS_MAP.draft;

  return (
    <Layout
      title={`ใบโอนย้าย ${transfer.transfer_number}`}
      breadcrumbs={[
        { label: 'คลังสินค้า', href: '/inventory' },
        { label: 'รายการโอนย้าย', href: '/inventory/transfers' },
        { label: transfer.transfer_number },
      ]}
    >
      <div className="space-y-4">
        {/* Back + Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/inventory/transfers')}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          <div className="flex items-center gap-2">
            {transfer.status === 'shipped' && !receiveMode && (
              <>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="px-4 py-2 text-sm border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => setReceiveMode(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <PackageCheck className="w-4 h-4" />
                  รับสินค้า
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status Banner */}
        <div className={`rounded-lg px-4 py-3 flex items-center gap-2 ${st.bgColor}`}>
          {transfer.status === 'shipped' && <Truck className="w-5 h-5" />}
          {transfer.status === 'received' && <CheckCircle2 className="w-5 h-5" />}
          {transfer.status === 'partial' && <AlertTriangle className="w-5 h-5" />}
          {transfer.status === 'cancelled' && <XCircle className="w-5 h-5" />}
          {transfer.status === 'draft' && <Clock className="w-5 h-5" />}
          <span className={`text-sm font-medium ${st.color}`}>{st.label}</span>
        </div>

        {/* Header Info */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">คลังต้นทาง</label>
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {transfer.from_warehouse?.name || '-'}
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">คลังปลายทาง</label>
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {transfer.to_warehouse?.name || '-'}
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">สร้างโดย</label>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-slate-300">
                  {transfer.created_by_user?.name || '-'}
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">วันที่สร้าง</label>
              <span className="text-sm text-gray-700 dark:text-slate-300">{formatDate(transfer.created_at)}</span>
            </div>
            {transfer.shipped_at && (
              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">วันที่จัดส่ง</label>
                <span className="text-sm text-gray-700 dark:text-slate-300">{formatDate(transfer.shipped_at)}</span>
              </div>
            )}
            {transfer.received_at && (
              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">วันที่รับสินค้า</label>
                <span className="text-sm text-gray-700 dark:text-slate-300">{formatDate(transfer.received_at)}</span>
                {transfer.received_by_user && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                    โดย {transfer.received_by_user.name}
                  </p>
                )}
              </div>
            )}
          </div>
          {transfer.notes && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">หมายเหตุ</label>
              <p className="text-sm text-gray-700 dark:text-slate-300">{transfer.notes}</p>
            </div>
          )}
          {transfer.receive_notes && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">หมายเหตุการรับสินค้า</label>
              <p className="text-sm text-gray-700 dark:text-slate-300">{transfer.receive_notes}</p>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              รายการสินค้า ({transfer.items?.length || 0} รายการ)
            </h3>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สินค้า</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-28">จำนวนส่ง</th>
                  {(transfer.status === 'received' || transfer.status === 'partial') && (
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-28">จำนวนรับ</th>
                  )}
                  {receiveMode && (
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-36">จำนวนรับจริง</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {(transfer.items || []).map(item => {
                  const varLabel = getVariationLabel(item);
                  const isShort = item.qty_received !== null && item.qty_received < item.qty_sent;
                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/30 ${isShort ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.variation?.product?.image ? (
                            <img
                              src={item.variation.product.image}
                              alt={item.variation.product.name}
                              className="w-10 h-10 rounded object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <Package className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {item.variation?.product?.name || '-'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-slate-400">
                              {item.variation?.product?.code || ''}
                              {varLabel && ` | ${varLabel}`}
                              {item.variation?.sku && ` | SKU: ${item.variation.sku}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.qty_sent}
                        </span>
                      </td>
                      {(transfer.status === 'received' || transfer.status === 'partial') && (
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-medium ${isShort ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                            {item.qty_received ?? '-'}
                          </span>
                          {isShort && (
                            <p className="text-xs text-amber-500 dark:text-amber-400 mt-0.5">
                              ขาด {item.qty_sent - (item.qty_received || 0)}
                            </p>
                          )}
                        </td>
                      )}
                      {receiveMode && (
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min="0"
                            max={item.qty_sent}
                            value={receiveQtys[item.id] ?? item.qty_sent}
                            onChange={e => {
                              const val = Math.max(0, Math.min(item.qty_sent, parseInt(e.target.value) || 0));
                              setReceiveQtys(prev => ({ ...prev, [item.id]: val }));
                            }}
                            className="w-24 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-slate-300">
                    รวม {transfer.items?.length || 0} รายการ
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-gray-900 dark:text-white">
                    {(transfer.items || []).reduce((sum, i) => sum + i.qty_sent, 0)}
                  </td>
                  {(transfer.status === 'received' || transfer.status === 'partial') && (
                    <td className="px-4 py-3 text-center text-sm font-medium text-gray-900 dark:text-white">
                      {(transfer.items || []).reduce((sum, i) => sum + (i.qty_received ?? 0), 0)}
                    </td>
                  )}
                  {receiveMode && (
                    <td className="px-4 py-3 text-center text-sm font-medium text-green-600 dark:text-green-400">
                      {Object.values(receiveQtys).reduce((sum, v) => sum + v, 0)}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
            {(transfer.items || []).map(item => {
              const varLabel = getVariationLabel(item);
              const isShort = item.qty_received !== null && item.qty_received < item.qty_sent;
              return (
                <div key={item.id} className={`p-3 ${isShort ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                  <div className="flex items-start gap-2.5">
                    {item.variation?.product?.image ? (
                      <img
                        src={item.variation.product.image}
                        alt={item.variation.product.name}
                        className="w-12 h-12 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <Package className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                        {item.variation?.product?.name || '-'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        {item.variation?.product?.code || ''}
                        {varLabel && ` | ${varLabel}`}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="text-center">
                          <p className="text-xs text-gray-400 dark:text-slate-500">ส่ง</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{item.qty_sent}</p>
                        </div>
                        {(transfer.status === 'received' || transfer.status === 'partial') && (
                          <div className="text-center">
                            <p className="text-xs text-gray-400 dark:text-slate-500">รับ</p>
                            <p className={`text-sm font-medium ${isShort ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                              {item.qty_received ?? '-'}
                            </p>
                          </div>
                        )}
                        {receiveMode && (
                          <div className="text-center ml-auto">
                            <p className="text-xs text-gray-400 dark:text-slate-500">รับจริง</p>
                            <input
                              type="number"
                              min="0"
                              max={item.qty_sent}
                              value={receiveQtys[item.id] ?? item.qty_sent}
                              onChange={e => {
                                const val = Math.max(0, Math.min(item.qty_sent, parseInt(e.target.value) || 0));
                                setReceiveQtys(prev => ({ ...prev, [item.id]: val }));
                              }}
                              className="w-20 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/50"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Receive Actions */}
        {receiveMode && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                หมายเหตุการรับสินค้า
              </label>
              <textarea
                value={receiveNotes}
                onChange={e => setReceiveNotes(e.target.value)}
                rows={2}
                placeholder="หมายเหตุ (ถ้ามี)..."
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setReceiveMode(false)}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleReceive}
                disabled={submitting}
                className="bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    ยืนยันรับสินค้า
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Cancel Confirm Modal */}
        {showCancelConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-sm w-full p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">ยกเลิกใบโอนย้าย</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    ยืนยันยกเลิกใบโอนย้าย {transfer.transfer_number}? สต็อกจะถูกคืนกลับไปที่คลังต้นทาง
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50"
                >
                  ไม่ใช่
                </button>
                <button
                  onClick={handleCancel}
                  disabled={submitting}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      กำลังยกเลิก...
                    </>
                  ) : (
                    'ยืนยันยกเลิก'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
