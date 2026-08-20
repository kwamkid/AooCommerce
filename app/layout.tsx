// Path: src/app/layout.tsx
import type { Metadata } from 'next';
import { IBM_Plex_Sans_Thai, Sarabun } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import { CompanyProvider } from '@/lib/company-context';
import { ToastProvider } from '@/lib/toast-context';
import { ThemeProvider } from '@/lib/theme-context';
import ColorLab from '@/components/dev/ColorLab';
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
  },
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
        `}} />
      </head>
      <body className={`${ibmPlexSansThai.className} ${sarabun.variable}`} suppressHydrationWarning>
        {/* แผงลองสีสำหรับ dev — ไม่ render ใน production (เช็คใน component) */}
        <ColorLab />
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