'use client';

// Toggle เปิด/ปิด push notification ของ "อุปกรณ์นี้" — ใช้ใน dropdown กระดิ่งของ Header
import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { getPushState, enablePush, disablePush, type PushState } from '@/lib/push/client';

export default function PushNotificationToggle() {
  const { showToast } = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getPushState().then(setState);
  }, []);

  const handleToggle = async (on: boolean) => {
    setBusy(true);
    try {
      const next = on ? await enablePush() : await disablePush();
      setState(next);
      if (on && next === 'subscribed') showToast('เปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว');
      if (on && next === 'denied') showToast('การแจ้งเตือนถูกปิดไว้ในเบราว์เซอร์ — เปิดได้ในตั้งค่าเว็บไซต์', 'error');
      if (!on) showToast('ปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว');
    } catch (err) {
      console.error('[Push] toggle error:', err);
      showToast('เปิดการแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await apiFetch('/api/push/test', { method: 'POST' });
    } catch {
      showToast('ส่งแจ้งเตือนทดสอบไม่สำเร็จ', 'error');
    } finally {
      setTesting(false);
    }
  };

  if (state === null) return null;

  // ข้อความช่วยเหลือตามสถานะที่เปิดไม่ได้
  if (state === 'ios-needs-install') {
    return (
      <div className="p-4 border-t border-gray-200 dark:border-slate-700 flex items-start gap-2.5">
        <Smartphone className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-gray-500 dark:text-slate-400">
          รับแจ้งเตือนบน iPhone/iPad: กดปุ่มแชร์ใน Safari แล้วเลือก <span className="font-medium text-gray-700 dark:text-slate-200">&ldquo;เพิ่มไปยังหน้าจอโฮม&rdquo;</span> จากนั้นเปิดใช้งานจากไอคอนแอพ
        </p>
      </div>
    );
  }
  if (state === 'unsupported') return null;

  return (
    <div className="p-4 border-t border-gray-200 dark:border-slate-700">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Smartphone className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700 dark:text-slate-200">แจ้งเตือนบนอุปกรณ์นี้</span>
        </div>
        <Toggle
          checked={state === 'subscribed'}
          onChange={handleToggle}
          disabled={state === 'denied'}
          loading={busy}
        />
      </div>
      {state === 'denied' && (
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
          การแจ้งเตือนถูกปิดไว้ในเบราว์เซอร์ — เปิดได้ในตั้งค่าเว็บไซต์ของเบราว์เซอร์
        </p>
      )}
      {state === 'subscribed' && (
        <button
          onClick={handleTest}
          disabled={testing}
          className="text-xs text-primary hover:underline mt-2 disabled:opacity-50"
        >
          {testing ? 'กำลังส่ง...' : 'ส่งแจ้งเตือนทดสอบ'}
        </button>
      )}
    </div>
  );
}
