'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { generateInventoryPdf } from '@/lib/inventory-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import {
  Loader2, Warehouse, Package, ArrowLeft, User, CheckCircle2, XCircle, Printer,
  Save,
} from 'lucide-react';
import { flattenVariationItem, productDisplayName } from '../../components/types';
import ItemsTable, { type TableItem } from '@/components/ui/ItemsTable';

interface ReceiveItem {
  id: string;
  variation_id: string;
  quantity: number;
  unit_cost: number | null;
  notes: string | null;
  variation: {
    id: string;
    variation_label: string | null;
    sku: string | null;
    barcode: string | null;
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
  po_id?: string | null;
  supplier_id?: string | null;
  warehouse: { id: string; name: string; code: string | null } | null;
  created_by_user: { id: string; name: string; email: string } | null;
  items: ReceiveItem[];
  po?: { po_number: string } | null;
  supplier?: { name: string } | null;
}

function ReceiveDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const receiveId = params.id as string;
  const searchParams = useSearchParams();
  const autoPrint = searchParams.get('print') === '1';

  const [data, setData] = useState<ReceiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const fetchingRef = useRef(false);
  const autoPrintDone = useRef(false);

  useEffect(() => {
    if (!authLoading && userProfile && receiveId) fetchData();
  }, [authLoading, userProfile, receiveId]);

  // Auto-print when ?print=1
  useEffect(() => {
    if (autoPrint && data && !loading && !autoPrintDone.current) {
      autoPrintDone.current = true;
      handlePrintPdf();
    }
  }, [autoPrint, data, loading]);

  const fetchData = async (retry = 0): Promise<void> => {
    if (retry === 0) {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
    }
    try {
      setLoading(true);
      const res = await apiFetch(`/api/inventory/receives?id=${receiveId}`);
      if (res.ok) {
        const result = await res.json();
        setData(result.receive);
        setNotes(result.receive?.notes || '');
        return;
      }
      if (retry < 2) {
        await new Promise(r => setTimeout(r, 800));
        return fetchData(retry + 1);
      }
      showToast('ไม่พบรายการ', 'error');
      router.push('/inventory/receives');
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
      const res = await apiFetch('/api/inventory/receives', {
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

  const getDisplayName = (item: ReceiveItem) => productDisplayName(flattenVariationItem(item));

  const handlePrintPdf = async () => {
    if (!data) return;
    setGeneratingPdf(true);
    try {
      const blob = await generateInventoryPdf({
        type: 'receive',
        data: { ...data, doc_number: data.receive_number },
      });
      showPdfPreview(blob, 'ใบรับสินค้า');
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const notesChanged = (notes || '') !== (data?.notes || '');

  if (authLoading || loading) {
    return (
      <Layout title="แก้ไขใบรับเข้า" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการรับเข้า', href: '/inventory/receives' }, { label: 'แก้ไข' }]}>
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
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/inventory/receives')} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300">
            <ArrowLeft className="w-4 h-4" /> กลับ
          </button>
          <button
            onClick={handlePrintPdf}
            disabled={generatingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#F4511E] hover:bg-[#D63B0E] rounded-lg transition-colors disabled:opacity-50"
          >
            {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {generatingPdf ? 'กำลังสร้าง...' : 'พิมพ์'}
          </button>
        </div>

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
            {(data.po || data.po_id) && (
              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">ใบสั่งซื้อ (PO)</label>
                <button
                  onClick={() => data.po_id && router.push(`/inventory/purchase-orders/${data.po_id}`)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {data.po?.po_number || data.po_id}
                </button>
              </div>
            )}
            {data.supplier && (
              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 uppercase mb-1 block">Supplier</label>
                <span className="text-sm text-gray-700 dark:text-slate-300">{data.supplier.name}</span>
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
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
            />
            {notesChanged && (
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleSaveNotes}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#F4511E] hover:bg-[#D63B0E] rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
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
          }))}
          columns={['qty', 'unit_cost']}
          showSummary={false}
        />
      </div>
    </Layout>
  );
}

export default function ReceiveDetailPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    }>
      <ReceiveDetailPageContent />
    </Suspense>
  );
}
