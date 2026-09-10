// Path: lib/broadcast/content.ts
//
// เนื้อหาของบรอดแคสต์ในรูป **ชนิดกลาง** — ตัวเดียวกันนี้ถูกแปลงเป็นข้อความของแต่ละ
// แพลตฟอร์มตอนส่ง (LINE → Flex/carousel · TikTok → title+body+product_ids)
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

export interface BroadcastProductCard {
  /** สินค้าในระบบเรา — null = ผู้ใช้กรอกเอง */
  product_id: string | null;
  /**
   * ตัวเลือกที่เลือก — **การ์ดเป็นระดับ variation ไม่ใช่ระดับสินค้า**
   * สินค้าตัวเดียวมีได้หลายสี/หลายขนาดที่ `product_id` เดียวกัน (YOYO 0+ มี 5 สี)
   * ถ้าเช็คซ้ำด้วย product_id จะเลือกได้แค่สีเดียวแล้วสีอื่นกดไม่ได้ทั้งหมด
   */
  variation_id: string | null;
  /** ชื่อที่ขึ้นบนการ์ด — รวมชื่อตัวเลือกไว้แล้ว เช่น "YOYO 0+ Newborn Pack - Black" */
  name: string;
  image_url: string | null;
  price: number | null;
  /**
   * ราคาปกติก่อนลด — มีค่าเมื่อสินค้ากำลังลดราคาอยู่ (`price` คือราคาที่ลูกค้าจ่ายจริง)
   * ใช้คิดป้าย "ลด N%" บนการ์ดและขีดฆ่าราคาเดิม — ไม่ลดราคา = null
   */
  compare_at_price?: number | null;
  /**
   * ลิงก์ปลายทางของการ์ด — **ไม่มีก็ได้**
   * ไม่มีลิงก์ = ปุ่มกลายเป็น "สนใจสินค้านี้" ที่ส่งข้อความกลับเข้าห้องแชท
   * (ใช้ได้เลยโดยไม่ต้องเปิดหน้าร้านออนไลน์ และยังได้บทสนทนาให้แอดมินปิดการขายต่อ)
   */
  url: string | null;
}

/** ข้อความที่ message action ส่งกลับเข้าห้องแชท — เพดานของ LINE */
export const ACTION_MESSAGE_MAX = 300;

/**
 * "กดแล้วเกิดอะไร" — **ทะเบียนกลางของทุกจุดที่ลูกค้ากดได้** (รูปโปสเตอร์ · ปุ่มบนการ์ดโปรโมชัน)
 * ทุกจุดมีให้เลือกชุดเดียวกัน หน้าจอใช้ `ActionPicker` ตัวเดียว ตัวส่ง LINE แปลงผ่าน `lineActionFor()` ตัวเดียว
 *  url     = เปิดลิงก์ (https)
 *  product = เปิดหน้าสินค้าในหน้าร้านออนไลน์ — **ต้องเปิด storefront และสินค้าแสดงบนหน้าร้าน**
 *            (API เติมลิงก์ให้ตอนสร้างใบ · เติมไม่ได้ = ปฏิเสธ ไม่ตกไปเป็นข้อความเงียบ ๆ เหมือนปุ่มการ์ดสินค้า
 *            เพราะเจ้าของกำหนดให้ตัวเลือกนี้ผูกกับหน้าร้านโดยตรง 10 ก.ย. 2026)
 *  message = ส่งข้อความเข้าห้องแชทเหมือนลูกค้าพิมพ์เอง (แบบเดียวกับปุ่มตอบเร็ว)
 * เพิ่มแบบใหม่ (เช่น คัดลอกโค้ดคูปอง = clipboard action ของ LINE · โทร = uri tel:) = เพิ่ม 1 ชนิดที่นี่
 * + 1 case ใน `lineActionFor()` + 1 ช่องกรอกใน ActionPicker — ทุกจุดที่กดได้ได้ตัวเลือกใหม่พร้อมกัน
 */
export type BroadcastActionType = 'url' | 'product' | 'message';
export type BroadcastAction =
  | { type: 'url'; url: string }
  | { type: 'product'; product: BroadcastProductCard | null }
  | { type: 'message'; text: string };

export const ACTION_TYPES: BroadcastActionType[] = ['url', 'product', 'message'];
export const ACTION_LABELS: Record<BroadcastActionType, string> = {
  url: 'เปิดลิงก์',
  product: 'ไปที่สินค้า',
  message: 'ส่งข้อความกลับ',
};
/**
 * ป้ายสั้นของชนิด action — ใช้ตรงที่แคบ (แถวปุ่มบนการ์ด: ช่องป้าย + ชนิด + ช่องกรอก อยู่แถวเดียวกัน)
 * ป้ายเต็มพับเป็นสองบรรทัดในปุ่มจนล้นขอบบนล่างเมื่อจอแคบ (เจ้าของท้วง 11 ก.ย. 2026) · ความหมายเต็มอยู่ใน tooltip
 */
export const ACTION_SHORT_LABELS: Record<BroadcastActionType, string> = {
  url: 'ลิงก์',
  product: 'สินค้า',
  message: 'ข้อความ',
};

/** action เปล่าของแต่ละชนิด — หน้าจอเริ่มจากตัวนี้แล้วให้ผู้ใช้กรอก */
export function emptyAction(type: BroadcastActionType = 'url'): BroadcastAction {
  if (type === 'product') return { type, product: null };
  if (type === 'message') return { type, text: '' };
  return { type: 'url', url: '' };
}
export const EMPTY_ACTION: BroadcastAction = emptyAction('url');

/** ยังไม่ได้กรอกอะไรเลย (ใช้ตัดปุ่มเปล่า/รู้ว่าเริ่มกรอกหรือยัง) */
export function isActionEmpty(action: BroadcastAction | null | undefined): boolean {
  if (!action) return true;
  if (action.type === 'product') return !action.product;
  if (action.type === 'message') return !action.text.trim();
  return !action.url.trim();
}

/**
 * อ่าน action จากของที่ไม่รู้ที่มา (body จาก client · content ใบเก่า) — รับเฉพาะรูปทรงที่รู้จัก
 * `productMapper` ส่งมาถ้าต้องกรองช่องของสินค้า (API ใช้ toProductCard) · ไม่ส่ง = เอาก้อนเดิม
 */
export function normalizeAction(
  raw: unknown,
  productMapper: (raw: unknown) => BroadcastProductCard = r => r as BroadcastProductCard,
): BroadcastAction | null {
  const r = raw as { type?: unknown; url?: unknown; product?: unknown; text?: unknown } | null | undefined;
  if (!r || typeof r !== 'object') return null;
  if (r.type === 'url') return { type: 'url', url: typeof r.url === 'string' ? r.url.trim() : '' };
  if (r.type === 'product') return { type: 'product', product: r.product ? productMapper(r.product) : null };
  if (r.type === 'message') {
    return { type: 'message', text: typeof r.text === 'string' ? r.text.trim().slice(0, ACTION_MESSAGE_MAX) : '' };
  }
  return null;
}

/** ตรวจว่ากรอกครบและถูกต้อง — `subject` = "กดรูป" / "กดปุ่ม" ใช้ประกอบข้อความบอกเหตุ */
export function validateAction(action: BroadcastAction | null | undefined, subject: string): string | null {
  if (!action) return `เลือกว่า${subject}แล้วเกิดอะไร`;
  if (action.type === 'url') {
    if (!action.url.trim()) return `ใส่ลิงก์ที่จะเปิดเมื่อ${subject}`;
    if (!isHttpsUrl(action.url)) return 'ลิงก์ต้องเป็น https';
    return null;
  }
  if (action.type === 'product') {
    if (!action.product || !action.product.name.trim()) return `เลือกสินค้าที่จะไปเมื่อ${subject}`;
    if (action.product.url && !isHttpsUrl(action.product.url)) return 'ลิงก์ของสินค้าต้องเป็น https';
    return null;
  }
  const text = action.text.trim();
  if (!text) return `ใส่ข้อความที่จะส่งกลับเมื่อ${subject}`;
  if (text.length > ACTION_MESSAGE_MAX) return `ข้อความที่ส่งกลับยาวเกิน ${ACTION_MESSAGE_MAX} ตัวอักษร`;
  return null;
}

/** สรุปสั้น ๆ ว่ากดแล้วไปไหน — ใช้ในบรรทัดสรุป/รายการ */
export function actionSummary(action: BroadcastAction | null | undefined): string {
  if (!action || isActionEmpty(action)) return '';
  if (action.type === 'product') return action.product?.name || '';
  if (action.type === 'message') return `ส่ง "${action.text.trim()}"`;
  try {
    return new URL(action.url.trim()).hostname;
  } catch {
    return action.url.trim();
  }
}

export interface BroadcastButton {
  label: string;
  /** กดปุ่มแล้วเกิดอะไร — ใบใหม่ทุกใบมี */
  action?: BroadcastAction | null;
  /** ใบเก่า (ก่อน 10 ก.ย. 2026) เก็บแค่ลิงก์ — อ่านผ่าน `buttonAction()` เสมอ */
  url?: string;
}

/** action ของปุ่ม รวมใบเก่าที่มีแค่ url */
export function buttonAction(b: BroadcastButton): BroadcastAction | null {
  if (b.action) return b.action;
  const url = (b.url || '').trim();
  return url ? { type: 'url', url } : null;
}

/** รูปหนึ่งใบในชนิด gallery — กดแล้วเกิด action ของตัวเอง · ขนาดจริงไว้บอกสัดส่วนให้ Flex */
export interface BroadcastGalleryImage {
  image_url: string;
  image_width?: number | null;
  image_height?: number | null;
  action: BroadcastAction | null;
}

export interface BroadcastContent {
  kind: BroadcastContentKind;
  /** หัวข้อ — promo ใช้เป็นหัวการ์ด · TikTok ใช้เป็นหัวข้อข้อความ */
  title?: string;
  text: string;
  image_url?: string | null;
  /**
   * รูปของ `announce` แสดงยังไง (ค่าเริ่มต้น 'bubble' — ใบเก่าจึงหน้าตาไม่เปลี่ยน)
   *  bubble = รูปธรรมดาเหมือนที่แอดมินส่งรูปในแชท
   *  rich   = รูปเต็มความกว้างห้องแชท (Flex giga) กดแล้วไปที่ `link_url` ได้
   */
  image_style?: 'bubble' | 'rich';
  /**
   * ใบเก่า (ก่อน 10 ก.ย. 2026): ลิงก์ที่เปิดเมื่อแตะรูปโปสเตอร์ / ประกาศแบบ rich — ใบใหม่ใช้ `tap_action`
   * อ่านของโปสเตอร์ผ่าน `posterAction()` เสมอ
   */
  link_url?: string | null;
  /** โปสเตอร์: กดรูปแล้วเกิดอะไร (ทะเบียนกลาง `BroadcastAction`) */
  tap_action?: BroadcastAction | null;
  /**
   * การ์ดสินค้าแสดงยังไง (ค่าเริ่มต้น 'detail' — ใบเก่าจึงหน้าตาไม่เปลี่ยน)
   *  image  = รูปจัตุรัสเต็มการ์ด + ป้ายลดและราคาลอยบนรูป กดทั้งใบ
   *  detail = รูป + ชื่อ + ราคา + ปุ่มสั่งเลย
   */
  card_style?: 'image' | 'detail';
  /**
   * ขนาดจริงของรูปที่อัปโหลด (พิกเซล) — วัดตอนผู้ใช้เลือกไฟล์
   * ใช้บอกสัดส่วนให้ Flex ของ LINE วาดรูปเต็มใบโดยไม่ครอบ (ดู imageAspectRatio)
   */
  image_width?: number | null;
  image_height?: number | null;
  buttons?: BroadcastButton[];
  products?: BroadcastProductCard[];
  /** gallery: รูปหลายใบเลื่อนดู (image_url ของใบไม่ใช้) */
  images?: BroadcastGalleryImage[];
  quick_replies?: string[];
}

/** สัดส่วนตั้งต้นเมื่อไม่รู้ขนาดรูป = ทรงเดิมของ template buttons (ใบเก่าจึงหน้าตาไม่เปลี่ยน) */
const DEFAULT_ASPECT_RATIO = '151:100';
/** LINE รับตัวเลขในสัดส่วนได้ 1–100000 และ **สูงได้ไม่เกิน 3 เท่าของความกว้าง** */
const ASPECT_MAX = 100_000;
const ASPECT_MAX_TALL = 3;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * สัดส่วนรูปในรูปแบบ "w:h" ที่ Flex ของ LINE รับได้
 *
 * ไม่รู้ขนาด = คืนทรงเดิมของ template buttons — ใบเก่าที่กด "ส่งซ้ำ" จึงไม่เปลี่ยนหน้าตา
 * · รูปที่สูงเกิน 3 เท่าของความกว้างถูกบีบเป็น 1:3 (เพดานของ LINE — ส่งเกินไปจะโดนปฏิเสธ)
 */
export function imageAspectRatio(
  content: Pick<BroadcastContent, 'image_width' | 'image_height'>,
): string {
  const w = Math.round(Number(content.image_width) || 0);
  const h = Math.round(Number(content.image_height) || 0);
  if (!(w > 0 && h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return DEFAULT_ASPECT_RATIO;
  if (h > w * ASPECT_MAX_TALL) return `1:${ASPECT_MAX_TALL}`;

  const g = gcd(w, h) || 1;
  let rw = w / g;
  let rh = h / g;
  if (rw > ASPECT_MAX || rh > ASPECT_MAX) {
    const scale = ASPECT_MAX / Math.max(rw, rh);
    rw = Math.max(1, Math.round(rw * scale));
    rh = Math.max(1, Math.round(rh * scale));
  }
  return `${rw}:${rh}`;
}

/**
 * ส่วนลดเป็นเปอร์เซ็นต์ของการ์ดสินค้าใบหนึ่ง — ไม่ได้ลดราคา = null (**ห้ามคืน 0**
 * ไม่งั้นการ์ดจะขึ้นป้าย "ลด 0%" ให้สินค้าราคาปกติ)
 */
export function discountPercent(
  card: Pick<BroadcastProductCard, 'price' | 'compare_at_price'>,
): number | null {
  const price = Number(card.price) || 0;
  const compare = Number(card.compare_at_price) || 0;
  if (!(compare > price && price > 0)) return null;
  const pct = Math.round((1 - price / compare) * 100);
  return pct > 0 ? pct : null;
}

/** action ของรูปโปสเตอร์ รวมใบเก่าที่มีแค่ link_url */
export function posterAction(content: Pick<BroadcastContent, 'tap_action' | 'link_url'>): BroadcastAction | null {
  if (content.tap_action) return content.tap_action;
  const url = (content.link_url || '').trim();
  return url ? { type: 'url', url } : null;
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

  if (content.kind === 'poster') {
    // โปสเตอร์คือ "รูปทั้งใบ" — ข้อความ ราคา ปุ่ม ต้องอยู่ในรูปเอง ระบบจึงไม่มีช่องให้พิมพ์
    if (!content.image_url) return 'โปสเตอร์ต้องมีรูป';
    // กดโปสเตอร์แล้วไม่เกิดอะไร = ลูกค้าสนใจแล้วไปต่อไม่ได้ จึงบังคับให้เลือกว่ากดแล้วเกิดอะไร
    const tapError = validateAction(posterAction(content), 'กดรูป');
    if (tapError) return tapError;
    // ข้อความใส่ได้ (ส่งเป็นอีกข้อความก่อนรูป — เลย์เอาต์เดียวกับประกาศ) แต่หัวข้อ/ปุ่ม/การ์ดไม่มี
    if (title || (content.buttons || []).length > 0 || (content.products || []).length > 0) {
      return 'โปสเตอร์มีแค่ข้อความ รูป และสิ่งที่เกิดเมื่อกดรูป';
    }
  }

  if (content.kind === 'promo') {
    const buttons = content.buttons || [];
    if (buttons.length === 0) return 'ต้องมีปุ่มอย่างน้อย 1 ปุ่ม';
    if (buttons.length > c.buttonsMax) return `${label} ใส่ปุ่มได้ไม่เกิน ${c.buttonsMax} ปุ่ม`;
    for (const b of buttons) {
      if (!b.label.trim()) return 'ปุ่มต้องมีข้อความบนปุ่ม';
      if (b.label.trim().length > BUTTON_LABEL_MAX) return `ข้อความบนปุ่มยาวเกิน ${BUTTON_LABEL_MAX} ตัวอักษร`;
      const actionError = validateAction(buttonAction(b), `กดปุ่ม "${b.label.trim()}"`);
      if (actionError) return actionError;
    }
    // การ์ดของ LINE ตัดข้อความทิ้งเมื่อยาวเกิน — บอกก่อนดีกว่าให้ลูกค้าเห็นข้อความขาด
    if (title.length > CARD_TITLE_MAX) return `หัวข้อบนการ์ดยาวเกิน ${CARD_TITLE_MAX} ตัวอักษร`;
    // LINE บังคับให้การ์ดมีข้อความ — ปล่อยว่างแล้วจะโดนปฏิเสธตอนยิง ไม่ใช่ตอนกรอก
    if (!text) return 'ต้องมีข้อความบนการ์ด';
    if (text.length > CARD_TEXT_MAX) return `ข้อความบนการ์ดยาวเกิน ${CARD_TEXT_MAX} ตัวอักษร`;
  }

  if (content.kind === 'gallery') {
    const images = content.images || [];
    if (!c.image || c.imagesMax === 0) return `${label} ส่งรูปหลายใบไม่ได้`;
    if (images.length === 0) return 'ใส่รูปอย่างน้อย 1 ใบ';
    if (images.length > c.imagesMax) return `${label} ใส่รูปได้ไม่เกิน ${c.imagesMax} ใบ`;
    for (let i = 0; i < images.length; i++) {
      if (!isHttpsUrl(images[i].image_url || '')) return `รูปที่ ${i + 1} ยังไม่มีรูป`;
      const actionError = validateAction(images[i].action, `กดรูปที่ ${i + 1}`);
      if (actionError) return actionError;
    }
    if (title || (content.buttons || []).length > 0 || (content.products || []).length > 0) {
      return 'รูปหลายใบมีแค่ข้อความกับรูป';
    }
  }

  if (content.kind === 'products') {
    const products = content.products || [];
    if (products.length === 0) return 'ต้องเลือกสินค้าอย่างน้อย 1 ชิ้น';
    if (products.length > c.productsMax) return `${label} ใส่การ์ดสินค้าได้ไม่เกิน ${c.productsMax} ชิ้น`;
    for (const p of products) {
      if (!p.name.trim()) return 'สินค้าต้องมีชื่อ';
      if (p.url && !isHttpsUrl(p.url)) return 'ลิงก์ของสินค้าต้องเป็น https';
    }
    if (content.card_style && content.card_style !== 'image' && content.card_style !== 'detail') {
      return 'รูปแบบการ์ดสินค้าไม่ถูกต้อง';
    }
  }

  if (content.kind === 'announce') {
    // รูปเต็มจอกดได้ = ต้องรู้ว่ากดแล้วไปไหน (ไม่ใส่ลิงก์ก็ได้ แค่กลายเป็นรูปที่กดไม่ได้)
    const link = (content.link_url || '').trim();
    if (content.image_style === 'rich' && link && !isHttpsUrl(link)) {
      return 'ลิงก์ที่กดจากรูปต้องเป็น https';
    }
    if (!text && !content.image_url) return 'ต้องมีข้อความหรือรูปอย่างน้อยหนึ่งอย่าง';
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
  if (content.kind === 'poster') {
    // โปสเตอร์ไม่มีข้อความให้ยกมาโชว์ — บอกว่ากดแล้วไปไหนแทน จะได้แยกใบออกจากกันในรายการ
    const target = actionSummary(posterAction(content));
    return `[โปสเตอร์] ${target ? `→ ${target}` : ''}${text ? ` — ${text}` : ''}`.trim().slice(0, 120);
  }
  if (content.kind === 'gallery') {
    return `[รูป ${(content.images || []).length} ใบ]${text ? ` — ${text}` : ''}`.slice(0, 120);
  }
  if (content.kind === 'products') {
    const names = (content.products || []).map(p => p.name).filter(Boolean);
    const head = text || title || 'การ์ดสินค้า';
    return `${head} — ${names.slice(0, 3).join(' · ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`.slice(0, 120);
  }
  const body = [title, text].filter(Boolean).join(' — ');
  return (body || '[รูปภาพ]').slice(0, 120);
}

/**
 * ชนิดเนื้อหาของบรอดแคสต์ใบหนึ่ง — ใบใหม่อ่านจากคอลัมน์ `content` ตรง ๆ
 *
 * ใบเก่า (ก่อนมีคอลัมน์นั้น) เก็บแค่ `messages` ที่แปลงเป็นของแพลตฟอร์มไปแล้ว
 * จึงต้องเดาย้อนกลับจากรูปทรงของ Flex: แถวเลื่อนได้ = การ์ดสินค้า · มีแต่รูปไม่มีเนื้อ/ปุ่ม
 * = โปสเตอร์ · มีเนื้อ = โปรโมชัน · template รุ่นเก่า `buttons`/`carousel` ก็ยังอ่านได้ ·
 * TikTok มี `product_ids` = การ์ดสินค้า — เดาไม่ได้ก็ตกเป็น 'announce' (ข้อความล้วน)
 */
export function resolveBroadcastContentKind(
  content: BroadcastContent | null | undefined,
  messages: unknown,
): BroadcastContentKind {
  if (content?.kind && ['announce', 'poster', 'gallery', 'promo', 'products'].includes(content.kind)) return content.kind;

  if (Array.isArray(messages)) {
    for (const m of messages) {
      // ใบที่ส่งหลัง 9 ก.ย. 2026 การ์ดทุกแบบเป็น Flex ไม่ใช่ template แล้ว
      const msg = m as { type?: string; contents?: { type?: string; hero?: unknown; body?: unknown; footer?: unknown } } | null;
      if (msg?.type === 'flex') {
        const c = msg.contents;
        if (c?.type === 'carousel') return 'products';
        if (c?.hero && !c.body && !c.footer) return 'poster';
        return 'promo';
      }
      const tpl = (m as { template?: { type?: string } } | null)?.template;
      if (tpl?.type === 'carousel') return 'products';
      if (tpl?.type === 'buttons') return 'promo';
    }
    return 'announce';
  }

  const ids = (messages as { product_ids?: unknown } | null)?.product_ids;
  if (Array.isArray(ids) && ids.length > 0) return 'products';
  return 'announce';
}
