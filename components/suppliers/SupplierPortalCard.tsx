'use client';

// พอร์ทัลของซัพพลายเออร์ — ลิงก์ + รหัส อยู่ในที่ที่คนหาเจอ
//
// เดิมมีแต่ในเมนู ⋮ ของหน้ารายการซัพพลายเออร์ เจ้าของหาไม่เจอว่าลิงก์/รหัสอยู่ไหน
//
// ⛔ ลิงก์ใช้ `portal_token` เสมอ ห้ามใช้ `suppliers.id` (ไล่เดาได้) —
//    กติกาเต็มที่ [lib/portal-access.ts](../../lib/portal-access.ts)

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { CopyIcon, ExternalLinkIcon, PasswordIcon, RefreshIcon } from '@/lib/icons';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';

interface Props {
  supplierId: string;
  portalToken: string | null;
  accessCode: string | null;
  portalEnabled: boolean;
  /** ค่าที่เปลี่ยนหลังสร้างรหัสใหม่ — หน้าแม่เก็บกลับเข้า state ของตัวเอง */
  onChange: (next: { access_code: string; portal_enabled: boolean; portal_token?: string }) => void;
}

export default function SupplierPortalCard({
  supplierId, portalToken, accessCode, portalEnabled, onChange,
}: Props) {
  const { showToast } = useToast();
  const [working, setWorking] = useState(false);

  const portalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/supplier-portal/${portalToken || supplierId}`
    : '';

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`คัดลอก${label}แล้ว`, 'success');
    } catch {
      showToast('คัดลอกไม่สำเร็จ', 'error');
    }
  };

  const regenerate = async () => {
    setWorking(true);
    try {
      const res = await apiFetch(`/api/suppliers/${supplierId}/regenerate-code`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างรหัสใหม่ไม่สำเร็จ');
      const code = data.data?.access_code || data.access_code;
      onChange({ access_code: code, portal_enabled: true });
      showToast(accessCode ? 'สร้างรหัสใหม่แล้ว — รหัสเดิมใช้ไม่ได้อีก' : 'เปิดพอร์ทัลแล้ว', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'สร้างรหัสใหม่ไม่สำเร็จ', 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="heading-3">พอร์ทัลซัพพลายเออร์</h2>
        {portalEnabled && accessCode
          ? <Badge tone="emerald">เปิดใช้งาน</Badge>
          : <Badge tone="gray">ยังไม่เปิด</Badge>}
      </div>
      <p className="helper-text text-gray-500 mb-3">
        ซัพพลายเออร์เปิดลิงก์นี้ได้โดยไม่ต้องมีบัญชีในระบบ แล้วกรอกรหัสเพื่อดูใบสั่งซื้อ · สต็อก · ยอดขายของตัวเอง
      </p>

      {portalEnabled && accessCode ? (
        <div className="space-y-3">
          <div>
            <label className="field-label">ลิงก์</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={portalUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 min-w-0 px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-300 select-all"
              />
              <Button variant="secondary" icon={<CopyIcon className="w-4 h-4" />} onClick={() => copy(portalUrl, 'ลิงก์')}>
                คัดลอก
              </Button>
              {/* เปิดด้วย <a> ไม่ใช่ window.open — ป็อปอัปบล็อกเกอร์บล็อกไม่ได้ */}
              <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                <ExternalLinkIcon className="w-4 h-4" />
                เปิด
              </a>
            </div>
          </div>

          <div>
            <label className="field-label">รหัสสำหรับกรอก</label>
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg font-mono tracking-wider text-gray-900 dark:text-white">
                {accessCode}
              </span>
              <Button variant="secondary" icon={<CopyIcon className="w-4 h-4" />} onClick={() => copy(accessCode, 'รหัส')}>
                คัดลอก
              </Button>
              <Button variant="secondary" icon={<RefreshIcon className="w-4 h-4" />} loading={working} onClick={regenerate}>
                สร้างรหัสใหม่
              </Button>
            </div>
            <p className="helper-text text-gray-500 mt-1">
              สร้างรหัสใหม่แล้ว รหัสเดิมจะใช้ไม่ได้ทันที — ต้องส่งรหัสใหม่ให้ซัพพลายเออร์
            </p>
          </div>
        </div>
      ) : (
        <Button variant="primary" icon={<PasswordIcon className="w-4 h-4" />} loading={working} onClick={regenerate}>
          เปิดพอร์ทัลให้ซัพพลายเออร์รายนี้
        </Button>
      )}
    </Card>
  );
}
