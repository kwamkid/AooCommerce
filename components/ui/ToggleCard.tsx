// Path: components/ui/ToggleCard.tsx
// การ์ดตั้งค่าแบบ "เปิด/ปิด แล้วค่อยกรอกรายละเอียด"
//
// รูปแบบมาตรฐานของทั้งระบบ: หัวข้ออยู่บรรทัดเดียวกับสวิตช์เสมอ (เหมือนแถวใน
// /settings/payment-channels) — ปิดอยู่ = เห็นแค่บรรทัดเดียว, เปิดแล้วค่อย
// คลี่ช่องกรอกออกมาใต้เส้นคั่น
//
// ทำไมต้องมี component: ก่อนหน้านี้แต่ละหน้าวางเอง บางที่สวิตช์อยู่ใต้หัวข้อ
// บางที่อยู่ขวาสุดของบรรทัดคำอธิบาย ผู้ใช้ต้องกวาดตาหาสวิตช์ใหม่ทุกการ์ด
//
// ห้ามเอาไปใช้กับ toggle ที่บันทึกทันทีในรายการยาว ๆ (เช่นเปิด/ปิดคลัง) —
// นั่นคือ ListRow ที่มี actions
'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import Card from './Card';
import Toggle from './Toggle';

interface ToggleCardProps {
  /** ไอคอนหน้าหัวข้อ — ส่ง element ของ lucide มาได้เลย */
  icon?: ReactNode;
  title: string;
  /** คำอธิบายใต้หัวข้อ — บอกว่าเปิดแล้วเกิดอะไรขึ้น */
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** กำลังบันทึกสถานะสวิตช์อยู่ */
  toggling?: boolean;
  /** กำลังโหลดค่าตั้งต้น — แสดง spinner แทนเนื้อใน */
  loading?: boolean;
  /** ข้อความอธิบายตอนปิดอยู่ เช่น "ไม่มีวันหมดอายุ" */
  offHint?: string;
  /** ช่องกรอกที่จะโผล่เมื่อเปิด */
  children?: ReactNode;
}

export default function ToggleCard({
  icon, title, description, checked, onChange,
  disabled, toggling, loading, offHint, children,
}: ToggleCardProps) {
  return (
    <Card padding="md">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="text-primary flex-shrink-0 mt-0.5 [&>svg]:w-5 [&>svg]:h-5">{icon}</span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="heading-3">{title}</h2>
          {description && <p className="section-desc">{description}</p>}
        </div>
        <Toggle
          checked={checked}
          onChange={onChange}
          disabled={disabled || loading}
          loading={toggling}
          aria-label={title}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : checked && children ? (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">{children}</div>
      ) : !checked && offHint ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">{offHint}</p>
      ) : null}
    </Card>
  );
}
