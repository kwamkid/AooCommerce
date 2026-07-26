// Path: lib/request-ip.ts
import type { NextRequest } from 'next/server';

/**
 * Best-effort client IP for rate-limiting. On Vercel the real client IP is the
 * first entry of x-forwarded-for. Falls back to x-real-ip, then 'unknown'
 * (which buckets all unknowns together — acceptable for a throttle).
 */
export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}
