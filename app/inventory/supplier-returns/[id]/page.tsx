'use client';

// รายละเอียดใบคืนของให้ Supplier
// ⛔ แก้ได้แค่หมายเหตุ — ของออกจากคลังไปแล้ว ถ้าต้องคืนสต็อกกลับให้ทำใบรับเข้าใหม่
//    (มีร่องรอยว่าของกลับมาเมื่อไหร่ ไม่ใช่ลบใบเดิมทิ้งเงียบ ๆ)

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { BackIcon, ErrorIcon, SuccessIcon, SupplierIcon, UserIcon, WarehouseIcon } from '@/lib/icons';
import Badge from '@/components/ui/Badge';
import { LoadingCard } from '@/components/ui/StateCard';
import { productDisplayName } from '../../components/types';
import ItemsTable, { type TableItem } from '@/components/ui/ItemsTable';
import SaveButton from '@/components/ui/SaveButton';
import { useAuthGuard } from '@/lib/useAuthGuard';

interface ReturnItem {
  id: string;
  variation_id: string;
  quantity: number;
  unit_cost: number | null;
  reason: string | null;
  notes: string | null;
  variation: {
    id: string;
    variation_label: string | null;
    sku: string | null;
    attributes: Record<string, string> | null;
    product: { id: string; code: string; name: string; image: string | null };
  };
}

interface ReturnData {
  id: string;
  return_number: string;
  reason: string | null;
  status: string;
  notes: string | null;
  total_amount: number | null;
  deal_type: 'cash' | 'credit' | 'consignment' | null;
  return_date: string | null;
  created_at: string;
  supplier: { id: string; name: string; supplier_type: string | null } | null;
  warehouse: { id: string; name: string; code: string | null } | null;
  created_by_user: { id: string; name: string; email: string } | null;
  receive: { id: string; receive_number: string } | null;
  items: ReturnItem[];
}

/** ผลต่อเงินต่างกันตามดีลของล็อตที่คืน — บอกตรง ๆ บนใบ จะได้ไม่ต้องเดา */
const DEAL_INFO: Record<string, { label: string; tone: 'gray' | 'amber' | 'purple'; effect: string }> = {
  cash: { label: 'ซื้อสด', tone: 'gray', effect: 'รอ supplier คืนเงินหรือส่งของเปลี่ยน' },
  credit: { label: 'เครดิต', tone: 'amber', effect: 'หักออกจากยอดที่ต้องจ่าย supplier' },
  consignment: { label: 'ฝากขาย', tone: 'purple', effect: 'หักของที่เราถืออยู่ — ยังไม่เคยขาย จึงไม่แตะยอดที่ต้องจ่าย' },
};

export default function SupplierReturnDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const returnId = params.id as string;

  const [data, setData] = useState<ReturnData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!authLoading && userProfile && returnId) fetchData();
  }, [authLoading, userProfile, returnId]);

  const fetchData = async (retry = 0): Promise<void> => {
    if (retry === 0) {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
    }
    try {
      setLoading(true);
      const res = await apiFetch(`/api/inventory/supplier-returns?id=${returnId}`);
      if (res.ok) {
        const result = await res.json();
        setData(result.return_note);
        setNotes(result.return_note?.notes || '');
        return;
      }
      if (retry < 2) {
        await new Promise(r => setTimeout(r, 800));
        return fetchData(retry + 1);
      }
      showToast('ไม่พบรายการ', 'error');
      router.push('/inventory/supplier-returns');
    } catch {
      if (retry < 2) {
        await new Promise(r => setTimeout(r, 800));
        return fetchData(retry + 1);
      }
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
      if (retry === 0 || retry >= 2) fetchingRef.current = false;
    }
  };

  const handleSaveNotes = async () => {
    if (!data) return;
    try {
      setSaving(true);
      const res = await apiFetch('/api/inventory/supplier-returns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.id, notes: notes.trim() }),
      });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
      setData(prev => prev ? { ...prev, notes: notes.trim() || null } : prev);
      showToast('บันทึกหมายเหตุเรียบร้อย', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });


  const notesChanged = (notes || '') !== (data?.notes || '');

  const { allowed, loading: permLoading } = useAuthGuard('inventory.view');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

  if (authLoading || loading) {
    return (
      <Layout title="ใบคืนของ Supplier" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการคืนของ Supplier', href: '/inventory/supplier-returns' }, { label: 'รายละเอียด' }]}>
        <LoadingCard />
      </Layout>
    );
  }

  if (!data) return null;

  return (
    <Layout
      title={`ใบคืนของ ${data.return_number}`}
      breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการคืนของ Supplier', href: '/inventory/supplier-returns' }, { label: data.return_number }]}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/inventory/supplier-returns')} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300">
            <BackIcon className="w-4 h-4" /> กลับ
          </button>
        </div>

        {/* Status */}
        <div className={`rounded-lg px-4 py-3 flex flex-wrap items-center gap-2 ${data.status === 'issued' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
          {data.status === 'issued' ? <SuccessIcon className="w-5 h-5 text-green-700 dark:text-green-400" /> : <ErrorIcon className="w-5 h-5 text-red-700 dark:text-red-400" />}
          <span className={`text-sm font-medium ${data.status === 'issued' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {data.status === 'issued' ? 'คืนของแล้ว — ตัดออกจากคลังเรียบร้อย' : 'ยกเลิก'}
          </span>
          {data.deal_type && DEAL_INFO[data.deal_type] && (
            <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <Badge tone={DEAL_INFO[data.deal_type].tone} size="sm">{DEAL_INFO[data.deal_type].label}</Badge>
              {DEAL_INFO[data.deal_type].effect}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="data-label text-gray-500 dark:text-slate-400 uppercase mb-1 block">Supplier</label>
              <div className="flex items-center gap-2">
                <SupplierIcon className="w-4 h-4 text-gray-400" />
                <span className="data-primary text-gray-900 dark:text-white">{data.supplier?.name || '-'}</span>
              </div>
            </div>
            <div>
              <label className="data-label text-gray-500 dark:text-slate-400 uppercase mb-1 block">คลังสินค้า</label>
              <div className="flex items-center gap-2">
                <WarehouseIcon className="w-4 h-4 text-gray-400" />
                <span className="data-primary text-gray-900 dark:text-white">{data.warehouse?.name || '-'}</span>
              </div>
            </div>
            <div>
              <label className="data-label text-gray-500 dark:text-slate-400 uppercase mb-1 block">สร้างโดย</label>
              <div className="flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-gray-400" />
                <span className="data-text text-gray-700 dark:text-slate-300">{data.created_by_user?.name || '-'}</span>
              </div>
            </div>
            <div>
              <label className="data-label text-gray-500 dark:text-slate-400 uppercase mb-1 block">วันที่</label>
              <span className="data-timestamp text-gray-700 dark:text-slate-300">{formatDate(data.created_at)}</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="data-label text-gray-500 dark:text-slate-400 uppercase mb-1 block">มูลค่าที่คืน</label>
              <span className="data-number text-gray-900 dark:text-white">
                {data.total_amount ? `฿${Number(data.total_amount).toLocaleString('th-TH', { maximumFractionDigits: 2 })}` : '-'}
              </span>
            </div>
            {data.receive && (
              <div>
                <label className="data-label text-gray-500 dark:text-slate-400 uppercase mb-1 block">ล็อตที่รับเข้า</label>
                <button
                  onClick={() => router.push(`/inventory/receives/${data.receive!.id}`)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {data.receive.receive_number}
                </button>
              </div>
            )}
          </div>
          {data.reason && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
              <label className="data-label text-gray-500 dark:text-slate-400 uppercase mb-1 block">เหตุผล</label>
              <p className="data-text text-gray-700 dark:text-slate-300">{data.reason}</p>
            </div>
          )}

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
                  loading={saving}
                  onClick={handleSaveNotes}
                >
                  บันทึก
                </SaveButton>
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <ItemsTable
          items={(data.items || []).map((item): TableItem => ({
            variation_id: item.variation_id,
            product_name: productDisplayName({ product_name: item.variation?.product?.name, product_code: item.variation?.product?.code, variation_label: item.variation?.variation_label, sku: item.variation?.sku }),
            product_code: item.variation?.product?.code,
            variation_label: item.variation?.variation_label,
            sku: item.variation?.sku,
            image: item.variation?.product?.image,
            quantity: item.quantity,
            unit_cost: item.unit_cost ?? undefined,
            reason: item.reason,
          }))}
          columns={['qty', 'unit_cost', 'reason']}
          showSummary={false}
        />
      </div>
    </Layout>
  );
}
