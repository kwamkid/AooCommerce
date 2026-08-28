// Marketplace call throttle — เว้นจังหวะระหว่าง API call ของถังโควตาเดียวกัน (server-only)
//
// ปัญหาที่แก้: เปิดแชท Lazada 2 ร้านพร้อมกัน → syncRecentSessions ยิง IM API 22 call
// ติดกันไม่เว้นเลย → โดน ApiCallLimit → circuit breaker เปิด (fix-bug.md 2026-08-29)
// การไม่โดนแบนตั้งแต่แรกถูกกว่าการฟื้นจากแบนเสมอ — breaker เป็นตาข่ายรับ ไม่ใช่ทางแก้
//
// ค่าระยะห่างต่อ platform อยู่ที่ MARKETPLACE_PLATFORMS.minGapMs ใน platforms.ts
// เรียกผ่าน beginMarketplaceCall() ของ quota.ts — client ไม่ต้อง import ไฟล์นี้เอง
//
// ⚠️ ข้อจำกัดที่ต้องรู้: state อยู่ใน memory ของ instance — serverless หลาย instance
// จะเว้นจังหวะแยกกันคนละชุด เป็น best-effort ไม่ใช่การรับประกัน rate ที่แท้จริง
// (ถ้าวันหนึ่งต้องการของจริงต้องขยับไปนับที่ Redis/DB)

import { MARKETPLACE_PLATFORMS } from './platforms';
import type { QuotaPlatform, QuotaTarget } from './platforms';

const lastCallAt = new Map<string, number>();
const chains = new Map<string, Promise<void>>();

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * รอจนถึงคิวของตัวเอง แล้วค่อยให้ caller ยิง API ต่อ
 *
 * ต่อคิวเป็นสายเดียวต่อ key — ผู้เรียกพร้อมกัน 22 ตัวจะถูกเรียงให้ห่างกันทีละ gap
 * แทนที่จะพุ่งออกไปพร้อมกันหมด
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
    const wait = (lastCallAt.get(key) || 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt.set(key, Date.now());
  });
  // กัน chain ขาดเมื่อมีตัวใดตัวหนึ่งพัง — คิวต้องเดินต่อได้เสมอ
  chains.set(key, next.catch(() => {}));
  return next;
}
