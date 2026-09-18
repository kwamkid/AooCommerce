// Path: lib/leads/followup-presets.ts
//
// ปุ่ม "ทักอีกทีเมื่อ" — client-safe, ที่เดียวของทั้งระบบ
//
// ทำไมต้องมีที่เดียว: แผ่นติดตาม (มือถือ) · ปุ่มปัดในรายชื่อ · แถบหลังส่งข้อความ ต่างก็ยิงวันเดียวกัน
// ถ้าต่างจอต่างคิด "พรุ่งนี้" คนละเวลา คิวติดตามจะเรียงมั่ว
//
// กติกา: ปักเวลา **10:00 น. ตามเวลาไทย** (ช่วงที่ร้านเริ่มทำงาน — นัดตอนเที่ยงคืนไม่มีใครเห็น)
// "อังคารหน้า" = วันอังคารถัดไปจริง ๆ ไม่ใช่ +7 วัน

/** เวลานัดมาตรฐาน (ชั่วโมงตามเวลาไทย) */
export const FOLLOW_UP_HOUR = 10;

const TH_DAY = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function at10(d: Date): Date {
  const x = new Date(d);
  x.setHours(FOLLOW_UP_HOUR, 0, 0, 0);
  return x;
}

export function addDays(n: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return at10(d);
}

export function addMonths(n: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + n);
  return at10(d);
}

/** วันในสัปดาห์ถัดไป (0 = อาทิตย์) — วันนี้ตรงกับวันนั้นพอดีก็ข้ามไปสัปดาห์หน้า */
export function nextWeekday(weekday: number, from: Date = new Date()): Date {
  const d = new Date(from);
  const diff = (weekday - d.getDay() + 7) || 7;
  d.setDate(d.getDate() + diff);
  return at10(d);
}

export interface FollowUpPreset {
  key: string;
  label: string;
  date: Date;
}

/** ปุ่มมาตรฐาน — เรียงจากใกล้ไปไกล (ของที่กดบ่อยสุดอยู่ซ้ายบน) */
export function followUpPresets(now: Date = new Date()): FollowUpPreset[] {
  return [
    { key: 'd1',  label: 'พรุ่งนี้',    date: addDays(1, now) },
    { key: 'd2',  label: '2 วัน',      date: addDays(2, now) },
    { key: 'd3',  label: '3 วัน',      date: addDays(3, now) },
    { key: 'tue', label: 'อังคารหน้า', date: nextWeekday(2, now) },
    { key: 'd7',  label: '7 วัน',      date: addDays(7, now) },
    { key: 'm1',  label: '1 เดือน',    date: addMonths(1, now) },
    { key: 'm3',  label: '3 เดือน',    date: addMonths(3, now) },
    { key: 'y1',  label: '1 ปี',       date: addMonths(12, now) },
  ];
}

/** ปุ่มชุดสั้นสำหรับที่แคบ (ปัดแถว · แถบหลังส่งข้อความ) */
export function quickFollowUpPresets(now: Date = new Date()): FollowUpPreset[] {
  return followUpPresets(now).filter(p => ['d1', 'd3', 'd7'].includes(p.key));
}

/** "ส. 20 ก.ย." — รูปแบบสั้นที่ใช้บนปุ่มและป้าย */
export function formatShortThaiDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  return `${TH_DAY[d.getDay()]} ${d.getDate()} ${TH_MON[d.getMonth()]}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** จำนวนวันจากวันนี้ (ลบ = เลยกำหนดมาแล้ว) */
export function daysFromToday(input: string | Date, now: Date = new Date()): number {
  const d = typeof input === 'string' ? new Date(input) : input;
  return Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

export interface FollowUpLabel {
  text: string;
  /** เลยกำหนดแล้ว — จอทุกที่ใช้โทนแดงกับกรณีนี้เท่านั้น */
  overdue: boolean;
  today: boolean;
}

/** ป้ายบอกนัดบนรายชื่อ/คิว — ข้อความชุดเดียวทุกจอ */
export function followUpLabel(input: string | Date | null | undefined, now: Date = new Date()): FollowUpLabel | null {
  if (!input) return null;
  const n = daysFromToday(input, now);
  if (n < 0) return { text: `เลยกำหนด ${Math.abs(n)} วัน`, overdue: true, today: false };
  if (n === 0) return { text: 'ถึงกำหนดวันนี้', overdue: false, today: true };
  if (n === 1) return { text: 'ทักพรุ่งนี้', overdue: false, today: false };
  return { text: `ทักอีกที ${formatShortThaiDate(input)}`, overdue: false, today: false };
}

/** จำนวนวันที่รอโอนมาแล้ว (นับจากวันที่ส่งลิงก์บิล) */
export function waitingDays(quoteSentAt: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!quoteSentAt) return null;
  const n = -daysFromToday(quoteSentAt, now);
  return n >= 0 ? n : null;
}
