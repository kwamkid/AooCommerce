// Path: lib/month-options.ts
//
// ตัวเลือก "เดือน" ของตัวกรองหน้าเอกสารบัญชี — 12 เดือนย้อนหลังนับจากเดือนปัจจุบัน
//
// เดิมฟังก์ชันนี้ถูกก๊อปไว้ใน 5 หน้าเหมือนกันทุกตัวอักษร (ใบเสร็จ · ใบกำกับภาษี ·
// ใบกำกับอย่างย่อ · ใบส่งสินค้า · ใบแจ้งหนี้) — ยุบมาที่เดียว
//
// คืนรูป `{ id, label }` ให้ตรงกับ FormSelectOption จึงส่งเข้า <FormSelect> ได้ตรง ๆ
// (`id` = ค่าที่ยิงเป็น query `month` รูปแบบ YYYYMM · ค่าว่าง = ทุกเดือน)

import type { FormSelectOption } from '@/components/ui/FormSelect';

export function getMonthOptions(): FormSelectOption[] {
  const opts: FormSelectOption[] = [{ id: '', label: 'ทุกเดือน' }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    opts.push({ id: `${y}${m}`, label: d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' }) });
  }
  return opts;
}
