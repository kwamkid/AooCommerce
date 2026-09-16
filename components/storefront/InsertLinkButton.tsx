// Path: components/storefront/InsertLinkButton.tsx
//
// ปุ่ม "แทรกลิงก์หน้าร้าน" + โมดัลเลือก — ก้อนเดียวจบสำหรับช่องพิมพ์ที่เป็น textarea/input
// ใช้ที่: ข้อความสำเร็จรูป · ข้อความคูปองของการ์ดชวนรับข่าวสาร
// (กล่องพิมพ์หน้าแชทใช้ `StorefrontLinkModal` ตรง ๆ เพราะปุ่มอยู่ในแถบไอคอนของตัวเอง)
//
// ⛔ **ยังไม่เปิดหน้าร้าน = ไม่วาดปุ่มเลย** ไม่ใช่วาดแล้วกดไม่ได้ — ร้านที่ไม่ได้ใช้หน้าร้าน
// ไม่ต้องเห็นของที่ใช้ไม่ได้ (เจ้าของกำหนด 16 ก.ย. 2026)

'use client';

import { useState, type RefObject } from 'react';
import { Link2 } from 'lucide-react';
import StorefrontLinkModal from './StorefrontLinkModal';
import { useStorefrontLinks } from '@/lib/useStorefrontLinks';
import { insertAtCursor } from '@/lib/insert-at-cursor';

interface Props {
  targetRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}

export default function InsertLinkButton({ targetRef, value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const links = useStorefrontLinks();

  if (!links.enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`helper-text inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors ${className || ''}`}
      >
        <Link2 className="w-3 h-3" />
        ลิงก์หน้าร้าน
      </button>
      <StorefrontLinkModal
        open={open}
        onClose={() => setOpen(false)}
        // เว้นวรรคนำหน้าเมื่อตัวก่อนหน้าไม่ใช่ช่องว่าง — ลิงก์ที่ติดกับตัวอักษรจะกดไม่ขึ้นในแอปแชท
        onPick={url => onChange(insertAtCursor(targetRef.current, value, spacedLink(targetRef.current, value, url)))}
      />
    </>
  );
}

/** ลิงก์ต้องมีช่องว่างคั่นหัวท้าย ไม่งั้น LINE/Messenger กลืนตัวอักษรข้างเคียงเข้าไปใน URL */
function spacedLink(
  el: HTMLTextAreaElement | HTMLInputElement | null,
  value: string,
  url: string,
): string {
  const at = el?.selectionStart ?? value.length;
  const before = value.slice(0, at);
  const after = value.slice(el?.selectionEnd ?? at);
  const needsLeading = before.length > 0 && !/\s$/.test(before);
  const needsTrailing = after.length > 0 && !/^\s/.test(after);
  return `${needsLeading ? ' ' : ''}${url}${needsTrailing ? ' ' : ''}`;
}
