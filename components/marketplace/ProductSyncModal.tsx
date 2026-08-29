'use client';

import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Radio from '@/components/ui/Radio';
import Checkbox from '@/components/ui/Checkbox';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';

/**
 * ซิงค์สินค้ากับร้าน marketplace — **ผู้ใช้ต้องเลือกทิศทางก่อนเสมอ**
 *
 * ไม่มี default direction โดยตั้งใจ (API ก็ปฏิเสธถ้าไม่ส่ง) — ปุ่ม "sync" ที่ไม่บอก
 * ว่าใครทับใครคือที่มาของสต็อกสองฝั่งหลุดกัน 3 เดือนโดยไม่มีใครรู้ว่าเลขไหนจริง
 * ดู fix-bug.md 2026-08-29
 */

type Direction = 'pull' | 'push';

const FIELDS = [
  { key: 'image', label: 'รูปสินค้า' },
  { key: 'name', label: 'ชื่อสินค้า' },
  { key: 'price', label: 'ราคา' },
  { key: 'stock', label: 'สต็อก' },
  { key: 'category', label: 'หมวดหมู่' },
] as const;

interface SyncChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  productId: string;
  accountId: string;
  shopName: string;
  /** เรียกหลังซิงค์สำเร็จ — ให้หน้าแม่โหลดข้อมูลใหม่ */
  onSynced?: () => void;
}

export default function ProductSyncModal({ open, onClose, productId, accountId, shopName, onSynced }: Props) {
  const { showToast } = useToast();
  const [direction, setDirection] = useState<Direction | null>(null);
  const [fields, setFields] = useState<string[]>(FIELDS.map(f => f.key));
  const [preview, setPreview] = useState<SyncChange[] | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => { setDirection(null); setPreview(null); setFields(FIELDS.map(f => f.key)); };
  const close = () => { reset(); onClose(); };

  const toggleField = (key: string, on: boolean) => {
    setFields(prev => (on ? [...prev, key] : prev.filter(f => f !== key)));
    setPreview(null); // เปลี่ยนเงื่อนไขแล้ว preview เดิมใช้ไม่ได้
  };

  const run = async (dryRun: boolean) => {
    if (!direction) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/shopee/products/sync-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          marketplace_account_id: accountId,
          direction,
          fields,
          dry_run: dryRun,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'ซิงค์ไม่สำเร็จ', 'error');
        return;
      }
      if (dryRun) {
        setPreview(data.changes || []);
      } else {
        showToast(
          data.changes?.length ? `ซิงค์แล้ว ${data.changes.length} รายการ` : 'ข้อมูลตรงกันอยู่แล้ว'
        );
        onSynced?.();
        close();
      }
    } catch {
      showToast('ซิงค์ไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={`ซิงค์สินค้ากับ ${shopName}`}
      icon={<RefreshCw className="w-5 h-5" />}
      size="lg"
      footer={
        <div className="flex justify-end gap-2 px-6 py-4">
          <Button variant="secondary" onClick={close}>ยกเลิก</Button>
          {preview === null ? (
            <Button
              variant="primary"
              disabled={!direction || fields.length === 0}
              loading={loading}
              onClick={() => run(true)}
            >
              ดูว่าจะเปลี่ยนอะไร
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={preview.length === 0}
              loading={loading}
              onClick={() => run(false)}
            >
              ยืนยันซิงค์
            </Button>
          )}
        </div>
      }
    >
      <div className="px-6 py-5 space-y-5">
        {/* ทิศทาง — ต้องเลือกก่อน */}
        <div>
          <p className="field-label mb-2">ให้ข้อมูลฝั่งไหนเป็นตัวจริง</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => { setDirection('pull'); setPreview(null); }}
              className={`text-left p-3 rounded-lg border transition-colors ${
                direction === 'pull'
                  ? 'border-primary bg-orange-50 dark:bg-orange-900/20'
                  : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownToLine className="w-4 h-4 text-primary" />
                <Radio checked={direction === 'pull'} onChange={() => { setDirection('pull'); setPreview(null); }} label="ดึงจาก Shopee" />
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400">เอาข้อมูลบนร้านมาทับในระบบเรา</p>
            </button>

            <button
              type="button"
              onClick={() => { setDirection('push'); setPreview(null); }}
              className={`text-left p-3 rounded-lg border transition-colors ${
                direction === 'push'
                  ? 'border-primary bg-orange-50 dark:bg-orange-900/20'
                  : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpFromLine className="w-4 h-4 text-primary" />
                <Radio checked={direction === 'push'} onChange={() => { setDirection('push'); setPreview(null); }} label="ส่งขึ้น Shopee" />
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400">เอาข้อมูลในระบบเราไปทับบนร้าน</p>
            </button>
          </div>
        </div>

        {/* เลือกเฉพาะสิ่งที่อยากซิงค์ */}
        <div>
          <p className="field-label mb-2">ซิงค์อะไรบ้าง</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {FIELDS.map(f => (
              <Checkbox
                key={f.key}
                checked={fields.includes(f.key)}
                onChange={on => toggleField(f.key, on)}
                label={f.label}
              />
            ))}
          </div>
        </div>

        {/* ผลตรวจก่อนลงมือ */}
        {preview !== null && (
          <div>
            <p className="field-label mb-2">
              {preview.length === 0 ? 'ไม่มีอะไรต่างกัน' : `จะเปลี่ยน ${preview.length} รายการ`}
            </p>
            {preview.length > 0 && (
              <div className="border border-gray-200 dark:border-slate-600 rounded-lg divide-y divide-gray-100 dark:divide-slate-700">
                {preview.map((c, i) => (
                  <div key={i} className="px-3 py-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-slate-300">{c.label}</p>
                    <p className="text-sm text-gray-500 dark:text-slate-400 break-all">
                      <span className="line-through opacity-70">{c.from}</span>
                      {' → '}
                      <span className="text-gray-900 dark:text-white">{c.to}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
