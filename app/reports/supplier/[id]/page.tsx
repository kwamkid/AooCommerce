'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { generateReportPdf } from '@/lib/supplier-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import {
  Loader2, ArrowLeft, Factory, Calendar, Warehouse, Package,
  CheckCircle2, Clock, Send, BarChart3, ShoppingCart, Printer,
} from 'lucide-react';

interface VariationInfo {
  id: string;
  variation_label: string | null;
  sku: string | null;
  barcode: string | null;
  cost_price: number | null;
  product: { id: string; code: string; name: string; image: string | null } | null;
}

interface StockItem {
  id: string;
  warehouse_id: string;
  variation_id: string;
  quantity: number;
  warehouse: { id: string; name: string; code: string | null } | null;
  variation: VariationInfo | null;
}

interface SalesItem {
  id: string;
  variation_id: string;
  source: string;
  pos_terminal_id: string | null;
  quantity_sold: number;
  revenue: number;
  variation: VariationInfo | null;
  pos_terminal_name: string | null;
}

interface ReceiveItem {
  id: string;
  receive_id: string;
  po_id: string | null;
  variation_id: string;
  quantity: number;
  amount: number;
  variation: VariationInfo | null;
  receive: { receive_number: string } | null;
  po: { po_number: string } | null;
}

interface SnapshotData {
  id: string;
  supplier_id: string;
  supplier_type: string;
  period_year: number;
  period_month: number;
  snapshot_date: string;
  status: string;
  total_stock_remaining: number;
  total_sold_quantity: number;
  total_sold_amount: number;
  total_received_quantity: number;
  total_received_amount: number;
  notes: string | null;
  created_at: string;
  supplier: { id: string; name: string; supplier_type: string; contact_name: string | null; phone: string | null; email: string | null; payment_terms: number } | null;
  created_by_user: { id: string; name: string; email: string } | null;
  stock_items: StockItem[];
  sales_items: SalesItem[];
  receive_items: ReceiveItem[];
}

const MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const SOURCE_LABELS: Record<string, string> = {
  manual: 'ออเดอร์ปกติ',
  shopee: 'Shopee',
  tiktok: 'TikTok',
  lazada: 'Lazada',
  pos: 'POS',
  line: 'Line',
  facebook: 'Facebook',
};

function statusBadge(status: string) {
  switch (status) {
    case 'draft': return { label: 'ร่าง', color: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300', icon: <Clock className="w-4 h-4" /> };
    case 'confirmed': return { label: 'ยืนยัน', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: <CheckCircle2 className="w-4 h-4" /> };
    case 'sent': return { label: 'ส่งแล้ว', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: <Send className="w-4 h-4" /> };
    default: return { label: status, color: 'bg-gray-100 text-gray-600', icon: null };
  }
}

function getDisplayName(v: VariationInfo | null) {
  if (!v) return '-';
  const productName = v.product?.name || '';
  return v.variation_label ? `${productName} - ${v.variation_label}` : productName;
}

function getSubtitle(v: VariationInfo | null) {
  if (!v) return '';
  const parts: string[] = [];
  if (v.product?.code) parts.push(v.product.code);
  if (v.sku) parts.push(`SKU: ${v.sku}`);
  return parts.join(' | ');
}

export default function SnapshotDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { features, fetched: featuresFetched } = useFeatures();
  const { showToast } = useToast();
  const snapshotId = params.id as string;

  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [groupSales, setGroupSales] = useState(false); // false = รวม, true = แยกช่องทาง
  const fetchingRef = useRef(false);

  useFetchOnce(() => {
    if (!features.supplier) {
      router.replace('/inventory/receives');
      return;
    }
    fetchData();
  }, !authLoading && !!userProfile && featuresFetched);

  const fetchData = async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      setLoading(true);
      const res = await apiFetch(`/api/reports/supplier/${snapshotId}`);
      if (res.ok) {
        const result = await res.json();
        setData(result.snapshot);
      } else {
        showToast('ไม่พบรายงาน', 'error');
        router.push('/reports/supplier');
      }
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!data) return;
    try {
      setUpdating(true);
      const res = await apiFetch(`/api/reports/supplier/${snapshotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
      setData(prev => prev ? { ...prev, status: newStatus } : prev);
      showToast('อัปเดตสถานะเรียบร้อย', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handlePrintPdf = async () => {
    if (!data) return;
    setGeneratingPdf(true);
    try {
      const blob = await generateReportPdf(data);
      showPdfPreview(blob, 'รายงานซัพพลายเออร์');
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const formatCurrency = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (authLoading || loading) {
    return (
      <Layout title="รายงานซัพพลายเออร์">
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" /></div>
      </Layout>
    );
  }

  if (!data) return null;

  const badge = statusBadge(data.status);
  const isConsignment = data.supplier_type === 'consignment';
  const isCredit = data.supplier_type === 'credit';

  // Group stock by warehouse
  const stockByWarehouse = new Map<string, { warehouse: StockItem['warehouse']; items: StockItem[] }>();
  for (const item of data.stock_items) {
    const key = item.warehouse_id;
    if (!stockByWarehouse.has(key)) {
      stockByWarehouse.set(key, { warehouse: item.warehouse, items: [] });
    }
    stockByWarehouse.get(key)!.items.push(item);
  }

  // Aggregate sales: grouped vs ungrouped
  const aggregatedSales = (() => {
    if (groupSales) return data.sales_items;
    // Merge by variation_id only
    const map = new Map<string, SalesItem>();
    for (const item of data.sales_items) {
      const existing = map.get(item.variation_id);
      if (existing) {
        existing.quantity_sold += item.quantity_sold;
        existing.revenue += item.revenue;
      } else {
        map.set(item.variation_id, { ...item, source: 'all', pos_terminal_id: null, pos_terminal_name: null });
      }
    }
    return Array.from(map.values());
  })();

  // Group receive items by receive
  const receiveGroups = new Map<string, { receive: ReceiveItem['receive']; po: ReceiveItem['po']; items: ReceiveItem[] }>();
  for (const item of data.receive_items) {
    const key = item.receive_id || 'unknown';
    if (!receiveGroups.has(key)) {
      receiveGroups.set(key, { receive: item.receive, po: item.po, items: [] });
    }
    receiveGroups.get(key)!.items.push(item);
  }

  return (
    <Layout
      title={`รายงาน ${data.supplier?.name || ''}`}
      breadcrumbs={[{ label: 'รายงาน' }, { label: 'รายงานซัพพลายเออร์', href: '/reports/supplier' }, { label: data.supplier?.name || 'รายละเอียด' }]}
    >
      <div className="space-y-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/reports/supplier')} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300">
            <ArrowLeft className="w-4 h-4" /> กลับ
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintPdf}
              disabled={generatingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#F4511E] hover:bg-[#D63B0E] rounded-lg transition-colors disabled:opacity-50"
            >
              {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {generatingPdf ? 'กำลังสร้าง...' : 'พิมพ์'}
            </button>
            {data.status === 'draft' && (
              <button
                onClick={() => handleStatusChange('confirmed')}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                ยืนยันรายงาน
              </button>
            )}
            {data.status === 'confirmed' && (
              <button
                onClick={() => handleStatusChange('sent')}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                ส่งให้ Supplier
              </button>
            )}
          </div>
        </div>

        {/* Status + Period */}
        <div className={`rounded-lg px-4 py-3 flex items-center gap-2 ${badge.color}`}>
          {badge.icon}
          <span className="text-sm font-medium">{badge.label}</span>
          <span className="text-sm ml-2">— {MONTHS[data.period_month - 1]} {data.period_year + 543}</span>
        </div>

        {/* Supplier Info */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">Supplier</label>
              <div className="flex items-center gap-2">
                <Factory className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">{data.supplier?.name || '-'}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">ประเภท</label>
              <span className="text-sm text-gray-700 dark:text-slate-300">
                {isConsignment ? 'ฝากขาย (Consignment)' : isCredit ? 'เครดิต (Credit)' : 'เงินสด (Cash)'}
              </span>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">สร้างเมื่อ</label>
              <span className="text-sm text-gray-700 dark:text-slate-300">{formatDate(data.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Stock คงเหลือ</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{data.total_stock_remaining.toLocaleString()}</p>
            <p className="text-xs text-gray-500">ชิ้น</p>
          </div>
          {isConsignment && (
            <>
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">ขายได้</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{data.total_sold_quantity.toLocaleString()}</p>
                <p className="text-xs text-gray-500">ชิ้น</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 col-span-2 sm:col-span-2">
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">ยอดขายรวม</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">฿{formatCurrency(data.total_sold_amount)}</p>
              </div>
            </>
          )}
          {isCredit && (
            <>
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">รับเข้า</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{data.total_received_quantity.toLocaleString()}</p>
                <p className="text-xs text-gray-500">ชิ้น</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 col-span-2 sm:col-span-2">
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">ยอดค้างจ่าย</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">฿{formatCurrency(data.total_received_amount)}</p>
              </div>
            </>
          )}
        </div>

        {/* Stock Table */}
        {data.stock_items.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">Stock คงเหลือ ณ วันที่สร้าง</h3>
            </div>
            {Array.from(stockByWarehouse.entries()).map(([whId, group]) => (
              <div key={whId}>
                <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
                  <span className="text-xs font-medium text-gray-600 dark:text-slate-400">{group.warehouse?.name || 'คลัง'}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {group.items.map(item => (
                      <tr key={item.id}>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            {item.variation?.product?.image ? (
                              <img src={item.variation.product.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                <Package className="w-4 h-4 text-gray-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm text-gray-900 dark:text-white truncate">{getDisplayName(item.variation)}</p>
                              <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{getSubtitle(item.variation)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white w-24">
                          {item.quantity.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* Sales Table (Consignment) */}
        {isConsignment && data.sales_items.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">ยอดขายประจำเดือน</h3>
              </div>
              <button
                onClick={() => setGroupSales(!groupSales)}
                className="text-xs text-[#F4511E] hover:underline"
              >
                {groupSales ? 'รวมทุกช่องทาง' : 'แยกช่องทาง+สาขา'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">สินค้า</th>
                    {groupSales && <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">ช่องทาง</th>}
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase w-24">จำนวน</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase w-32">ยอดขาย</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {aggregatedSales.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2">
                        <p className="text-sm text-gray-900 dark:text-white">{getDisplayName(item.variation)}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{getSubtitle(item.variation)}</p>
                      </td>
                      {groupSales && (
                        <td className="px-4 py-2 text-sm text-gray-700 dark:text-slate-300">
                          {SOURCE_LABELS[item.source] || item.source}
                          {item.pos_terminal_name && <span className="text-xs text-gray-500 ml-1">({item.pos_terminal_name})</span>}
                        </td>
                      )}
                      <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">{item.quantity_sold.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-600 dark:text-green-400">฿{formatCurrency(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300" colSpan={groupSales ? 2 : 1}>รวม</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-gray-900 dark:text-white">{data.total_sold_quantity.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-green-600 dark:text-green-400">฿{formatCurrency(data.total_sold_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Receives Table (Credit) */}
        {isCredit && data.receive_items.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">รายการรับเข้าประจำเดือน</h3>
            </div>
            {Array.from(receiveGroups.entries()).map(([recId, group]) => (
              <div key={recId}>
                <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600 dark:text-slate-400">
                    {group.receive?.receive_number || recId}
                  </span>
                  {group.po && (
                    <span className="text-xs text-gray-500 dark:text-slate-500">
                      (PO: {group.po.po_number})
                    </span>
                  )}
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {group.items.map(item => (
                      <tr key={item.id}>
                        <td className="px-4 py-2">
                          <p className="text-sm text-gray-900 dark:text-white">{getDisplayName(item.variation)}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">{getSubtitle(item.variation)}</p>
                        </td>
                        <td className="px-4 py-2 text-right w-24 font-medium text-gray-900 dark:text-white">{item.quantity.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right w-32 font-medium text-red-600 dark:text-red-400">฿{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">รวมยอดค้างจ่าย</span>
              <span className="text-sm font-bold text-red-600 dark:text-red-400">฿{formatCurrency(data.total_received_amount)}</span>
            </div>
          </div>
        )}

        {/* Empty states */}
        {data.stock_items.length === 0 && (
          <div className="text-center py-8 text-gray-400 dark:text-slate-500">
            <Warehouse className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">ไม่มีสินค้าคงเหลือของ supplier นี้</p>
          </div>
        )}
        {isConsignment && data.sales_items.length === 0 && (
          <div className="text-center py-8 text-gray-400 dark:text-slate-500">
            <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">ไม่มียอดขายในเดือนนี้</p>
          </div>
        )}
        {isCredit && data.receive_items.length === 0 && (
          <div className="text-center py-8 text-gray-400 dark:text-slate-500">
            <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">ไม่มีรายการรับเข้าในเดือนนี้</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
