// แถบปุ่มบันทึกที่ติดขอบล่างจอตลอด
//
// ฟอร์มตั้งค่ายาวกว่าหนึ่งหน้าจอเสมอ ปุ่มบันทึกที่อยู่ท้ายฟอร์มจึงมองไม่เห็น
// จนกว่าจะเลื่อนลงไปสุด — แก้ช่องบนสุดแล้วต้องเลื่อนยาวลงมากดบันทึก
//
// เลือกให้ "โผล่ตลอด" ไม่ใช่ "โผล่เมื่อมีการแก้ไข" เพราะแถบที่เด้งเข้าเด้งออก
// ทำให้เนื้อหาขยับใต้มือผู้ใช้ · ตอนยังไม่แก้อะไรก็แค่ปิดปุ่มไว้พร้อมบอกเหตุผล
'use client';

import type { ReactNode } from 'react';
import Button from './Button';

interface StickyActionBarProps {
  onSave: () => void;
  saving?: boolean;
  /** มีอะไรเปลี่ยนรอบันทึกอยู่ไหม — ไม่มีก็ปิดปุ่มไว้ ไม่ใช่ซ่อนแถบ */
  dirty?: boolean;
  onCancel?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  /** ข้อความฝั่งซ้าย เช่น เตือนว่ายังไม่ได้บันทึก */
  children?: ReactNode;
}

export default function StickyActionBar({
  onSave, saving = false, dirty = true,
  onCancel, saveLabel = 'บันทึก', cancelLabel = 'ยกเลิก',
  children,
}: StickyActionBarProps) {
  return (
    <div className="sticky-actions">
      <div className="sticky-actions-inner">
        <div className="min-w-0 subtitle-text text-gray-500 dark:text-slate-400">
          {children ?? (dirty ? 'มีการแก้ไขที่ยังไม่ได้บันทึก' : 'ยังไม่มีการแก้ไข')}
        </div>
        <div className="flex justify-end gap-3 flex-shrink-0">
          {onCancel && (
            <Button variant="secondary" disabled={saving || !dirty} onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          <Button variant="primary" loading={saving} disabled={!dirty} onClick={onSave}>
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
