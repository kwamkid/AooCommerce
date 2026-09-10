// Path: lib/audiences/templates.ts
//
// แม่แบบกลุ่มเป้าหมาย — **client-safe และ pure** (ห้าม import supabase/service role ที่นี่
// ไฟล์นี้ถูกลากเข้า client bundle ผ่านหน้า /marketing/audiences)
//
// ทำไมต้องมี: กลุ่มที่ร้านค้า "ทุกร้าน" ต้องมีมีอยู่ไม่กี่กลุ่ม (ลูกค้าที่เพิ่งซื้อ · ลูกค้า
// ทั้งหมด · ลูกค้าที่หายไป · คนที่ทักแล้วยังไม่ซื้อ) แต่กว่าจะประกอบเองได้ต้องเข้าใจทั้ง
// "แหล่งที่มา" กับ "เงื่อนไข" ก่อน — แม่แบบจึงกรอกให้แล้วให้ผู้ใช้แก้ต่อ ไม่ใช่สร้างให้เลย
//
// ⚠️ ทุก `audience_type` ที่นี่ต้องมีจริงใน `AUDIENCE_OPTIONS` ของแพลตฟอร์มที่แม่แบบใช้
//    (lib/broadcast/audience.ts) และ **ทุกแหล่งที่แม่แบบติ๊กให้ต้องตอบได้** — ถ้าดึงจาก
//    "ลูกค้าในระบบ" ด้วย ต้องอยู่ใน `CUSTOMER_SOURCE_AUDIENCE_KEYS` (ไฟล์เดียวกัน) ไม่งั้น
//    หน้าจอขึ้นจางและเซิร์ฟเวอร์ปฏิเสธตอนบันทึก

export type AudienceTemplateKey =
  | 'buyers_90'
  | 'all_buyers'
  | 'lapsed_90'
  | 'page_not_bought'
  | 'ads_not_bought';

export interface AudienceTemplate {
  key: AudienceTemplateKey;
  /** ชื่อกลุ่มตั้งต้น — ผู้ใช้แก้ได้ก่อนบันทึก (ชื่อนี้โผล่ใน Ads Manager ด้วย) */
  name: string;
  /** 1 ประโยค = คำอธิบายกลุ่ม (ไปอยู่ใน audiences.description) */
  description: string;
  /** "เอาไปทำอะไรใน Ads Manager" — เหตุผลที่ควรมีกลุ่มนี้ 1 ประโยค */
  use: string;
  audience_type: string;
  days?: number;
  /**
   * แหล่งที่มาที่แม่แบบจะติ๊กให้:
   *  - `chat_and_customers` = ทุกห้องแชท LINE/FB ที่เปิดอยู่ + ลูกค้าในระบบ
   *  - `facebook_only`      = เฉพาะเพจ Facebook (กลุ่มที่ต้องใช้ข้อมูลของ Messenger)
   */
  sources: 'chat_and_customers' | 'facebook_only';
  icon: 'ShoppingBag' | 'Users' | 'UserMinus' | 'MessageCircle' | 'Megaphone';
}

export const AUDIENCE_TEMPLATES: AudienceTemplate[] = [
  {
    key: 'buyers_90',
    name: 'ลูกค้าที่ซื้อใน 90 วัน',
    description: 'ทุกคนที่มีบิลชำระแล้วภายใน 90 วันล่าสุด',
    use: 'กันออกจากโฆษณาหาลูกค้าใหม่ (ไม่เสียเงินยิงซ้ำคนที่เพิ่งซื้อ) หรือใช้เป็นต้นแบบทำ Lookalike ให้ Meta หาคนที่คล้ายกัน',
    audience_type: 'bought_within',
    days: 90,
    sources: 'chat_and_customers',
    icon: 'ShoppingBag',
  },
  {
    key: 'all_buyers',
    name: 'ลูกค้าทั้งหมดที่เคยซื้อ',
    description: 'ทุกคนที่เคยมีบิลชำระแล้วอย่างน้อยหนึ่งใบ',
    use: 'ฐานใหญ่สำหรับ Lookalike หรือกันออกจากโฆษณาหาลูกค้าใหม่',
    audience_type: 'bought',
    sources: 'chat_and_customers',
    icon: 'Users',
  },
  {
    key: 'lapsed_90',
    name: 'ลูกค้าเก่าที่หายไปเกิน 90 วัน',
    description: 'เคยซื้อ แต่บิลล่าสุดเก่ากว่า 90 วัน',
    use: 'ยิงโปรโมชันดึงกลับ (win-back) เฉพาะคนที่เคยเป็นลูกค้าจริง',
    audience_type: 'bought_before',
    days: 90,
    sources: 'chat_and_customers',
    icon: 'UserMinus',
  },
  {
    key: 'page_not_bought',
    name: 'ทักเพจแล้วแต่ยังไม่ซื้อ',
    description: 'คนที่เคยทักเพจ Facebook แต่ยังไม่มีบิลในระบบ',
    use: 'ยิงซ้ำ (retarget) ด้วยข้อเสนอปิดการขาย — จับคู่ได้ทันทีเพราะ Meta รู้จัก Messenger ID',
    audience_type: 'not_bought',
    sources: 'facebook_only',
    icon: 'MessageCircle',
  },
  {
    key: 'ads_not_bought',
    name: 'ทักจากโฆษณาแล้วแต่ยังไม่ซื้อ',
    description: 'คนที่กดโฆษณาเข้ามาทัก แต่ยังไม่มีบิลในระบบ',
    use: 'ยิงซ้ำเฉพาะคนที่จ่ายค่าโฆษณาพามาแล้ว — คุ้มที่สุดที่จะปิดการขายให้จบ',
    audience_type: 'ads_not_bought',
    sources: 'facebook_only',
    icon: 'Megaphone',
  },
];

export function findAudienceTemplate(key: string | null | undefined): AudienceTemplate | null {
  if (!key) return null;
  return AUDIENCE_TEMPLATES.find(t => t.key === key) || null;
}

/**
 * ทำไมแม่แบบนี้ยังใช้ไม่ได้กับบัญชีที่มี — `null` = ใช้ได้
 *
 * ⛔ ตัวที่ใช้ไม่ได้ **ห้ามซ่อน** — โชว์พร้อมเหตุผลนี้เสมอ ไม่งั้นผู้ใช้จะถามซ้ำว่าหายไปไหน
 */
export function templateUnavailableReason(
  t: AudienceTemplate,
  accounts: { platform: 'line' | 'facebook' }[],
): string | null {
  if (t.sources === 'facebook_only' && !accounts.some(a => a.platform === 'facebook')) {
    return 'ยังไม่มีเพจ Facebook ที่เชื่อมไว้ — เพิ่มที่ ตั้งค่า › ช่องทาง Chat';
  }
  // chat_and_customers ใช้ได้เสมอ — "ลูกค้าในระบบ" เป็นแหล่งที่มีอยู่แล้วทุกร้าน
  return null;
}
