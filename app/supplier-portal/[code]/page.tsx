'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Loader2, Warehouse, Package, BarChart3, ClipboardList, FileText,
  Calendar, Factory, AlertTriangle,
} from 'lucide-react';

interface VariationInfo {
  id: string;
  variation_label: string | null;
  sku: string | null;
  barcode: string | null;
  product: { id: string; code: string; name: string; image: string | null } | null;
}

interface StockItem {
  warehouse_id: string;
  variation_id: string;
  quantity: number;
  warehouse: { name: string } | null;
  variation: VariationInfo | null;
}

interface SalesItem {
  variation_id: string;
  source: string;
  quantity_sold: number;
  revenue: number;
  variation: VariationInfo | null;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  total_amount: number;
  created_at: string;
  warehouse: { id: string; name: string } | null;
  items: { id: string; quantity: number; received_quantity: number }[];
}

interface Snapshot {
  id: string;
  supplier_type: string;
  period_year: number;
  period_month: number;
  status: string;
  total_sold_amount: number;
  total_received_amount: number;
  created_at: string;
}

type Tab = 'stock' | 'sales' | 'po' | 'report';

const MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const SOURCE_LABELS: Record<string, string> = {
  manual: 'ออเดอร์ปกติ', shopee: 'Shopee', tiktok: 'TikTok', lazada: 'Lazada',
  pos: 'POS', line: 'Line', facebook: 'Facebook',
};

function poStatusBadge(status: string) {
  switch (status) {
    case 'sent': return { label: 'ส่งแล้ว', color: 'bg-blue-100 text-blue-700' };
    case 'partial_received': return { label: 'รับบางส่วน', color: 'bg-amber-100 text-amber-700' };
    case 'received': return { label: 'รับครบ', color: 'bg-green-100 text-green-700' };
    case 'closed': return { label: 'ปิด', color: 'bg-slate-100 text-slate-600' };
    case 'cancelled': return { label: 'ยกเลิก', color: 'bg-red-100 text-red-700' };
    default: return { label: status, color: 'bg-gray-100 text-gray-600' };
  }
}

function getDisplayName(v: VariationInfo | null) {
  if (!v) return '-';
  const name = v.product?.name || '';
  return v.variation_label ? `${name} - ${v.variation_label}` : name;
}

export default function SupplierPortalPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [supplierName, setSupplierName] = useState('');
  const [supplierType, setSupplierType] = useState('');
  const [tab, setTab] = useState<Tab>('stock');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Data
  const [stock, setStock] = useState<StockItem[]>([]);
  const [sales, setSales] = useState<SalesItem[]>([]);
  const [salesTotal, setSalesTotal] = useState({ quantity: 0, revenue: 0 });
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  // Sales month selector
  const now = new Date();
  const [salesYear, setSalesYear] = useState(now.getFullYear());
  const [salesMonth, setSalesMonth] = useState(now.getMonth() + 1);
  const [salesLoading, setSalesLoading] = useState(false);

  useEffect(() => {
    validateAndFetch();
  }, [code]);

  const validateAndFetch = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/supplier-portal/${code}`);
      if (!res.ok) {
        setError('ลิงก์นี้ไม่สามารถเข้าถึงได้');
        return;
      }
      const data = await res.json();
      setSupplierName(data.supplier.name);
      setSupplierType(data.supplier.type);

      // Fetch all data in parallel
      const [stockRes, poRes, reportRes] = await Promise.all([
        fetch(`/api/supplier-portal/${code}/stock`),
        fetch(`/api/supplier-portal/${code}/purchase-orders`),
        fetch(`/api/supplier-portal/${code}/reports`),
      ]);

      if (stockRes.ok) {
        const d = await stockRes.json();
        setStock(d.stock || []);
      }
      if (poRes.ok) {
        const d = await poRes.json();
        setPOs(d.purchase_orders || []);
      }
      if (reportRes.ok) {
        const d = await reportRes.json();
        setSnapshots(d.snapshots || []);
      }

      // Fetch sales if consignment
      if (data.supplier.type === 'consignment') {
        fetchSales(salesYear, salesMonth);
      }
    } catch {
      setError('เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const fetchSales = async (year: number, month: number) => {
    try {
      setSalesLoading(true);
      const res = await fetch(`/api/supplier-portal/${code}/sales?year=${year}&month=${month}`);
      if (res.ok) {
        const d = await res.json();
        setSales(d.sales || []);
        setSalesTotal({ quantity: d.total_quantity || 0, revenue: d.total_revenue || 0 });
      }
    } catch { /* ignore */ } finally {
      setSalesLoading(false);
    }
  };

  const handleSalesMonthChange = (year: number, month: number) => {
    setSalesYear(year);
    setSalesMonth(month);
    fetchSales(year, month);
  };

  const formatCurrency = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-gray-500 dark:text-slate-400">
        <AlertTriangle className="w-12 h-12 mb-3 text-red-400" />
        <p className="text-lg font-medium">{error}</p>
        <p className="text-sm mt-1">กรุณาติดต่อผู้ดูแลระบบ</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'stock', label: 'สินค้าคงเหลือ', icon: <Warehouse className="w-4 h-4" /> },
    ...(supplierType === 'consignment' ? [{ key: 'sales' as Tab, label: 'ยอดขาย', icon: <BarChart3 className="w-4 h-4" /> }] : []),
    { key: 'po', label: 'ใบสั่งซื้อ', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'report', label: 'รายงาน', icon: <FileText className="w-4 h-4" /> },
  ];

  // Group stock by warehouse
  const stockByWarehouse = new Map<string, { name: string; items: StockItem[] }>();
  for (const item of stock) {
    const key = item.warehouse_id;
    if (!stockByWarehouse.has(key)) {
      stockByWarehouse.set(key, { name: item.warehouse?.name || 'คลัง', items: [] });
    }
    stockByWarehouse.get(key)!.items.push(item);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Factory className="w-6 h-6 text-[#F4511E]" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{supplierName}</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-slate-400">Supplier Portal</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-slate-800 rounded-lg p-1 mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'bg-white dark:bg-slate-700 text-[#F4511E] shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Stock Tab */}
      {tab === 'stock' && (
        <div className="space-y-4">
          {stock.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-slate-500">
              <Warehouse className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">ไม่มีสินค้าคงเหลือ</p>
            </div>
          ) : (
            Array.from(stockByWarehouse.entries()).map(([whId, group]) => (
              <div key={whId} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{group.name}</span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {group.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {item.variation?.product?.image ? (
                          <img src={item.variation.product.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                            <Package className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 dark:text-white truncate">{getDisplayName(item.variation)}</p>
                          {item.variation?.sku && <p className="text-xs text-gray-500 dark:text-slate-400">SKU: {item.variation.sku}</p>}
                        </div>
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white ml-4">{item.quantity.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 flex justify-between">
                  <span className="text-xs text-gray-500">รวม {group.items.length} รายการ</span>
                  <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{group.items.reduce((s, i) => s + i.quantity, 0).toLocaleString()} ชิ้น</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Sales Tab (Consignment) */}
      {tab === 'sales' && supplierType === 'consignment' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <select
              value={`${salesYear}-${salesMonth}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-').map(Number);
                handleSalesMonthChange(y, m);
              }}
              className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const m = now.getMonth() - i;
                const y = now.getFullYear() + Math.floor(m / 12);
                const month = ((m % 12) + 12) % 12 + 1;
                return <option key={i} value={`${y}-${month}`}>{MONTHS_FULL[month - 1]} {y + 543}</option>;
              })}
            </select>
          </div>

          {salesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" /></div>
          ) : sales.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-slate-500">
              <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">ไม่มียอดขายในเดือนนี้</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">สินค้า</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">ช่องทาง</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase w-20">จำนวน</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase w-28">ยอดขาย</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {sales.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-gray-900 dark:text-white">{getDisplayName(item.variation)}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-slate-400">{SOURCE_LABELS[item.source] || item.source}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">{item.quantity_sold.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-600 dark:text-green-400">฿{formatCurrency(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                    <td colSpan={2} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300">รวม</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-gray-900 dark:text-white">{salesTotal.quantity.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-green-600 dark:text-green-400">฿{formatCurrency(salesTotal.revenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PO Tab */}
      {tab === 'po' && (
        <div className="space-y-3">
          {pos.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-slate-500">
              <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">ยังไม่มีใบสั่งซื้อ</p>
            </div>
          ) : (
            pos.map(po => {
              const badge = poStatusBadge(po.status);
              const totalQty = po.items.reduce((s, i) => s + i.quantity, 0);
              const totalRec = po.items.reduce((s, i) => s + i.received_quantity, 0);
              return (
                <div
                  key={po.id}
                  onClick={() => router.push(`/supplier-portal/${code}/purchase-orders/${po.id}`)}
                  className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 cursor-pointer hover:border-[#F4511E]/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{po.po_number}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600 dark:text-slate-400">
                    <span>{po.items.length} รายการ ({totalRec}/{totalQty})</span>
                    <span className="font-medium text-gray-900 dark:text-white">฿{formatCurrency(po.total_amount)}</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-500 mt-1">{formatDate(po.order_date || po.created_at)}</div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Report Tab */}
      {tab === 'report' && (
        <div className="space-y-3">
          {snapshots.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-slate-500">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">ยังไม่มีรายงาน</p>
            </div>
          ) : (
            snapshots.map(snap => {
              const amount = snap.supplier_type === 'consignment' ? snap.total_sold_amount : snap.total_received_amount;
              return (
                <div
                  key={snap.id}
                  onClick={() => router.push(`/supplier-portal/${code}/reports/${snap.id}`)}
                  className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 cursor-pointer hover:border-[#F4511E]/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {MONTHS_FULL[snap.period_month - 1]} {snap.period_year + 543}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      snap.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {snap.status === 'sent' ? 'ส่งแล้ว' : 'ยืนยัน'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-slate-400">
                    ยอดรวม: <span className="font-medium text-gray-900 dark:text-white">฿{formatCurrency(amount)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
