'use client';

// หน้าสอนติดตั้งแอป — public เต็มตัว (ไม่มี Layout/sidebar เพราะเจ้าของร้าน
// ส่งลิงก์นี้ให้พนักงานเปิดก่อน login ได้) · path อยู่ใน PUBLIC_PREFIXES ของ
// proxy.ts และ PUBLIC_ROUTES ของ auth-context — สองที่ต้องตรงกันเสมอ
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  Bell,
  Copy,
  Download,
  Maximize2,
  MonitorDown,
  MoreVertical,
  Share,
  SquarePlus,
  Zap,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';
import Tabs from '@/components/ui/Tabs';
import { useToast } from '@/lib/toast-context';
import {
  detectPlatform,
  getInAppBrowserName,
  isStandalone,
  useInstallPrompt,
  type InAppBrowser,
  type InstallPlatform,
} from '@/lib/pwa-install';

const TABS = [
  { key: 'ios', label: 'iPhone / iPad' },
  { key: 'android', label: 'Android' },
  { key: 'desktop', label: 'คอมพิวเตอร์' },
];

/** ขั้นตอนหนึ่งข้อ — เลขวงกลมสีแบรนด์ + เนื้อหา */
function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-full bg-primary text-white text-sm font-semibold flex items-center justify-center shrink-0">
        {n}
      </span>
      <span className="body-text text-gray-700 dark:text-slate-200 pt-0.5">{children}</span>
    </li>
  );
}

function Benefit({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-primary flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="body-text text-gray-700 dark:text-slate-200 pt-1">{children}</span>
    </div>
  );
}

export default function InstallClient() {
  const { showToast } = useToast();
  const { canPrompt, promptInstall } = useInstallPrompt();

  // ทุกอย่างที่อ่านจากเบราว์เซอร์ต้องรอ mount ก่อน ไม่งั้น HTML ของ server
  // (ไม่มี navigator) กับของ client จะไม่ตรงกัน = hydration error
  const [mounted, setMounted] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>('ios');
  const [installedApp, setInstalledApp] = useState(false);
  const [inApp, setInApp] = useState<InAppBrowser | null>(null);
  const [tab, setTab] = useState<string>('ios');
  const [justInstalled, setJustInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
    setTab(p);
    setInstalledApp(isStandalone());
    setInApp(getInAppBrowserName());
    setShareUrl(`${window.location.origin}/install`);
    setMounted(true);
  }, []);

  const handlePrompt = useCallback(async () => {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === 'accepted') setJustInstalled(true);
    } finally {
      setBusy(false);
    }
  }, [promptInstall]);

  const handleShare = useCallback(async () => {
    const url = shareUrl || `${window.location.origin}/install`;
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === 'function' && platform !== 'desktop') {
      try {
        await nav.share({ title: 'ติดตั้งแอป AooCommerce', url });
        return;
      } catch (err) {
        // ผู้ใช้กดยกเลิกแผงแชร์ = ไม่ใช่ error ห้ามเด้ง toast แดงใส่
        if ((err as DOMException)?.name === 'AbortError') return;
        // แชร์ไม่ได้ด้วยเหตุอื่น → ตกไปคัดลอกลิงก์แทน
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('คัดลอกลิงก์แล้ว');
    } catch {
      showToast('คัดลอกลิงก์ไม่สำเร็จ', 'error');
    }
  }, [platform, shareUrl, showToast]);

  const promptButton = (
    <div className="space-y-2">
      <Button size="lg" variant="primary" fullWidth icon={<Download className="w-5 h-5" />} loading={busy} onClick={handlePrompt}>
        ติดตั้งแอปเลย
      </Button>
      <p className="text-sm text-gray-500 dark:text-slate-400 text-center">หรือทำเองตามขั้นตอนด้านล่าง</p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-slate-950">
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-lg mx-auto px-4 pt-safe-3 pb-3 flex items-center justify-between gap-3">
          <Image src="/logo.svg" alt="AooCommerce" width={120} height={32} className="h-8 w-auto" priority />
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />}>
              กลับเข้าระบบ
            </Button>
          </Link>
        </div>
      </header>

      {/* pt-6 + pb-safe-6 แยกกัน — ห้ามใช้ py-6 คู่กับ pb-safe-* เพราะ specificity เท่ากัน
          ตัวไหนชนะขึ้นกับลำดับ CSS ที่ generate (บทเรียนเดียวกับ SearchInput ในหน้าแชท) */}
      <main className="max-w-lg mx-auto px-4 pt-6 pb-safe-6 space-y-4">
        {/* Hero */}
        <Card>
          <div className="flex items-center gap-4">
            <Image
              src="/icons/icon-192.png"
              alt=""
              width={72}
              height={72}
              className="rounded-2xl shadow ring-1 ring-gray-200 dark:ring-slate-600 shrink-0"
            />
            <div className="min-w-0">
              <h1 className="heading-2 text-gray-900 dark:text-white">ติดตั้ง AooCommerce เป็นแอป</h1>
              <p className="page-subtitle text-gray-600 dark:text-slate-400">
                ใช้งานจากหน้าจอโฮมเหมือนแอปทั่วไป ไม่ต้องดาวน์โหลดจาก App Store / Play Store
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <Benefit icon={<Bell className="w-5 h-5" />}>
              แจ้งเตือนแชทใหม่และออเดอร์ใหม่ถึงมือถือทันที แม้ปิดจออยู่
            </Benefit>
            <Benefit icon={<Zap className="w-5 h-5" />}>
              เปิดได้จากไอคอนบนหน้าจอโฮม ไม่ต้องพิมพ์ลิงก์หรือหาแท็บ
            </Benefit>
            <Benefit icon={<Maximize2 className="w-5 h-5" />}>
              ใช้เต็มจอ ไม่มีแถบเบราว์เซอร์บัง
            </Benefit>
          </div>
        </Card>

        {/* ติดตั้งแล้ว — ไม่ต้องสอนซ้ำ บอกขั้นต่อไปแทน */}
        {mounted && installedApp && (
          <Alert tone="success" title="คุณเปิดจากแอปที่ติดตั้งแล้ว">
            <p>
              ขั้นต่อไป: กดกระดิ่งมุมขวาบนแล้วเปิด &ldquo;แจ้งเตือนบนเครื่องนี้&rdquo;
              เพื่อรับแชท/ออเดอร์ใหม่
            </p>
            <div className="mt-3">
              <Link href="/dashboard">
                <Button variant="primary" size="sm">ไปหน้าหลัก</Button>
              </Link>
            </div>
          </Alert>
        )}

        {/* เบราว์เซอร์ในแอปโซเชียล — ติดตั้งจากในนี้ไม่ได้ ต้องบอกตรง ๆ ก่อนสอนขั้นตอน */}
        {mounted && !installedApp && inApp && (
          <Alert tone="warning" title={`คุณเปิดอยู่ในแอป ${inApp}`}>
            ติดตั้งจากในนี้ไม่ได้ — กดเมนู ⋯ (มุมขวาบนหรือล่าง) แล้วเลือก
            &ldquo;เปิดในเบราว์เซอร์&rdquo; / &ldquo;เปิดใน Safari&rdquo; ก่อน แล้วทำตามขั้นตอนด้านล่าง
          </Alert>
        )}

        {mounted && !installedApp && (
          <div>
            <Tabs tabs={TABS} activeKey={tab} onSelect={setTab} className="mb-4" />

            <Card>
              {tab === 'ios' && (
                <>
                  <ol className="space-y-3">
                    <Step n={1}>
                      เปิดหน้านี้ใน <strong>Safari</strong> (เบราว์เซอร์อื่นบน iPhone ก็ทำได้ แต่ Safari ชัวร์สุด)
                    </Step>
                    <Step n={2}>
                      กดปุ่ม <strong>แชร์</strong>{' '}
                      <Share className="w-4 h-4 inline-block align-text-bottom text-gray-500" />{' '}
                      ที่แถบล่าง (สี่เหลี่ยมมีลูกศรขึ้น)
                    </Step>
                    <Step n={3}>
                      เลื่อนลงแล้วกด <strong>&ldquo;เพิ่มลงหน้าจอโฮม&rdquo;</strong> (Add to Home Screen){' '}
                      <SquarePlus className="w-4 h-4 inline-block align-text-bottom text-gray-500" />
                    </Step>
                    <Step n={4}>
                      กด <strong>&ldquo;เพิ่ม&rdquo;</strong> มุมขวาบน
                    </Step>
                    <Step n={5}>
                      เปิดแอปจากไอคอนบนหน้าจอโฮม แล้ว<strong>เข้าสู่ระบบอีกครั้ง</strong>{' '}
                      (แอปเก็บการเข้าสู่ระบบแยกจาก Safari)
                    </Step>
                    <Step n={6}>
                      กด<strong>กระดิ่ง</strong>มุมขวาบน แล้วเปิด &ldquo;แจ้งเตือนบนเครื่องนี้&rdquo;
                    </Step>
                  </ol>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-4">
                    ต้องเป็น iOS 16.4 ขึ้นไปจึงรับแจ้งเตือนได้ · เปิดผ่านแอป LINE/Facebook ติดตั้งไม่ได้ ต้องเปิดใน Safari
                  </p>
                </>
              )}

              {tab === 'android' && (
                <>
                  {justInstalled ? (
                    <Alert tone="success" className="mb-4">
                      ติดตั้งแล้ว — เปิดจากไอคอน AooCommerce บนหน้าจอหลัก แล้วเข้าสู่ระบบอีกครั้ง
                    </Alert>
                  ) : canPrompt ? (
                    <div className="mb-4">{promptButton}</div>
                  ) : null}

                  <ol className="space-y-3">
                    <Step n={1}>
                      เปิดหน้านี้ใน <strong>Chrome</strong>
                    </Step>
                    <Step n={2}>
                      กดเมนู <strong>⋮</strong>{' '}
                      <MoreVertical className="w-4 h-4 inline-block align-text-bottom text-gray-500" /> มุมขวาบน
                    </Step>
                    <Step n={3}>
                      กด <strong>&ldquo;ติดตั้งแอป&rdquo;</strong> หรือ{' '}
                      <strong>&ldquo;เพิ่มลงในหน้าจอหลัก&rdquo;</strong> (ชื่อต่างกันตามรุ่น Chrome)
                    </Step>
                    <Step n={4}>
                      กด <strong>&ldquo;ติดตั้ง&rdquo;</strong> ยืนยัน
                    </Step>
                    <Step n={5}>
                      เปิดแอปจากไอคอนบนหน้าจอหลัก แล้ว<strong>เข้าสู่ระบบอีกครั้ง</strong>
                    </Step>
                    <Step n={6}>
                      กด<strong>กระดิ่ง</strong>มุมขวาบน แล้วเปิด &ldquo;แจ้งเตือนบนเครื่องนี้&rdquo;
                    </Step>
                  </ol>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-4">
                    Samsung Internet: เมนู ≡ → &ldquo;เพิ่มหน้าเว็บไปยัง&rdquo; → &ldquo;หน้าจอหลัก&rdquo;
                  </p>
                </>
              )}

              {tab === 'desktop' && (
                <>
                  {justInstalled ? (
                    <Alert tone="success" className="mb-4">
                      ติดตั้งแล้ว — เปิดจากไอคอน AooCommerce แล้วเข้าสู่ระบบอีกครั้ง
                    </Alert>
                  ) : canPrompt ? (
                    <div className="mb-4">{promptButton}</div>
                  ) : null}

                  <ol className="space-y-3">
                    <Step n={1}>
                      <strong>Chrome / Edge</strong>: กดไอคอนติดตั้ง{' '}
                      <MonitorDown className="w-4 h-4 inline-block align-text-bottom text-gray-500" />{' '}
                      ท้ายแถบที่อยู่ หรือเมนู ⋮ → <strong>&ldquo;ติดตั้ง AooCommerce&rdquo;</strong>
                    </Step>
                    <Step n={2}>
                      <strong>Safari (macOS 14+)</strong>: เมนู{' '}
                      <strong>ไฟล์ → &ldquo;เพิ่มลง Dock&rdquo;</strong>
                    </Step>
                    <Step n={3}>เปิดจากไอคอนที่ได้ แล้วเข้าสู่ระบบอีกครั้ง</Step>
                  </ol>
                </>
              )}
            </Card>
          </div>
        )}

        {/* ส่งต่อให้ทีมงาน */}
        <Card>
          <h2 className="heading-3 text-gray-900 dark:text-white">ส่งให้ทีมงานติดตั้ง</h2>
          <p className="section-desc text-gray-500 dark:text-slate-400">
            ส่งลิงก์นี้ให้พนักงานเปิดในมือถือของตัวเอง (เปิดได้โดยไม่ต้องเข้าสู่ระบบ)
          </p>
          <div className="mt-3 bg-gray-50 dark:bg-slate-900 rounded-lg px-3 py-2 font-mono text-sm break-all text-gray-700 dark:text-slate-300">
            {shareUrl || '/install'}
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" icon={<Copy className="w-4 h-4" />} onClick={handleShare}>
              คัดลอกลิงก์
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
