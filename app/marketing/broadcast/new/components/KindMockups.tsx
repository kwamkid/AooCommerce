// Path: app/marketing/broadcast/new/components/KindMockups.tsx
//
// มอคอัป "ห้องแชท LINE จำลอง" ของแต่ละชนิดบล็อก — การ์ด "+ เพิ่มบล็อก" ของตัวแก้ไข (BlocksEditor) ใช้
//
// ทำไมต้องเป็นห้องแชททั้งใบ ไม่ใช่แท่งเทา 2 แท่ง: เจ้าของดูการ์ดเลือกชนิดแล้วบอกว่า
// "ไม่รู้ว่าประกาศหน้าตาเป็นไง โปสเตอร์เป็นไง … มันต้องเห็นรูปตรงนี้ก่อนเลย" (10 ก.ย. 2026)
// มอคจึงวาดทรงเดียวกับ BroadcastPreview (พื้นฟ้า linechat · จุดโปรไฟล์ร้าน · กล่อง/การ์ดขาว ·
// ปุ่มเขียว LINE · ป้ายลดสีแบรนด์) ด้วยเนื้อหา placeholder คงที่
//
// ⚠️ การ์ด · รูปเต็มจอ **ตกบรรทัดลงมาใต้รูปโปรไฟล์** ไม่ได้อยู่ข้างรูปโปรไฟล์ และรูปเต็มจอไม่มีข้อความ
// อยู่บนตัวมันเอง — เทียบกับรูปแคปจากมือถือจริงของเจ้าของ (10 ก.ย. 2026) กติกาเดียวกับ LinePhonePreview
// ⚠️ ข้างในห้องแชทไม่มี `dark:` โดยตั้งใจ — พื้นห้องแชทตรึงสีเดียวทั้งสองธีมเหมือน BroadcastPreview
// ⚠️ ปุ่มเป็นเขียว LINE (`bg-line`) ไม่ใช่ส้มแบรนด์ — ของจริงที่ลูกค้าเห็นเป็นเขียว
'use client';

import type { ReactNode } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { BroadcastBlockType } from '@/lib/broadcast/content';

// ── ชิ้นส่วนกลาง ──────────────────────────────────────────────────────────────

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

/** บล็อกรูป placeholder เทาพร้อมไอคอนรูป — ทรงคือสิ่งที่ต้องเทียบ ไม่ใช่ตัวรูป */
export function MockPhoto({ className }: { className: string }) {
  return (
    <div className={`${className} bg-gray-200 text-gray-400 flex items-center justify-center`}>
      <ImageIcon className="w-4 h-4" />
    </div>
  );
}

/** ปุ่มบนการ์ด — ใส่คำจริงให้เห็นว่ากดได้ */
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
 *  children = ของที่อยู่**ข้างรูปโปรไฟล์** (ข้อความ · รูปธรรมดา) — คอลัมน์เป็น flex-col ให้ยืดได้
 *  after    = ของที่**ตกบรรทัดลงมา**ใต้รูปโปรไฟล์ กว้างเกือบชนขอบ (การ์ด · รูปเต็มจอ)
 * ไม่ส่ง children = รูปโปรไฟล์อยู่บรรทัดของมันเองเหนือของที่ส่ง — ตรงกับรูปแคปจริง
 */
export function MockChat({ children, after }: { children?: ReactNode; after?: ReactNode }) {
  return (
    <div className="w-full h-full bg-linechat p-2 flex flex-col gap-1">
      {children ? (
        <div className={`flex items-stretch gap-1.5 ${after ? '' : 'flex-1 min-h-0'}`}>
          <MockLogoAvatar />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {children}
          </div>
        </div>
      ) : (
        <MockLogoAvatar />
      )}
      {/* การ์ด/รูปเต็มจอ — เหลือขอบซ้ายขวานิดเดียวเหมือนของจริง */}
      {after && <div className="flex-1 min-h-0 -mx-1 flex">{after}</div>}
      {/* แถบพิมพ์ข้อความของลูกค้าท้ายห้อง — บอกว่านี่คือหน้าจอแชทจริง (เจ้าของขอ 10 ก.ย.) */}
      <div className="-mx-2 -mb-2 mt-auto h-4 bg-white flex items-center gap-1 px-1.5">
        <div className="w-2 h-2 rounded-full bg-gray-300" />
        <div className="flex-1 h-2.5 rounded-full bg-gray-200" />
      </div>
    </div>
  );
}

/** การ์ดหนึ่งใบ (รูป + ชื่อ + ปุ่ม) — ย่อให้พอดีแถวที่ตกบรรทัด · ป้ายลดมุมซ้ายบนเป็นสีแบรนด์ */
function MockProductCard() {
  return (
    <div className="w-7/12 flex-shrink-0 rounded-lg bg-white overflow-hidden">
      <div className="relative">
        <MockPhoto className="h-8" />
        <div className="absolute top-1 left-1 h-2 w-6 rounded-full bg-primary" />
      </div>
      <div className="p-1.5 space-y-1">
        <MockLine />
        <MockButton />
      </div>
    </div>
  );
}

// ── มอคอัปต่อชนิดบล็อก ────────────────────────────────────────────────────────

/**
 * ข้อความ / รูป = อยู่ข้างรูปโปรไฟล์เหมือนแอดมินพิมพ์/ส่งรูปในแชท · รูปเต็มจอ = รูปใบเดียวเต็มความกว้าง
 * ไม่มีข้อความบนรูป · การ์ด = การ์ดเรียงแนวนอน ใบถัดไปโผล่ครึ่งใบ (บอกว่าเลื่อนดูต่อได้)
 * — ทั้งหมดอยู่ในกรอบพรีวิว `lg` สูง 128px ของ OptionCards
 */
export const BLOCK_MOCKS: Record<BroadcastBlockType, ReactNode> = {
  text: (
    <MockChat>
      <div className="rounded-xl rounded-tl-sm bg-white p-1.5 space-y-1">
        <MockLine />
        <MockLine className="w-2/3" />
      </div>
    </MockChat>
  ),
  image: <MockChat><MockPhoto className="w-7/12 h-14 rounded-xl" /></MockChat>,
  rich: <MockChat after={<MockPhoto className="w-full rounded" />} />,
  cards: (
    <MockChat
      after={
        <div className="flex gap-1 w-full overflow-hidden items-start">
          <MockProductCard />
          <MockProductCard />
        </div>
      }
    />
  ),
};
