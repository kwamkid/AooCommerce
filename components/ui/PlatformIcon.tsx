// Shared social platform icon. Single source of truth for FB / LINE / IG / TikTok
// icons across chat-channels, sales-channels, and anywhere else that needs to
// indicate a connected platform. The underlying SVGs live in /public/social/.
//
// `mono` = วาดด้วย currentColor (รูปร่างเดิม สีตามตัวหนังสือ) — ใช้บนพื้นสีเช่นปุ่ม primary
// ที่โลโก้สีแบรนด์เต็มตัว (วงกลมน้ำเงินของ FB / เขียวของ LINE) จะตีกับพื้นส้ม
// (ผู้ใช้ตีกลับ 6 ก.ย. 2026) · ใช้ไฟล์ SVG เดิมเป็น CSS mask → ได้เงาของโลโก้ทาสี currentColor
// ทุกแพลตฟอร์มโดยไม่ต้องก็อป path มาไว้ในโค้ด · ยกเว้น LINE ที่ตัว L เป็น path สีขาวทับโล่
// (mask จากความทึบจะได้โล่ทึบ ๆ ไม่มี L) จึงวาด inline แล้วเจาะรูเอง
'use client';

import Image from 'next/image';
import { useId } from 'react';

export type PlatformId = 'line' | 'facebook' | 'instagram' | 'tiktok' | 'shopee' | 'lazada';

const META: Record<PlatformId, { src: string; alt: string }> = {
  line:      { src: '/social/line_oa.svg',   alt: 'LINE' },
  facebook:  { src: '/social/facebook.svg',  alt: 'Facebook' },
  instagram: { src: '/social/instagram.svg', alt: 'Instagram' },
  tiktok:    { src: '/social/tiktok.svg',    alt: 'TikTok' },
  shopee:    { src: '/marketplace/shopee.svg', alt: 'Shopee' },
  lazada:    { src: '/marketplace/lazada.svg', alt: 'Lazada' },
};

// ── LINE: path จาก /public/social/line_oa.svg (viewBox 0 0 300 300) ──
const LINE_SHIELD =
  'M149.86,0c-8.34,0-16.68.3-25,.88C75.07,4.41,44.93,13.8,30.93,19.33c-5.68,2.24-9.4,7.73-9.4,13.83v141.17c0,71.99,98.62,114.83,122.95,124.3,3.46,1.35,7.29,1.35,10.75,0,24.33-9.47,122.94-52.31,122.94-124.3V33.16c0-6.1-3.72-11.59-9.4-13.83-14-5.53-44.14-14.92-93.93-18.45-8.32-.59-16.65-.88-24.99-.88';
const LINE_L =
  'M186.21,166.6h-49.46v-89.8c0-2.79-2.26-5.05-5.05-5.05h-18.2c-2.79,0-5.05,2.26-5.05,5.05v113.06h0c0,1.37.54,2.59,1.41,3.5.02.02.05.05.07.08.02.02.05.04.08.07.91.87,2.13,1.41,3.49,1.41h72.72c2.79,0,5.05-2.26,5.05-5.05v-18.2c0-2.79-2.26-5.06-5.05-5.06';

function LineMonoGlyph({ size, title }: { size: number; title: string }) {
  // mask ต้องมี id ไม่ซ้ำ — หน้าเดียวมีไอคอน LINE ได้หลายตัว
  const maskId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 300 300" fill="currentColor" role="img" aria-label={title} className="shrink-0">
      <mask id={maskId}>
        <rect width="300" height="300" fill="#fff" />
        <path d={LINE_L} fill="#000" />
      </mask>
      <path d={LINE_SHIELD} mask={`url(#${maskId})`} />
    </svg>
  );
}

/** เงาของไฟล์ SVG ทาสี currentColor — รูปร่างมาจากความทึบของไฟล์เดิม (รู/ช่องว่างคงอยู่) */
function MaskGlyph({ src, size, title }: { src: string; size: number; title: string }) {
  const mask = `url(${src})`;
  return (
    <span
      role="img"
      aria-label={title}
      className="inline-block shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: 'currentColor',
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}

interface PlatformIconProps {
  id: PlatformId | string;
  size?: number;
  /** Override the title (tooltip) shown on hover. Defaults to the platform name. */
  title?: string;
  /** สีเดียวตาม currentColor — สำหรับวางบนพื้นสี (ปุ่ม primary) · ใช้ได้ทุกแพลตฟอร์ม */
  mono?: boolean;
}

export default function PlatformIcon({ id, size = 18, title, mono = false }: PlatformIconProps) {
  const meta = META[id as PlatformId];
  if (!meta) return null;
  if (mono) {
    return id === 'line'
      ? <LineMonoGlyph size={size} title={title ?? meta.alt} />
      : <MaskGlyph src={meta.src} size={size} title={title ?? meta.alt} />;
  }
  return <Image src={meta.src} alt={meta.alt} width={size} height={size} title={title ?? meta.alt} />;
}
