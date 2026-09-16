// ราคาบนหน้าสินค้า — เปลี่ยนเป็นราคาของตัวเลือกที่ลูกค้ากดเลือก
//
// ตั้งต้นเป็นค่าที่ server ส่งมา (ช่วงราคา หรือราคาเดียว) แล้วฟัง
// SF_VARIATION_PICK_EVENT จาก AddToCartButton — กดเลือกแล้วเห็นราคาของแบบนั้นทันที
// จึงไม่ต้องพิมพ์ราคาไว้บนปุ่มตัวเลือกทุกอัน (ปุ่มยาวจนตกบรรทัดบนมือถือ)
//
// SSR: client component ถูก render ฝั่ง server ด้วย ช่วงราคาจึงอยู่ใน HTML แรกครบ
// (สำคัญกับ SEO — ราคาคือสิ่งที่ Google/AI หยิบไปแสดง)
'use client';

import { useEffect, useState } from 'react';
import {
  formatStorePrice, SF_VARIATION_PICK_EVENT, type StorefrontVariationPick,
} from '@/lib/storefront';

interface Props {
  priceMin: number;
  priceMax: number;
}

export default function DetailPrice({ priceMin, priceMax }: Props) {
  const [picked, setPicked] = useState<StorefrontVariationPick | null>(null);

  useEffect(() => {
    const onPick = (e: Event) => setPicked((e as CustomEvent<StorefrontVariationPick>).detail ?? null);
    window.addEventListener(SF_VARIATION_PICK_EVENT, onPick);
    return () => window.removeEventListener(SF_VARIATION_PICK_EVENT, onPick);
  }, []);

  const hasRange = priceMax > priceMin;

  return (
    <div className="sf-detail-price">
      {picked ? (
        <>
          {formatStorePrice(picked.price)}
          {/* ราคาก่อนลดของแบบที่เลือก — ขีดฆ่าไว้ให้เห็นว่าลดลงมาเท่าไหร่ */}
          {picked.compare_at != null && picked.compare_at > picked.price && (
            <span className="sf-card-compare">{formatStorePrice(picked.compare_at)}</span>
          )}
        </>
      ) : hasRange ? (
        `${formatStorePrice(priceMin)}–${formatStorePrice(priceMax)}`
      ) : (
        formatStorePrice(priceMin)
      )}
    </div>
  );
}
