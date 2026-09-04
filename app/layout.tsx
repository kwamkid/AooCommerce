// Path: src/app/layout.tsx
import type { Metadata } from 'next';
import { IBM_Plex_Sans_Thai, Sarabun } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import { CompanyProvider } from '@/lib/company-context';
import { ToastProvider } from '@/lib/toast-context';
import { ThemeProvider } from '@/lib/theme-context';
import ColorLab from '@/components/dev/ColorLab';
import PwaRegister from '@/components/PwaRegister';
import { FeaturesProvider } from '@/lib/features-context';
import { HeaderSummaryProvider } from '@/lib/header-summary-context';
import './globals.css';

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['thai', 'latin'],
  display: 'swap',
});

const sarabun = Sarabun({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['thai', 'latin'],
  display: 'swap',
  variable: '--font-sarabun',
});

export const metadata: Metadata = {
  title: 'AooCommerce - ระบบจัดการธุรกิจ',
  description: 'ระบบจัดการธุรกิจครบวงจร สั่งซื้อ จัดส่ง และติดตามลูกค้า',
  icons: {
    icon: '/logo.svg',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'AooCommerce',
  },
};

export const viewport = {
  themeColor: '#F4511E',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              // หน้าร้าน (/store/*) สว่างเสมอ — ดู isStorefrontPath ใน lib/theme-context
              if (location.pathname.indexOf('/store/') === 0) return;
              var theme = localStorage.getItem('aoo-theme') || 'system';
              var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              if (dark) document.documentElement.classList.add('dark');
            } catch(e) {}
          })();

          (function() {
            // Chrome ยิง 'beforeinstallprompt' **ครั้งเดียวและเร็วมาก** (ก่อน React hydrate)
            // ถ้าไม่มีใครรับไว้ตรงนี้ ปุ่ม "ติดตั้งแอปเลย" ในหน้า /install จะไม่มีวันโผล่
            // — เก็บ event ไว้ที่ window.__aooBip แล้วบอกฝั่ง React ผ่าน event 'aoo-bip'
            // (ตัวรับช่วงอยู่ที่ initInstallPromptCapture ใน lib/pwa-install.ts)
            window.addEventListener('beforeinstallprompt', function (e) {
              e.preventDefault();
              window.__aooBip = e;
              window.dispatchEvent(new Event('aoo-bip'));
            });
          })();
        `}} />
      </head>
      <body className={`${ibmPlexSansThai.className} ${sarabun.variable}`} suppressHydrationWarning>
        {/* แผงลองสีสำหรับ dev — ไม่ render ใน production (เช็คใน component) */}
        <ColorLab />
        <PwaRegister />
        <ThemeProvider>
          <AuthProvider>
            <CompanyProvider>
              <FeaturesProvider>
                <HeaderSummaryProvider>
                  <ToastProvider>
                    {children}
                  </ToastProvider>
                </HeaderSummaryProvider>
              </FeaturesProvider>
            </CompanyProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}