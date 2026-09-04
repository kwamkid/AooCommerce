'use client';

// แถบชวนติดตั้งแอป — บาง ๆ ใต้หัวเว็บ เฉพาะมือถือ/แท็บเล็ตที่ยังเปิดจากเบราว์เซอร์
//
// เจตนา: คนที่เปิดจากแท็บเบราว์เซอร์จะ **ไม่ได้รับแจ้งเตือนแชท/ออเดอร์เลยบน iOS**
// (push ใช้ได้เฉพาะแอปที่ติดตั้งแล้ว) — ต้องชวนที่ที่เขาอยู่ ไม่ใช่รอให้เดินไปเจอเอง
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/lib/toast-context';
import {
  isStandalone,
  isInstallBannerSnoozed,
  snoozeInstallBanner,
  useInstallPrompt,
} from '@/lib/pwa-install';

// หน้าที่ห้ามมีแถบเพิ่ม: /install (ชวนซ้ำในหน้าชวนเอง) และหน้าขายหน้าร้าน
// /pos, /pc ที่พนักงานใช้เต็มจอตลอดกะ — เบียดพื้นที่ปุ่มขาย
const HIDDEN_PREFIXES = ['/install', '/pos', '/pc'];

export default function InstallAppBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();
  const { canPrompt, installed, promptInstall } = useInstallPrompt();
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  // ตัดสินหลัง mount เท่านั้น — เงื่อนไขทั้งหมดอ่านจาก browser (matchMedia,
  // localStorage, navigator) ซึ่ง server ไม่มี ถ้า render ฝั่ง server จะ hydration mismatch
  useEffect(() => {
    if (isStandalone() || isInstallBannerSnoozed()) return;
    // ตัดสินด้วย JS ไม่ใช่ CSS breakpoint เพราะต้องรู้ "แถบโผล่จริงไหม" เพื่อไปตั้ง
    // --app-banner-h ให้หน้าที่สูงเต็มจอหักความสูงออก (ดู effect ถัดไป)
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => setEligible(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const hiddenByRoute = HIDDEN_PREFIXES.some((p) => pathname?.startsWith(p));
  const visible = eligible && !dismissed && !installed && !hiddenByRoute;

  // บอกความสูงจริงของแถบให้ CSS ทั้งแอปรู้
  //
  // หน้าแชทคิดความสูงตัวเองจาก `100dvh - หัวเว็บ` — มีแถบแทรกเพิ่มข้างบน `<main>`
  // แล้วไม่หักออก = ช่องพิมพ์ข้อความหลุดพ้นขอบจอล่าง (พิมพ์ตอบลูกค้าไม่ได้เลย)
  useEffect(() => {
    const root = document.documentElement;
    const el = barRef.current;
    if (!visible || !el) {
      root.style.setProperty('--app-banner-h', '0px');
      return;
    }
    const measure = () => root.style.setProperty('--app-banner-h', `${el.offsetHeight}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--app-banner-h', '0px');
    };
  }, [visible]);

  const handleInstall = useCallback(async () => {
    // เบราว์เซอร์ที่ไม่มีทางลัดติดตั้ง (Safari/iOS ทั้งหมด) → พาไปหน้าสอนทำเอง
    if (!canPrompt) {
      router.push('/install');
      return;
    }
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        setDismissed(true);
        showToast('ติดตั้งแล้ว เปิดจากไอคอนบนหน้าจอโฮมได้เลย');
      } else if (outcome === 'unavailable') {
        router.push('/install');
      }
      // 'dismissed' = ผู้ใช้กดไม่เอาในกล่องของ Chrome — ไม่ต้องทำอะไร ปล่อยแถบไว้
    } finally {
      setBusy(false);
    }
  }, [canPrompt, promptInstall, router, showToast]);

  const handleClose = useCallback(() => {
    snoozeInstallBanner();
    setDismissed(true);
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={barRef}
      className="bg-orange-50 dark:bg-orange-900/20 border-b border-orange-100 dark:border-orange-900/40 px-3 py-2 flex items-center gap-3"
    >
      <Image
        src="/icons/icon-192.png"
        alt=""
        width={36}
        height={36}
        className="rounded-lg flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-white truncate">ใช้เป็นแอปดีกว่า</p>
        <p className="text-sm text-gray-600 dark:text-slate-300 truncate">
          แจ้งเตือนแชท-ออเดอร์ถึงมือถือ แม้ปิดจอ
        </p>
      </div>
      <Button size="sm" variant="primary" loading={busy} onClick={handleInstall}>
        ติดตั้ง
      </Button>
      <button
        type="button"
        onClick={handleClose}
        aria-label="ปิด"
        className="flex-shrink-0 p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
