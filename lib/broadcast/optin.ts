// Path: lib/broadcast/optin.ts
//
// ทะเบียนกติกาของ "การ์ดชวนรับข่าวสาร" บน Messenger — **client-safe** (หน้าตั้งค่า import ได้)
// ⛔ ห้าม import supabaseAdmin หรืออะไรที่แตะ DB ในไฟล์นี้
//
// ทำไมต้องแยกข้อความตามสถานการณ์ (เจ้าของสั่งเอง):
//   "ลูกค้าซื้อไปแล้ว คุณเพิ่งมาให้ส่วนลด 5% แบบนี้โดนด่าแน่ๆ ครับ"
// ⇒ คนที่เพิ่งจ่ายเงินกับคนที่ยังไม่ตัดสินใจ ต้องได้คนละข้อความ ไม่ใช่ชุดเดียวใช้ร่วมกัน
//
// ⚠️ กติกาของ Meta ที่ทุกด่านต้องเคารพ (ยิงจริงยืนยันแล้ว 14 ก.ย. 2026):
//   • ส่งคำชวนได้เฉพาะใน 24 ชม. นับจาก **ลูกค้าทักล่าสุด** — พ้นกรอบได้ code 10/2018278
//   • ขอซ้ำได้ 1 ครั้ง/สัปดาห์/หัวข้อ/คน ⇒ reask_days ต่ำกว่า 7 ไม่มีประโยชน์ Meta ปฏิเสธเอง

export type OptinTrigger = 'manual' | 'after_sale' | 'quiet';

// ⛔ **ความถี่ไม่ใช่ของที่ร้านตั้ง** — ยิงจริงแล้ว Meta ปฏิเสธ
// `(#100) Invalid keys "notification_messages_frequency"` · ลูกค้าเป็นคนเลือกตอนกดรับ
// แล้วค่าที่เขาเลือกส่งกลับมาทาง webhook ⇒ อย่าเอาช่องนี้กลับเข้าหน้าตั้งค่าอีก

/** หัวข้อบนการ์ดที่ Meta รับ */
export const OPTIN_TITLE_MAX = 65;
/** กรอบที่ Meta ยอมให้ส่งข้อความทั่วไป (รวมคำชวนสมัคร) */
export const OPTIN_WINDOW_HOURS = 24;
/** ขั้นต่ำของการถามซ้ำ — เพดานจริงของ Meta คือสัปดาห์ละครั้ง */
export const OPTIN_MIN_REASK_DAYS = 7;
/** ส่งได้กี่ใบต่อเพจต่อรอบ cron — กันวันเปิดสวิตช์แล้วยิงทั้งร้านพร้อมกัน */
export const OPTIN_MAX_PER_ACCOUNT_PER_RUN = 20;

export interface OptinScenario {
  enabled: boolean;
  title: string;
  image_url: string;
}

export interface OptinConfig {
  version: 1;
  manual: OptinScenario;
  after_sale: OptinScenario;
  quiet: OptinScenario;
  /** ถามคนเดิมซ้ำได้เมื่อผ่านไปกี่วัน (บังคับ ≥ OPTIN_MIN_REASK_DAYS) */
  reask_days: number;
  /** ถามคนเดิมได้กี่ครั้งแล้วเลิกถาม — ถามไม่หยุด = โดนบล็อก */
  max_asks: number;
  /** ช่วง "เงียบ" ที่ถือว่าคุยจบแล้ว (นาที) — ต้องมีขอบบน ดูคอมเมนต์ท้ายไฟล์ */
  quiet_min_minutes: number;
  quiet_max_minutes: number;
  /** ห้องที่ทักมาคำเดียวแล้วหายไม่ต้องชวน */
  quiet_min_messages: number;
}

interface TriggerInfo {
  label: string;
  /** อธิบายให้ร้านเข้าใจว่าใบนี้ส่งตอนไหน */
  description: string;
  /** ค่าตั้งต้นของสวิตช์ — auto ปิดไว้ก่อนเสมอ ให้ร้านอ่านข้อความแล้วเปิดเอง */
  defaultEnabled: boolean;
  /** ข้อความตั้งต้น — **ต่างโทนกันตั้งแต่ default** ไม่ปล่อยให้ copy กันเอง */
  defaultTitle: (shopName: string) => string;
}

export const OPTIN_TRIGGERS: Record<OptinTrigger, TriggerInfo> = {
  manual: {
    label: 'แอดมินกดส่งเอง',
    description: 'ปุ่มในกล่องพิมพ์ของห้องแชท — แอดมินเลือกจังหวะเอง',
    defaultEnabled: true,
    defaultTitle: (shop) => trimTitle(`รับข่าวสารและโปรโมชันจาก ${shop}`),
  },
  after_sale: {
    label: 'หลังปิดการขาย',
    description: 'ส่งอัตโนมัติเมื่อบิลที่เปิดจากห้องแชทนี้ถูกบันทึกว่าชำระแล้ว',
    defaultEnabled: false,
    // ⛔ ห้ามมีคำว่าส่วนลด/% — คนเพิ่งจ่ายเงินไป เสนอส่วนลดตอนนี้ = บอกเขาว่าเมื่อกี้ซื้อแพงไป
    defaultTitle: () => 'ขอบคุณที่สั่งซื้อ — กดรับข่าวสารไว้ รู้ก่อนใครเมื่อมีของใหม่เข้า',
  },
  quiet: {
    label: 'คุยจบแล้วเงียบไป',
    description: 'ส่งอัตโนมัติเมื่อคุยกันจบแล้วเงียบไป 30–60 นาที (ยังไม่ปิดการขาย)',
    defaultEnabled: false,
    // คนกลุ่มนี้ยังไม่ตัดสินใจ — ส่วนลดคือเหตุผลให้กลับมา
    defaultTitle: (shop) => trimTitle(`รับส่วนลดและโปรโมชันพิเศษจาก ${shop}`),
  },
};

export function trimTitle(title: string): string {
  return title.trim().slice(0, OPTIN_TITLE_MAX);
}

function scenarioDefaults(trigger: OptinTrigger, shopName: string): OptinScenario {
  const info = OPTIN_TRIGGERS[trigger];
  return {
    enabled: info.defaultEnabled,
    title: info.defaultTitle(shopName),
    image_url: '',
  };
}

function readScenario(raw: unknown, trigger: OptinTrigger, shopName: string): OptinScenario {
  const base = scenarioDefaults(trigger, shopName);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : base.enabled,
    title: typeof o.title === 'string' && o.title.trim() ? trimTitle(o.title) : base.title,
    image_url: typeof o.image_url === 'string' ? o.image_url.trim() : '',
  };
}

function num(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * อ่านค่าตั้งของเพจหนึ่งออกมาเป็นก้อนที่ใช้ได้เลย (เติม default ให้ครบเสมอ)
 *
 * เก็บเป็น **jsonb ก้อนเดียว** ที่คีย์ `broadcast_optin` เพราะ `PUT /api/chat-accounts`
 * merge แบบ shallow ต่อ top-level key ⇒ ก้อนเดียว = แทนที่ทั้งชุดแบบ atomic
 * (ถ้าแบนเป็น 17 คีย์ การเซฟที่ส่งไม่ครบจะทิ้งค่าค้างครึ่ง ๆ โดยไม่มีอาการ)
 * ⇒ **หน้าตั้งค่าต้องส่งก้อนเต็มเสมอ** (read-modify-write) ห้ามส่ง partial
 *
 * 3 คีย์รุ่นแรก (broadcast_optin_title/_image/_frequency) ยังอ่านเป็น fallback ของ manual
 * เพื่อไม่ต้องย้ายข้อมูลของเพจที่ตั้งค่าไว้ก่อนแล้ว
 */
export function readOptinConfig(
  credentials: Record<string, unknown> | null | undefined,
  shopName = 'ร้าน',
): OptinConfig {
  const c = credentials || {};
  const raw = c['broadcast_optin'];
  const bag = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const manual = readScenario(bag.manual, 'manual', shopName);
  // fallback รุ่นแรก — ใช้เฉพาะเมื่อยังไม่เคยบันทึกก้อนใหม่
  if (!bag.manual) {
    const legacyTitle = c['broadcast_optin_title'];
    const legacyImage = c['broadcast_optin_image'];
    if (typeof legacyTitle === 'string' && legacyTitle.trim()) manual.title = trimTitle(legacyTitle);
    if (typeof legacyImage === 'string') manual.image_url = legacyImage.trim();
  }

  return {
    version: 1,
    manual,
    after_sale: readScenario(bag.after_sale, 'after_sale', shopName),
    quiet: readScenario(bag.quiet, 'quiet', shopName),
    reask_days: num(bag.reask_days, 30, OPTIN_MIN_REASK_DAYS, 365),
    max_asks: num(bag.max_asks, 3, 1, 10),
    quiet_min_minutes: num(bag.quiet_min_minutes, 30, 1, 23 * 60),
    quiet_max_minutes: num(bag.quiet_max_minutes, 60, 2, 23 * 60),
    quiet_min_messages: num(bag.quiet_min_messages, 2, 1, 50),
  };
}

/** คืนข้อความ error ภาษาไทย หรือ null ถ้าผ่าน — หน้าจอกับ API ใช้ตัวเดียวกัน */
export function validateOptinConfig(cfg: OptinConfig): string | null {
  for (const trigger of Object.keys(OPTIN_TRIGGERS) as OptinTrigger[]) {
    const s = cfg[trigger];
    if (s.enabled && !s.title.trim()) return `${OPTIN_TRIGGERS[trigger].label}: ยังไม่ได้ใส่หัวข้อบนการ์ด`;
    if (s.title.length > OPTIN_TITLE_MAX) return `${OPTIN_TRIGGERS[trigger].label}: หัวข้อยาวเกิน ${OPTIN_TITLE_MAX} ตัวอักษร`;
    // รูปเป็นฟิลด์**บังคับ**ของจริง (ยิงจริงยืนยัน 16 ก.ย. 2026) — ไม่มีรูป Meta ปฏิเสธด้วย
    // error ที่อ่านไม่ออกเลยว่าขาดอะไร (`-1/2018012 Unexpected internal error`)
    if (s.enabled && !s.image_url.trim()) {
      return `${OPTIN_TRIGGERS[trigger].label}: ต้องใส่รูปบนการ์ด — Facebook ไม่รับการ์ดชวนสมัครที่ไม่มีรูป`;
    }
  }
  if (cfg.reask_days < OPTIN_MIN_REASK_DAYS) {
    return `ถามซ้ำได้อย่างน้อยทุก ${OPTIN_MIN_REASK_DAYS} วัน (Meta ให้ขอซ้ำสัปดาห์ละครั้ง)`;
  }
  // หน้าต่างเงียบต้องมี**ขอบบน**เสมอ: ถ้าเป็น "เงียบเกิน N นาที" เฉย ๆ วันที่เปิดสวิตช์
  // รอบแรกจะกวาดทุกห้องในร้านพร้อมกัน → โดนบล็อก/รีพอร์ตถล่ม → คะแนนเพจตกทั้งร้าน
  if (cfg.quiet_max_minutes <= cfg.quiet_min_minutes) {
    return 'ช่วงเวลาเงียบไม่ถูกต้อง — เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม';
  }
  if (cfg.quiet_max_minutes > OPTIN_WINDOW_HOURS * 60) {
    return `ช่วงเวลาเงียบต้องไม่เกิน ${OPTIN_WINDOW_HOURS} ชั่วโมง (พ้นกรอบแล้ว Facebook ไม่ให้ส่ง)`;
  }
  return null;
}
