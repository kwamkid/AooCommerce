'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Warehouse, Package, ArrowLeft, User, CheckCircle2, XCircle,
} from 'lucide-react';

interface ReceiveItem {
  id: string;
  variation_id: string;
  quantity: number;
  notes: string | null;
  variation: {
    id: string;
    variation_label: string | null;
    sku: string | null;
    attributes: Record<string, string> | null;
    product: { id: string; code: string; name: string; image: string | null };
  };
}

interface ReceiveData {
  id: string;
  receive_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  warehouse: { id: string; name: string; code: string | null } | null;
  created_by_user: { id: string; name: string; email: string } | null;
  items: ReceiveItem[];
}

export default function ReceiveDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const receiveId = params.id as string;

  const [data, setData] = useState<ReceiveData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && userProfile && receiveId) fetchData();
  }, [authLoading, userProfile, receiveId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/inventory/receives?id=${receiveId}`);
      if (res.ok) {
        const result = await res.json();
        setData(result.receive);
      } else {
        showToast('ไม่พบรายการ', 'error');
        router.push('/inventory/receives');
      }
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const getVariationLabel = (item: ReceiveItem) => {
    const parts: string[] = [];
    if (item.variation?.variation_label) parts.push(item.variation.variation_label);
    if (item.variation?.attributes) Object.values(item.variation.attributes).forEach(v => { if (v?.trim()) parts.push(v.trim()); });
    return parts.join(' / ');
  };

  if (authLoading || loading) {
    return (
      <Layout title="รายละเอียดรับเข้า" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการรับเข้า', href: '/inventory/receives' }, { label: 'รายละเอียด' }]}>
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" /></div>
      </Layout>
    );
  }

  if (!data) return null;

  return (
    <Layout
      title={`ใบรับเข้า ${data.receive_number}`}
      breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการรับเข้า', href: '/inventory/receives' }, { label: data.receive_number }]}
    >
      <div className="space-y-4">
        <button onClick={() => router.push('/inventory/receives')} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300">
          <ArrowLeft className="w-4 h-4" /> กลับ
        </button>

        {/* Status */}
        <div className={`rounded-lg px-4 py-3 flex items-center gap-2 ${data.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
          {data.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-green-700 dark:text-green-400" /> : <XCircle className="w-5 h-5 text-red-700 dark:text-red-400" />}
          <span className={`text-sm font-medium ${data.status === 'completed' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {data.status === 'completed' ? 'รับเข้าสำเร็จ' : 'ยกเลิก'}
          </span>
        </div>

        {/* Info */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">คลังสินค้า</label>
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">{data.warehouse?.name || '-'}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">สร้างโดย</label>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-slate-300">{data.created_by_user?.name || '-'}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">วันที่</label>
              <span className="text-sm text-gray-700 dark:text-slate-300">{formatDate(data.created_at)}</span>
            </div>
          </div>
          {data.notes && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
              <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">หมายเหตุ</label>
              <p className="text-sm text-gray-700 dark:text-slate-300">{data.notes}</p>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">รายการสินค้า ({data.items?.length || 0} รายการ)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สินค้า</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-28">จำนวน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {(data.items || []).map(item => {
                  const varLabel = getVariationLabel(item);
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.variation?.product?.image ? (
                            <img src={item.variation.product.image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <Package className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">{item.variation?.product?.name || '-'}</p>
                            <p className="text-xs text-gray-500 dark:text-slate-400">
                              {item.variation?.product?.code || ''}{varLabel && ` | ${varLabel}`}{item.variation?.sku && ` | SKU: ${item.variation.sku}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-green-600 dark:text-green-400">+{item.quantity}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-slate-300">รวม {data.items?.length || 0} รายการ</td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-green-600 dark:text-green-400">
                    +{(data.items || []).reduce((s, i) => s + i.quantity, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
