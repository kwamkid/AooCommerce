// Path: app/api/tiktok/webhook/retry/route.ts
// Cron: ทุก 5 นาที — ไล่ webhook TikTok ที่ทำไม่สำเร็จ
// โครงกลาง (auth, breaker, backoff, dead letter, ใบที่ค้าง processing)
// อยู่ที่ lib/marketplace/webhook-retry.ts ใช้ร่วมกับ Shopee/Lazada
import { NextRequest } from 'next/server';
import { runWebhookRetry } from '@/lib/marketplace/webhook-retry';
import type { TikTokAccountRow } from '@/lib/tiktok/api';
import { syncSingleOrder } from '@/lib/tiktok/webhook-processor';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return runWebhookRetry<TikTokAccountRow>(request, {
    platform: 'tiktok',
    process: async (job, account) => {
      // order-related push types
      if (![1, 2, 4, 12].includes(job.push_code)) return;
      const payload = job.raw_payload as { data?: Record<string, unknown> };
      const orderId = (payload.data?.order_id as string) || '';
      if (!orderId) return;
      await syncSingleOrder(account, orderId, (payload.data?.order_status as string) || undefined);
    },
  });
}
