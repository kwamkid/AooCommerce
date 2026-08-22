import type { MetadataRoute } from 'next';

// PWA manifest — ทำให้เว็บติดตั้งเป็นแอพบนมือถือได้ (Add to Home Screen)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AooCommerce - ระบบจัดการธุรกิจ',
    short_name: 'AooCommerce',
    description: 'ระบบจัดการธุรกิจครบวงจร สั่งซื้อ จัดส่ง และติดตามลูกค้า',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#F4511E',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
