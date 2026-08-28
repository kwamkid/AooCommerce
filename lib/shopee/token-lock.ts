// Shopee token refresh — กันแย่งกัน refresh ข้าม request/instance (server-only)
//
// ปัญหาที่แก้ (พบ 2026-08-29 จากหน้า API Call Statistics ของ Shopee: refresh_access_token
// สำเร็จแค่ 60.8% — 56 fail ใน 2 วัน):
//   refresh_token ของ Shopee **ใช้ได้ครั้งเดียว** ใบเก่าตายทันทีที่ refresh สำเร็จ
//   แต่ระบบเรามีคนแย่งกัน refresh พร้อมกันหลายทาง —
//     1. cron /api/shopee/refresh-tokens (เผื่อ 30 นาที) กับ ensureValidToken (เผื่อ 5 นาที)
//     2. webhook เข้าเป็นชุด (900+ push/2 วัน) ทุก handler ที่เจอ token หมดอายุพร้อมกัน
//        ยิง refresh พร้อมกันหมด — ตัวแรกชนะ ที่เหลือถือใบที่ถูก invalidate ไปแล้ว = fail
//   ยืนยันด้วยตัวเลข: 6 ร้าน × token อายุ 4 ชม. ต้องใช้ ~72 call/2 วัน แต่ยิงจริง 143
//
// วิธีแก้ 3 ชั้น (ไล่จากถูกไปแพง):
//   ชั้น 1 in-process — request ที่เกิดพร้อมกันใน instance เดียวกันแชร์ promise ก้อนเดียว
//   ชั้น 2 อ่าน row ใหม่ก่อน refresh เสมอ — กันใช้ refresh_token เก่าจาก object ที่อ่านค้างไว้
//          (เคสที่ cron เพิ่ง refresh ไปเมื่อกี้ ตัวเราถือใบที่ตายแล้วโดยไม่รู้ตัว)
//   ชั้น 3 claim ใน DB — ผู้ชนะเท่านั้นที่ได้ยิง Shopee ที่เหลือรอ token ใหม่จาก DB
//
// ⚠️ ห้ามเรียก Shopee refresh endpoint ตรง ๆ จากที่อื่นอีก — ต้องผ่าน ensureValidToken()
//    ทางเดียวเท่านั้น ไม่งั้นก็กลับไปแย่งกันเหมือนเดิม

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { ShopeeAccountRow, ShopeeCredentials } from './api';

/** เผื่อเวลาก่อน token หมดอายุจริง — ต่ำกว่านี้ถือว่า "ต้อง refresh แล้ว" */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000;

/** claim ค้างเกินเท่านี้ = เจ้าของเดิมตายกลางทาง ปล่อยให้คนใหม่ยึดต่อได้ */
const CLAIM_TTL_MS = 30 * 1000;

/** ผู้แพ้รอ token ใหม่จากผู้ชนะนานสุดเท่านี้ ก่อนจะยอม refresh เอง */
const WAIT_FOR_WINNER_MS = 6 * 1000;
const WAIT_POLL_MS = 400;

/** promise ที่กำลัง refresh อยู่ใน instance นี้ — key = account.id */
const inflight = new Map<string, Promise<ShopeeCredentials>>();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isUsable(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() > TOKEN_BUFFER_MS;
}

type AccountTokenRow = Pick<
  ShopeeAccountRow,
  'id' | 'shop_id' | 'access_token' | 'access_token_expires_at' | 'refresh_token' | 'refresh_token_expires_at'
>;

async function readAccount(accountId: string): Promise<AccountTokenRow | null> {
  const { data } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('id, shop_id, access_token, access_token_expires_at, refresh_token, refresh_token_expires_at')
    .eq('id', accountId)
    .maybeSingle();
  return (data as AccountTokenRow) || null;
}

/**
 * พยายามยึดสิทธิ์ refresh ของ account นี้
 * true = เราได้สิทธิ์ยิง Shopee · false = คนอื่นถืออยู่ ให้รอ token ใหม่แทน
 *
 * เป็น conditional update ตัวเดียว (atomic ที่ DB) — ผู้ชนะคือคนที่ update ติดจริง
 */
async function claimRefresh(accountId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  const { data } = await supabaseAdmin
    .from('marketplace_accounts')
    .update({ token_refresh_claimed_at: new Date().toISOString() })
    .eq('id', accountId)
    .or(`token_refresh_claimed_at.is.null,token_refresh_claimed_at.lt.${staleBefore}`)
    .select('id');
  return (data?.length ?? 0) > 0;
}

async function releaseClaim(accountId: string): Promise<void> {
  await supabaseAdmin
    .from('marketplace_accounts')
    .update({ token_refresh_claimed_at: null })
    .eq('id', accountId);
}

/** รอให้ผู้ชนะเขียน token ใหม่ลง DB — คืน row ที่ใช้ได้ หรือ null ถ้ารอไม่ไหว */
async function waitForFreshToken(accountId: string): Promise<AccountTokenRow | null> {
  const deadline = Date.now() + WAIT_FOR_WINNER_MS;
  while (Date.now() < deadline) {
    await sleep(WAIT_POLL_MS);
    const row = await readAccount(accountId);
    if (row?.access_token && isUsable(row.access_token_expires_at)) return row;
  }
  return null;
}

export interface RefreshedTokens {
  access_token: string;
  refresh_token: string;
  expire_in: number;
}

/**
 * คืน credentials ที่ใช้ได้จริง — refresh ให้เมื่อจำเป็น โดยมีคนยิง Shopee แค่คนเดียว
 *
 * @param account  row ที่ caller ถืออยู่ (อาจเก่า — เราจะอ่านใหม่เองก่อน refresh)
 * @param callRefresh  ฟังก์ชันยิง Shopee จริง (ฉีดเข้ามาเพื่อไม่ให้ import วน)
 * @param onRefreshTokenExpired  ให้ caller จัดการเคส refresh_token หมดอายุ (ปิดร้าน ฯลฯ)
 */
export async function resolveCredentials(
  account: ShopeeAccountRow,
  build: (accessToken: string) => ShopeeCredentials,
  callRefresh: (refreshToken: string, shopId: number) => Promise<RefreshedTokens>,
  onRefreshTokenExpired: () => Promise<void>
): Promise<ShopeeCredentials> {
  // ชั้น 0 — token ที่ caller ถือมายังใช้ได้ ไม่ต้องแตะ DB เลย (ทางผ่านปกติ 99%)
  if (account.access_token && isUsable(account.access_token_expires_at)) {
    return build(account.access_token);
  }

  // ชั้น 1 — ใน instance นี้มีคนกำลัง refresh account เดียวกันอยู่แล้ว ขอแชร์ผลด้วย
  const existing = inflight.get(account.id);
  if (existing) return existing;

  const task = (async (): Promise<ShopeeCredentials> => {
    // ชั้น 2 — อ่านของจริงจาก DB ก่อนเสมอ (cron อาจเพิ่ง refresh ไปแล้ว)
    const fresh = (await readAccount(account.id)) || account;
    if (fresh.access_token && isUsable(fresh.access_token_expires_at)) {
      return build(fresh.access_token);
    }
    if (!fresh.refresh_token) {
      throw new Error('No refresh token available. Shop needs to re-authorize.');
    }
    if (
      fresh.refresh_token_expires_at &&
      new Date(fresh.refresh_token_expires_at).getTime() < Date.now()
    ) {
      await onRefreshTokenExpired();
      throw new Error('Refresh token expired. Shop needs to re-authorize.');
    }

    // ชั้น 3 — แย่งสิทธิ์ยิง Shopee
    const won = await claimRefresh(account.id);
    if (!won) {
      const settled = await waitForFreshToken(account.id);
      if (settled?.access_token) return build(settled.access_token);
      // รอไม่ไหว (ผู้ชนะช้าหรือพัง) — ยอมยิงเอง ดีกว่าปล่อยงานตาย
      console.warn(`[Shopee Token] shop ${fresh.shop_id}: รอ token จาก instance อื่นไม่ทัน — refresh เอง`);
    }

    try {
      const tokens = await callRefresh(fresh.refresh_token, fresh.shop_id);
      const now = Date.now();
      await supabaseAdmin
        .from('marketplace_accounts')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          access_token_expires_at: new Date(now + tokens.expire_in * 1000).toISOString(),
          // refresh_token ของ Shopee อายุ 30 วันนับจากที่ออกใบใหม่
          refresh_token_expires_at: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
          token_refresh_claimed_at: null,
          updated_at: new Date(now).toISOString(),
        })
        .eq('id', account.id);
      return build(tokens.access_token);
    } catch (err) {
      await releaseClaim(account.id);
      // แพ้ race แบบที่ claim จับไม่ทัน (คนละ instance ยิงห่างกันเสี้ยววินาที) —
      // ถ้ามีคนเขียน token ใหม่ลง DB แล้ว ใช้ของเขาต่อ ดีกว่าโยน error ขึ้นไปให้งานตาย
      const rescued = await readAccount(account.id);
      if (rescued?.access_token && isUsable(rescued.access_token_expires_at)) {
        console.warn(`[Shopee Token] shop ${fresh.shop_id}: refresh ชน — ใช้ token ที่ instance อื่นเพิ่งได้มาแทน`);
        return build(rescued.access_token);
      }
      throw err;
    }
  })().finally(() => {
    inflight.delete(account.id);
  });

  inflight.set(account.id, task);
  return task;
}
