'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useCompany } from '@/lib/company-context';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import { showPdfPreview } from '@/lib/print-pdf';
import { LoadingCard } from '@/components/ui/StateCard';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  ArrowLeft,
  Loader2,
  Printer,
  ReceiptText,
  ExternalLink,
  Package,
} from 'lucide-react';

interface CreditNoteDetail {
  id: string;
  cn_number: string;
  order_id: string | null;
  source_type: 'order' | 'replenishment';
  source_id: string | null;
  type: 'void' | 'refund' | 'exchange';
  status: 'issued' | 'cancelled';
  reason: string | null;
  subtotal: number;
  discount_amount: number;
  vat_amount: number;
  total_amount: number;
  issued_at: string;
  created_at: string;
  order?: {
    id: string;
    order_number: string;
    source: string;
    customer_id?: string;
    customer?: { name: string; phone: string } | null;
  } | null;
  replenishment?: {
    id: string;
    replenishment_number: string;
    customer_id?: string;
    customer?: { name: string; phone: string } | null;
  } | null;
  exchange_order_id?: string | null;
  exchange_order?: { id: string; order_number: string; source: string } | null;
  creator?: { email: string; name?: string } | null;
  items: {
    id: string;
    product_name: string;
    product_code: string | null;
    variation_label: string | null;
    quantity: number;
    unit_price: number;
    discount_amount: number;
    total: number;
    image?: string | null;
  }[];
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  void: { label: 'ยกเลิกบิล', color: 'bg-red-100 text-red-700 dark:bg-red-500/30 dark:text-red-200' },
  refund: { label: 'คืนสินค้า', color: 'bg-orange-100 text-orange-700 dark:bg-orange-500/30 dark:text-orange-200' },
  exchange: { label: 'เปลี่ยนสินค้า', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/30 dark:text-blue-200' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  issued: { label: 'ออกแล้ว', color: 'bg-green-100 text-green-700 dark:bg-green-500/30 dark:text-green-200' },
  cancelled: { label: 'ยกเลิก', color: 'bg-gray-100 text-gray-500 dark:bg-gray-500/30 dark:text-gray-300' },
};

export default function CreditNoteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const cnId = params.id as string;
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const vatRegistered = currentCompany?.vat_registered || false;
  const [cn, setCn] = useState<CreditNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (!authLoading && userProfile && cnId) {
      fetchDetail();
    }
  }, [authLoading, userProfile, cnId]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/credit-notes/${cnId}`);
      if (!res.ok) throw new Error('Not found');
      const result = await res.json();
      setCn(result.credit_note);
    } catch {
      setCn(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintCn = async () => {
    if (!cn) return;
    try {
      setGeneratingPdf(true);
      const { generateCreditNotePdf } = await import('@/lib/credit-note-pdf');
      const blob = await generateCreditNotePdf(cn, vatRegistered);
      showPdfPreview(blob, `ใบลดหนี้ ${cn.cn_number}`);
    } catch (err) {
      showToast('ไม่สามารถสร้าง PDF ได้', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <LoadingCard />
      </Layout>
    );
  }

  if (!cn) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-slate-400 mb-4">ไม่พบใบลดหนี้</p>
          <button onClick={() => router.push('/credit-notes')} className="text-primary hover:underline">
            กลับไปหน้ารายการ
          </button>
        </div>
      </Layout>
    );
  }

  const typeConfig = TYPE_LABELS[cn.type] || TYPE_LABELS.void;
  const statusConfig = STATUS_LABELS[cn.status] || STATUS_LABELS.issued;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/credit-notes')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-slate-300" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <ReceiptText className="w-5 h-5 text-red-500" />
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{cn.cn_number}</h1>
                <StatusBadge status="cn" colors={typeConfig.color}>{typeConfig.label}</StatusBadge>
                <StatusBadge status="cn" colors={statusConfig.color}>{statusConfig.label}</StatusBadge>
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                วันที่ออก {new Date(cn.issued_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrintCn}
              disabled={generatingPdf}
              className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              พิมพ์
            </button>
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: CN info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
            <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">ข้อมูลใบลดหนี้</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">เลขที่</span>
                <span className="font-medium text-gray-900 dark:text-white">{cn.cn_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">ประเภท</span>
                <StatusBadge status="cn" colors={typeConfig.color}>{typeConfig.label}</StatusBadge>
              </div>
              {cn.reason && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">เหตุผล</span>
                  <span className="text-gray-900 dark:text-white">{cn.reason}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">ผู้ออก</span>
                <span className="text-gray-900 dark:text-white">{cn.creator?.email || '-'}</span>
              </div>
            </div>
          </div>

          {/* Right: Source reference */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
            <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">
              {cn.source_type === 'replenishment' ? 'อ้างอิงใบเติมสินค้า' : 'อ้างอิงบิลเดิม'}
            </div>
            <div className="space-y-2 text-sm">
              {cn.source_type === 'replenishment' && cn.replenishment ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-slate-400">เลขที่ใบเติม</span>
                    <button
                      onClick={() => router.push(`/replenishments/${cn.source_id}`)}
                      className="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      {cn.replenishment.replenishment_number}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  {cn.replenishment.customer && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">ตัวแทน</span>
                        <span className="text-gray-900 dark:text-white">{cn.replenishment.customer.name}</span>
                      </div>
                      {cn.replenishment.customer.phone && (
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">เบอร์</span>
                          <span className="text-gray-900 dark:text-white">{cn.replenishment.customer.phone}</span>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-slate-400">เลขที่บิล</span>
                    <button
                      onClick={() => cn.order_id && router.push(`/orders/${cn.order_id}`)}
                      className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      {cn.order?.order_number || '-'}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  {cn.order?.customer && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">ลูกค้า</span>
                        <span className="text-gray-900 dark:text-white">{cn.order.customer.name}</span>
                      </div>
                      {cn.order.customer.phone && (
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">เบอร์</span>
                          <span className="text-gray-900 dark:text-white">{cn.order.customer.phone}</span>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              {cn.type === 'exchange' && cn.exchange_order && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-slate-700">
                  <span className="text-gray-500 dark:text-slate-400">บิลเปลี่ยนสินค้า</span>
                  <button
                    onClick={() => router.push(`/orders/${cn.exchange_order_id}`)}
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    {cn.exchange_order.order_number}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-slate-700">
            <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">รายการสินค้า</div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-10">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">รายละเอียด</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">ราคา</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">จำนวน</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">ส่วนลด</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">รวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {cn.items.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.image ? (
                          <img src={item.image} alt={item.product_name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                            <Package className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm text-gray-900 dark:text-white">{item.product_name}</div>
                          {(item.product_code || item.variation_label) && (
                            <div className="text-xs text-gray-400 dark:text-slate-500">
                              {[item.product_code, item.variation_label].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-slate-300">
                      ฿{formatPrice(item.unit_price)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-700 dark:text-slate-300">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500 dark:text-slate-400">
                      {Number(item.discount_amount) > 0 ? `฿${formatPrice(item.discount_amount)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                      ฿{formatPrice(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
            {cn.items.map((item, idx) => (
              <div key={item.id} className="px-4 py-3 flex gap-3">
                {item.image ? (
                  <img src={item.image} alt={item.product_name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.product_name}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white ml-2 flex-shrink-0">฿{formatPrice(item.total)}</span>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-slate-500">
                    ฿{formatPrice(item.unit_price)} x {item.quantity}
                    {Number(item.discount_amount) > 0 && ` (ลด ฿${formatPrice(item.discount_amount)})`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="max-w-xs ml-auto space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-slate-400">รวมก่อนส่วนลด</span>
              <span className="text-gray-900 dark:text-white">฿{formatPrice(cn.subtotal)}</span>
            </div>
            {Number(cn.discount_amount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-slate-400">ส่วนลด</span>
                <span className="text-red-500">-฿{formatPrice(cn.discount_amount)}</span>
              </div>
            )}
            {Number(cn.vat_amount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-slate-400">VAT 7%</span>
                <span className="text-gray-900 dark:text-white">฿{formatPrice(cn.vat_amount)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between text-base font-bold">
              <span className="text-gray-900 dark:text-white">รวมทั้งสิ้น</span>
              <span className="text-red-600 dark:text-red-400">฿{formatPrice(cn.total_amount)}</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
