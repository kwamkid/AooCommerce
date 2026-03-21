/**
 * Shared status tab color config — ใช้ทั้งระบบ
 * ทุกหน้าที่มี tab filter ให้ดึงสีจากที่นี่
 */
export interface StatusTabColor {
  active: string;
  inactive: string;
  labelColor: string;
  countColor: string;
}

const STATUS_TAB_COLORS: Record<string, StatusTabColor> = {
  // ทั้งหมด
  all:              { active: 'bg-indigo-600',  inactive: 'bg-indigo-50 dark:bg-indigo-950/50',   labelColor: 'text-indigo-600 dark:text-indigo-400',   countColor: 'text-indigo-700 dark:text-indigo-300' },
  // ใหม่ / แบบร่าง
  new:              { active: 'bg-blue-600',    inactive: 'bg-blue-50 dark:bg-blue-950/50',       labelColor: 'text-blue-600 dark:text-blue-400',       countColor: 'text-blue-700 dark:text-blue-300' },
  draft:            { active: 'bg-blue-600',    inactive: 'bg-blue-50 dark:bg-blue-950/50',       labelColor: 'text-blue-600 dark:text-blue-400',       countColor: 'text-blue-700 dark:text-blue-300' },
  // รอคอนเฟิร์ม / รอกดรับ / รอยืนยัน
  ready_to_ship:    { active: 'bg-orange-500',  inactive: 'bg-orange-50 dark:bg-orange-950/50',   labelColor: 'text-orange-600 dark:text-orange-400',   countColor: 'text-orange-700 dark:text-orange-300' },
  pending_confirm:  { active: 'bg-orange-500',  inactive: 'bg-orange-50 dark:bg-orange-950/50',   labelColor: 'text-orange-600 dark:text-orange-400',   countColor: 'text-orange-700 dark:text-orange-300' },
  received:         { active: 'bg-orange-500',  inactive: 'bg-orange-50 dark:bg-orange-950/50',   labelColor: 'text-orange-600 dark:text-orange-400',   countColor: 'text-orange-700 dark:text-orange-300' }, // consignment "รอยืนยัน"
  // ที่ต้องจัดส่ง
  processing:       { active: 'bg-indigo-500',  inactive: 'bg-indigo-50 dark:bg-indigo-950/50',   labelColor: 'text-indigo-500 dark:text-indigo-400',   countColor: 'text-indigo-700 dark:text-indigo-300' },
  pending:          { active: 'bg-indigo-500',  inactive: 'bg-indigo-50 dark:bg-indigo-950/50',   labelColor: 'text-indigo-500 dark:text-indigo-400',   countColor: 'text-indigo-700 dark:text-indigo-300' }, // replenishment "ที่ต้องจัดส่ง"
  // กำลังส่ง
  shipping:         { active: 'bg-amber-500',   inactive: 'bg-amber-50 dark:bg-amber-950/50',     labelColor: 'text-amber-600 dark:text-amber-400',     countColor: 'text-amber-700 dark:text-amber-300' },
  shipped:          { active: 'bg-amber-500',   inactive: 'bg-amber-50 dark:bg-amber-950/50',     labelColor: 'text-amber-600 dark:text-amber-400',     countColor: 'text-amber-700 dark:text-amber-300' },
  // สำเร็จ / ชำระแล้ว / รับแล้ว / ยืนยันแล้ว
  completed:        { active: 'bg-emerald-600', inactive: 'bg-emerald-50 dark:bg-emerald-950/50', labelColor: 'text-emerald-600 dark:text-emerald-400', countColor: 'text-emerald-700 dark:text-emerald-300' },
  paid:             { active: 'bg-emerald-600', inactive: 'bg-emerald-50 dark:bg-emerald-950/50', labelColor: 'text-emerald-600 dark:text-emerald-400', countColor: 'text-emerald-700 dark:text-emerald-300' },
  confirmed:        { active: 'bg-emerald-600', inactive: 'bg-emerald-50 dark:bg-emerald-950/50', labelColor: 'text-emerald-600 dark:text-emerald-400', countColor: 'text-emerald-700 dark:text-emerald-300' },
  // วางบิลแล้ว / รอชำระ (statements)
  billed:           { active: 'bg-blue-600',    inactive: 'bg-blue-50 dark:bg-blue-950/50',       labelColor: 'text-blue-600 dark:text-blue-400',       countColor: 'text-blue-700 dark:text-blue-300' },
  sent:             { active: 'bg-blue-600',    inactive: 'bg-blue-50 dark:bg-blue-950/50',       labelColor: 'text-blue-600 dark:text-blue-400',       countColor: 'text-blue-700 dark:text-blue-300' },
  invoiced:         { active: 'bg-blue-600',    inactive: 'bg-blue-50 dark:bg-blue-950/50',       labelColor: 'text-blue-600 dark:text-blue-400',       countColor: 'text-blue-700 dark:text-blue-300' },
  // ชำระบางส่วน
  partially_paid:   { active: 'bg-amber-500',   inactive: 'bg-amber-50 dark:bg-amber-950/50',     labelColor: 'text-amber-600 dark:text-amber-400',     countColor: 'text-amber-700 dark:text-amber-300' },
  // เกินกำหนด
  overdue:          { active: 'bg-red-500',     inactive: 'bg-red-50 dark:bg-red-950/50',         labelColor: 'text-red-500 dark:text-red-400',         countColor: 'text-red-600 dark:text-red-300' },
  // ยกเลิก
  cancelled:        { active: 'bg-gray-500',    inactive: 'bg-gray-100 dark:bg-gray-800',         labelColor: 'text-gray-500 dark:text-gray-400',       countColor: 'text-gray-600 dark:text-gray-300' },
  // รับครบ / partial (replenishment)
  partial_received: { active: 'bg-emerald-600', inactive: 'bg-emerald-50 dark:bg-emerald-950/50', labelColor: 'text-emerald-600 dark:text-emerald-400', countColor: 'text-emerald-700 dark:text-emerald-300' },
};

/** Get tab color config by status key — fallback to gray */
export function getTabColor(key: string): StatusTabColor {
  return STATUS_TAB_COLORS[key] || STATUS_TAB_COLORS.cancelled;
}

/**
 * Badge colors — ล้อตาม tab สีเดียวกัน
 * Returns: { color: 'text-xxx', bg: 'bg-xxx' }
 */
const STATUS_BADGE_COLORS: Record<string, { color: string; bg: string }> = {
  new:              { color: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-100 dark:bg-blue-900/40' },
  draft:            { color: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-100 dark:bg-blue-900/40' },
  ready_to_ship:    { color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' },
  pending_confirm:  { color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' },
  received:         { color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' },
  processing:       { color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  pending:          { color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  shipping:         { color: 'text-amber-700 dark:text-amber-300',  bg: 'bg-amber-100 dark:bg-amber-900/40' },
  shipped:          { color: 'text-amber-700 dark:text-amber-300',  bg: 'bg-amber-100 dark:bg-amber-900/40' },
  completed:        { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  paid:             { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  confirmed:        { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  partial_received: { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  billed:           { color: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-100 dark:bg-blue-900/40' },
  sent:             { color: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-100 dark:bg-blue-900/40' },
  invoiced:         { color: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-100 dark:bg-blue-900/40' },
  partially_paid:   { color: 'text-amber-700 dark:text-amber-300',  bg: 'bg-amber-100 dark:bg-amber-900/40' },
  overdue:          { color: 'text-red-700 dark:text-red-300',      bg: 'bg-red-100 dark:bg-red-900/40' },
  cancelled:        { color: 'text-gray-600 dark:text-gray-400',    bg: 'bg-gray-100 dark:bg-gray-700/40' },
};

/** Get badge color by status key */
export function getBadgeColor(key: string): { color: string; bg: string } {
  return STATUS_BADGE_COLORS[key] || STATUS_BADGE_COLORS.cancelled;
}

export default STATUS_TAB_COLORS;
