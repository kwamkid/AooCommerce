'use client';

// Toggle เปิด/ปิด push notification ของ "อุปกรณ์นี้" — ใช้ใน dropdown กระดิ่งของ Header
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Smartphone } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  getPushState,
  enablePush,
  disablePush,
  getBadgeDiagnostics,
  testAppBadge,
  isStandalone,
  type PushState,
  type PushAudience,
  type BadgeDiagnostics,
} from '@/lib/push/client';
import { formatThaiDateTime } from '@/lib/utils/format';

interface Props {
  /** compact = แถวเดี่ยวไม่มีเส้นคั่น/ระยะขอบ สำหรับวางใน header (shell ของ superadmin) */
  compact?: boolean;
  /** สายแจ้งเตือนของแอปที่สวิตช์นี้อยู่ — 'superadmin' = แอปผู้ดูแลระบบ (คนละ subscription) */
  audience?: PushAudience;
}

export default function PushNotificationToggle({ compact = false, audience = 'app' }: Props) {
  const { showToast } = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  // บันทึกจาก SW ว่าเลขบนไอคอนตั้ง/ล้างล่าสุดเมื่อไหร่ — โชว์เฉพาะแอปที่ติดตั้งแล้ว
  // (ในเบราว์เซอร์ธรรมดาไม่มีเลขบนไอคอนให้ดูอยู่แล้ว)
  const [badge, setBadge] = useState<BadgeDiagnostics | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    getPushState(audience).then(setState);
    setStandalone(isStandalone());
  }, [audience]);

  const refreshBadge = () => getBadgeDiagnostics(audience).then(setBadge);

  useEffect(() => {
    if (state !== 'subscribed' || !standalone) return;
    refreshBadge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, standalone, audience]);

  const handleToggle = async (on: boolean) => {
    setBusy(true);
    try {
      const next = on ? await enablePush(audience) : await disablePush(audience);
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
      await apiFetch('/api/push/test', { method: 'POST', body: JSON.stringify({ audience }) });
      // push วิ่งผ่าน APNs/FCM กว่าจะถึง SW ใช้เวลาไม่กี่วิ — รอแล้วค่อยอ่านบันทึกใหม่
      if (standalone) setTimeout(refreshBadge, 4000);
    } catch {
      showToast('ส่งแจ้งเตือนทดสอบไม่สำเร็จ', 'error');
    } finally {
      setTesting(false);
    }
  };

  // ตั้งเลข 1 จากหน้าเว็บตรง ๆ ไม่ผ่าน push — ถ้ากดแล้วกลับหน้าจอโฮมไม่เห็นเลข
  // แปลว่า OS ปิด "ป้ายกำกับ" ของแอปนี้ไว้ ไม่ใช่สาย push ของเราพัง
  const handleTestBadge = async () => {
    const ok = await testAppBadge(1);
    showToast(
      ok ? 'ตั้งเลข 1 บนไอคอนแล้ว — กลับไปดูหน้าจอโฮม ถ้าไม่เห็น ให้เปิด "ป้ายกำกับ" ในตั้งค่าการแจ้งเตือนของแอปนี้'
         : 'เครื่องนี้ไม่มี API เลขบนไอคอน (ต้องเปิดจากแอปที่ติดตั้งแล้ว)',
      ok ? 'success' : 'error'
    );
  };

  if (state === null) return null;

  // ข้อความช่วยเหลือตามสถานะที่เปิดไม่ได้
  if (state === 'ios-needs-install') {
    return (
      <div className="p-4 border-t border-gray-200 dark:border-slate-700 flex items-start gap-2.5">
        <Smartphone className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-gray-500 dark:text-slate-400">
          รับแจ้งเตือนบน iPhone/iPad: กดปุ่มแชร์ใน Safari แล้วเลือก <span className="font-medium text-gray-700 dark:text-slate-200">&ldquo;เพิ่มลงหน้าจอโฮม&rdquo;</span> จากนั้นเปิดใช้งานจากไอคอนแอพ{' '}
          <Link href="/install" className="text-primary font-medium hover:underline">ดูวิธีติดตั้ง</Link>
        </p>
      </div>
    );
  }
  if (state === 'unsupported') return null;

  return (
    <div className={compact ? '' : 'p-4 border-t border-gray-200 dark:border-slate-700'}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Smartphone className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700 dark:text-slate-200">
            {compact ? 'แจ้งเตือนเครื่องนี้' : 'แจ้งเตือนบนอุปกรณ์นี้'}
          </span>
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
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            onClick={handleTest}
            disabled={testing}
            className="text-xs text-primary hover:underline disabled:opacity-50"
          >
            {testing ? 'กำลังส่ง...' : 'ส่งแจ้งเตือนทดสอบ'}
          </button>
          {standalone && badge?.pageSupported && (
            <button onClick={handleTestBadge} className="text-xs text-primary hover:underline">
              ทดสอบเลขบนไอคอน
            </button>
          )}
        </div>
      )}
      {state === 'subscribed' && standalone && badge && (
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5 leading-relaxed">
          {describeBadge(badge)}
        </p>
      )}
    </div>
  );
}

/**
 * สรุปบันทึกเลขบนไอคอนเป็นประโยคเดียว — ให้ผู้ใช้ส่งภาพหน้าจอมาแล้วรู้ทันทีว่าตายฝั่งไหน
 * (SW ไม่รองรับ · push ล่าสุดตั้งไม่สำเร็จ · หรือตั้งได้แต่ถูกล้างไปก่อน)
 */
function describeBadge(b: BadgeDiagnostics): string {
  if (!b.pageSupported) return 'เครื่องนี้ไม่รองรับเลขบนไอคอนแอป';
  if (b.swSupported === false) return 'เลขบนไอคอน: ตัวรับแจ้งเตือนของเครื่องนี้ไม่มี API ตั้งเลข (เบราว์เซอร์รุ่นเก่า)';
  if (!b.lastPush) return 'เลขบนไอคอน: ยังไม่มีแจ้งเตือนเข้าเครื่องนี้ตั้งแต่ติดตั้ง';
  const when = formatThaiDateTime(new Date(b.lastPush.at));
  const set = b.lastPush.ok
    ? `แจ้งเตือนล่าสุดตั้งเลขเป็น ${b.lastPush.count} สำเร็จ (${when})`
    : `แจ้งเตือนล่าสุดตั้งเลขไม่สำเร็จ (${when})${b.lastPush.error ? ` — ${b.lastPush.error}` : ''}`;
  const clear = b.lastClear && b.lastClear.at > b.lastPush.at
    ? ` · ล้างเมื่อ ${formatThaiDateTime(new Date(b.lastClear.at))} (${clearReasonLabel(b.lastClear.reason)})`
    : '';
  return `เลขบนไอคอน: ${set}${clear}`;
}

function clearReasonLabel(reason: string): string {
  switch (reason) {
    case 'mount': return 'เปิดแอป';
    case 'interact': return 'แตะหน้าจอ';
    case 'notification-click': return 'กดแจ้งเตือน';
    default: return reason;
  }
}
