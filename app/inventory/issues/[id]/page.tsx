'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { generateInventoryPdf } from '@/lib/inventory-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import { Loader2, Warehouse, Package, ArrowLeft, User, CheckCircle2, XCircle, Printer } from 'lucide-react';
import { flattenVariationItem, productDisplayName } from '../../components/types';
import ItemsTable, { type TableItem } from '@/components/ui/ItemsTable';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';

interface IssueItem {
  id: string;
  variation_id: string;
  quantity: number;
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

interface IssueData {
  id: string;
  issue_number: string;
  reason: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  warehouse: { id: string; name: string; code: string | null } | null;
  created_by_user: { id: string; name: string; email: string } | null;
  items: IssueItem[];
}

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const issueId = params.id as string;

  const [data, setData] = useState<IssueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!authLoading && userProfile && issueId) fetchData();
  }, [authLoading, userProfile, issueId]);

  const fetchData = async (retry = 0): Promise<void> => {
    if (retry === 0) {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
    }
    try {
      setLoading(true);
      const res = await apiFetch(`/api/inventory/issues?id=${issueId}`);
      if (res.ok) {
        const result = await res.json();
        setData(result.issue);
        setNotes(result.issue?.notes || '');
        return;
      }
      if (retry < 2) {
        await new Promise(r => setTimeout(r, 800));
        return fetchData(retry + 1);
      }
      showToast('ไม่พบรายการ', 'error');
      router.push('/inventory/issues');
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
      const res = await apiFetch('/api/inventory/issues', {
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

  const handlePrint = async () => {
    if (!data) return;
    setGeneratingPdf(true);
    try {
      const blob = await generateInventoryPdf({
        type: 'issue',
        data: { ...data, doc_number: data.issue_number },
      });
      showPdfPreview(blob, 'ใบเบิกออกสินค้า');
    } catch {
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const getDisplayName = (item: IssueItem) => productDisplayName(flattenVariationItem(item));

  const notesChanged = (notes || '') !== (data?.notes || '');

  if (authLoading || loading) {
    return (
      <Layout title="แก้ไขใบเบิกออก" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการเบิกออก', href: '/inventory/issues' }, { label: 'แก้ไข' }]}>
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      </Layout>
    );
  }

  if (!data) return null;

  return (
    <Layout
      title={`ใบเบิกออก ${data.issue_number}`}
      breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการเบิกออก', href: '/inventory/issues' }, { label: data.issue_number }]}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/inventory/issues')} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300">
            <ArrowLeft className="w-4 h-4" /> กลับ
          </button>
          <Button size="sm" loading={generatingPdf} onClick={handlePrint} icon={<Printer className="w-4 h-4" />}>
            พิมพ์
          </Button>
        </div>

        {/* Status */}
        <div className={`rounded-lg px-4 py-3 flex items-center gap-2 ${data.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
          {data.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-green-700 dark:text-green-400" /> : <XCircle className="w-5 h-5 text-red-700 dark:text-red-400" />}
          <span className={`text-sm font-medium ${data.status === 'completed' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {data.status === 'completed' ? 'เบิกออกสำเร็จ' : 'ยกเลิก'}
          </span>
        </div>

        {/* Info */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="data-label text-gray-500 dark:text-slate-400 uppercase mb-1 block">คลังสินค้า</label>
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-gray-400" />
                <span className="data-primary text-gray-900 dark:text-white">{data.warehouse?.name || '-'}</span>
              </div>
            </div>
            <div>
              <label className="data-label text-gray-500 dark:text-slate-400 uppercase mb-1 block">สร้างโดย</label>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="data-text text-gray-700 dark:text-slate-300">{data.created_by_user?.name || '-'}</span>
              </div>
            </div>
            <div>
              <label className="data-label text-gray-500 dark:text-slate-400 uppercase mb-1 block">วันที่</label>
              <span className="data-timestamp text-gray-700 dark:text-slate-300">{formatDate(data.created_at)}</span>
            </div>
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
            reason: item.reason,
          }))}
          columns={['qty', 'reason']}
          showSummary={false}
        />
      </div>
    </Layout>
  );
}
