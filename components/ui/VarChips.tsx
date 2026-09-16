'use client';

/**
 * ชิป "แทรกตัวแปร" ใต้ช่องพิมพ์ — ยกมาจากโมดัลข้อความสำเร็จรูปของหน้าแชท (`SavedReplyModal`)
 * ให้ทุกที่ที่เขียนข้อความถึงลูกค้าใช้ชุดตัวแปรเดียวกัน (`lib/chat/saved-reply-vars.ts`)
 *
 * แทรกตรงตำแหน่งเคอร์เซอร์ ไม่ใช่ต่อท้าย — คนเขียนอยู่กลางประโยคจะได้ไม่ต้องย้ายเอง
 */

import type { RefObject } from 'react';
import { SAVED_REPLY_VARS, type SavedReplyVar } from '@/lib/chat/saved-reply-vars';

interface Props {
  /** ช่องที่จะแทรกลงไป — ไม่มี ref (ยังไม่ mount) ก็ต่อท้ายให้แทน */
  targetRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  /** จำกัดเฉพาะบางตัว — เช่นงานอัตโนมัติที่ไม่มี "ผู้ตอบ" */
  only?: string[];
  label?: string;
  className?: string;
}

export default function VarChips({ targetRef, value, onChange, only, label = 'แทรกตัวแปร:', className }: Props) {
  const vars: SavedReplyVar[] = only
    ? SAVED_REPLY_VARS.filter(v => only.includes(v.token))
    : SAVED_REPLY_VARS;
  if (vars.length === 0) return null;

  const insert = (token: string) => {
    const el = targetRef.current;
    if (!el) { onChange(value + token); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className || ''}`}>
      <span className="helper-text text-gray-500">{label}</span>
      {vars.map(v => (
        <button
          key={v.token}
          type="button"
          title={v.hint}
          onClick={() => insert(v.token)}
          className="helper-text px-2 py-0.5 rounded-full border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors"
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
