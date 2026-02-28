'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { generatePOPdf } from '@/lib/supplier-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import {
  Loader2, ArrowLeft, Factory, Warehouse as WarehouseIcon,
  Package2, CheckCircle2, Clock, XCircle, Send, ClipboardList,
  CalendarDays, User, FileText, ArrowDownToLine, Ban, Printer,
} from 'lucide-react';

interface POItem {
  id: string;
  variation_id: string;
  quantity: number;
  received_quantity: number;
  unit_cost: number;
  notes: string | null;
  variation: {
    id: string;
    variation_label: string;
    sku: string | null;
    barcode: string | null;
    product: {
      id: string;
      code: string;
      name: string;
      image: string | null;
    };
  };
}

interface ReceiveRef {
  id: string;
  receive_number: string;
  status: string;
  created_at: string;
  notes: string | null;
}

interface PurchaseOrderDetail {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  notes: string | null;
  total_amount: number;
  created_at: string;
  supplier: { id: string; name: string; supplier_type: string; contact_name: string | null; phone: string | null; email: string | null } | null;
  warehouse: { id: string; name: string; code: string | null } | null;
  items: POItem[];
  receives: ReceiveRef[];
  created_by_user: { id: string; name: string } | null;
}

function statusBadge(status: string) {
  switch (status) {
    case 'draft': return { label: 'ร่าง', color: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300', icon: <ClipboardList className="w-4 h-4" /> };
    case 'sent': return { label: 'ส่งแล้ว', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: <Send className="w-4 h-4" /> };
    case 'partial_received': return { label: 'รับบางส่วน', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: <Clock className="w-4 h-4" /> };
    case 'received': return { label: 'รับครบ', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: <CheckCircle2 className="w-4 h-4" /> };
    case 'closed': return { label: 'ปิด', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400', icon: <CheckCircle2 className="w-4 h-4" /> };
    case 'cancelled': return { label: 'ยกเลิก', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: <XCircle className="w-4 h-4" /> };
    default: return { label: status, color: 'bg-gray-100 text-gray-600', icon: null };
  }
}

function itemStatusBadge(qty: number, received: number) {
  if (received >= qty) return { label: 'ครบ', color: 'text-green-600 dark:text-green-400' };
  if (received > 0) return { label: `${received}/${qty}`, color: 'text-amber-600 dark:text-amber-400' };
  return { label: 'ยังไม่รับ', color: 'text-gray-400 dark:text-slate-500' };
}

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { features, fetched: featuresFetched } = useFeatures();
  const { showToast } = useToast();
  const poId = params.id as string;

  const [po, setPO] = useState<PurchaseOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (authLoading || !userProfile || !featuresFetched) return;
    if (!features.supplier) {
      router.replace('/inventory/receives');
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchPO();
  }, [authLoading, userProfile, featuresFetched, features.supplier, router, poId]);

  const fetchPO = async () => {
    try {
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`);
      if (!res.ok) {
        showToast('ไม่พบใบสั่งซื้อ', 'error');
        router.push('/inventory/purchase-orders');
        return;
      }
      const data = await res.json();
      setPO(data.purchase_order);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus: string, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return;
    setUpdating(true);
    try {
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        showToast('อัปเดตสถานะสำเร็จ');
        // Refresh
        fetchedRef.current = false;
        fetchPO();
      } else {
        const data = await res.json();
        showToast(data.error || 'อัปเดตไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handlePrintPdf = async () => {
    if (!po) return;
    setGeneratingPdf(true);
    try {
      const blob = await generatePOPdf(po);
      showPdfPreview(blob, 'ใบสั่งซื้อ');
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatCurrency = (n: number) => {
    return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!po) return null;

  const badge = statusBadge(po.status);
  const totalQty = po.items.reduce((s, i) => s + i.quantity, 0);
  const totalReceived = po.items.reduce((s, i) => s + i.received_quantity, 0);

  return (
    <Layout
      title={po.po_number}
      breadcrumbs={[
        { label: 'คลังสินค้า', href: '/inventory' },
        { label: 'ใบสั่งซื้อ', href: '/inventory/purchase-orders' },
        { label: po.po_number },
      ]}
    >
      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/inventory/purchase-orders')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{po.po_number}</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${badge.color}`}>
                {badge.icon}
                {badge.label}
              </span>
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintPdf}
              disabled={generatingPdf}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#F4511E] hover:bg-[#D63B0E] rounded-lg transition-colors disabled:opacity-50"
            >
              {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {generatingPdf ? 'กำลังสร้าง...' : 'พิมพ์'}
            </button>
            {po.status === 'draft' && (
              <>
                <button
                  onClick={() => updateStatus('sent', 'ต้องการส่ง PO นี้ให้ supplier?')}
                  disabled={updating}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  ส่ง PO
                </button>
                <button
                  onClick={() => updateStatus('cancelled', 'ต้องการยกเลิก PO นี้?')}
                  disabled={updating}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                >
                  <Ban className="w-4 h-4" />
                  ยกเลิก
                </button>
              </>
            )}
            {po.status === 'sent' && (
              <button
                onClick={() => updateStatus('cancelled', 'ต้องการยกเลิก PO นี้?')}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
              >
                <Ban className="w-4 h-4" />
                ยกเลิก
              </button>
            )}
            {(po.status === 'received' || po.status === 'partial_received' || po.status === 'sent') && (
              <button
                onClick={() => updateStatus('closed', 'ต้องการปิด PO นี้?')}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                ปิด PO
              </button>
            )}
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Supplier info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">
              <Factory className="w-4 h-4 text-[#F4511E]" />
              Supplier
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium text-gray-900 dark:text-white">{po.supplier?.name || '-'}</p>
              {po.supplier?.contact_name && (
                <p className="text-sm text-gray-500 dark:text-slate-400">ติดต่อ: {po.supplier.contact_name}</p>
              )}
              {po.supplier?.phone && (
                <p className="text-sm text-gray-500 dark:text-slate-400">โทร: {po.supplier.phone}</p>
              )}
            </div>
          </div>

          {/* PO info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">
              <FileText className="w-4 h-4 text-[#F4511E]" />
              ข้อมูล PO
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">คลังสินค้า</span>
                <span className="text-gray-900 dark:text-white flex items-center gap-1">
                  <WarehouseIcon className="w-3.5 h-3.5 text-gray-400" />
                  {po.warehouse?.name || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">วันที่สั่ง</span>
                <span className="text-gray-900 dark:text-white flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                  {formatDate(po.order_date)}
                </span>
              </div>
              {po.expected_date && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">คาดว่าจะได้รับ</span>
                  <span className="text-gray-900 dark:text-white">{formatDate(po.expected_date)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">ผู้สร้าง</span>
                <span className="text-gray-900 dark:text-white flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  {po.created_by_user?.name || '-'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {po.notes && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg p-3">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              <span className="font-medium">หมายเหตุ:</span> {po.notes}
            </p>
          </div>
        )}

        {/* Items table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              รายการสินค้า ({po.items.length} รายการ)
            </h3>
            <div className="text-sm text-gray-500 dark:text-slate-400">
              รับแล้ว {totalReceived}/{totalQty} ชิ้น
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="data-table-fixed">
              <thead>
                <tr className="data-thead-tr">
                  <th className="data-th w-[50px]"></th>
                  <th className="data-th">สินค้า</th>
                  <th className="data-th w-[80px] text-center">สั่ง</th>
                  <th className="data-th w-[80px] text-center">รับแล้ว</th>
                  <th className="data-th w-[80px] text-center">คงเหลือ</th>
                  <th className="data-th w-[100px] text-right">ต้นทุน/ชิ้น</th>
                  <th className="data-th w-[100px] text-right">รวม</th>
                  <th className="data-th w-[80px] text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="data-tbody">
                {po.items.map(item => {
                  const remaining = item.quantity - item.received_quantity;
                  const itemBadge = itemStatusBadge(item.quantity, item.received_quantity);
                  return (
                    <tr key={item.id} className="data-tr">
                      <td className="px-3 py-3">
                        {item.variation?.product?.image ? (
                          <img src={item.variation.product.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-slate-600" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                            <Package2 className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {item.variation?.product?.name || '-'}
                          {item.variation?.variation_label && item.variation.variation_label !== 'default' && (
                            <span className="text-gray-500 dark:text-slate-400"> - {item.variation.variation_label}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">
                          {item.variation?.product?.code}
                          {item.variation?.sku && <span className="ml-2">SKU: {item.variation.sku}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-900 dark:text-white font-medium">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-medium text-green-600 dark:text-green-400">
                        {item.received_quantity}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-medium">
                        <span className={remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}>
                          {remaining}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-slate-300">
                        ฿{formatCurrency(item.unit_cost)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-white">
                        ฿{formatCurrency(item.quantity * item.unit_cost)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium ${itemBadge.color}`}>
                          {item.received_quantity >= item.quantity ? (
                            <CheckCircle2 className="w-4 h-4 inline" />
                          ) : (
                            itemBadge.label
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-gray-100 dark:divide-slate-700">
            {po.items.map(item => {
              const remaining = item.quantity - item.received_quantity;
              const itemBadge = itemStatusBadge(item.quantity, item.received_quantity);
              return (
                <div key={item.id} className="p-4">
                  <div className="flex items-start gap-3 mb-2">
                    {item.variation?.product?.image ? (
                      <img src={item.variation.product.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                        <Package2 className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {item.variation?.product?.name}
                        {item.variation?.variation_label && item.variation.variation_label !== 'default' && (
                          <span className="text-gray-500"> - {item.variation.variation_label}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{item.variation?.product?.code}</div>
                    </div>
                    <span className={`text-xs font-medium ${itemBadge.color}`}>{itemBadge.label}</span>
                  </div>
                  <div className="grid grid-cols-3 text-center text-xs">
                    <div>
                      <span className="text-gray-500 block">สั่ง</span>
                      <span className="font-medium text-gray-900 dark:text-white">{item.quantity}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">รับแล้ว</span>
                      <span className="font-medium text-green-600">{item.received_quantity}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">คงเหลือ</span>
                      <span className={`font-medium ${remaining > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{remaining}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 flex justify-end">
            <div className="text-right">
              <span className="text-sm text-gray-500 dark:text-slate-400 mr-4">มูลค่ารวม</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">฿{formatCurrency(po.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Linked receives */}
        {po.receives && po.receives.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <ArrowDownToLine className="w-4 h-4 text-green-600" />
                ประวัติรับของ ({po.receives.length} ครั้ง)
              </h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {po.receives.map(r => (
                <div
                  key={r.id}
                  onClick={() => router.push(`/inventory/receives/${r.id}`)}
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{r.receive_number}</span>
                    {r.notes && <span className="text-xs text-gray-500 ml-2">{r.notes}</span>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    {new Date(r.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
