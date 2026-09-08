// Path: components/chat/SavedReplyText.tsx
//
// แสดงข้อความของ Saved Reply โดยวาดตัวแปร (`{{ชื่อลูกค้า}}`) เป็น **ชิป** ไม่ใช่ตัวหนังสือดิบ
//
// เหตุผล: ปีกกาสองชั้นเป็นไวยากรณ์ของโปรแกรม คนอ่านแล้วสะดุด — พอเป็นชิปจะเห็นทันทีว่า
// "ตรงนี้ระบบเติมให้" ไม่ใช่ข้อความที่จะถูกส่งออกไปจริง ๆ
//
// ใช้ทั้งป๊อปอัปในหน้าแชทและรายการในหน้าจัดการ — ทะเบียนตัวแปรอ่านจาก saved-reply-vars.ts
// ที่เดียวเหมือนเดิม เพิ่มตัวแปรใหม่ที่นั่นแล้วที่นี่รู้จักเอง
'use client';

import { Fragment } from 'react';
import { SAVED_REPLY_VARS } from '@/lib/chat/saved-reply-vars';

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** วงเล็บจับกลุ่มไว้ เพื่อให้ split() คืนตัวคั่น (ตัวโทเคน) กลับมาด้วย */
const TOKEN_SPLIT = new RegExp(`(${SAVED_REPLY_VARS.map(v => escapeRe(v.token)).join('|')})`, 'g');
const LABEL_OF = new Map(SAVED_REPLY_VARS.map(v => [v.token, v.label]));

export default function SavedReplyText({ text }: { text: string }) {
  if (!text) return null;
  // ไม่มีตัวแปรก็คืนข้อความตรง ๆ ไม่ต้องสร้าง element ย่อยให้เปลือง
  if (!SAVED_REPLY_VARS.some(v => text.includes(v.token))) return <>{text}</>;

  return (
    <>
      {text.split(TOKEN_SPLIT).map((part, i) => {
        const label = LABEL_OF.get(part);
        return label
          ? <span key={i} className="var-chip">{label}</span>
          : <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
