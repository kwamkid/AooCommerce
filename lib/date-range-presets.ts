// ช่วงเวลาสำเร็จรูป — ทะเบียนเดียวของทั้งระบบ
//
// ใช้ 2 ที่: ปุ่มลัดใน `DateRangePicker` (วันนี้ · สัปดาห์นี้ · เดือนนี้ …) และค่าเริ่มต้น
// ของหน้า list ผ่าน `useListFilterParams({ defaultRange: 'this_month' })`
//
// ⛔ ห้ามคำนวณช่วงเวลาเองในหน้า — "เดือนนี้" ต้องแปลว่าเหมือนกันทุกที่ ไม่ใช่บางหน้า
//    นับถึงวันนี้ บางหน้านับถึงสิ้นเดือน
// สัปดาห์เริ่ม **วันจันทร์** ตามที่คนไทยใช้จริง (date-fns ตั้งต้นเป็นวันอาทิตย์)

import { endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek, subDays, subMonths } from 'date-fns';

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_week'
  | 'this_month'
  | 'last_month';

export interface DateRangePresetDef {
  key: DateRangePreset;
  label: string;
  getValue: () => { from: Date; to: Date };
}

const WEEK_OPTS = { weekStartsOn: 1 as const };

/** เรียงตามที่แสดงในปุ่มลัด — จากช่วงแคบไปกว้าง */
export const DATE_RANGE_PRESETS: DateRangePresetDef[] = [
  {
    key: 'today',
    label: 'วันนี้',
    getValue: () => { const t = startOfDay(new Date()); return { from: t, to: t }; },
  },
  {
    key: 'yesterday',
    label: 'เมื่อวาน',
    getValue: () => { const y = subDays(startOfDay(new Date()), 1); return { from: y, to: y }; },
  },
  {
    key: 'this_week',
    label: 'สัปดาห์นี้',
    getValue: () => ({ from: startOfWeek(new Date(), WEEK_OPTS), to: endOfWeek(new Date(), WEEK_OPTS) }),
  },
  {
    key: 'last_7_days',
    label: '7 วันที่แล้ว',
    getValue: () => ({ from: subDays(startOfDay(new Date()), 6), to: startOfDay(new Date()) }),
  },
  {
    key: 'last_30_days',
    label: '30 วันที่แล้ว',
    getValue: () => ({ from: subDays(startOfDay(new Date()), 29), to: startOfDay(new Date()) }),
  },
  {
    key: 'this_month',
    label: 'เดือนนี้',
    getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
  },
  {
    key: 'last_month',
    label: 'เดือนที่แล้ว',
    getValue: () => { const pm = subMonths(new Date(), 1); return { from: startOfMonth(pm), to: endOfMonth(pm) }; },
  },
];

export function getDateRangePreset(key: DateRangePreset): { from: Date; to: Date } {
  const preset = DATE_RANGE_PRESETS.find(p => p.key === key);
  if (!preset) throw new Error(`ไม่รู้จักช่วงเวลา "${key}"`);
  return preset.getValue();
}
