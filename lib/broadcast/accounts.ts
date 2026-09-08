// Path: lib/broadcast/accounts.ts
//
// แปลง "ผู้ใช้เลือกช่องทาง + บัญชีไหน" เป็นต้นทางที่ตัวส่งใช้จริง
//
// บัญชีของแต่ละช่องทางอยู่คนละตาราง: LINE/FB/IG อยู่ `chat_accounts` ส่วน marketplace
// อยู่ `marketplace_accounts` — route ทั้งสามตัวเรียกผ่านตัวนี้ **ห้าม query ตารางบัญชี
// เองใน route** ไม่งั้นการเช็คสิทธิ์ข้ามบริษัทจะกระจายอยู่หลายที่แล้วตกหล่นทีละจุด

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getChatAccount } from '@/lib/chat-config';
import { BROADCAST_PLATFORMS, canBroadcastVia, type BroadcastPlatform } from './platforms';

export interface BroadcastTarget {
  platform: BroadcastPlatform;
  /** ต้องมีอย่างใดอย่างหนึ่งเสมอ (DB บังคับด้วย broadcasts_one_account_check) */
  chatAccountId: string | null;
  marketplaceAccountId: string | null;
  label: string;
  /** แถวดิบของบัญชี — ตัวส่งเอาไปหา token ต่อ */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any;
}

/**
 * หาต้นทางของบรอดแคสต์ พร้อมกันช่องทางที่ยังส่งไม่ได้
 *
 * ข้อความ error อ่านจากทะเบียนเดียวกับที่หน้าจอใช้ — ผู้ใช้จึงไม่มีทางเจอเหตุผลคนละชุด
 */
export async function resolveBroadcastTarget(
  companyId: string,
  platform: BroadcastPlatform,
  accountId: string,
): Promise<{ target?: BroadcastTarget; error?: string }> {
  if (!canBroadcastVia(platform)) {
    return { error: BROADCAST_PLATFORMS[platform].reason || `ยังส่งผ่าน ${BROADCAST_PLATFORMS[platform].label} ไม่ได้` };
  }

  // marketplace: ต้นทางเป็นร้าน ไม่ใช่ห้องแชท (TikTok ยิงด้วย buyer_email จากออเดอร์)
  if (platform === 'tiktok' || platform === 'shopee' || platform === 'lazada') {
    const { data } = await supabaseAdmin
      .from('marketplace_accounts').select('*').eq('id', accountId).maybeSingle();
    if (!data || data.company_id !== companyId || data.platform !== platform || !data.is_active) {
      return { error: `ไม่พบร้าน ${BROADCAST_PLATFORMS[platform].label} นี้ หรือถูกปิดอยู่` };
    }
    return {
      target: {
        platform,
        chatAccountId: null,
        marketplaceAccountId: data.id,
        label: data.shop_name || BROADCAST_PLATFORMS[platform].label,
        row: data,
      },
    };
  }

  const account = await getChatAccount(accountId);
  if (!account || account.company_id !== companyId || account.platform !== platform || !account.is_active) {
    return { error: `ไม่พบช่องทาง ${BROADCAST_PLATFORMS[platform].label} นี้ หรือถูกปิดอยู่` };
  }
  return {
    target: {
      platform,
      chatAccountId: account.id,
      marketplaceAccountId: null,
      label: account.account_name || BROADCAST_PLATFORMS[platform].label,
      row: account,
    },
  };
}
