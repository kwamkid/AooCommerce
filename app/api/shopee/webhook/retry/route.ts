// Path: app/api/shopee/webhook/retry/route.ts
// Cron: ทุก 5 นาที — ไล่ webhook Shopee ที่ทำไม่สำเร็จ
// โครงกลาง (auth, breaker, backoff, dead letter, ใบที่ค้าง processing)
// อยู่ที่ lib/marketplace/webhook-retry.ts ใช้ร่วมกับ TikTok/Lazada
import { NextRequest } from 'next/server';
import { runWebhookRetry } from '@/lib/marketplace/webhook-retry';
import type { ShopeeAccountRow } from '@/lib/shopee/api';
import { syncSingleOrder } from '@/lib/shopee/webhook-processor';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return runWebhookRetry<ShopeeAccountRow>(request, {
    platform: 'shopee',
    // ใบยุคก่อนมีหลาย marketplace ไม่มี platform ติดมา — ของ Shopee ทั้งหมด
    includeLegacyNullPlatform: true,
    process: async (job, account) => {
      const payload = job.raw_payload as { data?: Record<string, unknown> };

      if (job.push_code === 3 || job.push_code === 14) {
        const orderSn = (payload.data?.ordersn as string) || '';
        if (!orderSn) return;
        await syncSingleOrder(account, orderSn, (payload.data?.status as string) || undefined);
        return;
      }

      if (job.push_code === 10) {
        const { processShopeeWebchatPush } = await import('@/lib/services/chat/shopee');
        type WebchatPayload = import('@/lib/services/chat/shopee').ShopeeWebchatPayload;
        await processShopeeWebchatPush(account, payload as WebchatPayload);
      }
      // tracking (code 4) — webhook เดิมทำไปแล้วและ idempotent ไม่ต้องยิงซ้ำ
    },
  });
}
