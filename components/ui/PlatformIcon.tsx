// Shared social platform icon. Single source of truth for FB / LINE / IG / TikTok
// icons across chat-channels, sales-channels, and anywhere else that needs to
// indicate a connected platform. The underlying SVGs live in /public/social/.
//
// `mono` = วาดด้วย currentColor (รูปร่างเดิม สีตามตัวหนังสือ) — ใช้บนพื้นสีเช่นปุ่ม primary
// ที่โลโก้สีแบรนด์เต็มตัว (วงกลมน้ำเงินของ FB / เขียวของ LINE) จะตีกับพื้นส้ม
// (ผู้ใช้ตีกลับ 6 ก.ย. 2026) · path ก็อปมาจากไฟล์ใน /public/social/ ตัวเดียวกัน
// รองรับ line / facebook / instagram · แพลตฟอร์มอื่นตกไปใช้รูปสีปกติ
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

// ── path ของ glyph สีเดียว (viewBox 0 0 300 300 เท่าไฟล์ต้นฉบับ) ──
const FB_PATH =
  'M300.28,151.19C300.28,68.19,233,.91,150,.91S-.28,68.19-.28,151.19c0,75.01,54.96,137.18,126.8,148.46v-105.01h-38.16v-43.44h38.16v-33.11c0-37.66,22.44-58.47,56.76-58.47,16.44,0,33.64,2.94,33.64,2.94v36.98h-18.95c-18.67,0-24.49,11.58-24.49,23.47v28.19h41.68l-6.66,43.44h-35.02v105.01c71.84-11.27,126.8-73.45,126.8-148.45';
const LINE_SHIELD =
  'M149.86,0c-8.34,0-16.68.3-25,.88C75.07,4.41,44.93,13.8,30.93,19.33c-5.68,2.24-9.4,7.73-9.4,13.83v141.17c0,71.99,98.62,114.83,122.95,124.3,3.46,1.35,7.29,1.35,10.75,0,24.33-9.47,122.94-52.31,122.94-124.3V33.16c0-6.1-3.72-11.59-9.4-13.83-14-5.53-44.14-14.92-93.93-18.45-8.32-.59-16.65-.88-24.99-.88';
// ตัว L ของ LINE ในไฟล์ต้นฉบับเป็น path สีขาวทับโล่ — โหมดสีเดียวต้องเจาะเป็นรู ไม่งั้นได้โล่ทึบ
const LINE_L =
  'M186.21,166.6h-49.46v-89.8c0-2.79-2.26-5.05-5.05-5.05h-18.2c-2.79,0-5.05,2.26-5.05,5.05v113.06h0c0,1.37.54,2.59,1.41,3.5.02.02.05.05.07.08.02.02.05.04.08.07.91.87,2.13,1.41,3.49,1.41h72.72c2.79,0,5.05-2.26,5.05-5.05v-18.2c0-2.79-2.26-5.06-5.05-5.06';
const IG_OUTER =
  'M210.63.28h-121.26C40.09.28,0,40.37,0,89.65v121.26c0,49.28,40.09,89.37,89.37,89.37h121.26c49.28,0,89.37-40.09,89.37-89.37v-121.26c0-49.28-40.09-89.37-89.37-89.37ZM269.82,210.91c0,32.69-26.5,59.19-59.19,59.19h-121.26c-32.69,0-59.19-26.5-59.19-59.19v-121.26c0-32.69,26.5-59.19,59.19-59.19h121.26c32.69,0,59.19,26.5,59.19,59.19v121.26h0Z';
const IG_INNER =
  'M150,72.69c-42.78,0-77.59,34.81-77.59,77.59s34.81,77.59,77.59,77.59,77.59-34.81,77.59-77.59-34.81-77.59-77.59-77.59ZM150,197.69c-26.18,0-47.41-21.23-47.41-47.41s21.23-47.41,47.41-47.41,47.41,21.23,47.41,47.41-21.23,47.41-47.41,47.41Z';

function MonoGlyph({ id, size, title }: { id: 'line' | 'facebook' | 'instagram'; size: number; title: string }) {
  // mask ต้องมี id ไม่ซ้ำ — หน้าเดียวมีไอคอน LINE ได้หลายตัว
  const maskId = useId();
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 300 300',
    fill: 'currentColor',
    'aria-label': title,
    role: 'img' as const,
    className: 'shrink-0',
  };
  if (id === 'facebook') {
    return (
      <svg {...common}><path d={FB_PATH} /></svg>
    );
  }
  if (id === 'instagram') {
    return (
      <svg {...common}>
        <path d={IG_OUTER} />
        <path d={IG_INNER} />
        <circle cx="227.74" cy="73.27" r="18.59" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <mask id={maskId}>
        <rect width="300" height="300" fill="#fff" />
        <path d={LINE_L} fill="#000" />
      </mask>
      <path d={LINE_SHIELD} mask={`url(#${maskId})`} />
    </svg>
  );
}

interface PlatformIconProps {
  id: PlatformId | string;
  size?: number;
  /** Override the title (tooltip) shown on hover. Defaults to the platform name. */
  title?: string;
  /** สีเดียวตาม currentColor — สำหรับวางบนพื้นสี (ปุ่ม primary) · มีเฉพาะ line/facebook/instagram */
  mono?: boolean;
}

export default function PlatformIcon({ id, size = 18, title, mono = false }: PlatformIconProps) {
  const meta = META[id as PlatformId];
  if (!meta) return null;
  if (mono && (id === 'line' || id === 'facebook' || id === 'instagram')) {
    return <MonoGlyph id={id} size={size} title={title ?? meta.alt} />;
  }
  return <Image src={meta.src} alt={meta.alt} width={size} height={size} title={title ?? meta.alt} />;
}
