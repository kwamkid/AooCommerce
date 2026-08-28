// แถบปุ่มบันทึกที่ติดขอบล่างจอตลอด
//
// ฟอร์มยาวกว่าหนึ่งหน้าจอเสมอ ปุ่มบันทึกที่อยู่ท้ายฟอร์มจึงมองไม่เห็น
// จนกว่าจะเลื่อนลงไปสุด — แก้ช่องบนสุดแล้วต้องเลื่อนยาวลงมากดบันทึก
//
// เลือกให้ "โผล่ตลอด" ไม่ใช่ "โผล่เมื่อมีการแก้ไข" เพราะแถบที่เด้งเข้าเด้งออก
// ทำให้เนื้อหาขยับใต้มือผู้ใช้ · ตอนยังไม่แก้อะไรก็แค่ปิดปุ่มไว้พร้อมบอกเหตุผล
'use client';

import type { ReactNode } from 'react';
import Button from './Button';
import SaveButton from './SaveButton';

interface StickyActionBarProps {
  onSave: () => void;
  saving?: boolean;
  /**
   * มีอะไรเปลี่ยนรอบันทึกอยู่ไหม — ไม่มีก็ปิดปุ่มไว้ ไม่ใช่ซ่อนแถบ
   *
   * ไม่ส่งมา = หน้านั้นยังไม่ได้ติดตาม dirty (เช่นฟอร์มสร้างใหม่) → เปิดปุ่มไว้
   * และ **ไม่ขึ้นข้อความสถานะ** เพราะเราไม่รู้จริงว่ามีการแก้หรือยัง
   * การเดาแล้วเขียน "มีการแก้ไขที่ยังไม่ได้บันทึก" ทั้งที่เพิ่งเปิดหน้ามา
   * คือการโกหกผู้ใช้ในจุดที่เขาเชื่อถือที่สุด
   */
  dirty?: boolean;
  /** ปิดปุ่มบันทึกด้วยเหตุอื่นนอกจาก dirty เช่นกรอกไม่ครบ */
  disabled?: boolean;
  onCancel?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  /** ปุ่มเพิ่มเติมฝั่งซ้ายของปุ่มบันทึก เช่น "บันทึกแบบร่าง" */
  extraActions?: ReactNode;
  /**
   * ปุ่มหลักที่ไม่ใช่ "บันทึก" — ส่งมาแล้ว render แทน `SaveButton` (เช่น "ถัดไป" ของ wizard)
   *
   * ไม่ส่ง (`undefined`) = ปุ่มบันทึกตามเดิม · ส่ง `null` = ไม่มีปุ่มหลักเลย
   * (โหมดอ่านอย่างเดียวที่ยังต้องมีแถบไว้โชว์ยอด + ปุ่มย้อนกลับ)
   */
  primary?: ReactNode;
  /**
   * แถบอยู่ในกล่องที่ padding คงที่ 1rem ทุกขนาดจอ (panel แชท) ไม่ใช่ page layout
   *
   * ค่าเริ่มต้นของ `.sticky-actions` หักระยะขอบ **ตาม viewport** (-1rem / -1.5rem ที่ ≥1024px)
   * เพราะออกแบบมาให้พอดีกับ `p-4 lg:p-6` ของ Layout · panel แชทกว้างเท่าไรก็ยัง `p-4`
   * อยู่ดี ใช้ค่าเดิมบนจอใหญ่แถบจะล้นออกนอก panel ข้างละ 8px
   */
  inset?: boolean;
  /** ข้อความฝั่งซ้าย — ใส่มาเองเพื่อทับข้อความสถานะอัตโนมัติ */
  children?: ReactNode;
}

export default function StickyActionBar({
  onSave, saving = false, dirty, disabled = false,
  onCancel, saveLabel = 'บันทึก', cancelLabel = 'ยกเลิก',
  extraActions, primary, inset = false, children,
}: StickyActionBarProps) {
  const tracked = dirty !== undefined;
  const hint = children
    ?? (tracked ? (dirty ? 'มีการแก้ไขที่ยังไม่ได้บันทึก' : 'ยังไม่มีการแก้ไข') : null);

  return (
    <div className={`sticky-actions${inset ? ' sticky-actions-inset' : ''}`}>
      <div className="sticky-actions-inner">
        <div className="min-w-0 subtitle-text text-gray-500 dark:text-slate-400">{hint}</div>
        <div className="flex items-center justify-end gap-3 flex-shrink-0">
          {onCancel && (
            <Button variant="secondary" disabled={saving} onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          {extraActions}
          {primary !== undefined ? primary : (
            <SaveButton
              loading={saving}
              disabled={disabled || (tracked && !dirty)}
              onClick={onSave}
            >
              {saveLabel}
            </SaveButton>
          )}
        </div>
      </div>
    </div>
  );
}
