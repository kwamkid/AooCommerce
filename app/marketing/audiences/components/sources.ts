// Path: app/marketing/audiences/components/sources.ts
//
// "ช่องทางแชทที่ดึงผู้ติดต่อมาทำกลุ่มได้" — เกณฑ์เดียวสำหรับทั้งหน้ารายการและฟอร์ม
//
// เกณฑ์ต้องตรงกับ `validateAudienceDefinition` ฝั่งเซิร์ฟเวอร์ (LINE / Facebook ที่เปิดอยู่
// เท่านั้น) — เดิมเขียนไว้ในฟอร์มที่เดียว พอหน้ารายการต้องรู้ด้วย (ว่าแม่แบบไหนใช้ได้)
// การ copy เงื่อนไขไปอีกที่แปลว่าวันหนึ่งสองหน้าจะไม่ตรงกันเงียบ ๆ

import { apiFetch } from '@/lib/api-client';
import { audienceSourceSupports } from '@/lib/broadcast/audience';
import type { AudienceChatPlatform, ChatSourceAccount } from './types';

/** แปลงแถวจาก /api/chat-accounts เป็นแหล่งที่มา — ตัวที่ดึงผู้ติดต่อไม่ได้ถูกคัดออกที่นี่ */
export function toChatSourceAccounts(rows: unknown): ChatSourceAccount[] {
  const list: ChatSourceAccount[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const a = (row || {}) as Record<string, unknown>;
    if (!a.is_active) continue;
    if (a.platform !== 'line' && a.platform !== 'facebook') continue;
    list.push({
      id: String(a.id),
      platform: a.platform as AudienceChatPlatform,
      name: (a.account_name as string) || 'ช่องทางแชท',
      picture_url: (a.picture_url as string | null) ?? null,
    });
  }
  return list;
}

/** โหลดรายชื่อช่องทางที่ใช้เป็นแหล่งที่มาได้ — ล้มเหลว = คืนรายการว่าง (ไม่ throw) */
export async function loadChatSourceAccounts(): Promise<ChatSourceAccount[]> {
  try {
    const res = await apiFetch('/api/chat-accounts');
    if (!res.ok) return [];
    return toChatSourceAccounts((await res.json()).accounts);
  } catch {
    return [];
  }
}

/**
 * แหล่งที่ติ๊กให้เองเมื่อผู้ใช้เลือกพฤติกรรม (หน้ากลุ่มเป้าหมายเลือกพฤติกรรมก่อน แหล่งทีหลัง)
 *
 * = ทุกแหล่งที่ตอบพฤติกรรมนั้นได้ **ยกเว้น LINE** — LINE ไม่ให้เบอร์/อีเมล คนจาก LINE จึงแทบ
 * ขึ้น Meta ไม่ได้ ติ๊กให้แล้วมีแต่พองยอด "ยัง sync ไม่ได้" ทั้งที่หน้านี้ใช้ทำโฆษณา Meta เป็นหลัก
 * (ผู้ใช้ยังติ๊กเองได้ ถ้าจะเอากลุ่มไปส่งบรอดแคสต์ LINE) · ถ้าไม่เหลือแหล่งอื่นเลยค่อยติ๊ก LINE
 * ให้ ไม่งั้นได้กลุ่มว่าง (ร้านที่มีแต่ LINE เลือก "คนที่เคยทักเข้ามา")
 */
export function defaultSourcesFor(
  audienceType: string,
  accounts: ChatSourceAccount[],
): { chatIds: string[]; includeCustomers: boolean } {
  const facebook = accounts.filter(a => a.platform === 'facebook' && audienceSourceSupports('facebook', audienceType));
  const includeCustomers = audienceSourceSupports('customers', audienceType);
  if (facebook.length > 0 || includeCustomers) {
    return { chatIds: facebook.map(a => a.id), includeCustomers };
  }
  const line = accounts.filter(a => a.platform === 'line' && audienceSourceSupports('line', audienceType));
  return { chatIds: line.map(a => a.id), includeCustomers: false };
}
