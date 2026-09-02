// Path: components/auth/InAppBrowserNotice.tsx
// แถบเตือนบนหน้า login / คำเชิญ เมื่อถูกเปิดในเบราว์เซอร์ของแอป (LINE ฯลฯ)
// — Google ไม่ยอมให้ล็อกอินใน webview ของแอป (disallowed_useragent) ผู้ใช้จะกด
// ปุ่ม Google แล้วเจอหน้าจอ error ของ Google โดยไม่รู้ว่าต้องทำยังไงต่อ
'use client';

import { useSyncExternalStore } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  detectInAppBrowser,
  currentUrlForExternalBrowser,
  IN_APP_LABELS,
  type InAppBrowser,
} from '@/lib/in-app-browser';

export default function InAppBrowserNotice() {
  // ตรวจฝั่ง client เท่านั้น — SSR ไม่รู้จัก user agent ของเครื่องผู้ใช้
  // (useSyncExternalStore = คืนค่าคนละอย่างระหว่าง server/client ได้โดยไม่ hydration mismatch)
  const app = useSyncExternalStore<InAppBrowser>(
    () => () => {},               // ค่าไม่มีวันเปลี่ยนระหว่างหน้าเดิม — ไม่ต้อง subscribe อะไร
    () => detectInAppBrowser(),   // client
    () => null,                   // server
  );

  if (!app) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-400/40 dark:bg-amber-400/10">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        {app === 'other' ? 'กำลังเปิดในหน้าต่างของแอป' : `กำลังเปิดในแอป ${IN_APP_LABELS[app]}`}
      </p>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-100/80">
        การเข้าสู่ระบบด้วย Google ใช้ในหน้าต่างของแอปไม่ได้ (Google ปิดกั้นไว้)
        {app === 'line'
          ? ' — กดปุ่มด้านล่างเพื่อเปิดด้วยเบราว์เซอร์ของเครื่อง'
          : ' — เปิดเมนูของแอป (ปุ่ม ⋯ หรือ ⋮) แล้วเลือก “เปิดในเบราว์เซอร์” ก่อน'}
      </p>
      {app === 'line' && (
        <button
          type="button"
          onClick={() => { window.location.href = currentUrlForExternalBrowser(); }}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
        >
          <ExternalLink className="h-4 w-4" />
          เปิดด้วยเบราว์เซอร์
        </button>
      )}
    </div>
  );
}
