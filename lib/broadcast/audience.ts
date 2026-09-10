// Path: lib/broadcast/audience.ts
//
// ทะเบียน "กลุ่มผู้รับ" ของบรอดแคสต์ — client-safe (ไม่แตะ supabaseAdmin)
//
// ทำไมต้องมีที่เดียว: หน้าสร้าง · หน้ารายการ · หน้ารายงาน ต่างต้องแปล audience_type
// เป็นคำไทย — เดิมหน้ารายการมี map ของตัวเองที่ขาดกลุ่มใหม่ (not_bought/bought_*)
// จึงขึ้นเป็นรหัสดิบ · เพิ่มกลุ่มใหม่ = เพิ่มที่นี่ที่เดียว แล้วต้องเพิ่มใน
// AUDIENCE_BY_PLATFORM ของ /api/broadcasts + CHECK ของตาราง (migration) ด้วย
//
// การจัดกลุ่ม **แบ่งตามเป้าหมายการตลาด** ไม่ใช่ตามกลไกของระบบ:
//   ยังไม่เคยซื้อ → ชวนซื้อครั้งแรก · เป็นลูกค้าแล้ว → ชวนซื้อซ้ำ · อื่น ๆ → กลุ่มเชิงกลไก
// ⚠️ "ยังไม่เคยซื้อ" จริง ๆ คือ "ไม่มีหลักฐานว่าซื้อ" — LINE ไม่ให้เบอร์/อีเมล ระบบรู้ว่าใคร
//    เป็นลูกค้าได้ทางเดียวคือห้องแชทถูกผูกกับ customers · หน้าจอต้องบอกเสมอว่า
//    รู้ประวัติของกี่คน (contact_linked / contact_total จาก /api/broadcasts/preview)

import { BROADCAST_PLATFORMS, type BroadcastPlatform } from './platforms';

/** หน้าต่างวัดผลหลังส่ง (ตอบกลับ / สั่งซื้อ) — ตรงกับ interval '7 days' ใน RPC get_broadcast_reply_stats */
export const BROADCAST_ATTRIBUTION_DAYS = 7;

export type AudienceGroupKey = 'not_bought' | 'bought' | 'other';

export interface AudienceGroup {
  key: AudienceGroupKey;
  label: string;
  /** บรรทัดอธิบายใต้ชื่อกลุ่ม — บอกว่ากลุ่มนี้มีไว้ทำอะไร */
  hint: string;
}

/** กลุ่มใหญ่เรียงตามที่ควรโชว์ */
export const AUDIENCE_GROUPS: AudienceGroup[] = [
  { key: 'not_bought', label: 'ยังไม่เคยซื้อ', hint: 'ชวนให้ซื้อครั้งแรก' },
  { key: 'bought', label: 'เป็นลูกค้าแล้ว', hint: 'ชวนให้กลับมาซื้อซ้ำ' },
  { key: 'other', label: 'อื่น ๆ', hint: 'ผู้ติดตามทั้งหมด · ตามแท็ก · เลือกรายคน' },
];

export interface AudienceOption {
  key: string;
  group: AudienceGroupKey;
  label: string;
  hint?: string;
  /** ต้องกรอกจำนวนวันต่อ (ป้ายมีคำว่า "N วัน") */
  needsDays?: boolean;
  /** ต้องเลือกแท็กต่อ */
  needsTags?: boolean;
  /** ต้องเลือกรายชื่อต่อ */
  needsPick?: boolean;
}

/**
 * กลุ่มผู้รับที่แต่ละช่องทางรองรับ — เพราะ "ใครที่ทักได้" ต่างกันตามแพลตฟอร์ม
 * ต้องตรงกับ AUDIENCE_BY_PLATFORM ใน app/api/broadcasts/route.ts (server ปฏิเสธค่าที่ไม่รู้จัก)
 */
export const AUDIENCE_OPTIONS: Partial<Record<BroadcastPlatform, AudienceOption[]>> = {
  line: [
    {
      key: 'not_bought', group: 'not_bought',
      label: 'ยังไม่เคยซื้อ',
      hint: 'ไม่มีออเดอร์ในระบบ — รวมคนที่ยังไม่ได้ผูกกับข้อมูลลูกค้า',
    },
    {
      key: 'bought', group: 'bought',
      label: 'ลูกค้าทั้งหมด',
      hint: 'เคยซื้ออย่างน้อยหนึ่งครั้ง',
    },
    {
      key: 'bought_before', group: 'bought',
      label: 'หายไปเกิน N วัน',
      hint: 'เคยซื้อแล้วเงียบไป — ชวนกลับมา',
      needsDays: true,
    },
    {
      key: 'bought_within', group: 'bought',
      label: 'ซื้อล่าสุดภายใน N วัน',
      hint: 'ลูกค้าที่ยังซื้ออยู่ — เหมาะกับของใหม่ ของเสริม',
      needsDays: true,
    },
    {
      key: 'bought_once', group: 'bought',
      label: 'ซื้อครั้งเดียว ยังไม่กลับมา',
      hint: 'กลุ่มที่ดันให้ซื้อครั้งที่สองได้คุ้มที่สุด',
    },
    {
      key: 'contacts', group: 'other',
      label: 'คนที่เคยทักเข้ามา',
      hint: 'ทุกคนที่มีห้องแชทอยู่ในระบบ ไม่ว่าจะซื้อหรือยัง',
    },
    {
      key: 'all', group: 'other',
      label: 'ผู้ติดตามทั้งหมด',
      hint: 'รวมคนที่แอดเพื่อนไว้แต่ไม่เคยทักมาเลย — กลุ่มใหญ่สุด กินโควตามากสุด',
    },
    {
      key: 'tags', group: 'other',
      label: 'ตามแท็ก',
      hint: 'นับทั้งแท็กที่ติดกับลูกค้า และแท็กที่ติดกับห้องแชทโดยตรง',
      needsTags: true,
    },
    {
      key: 'contacts_pick', group: 'other',
      label: 'เลือกรายคน',
      hint: 'ใช้ทดสอบส่งหาตัวเองก่อนยิงจริง หรือส่งกลุ่มเล็กเฉพาะกิจ',
      needsPick: true,
    },
  ],
  // Facebook Messenger — ผู้ติดต่อมาจาก fb_contacts (source='facebook')
  // ไม่มี 'all': Meta ไม่มีแนวคิด "ผู้ติดตามที่ยิงข้อความถึงได้" แบบ LINE — ทักได้เฉพาะ
  // คนที่เคยเปิดห้องกับเรา (กลุ่มพวกนี้จึงใช้เป็น "กลุ่มเป้าหมายโฆษณา" ได้ดีกว่าใช้ยิงแชท)
  facebook: [
    {
      key: 'not_bought', group: 'not_bought',
      label: 'ยังไม่เคยซื้อ',
      hint: 'ไม่มีออเดอร์ในระบบ — รวมคนที่ยังไม่ได้ผูกกับข้อมูลลูกค้า',
    },
    {
      key: 'ads_not_bought', group: 'not_bought',
      label: 'ทักมาจากโฆษณาแต่ยังไม่ซื้อ',
      hint: 'ทักผ่านโฆษณา Click-to-Messenger แล้วยังไม่มีออเดอร์ — กลุ่มที่ควรตามปิดการขาย',
    },
    {
      key: 'bought', group: 'bought',
      label: 'ลูกค้าทั้งหมด',
      hint: 'เคยซื้ออย่างน้อยหนึ่งครั้ง',
    },
    {
      key: 'bought_before', group: 'bought',
      label: 'หายไปเกิน N วัน',
      hint: 'เคยซื้อแล้วเงียบไป — ชวนกลับมา',
      needsDays: true,
    },
    {
      key: 'bought_within', group: 'bought',
      label: 'ซื้อล่าสุดภายใน N วัน',
      hint: 'ลูกค้าที่ยังซื้ออยู่ — เหมาะกับของใหม่ ของเสริม',
      needsDays: true,
    },
    {
      key: 'bought_once', group: 'bought',
      label: 'ซื้อครั้งเดียว ยังไม่กลับมา',
      hint: 'กลุ่มที่ดันให้ซื้อครั้งที่สองได้คุ้มที่สุด',
    },
    {
      key: 'contacts', group: 'other',
      label: 'คนที่เคยทักเข้ามา',
      hint: 'ทุกคนที่มีห้องแชทอยู่ในระบบ ไม่ว่าจะซื้อหรือยัง',
    },
    {
      key: 'tags', group: 'other',
      label: 'ตามแท็ก',
      hint: 'นับทั้งแท็กที่ติดกับลูกค้า และแท็กที่ติดกับห้องแชทโดยตรง',
      needsTags: true,
    },
    {
      key: 'contacts_pick', group: 'other',
      label: 'เลือกรายคน',
      hint: 'ใช้ทดสอบส่งหาตัวเองก่อนยิงจริง หรือส่งกลุ่มเล็กเฉพาะกิจ',
      needsPick: true,
    },
  ],
  tiktok: [
    {
      key: 'buyers_365d', group: 'bought',
      label: 'ลูกค้าที่เคยสั่งซื้อ (365 วัน)',
      hint: 'TikTok ให้ทักได้เฉพาะกรอบนี้',
    },
    {
      key: 'tags', group: 'other',
      label: 'ตามแท็กลูกค้า',
      hint: 'นับเฉพาะคนที่ติดแท็กและมีออเดอร์ใน 365 วัน',
      needsTags: true,
    },
  ],
};

/** ป้ายของทุก audience_type (รวมค่าเก่าที่ยังค้างในตาราง เช่น customers) */
const LABELS: Record<string, string> = {
  customers: 'คนที่เคยทัก และผูกลูกค้าแล้ว',
};
for (const list of Object.values(AUDIENCE_OPTIONS)) {
  for (const o of list || []) LABELS[o.key] = o.label;
}

/** ตัวกรองที่เก็บใน broadcasts.audience_filter (เฉพาะคีย์ที่กลุ่มนั้นใช้จริง) */
export interface StoredAudienceFilter {
  tag_ids?: string[];
  contact_ids?: string[];
  days?: number;
  min_messages?: number;
  last_chat_days?: number;
}

/**
 * ชื่อกลุ่มที่อ่านออก — แทน "N วัน" ด้วยจำนวนจริง เช่น "หายไปเกิน 30 วัน"
 * ใช้ทั้งหน้าสร้าง (ปุ่มสรุป) · หน้ารายการ · หน้ารายงาน
 */
export function audienceLabel(audienceType: string, filter?: StoredAudienceFilter | null): string {
  const base = LABELS[audienceType] || audienceType;
  if (audienceType === 'contacts_pick') {
    const n = filter?.contact_ids?.length ?? 0;
    return n > 0 ? `${base} · ${n.toLocaleString()} คน` : base;
  }
  const days = Number(filter?.days) || 30;
  return base.replace('N วัน', `${days} วัน`);
}

/**
 * ตัวกรองซ้อนเป็นข้อความสั้น — "ลูกค้าพิมพ์ ≥5 ข้อความ · พิมพ์ใน 30 วัน" หรือ '' เมื่อไม่มี
 * ⚠️ ทั้งสองเกณฑ์นับเฉพาะข้อความที่ **ลูกค้าพิมพ์มา** (direction='incoming')
 */
export function describeAudienceRefine(filter?: StoredAudienceFilter | null): string {
  if (!filter) return '';
  const parts: string[] = [];
  if (Number(filter.min_messages) > 0) parts.push(`ลูกค้าพิมพ์ ≥${filter.min_messages} ข้อความ`);
  if (Number(filter.last_chat_days) > 0) parts.push(`พิมพ์ใน ${filter.last_chat_days} วัน`);
  return parts.join(' · ');
}

/**
 * ตัวกรองซ้อน (พิมพ์มา ≥N · พิมพ์ใน M วัน) ใช้ได้กับกลุ่มที่มีรายชื่อจริงเท่านั้น —
 * 'all' ยิงถึงผู้ติดตามที่เราไม่มีรายชื่อ กรองอะไรไม่ได้ · 'contacts_pick' เลือกมาเองแล้ว
 */
export function hasAudienceRefine(audienceType: string): boolean {
  return audienceType !== 'all' && audienceType !== 'contacts_pick';
}

/**
 * ประกอบ audience_filter ที่จะส่งให้ /api/broadcasts และ /preview —
 * ที่เดียวเพื่อให้จำนวนที่ preview นับกับจำนวนที่ส่งจริงใช้เงื่อนไขเดียวกันเสมอ
 */
export function buildAudienceFilter(
  audienceType: string,
  opts: { tagIds?: string[]; contactIds?: string[]; days?: number; minMessages?: number; lastChatDays?: number },
): StoredAudienceFilter {
  if (audienceType === 'contacts_pick') return { contact_ids: opts.contactIds || [] };
  const refine: StoredAudienceFilter = hasAudienceRefine(audienceType)
    ? {
        ...((opts.minMessages ?? 0) > 0 ? { min_messages: opts.minMessages } : {}),
        ...((opts.lastChatDays ?? 0) > 0 ? { last_chat_days: opts.lastChatDays } : {}),
      }
    : {};
  if (audienceType === 'tags') return { tag_ids: opts.tagIds || [], ...refine };
  if (audienceType === 'bought_within' || audienceType === 'bought_before') {
    return { days: opts.days || 30, ...refine };
  }
  return refine;
}

/** ตัวเลือกที่ทุกช่องทางที่เลือกมีเหมือนกัน — เลือกข้ามเจ้าแล้วเหลือเฉพาะตัวร่วม */
export function commonAudienceOptions(platforms: BroadcastPlatform[]): AudienceOption[] {
  if (platforms.length === 0) return [];
  const lists = platforms.map(p => AUDIENCE_OPTIONS[p] || []);
  return lists[0].filter(o => lists.every(l => l.some(x => x.key === o.key)));
}

/**
 * ตัวเลือก **ทุกตัว** ของช่องทางที่เลือก (ไม่ใช่เฉพาะตัวร่วม) พร้อมเหตุผลของตัวที่ใช้ไม่ครบทุกเจ้า
 *
 * ต่างจาก `commonAudienceOptions` ตรงที่กลุ่มเป้าหมายของโฆษณา **หยิบคนจากหลายแหล่งมารวมกัน
 * เป็นกลุ่มเดียว** ⇒ ตัวเลือกที่มีแค่บางแหล่งก็ยังใช้ได้ (แค่ได้คนจากแหล่งนั้นแหล่งเดียว) —
 * ตัดทิ้งเหมือนสายบรอดแคสต์จะเสียกลุ่มอย่าง "ทักมาจากโฆษณาแต่ยังไม่ซื้อ" ไปเปล่า ๆ
 *
 * ⛔ **ห้ามซ่อนตัวที่ใช้ได้ไม่ครบ** — โชว์พร้อมเหตุผลเสมอ ไม่งั้นผู้ใช้จะถามซ้ำว่าหายไปไหน
 */
export function unionAudienceOptions(platforms: BroadcastPlatform[]): {
  options: AudienceOption[];
  /** key → เหตุผลว่าใช้ได้กับช่องทางไหนบ้าง (มีเฉพาะ key ที่ไม่ครบทุกช่องทางที่เลือก) */
  unsupported: Record<string, string>;
} {
  if (platforms.length === 0) return { options: [], unsupported: {} };

  const options: AudienceOption[] = [];
  const seen = new Set<string>();
  for (const p of platforms) {
    for (const o of AUDIENCE_OPTIONS[p] || []) {
      if (seen.has(o.key)) continue;
      seen.add(o.key);
      options.push(o);
    }
  }

  const unsupported: Record<string, string> = {};
  for (const o of options) {
    const supported = platforms.filter(p => (AUDIENCE_OPTIONS[p] || []).some(x => x.key === o.key));
    if (supported.length === platforms.length) continue;
    const labels = supported.map(p => BROADCAST_PLATFORMS[p].label).join(' · ');
    unsupported[o.key] = `ใช้ได้เฉพาะ ${labels}`;
  }

  return { options, unsupported };
}

// ─── ชนิดข้อมูลที่หน้าจอฝั่งกลุ่มผู้รับใช้ร่วมกัน ────────────────────────
//
// อยู่ที่นี่ (ไม่ใช่ในโฟลเดอร์ของหน้าสร้างบรอดแคสต์) เพราะหน้ากลุ่มเป้าหมายโฆษณาใช้ชุดเดียวกัน
// — วางไว้ใต้หน้าใดหน้าหนึ่งแล้วอีกหน้าต้อง import ข้ามโฟลเดอร์ของกันและกัน

export interface TagRow { id: string; name: string; color: string }

/** ผู้ติดต่อที่เลือกเอง — `name` ว่างได้เมื่อคัดลอกใบเก่ามา (รู้แค่ id) */
export interface PickedContact { id: string; name: string }

/** จำนวนคนของแต่ละกลุ่มผู้รับ — ค่า null = ตอบไม่ได้ (โชว์ '—' ห้ามเดาเป็น 0) */
export interface AudienceCounts {
  counts: Record<string, number | null>;
  /** null = ช่องทางนี้ไม่มีแนวคิด "ผู้ติดต่อ" (marketplace) — ตกไปใช้ค่าจาก /preview แทน */
  contact_total?: number | null;
  contact_linked?: number | null;
  days?: number;
}
