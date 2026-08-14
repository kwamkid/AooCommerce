'use client';

import Image from 'next/image';

// Auth layout (login/register) — full-bleed video background (Higgsfield-generated
// multi-channel commerce loop ที่ /public/auth/login-bg.mp4) + การ์ดฟอร์มตรงกลาง
// Gradient overlay กันตัวหนังสือขาวจม + ทำหน้าที่ fallback ระหว่างวิดีโอโหลด

export function AuthVideoShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh flex items-center justify-center p-4 sm:p-8 overflow-hidden isolate">
      {/* Video background */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 -z-20 w-full h-full object-cover"
        src="/auth/login-bg.mp4"
      />
      {/* Fallback gradient (แสดงระหว่างวิดีโอโหลด อยู่หลังวิดีโอ) */}
      <div className="absolute inset-0 -z-30 bg-gradient-to-br from-[#F4511E] to-[#7A1F08]" />
      {/* Readability overlay */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/45 via-black/25 to-black/55" />

      <div className="w-full max-w-[420px] flex flex-col items-center">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-3">
          <Image
            src="/logo.svg"
            alt="AooCommerce"
            width={48}
            height={31}
            className="brightness-0 invert drop-shadow"
            priority
          />
          <span className="text-xl font-bold text-white tracking-tight drop-shadow">AooCommerce</span>
        </div>
        <p className="text-white/85 text-sm leading-[1.7] mb-6 text-center drop-shadow">
          ทุกช่องทางการขาย รวมอยู่ในที่เดียว
        </p>

        {children}
      </div>
    </main>
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
