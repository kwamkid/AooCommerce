// Shared social platform icon. Single source of truth for FB / LINE / IG / TikTok
// icons across chat-channels, sales-channels, and anywhere else that needs to
// indicate a connected platform. The underlying SVGs live in /public/social/.
'use client';

import Image from 'next/image';

export type PlatformId = 'line' | 'facebook' | 'instagram' | 'tiktok' | 'shopee' | 'lazada';

const META: Record<PlatformId, { src: string; alt: string }> = {
  line:      { src: '/social/line_oa.svg',   alt: 'LINE' },
  facebook:  { src: '/social/facebook.svg',  alt: 'Facebook' },
  instagram: { src: '/social/instagram.svg', alt: 'Instagram' },
  tiktok:    { src: '/social/tiktok.svg',    alt: 'TikTok' },
  shopee:    { src: '/marketplace/shopee.svg', alt: 'Shopee' },
  lazada:    { src: '/marketplace/lazada.svg', alt: 'Lazada' },
};

interface PlatformIconProps {
  id: PlatformId | string;
  size?: number;
  /** Override the title (tooltip) shown on hover. Defaults to the platform name. */
  title?: string;
}

export default function PlatformIcon({ id, size = 18, title }: PlatformIconProps) {
  const meta = META[id as PlatformId];
  if (!meta) return null;
  return <Image src={meta.src} alt={meta.alt} width={size} height={size} title={title ?? meta.alt} />;
}
