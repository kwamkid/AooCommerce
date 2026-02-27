'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Loader2, ArrowLeft, Warehouse, Package, BarChart3,
  AlertTriangle, ShoppingCart,
} from 'lucide-react';

interface VariationInfo {
  id: string;
  variation_label: string | null;
  sku: string | null;
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

interface ReceiveItem {
  variation_id: string;
  quantity: number;
  amount: number;
  variation: VariationInfo | null;
}

interface SnapshotData {
  id: string;
  supplier_type: string;
  period_year: number;
  period_month: number;
  status: string;
  total_stock_remaining: number;
  total_sold_quantity: number;
  total_sold_amount: number;
  total_received_quantity: number;
  total_received_amount: number;
  stock_items: StockItem[];
  sales_items: SalesItem[];
  receive_items: ReceiveItem[];
}

const MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const SOURCE_LABELS: Record<string, string> = {
  manual: 'ออเดอร์ปกติ', shopee: 'Shopee', tiktok: 'TikTok', lazada: 'Lazada',
  pos: 'POS', line: 'Line', facebook: 'Facebook',
};

function getDisplayName(v: VariationInfo | null) {
  if (!v) return '-';
  const name = v.product?.name || '';
  return v.variation_label ? `${name} - ${v.variation_label}` : name;
}

export default function PortalReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const reportId = params.id as string;

  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, [code, reportId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/supplier-portal/${code}/reports/${reportId}`);
      if (!res.ok) {
        setError(res.status === 403 ? 'ไม่สามารถเข้าถึงได้' : 'ไม่พบรายงาน');
        return;
      }
      const result = await res.json();
      setData(result.snapshot);
    } catch {
      setError('เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-gray-500">
        <AlertTriangle className="w-12 h-12 mb-3 text-red-400" />
        <p className="text-lg font-medium">{error || 'ไม่พบข้อมูล'}</p>
      </div>
    );
  }

  const isConsignment = data.supplier_type === 'consignment';
  const isCredit = data.supplier_type === 'credit';

  // Group stock by warehouse
  const stockByWarehouse = new Map<string, { name: string; items: StockItem[] }>();
  for (const item of data.stock_items) {
    const key = item.warehouse_id;
    if (!stockByWarehouse.has(key)) {
      stockByWarehouse.set(key, { name: item.warehouse?.name || 'คลัง', items: [] });
    }
    stockByWarehouse.get(key)!.items.push(item);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => router.push(`/supplier-portal/${code}`)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> กลับ
      </button>

      <h1 className="text-lg font-bold text-gray-900 dark:text-white">
        รายงาน {MONTHS_FULL[data.period_month - 1]} {data.period_year + 543}
      </h1>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <p className="text-xs text-gray-500 mb-1">Stock คงเหลือ</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{data.total_stock_remaining.toLocaleString()} ชิ้น</p>
        </div>
        {isConsignment && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <p className="text-xs text-gray-500 mb-1">ยอดขาย</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">฿{formatCurrency(data.total_sold_amount)}</p>
          </div>
        )}
        {isCredit && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <p className="text-xs text-gray-500 mb-1">ยอดค้างจ่าย</p>
            <p className="text-lg font-bold text-red-600 dark:text-red-400">฿{formatCurrency(data.total_received_amount)}</p>
          </div>
        )}
      </div>

      {/* Stock */}
      {data.stock_items.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Stock คงเหลือ</h3>
          </div>
          {Array.from(stockByWarehouse.entries()).map(([whId, group]) => (
            <div key={whId}>
              <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
                <span className="text-xs font-medium text-gray-600 dark:text-slate-400">{group.name}</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {group.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.variation?.product?.image ? (
                        <img src={item.variation.product.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                          <Package className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                      <p className="text-sm text-gray-900 dark:text-white truncate">{getDisplayName(item.variation)}</p>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white ml-4">{item.quantity.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sales (Consignment) */}
      {isConsignment && data.sales_items.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">ยอดขาย</h3>
          </div>
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
              {data.sales_items.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2 text-gray-900 dark:text-white">{getDisplayName(item.variation)}</td>
                  <td className="px-4 py-2 text-gray-600 dark:text-slate-400">{SOURCE_LABELS[item.source] || item.source}</td>
                  <td className="px-4 py-2 text-right font-medium">{item.quantity_sold.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right font-medium text-green-600">฿{formatCurrency(item.revenue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                <td colSpan={2} className="px-4 py-2 font-medium text-gray-700 dark:text-slate-300">รวม</td>
                <td className="px-4 py-2 text-right font-bold">{data.total_sold_quantity.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-bold text-green-600">฿{formatCurrency(data.total_sold_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Receives (Credit) */}
      {isCredit && data.receive_items.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">รายการรับเข้า</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">สินค้า</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase w-20">จำนวน</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase w-28">มูลค่า</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {data.receive_items.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2 text-gray-900 dark:text-white">{getDisplayName(item.variation)}</td>
                  <td className="px-4 py-2 text-right font-medium">{item.quantity.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right font-medium text-red-600">฿{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                <td className="px-4 py-2 font-medium text-gray-700 dark:text-slate-300">รวมยอดค้างจ่าย</td>
                <td className="px-4 py-2 text-right font-bold">{data.total_received_quantity.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-bold text-red-600">฿{formatCurrency(data.total_received_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
