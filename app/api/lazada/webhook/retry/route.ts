// Path: app/api/lazada/webhook/retry/route.ts
// Cron: ทุก 5 นาที — ไล่ webhook Lazada ที่ทำไม่สำเร็จ (โครงกลางอยู่ที่
// lib/marketplace/webhook-retry.ts ใช้ร่วมกับ Shopee/TikTok)
//
// ⚠️ ต้องเพิ่มใน cron-job.org: GET /api/lazada/webhook/retry ทุก */5 * * * *
import { NextRequest } from 'next/server';
import { runWebhookRetry } from '@/lib/marketplace/webhook-retry';
import type { LazadaAccountRow } from '@/lib/lazada/api';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return runWebhookRetry<LazadaAccountRow>(request, {
    platform: 'lazada',
    process: async (job, account) => {
      const payload = job.raw_payload as { data?: Record<string, unknown> };
      const data = payload.data || {};

      // message_type 0 = order push · ที่เหลือถือเป็นฝั่งแชท (notify-then-pull ทั้งคู่)
      if (job.push_code === 0) {
        const orderId = String(
          data.trade_order_id ?? data.order_id ?? data.trade_order_line_id ?? '',
        ).split('_')[0];
        if (!orderId) return;
        const { syncSingleLazadaOrder } = await import('@/lib/lazada/sync');
        const result = await syncSingleLazadaOrder(account, orderId);
        if (result.errors.length > 0) throw new Error(result.errors.join('; '));
        return;
      }

      const { processLazadaPush } = await import('@/lib/services/chat/lazada');
      const result = await processLazadaPush(
        account,
        payload as Parameters<typeof processLazadaPush>[1],
      );
      // 'skipped' = ไม่มีอะไรให้ทำจริง ๆ (ปิดแชทอยู่) ไม่ใช่ความล้มเหลว → ไม่ throw
      if (result.status === 'skipped' && result.detail?.startsWith('Session sync failed')) {
        throw new Error(result.detail);
      }
    },
  });
}
