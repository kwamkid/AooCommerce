// Path: lib/broadcast/run.ts
//
// จุดเดียวที่แปลง "บรอดแคสต์ใบนี้อยู่ช่องทางไหน" เป็น "เรียกตัวส่งของใคร"
// เพิ่มช่องทางใหม่ = เพิ่ม case เดียวที่นี่ + เปลี่ยน status ใน platforms.ts เป็น 'ready'
// (route ทั้งสามตัวเรียกผ่านฟังก์ชันนี้เสมอ ไม่เรียก runLineBroadcast ตรง ๆ)

import { runLineBroadcast } from '@/lib/line/broadcast';
import { BROADCAST_PLATFORMS, type BroadcastPlatform } from './platforms';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function runBroadcast(id: string, platform: BroadcastPlatform): Promise<void> {
  if (platform === 'line') {
    await runLineBroadcast(id);
    return;
  }

  // ไม่ควรมาถึงตรงนี้ — route กันไว้ตั้งแต่ตอนสร้างแล้วด้วย canBroadcastVia()
  // แต่ถ้ามาถึง ต้องปิดใบให้จบ ไม่ปล่อยค้าง 'pending' ให้ผู้ใช้นั่งดู spinner ตลอดไป
  const label = BROADCAST_PLATFORMS[platform]?.label || platform;
  console.error('runBroadcast: no sender for platform', platform, 'broadcast', id);
  await supabaseAdmin
    .from('broadcasts')
    .update({
      status: 'failed',
      error: `ยังส่งผ่าน ${label} ไม่ได้`,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id);
}
