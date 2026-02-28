'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Loader2, ArrowLeft, Warehouse, Package, CheckCircle2, Clock,
  AlertTriangle,
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
    variation_label: string | null;
    sku: string | null;
    product: { id: string; code: string; name: string; image: string | null } | null;
  } | null;
}

interface POData {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  total_amount: number;
  notes: string | null;
  warehouse: { id: string; name: string; code: string | null } | null;
  items: POItem[];
  receives: { id: string; receive_number: string; status: string; created_at: string }[];
}

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

function getDisplayName(v: POItem['variation']) {
  if (!v) return '-';
  const name = v.product?.name || '';
  return v.variation_label ? `${name} - ${v.variation_label}` : name;
}

export default function PortalPODetailPage() {
  const params = useParams();
  const router = useRouter();
  const supplierId = params.supplierId as string;
  const poId = params.id as string;

  const [data, setData] = useState<POData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Auth gate — redirect to portal login if not authenticated
  useEffect(() => {
    const stored = sessionStorage.getItem(`portal-auth-${supplierId}`);
    if (!stored) {
      router.replace(`/supplier-portal/${supplierId}`);
    }
  }, [supplierId, router]);

  useEffect(() => {
    const stored = sessionStorage.getItem(`portal-auth-${supplierId}`);
    if (stored) fetchData();
  }, [supplierId, poId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/supplier-portal/${supplierId}/purchase-orders/${poId}`);
      if (!res.ok) {
        setError(res.status === 403 ? 'ไม่สามารถเข้าถึงได้' : 'ไม่พบใบสั่งซื้อ');
        return;
      }
      const result = await res.json();
      setData(result.purchase_order);
    } catch {
      setError('เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

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

  const badge = poStatusBadge(data.status);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => router.push(`/supplier-portal/${supplierId}`)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> กลับ
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">{data.po_number}</h1>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      {/* Info */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs text-gray-500 uppercase block mb-1">คลัง</span>
            <div className="flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-gray-400" />
              <span className="text-gray-900 dark:text-white">{data.warehouse?.name || '-'}</span>
            </div>
          </div>
          <div>
            <span className="text-xs text-gray-500 uppercase block mb-1">วันที่สั่ง</span>
            <span className="text-gray-700 dark:text-slate-300">{formatDate(data.order_date)}</span>
          </div>
          {data.expected_date && (
            <div>
              <span className="text-xs text-gray-500 uppercase block mb-1">กำหนดรับ</span>
              <span className="text-gray-700 dark:text-slate-300">{formatDate(data.expected_date)}</span>
            </div>
          )}
          <div>
            <span className="text-xs text-gray-500 uppercase block mb-1">มูลค่ารวม</span>
            <span className="font-medium text-gray-900 dark:text-white">฿{formatCurrency(data.total_amount)}</span>
          </div>
        </div>
        {data.notes && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
            <span className="text-xs text-gray-500 block mb-1">หมายเหตุ</span>
            <p className="text-sm text-gray-700 dark:text-slate-300">{data.notes}</p>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">รายการสินค้า ({data.items.length} รายการ)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">สินค้า</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase w-20">สั่ง</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase w-20">รับแล้ว</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase w-24">ราคา</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase w-24">รวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {data.items.map(item => {
                const remaining = item.quantity - item.received_quantity;
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {item.variation?.product?.image ? (
                          <img src={item.variation.product.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                            <Package className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-gray-900 dark:text-white truncate">{getDisplayName(item.variation)}</p>
                          {item.variation?.sku && <p className="text-xs text-gray-500">SKU: {item.variation.sku}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">{item.quantity}</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={remaining <= 0 ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                          {item.received_quantity}
                        </span>
                        {remaining <= 0 ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">฿{formatCurrency(item.unit_cost)}</td>
                    <td className="px-4 py-2 text-right font-medium">฿{formatCurrency(item.quantity * item.unit_cost)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                <td colSpan={4} className="px-4 py-2 text-right font-medium text-gray-700 dark:text-slate-300">รวมทั้งสิ้น</td>
                <td className="px-4 py-2 text-right font-bold text-gray-900 dark:text-white">฿{formatCurrency(data.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Receives History */}
      {data.receives && data.receives.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">ประวัติรับของ</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {data.receives.map(rec => (
              <div key={rec.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-900 dark:text-white">{rec.receive_number}</span>
                  <span className="text-xs text-gray-500 ml-2">{formatDate(rec.created_at)}</span>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  rec.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {rec.status === 'completed' ? 'สำเร็จ' : 'ยกเลิก'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
