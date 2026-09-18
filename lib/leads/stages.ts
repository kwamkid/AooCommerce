// Path: lib/leads/stages.ts
//
// ขั้นในกรวยขายของ "ผู้สนใจ (lead)" — client-safe (ไม่แตะ supabaseAdmin)
//
// ทำไมต้องมีที่เดียว: แผ่นติดตามในหน้าแชท · รายชื่อแชท · คิวติดตาม · รายงาน ต่างต้องแปล
// `stage` เป็นคำไทย + สี ถ้าต่างคนต่าง map เอง วันหนึ่งจอหนึ่งจะขึ้นรหัสดิบ
//
// ⚠️ ค่าจริงอยู่ในตาราง `lead_stages` (ร้านแก้ชื่อ/สี/ลำดับเองได้) — ที่นี่คือ **ชุดตั้งต้น**
//    ที่ seed ให้ทุกบริษัท และเป็นค่าสำรองเมื่อยังโหลดจาก DB ไม่เสร็จ

/** ชื่อสีเชิงความหมาย — ห้ามใส่ค่าสีจริงในโค้ด (design system คุมที่ globals.css) */
export type LeadStageColor = 'gray' | 'blue' | 'orange' | 'amber' | 'green' | 'red' | 'violet';

export interface LeadStage {
  key: string;
  name: string;
  color: LeadStageColor;
  sort_order: number;
  /** ยังอยู่ในกรวย — false = จบแล้ว (ซื้อแล้ว / ไม่เอา / ดูแลเสร็จ) */
  is_open: boolean;
  /** ห้องใหม่ตกที่ขั้นนี้ */
  is_default: boolean;
  /** ระบบติดให้เองจากเหตุการณ์จริง — หน้าจอขึ้นป้าย "อัตโนมัติ" บนปุ่ม */
  auto_managed: boolean;
}

export const DEFAULT_LEAD_STAGES: LeadStage[] = [
  { key: 'new',        name: 'ทักใหม่',     color: 'gray',   sort_order: 10, is_open: true,  is_default: true,  auto_managed: true },
  { key: 'talking',    name: 'กำลังคุย',    color: 'blue',   sort_order: 20, is_open: true,  is_default: false, auto_managed: false },
  { key: 'interested', name: 'สนใจ',        color: 'orange', sort_order: 30, is_open: true,  is_default: false, auto_managed: false },
  { key: 'quoted',     name: 'รอโอน',       color: 'amber',  sort_order: 40, is_open: true,  is_default: false, auto_managed: true },
  { key: 'won',        name: 'ซื้อแล้ว',    color: 'green',  sort_order: 50, is_open: false, is_default: false, auto_managed: true },
  { key: 'issue',      name: 'มีปัญหา',     color: 'red',    sort_order: 60, is_open: true,  is_default: false, auto_managed: false },
  { key: 'resolved',   name: 'ดูแลเสร็จ',   color: 'violet', sort_order: 70, is_open: false, is_default: false, auto_managed: false },
  { key: 'lost',       name: 'ไม่เอาแล้ว',  color: 'gray',   sort_order: 80, is_open: false, is_default: false, auto_managed: false },
];

/** ขั้นที่ถือว่า "จบแล้ว" — เปลี่ยนเข้าขั้นพวกนี้ต้องล้างนัดเสมอ */
export const CLOSED_STAGE_KEYS = ['won', 'resolved', 'lost'];

export const DEFAULT_STAGE_KEY = 'new';
/** ขั้นที่ระบบติดให้ตอนส่งลิงก์บิลในแชท (เริ่มนับวันรอโอน) */
export const QUOTED_STAGE_KEY = 'quoted';
/** ขั้นที่ระบบติดให้ตอนลูกค้าจ่ายเงิน/ออเดอร์เดินต่อ */
export const WON_STAGE_KEY = 'won';

export function findStage(stages: LeadStage[], key: string | null | undefined): LeadStage | null {
  if (!key) return null;
  return stages.find(s => s.key === key) || null;
}

/** ชื่อไทยของขั้น — ไม่รู้จักคืนรหัสดิบ (ดีกว่าโชว์ว่าง) */
export function stageLabel(stages: LeadStage[], key: string | null | undefined): string {
  return findStage(stages, key)?.name || key || '';
}

/** คลาส Tailwind ของชิปสถานะ — ชุดเดียวใช้ทุกจอ (รายชื่อ · แผ่น · คิวติดตาม) */
export const STAGE_CHIP_CLASS: Record<LeadStageColor, string> = {
  gray:   'bg-gray-100 text-gray-700',
  blue:   'bg-blue-50 text-blue-700',
  orange: 'bg-orange-50 text-orange-700',
  amber:  'bg-amber-50 text-amber-700',
  green:  'bg-green-50 text-green-700',
  red:    'bg-red-50 text-red-700',
  violet: 'bg-violet-50 text-violet-700',
};

/** คลาสของปุ่มขั้นที่ "ติดอยู่ตอนนี้" — พื้นทึบ ตัวอักษรขาว */
export const STAGE_ACTIVE_CLASS: Record<LeadStageColor, string> = {
  gray:   'bg-gray-600 text-white border-gray-600 ring-gray-200',
  blue:   'bg-blue-600 text-white border-blue-600 ring-blue-100',
  orange: 'bg-orange-600 text-white border-orange-600 ring-orange-100',
  amber:  'bg-amber-600 text-white border-amber-600 ring-amber-100',
  green:  'bg-green-600 text-white border-green-600 ring-green-100',
  red:    'bg-red-600 text-white border-red-600 ring-red-100',
  violet: 'bg-violet-600 text-white border-violet-600 ring-violet-100',
};

/** สีเส้นวงแหวนรอบรูปโปรไฟล์ในรายชื่อแชท */
export const STAGE_RING_CLASS: Record<LeadStageColor, string> = {
  gray:   'ring-gray-300',
  blue:   'ring-blue-400',
  orange: 'ring-orange-400',
  amber:  'ring-amber-400',
  green:  'ring-green-500',
  red:    'ring-red-500',
  violet: 'ring-violet-500',
};
