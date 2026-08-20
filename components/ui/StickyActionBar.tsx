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
  /** ข้อความฝั่งซ้าย — ใส่มาเองเพื่อทับข้อความสถานะอัตโนมัติ */
  children?: ReactNode;
}

export default function StickyActionBar({
  onSave, saving = false, dirty, disabled = false,
  onCancel, saveLabel = 'บันทึก', cancelLabel = 'ยกเลิก',
  extraActions, children,
}: StickyActionBarProps) {
  const tracked = dirty !== undefined;
  const hint = children
    ?? (tracked ? (dirty ? 'มีการแก้ไขที่ยังไม่ได้บันทึก' : 'ยังไม่มีการแก้ไข') : null);

  return (
    <div className="sticky-actions">
      <div className="sticky-actions-inner">
        <div className="min-w-0 subtitle-text text-gray-500 dark:text-slate-400">{hint}</div>
        <div className="flex items-center justify-end gap-3 flex-shrink-0">
          {onCancel && (
            <Button variant="secondary" disabled={saving} onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          {extraActions}
          <SaveButton
            loading={saving}
            disabled={disabled || (tracked && !dirty)}
            onClick={onSave}
          >
            {saveLabel}
          </SaveButton>
        </div>
      </div>
    </div>
  );
}
