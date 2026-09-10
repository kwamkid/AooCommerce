// Path: app/marketing/audiences/components/sources.ts
//
// "ช่องทางแชทที่ดึงผู้ติดต่อมาทำกลุ่มได้" — เกณฑ์เดียวสำหรับทั้งหน้ารายการและฟอร์ม
//
// เกณฑ์ต้องตรงกับ `validateAudienceDefinition` ฝั่งเซิร์ฟเวอร์ (LINE / Facebook ที่เปิดอยู่
// เท่านั้น) — เดิมเขียนไว้ในฟอร์มที่เดียว พอหน้ารายการต้องรู้ด้วย (ว่าแม่แบบไหนใช้ได้)
// การ copy เงื่อนไขไปอีกที่แปลว่าวันหนึ่งสองหน้าจะไม่ตรงกันเงียบ ๆ

import { apiFetch } from '@/lib/api-client';
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
