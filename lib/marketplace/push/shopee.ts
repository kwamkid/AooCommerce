import { apiFetch } from '@/lib/api-client';
import type { PushProgress, PushResult } from './types';

/**
 * Push a promotion to a single Shopee shop via SSE endpoint.
 * Calls POST /api/shopee/deals and parses the SSE stream.
 */
export async function pushPromotionToShopee(
  promotionId: string,
  accountId: string,
  startTime: string,
  endTime: string,
  onProgress?: (progress: PushProgress) => void,
): Promise<PushResult> {
  const res = await apiFetch('/api/shopee/deals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      promotion_id: promotionId,
      account_id: accountId,
      start_time: startTime,
      end_time: endTime,
    }),
  });

  // Non-SSE error response
  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({ error: 'เกิดข้อผิดพลาด' }));
    return {
      account_id: accountId,
      shop_name: '',
      success: false,
      error: errBody.error || `HTTP ${res.status}`,
    };
  }

  // Parse SSE stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastError = '';
  let externalDealId: number | undefined;
  let partialWarning = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          onProgress?.(data as PushProgress);

          // Track deal_id from create_deal success
          if (data.step === 'create_deal' && data.status === 'success' && data.message) {
            const match = data.message.match(/deal_id:\s*(\d+)/);
            if (match) externalDealId = parseInt(match[1]);
          }

          // Track partial success warning from complete step
          if (data.step === 'complete' && data.status === 'success' && data.detail) {
            partialWarning = data.detail;
          }

          // Track errors
          if (data.status === 'error' && data.step !== 'rollback') {
            lastError = data.message || data.detail || 'Unknown error';
          }
        } catch {
          // ignore malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (lastError) {
    return {
      account_id: accountId,
      shop_name: '',
      success: false,
      error: lastError,
    };
  }

  return {
    account_id: accountId,
    shop_name: '',
    success: true,
    external_deal_id: externalDealId,
    warning: partialWarning || undefined,
  };
}
