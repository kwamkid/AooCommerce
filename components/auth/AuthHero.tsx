'use client';

import Image from 'next/image';

// Split-screen auth layout pieces (แบบ aoosocial) — ใช้ร่วมหน้า /login และ /register
// Hero แสดงเฉพาะ desktop (≥ lg); mobile เห็นเฉพาะการ์ดฟอร์ม + brand row

const HERO_PLATFORMS = [
  { src: '/marketplace/shopee.svg', alt: 'Shopee' },
  { src: '/marketplace/lazada.svg', alt: 'Lazada' },
  { src: '/social/tiktok.svg', alt: 'TikTok' },
  { src: '/social/line_oa.svg', alt: 'LINE' },
  { src: '/social/facebook.svg', alt: 'Facebook' },
];

export function AuthHero() {
  return (
    <aside className="hidden lg:flex relative items-center justify-center overflow-hidden text-white isolate" aria-hidden="true">
      <div className="auth-hero-bg" />
      <div className="relative w-full max-w-[520px] p-12 xl:p-16 flex flex-col gap-12">
        {/* Brand */}
        <div className="flex items-center gap-3.5">
          <Image
            src="/logo.svg"
            alt=""
            width={56}
            height={37}
            className="brightness-0 invert"
            priority
          />
          <span className="text-[22px] font-bold tracking-tight">AooCommerce</span>
        </div>

        {/* Copy */}
        <div className="flex flex-col gap-4">
          <h2 className="text-3xl xl:text-4xl font-bold leading-tight tracking-tight">
            ทุกช่องทางการขาย
            <br />
            รวมอยู่ในที่เดียว
          </h2>
          <p className="text-base leading-relaxed text-white/80 max-w-[42ch]">
            จัดการออเดอร์ สต็อก และแชทลูกค้าจาก Shopee, Lazada, TikTok, LINE
            และ Facebook ครบจบในระบบเดียว
          </p>
        </div>

        {/* Platform bubbles */}
        <div className="flex gap-4 flex-wrap">
          {HERO_PLATFORMS.map(p => (
            <div key={p.alt} className="auth-bubble">
              <Image src={p.src} alt={p.alt} width={36} height={36} />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

/** Brand row แสดงเฉพาะ mobile (hero ถูกซ่อน < lg) */
export function AuthBrandRow() {
  return (
    <div className="flex lg:hidden items-center justify-center gap-3 mb-6">
      <Image src="/logo.svg" alt="AooCommerce" width={40} height={26} priority />
      <span className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">AooCommerce</span>
    </div>
  );
}

export function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
