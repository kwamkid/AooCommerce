// Path: components/ui/SaveButton.tsx
// ปุ่มบันทึกมาตรฐาน — ไอคอน Save + variant primary + คำว่า "บันทึก" ติดมาให้แล้ว
//
// เหตุผลเดียวกับ ExportButton/ImportButton: ก่อนหน้านี้แต่ละหน้าประกอบเอง
// (บางหน้า <Button variant="primary" icon={<Save/>}>บันทึก</Button> บางหน้า
// ปุ่มเปล่าไม่มีไอคอน) ผู้ใช้เลยเจอปุ่มบันทึกหน้าตาไม่เหมือนกันในระบบเดียวกัน
//
// ห้ามใช้ปุ่มบันทึกแบบประกอบเองอีก — ถ้าต้องการอย่างอื่น (บันทึกแบบร่าง ฯลฯ)
// ให้ส่ง children เข้ามาแทนคำว่า "บันทึก" ไอคอนยังอยู่เหมือนเดิม
'use client';

import type { ReactNode } from 'react';
import { Save } from 'lucide-react';
import Button from './Button';

interface SaveButtonProps {
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit';
  className?: string;
  /** ข้อความบนปุ่ม — ไม่ส่งมา = "บันทึก" */
  children?: ReactNode;
}

export default function SaveButton({
  onClick, loading, disabled, size = 'md', type = 'button', className, children,
}: SaveButtonProps) {
  return (
    <Button
      variant="primary"
      size={size}
      type={type}
      onClick={onClick}
      loading={loading}
      disabled={disabled}
      className={className}
      icon={<Save className="w-4 h-4" />}
    >
      {children ?? 'บันทึก'}
    </Button>
  );
}
