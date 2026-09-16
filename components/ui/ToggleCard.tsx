// Path: components/ui/ToggleCard.tsx
// การ์ดตั้งค่าแบบ "เปิด/ปิด แล้วค่อยกรอกรายละเอียด"
//
// รูปแบบมาตรฐานของทั้งระบบ: หัวข้ออยู่บรรทัดเดียวกับสวิตช์เสมอ (เหมือนแถวใน
// /settings/payment-channels) — ปิดอยู่ = เห็นแค่บรรทัดเดียว, เปิดแล้วค่อย
// คลี่ช่องกรอกออกมาใต้เส้นคั่น
//
// ทำไมต้องมี component: ก่อนหน้านี้แต่ละหน้าวางเอง บางที่สวิตช์อยู่ใต้หัวข้อ
// บางที่อยู่ขวาสุดของบรรทัดคำอธิบาย ผู้ใช้ต้องกวาดตาหาสวิตช์ใหม่ทุกการ์ด
// (หน้า Feature เสริม เคยวาดเองด้วย `<div className="card">` ดิบที่ไม่มี padding
//  ติดมาเลย ระยะห่างจึงไม่เหมือนหน้าอื่นทั้งระบบ — ย้ายมาใช้ตัวนี้แล้ว)
//
// ห้ามเอาไปใช้กับ toggle ที่บันทึกทันทีในรายการยาว ๆ (เช่นเปิด/ปิดคลัง) —
// นั่นคือ ListRow ที่มี actions
'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import Card from './Card';
import Toggle from './Toggle';

interface ToggleCardProps {
  /** ไอคอนหน้าหัวข้อ — ส่ง element ของ lucide มาได้เลย */
  icon?: ReactNode;
  /** สีไอคอน (คลาส Tailwind) — ไม่ส่ง = สีแบรนด์ · ส่งมาเมื่อแต่ละการ์ดมีสีประจำตัว */
  iconClass?: string;
  title: string;
  /** คำอธิบายใต้หัวข้อ — บอกว่าเปิดแล้วเกิดอะไรขึ้น */
  description?: string;
  /** ป้ายข้างหัวข้อ เช่น InfoChip "ต้องอัปเกรด" */
  badge?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** กำลังบันทึกสถานะสวิตช์อยู่ */
  toggling?: boolean;
  /** กำลังโหลดค่าตั้งต้น — แสดง spinner แทนเนื้อใน */
  loading?: boolean;
  /** ข้อความอธิบายตอนปิดอยู่ เช่น "ไม่มีวันหมดอายุ" */
  offHint?: string;
  /** ขอบสีแบรนด์จาง ๆ ตอนเปิดอยู่ — ใช้เมื่อการ์ดเรียงกันหลายใบ จะได้เห็นว่าใบไหนเปิด */
  highlight?: boolean;
  /** โหมดพับเก็บเองได้ — ส่ง open คู่ onOpenChange เมื่ออยากให้มีปุ่มกาง
   *  ไม่ส่ง = คลี่อัตโนมัติทันทีที่เปิดสวิตช์ (พฤติกรรมเดิม) */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  /** คลาสเพิ่มของการ์ด เช่น opacity ตอนใช้ไม่ได้ */
  className?: string;
  /** ช่องกรอกที่จะโผล่เมื่อเปิด */
  children?: ReactNode;
  /**
   * ปุ่มข้างสวิตช์ เช่น "ตั้งค่า" ที่พาไปหน้าตั้งค่าของฟีเจอร์นั้น
   * — ใช้แทนการยัดฟอร์มตั้งค่าทั้งก้อนมาไว้ในการ์ด (หน้ารวมฟีเจอร์จะได้ไม่บวม)
   * แสดงเฉพาะตอนสวิตช์เปิดอยู่ เพราะปิดอยู่ก็ไม่มีอะไรให้ตั้ง
   */
  action?: ReactNode;
}

export default function ToggleCard({
  icon, iconClass, title, description, badge, checked, onChange,
  disabled, toggling, loading, offHint, highlight,
  open, onOpenChange, className = '', children, action,
}: ToggleCardProps) {
  // ผู้เรียกคุมการกางเอง = มีปุ่มกาง · ไม่คุม = เปิดสวิตช์แล้วคลี่เลย
  const collapsible = onOpenChange !== undefined;
  const showChildren = collapsible ? checked && open : checked;

  return (
    <Card
      padding="md"
      className={`transition-all ${highlight && checked ? 'ring-1 ring-primary/20' : ''} ${className}`}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <span className={`flex-shrink-0 mt-0.5 [&>svg]:w-5 [&>svg]:h-5 ${iconClass ?? 'text-primary'}`}>
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="heading-3">{title}</h2>
            {badge}
          </div>
          {description && <p className="section-desc">{description}</p>}
        </div>

        {action && checked && (
          <div className="flex-shrink-0">{action}</div>
        )}

        {collapsible && checked && children && (
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-label={open ? 'พับเก็บการตั้งค่า' : 'กางดูการตั้งค่า'}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 transition-colors"
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}

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
      ) : showChildren && children ? (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">{children}</div>
      ) : !checked && offHint ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">{offHint}</p>
      ) : null}
    </Card>
  );
}
