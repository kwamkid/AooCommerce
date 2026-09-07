// Marketplace call throttle — เว้นจังหวะระหว่าง API call ของถังโควตาเดียวกัน (server-only)
//
// ปัญหาที่แก้: เปิดแชท Lazada 2 ร้านพร้อมกัน → syncRecentSessions ยิง IM API 22 call
// ติดกันไม่เว้นเลย → โดน ApiCallLimit → circuit breaker เปิด (fix-bug.md 2026-08-29)
// การไม่โดนแบนตั้งแต่แรกถูกกว่าการฟื้นจากแบนเสมอ — breaker เป็นตาข่ายรับ ไม่ใช่ทางแก้
//
// ค่าระยะห่างต่อ platform อยู่ที่ MARKETPLACE_PLATFORMS.minGapMs ใน platforms.ts
// เรียกผ่าน beginMarketplaceCall() ของ quota.ts — client ไม่ต้อง import ไฟล์นี้เอง
//
// **จองจังหวะที่ DB ข้าม instance แล้ว (2026-09-07)** — ของเดิม state อยู่ในหน่วยความจำ
// ต่อ instance: push ของ Lazada 3 ใบเข้าพร้อมกัน = 3 instance ต่างคนต่างคิดว่าเว้นจังหวะแล้ว
// รวมกันยิง IM ถี่เกินจนโดน "frequency exceeds the limit … ban 1 seconds" อยู่เรื่อย ๆ
// ตอนนี้ทุก instance มาต่อคิวที่แถวเดียวกันใน `marketplace_call_slots` ผ่าน RPC
// `claim_marketplace_call_slot(key, gap_ms)` (row lock → atomic) ซึ่งคืน "ต้องรอกี่ ms"
// · ชั้นแรกยังต่อคิวในหน่วยความจำก่อน (ลด round trip เมื่อผู้เรียกอยู่ instance เดียวกัน)
// · RPC ล้ม (DB สะดุด) = ตกกลับไปหน่วงแบบในหน่วยความจำ ห้ามทำให้ call ล้มเพราะตัวหน่วง

import { supabaseAdmin } from '@/lib/supabase-admin';
import { MARKETPLACE_PLATFORMS } from './platforms';
import type { QuotaPlatform, QuotaTarget } from './platforms';

const lastCallAt = new Map<string, number>();
const chains = new Map<string, Promise<void>>();

/** รอได้นานสุดต่อ call — คิวยาวกว่านี้แปลว่ามีอะไรผิดปกติ ยอมยิงดีกว่าค้างจนฟังก์ชันโดนตัด */
const MAX_WAIT_MS = 15_000;

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** จองคิวที่ DB — คืน ms ที่ต้องรอ · null = จองไม่ได้ (ให้ผู้เรียกใช้ทางถอย) */
async function claimSharedSlot(key: string, gapMs: number): Promise<number | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc('claim_marketplace_call_slot', {
      p_key: key,
      p_gap_ms: gapMs,
    });
    if (error) {
      console.warn('[Throttle] claim slot ล้ม — ใช้หน่วงในหน่วยความจำแทน:', error.message);
      return null;
    }
    return typeof data === 'number' ? data : Number(data) || 0;
  } catch (err) {
    console.warn('[Throttle] claim slot ล้ม — ใช้หน่วงในหน่วยความจำแทน:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * รอจนถึงคิวของตัวเอง แล้วค่อยให้ caller ยิง API ต่อ
 *
 * ต่อคิวเป็นสายเดียวต่อ key ใน instance นี้ก่อน แล้วค่อยไปจองคิวรวมที่ DB —
 * ผู้เรียกพร้อมกัน 22 ตัว (จะอยู่ instance เดียวหรือหลาย instance) จะถูกเรียงให้ห่างกันทีละ gap
 */
export async function throttleMarketplace(
  platform: QuotaPlatform,
  scope: QuotaTarget = 'all'
): Promise<void> {
  // ระยะห่างต่อ scope อ่านจาก registry — ไม่ตั้งไว้ = ไม่หน่วง (พฤติกรรมเดิมทุกประการ)
  const gaps = MARKETPLACE_PLATFORMS[platform].minGapMs;
  const gap = gaps?.[scope] ?? gaps?.default ?? 0;
  if (gap <= 0) return;

  const key = `${platform}:${scope}`;
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(async () => {
    const shared = await claimSharedSlot(key, gap);
    if (shared !== null) {
      if (shared > 0) await sleep(Math.min(shared, MAX_WAIT_MS));
      lastCallAt.set(key, Date.now());
      return;
    }
    const wait = (lastCallAt.get(key) || 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt.set(key, Date.now());
  });
  // กัน chain ขาดเมื่อมีตัวใดตัวหนึ่งพัง — คิวต้องเดินต่อได้เสมอ
  chains.set(key, next.catch(() => {}));
  return next;
}
