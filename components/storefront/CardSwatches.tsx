// รูปใหญ่ของการ์ด + แถวรูปจิ๋วของ "ตัวเลือกแรก" (สี/ลาย) — กดแล้วรูปใหญ่สลับทันที
//
// เป็น client island เล็ก ๆ เฉพาะการ์ดที่ "มีตัวเลือกพร้อมรูป" เท่านั้น —
// การ์ดที่ไม่มี swatch ยัง render รูปตรง ๆ จาก StoreProductCard (ไม่ต้องจ่าย JS เปล่า)
//
// SEO/LCP: client component ถูก render ฝั่ง server ด้วย ดังนั้น HTML แรกมี <img>
// ของรูปปกอยู่แล้ว — state เริ่มที่ cover เสมอ ไม่ใช่รูปของตัวเลือกแรก
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { thumbUrl } from '@/lib/image-thumb';
import type { StorefrontSwatch } from '@/lib/storefront';

/** เกินจากนี้ยุบเป็นชิป +N (กดไปเลือกต่อที่หน้าสินค้า) */
const MAX_SWATCHES = 5;

interface Props {
  swatches: { name: string; items: StorefrontSwatch[] };
  /** รูปปกของสินค้า — รูปตั้งต้นของการ์ด */
  cover: string | null;
  alt: string;
  /** ลิงก์ไปหน้าสินค้า (ครอบรูปใหญ่ + ชิป +N) */
  href: string;
}

export default function CardSwatches({ swatches, cover, alt, href }: Props) {
  const [picked, setPicked] = useState<string>('');
  const shown = swatches.items.slice(0, MAX_SWATCHES);
  const extra = swatches.items.length - shown.length;
  const current = swatches.items.find(s => s.variation_id === picked);
  const image = current?.image || cover;

  return (
    <>
      <Link href={href} className="sf-card-media-link">
        <div className="sf-card-media">
          {image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={image} alt={alt} loading="lazy" />
            : <span className="sf-card-media-empty">ไม่มีรูป</span>}
        </div>
      </Link>

      <div className="sf-swatches" role="group" aria-label={swatches.name}>
        {shown.map(s => (
          <button
            key={s.variation_id}
            type="button"
            className={`sf-swatch ${s.variation_id === picked ? 'sf-swatch-on' : ''}`}
            title={s.value}
            aria-label={s.value}
            aria-pressed={s.variation_id === picked}
            onClick={e => {
              // ปุ่มอยู่นอก <a> อยู่แล้ว แต่กันไว้เผื่อการ์ดถูกห่อด้วยลิงก์ทีหลัง
              e.preventDefault();
              e.stopPropagation();
              setPicked(p => (p === s.variation_id ? '' : s.variation_id));
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl(s.image, 96)} alt="" loading="lazy" />
          </button>
        ))}
        {extra > 0 && (
          <Link href={href} className="sf-swatch-more" aria-label={`ดูตัวเลือกทั้งหมด ${swatches.items.length} แบบ`}>
            +{extra}
          </Link>
        )}
      </div>
    </>
  );
}
