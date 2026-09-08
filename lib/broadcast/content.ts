// Path: lib/broadcast/content.ts
//
// เนื้อหาของบรอดแคสต์ในรูป **ชนิดกลาง** — ตัวเดียวกันนี้ถูกแปลงเป็นข้อความของแต่ละ
// แพลตฟอร์มตอนส่ง (LINE → template/carousel · TikTok → title+body+product_ids)
//
// ทำไมไม่ให้ผู้ใช้เลือกเป็นศัพท์ของ LINE ตรง ๆ: 'flex'/'carousel' แปลไปเจ้าอื่นไม่ได้
// และร้านค้าไม่ควรต้องรู้ว่า LINE เรียกอะไร · หลักเดียวกับช่องค่าธรรมเนียม settlement
// และการ์ดข้อความในหน้าแชท — เก็บเป็นความหมาย แล้วให้ปลายทางแปลเอง
//
// client-safe (ไม่แตะ supabaseAdmin) — หน้าจอกับ API validate ด้วยฟังก์ชันเดียวกัน

import { BROADCAST_PLATFORMS, type BroadcastContentKind, type BroadcastPlatform } from './platforms';

/** ปุ่มบนการ์ด — LINE label ยาวได้ 20 ตัวอักษร */
export const BUTTON_LABEL_MAX = 20;
/** หัวข้อ/เนื้อความบนการ์ดของ LINE (buttons + carousel) */
export const CARD_TITLE_MAX = 40;
export const CARD_TEXT_MAX = 60;

export interface BroadcastButton {
  label: string;
  /** https เท่านั้น */
  url: string;
}

export interface BroadcastProductCard {
  /** สินค้าในระบบเรา — null = ผู้ใช้กรอกเอง */
  product_id: string | null;
  name: string;
  image_url: string | null;
  price: number | null;
  /**
   * ลิงก์ปลายทางของการ์ด — **ไม่มีก็ได้**
   * ไม่มีลิงก์ = ปุ่มกลายเป็น "สนใจสินค้านี้" ที่ส่งข้อความกลับเข้าห้องแชท
   * (ใช้ได้เลยโดยไม่ต้องเปิดหน้าร้านออนไลน์ และยังได้บทสนทนาให้แอดมินปิดการขายต่อ)
   */
  url: string | null;
}

export interface BroadcastContent {
  kind: BroadcastContentKind;
  /** หัวข้อ — promo ใช้เป็นหัวการ์ด · TikTok ใช้เป็นหัวข้อข้อความ */
  title?: string;
  text: string;
  image_url?: string | null;
  buttons?: BroadcastButton[];
  products?: BroadcastProductCard[];
  quick_replies?: string[];
}

export function isHttpsUrl(value: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(value.trim());
}

/**
 * ตรวจเนื้อหาว่าส่งผ่านช่องทางนี้ได้ไหม — คืนข้อความบอกเหตุ หรือ null เมื่อผ่าน
 *
 * **หน้าจอกับ API เรียกตัวนี้ตัวเดียวกัน** ผู้ใช้จึงไม่มีทางเจอกรณีที่หน้าจอบอกว่าได้
 * แล้ว API ปฏิเสธ (หรือแย่กว่านั้น: ผ่านหน้าจอ ผ่าน API แล้วไปตกที่ปลายทาง)
 */
export function validateBroadcastContent(
  platform: BroadcastPlatform,
  content: BroadcastContent,
): string | null {
  const c = BROADCAST_PLATFORMS[platform].compose;
  const label = BROADCAST_PLATFORMS[platform].label;

  if (!c.kinds.includes(content.kind)) {
    return `${label} ยังส่งเนื้อหาแบบนี้ไม่ได้`;
  }

  const text = (content.text || '').trim();
  const title = (content.title || '').trim();

  if (text.length > c.bodyMax) {
    return `ข้อความยาวเกิน ${c.bodyMax.toLocaleString()} ตัวอักษร`;
  }
  if (c.titleMax && title.length > c.titleMax) {
    return `หัวข้อยาวเกิน ${c.titleMax} ตัวอักษร`;
  }
  // TikTok บังคับทั้งหัวข้อและเนื้อ — LINE ไม่มีหัวข้อในโหมด announce
  if (c.titleMax && !title) return 'ต้องกรอกหัวข้อ';

  if (content.image_url && !c.image) {
    return `${label} แนบรูปไม่ได้`;
  }
  if (content.image_url && !isHttpsUrl(content.image_url)) {
    return 'ลิงก์รูปต้องเป็น https';
  }

  if (content.kind === 'promo') {
    const buttons = content.buttons || [];
    if (buttons.length === 0) return 'ต้องมีปุ่มอย่างน้อย 1 ปุ่ม';
    if (buttons.length > c.buttonsMax) return `${label} ใส่ปุ่มได้ไม่เกิน ${c.buttonsMax} ปุ่ม`;
    for (const b of buttons) {
      if (!b.label.trim()) return 'ปุ่มต้องมีข้อความบนปุ่ม';
      if (b.label.trim().length > BUTTON_LABEL_MAX) return `ข้อความบนปุ่มยาวเกิน ${BUTTON_LABEL_MAX} ตัวอักษร`;
      if (!isHttpsUrl(b.url)) return 'ลิงก์ของปุ่มต้องเป็น https';
    }
    // การ์ดของ LINE ตัดข้อความทิ้งเมื่อยาวเกิน — บอกก่อนดีกว่าให้ลูกค้าเห็นข้อความขาด
    if (title.length > CARD_TITLE_MAX) return `หัวข้อบนการ์ดยาวเกิน ${CARD_TITLE_MAX} ตัวอักษร`;
    // LINE บังคับให้การ์ดมีข้อความ — ปล่อยว่างแล้วจะโดนปฏิเสธตอนยิง ไม่ใช่ตอนกรอก
    if (!text) return 'ต้องมีข้อความบนการ์ด';
    if (text.length > CARD_TEXT_MAX) return `ข้อความบนการ์ดยาวเกิน ${CARD_TEXT_MAX} ตัวอักษร`;
  }

  if (content.kind === 'products') {
    const products = content.products || [];
    if (products.length === 0) return 'ต้องเลือกสินค้าอย่างน้อย 1 ชิ้น';
    if (products.length > c.productsMax) return `${label} ใส่การ์ดสินค้าได้ไม่เกิน ${c.productsMax} ชิ้น`;
    for (const p of products) {
      if (!p.name.trim()) return 'สินค้าต้องมีชื่อ';
      if (p.url && !isHttpsUrl(p.url)) return 'ลิงก์ของสินค้าต้องเป็น https';
    }
  }

  if (content.kind === 'announce' && !text && !content.image_url) {
    return 'ต้องมีข้อความหรือรูปอย่างน้อยหนึ่งอย่าง';
  }

  const quick = (content.quick_replies || []).map(q => q.trim()).filter(Boolean);
  if (quick.length > c.quickReplyMax) {
    return c.quickReplyMax === 0
      ? `${label} ไม่มีปุ่มตอบเร็ว`
      : `ปุ่มตอบเร็วได้ไม่เกิน ${c.quickReplyMax} ปุ่ม`;
  }
  if (quick.some(q => q.length > BUTTON_LABEL_MAX)) {
    return `ข้อความบนปุ่มตอบเร็วยาวเกิน ${BUTTON_LABEL_MAX} ตัวอักษร`;
  }

  return null;
}

/** ข้อความตัวอย่างบรรทัดเดียวสำหรับหน้ารายการ */
export function broadcastContentPreview(content: BroadcastContent): string {
  const title = (content.title || '').trim();
  const text = (content.text || '').trim();
  if (content.kind === 'products') {
    const names = (content.products || []).map(p => p.name).filter(Boolean);
    const head = text || title || 'การ์ดสินค้า';
    return `${head} — ${names.slice(0, 3).join(' · ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`.slice(0, 120);
  }
  const body = [title, text].filter(Boolean).join(' — ');
  return (body || '[รูปภาพ]').slice(0, 120);
}
