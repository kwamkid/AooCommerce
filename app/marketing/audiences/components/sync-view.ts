// Path: app/marketing/audiences/components/sync-view.ts
//
// อ่านสถานะ sync ของกลุ่มเป้าหมาย — หน้ารายการกับแผง Meta ในหน้ากลุ่มใช้ตัวเดียวกัน จะได้พูดเหมือนกัน
// (เดิมมีป้ายสถานะสองชุดในสองไฟล์ และทั้งคู่เอา `last_counts.uploaded` มาโชว์เป็นขนาดกลุ่ม ซึ่งผิด)
import { formatNumber } from '@/lib/utils/format';
import type { AudienceSyncView } from './types';

export type SyncTone = 'emerald' | 'amber' | 'red' | 'gray';
export interface SyncLook { tone: SyncTone; label: string; spinning?: boolean }

/**
 * คนในกลุ่มที่ส่งขึ้น Meta ได้ในรอบ sync ล่าสุด = total − not_syncable (คนที่มีเบอร์/อีเมล/Messenger)
 *
 * ⚠️ **ห้ามใช้ `last_counts.uploaded`** — นั่นคือยอดที่ "เพิ่ม" ในรอบนั้น รอบที่ไม่มีใครเปลี่ยนจะเป็น 0
 * แล้วป้ายขึ้น "synced 0" ทั้งที่กลุ่มบน Meta มีคนครบ · ยังไม่เคยนับ = null (ห้ามเดา 0)
 */
export function syncedPeople(sync: AudienceSyncView): number | null {
  const c = sync.last_counts as Partial<Record<'total' | 'not_syncable', number>> | null | undefined;
  if (!c || typeof c.total !== 'number') return null;
  return Math.max(0, c.total - (typeof c.not_syncable === 'number' ? c.not_syncable : 0));
}

/** ผลนับของรอบล่าสุดที่นับเสร็จ — กลุ่มที่ผูกหลายบัญชีใช้นิยามเดียวกัน จึงเอาใบที่ sync ล่าสุด */
export function latestCounts(syncs: AudienceSyncView[]): { total: number; syncable: number; at: string | null } | null {
  let best: AudienceSyncView | null = null;
  for (const s of syncs) {
    if (syncedPeople(s) == null) continue;
    if (!best || String(s.last_sync_at || '') > String(best.last_sync_at || '')) best = s;
  }
  if (!best) return null;
  const total = (best.last_counts as { total: number }).total;
  return { total, syncable: syncedPeople(best) as number, at: best.last_sync_at };
}

/**
 * กำลังวิ่ง หรือรอคิวที่ใกล้ถึงเวลา — ตัวตัดสินว่าหน้าจอควร poll ไหม
 * · ใบที่เพิ่งผูกยังเป็น 'pending' แวบหนึ่งก่อนเป็น 'syncing' — ไม่นับตัวนี้ป้าย "รอ sync" จะค้างจนกดรีเฟรช
 * · 'pending' ที่ถูกเลื่อนไปอีกนาน (ชนลิมิตของ Meta พักชั่วโมง) ไม่นับ — ไม่งั้น poll ทิ้งไว้ทั้งชั่วโมง
 */
export function isSyncRunning(sync: AudienceSyncView, now = Date.now()): boolean {
  if (sync.status === 'syncing') return true;
  if (sync.status !== 'pending') return false;
  return !sync.next_sync_at || Date.parse(sync.next_sync_at) <= now + 60_000;
}

/** ป้ายสถานะ — `withCount: false` เมื่อจำนวนคนมีคอลัมน์ของตัวเองอยู่แล้ว (หน้ารายการ) */
export function syncStatusLook(sync: AudienceSyncView, opts: { withCount?: boolean } = {}): SyncLook {
  switch (sync.status) {
    case 'synced': {
      const n = opts.withCount === false ? null : syncedPeople(sync);
      return { tone: 'emerald', label: n == null ? 'sync แล้ว' : `sync แล้ว ${formatNumber(n)} คน` };
    }
    case 'syncing':
      return { tone: 'amber', label: 'กำลัง sync…', spinning: true };
    case 'error':
      return { tone: 'red', label: 'sync ไม่สำเร็จ' };
    case 'tos_required':
      return { tone: 'amber', label: 'ต้องยอมรับข้อกำหนด' };
    default:
      return { tone: 'gray', label: 'รอ sync' };
  }
}
