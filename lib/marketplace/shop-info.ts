import { ensureValidToken as ensureShopeeToken, getShopInfo, type ShopeeAccountRow } from '@/lib/shopee/api';
import {
  ensureValidToken as ensureLazadaToken,
  getSellerInfo as getLazadaSellerInfo,
  isReachableImage,
  type LazadaAccountRow,
} from '@/lib/lazada/api';
import { getAuthorizedShops } from '@/lib/tiktok/api';
import { QUOTA_PLATFORMS, type QuotaPlatform } from './platforms';

// ดึง "ชื่อร้าน + โลโก้" จากแพลตฟอร์ม — ที่เดียวที่รู้ว่าแต่ละเจ้าเอามาจาก API ตัวไหน
//
// ══════════════════════════════════════════════════════════════════════════
//  ทำไมไม่แยก route ต่อแพลตฟอร์ม
// ══════════════════════════════════════════════════════════════════════════
//  งานจัดการร้าน (list · ยกเลิกเชื่อมต่อ · เปลี่ยนคลัง · toggle auto-sync) เหมือนกัน
//  หมดทุกเจ้า — ต่างกันจริงแค่ "ไปถามชื่อกับโลโก้ที่ endpoint ไหน" ก้อนเดียว
//  แยกเป็น 3 route = ก็อป auth + ขอบเขตบริษัท + คลัง + toggle + delete ไป 3 ชุด
//  แล้วเพิ่มเจ้าที่ 4 ก็ก็อปอีกชุด
//
//  จึงยกเฉพาะก้อนที่ต่างจริงมาไว้ที่นี่ · **เพิ่มแพลตฟอร์มใหม่ = เพิ่ม 1 entry ข้างล่าง**
//  TypeScript บังคับให้กรอกครบเอง (Record<QuotaPlatform, …>) และ route ไม่ต้องแก้เลย
//
// ⚠️ **ห้ามทับโลโก้ที่มีอยู่ด้วย URL ที่โหลดไม่ได้** — Lazada คืน logo_url ที่ถูก archive
//    บน OSS (HEAD ตอบ 200 แต่ GET ได้ 403 InvalidObjectState) เคยทับโลโก้ดีหายมาแล้ว
//    ดู fix-bug.md · ตัว fetcher ที่ไม่มั่นใจให้ตั้ง verifyLogo = true ให้ตัวกลางเช็คให้

export interface ShopInfo {
  /** null = แพลตฟอร์มไม่ได้ส่งมา — ผู้เรียกต้องคงค่าเดิมไว้ ห้ามล้างเป็นค่าว่าง */
  name: string | null;
  logo: string | null;
  /** โลโก้จากเจ้านี้เคยเป็น URL ตาย → ตัวกลางจะเช็คว่าโหลดได้จริงก่อนคืน */
  verifyLogo?: boolean;
  /** อธิบายให้ผู้ใช้ฟังเมื่อไม่มีโลโก้ให้ดึง (แสดงบน UI ตรง ๆ) */
  note?: string;
}

type Account = Record<string, unknown> & { access_token?: string; shop_id?: string | number };

const FETCHERS: Record<QuotaPlatform, (account: Account) => Promise<ShopInfo>> = {
  shopee: async account => {
    const info = await getShopInfo(await ensureShopeeToken(account as unknown as ShopeeAccountRow));
    return { name: info?.shop_name || null, logo: info?.shop_logo || null };
  },

  lazada: async account => {
    const seller = await getLazadaSellerInfo(
      await ensureLazadaToken(account as unknown as LazadaAccountRow, 'main')
    );
    return {
      name: seller?.name || null,
      logo: seller?.logo_url || null,
      verifyLogo: true,   // ตัวที่เคยคืน URL ตายจนทับของดี
      note: seller?.logo_url ? undefined : 'Lazada ไม่ได้ส่งโลโก้ของร้านนี้มา — ใส่ลิงก์รูปเองได้เลย',
    };
  },

  // TikTok ไม่เปิด API โลโก้ร้านฝั่งขายเลย (ยืนยัน 2026-08-30 จาก OAS ทั้งชุด —
  // /seller/202309/shops คืนแค่ id กับ region) · โลโก้มาได้ทาง chat sync หรือผู้ใช้ใส่เอง
  tiktok: async account => {
    const shops = await getAuthorizedShops(String(account.access_token || ''));
    const mine = shops.find(s => String(s.id) === String(account.shop_id)) || shops[0];
    return {
      name: mine?.name || null,
      logo: null,
      note: 'TikTok ไม่เปิด API โลโก้ร้าน — ใส่ลิงก์รูปเองได้เลย',
    };
  },
};

export function supportsShopInfo(platform: string): platform is QuotaPlatform {
  return (QUOTA_PLATFORMS as readonly string[]).includes(platform);
}

/**
 * ถามชื่อ+โลโก้ล่าสุดจากแพลตฟอร์ม · โลโก้ที่โหลดไม่ได้จะถูกตัดทิ้งเป็น null
 * เพื่อให้ผู้เรียกคงของเดิมไว้ แทนที่จะทับด้วยรูปเสีย
 */
export async function fetchShopInfo(platform: QuotaPlatform, account: Account): Promise<ShopInfo> {
  const info = await FETCHERS[platform](account);
  if (info.logo && info.verifyLogo && !(await isReachableImage(info.logo))) {
    return { ...info, logo: null, note: 'โลโก้ที่แพลตฟอร์มส่งมาเปิดไม่ได้ — คงรูปเดิมไว้' };
  }
  return info;
}
