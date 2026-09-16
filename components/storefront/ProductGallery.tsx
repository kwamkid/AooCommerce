// แกลเลอรีรูปบนหน้าสินค้า — ปัดซ้ายขวาได้ · มีเลขบอกลำดับ · รูปจิ๋วกดได้
//
// การปัดใช้ scroll-snap ของเบราว์เซอร์ล้วน ๆ (ไม่มีไลบรารี ไม่เขียน drag เอง)
// จึงได้ momentum ของ iOS ฟรี และใช้แทร็กแพด/ล้อแนวนอนบนเดสก์ท็อปได้ด้วย
//
// SSR: หน้ายังเป็น server component — `<img>` ของทุกใบอยู่ใน HTML แรกครบ
// (ใบแรก eager ที่เหลือ lazy) ห้ามมี effect ที่ทำให้ใบแรกหายก่อน hydrate
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { thumbUrl } from '@/lib/image-thumb';
import { SF_VARIATION_PICK_EVENT } from '@/lib/storefront';

interface Picked { image: string | null; label: string | null }

export default function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [index, setIndex] = useState(0);
  /** ตัวเลือกที่ลูกค้าเพิ่งกด (มาจาก AddToCartButton) — ใช้ต่อท้าย alt และหาใบที่ต้องเลื่อนไป */
  const [picked, setPicked] = useState<Picked | null>(null);

  // ปกติรูปของทุกตัวเลือกอยู่ใน `images` อยู่แล้ว (assembleProduct รวม gallery + รูปตัวเลือกแล้ว dedup)
  // ถ้าหาไม่เจอจริง ๆ = ตกมาใช้พฤติกรรมเดิม คือเอารูปนั้นแสดงแทนใบแรก ดีกว่าปล่อยจอว่าง
  const orphan = picked?.image && !images.includes(picked.image) ? picked.image : null;
  const slides = orphan ? [orphan, ...images.slice(1)] : images;
  const count = slides.length;

  const scrollToIndex = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    // ไม่ส่ง behavior — ปล่อยให้ `scroll-behavior` ของ CSS ตัดสิน (prefers-reduced-motion ปิดให้เอง)
    el.scrollTo({ left: i * el.clientWidth });
    setIndex(i);
  }, []);

  useEffect(() => {
    const onPick = (e: Event) => {
      const d = (e as CustomEvent<Picked>).detail;
      if (!d?.image) return;
      setPicked(d);
      const i = images.indexOf(d.image);
      scrollToIndex(i >= 0 ? i : 0);
    };
    window.addEventListener(SF_VARIATION_PICK_EVENT, onPick);
    return () => window.removeEventListener(SF_VARIATION_PICK_EVENT, onPick);
  }, [images, scrollToIndex]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // อ่านใบที่เห็นอยู่จากตำแหน่งเลื่อนจริง — ครอบด้วย rAF กัน onScroll ยิงถี่ (แพตเทิร์นเดียวกับ StoreHeader)
  const onScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = trackRef.current;
      if (!el || el.clientWidth === 0) return;
      const i = Math.min(Math.max(Math.round(el.scrollLeft / el.clientWidth), 0), count - 1);
      setIndex(prev => (prev === i ? prev : i));
    });
  };

  if (count === 0) {
    return <div className="sf-gallery-empty"><span className="sf-card-media-empty">ไม่มีรูป</span></div>;
  }

  const altFor = (src: string, i: number) => {
    if (picked?.label && picked.image === src) return `${alt} ${picked.label}`;
    return i === 0 ? alt : `${alt} รูปที่ ${i + 1}`;
  };

  return (
    <div className="sf-gallery">
      <div className="sf-gallery-frame">
        <div className="sf-gallery-track" ref={trackRef} onScroll={onScroll}>
          {slides.map((src, i) => (
            // ใบที่กำลังเห็นได้คลาส .sf-gallery-current — fly-to-cart (lib/storefront-fly-to-cart.ts)
            // หารูปต้นทางของ animation จากคลาสนี้ จึงต้องเป็นใบที่ลูกค้าเห็นอยู่ ไม่ใช่ใบที่ 1 เสมอ
            <div key={src} className={`sf-gallery-slide${i === index ? ' sf-gallery-current' : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={altFor(src, i)} loading={i === 0 ? 'eager' : 'lazy'} />
            </div>
          ))}
      </div>

      {count > 1 && (
        <>
          <span className="sf-gallery-count" aria-live="polite">{index + 1}/{count}</span>
          <button
            type="button"
            className="sf-gallery-nav sf-gallery-prev"
            aria-label="รูปก่อนหน้า"
            disabled={index === 0}
            onClick={() => scrollToIndex(index - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className="sf-gallery-nav sf-gallery-next"
            aria-label="รูปถัดไป"
            disabled={index === count - 1}
            onClick={() => scrollToIndex(index + 1)}
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}
      </div>

      {count > 1 && (
        <div className="sf-gallery-thumbs">
          {slides.map((src, i) => (
            <button
              key={src}
              type="button"
              className={`sf-gallery-thumb${i === index ? ' sf-gallery-thumb-on' : ''}`}
              aria-label={`ดูรูปที่ ${i + 1}`}
              aria-current={i === index}
              onClick={() => scrollToIndex(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(src, 160)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
