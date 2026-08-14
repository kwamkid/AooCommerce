'use client';

import Image from 'next/image';

// Auth layout (login/register) — split-screen แบบ aoosocial:
// ซ้าย (desktop เท่านั้น) = วิดีโอ multi-channel commerce (Higgsfield,
// /public/auth/login-bg.mp4) + overlay + brand/headline · ขวา = การ์ดฟอร์ม
// Mobile เห็นเฉพาะฟอร์ม (ไม่โหลดวิดีโอ — hero ถูก hidden)

export function AuthSplitShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh grid lg:grid-cols-[1.15fr_1fr]">
      {/* ---------- Hero (left, desktop only) ---------- */}
      <aside className="hidden lg:block relative overflow-hidden isolate" aria-hidden="true">
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
        {/* Fallback gradient (ระหว่างวิดีโอโหลด) */}
        <div className="absolute inset-0 -z-30 bg-gradient-to-br from-[#F4511E] to-[#7A1F08]" />
        {/* Readability overlay — เข้มขึ้นทางล่างซ้ายที่มีข้อความ */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/65 via-black/20 to-black/25" />

        <div className="relative h-full flex flex-col justify-between p-10 xl:p-14 text-white">
          {/* Brand (top) */}
          <div className="flex items-center gap-3.5">
            <Image
              src="/logo.svg"
              alt=""
              width={52}
              height={34}
              className="brightness-0 invert drop-shadow"
              priority
            />
            <span className="text-[22px] font-bold tracking-tight drop-shadow">AooCommerce</span>
          </div>

          {/* Copy (bottom) */}
          <div className="flex flex-col gap-4 max-w-[520px]">
            <h2 className="text-3xl xl:text-4xl font-bold leading-[1.4] drop-shadow-md">
              ทุกช่องทางการขาย
              <br />
              รวมอยู่ในที่เดียว
            </h2>
            <p className="text-base leading-[1.8] text-white/85 max-w-[42ch] drop-shadow">
              จัดการออเดอร์ สต็อก และแชทลูกค้าจาก Shopee, Lazada, TikTok, LINE
              และ Facebook ครบจบในระบบเดียว
            </p>
          </div>
        </div>
      </aside>

      {/* ---------- Form panel (right) ---------- */}
      <section className="flex items-center justify-center p-4 sm:p-8 bg-gray-50 dark:bg-slate-900">
        <div className="w-full max-w-[420px]">
          {/* Mobile brand row (hero ถูกซ่อน < lg) */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-6">
            <Image src="/logo.svg" alt="AooCommerce" width={40} height={26} priority />
            <span className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">AooCommerce</span>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-6 sm:p-9 shadow-lg lg:shadow-xl">
            {children}
          </div>
        </div>
      </section>
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
