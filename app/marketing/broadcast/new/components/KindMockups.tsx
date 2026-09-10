// Path: app/marketing/broadcast/new/components/KindMockups.tsx
//
// มอคอัป "ห้องแชท LINE จำลอง" ของแต่ละชนิดเนื้อหาบรอดแคสต์ + ชิ้นส่วนวาดมอคที่ตัวเลือกย่อย
// (แสดงรูปแบบไหน / รูปแบบการ์ด) ใน ContentStep ใช้ร่วมกัน
//
// ทำไมต้องเป็นห้องแชททั้งใบ ไม่ใช่แท่งเทา 2 แท่ง: เจ้าของดูการ์ดเลือกชนิดแล้วบอกว่า
// "ไม่รู้ว่าประกาศหน้าตาเป็นไง โปสเตอร์เป็นไง … มันต้องเห็นรูปตรงนี้ก่อนเลย" (10 ก.ย. 2026)
// มอคจึงวาดทรงเดียวกับ BroadcastPreview (พื้นฟ้า linechat · จุดโปรไฟล์ร้าน · ฟอง/การ์ดขาว ·
// ปุ่มเขียว LINE · ป้ายลดสีแบรนด์) ด้วยเนื้อหา placeholder คงที่ — ไม่ดึงรูปของร่างที่ผู้ใช้กำลังทำ
//
// ⚠️ ข้างในห้องแชทไม่มี `dark:` โดยตั้งใจ — พื้นห้องแชทตรึงสีเดียวทั้งสองธีมเหมือน BroadcastPreview
// ฟองขาวบนพื้นฟ้าคือสิ่งที่ลูกค้าเห็นจริง ไม่ว่าแอดมินจะเปิดธีมไหน
// ⚠️ ปุ่มเป็นเขียว LINE (`bg-line`) ไม่ใช่ส้มแบรนด์ — ของจริงที่ลูกค้าเห็นเป็นเขียว
'use client';

import type { ReactNode } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { BroadcastContentKind } from '@/lib/broadcast/platforms';

// ── ชิ้นส่วนกลาง ──────────────────────────────────────────────────────────────

/**
 * รูปตัวอย่างในการ์ดตัวเลือกย่อย = **รูปของร่างที่ผู้ใช้กำลังทำอยู่จริง** ไม่ใช่รูปตัวอย่างสำเร็จรูป
 * (ใส่รูปแล้วเห็นรูปตัวเองในทั้งสองแบบเลย จึงตัดสินใจได้โดยไม่ต้องกดลองแล้วกดกลับ)
 * ยังไม่มีรูป = บล็อกเทาทรงเดียวกัน — ทรงคือสิ่งที่ต้องเทียบ ไม่ใช่ตัวรูป
 */
export function MockImage({ src, className }: { src: string | null; className: string }) {
  if (!src) return <div className={`${className} bg-gray-200 dark:bg-slate-600`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`${className} object-cover`} />;
}

/** จุดกลมแทนรูปโปรไฟล์ร้าน — บอกว่าของชิ้นนี้มาถึงลูกค้าในห้องแชท ไม่ได้ลอยอยู่เฉย ๆ */
export function MockAvatar({ size }: { size: 'sm' | 'md' }) {
  return (
    <div
      className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} rounded-full bg-gray-300 dark:bg-slate-500 flex-shrink-0`}
    />
  );
}

/**
 * แถบตัวหนังสือจำลอง
 *  muted  = ข้อความทั่วไป (ค่าเริ่มต้น)
 *  strong = หัวข้อ — เข้มกว่าเพื่อให้เห็นว่าเป็นคนละบรรทัดกับข้อความ
 */
const LINE_TONE = {
  muted: 'bg-gray-300 dark:bg-slate-500',
  strong: 'bg-gray-500 dark:bg-slate-400',
} as const;

export function MockLine({ className, tone = 'muted' }: { className?: string; tone?: keyof typeof LINE_TONE }) {
  return <div className={`h-1 rounded ${LINE_TONE[tone]} ${className || ''}`} />;
}

/**
 * บล็อกรูป — ส่ง `src` มา = วาดรูปจริง (ตัวเลือก "แสดงรูปแบบไหน" ใช้รูปที่ผู้ใช้เพิ่งอัป)
 * ไม่ส่ง = placeholder เทาพร้อมไอคอนรูปตัวเดียวกับที่หน้ารายการใช้แทนโปสเตอร์
 */
export function MockPhoto({ src, className }: { src?: string | null; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" className={`${className} object-cover`} />;
  return (
    <div className={`${className} bg-gray-200 text-gray-400 flex items-center justify-center`}>
      <ImageIcon className="w-4 h-4" />
    </div>
  );
}

/** ปุ่มบนการ์ด — ปุ่มคือจุดต่างสำคัญของโปรโมชัน/การ์ดสินค้า จึงใส่คำจริงให้เห็นว่ากดได้ */
function MockButton() {
  return (
    <div className="h-4 rounded bg-line text-white helper-text leading-none flex items-center justify-center">
      สั่งเลย
    </div>
  );
}

/** รูปโปรไฟล์ร้านในห้องแชทจำลอง = โลโก้ AOO ในวงกลมขาว (SVG จาก public — ไม่ต้องผ่าน next/image) */
function MockLogoAvatar() {
  return (
    <div className="w-5 h-5 rounded-full bg-white p-0.5 flex-shrink-0 self-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="" className="w-full h-full" />
    </div>
  );
}

/**
 * เปลือกห้องแชท: พื้นฟ้า + โปรไฟล์ร้าน แล้วตามด้วยของที่ส่ง (ไม่มีเส้นชื่อร้าน — เจ้าของขอเอาออก)
 * คอลัมน์เนื้อหาเป็น flex-col เพื่อให้แบนเนอร์โปรโมชันยืดเต็มความสูงที่เหลือได้ (`flex-1`)
 * `after` = ของที่วาด**เต็มความกว้างชนขอบ**ใต้แถว avatar (รูปเต็มจอของโปสเตอร์ — LINE ไม่เว้นขอบซ้าย
 * ข้างรูปโปรไฟล์ให้รูปแบบนี้ เจ้าของท้วงจากรูปแคปจริง 10 ก.ย. 2026)
 */
export function MockChat({ children, after }: { children?: ReactNode; after?: ReactNode }) {
  return (
    <div className="w-full h-full bg-linechat p-2 flex flex-col gap-1">
      <div className={`flex items-stretch gap-1.5 ${after ? '' : 'flex-1 min-h-0'}`}>
        <MockLogoAvatar />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {children}
        </div>
      </div>
      {after && <div className="flex-1 min-h-0 -mx-2 flex">{after}</div>}
    </div>
  );
}

/** การ์ดสินค้าหนึ่งใบ (แบบมีชื่อ+ปุ่ม) — ป้ายลดมุมซ้ายบนเป็นสีแบรนด์เหมือนของจริง */
function MockProductCard() {
  return (
    <div className="w-7/12 flex-shrink-0 rounded-lg bg-white overflow-hidden">
      <div className="relative">
        <MockPhoto className="h-12" />
        <div className="absolute top-1 left-1 h-2 w-6 rounded-full bg-primary" />
      </div>
      <div className="p-1.5 space-y-1">
        <MockLine />
        <MockLine className="w-1/2" />
        <MockButton />
      </div>
    </div>
  );
}

// ── มอคอัปต่อชนิด ─────────────────────────────────────────────────────────────

/**
 * ประกาศ = ฟองข้อความ + ฟองรูปแยกใบ · โปสเตอร์ = ฟองข้อความสั้น + รูปใบเดียวเต็มความกว้าง ·
 * โปรโมชัน = การ์ดแบนเนอร์ใหญ่ หัวข้อ ข้อความ ปุ่ม · การ์ดสินค้า = การ์ดเรียงแนวนอน ใบถัดไปโผล่ครึ่งใบ
 * (บอกว่าเลื่อนดูต่อได้) — ทั้งหมดอยู่ในงบความสูง 112px ของกรอบพรีวิว `lg`
 */
export const KIND_MOCKS: Record<BroadcastContentKind, ReactNode> = {
  announce: (
    <MockChat>
      <div className="rounded-xl rounded-tl-sm bg-white p-1.5 space-y-1">
        <MockLine />
        <MockLine className="w-2/3" />
      </div>
      <MockPhoto className="w-7/12 h-12 rounded-xl" />
    </MockChat>
  ),
  poster: (
    <MockChat after={<MockPhoto className="w-full" />}>
      <div className="rounded-xl rounded-tl-sm bg-white p-1.5">
        <MockLine className="w-2/3" />
      </div>
    </MockChat>
  ),
  promo: (
    <MockChat>
      {/* แบนเนอร์ยืดเต็มที่เหลือ (flex-1) — เจ้าของขอให้สูงใกล้ของจริง ไม่ใช่แถบบาง ๆ บนหัวการ์ด */}
      <div className="flex-1 flex flex-col rounded-xl bg-white overflow-hidden">
        <MockPhoto className="flex-1 min-h-0" />
        <div className="p-1.5 space-y-1">
          <MockLine tone="strong" className="w-3/4" />
          <MockLine />
          <MockButton />
        </div>
      </div>
    </MockChat>
  ),
  products: (
    <MockChat>
      <div className="flex gap-1 overflow-hidden">
        <MockProductCard />
        <MockProductCard />
      </div>
    </MockChat>
  ),
};
