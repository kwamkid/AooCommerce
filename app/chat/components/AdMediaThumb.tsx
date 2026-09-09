'use client';

import { useState } from 'react';
import { Megaphone, Play } from 'lucide-react';

/**
 * รูปโฆษณาจาก referral ของ Meta — ที่เดียวที่วาดรูปพวกนี้ (การ์ดหัวสายสนทนา ·
 * หัวหน้าคุย · ประวัติในแผงโปรไฟล์)
 *
 * ⚠️ URL ของ fbcdn มี `oe=` **หมดอายุราว 4 วัน** และเราไม่ได้ก๊อปเก็บไว้เอง
 * → โหลดไม่ขึ้นเมื่อไหร่ต้องตกไปเป็นกล่องไอคอนเงียบ ๆ ห้ามปล่อยรูปเสียค้างบนจอ
 *
 * ⚠️ `kind === 'video'` **ไม่ได้แปลว่า url เป็นวิดีโอ** — Meta ส่ง `video_url` มาเป็น
 * .jpg (รูปปกของวิดีโอโฆษณา) · ตัววิดีโอจริงอยู่ที่โพสต์ จึงใช้ `href` ชี้ไปโพสต์เท่านั้น
 */
export default function AdMediaThumb({
  url,
  kind,
  sizeClass,
  href,
  alt = 'โฆษณา',
}: {
  url?: string | null;
  kind?: 'photo' | 'video' | null;
  sizeClass: string;
  href?: string | null;
  alt?: string;
}) {
  // เก็บ "URL ไหนที่พัง" ไม่ใช่ธง true/false — ตัวนี้อยู่ตำแหน่งเดิมตอนสลับห้องแชท
  // ธงเปล่าจะค้างจากรูปของห้องก่อนหน้า แล้วซ่อนรูปของห้องใหม่ที่ยังโหลดได้
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = !!url && brokenUrl === url;

  const inner = !url || broken ? (
    <div className={`${sizeClass} rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0`}>
      <Megaphone className="w-1/2 h-1/2 text-blue-500 dark:text-blue-400" />
    </div>
  ) : (
    <div className={`${sizeClass} relative rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-slate-700`}>
      {/* next/image ใช้ไม่ได้ — โฮสต์ fbcdn เป็นโดเมนแบบสุ่มและรูปหมดอายุ */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="w-full h-full object-cover" onError={() => setBrokenUrl(url)} />
      {kind === 'video' && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="bg-black/55 rounded-full p-1 flex items-center justify-center">
            <Play className="w-3 h-3 text-white" fill="currentColor" />
          </span>
        </span>
      )}
    </div>
  );

  if (!href) return inner;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
      {inner}
    </a>
  );
}
