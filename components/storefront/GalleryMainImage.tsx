// รูปหลักบนหน้าสินค้า — เป็น client island เล็ก ๆ เพื่อให้เปลี่ยนตามตัวเลือกที่ลูกค้าเลือก
//
// server HTML ยังเป็นรูปแรกของสินค้าเสมอ (SEO) — เปลี่ยนเฉพาะหลังลูกค้ากดเลือกเท่านั้น
// ฟัง event จาก AddToCartButton แทนการยกทั้งสองก้อนเป็น client เดียว หน้าจึงยังเป็น SSR ตามเดิม
'use client';

import { useEffect, useState } from 'react';
import { SF_VARIATION_IMAGE_EVENT } from '@/lib/storefront';

interface Picked { image: string | null; label: string | null }

export default function GalleryMainImage({ src, alt }: { src: string | null; alt: string }) {
  const [picked, setPicked] = useState<Picked | null>(null);

  useEffect(() => {
    const onPick = (e: Event) => {
      const d = (e as CustomEvent<Picked>).detail;
      setPicked(d?.image ? d : null);
    };
    window.addEventListener(SF_VARIATION_IMAGE_EVENT, onPick);
    return () => window.removeEventListener(SF_VARIATION_IMAGE_EVENT, onPick);
  }, []);

  const shown = picked?.image || src;
  return (
    <div className="sf-gallery-main">
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown} alt={picked?.label ? `${alt} ${picked.label}` : alt} />
      ) : <span className="sf-card-media-empty">ไม่มีรูป</span>}
    </div>
  );
}
