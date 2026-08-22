// Marketplace quota circuit breaker — service กลางทุก platform (server-only)
//
// ปัญหาที่แก้: พอ quota/rate limit ของ platform หมด ทุก call ที่ยิงต่อ = fail ที่รู้ผลล่วงหน้า
// → success rate ยิ่งตก → โดนลงโทษต่อ (วงจรที่ Shopee เคยโดน ดู fix-bug.md 2026-08-22)
//
// การใช้:
//   - client ของแต่ละ platform เจอ error เข้าข่าย limit → markQuotaExhausted(platform)
//   - cron/retry/manual sync เช็ค isQuotaBlocked(platform) ก่อนทำงานเสมอ (blocked → skip ทั้งรอบ)
//   - UI (header bell / banner / superadmin monitor) อ่านผ่าน getBlockedPlatforms()
//
// Flag เก็บใน app_flags key `${platform}_quota_exhausted` value {until}
// (key ของ shopee ตรงกับของเดิม — backward compatible กับ flag ที่ live อยู่)

import { supabaseAdmin } from '@/lib/supabase-admin';

export const QUOTA_PLATFORMS = ['shopee', 'tiktok', 'lazada'] as const;
export type QuotaPlatform = typeof QUOTA_PLATFORMS[number];

const flagKey = (platform: QuotaPlatform) => `${platform}_quota_exhausted`;

/**
 * เวลาปลด breaker เริ่มต้นต่อ platform:
 * - shopee: quota เป็นรายวัน reset เที่ยงคืน UTC+8 (23:00 ไทย)
 * - tiktok/lazada: เป็น rolling rate limit ฟื้นเร็ว → พัก 30 นาทีพอ (caller override ได้)
 */
function defaultUntilIso(platform: QuotaPlatform): string {
  if (platform === 'shopee') {
    const utc8Now = Date.now() + 8 * 3600_000;
    const nextMidnightUtc8 = Math.ceil(utc8Now / 86_400_000) * 86_400_000;
    return new Date(nextMidnightUtc8 - 8 * 3600_000).toISOString();
  }
  return new Date(Date.now() + 30 * 60_000).toISOString();
}

/** เปิด circuit breaker ของ platform จนถึง untilIso (ไม่ส่ง = ค่า default ต่อ platform) */
export async function markQuotaExhausted(platform: QuotaPlatform, untilIso?: string): Promise<void> {
  const until = untilIso || defaultUntilIso(platform);
  console.warn(`[Quota] ${platform} quota exhausted — circuit open until ${until}`);
  await supabaseAdmin.from('app_flags').upsert({
    key: flagKey(platform),
    value: { until },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
}

/** true = quota ของ platform หมด ห้ามยิง API จนกว่าจะถึงเวลา until */
export async function isQuotaBlocked(platform: QuotaPlatform): Promise<{ blocked: boolean; until?: string }> {
  const { data } = await supabaseAdmin
    .from('app_flags')
    .select('value')
    .eq('key', flagKey(platform))
    .maybeSingle();
  const until = (data?.value as { until?: string } | null)?.until;
  if (until && new Date(until).getTime() > Date.now()) {
    return { blocked: true, until };
  }
  return { blocked: false };
}

/** ทุก platform ที่ breaker เปิดอยู่ตอนนี้ — query เดียว (ใช้กับ header summary / monitor) */
export async function getBlockedPlatforms(): Promise<{ platform: QuotaPlatform; until: string }[]> {
  const { data } = await supabaseAdmin
    .from('app_flags')
    .select('key, value')
    .in('key', QUOTA_PLATFORMS.map(flagKey));
  const now = Date.now();
  const out: { platform: QuotaPlatform; until: string }[] = [];
  for (const row of data || []) {
    const until = (row.value as { until?: string } | null)?.until;
    if (!until || new Date(until).getTime() <= now) continue;
    const platform = QUOTA_PLATFORMS.find(p => flagKey(p) === row.key);
    if (platform) out.push({ platform, until });
  }
  return out;
}

/** ปลด breaker ด้วยมือ (ปุ่มใน superadmin monitor) */
export async function clearQuotaFlag(platform: QuotaPlatform): Promise<void> {
  await supabaseAdmin.from('app_flags').delete().eq('key', flagKey(platform));
}

/** ข้อความ error จาก platform เข้าข่าย quota/rate limit มั้ย — ใช้เป็น detection ร่วม */
export function isQuotaErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return /daily api call limit|api call number|rate ?limit|too many request|throttl|call limit/i.test(message);
}
