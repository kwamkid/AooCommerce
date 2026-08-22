'use client';

import { useState, useEffect, useRef } from 'react';
import { useCopy } from '@/lib/useCopy';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import NumberInput from '@/components/ui/NumberInput';
import ImageLightbox from '@/components/ui/ImageLightbox';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { generateInventoryPdf } from '@/lib/inventory-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import { getBadgeColor } from '@/lib/status-tab-colors';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Warehouse, Package, ArrowRightLeft, CheckCircle2, Clock, XCircle, AlertTriangle, Truck, User, FileText, ArrowLeft, PackageCheck, Printer, Link2, Copy, Check, Image as ImageIcon } from 'lucide-react';
import { flattenVariationItem, productDisplayName, productSubtitle } from '../../components/types';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import { LoadingCard } from '@/components/ui/StateCard';

interface TransferItem {
  id: string;
  variation_id: string;
  qty_sent: number;
  qty_received: number | null;
  confirmed_quantity: number;
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
  receive_token: string;
  receiver_name: string | null;
  receive_photo_url: string | null;
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

// สีจากคลังกลาง lib/status-tab-colors — 'received' ของ transfer = สำเร็จ จึง map ไป 'completed'
// (key 'received' ในคลังกลางเป็นของ consignment "รอยืนยัน" คนละความหมาย)
const STATUS_MAP: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'ที่ต้องจัดส่ง - จอง stock แล้ว', color: getBadgeColor('pending').color, bgColor: getBadgeColor('pending').bg },
  shipping: { label: 'กำลังส่ง - รอรับสินค้า', color: getBadgeColor('shipping').color, bgColor: getBadgeColor('shipping').bg },
  pending_confirm: { label: 'รอยืนยัน — รับไม่ครบ', color: getBadgeColor('pending_confirm').color, bgColor: getBadgeColor('pending_confirm').bg },
  received: { label: 'รับสินค้าแล้ว', color: getBadgeColor('completed').color, bgColor: getBadgeColor('completed').bg },
  cancelled: { label: 'ยกเลิกแล้ว', color: getBadgeColor('cancelled').color, bgColor: getBadgeColor('cancelled').bg },
};

export default function TransferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const copy = useCopy();
  const transferId = params.id as string;

  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Ship action
  const [shipping, setShipping] = useState(false);

  // Cancel confirm
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  // Confirm action (pending_confirm)
  const [confirmedQtys, setConfirmedQtys] = useState<Record<string, number>>({});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!authLoading && userProfile && transferId) {
      fetchTransfer();
    }
  }, [authLoading, userProfile, transferId]);

  const fetchTransfer = async (retry = 0): Promise<void> => {
    if (retry === 0) {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
    }
    try {
      setLoading(true);
      const res = await apiFetch(`/api/inventory/transfers?id=${transferId}`);
      if (res.ok) {
        const data = await res.json();
        setTransfer(data.transfer);
        setNotes(data.transfer?.notes || '');
        // Initialize confirmed quantities for pending_confirm
        if (data.transfer?.status === 'pending_confirm') {
          const qtys: Record<string, number> = {};
          for (const item of data.transfer.items || []) {
            qtys[item.id] = item.confirmed_quantity || item.qty_received || item.qty_sent;
          }
          setConfirmedQtys(qtys);
        }
        return;
      }
      if (retry < 2) {
        await new Promise(r => setTimeout(r, 800));
        return fetchTransfer(retry + 1);
      }
      showToast('ไม่พบใบโอนย้าย', 'error');
      router.push('/inventory/transfers');
    } catch {
      if (retry < 2) {
        await new Promise(r => setTimeout(r, 800));
        return fetchTransfer(retry + 1);
      }
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
      if (retry === 0 || retry >= 2) fetchingRef.current = false;
    }
  };

  const handleSaveNotes = async () => {
    if (!transfer) return;
    try {
      setSavingNotes(true);
      const res = await apiFetch('/api/inventory/transfers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transfer.id, notes: notes.trim() }),
      });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
      setTransfer(prev => prev ? { ...prev, notes: notes.trim() || null } : prev);
      showToast('บันทึกหมายเหตุเรียบร้อย', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleShip = async () => {
    if (!transfer) return;
    try {
      setShipping(true);
      const res = await apiFetch('/api/inventory/transfers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer_id: transfer.id,
          action: 'ship',
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาด');

      showToast('จัดส่งสินค้าเรียบร้อย (ตัด stock จากคลังต้นทาง)', 'success');
      fetchTransfer();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setShipping(false);
    }
  };

  const getReceiveUrl = () => {
    if (!transfer) return '';
    return `${window.location.origin}/transfers/receive/${transfer.receive_token}`;
  };

  const handleCopyLink = async () => {
    try {
      await copy(getReceiveUrl())
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch { /* fallback */ }
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

  const handleConfirm = async () => {
    if (!transfer) return;
    try {
      setConfirming(true);
      const confirmed_items = transfer.items.map(item => ({
        item_id: item.id,
        confirmed_quantity: confirmedQtys[item.id] ?? item.qty_received ?? item.qty_sent,
      }));
      const res = await apiFetch('/api/inventory/transfers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer_id: transfer.id,
          action: 'confirm',
          confirmed_items,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาด');
      showToast('ยืนยันรับสินค้าเรียบร้อย', 'success');
      fetchTransfer();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setConfirming(false);
    }
  };

  const handlePrint = async () => {
    if (!transfer) return;
    setGeneratingPdf(true);
    try {
      const blob = await generateInventoryPdf({
        type: 'transfer',
        data: {
          id: transfer.id,
          doc_number: transfer.transfer_number,
          status: transfer.status,
          notes: transfer.notes,
          created_at: transfer.created_at,
          warehouse: transfer.from_warehouse,
          to_warehouse: transfer.to_warehouse,
          created_by_user: transfer.created_by_user,
          receive_token: transfer.receive_token,
          items: (transfer.items || []).map(item => ({
            ...item,
            quantity: item.qty_sent,
          })),
        },
      });
      showPdfPreview(blob, 'ใบโอนย้ายสินค้า');
    } catch {
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setGeneratingPdf(false);
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

  const getDisplayInfo = (item: TransferItem) => {
    const f = flattenVariationItem(item);
    return { main: productDisplayName(f), sub: productSubtitle(f) };
  };

  const notesChanged = (notes || '') !== (transfer?.notes || '');

  if (authLoading || loading) {
    return (
      <Layout
        title="แก้ไขใบโอนย้าย"
        breadcrumbs={[
          { label: 'คลังสินค้า', href: '/inventory' },
          { label: 'รายการโอนย้าย', href: '/inventory/transfers' },
          { label: 'แก้ไข' },
        ]}
      >
        <LoadingCard />
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
            className="mt-4 text-primary hover:underline text-sm"
          >
            กลับไปรายการโอนย้าย
          </button>
        </div>
      </Layout>
    );
  }

  const st = STATUS_MAP[transfer.status] || STATUS_MAP.pending;

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
            <Button size="sm" loading={generatingPdf} onClick={handlePrint} icon={<Printer className="w-4 h-4" />}>
              พิมพ์
            </Button>
            {transfer.status === 'pending' && (
              <>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="px-4 py-2 text-sm border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleShip}
                  disabled={shipping}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
                >
                  {shipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                  {shipping ? 'กำลังจัดส่ง...' : 'จัดส่ง'}
                </button>
              </>
            )}
            {transfer.status === 'shipping' && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="px-4 py-2 text-sm border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                ยกเลิก
              </button>
            )}
            {transfer.status === 'pending_confirm' && (
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
              >
                {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {confirming ? 'กำลังยืนยัน...' : 'ยืนยันรับสินค้า'}
              </button>
            )}
          </div>
        </div>

        {/* Status Banner */}
        <div className={`rounded-lg px-4 py-3 flex items-center gap-2 ${st.bgColor}`}>
          {transfer.status === 'pending' && <Clock className="w-5 h-5" />}
          {transfer.status === 'shipping' && <Truck className="w-5 h-5" />}
          {transfer.status === 'pending_confirm' && <AlertTriangle className="w-5 h-5" />}
          {transfer.status === 'received' && <CheckCircle2 className="w-5 h-5" />}
          {transfer.status === 'cancelled' && <XCircle className="w-5 h-5" />}
          <span className={`text-sm font-medium ${st.color}`}>{st.label}</span>
        </div>

        {/* QR Code + Receive Link — for shipping status (above header info) */}
        {transfer.status === 'shipping' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-blue-500" />
              ลิงก์รับสินค้า (ส่งให้ผู้รับสแกน QR)
            </h3>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="bg-white p-3 rounded-lg border border-gray-200">
                <QRCodeSVG value={getReceiveUrl()} size={120} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">ส่ง QR Code หรือลิงก์ด้านล่างให้ผู้รับที่คลังปลายทาง เพื่อยืนยันรับสินค้า</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getReceiveUrl()}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-xs bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-slate-300 truncate"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
                  >
                    {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedLink ? 'คัดลอกแล้ว' : 'คัดลอก'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header Info */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="data-label text-gray-500 dark:text-slate-400 uppercase mb-1 block">คลังต้นทาง</label>
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-gray-400" />
                <span className="data-primary text-gray-900 dark:text-white">
                  {transfer.from_warehouse?.name || '-'}
                </span>
              </div>
            </div>
            <div>
              <label className="data-label text-gray-500 dark:text-slate-400 uppercase mb-1 block">คลังปลายทาง</label>
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-gray-400" />
                <span className="data-primary text-gray-900 dark:text-white">
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

          {/* Editable Notes */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
            <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">หมายเหตุ</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="เพิ่มหมายเหตุ..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
            {notesChanged && (
              <div className="flex justify-end mt-2">
                <SaveButton
                  size="sm"
                  loading={savingNotes}
                  onClick={handleSaveNotes}
                >
                  บันทึก
                </SaveButton>
              </div>
            )}
          </div>

          {transfer.receive_notes && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">หมายเหตุการรับสินค้า</label>
              <p className="text-sm text-gray-700 dark:text-slate-300">{transfer.receive_notes}</p>
            </div>
          )}

          {/* Receiver info — show for pending_confirm and received */}
          {['pending_confirm', 'received'].includes(transfer.status) && transfer.receiver_name && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">ผู้รับสินค้า (Online)</label>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{transfer.receiver_name}</p>
            </div>
          )}

          {['pending_confirm', 'received'].includes(transfer.status) && transfer.receive_photo_url && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">รูปถ่ายการรับสินค้า</label>
              <img
                src={transfer.receive_photo_url}
                alt="รูปรับสินค้า"
                className="max-w-xs max-h-48 rounded-lg object-contain border border-gray-200 dark:border-slate-600 mt-1 cursor-pointer hover:opacity-80"
                onClick={() => setLightboxSrc(transfer.receive_photo_url)}
              />
            </div>
          )}
        </div>

        {/* Items */}
        {(() => {
          const hasMismatch = transfer.items.some(i => i.qty_received !== null && i.qty_received !== i.qty_sent);
          const showReceived = ['pending_confirm', 'received'].includes(transfer.status);
          const showConfirmed = showReceived && hasMismatch;
          const isConfirmEditable = transfer.status === 'pending_confirm';

          return (
            <>
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 w-10">#</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400">รายละเอียด</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 w-20">จำนวนส่ง</th>
                      {showReceived && (
                        <th className="text-center px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 w-20">จำนวนรับ</th>
                      )}
                      {showConfirmed && (
                        <th className="text-center px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 w-24">จำนวนยืนยัน</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {transfer.items.map((item, idx) => {
                      const name = getDisplayInfo(item);
                      const isMismatch = item.qty_received !== null && item.qty_received !== item.qty_sent;
                      return (
                        <tr key={item.id} className="border-b border-gray-100 dark:border-slate-700/50">
                          <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {item.variation?.product?.image ? (
                                <img src={item.variation.product.image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-10 h-10 bg-gray-100 dark:bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
                                  <Package className="w-5 h-5 text-gray-400" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-gray-900 dark:text-white truncate">{name.main}</p>
                                {name.sub && <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{name.sub}</p>}
                                {item.variation?.sku && <p className="text-xs text-gray-400 dark:text-slate-500">SKU: {item.variation.sku}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-900 dark:text-white">{item.qty_sent}</td>
                          {showReceived && (
                            <td className={`px-4 py-3 text-center font-medium ${isMismatch ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                              {item.qty_received ?? '-'}
                            </td>
                          )}
                          {showConfirmed && (
                            <td className="px-4 py-3 text-center">
                              {isConfirmEditable ? (
                                <NumberInput
                                  min={0}
                                  max={item.qty_sent}
                                  value={confirmedQtys[item.id] ?? item.qty_received ?? item.qty_sent}
                                  onChange={(n) => setConfirmedQtys(prev => ({ ...prev, [item.id]: Math.min(Math.max(0, n), item.qty_sent) }))}
                                  className="w-16 px-2 py-1 text-center border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                />
                              ) : (
                                <span className="text-gray-900 dark:text-white">{item.confirmed_quantity}</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="flex justify-end">
                <div className="text-sm text-gray-600 dark:text-slate-400 space-y-1">
                  <div>จำนวนรายการ: <span className="font-medium text-gray-900 dark:text-white">{transfer.items.length}</span></div>
                  <div>
                    รวมจำนวนส่ง: <span className="font-bold text-gray-900 dark:text-white">{transfer.items.reduce((s, i) => s + i.qty_sent, 0)} ชิ้น</span>
                  </div>
                  {showReceived && (
                    <div>
                      รวมจำนวนรับ: <span className={`font-bold ${hasMismatch ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {transfer.items.reduce((s, i) => s + (i.qty_received || 0), 0)} ชิ้น
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          );
        })()}

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

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} alt="รูปรับสินค้า" />
    </Layout>
  );
}
