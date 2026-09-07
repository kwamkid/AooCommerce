'use client';

// Superadmin — app ของแพลตฟอร์มที่ "เป็นของบริษัท" (ตอนนี้มีแค่ Shopee Seller In House)
//
// มีไว้ตอบคำถามเดียว: ตอนนี้บริษัทไหนมี app ของตัวเองแล้วบ้าง และใบไหนพัง
// key ถูกปิดบังมาจาก API — หน้านี้ไม่มีทางเห็นใบเต็ม (ตั้ง/แก้ทำที่หน้าตั้งค่าของบริษัทเอง)

import { useState, useCallback } from 'react';
import SuperAdminLayout from '../components/SuperAdminLayout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { LoadingCard, EmptyCard } from '@/components/ui/StateCard';
import Badge from '@/components/ui/Badge';
import Toggle from '@/components/ui/Toggle';
import FormSelect from '@/components/ui/FormSelect';
import PlatformIcon from '@/components/ui/PlatformIcon';
import { formatThaiDateTime } from '@/lib/utils/format';

interface MarketplaceApp {
  id: string;
  company_id: string;
  company_name: string | null;
  platform: string;
  app_role: string;
  label: string | null;
  partner_id: number;
  partner_key_masked: string | null;
  push_key_masked: string | null;
  has_push_key: boolean;
  env: string;
  /** full = app นี้รับออเดอร์+สินค้า+แชทของบริษัท · chat = แชทอย่างเดียว */
  usage: 'full' | 'chat';
  is_active: boolean;
  last_push_config_check: {
    at?: string; ok?: boolean; error?: string | null;
    config?: { push_config_on_list?: number[]; live_push_status?: string } | null;
  } | null;
  /** ถาม Shopee สด ๆ ตอนโหลดหน้าไม่สำเร็จ — ค่าข้างบนเป็นของเก่า */
  live_error: string | null;
  updated_at: string;
}

export default function SuperAdminMarketplaceApps() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<MarketplaceApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [savingUsage, setSavingUsage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/superadmin/marketplace-apps');
      if (res.ok) setRows(await res.json());
    } catch { /* หน้าจะขึ้น empty state */ }
    setLoading(false);
  }, []);

  useFetchOnce(() => { load(); }, true);

  const toggle = async (row: MarketplaceApp) => {
    setToggling(row.id);
    try {
      const res = await apiFetch('/api/superadmin/marketplace-apps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, is_active: !row.is_active }),
      });
      if (!res.ok) throw new Error();
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: !r.is_active } : r));
    } catch {
      showToast('เปลี่ยนสถานะไม่สำเร็จ', 'error');
    }
    setToggling(null);
  };

  // เปลี่ยนโหมดแทนบริษัท — server อาจตอบ 409 (มีร้านรับออเดอร์ผ่าน app นี้อยู่)
  // ต้องโชว์เหตุผลของจริง ไม่ใช่ "ไม่สำเร็จ" ลอย ๆ เพราะทางแก้ต่างกันคนละเรื่อง
  const changeUsage = async (row: MarketplaceApp, usage: 'full' | 'chat') => {
    if (usage === row.usage) return;
    setSavingUsage(row.id);
    try {
      const res = await apiFetch('/api/superadmin/marketplace-apps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, usage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(typeof data.error === 'string' ? data.error : 'เปลี่ยนโหมดไม่สำเร็จ', 'error');
      } else {
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, usage } : r));
        showToast('เปลี่ยนโหมดแล้ว — บริษัทต้องกด "ตั้งค่า push" อีกครั้งให้ push ตรงกับโหมดใหม่', 'success');
      }
    } catch {
      showToast('เปลี่ยนโหมดไม่สำเร็จ', 'error');
    }
    setSavingUsage(null);
  };

  return (
    <SuperAdminLayout title="App ของบริษัท" subtitle="app ที่บริษัทจดเอง (Shopee Seller In House) — แชท หรือทั้งออเดอร์+แชท ตามโหมด · สถานะ push ถาม Shopee สดทุกครั้งที่เปิดหน้า">
      {loading ? (
        <LoadingCard />
      ) : rows.length === 0 ? (
        <EmptyCard title="ยังไม่มีบริษัทไหนเพิ่ม app ของตัวเอง" />
      ) : (
        <div className="space-y-2">
          {rows.map(row => {
            const check = row.last_push_config_check;
            const codes = check?.config?.push_config_on_list || [];
            return (
              <div key={row.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-3 py-2.5 flex items-start gap-3">
                <PlatformIcon id={row.platform as 'shopee'} size={20} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white flex flex-wrap items-center gap-2">
                    {row.company_name || row.company_id}
                    <Badge tone="indigo" size="sm">{row.app_role}</Badge>
                    {row.env === 'sandbox' && <Badge tone="amber" size="sm">sandbox</Badge>}
                    {/* code 10 = webchat · ไม่มี = ยังไม่ได้เปิด push แชทที่ Shopee ⇒ แชทจะเงียบสนิท */}
                    {codes.includes(10)
                      ? <Badge tone="emerald" size="sm">push แชทเปิดแล้ว</Badge>
                      : <Badge tone="gray" size="sm">ยังไม่เปิด push แชท</Badge>}
                  </p>
                  <p className="helper-text text-gray-500">
                    Partner ID {row.partner_id} · key {row.partner_key_masked}
                    {row.has_push_key ? ` · push key ${row.push_key_masked}` : ' · push ใช้ key เดียวกัน'}
                    {row.label ? ` · ${row.label}` : ''}
                  </p>
                  <p className="helper-text text-gray-500">
                    {check?.at ? `ตรวจล่าสุด ${formatThaiDateTime(check.at)}` : 'ยังไม่เคยตรวจ'}
                    {check?.ok === false ? ` · ล้มเหลว: ${check.error || '-'}` : ''}
                    {row.live_error ? ` · ตรวจสดไม่ได้: ${row.live_error}` : ''}
                    {codes.length ? ` · push ที่เปิด: ${codes.join(', ')}` : ''}
                    {check?.config?.live_push_status ? ` · live push: ${check.config.live_push_status}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {/* โหมดของ app — คุมว่า push เปิด code อะไร และหน้าเชื่อมร้านชูปุ่มไหนเป็นตัวหลัก */}
                  <div className="w-52">
                    <FormSelect
                      size="sm"
                      value={row.usage}
                      disabled={savingUsage === row.id}
                      onChange={(v) => changeUsage(row, v === 'chat' ? 'chat' : 'full')}
                      options={[
                        { id: 'full', label: 'ทุกอย่าง (ออเดอร์+แชท)' },
                        { id: 'chat', label: 'แชทอย่างเดียว' },
                      ]}
                    />
                  </div>
                  {toggling === row.id
                    ? <span className="helper-text text-gray-400">กำลังบันทึก…</span>
                    : <Toggle checked={row.is_active} onChange={() => toggle(row)} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SuperAdminLayout>
  );
}
