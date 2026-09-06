// Shopee push config ระดับ app (server-only)
//
// เป็น call **ระดับ partner** — ไม่มี shop_id / access_token ในลายเซ็น เพราะตั้งค่าให้ทั้ง app
// (มีผลกับทุกร้านที่ authorize ผ่าน app นั้น) · โครงเดียวกับ scripts/enable-shopee-webchat-push.mjs
// ซึ่งยังใช้ตรวจ/แก้จากเครื่องได้เหมือนเดิม — ที่นี่คือทางเดียวกันแต่เรียกจากหน้าเว็บ
//
// ⚠️ set_app_push_config ต้องส่ง callback_url มาด้วย**ทุกครั้ง** — Shopee ยิงทดสอบ URL นั้น
//    และรอ 2xx ภายใน 3 วิ จึงตั้งแยกทีหลังไม่ได้

import crypto from 'crypto';
import { baseUrlForKeys, type ShopeeAppKeys } from './api';

export interface ShopeePushConfig {
  /** push code ที่เปิดอยู่ (10 = webchat) */
  push_config_on_list?: number[];
  push_config_off_list?: number[];
  callback_url?: string;
  /** normal | abnormal — Shopee ปิด push เองเมื่อ callback ล้มติดกันหลายครั้ง */
  live_push_status?: string;
  blocked_shop_id_list?: number[];
  [key: string]: unknown;
}

export interface PushConfigResult {
  ok: boolean;
  config: ShopeePushConfig | null;
  /** ข้อความจาก Shopee ตรง ๆ — ผู้ใช้ต้องเห็นของจริง ไม่ใช่ "ล้มเหลว" ลอย ๆ */
  error?: string;
}

function sign(keys: ShopeeAppKeys, apiPath: string, timestamp: number): string {
  // Partner-level: base = partner_id + api_path + timestamp (ไม่มี token/shop)
  return crypto.createHmac('sha256', keys.partner_key)
    .update(`${keys.partner_id}${apiPath}${timestamp}`)
    .digest('hex');
}

async function call(
  keys: ShopeeAppKeys,
  method: 'GET' | 'POST',
  apiPath: string,
  body?: Record<string, unknown>
): Promise<PushConfigResult> {
  const timestamp = Math.floor(Date.now() / 1000);
  const qs = new URLSearchParams({
    partner_id: String(keys.partner_id),
    timestamp: String(timestamp),
    sign: sign(keys, apiPath, timestamp),
  });
  try {
    const res = await fetch(`${baseUrlForKeys(keys)}${apiPath}?${qs}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as { error?: string; message?: string; response?: ShopeePushConfig };
    if (data.error) {
      return { ok: false, config: null, error: data.message ? `${data.error}: ${data.message}` : data.error };
    }
    return { ok: true, config: (data.response || {}) as ShopeePushConfig };
  } catch (err) {
    return { ok: false, config: null, error: err instanceof Error ? err.message : 'เรียก Shopee ไม่สำเร็จ' };
  }
}

/** อ่านค่า push ปัจจุบันของ app — ใช้ตรวจว่า key ที่ผู้ใช้กรอกใช้ได้จริงด้วย */
export function getAppPushConfig(keys: ShopeeAppKeys): Promise<PushConfigResult> {
  return call(keys, 'GET', '/api/v2/push/get_app_push_config');
}

/**
 * ตั้งค่า push ของ app
 *
 * ⚠️ **app ของบริษัทต้องเปิดแค่ code 10 (แชท) เท่านั้น** — ออเดอร์/สินค้าเข้าทาง app กลาง
 * อยู่แล้ว ถ้า app นี้เปิด code ออเดอร์ด้วยจะได้ push ซ้ำสองใบทุกเหตุการณ์
 */
export function setAppPushConfig(
  keys: ShopeeAppKeys,
  opts: { callbackUrl: string; codes?: number[]; offCodes?: number[]; blockedShopIds?: number[] }
): Promise<PushConfigResult> {
  return call(keys, 'POST', '/api/v2/push/set_app_push_config', {
    callback_url: opts.callbackUrl,
    set_push_config_on: opts.codes ?? [10],
    // set_push_config_on เป็น "เพิ่ม" ไม่ใช่ "แทนที่" — code ที่เปิดค้างอยู่ไม่ได้ปิดเอง
    // ต้องส่ง set_push_config_off มาด้วยถึงจะปิดจริง (ห้ามส่งลิสต์ว่าง Shopee ตอบ error_param)
    ...(opts.offCodes && opts.offCodes.length > 0 ? { set_push_config_off: opts.offCodes } : {}),
    ...(opts.blockedShopIds ? { blocked_shop_id_list: opts.blockedShopIds } : {}),
  });
}

/**
 * ทำให้ app ของบริษัทเหลือ push แค่ code 10 — อ่านค่าปัจจุบันก่อนแล้วปิดทุก code ที่เปิดอยู่
 * นอกจาก 10 (app ที่เคยใช้รับออเดอร์มาก่อน เช่น ABC ก่อน cutover จะมี code ออเดอร์ค้างอยู่
 * ถ้าเปิด 10 เฉย ๆ โดยไม่ปิดที่เหลือ ออเดอร์จะ push เข้ามาสองใบจาก app กลาง + app บริษัท)
 */
export async function setChatOnlyPushConfig(
  keys: ShopeeAppKeys,
  callbackUrl: string
): Promise<PushConfigResult & { turnedOff: number[] }> {
  const current = await getAppPushConfig(keys);
  if (!current.ok) return { ...current, turnedOff: [] };
  const turnedOff = (current.config?.push_config_on_list || []).filter(c => c !== 10);
  const applied = await setAppPushConfig(keys, { callbackUrl, codes: [10], offCodes: turnedOff });
  return { ...applied, turnedOff };
}

/** URL ที่ Shopee ต้องยิง push มา — ต้องเป็นโดเมนจริง (Shopee test-ping ตอนตั้งค่า) */
export function shopeeWebhookUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://aoocommerce.vercel.app';
  return `${base.replace(/\/+$/, '')}/api/shopee/webhook`;
}
