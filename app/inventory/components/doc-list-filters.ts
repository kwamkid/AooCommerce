// รูปร่างตัวกรองร่วมของหน้าเอกสารคลัง 5 หน้า
// (รับเข้า · เบิกออก · โอนย้าย · คืน supplier · ใบสั่งซื้อ)
//
// ตัวกรองจริงใช้ของกลาง `useListFilterParams` + `<ListFilters>` เหมือนหน้า list อื่นทั้งระบบ
// — ไฟล์นี้เหลือแค่ "ชุดช่องที่ห้าหน้านี้ใช้เหมือนกัน" กับตัวแปลงรายชื่อผู้ทำรายการ
//
// ⚠️ เรียก `docListFields()` **ที่ระดับโมดูล** (นอก component) — object ใหม่ทุก render
//    ทำให้ hook คำนวณรูปร่างช่องใหม่ทุกรอบโดยไม่จำเป็น

import type { FormSelectOption } from '@/components/ui/FormSelect';
import type { ListFilterField } from '@/lib/useListFilterParams';

/** ช่วงวันที่เริ่มต้นของหน้าเอกสารคลัง = 30 วันล่าสุด (ไม่เขียนลง URL) */
export const DOC_LIST_RANGE_DAYS = 30;

export interface DocListUser {
  id: string;
  name: string;
}

/**
 * ช่องมาตรฐาน: ค้นหา · คลัง · สถานะ · ผู้ทำรายการ · ช่วงวันที่
 * @param defaultStatus แท็บสถานะเริ่มต้นของหน้านั้น (โอนย้ายเริ่มที่ `pending`)
 * @param extraKeys     ช่องเฉพาะหน้า เช่น `sup` (ซัพพลายเออร์ของใบสั่งซื้อ)
 */
export function docListFields(
  defaultStatus = 'all',
  extraKeys: string[] = [],
): Record<string, ListFilterField> {
  const fields: Record<string, ListFilterField> = {
    q: { type: 'text' },
    wh: { type: 'select' },
    status: { type: 'select', default: defaultStatus },
    by: { type: 'select' },
    from: { type: 'date' },
    to: { type: 'date' },
  };
  for (const key of extraKeys) fields[key] = { type: 'select' };
  return fields;
}

/** ชุดช่องของหน้าที่ไม่มีอะไรพิเศษ — ใช้ตรง ๆ ได้เลย */
export const DOC_LIST_FIELDS = docListFields();

/** รายชื่อผู้ทำรายการจาก API → ตัวเลือกของ `FilterUser` */
export function docListUserOptions(users: DocListUser[]): FormSelectOption[] {
  return users.map(u => ({ id: u.id, label: u.name }));
}
