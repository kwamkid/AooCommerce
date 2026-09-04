// Marketplace quota circuit breaker — service กลางทุก platform (server-only)
//
// ปัญหาที่แก้: พอ quota/rate limit ของ platform หมด ทุก call ที่ยิงต่อ = fail ที่รู้ผลล่วงหน้า
// → success rate ยิ่งตก → โดนลงโทษต่อ (วงจรที่ Shopee เคยโดน ดู fix-bug.md 2026-08-22)
//
// **แยกเป็น scope แล้ว (2026-08-29)** — เดิม breaker เป็นก้อนเดียวต่อ platform ทำให้
// แชท Lazada ที่ยิงรัวจนโดน rate limit ไป**ลาก order sync ตายด้วย 30 นาที** ทั้งที่เป็น
// คนละ app คนละ app_key คนละถังโควตา (ดู fix-bug.md 2026-08-29)
//
// พฤติกรรมต่อ platform (ป้ายชื่อ · โควตาฟื้นยังไง · map path→scope · ระยะห่าง)
// อยู่ที่ **platforms.ts ที่เดียว** — เพิ่ม marketplace ใหม่ให้อ่านหัวไฟล์นั้น
//
// การใช้ (ฝั่ง client ของแต่ละ platform — 2 บรรทัด):
//   const scope = await beginMarketplaceCall('lazada', apiPath);        // ก่อน fetch
//   reportMarketplaceError('lazada', scope, errMsg, { httpStatus });    // ตอนเจอ error
// การใช้ (ฝั่ง cron/retry/manual sync):
//   const quota = await isQuotaBlocked('lazada', 'order'); if (quota.blocked) return;
// การใช้ (ฝั่ง UI): getBlockedPlatforms() ผ่าน /api/header/summary
//
// Flag เก็บใน app_flags key `${platform}_quota_exhausted[:${scope}]` value {until}
// (key ที่ไม่มี :scope = ทั้ง app — ตรงกับ key เดิมของ shopee ที่ live อยู่ backward compatible)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { MARKETPLACE_PLATFORMS, QUOTA_PLATFORMS, QUOTA_SCOPES, QUOTA_TARGETS, matchScope } from './platforms';
import type { QuotaPlatform, QuotaScope, QuotaTarget } from './platforms';
import { throttleMarketplace } from './throttle';

// re-export ให้ call site ฝั่ง server เรียกจากที่เดิมได้ (ของจริงอยู่ platforms.ts)
export {
  QUOTA_PLATFORMS,
  QUOTA_SCOPES,
  QUOTA_TARGETS,
  QUOTA_SCOPE_LABELS,
  QUOTA_PLATFORM_LABELS,
  QUOTA_SCOPE_IMPACT,
  MARKETPLACE_PLATFORMS,
} from './platforms';
export type { QuotaPlatform, QuotaScope, QuotaTarget } from './platforms';

const flagKey = (platform: QuotaPlatform, target: QuotaTarget = 'all') =>
  target === 'all' ? `${platform}_quota_exhausted` : `${platform}_quota_exhausted:${target}`;

function parseFlagKey(key: string): { platform: QuotaPlatform; scope: QuotaTarget } | null {
  const [base, scope] = key.split(':');
  const platform = QUOTA_PLATFORMS.find(p => `${p}_quota_exhausted` === base);
  if (!platform) return null;
  if (!scope) return { platform, scope: 'all' };
  if ((QUOTA_SCOPES as readonly string[]).includes(scope)) {
    return { platform, scope: scope as QuotaScope };
  }
  return null;
}

/** ISO ของ "อีก N นาที" — ใช้ตอนเจอ rate limit ชั่วคราวที่ไม่ใช่โควตารายวัน */
export function pauseUntil(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/** เที่ยงคืนถัดไปตามเวลา UTC+8 (โควตารายวันของ Shopee reset ตอนนี้ = 23:00 ไทย) */
function nextMidnightUtc8Iso(): string {
  const utc8Now = Date.now() + 8 * 3600_000;
  const nextMidnightUtc8 = Math.ceil(utc8Now / 86_400_000) * 86_400_000;
  return new Date(nextMidnightUtc8 - 8 * 3600_000).toISOString();
}

/** เวลาปลด breaker เริ่มต้นของ platform — อ่านจาก registry (ไม่ใช่ if ต่อ platform) */
function defaultUntilIso(platform: QuotaPlatform): string {
  const reset = MARKETPLACE_PLATFORMS[platform].quotaReset;
  return reset.kind === 'daily-utc8' ? nextMidnightUtc8Iso() : pauseUntil(reset.minutes);
}

/**
 * เดา scope จาก API path — path มีอยู่แล้วทุกจุดในตัว client จึงไม่ต้องแก้ call site เป็นร้อยที่
 * path ที่ยังไม่ได้ map → 'all' (บล็อกกว้างไว้ก่อน ปลอดภัยกับ success rate) + log เตือน
 */
export function scopeFromPath(platform: QuotaPlatform, apiPath: string): QuotaTarget {
  const scope = matchScope(platform, apiPath);
  if (scope) return scope;
  console.warn(`[Quota] ${platform} path ยังไม่ได้ map scope: ${apiPath} — บล็อกทั้ง platform ไปก่อน (เพิ่ม scopeRules ที่ platforms.ts)`);
  return 'all';
}

/**
 * เรียกก่อนยิงทุก request ของ marketplace — หน่วงจังหวะตาม registry แล้วคืน scope
 * ให้เอาไปส่งต่อ reportMarketplaceError ตอนเจอ error (คำนวณ scope ครั้งเดียวต่อ request)
 */
export async function beginMarketplaceCall(
  platform: QuotaPlatform,
  apiPath: string
): Promise<QuotaTarget> {
  const scope = scopeFromPath(platform, apiPath);
  await throttleMarketplace(platform, scope);
  return scope;
}

/**
 * รายงาน error จาก marketplace — ถ้าเข้าข่าย quota/rate limit จะเปิด breaker ของ scope นั้นให้
 * (ไม่เข้าข่าย = ไม่ทำอะไร เรียกได้กับทุก error โดยไม่ต้องเช็คก่อน) · ไม่ throw และไม่ต้อง await
 *
 * platform ที่โควตาเป็นรายวัน: error ที่บอกว่า "daily" → รอ reset จริง · error อื่น
 * (rate limit ชั่วคราว) → พัก 30 นาทีพอ จะได้ไม่ปิดยาวเกินเหตุ
 */
export function reportMarketplaceError(
  platform: QuotaPlatform,
  scope: QuotaTarget,
  message: string | null | undefined,
  opts: { httpStatus?: number; code?: string } = {}
): void {
  const isLimit =
    opts.httpStatus === 429 ||
    opts.code === 'ApiCallLimit' ||
    isQuotaErrorMessage(message);
  if (!isLimit) return;

  const reset = MARKETPLACE_PLATFORMS[platform].quotaReset;
  const isDaily = reset.kind === 'daily-utc8' && /daily/i.test(message || '');
  const until = reset.kind === 'daily-utc8' && !isDaily ? pauseUntil(30) : undefined;

  markQuotaExhausted(platform, scope, until, message || undefined).catch(() => {});
}

/** เปิด circuit breaker ของ platform+scope จนถึง untilIso (ไม่ส่ง = ค่า default ต่อ platform) */
export async function markQuotaExhausted(
  platform: QuotaPlatform,
  scope: QuotaTarget = 'all',
  untilIso?: string,
  /** ข้อความจริงจาก platform ที่ทำให้ breaker เปิด — ไม่เก็บไว้จะไม่มีใครรู้ว่าเพราะอะไร */
  reason?: string
): Promise<void> {
  const until = untilIso || defaultUntilIso(platform);
  console.warn(`[Quota] ${platform}:${scope} quota exhausted — circuit open until ${until}`, reason || '');
  // เก็บ reason ไว้ด้วยเสมอ — breaker เปิดโดยไม่มีร่องรอยว่าโดนอะไร ทำให้ไล่หา
  // ต้นเหตุไม่ได้เลย (ตัว client ไม่ได้ log error ของ Lazada ไว้ที่ไหน)
  await supabaseAdmin.from('app_flags').upsert({
    key: flagKey(platform, scope),
    value: { until, reason: reason?.slice(0, 300), at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
}

/**
 * true = ห้ามยิง API ของ platform+scope นี้จนกว่าจะถึงเวลา until
 *
 * บล็อกเมื่อ flag ของ scope นั้นเปิด **หรือ** flag ระดับ 'all' เปิด (ทั้ง app โดน)
 * ไม่ส่ง scope = ถามว่า platform โดนบล็อกทั้งก้อนมั้ย
 */
export async function isQuotaBlocked(
  platform: QuotaPlatform,
  scope: QuotaTarget = 'all'
): Promise<{ blocked: boolean; until?: string; scope?: QuotaTarget }> {
  const keys = scope === 'all' ? [flagKey(platform)] : [flagKey(platform), flagKey(platform, scope)];
  const { data } = await supabaseAdmin
    .from('app_flags')
    .select('key, value')
    .in('key', keys);

  const now = Date.now();
  let blockedUntil = 0;
  let blockedScope: QuotaTarget | undefined;
  for (const row of data || []) {
    const until = (row.value as { until?: string } | null)?.until;
    const ts = until ? new Date(until).getTime() : 0;
    if (ts <= now || ts <= blockedUntil) continue;
    blockedUntil = ts;
    blockedScope = parseFlagKey(row.key)?.scope;
  }
  if (blockedUntil > now) {
    return { blocked: true, until: new Date(blockedUntil).toISOString(), scope: blockedScope };
  }
  return { blocked: false };
}

/** ทุก platform+scope ที่ breaker เปิดอยู่ตอนนี้ — query เดียว (ใช้กับ header summary / monitor) */
export async function getBlockedPlatforms(): Promise<
  { platform: QuotaPlatform; scope: QuotaTarget; until: string }[]
> {
  const allKeys = QUOTA_PLATFORMS.flatMap(p => QUOTA_TARGETS.map(t => flagKey(p, t)));
  const { data } = await supabaseAdmin
    .from('app_flags')
    .select('key, value')
    .in('key', allKeys);

  const now = Date.now();
  const out: { platform: QuotaPlatform; scope: QuotaTarget; until: string }[] = [];
  for (const row of data || []) {
    const until = (row.value as { until?: string } | null)?.until;
    if (!until || new Date(until).getTime() <= now) continue;
    const parsed = parseFlagKey(row.key);
    if (parsed) out.push({ ...parsed, until });
  }
  return out;
}

/** ปลด breaker ด้วยมือ (ปุ่มใน superadmin monitor) — ไม่ส่ง scope = ปลดทุก scope ของ platform */
export async function clearQuotaFlag(platform: QuotaPlatform, scope?: QuotaTarget): Promise<void> {
  const keys = scope ? [flagKey(platform, scope)] : QUOTA_TARGETS.map(t => flagKey(platform, t));
  await supabaseAdmin.from('app_flags').delete().in('key', keys);
}

/** ข้อความ error จาก platform เข้าข่าย quota/rate limit มั้ย — ใช้เป็น detection ร่วม */
export function isQuotaErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return /daily api call limit|api call number|rate ?limit|too many request|throttl|call limit/i.test(message);
}
