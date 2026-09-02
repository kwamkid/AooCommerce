// ตัวเฝ้าสุขภาพ integration ข้ามทุกบริษัท — "ของที่พังแล้วไม่มีอาการ" ต้องมีคนคอยดูให้
//
// ⚠️ เกิดขึ้นเพราะ cron ดูดออเดอร์ Shopee ตายเงียบ 12 วัน (21 ส.ค.–2 ก.ย. 2026)
// หน้า superadmin แสดงสัญญาณอยู่แล้ว แต่ไม่มีใครเปิดดู → การ "แสดงผล" ไม่พอ
// ต้อง **เด้งไปหาคน** และต้องเด้งไปหา *คนที่แก้ได้* ไม่ใช่เด้งใส่ทุกคน
//
// เพิ่มเรื่องที่ต้องเฝ้า = เพิ่ม check ในไฟล์นี้ไฟล์เดียว
// หน้า superadmin กับตัวส่งแจ้งเตือนอ่านจากผลชุดเดียวกัน (ไม่มีทางเห็นไม่ตรงกัน)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendPushToUsers } from '@/lib/push/send';
import { MARKETPLACE_PLATFORMS, type QuotaPlatform } from '@/lib/marketplace/platforms';

export type WatchdogSeverity = 'critical' | 'warning';

export interface WatchdogIssue {
  /** คีย์ประจำปัญหา — ใช้กันแจ้งซ้ำ และเป็น tag ของ push (เด้งซ้ำจะทับใบเดิม) */
  code: string;
  /** system = ปัญหาของระบบ ร้านทำอะไรไม่ได้ (เตือน superadmin) · company = เจ้าของร้านแก้เองได้ */
  scope: 'system' | 'company';
  companyId: string | null;
  companyName: string | null;
  severity: WatchdogSeverity;
  title: string;
  detail: string;
  /** เปิดหน้าไหนเมื่อกดแจ้งเตือน */
  url: string;
}

/** ซิงค์ตามหลังเกินเท่านี้ = ผิดปกติ (cron ทุก 15 นาที — เผื่อพลาดได้หลายรอบก่อนกวน) */
const STALE_SYNC_HOURS = 3;
/** refresh token เหลือน้อยกว่านี้ = เตือนล่วงหน้าให้ไปต่ออายุ */
const TOKEN_EXPIRY_WARN_DAYS = 3;
/** เตือนซ้ำเรื่องเดิมได้บ่อยสุดเท่านี้ ตราบใดที่ยังไม่หาย */
const RENOTIFY_HOURS = 6;

const WATCHDOG_STATE_KEY = 'watchdog_state';
const WATCHDOG_HEARTBEAT_KEY = 'watchdog_last_run';

function hoursAgo(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

function platformLabel(platform: string | null): string {
  const key = (platform || 'shopee') as QuotaPlatform;
  return MARKETPLACE_PLATFORMS[key]?.label || key;
}

function roundHours(h: number): string {
  return h < 48 ? `${Math.round(h)} ชม.` : `${Math.round(h / 24)} วัน`;
}

/**
 * ตรวจทุกอย่างแล้วคืนรายการปัญหาที่ "กำลังเกิดอยู่ตอนนี้" — อ่านอย่างเดียว ไม่ส่งอะไร
 * ใช้ทั้งจาก cron (เพื่อส่งแจ้งเตือน) และหน้า superadmin (เพื่อแสดงผล)
 */
export async function collectWatchdogIssues(): Promise<WatchdogIssue[]> {
  const issues: WatchdogIssue[] = [];
  const now = Date.now();
  const stale: {
    platform: string; label: string; shop: string; behind: number;
    companyId: string; companyName: string | null;
  }[] = [];

  const [{ data: accounts }, { data: companies }, { data: flags }] = await Promise.all([
    supabaseAdmin
      .from('marketplace_accounts')
      .select('id, company_id, platform, shop_id, shop_name, is_active, last_sync_at, created_at, refresh_token, refresh_token_expires_at, chat_access_token, chat_refresh_token_expires_at, updated_at'),
    supabaseAdmin.from('companies').select('id, name'),
    supabaseAdmin.from('app_flags').select('key, value').like('key', '%quota_exhausted%'),
  ]);

  const companyName = new Map((companies || []).map(c => [c.id, c.name as string]));

  for (const a of accounts || []) {
    const label = platformLabel(a.platform);
    const shop = a.shop_name || `${label} ${a.shop_id}`;
    const base = {
      companyId: a.company_id as string,
      companyName: companyName.get(a.company_id) || null,
    };

    // ร้านถูกปิดอัตโนมัติ (refresh token ตาย) — เจ้าของร้านต้องไปกดเชื่อมใหม่เอง
    if (!a.is_active) {
      const disconnectedFor = hoursAgo(a.updated_at);
      if (a.refresh_token && disconnectedFor !== null && disconnectedFor < 24 * 30) {
        issues.push({
          ...base,
          code: `shop_disconnected:${a.id}`,
          scope: 'company',
          severity: 'critical',
          title: `${label} หลุดการเชื่อมต่อ`,
          detail: `ร้าน ${shop} ถูกปิดการเชื่อมต่ออัตโนมัติ — ออเดอร์จะไม่เข้าระบบจนกว่าจะเชื่อมใหม่`,
          url: '/settings/sales-channels?tab=marketplace',
        });
      }
      continue; // ร้านที่ปิดอยู่ ไม่ต้องเช็คเรื่องอื่นต่อ
    }

    // ซิงค์ตามหลัง — cron ตาย / ร้านถูกข้ามคิวถาวร (บทเรียน 21 ส.ค.–2 ก.ย. 2026)
    // เก็บไว้ก่อน ค่อยรวมกลุ่มทีหลัง (หลายร้านของเจ้าเดียวกันค้าง = สาเหตุเดียว ไม่ใช่หลายเรื่อง)
    const behind = hoursAgo(a.last_sync_at || a.created_at);
    if (behind !== null && behind > STALE_SYNC_HOURS) {
      stale.push({ platform: a.platform || 'shopee', label, shop, behind, ...base });
    }

    // refresh token ของขาออเดอร์
    const tokenLeftH = a.refresh_token_expires_at
      ? (new Date(a.refresh_token_expires_at).getTime() - now) / 3_600_000
      : null;
    if (tokenLeftH !== null && tokenLeftH <= 0) {
      issues.push({
        ...base,
        code: `token_expired:${a.id}`,
        scope: 'company',
        severity: 'critical',
        title: `${label} token หมดอายุ`,
        detail: `ร้าน ${shop} ต้องกดเชื่อมต่อใหม่ ไม่งั้นออเดอร์จะไม่เข้าระบบ`,
        url: '/settings/sales-channels?tab=marketplace',
      });
    } else if (tokenLeftH !== null && tokenLeftH < TOKEN_EXPIRY_WARN_DAYS * 24) {
      issues.push({
        ...base,
        code: `token_expiring:${a.id}`,
        scope: 'company',
        severity: 'warning',
        title: `${label} token ใกล้หมดอายุ`,
        detail: `ร้าน ${shop} เหลืออีก ${roundHours(tokenLeftH)} — เชื่อมต่อใหม่ก่อนของจะหมดอายุ`,
        url: '/settings/sales-channels?tab=marketplace',
      });
    }

    // token ขาแชท (TikTok/Lazada ใช้ app แชทแยก) — ตายแล้วต่ออายุเองไม่ได้ ต้องกดอนุญาตใหม่
    const chatDead = a.chat_access_token
      && a.chat_refresh_token_expires_at
      && new Date(a.chat_refresh_token_expires_at).getTime() < now;
    if (chatDead) {
      issues.push({
        ...base,
        code: `chat_token_expired:${a.id}`,
        scope: 'company',
        severity: 'warning',
        title: `แชท ${label} หมดอายุ`,
        detail: `ร้าน ${shop} ตอบแชทลูกค้าไม่ได้ — ไปกด "เชื่อมต่อแชทใหม่" ที่ตั้งค่า > ช่องทางแชท`,
        url: '/settings/chat-channels',
      });
    }
  }

  // ร้านของแพลตฟอร์มเดียวกันค้างพร้อมกันหลายร้าน = cron ของเจ้านั้นตาย ไม่ใช่ปัญหาราย
  // ร้าน — รวมเป็นใบเดียว ไม่งั้นเปิดมือถือมาเจอแจ้งเตือน 6 ใบที่บอกเรื่องเดียวกัน
  const staleByPlatform = new Map<string, typeof stale>();
  for (const s of stale) {
    const list = staleByPlatform.get(s.platform) || [];
    list.push(s);
    staleByPlatform.set(s.platform, list);
  }
  for (const [platform, list] of staleByPlatform) {
    const worst = Math.max(...list.map(s => s.behind));
    const severity: WatchdogSeverity = worst > 24 ? 'critical' : 'warning';
    if (list.length === 1) {
      const only = list[0];
      issues.push({
        code: `sync_stale:${platform}:${only.shop}`,
        scope: 'system',
        companyId: only.companyId,
        companyName: only.companyName,
        severity,
        title: `${only.label} ซิงค์ตามหลัง ${roundHours(worst)}`,
        detail: `ร้าน ${only.shop} ดูดออเดอร์ล่าสุดเมื่อ ${roundHours(worst)}ที่แล้ว — ปกติทุก 15 นาที`,
        url: '/superadmin/api-monitor',
      });
    } else {
      issues.push({
        code: `sync_stale:${platform}`,
        scope: 'system',
        companyId: null,
        companyName: null,
        severity,
        title: `${list[0].label} ซิงค์ตามหลัง ${list.length} ร้าน`,
        detail: `ร้านที่ค้างนานสุด ${roundHours(worst)} — น่าจะเป็น cron ของ ${list[0].label} ไม่ใช่ปัญหาของร้านใดร้านหนึ่ง`,
        url: '/superadmin/api-monitor',
      });
    }
  }

  // webhook ที่ retry จนหมดสิทธิ์แล้ว = ออเดอร์/ข้อความหายจริง ต้องมีคนไปดู
  const { count: deadLetters } = await supabaseAdmin
    .from('marketplace_webhook_log')
    .select('id', { count: 'exact', head: true })
    .eq('processing_status', 'dead_letter')
    .gte('created_at', new Date(now - 24 * 3_600_000).toISOString());

  if (deadLetters && deadLetters > 0) {
    issues.push({
      code: 'dead_letter',
      scope: 'system',
      companyId: null,
      companyName: null,
      severity: 'critical',
      title: `webhook ตกค้าง ${deadLetters} ใบ`,
      detail: `24 ชม.ที่ผ่านมามี webhook ${deadLetters} ใบที่ retry จนครบแล้วยังไม่สำเร็จ — ของในใบนั้นยังไม่เข้าระบบ`,
      url: '/superadmin/api-monitor',
    });
  }

  // โควตาโดนแบนอยู่ — งานของ scope นั้นหยุดหมดจนกว่าจะถึงเวลาปลด
  for (const f of flags || []) {
    const until = (f.value as { until?: string } | null)?.until;
    if (!until || new Date(until).getTime() < now) continue;
    const name = f.key.replace('_quota_exhausted', '').replace(':', ' · ');
    issues.push({
      code: `quota:${f.key}`,
      scope: 'system',
      companyId: null,
      companyName: null,
      severity: 'warning',
      title: `โควตา ${name} เต็ม`,
      detail: `พักการเรียก API ถึง ${new Date(until).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
      url: '/superadmin/api-monitor',
    });
  }

  return issues;
}

type WatchdogState = Record<string, { since: string; notified_at: string }>;

/**
 * ตรวจ + เด้งเตือนคนที่แก้ได้ + จำว่าเตือนอะไรไปแล้ว
 * - เรื่องใหม่ → เตือนทันที
 * - เรื่องเดิมที่ยังไม่หาย → เตือนซ้ำได้ทุก RENOTIFY_HOURS ชม.
 * - เรื่องที่หายแล้ว → บอกว่ากลับมาปกติ 1 ครั้ง แล้วลืมมันไป
 */
export async function runWatchdog(): Promise<{
  issues: number;
  notified: number;
  recovered: number;
}> {
  const issues = await collectWatchdogIssues();
  const now = new Date();

  const { data: flagRow } = await supabaseAdmin
    .from('app_flags')
    .select('value')
    .eq('key', WATCHDOG_STATE_KEY)
    .maybeSingle();
  const prev = ((flagRow?.value as WatchdogState) || {}) as WatchdogState;

  const superAdminIds = await getSuperAdminIds();
  const next: WatchdogState = {};
  let notified = 0;

  for (const issue of issues) {
    const before = prev[issue.code];
    const lastNotified = before ? new Date(before.notified_at).getTime() : 0;
    const due = now.getTime() - lastNotified > RENOTIFY_HOURS * 3_600_000;

    next[issue.code] = {
      since: before?.since || now.toISOString(),
      notified_at: due ? now.toISOString() : before!.notified_at,
    };
    if (!due) continue;

    const targets = issue.scope === 'system'
      ? superAdminIds
      : await getCompanyManagerIds(issue.companyId!);
    if (targets.length === 0) continue;

    await sendPushToUsers(targets, {
      title: issue.severity === 'critical' ? `⚠️ ${issue.title}` : issue.title,
      body: issue.detail,
      url: issue.url,
      tag: issue.code,
    });
    notified++;
  }

  // เรื่องที่หายไปแล้ว — บอกครั้งเดียวว่ากลับมาปกติ (เฉพาะที่เคยเตือนไปจริง)
  const goneCodes = Object.keys(prev).filter(code => !next[code]);
  let recovered = 0;
  if (goneCodes.length > 0 && superAdminIds.length > 0) {
    await sendPushToUsers(superAdminIds, {
      title: 'กลับมาปกติแล้ว',
      body: goneCodes.length === 1
        ? 'ปัญหาที่แจ้งไว้ก่อนหน้านี้หายแล้ว'
        : `${goneCodes.length} เรื่องที่แจ้งไว้ก่อนหน้านี้หายแล้ว`,
      url: '/superadmin/api-monitor',
      tag: 'watchdog_recovered',
    });
    recovered = goneCodes.length;
  }

  const summary = { issues: issues.length, notified, recovered };

  await supabaseAdmin.from('app_flags').upsert([
    { key: WATCHDOG_STATE_KEY, value: next, updated_at: now.toISOString() },
    // ร่องรอยว่าตัวเฝ้ายังหายใจอยู่ — หน้า superadmin เอาไปโชว์ "ตรวจล่าสุดเมื่อ ..."
    // ค่านี้ค้างเมื่อไหร่ = ตัวเฝ้าตาย ให้ไปดู cron-job.org
    { key: WATCHDOG_HEARTBEAT_KEY, value: { at: now.toISOString(), ...summary }, updated_at: now.toISOString() },
  ], { onConflict: 'key' });

  return summary;
}

async function getSuperAdminIds(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .eq('is_super_admin', true);
  return (data || []).map(u => u.id as string);
}

/** เจ้าของ/แอดมินของบริษัทนั้น — เรื่องที่ร้านแก้เองได้ ไม่ต้องปลุกพนักงานทุกคน */
async function getCompanyManagerIds(companyId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('company_members')
    .select('user_id, roles')
    .eq('company_id', companyId)
    .eq('is_active', true);
  return (data || [])
    .filter(m => (m.roles as string[] | null)?.some(r => r === 'owner' || r === 'admin'))
    .map(m => m.user_id as string);
}
