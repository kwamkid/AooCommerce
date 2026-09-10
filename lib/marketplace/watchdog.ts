// ตัวเฝ้าสุขภาพ integration — "ของที่พังแล้วไม่มีอาการ" ต้องมีคนคอยดูให้
//
// ⚠️ เกิดขึ้นเพราะ cron ดูดออเดอร์ Shopee ตายเงียบ 12 วัน (21 ส.ค.–2 ก.ย. 2026)
// หน้า superadmin แสดงสัญญาณอยู่แล้ว แต่ไม่มีใครเปิดดู → การ "แสดงผล" ไม่พอ
// ต้อง **เด้งไปหาคน** · เด้งไปหา *คนที่แก้ได้* · และต้องบอก **วิธีแก้ + ทางไปแก้**
// ไม่ใช่บอกแค่ว่าพัง (เจ้าของร้านอ่านแล้วต้องลงมือต่อได้ทันที)
//
// เพิ่มเรื่องที่ต้องเฝ้า = เพิ่ม check ในไฟล์นี้ไฟล์เดียว — หน้า superadmin · การ์ดใน
// dashboard ของร้าน · กระดิ่ง · push ทั้งหมดอ่านจากผลชุดเดียวกัน ไม่มีทางเห็นไม่ตรงกัน

import { supabaseAdmin } from '@/lib/supabase-admin';
import { isShortPause } from '@/lib/marketplace/quota';
import { sendPushToUsers, withCompanyParam } from '@/lib/push/send';
import { MARKETPLACE_PLATFORMS, type QuotaPlatform } from '@/lib/marketplace/platforms';
import { BEAM_RECONCILE_NOTE } from '@/lib/beam/settle';
// ตรวจสุขภาพช่องทางแชทแบบถามแพลตฟอร์มจริง — แทนการเดาจาก "ความเงียบ" ที่เตือนผิดตลอด
import { runChatChannelHealthChecks, chatHealthFix } from '@/lib/chat/channel-health';
import { AD_ACCOUNT_FIX } from '@/lib/ads/accounts';

export type WatchdogSeverity = 'critical' | 'warning';

export interface WatchdogIssue {
  /** คีย์ประจำปัญหา — ใช้กันแจ้งซ้ำ และเป็น tag ของ push (เด้งซ้ำจะทับใบเดิม) */
  code: string;
  /** ปัญหาที่มีสาเหตุร่วมกัน (เช่น cron เจ้าเดียวตาย = ทุกร้านของเจ้านั้น) — รวมเป็นแจ้งเตือนใบเดียว */
  groupKey: string;
  /** system = ระบบพัง เจ้าของร้านแก้เองไม่ได้ · company = ร้านแก้เองได้ */
  scope: 'system' | 'company';
  companyId: string | null;
  companyName: string | null;
  severity: WatchdogSeverity;
  /** ร้าน/ช่องทางที่เป็นต้นเรื่อง — UI เอาไปวาด <ChannelBadge> (โลโก้ร้าน + ไอคอนช่องทาง) */
  channel: { platform: string; picture_url: string | null; shopName: string | null } | null;
  title: string;
  detail: string;
  /** วิธีแก้แบบลงมือได้ทันที — ห้ามเขียนลอย ๆ ว่า "ตรวจสอบระบบ" */
  fix: string;
  /** ป้ายบนปุ่มที่พาไปหน้าที่แก้ได้จริง */
  actionLabel: string;
  url: string;
  /** เตือนซ้ำเรื่องนี้ได้บ่อยสุดกี่ชั่วโมง — ไม่ใส่ = RENOTIFY_HOURS (6 ชม.)
   *  เรื่องที่ไม่เร่ง (บริษัทเงียบ/รอครบกำหนดลบ) ตั้งยาวขึ้นได้ ไม่งั้นกวนทุก 6 ชม. เป็นเดือน */
  renotifyHours?: number;
}

/** ซิงค์ตามหลังเกินเท่านี้ = ผิดปกติ (cron ทุก 15 นาที — เผื่อพลาดได้หลายรอบก่อนกวน) */
const STALE_SYNC_HOURS = 3;
/** refresh token เหลือน้อยกว่านี้ = เตือนล่วงหน้าให้ไปต่ออายุ */
const TOKEN_EXPIRY_WARN_DAYS = 3;
/** เตือนซ้ำเรื่องเดิมได้บ่อยสุดเท่านี้ ตราบใดที่ยังไม่หาย (ต่อ issue ตั้งเองได้ด้วย renotifyHours) */
const RENOTIFY_HOURS = 6;
/** บริษัทเงียบเกินเท่านี้ = น่าจะเลิกใช้ · ปิดครบเท่านี้ = ลบถาวรได้ (ตรงกับกติกาใน /api/superadmin/companies) */
const COMPANY_QUIET_DAYS = 30;
/** ตั้งเวลาส่งไว้แล้วเลยมาเกินเท่านี้ = cron ที่หยิบใบไปส่งไม่ทำงาน (cron ทุก 5 นาที — เผื่อพลาดได้หลายรอบ) */
const BROADCAST_OVERDUE_MINUTES = 20;
/** cron ของสายโฆษณาเงียบเกินเท่านี้ = ตาย (ตั้งไว้ทุก 15 นาที — เผื่อพลาดได้ 3 รอบก่อนกวน) */
const ADS_JOBS_STALE_MINUTES = 60;

const ADS_JOBS_HEARTBEAT_KEY = 'ads_jobs_last_run';

const WATCHDOG_STATE_KEY = 'watchdog_state';
const WATCHDOG_HEARTBEAT_KEY = 'watchdog_last_run';

// ลิงก์ต้องพาไปถึง **แท็บของแพลตฟอร์มนั้น** ไม่ใช่แค่หน้ารวม — คนกดแจ้งเตือนแล้วต้อง
// เห็นร้านที่มีปัญหาเลย ไม่ใช่มาไล่หาแท็บเอง (ทั้งสองหน้าอ่าน #anchor ตอน mount อยู่แล้ว)
const marketplaceSettingsUrl = (platform: string) =>
  `/settings/sales-channels?tab=marketplace#${platform}`;
const chatSettingsUrl = (platform: string) => `/settings/chat-channels#${platform}`;

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
 *
 * @param opts.companyId ระบุ = เอาเฉพาะของบริษัทนั้น (การ์ดใน dashboard + กระดิ่ง)
 *        ไม่ระบุ = ทั้งระบบ รวมเรื่องที่ไม่ผูกบริษัท (หน้า superadmin + cron)
 */
export async function collectWatchdogIssues(
  opts: { companyId?: string } = {}
): Promise<WatchdogIssue[]> {
  const issues: WatchdogIssue[] = [];
  const now = Date.now();
  const scoped = !!opts.companyId;

  let accountQuery = supabaseAdmin
    .from('marketplace_accounts')
    .select('id, company_id, platform, shop_id, shop_name, is_active, last_sync_at, created_at, refresh_token, refresh_token_expires_at, chat_access_token, chat_refresh_token_expires_at, updated_at, metadata');
  if (opts.companyId) accountQuery = accountQuery.eq('company_id', opts.companyId);

  const [{ data: accounts }, { data: companies }] = await Promise.all([
    accountQuery,
    scoped
      ? Promise.resolve({ data: [] as { id: string; name: string }[] })
      : supabaseAdmin.from('companies').select('id, name'),
  ]);

  const companyName = new Map((companies || []).map(c => [c.id, c.name as string]));

  for (const a of accounts || []) {
    const platform = a.platform || 'shopee';
    const label = platformLabel(a.platform);
    const shop = a.shop_name || `${label} ${a.shop_id}`;
    const base = {
      companyId: a.company_id as string,
      companyName: companyName.get(a.company_id) || null,
      channel: {
        platform,
        // โลโก้ร้านที่ดึงมาจากแพลตฟอร์ม (หรือที่ผู้ใช้ตั้งเอง) — ไม่มีก็ปล่อยให้
        // ChannelBadge วาดไอคอนช่องทางบนพื้นกลมแทน
        picture_url: ((a.metadata as Record<string, unknown> | null)?.shop_logo as string) || null,
        shopName: a.shop_name as string | null,
      },
    };

    // ร้านถูกปิดอัตโนมัติ (refresh token ตาย) — เจ้าของร้านต้องไปกดเชื่อมใหม่เอง
    if (!a.is_active) {
      const disconnectedFor = hoursAgo(a.updated_at);
      if (a.refresh_token && disconnectedFor !== null && disconnectedFor < 24 * 30) {
        issues.push({
          ...base,
          code: `shop_disconnected:${a.id}`,
          groupKey: 'shop_disconnected',
          scope: 'company',
          severity: 'critical',
          // ชื่อร้านต้องอยู่ในหัวข้อ — บริษัทที่มี 7 ร้านบนแพลตฟอร์มเดียวกันจะได้แจ้งเตือน
          // "TikTok Shop ซิงค์ตามหลัง" ซ้ำกัน 2 ใบโดยไม่รู้ว่าร้านไหน (7 ก.ย. 2026)
          title: `${label} "${shop}" หลุดการเชื่อมต่อ`,
          detail: `ร้าน ${shop} ถูกปิดการเชื่อมต่ออัตโนมัติ — ออเดอร์ใหม่จะไม่เข้าระบบจนกว่าจะเชื่อมใหม่`,
          fix: `เปิด ตั้งค่า > ช่องทางการขาย > เชื่อมต่อ Marketplace แล้วกดเชื่อมต่อร้าน ${shop} ใหม่ (ล็อกอิน ${label} ของร้านให้พร้อม)`,
          actionLabel: 'ไปเชื่อมต่อร้านใหม่',
          url: marketplaceSettingsUrl(platform),
        });
      }
      continue; // ร้านที่ปิดอยู่ ไม่ต้องเช็คเรื่องอื่นต่อ
    }

    // ซิงค์ตามหลัง — cron ตาย / ร้านถูกข้ามคิวถาวร (บทเรียน 21 ส.ค.–2 ก.ย. 2026)
    // scope=system เพราะร้านแก้เองไม่ได้ แต่ยังผูก companyId ไว้ → ร้านเห็นบน dashboard
    // ของตัวเองด้วย จะได้รู้ว่าตัวเลขที่เห็นอาจยังไม่ครบ ไม่ใช่รู้กันแค่ผู้ดูแลระบบ
    const behind = hoursAgo(a.last_sync_at || a.created_at);
    if (behind !== null && behind > STALE_SYNC_HOURS) {
      issues.push({
        ...base,
        code: `sync_stale:${a.id}`,
        groupKey: `sync_stale:${platform}`,
        scope: 'system',
        severity: behind > 24 ? 'critical' : 'warning',
        title: `${label} "${shop}" ซิงค์ตามหลัง ${roundHours(behind)}`,
        detail: `ร้าน ${shop} ดูดออเดอร์รอบล่าสุดถึงเมื่อ ${roundHours(behind)}ที่แล้ว (ปกติทุก 15 นาที) — ออเดอร์ที่เข้าทาง webhook ยังครบ แต่ตัวสำรองที่คอยเก็บตกไม่ทำงาน`,
        fix: `กด "ซิงค์ออเดอร์" ของร้านนี้ที่หน้าเชื่อมต่อ Marketplace เพื่อดึงย้อนหลังทันที · ถ้าอีก 1 ชม. ยังตามหลังอยู่ แปลว่า cron มีปัญหา ให้แจ้งผู้ดูแลระบบ`,
        actionLabel: 'ไปซิงค์ด้วยตัวเอง',
        url: marketplaceSettingsUrl(platform),
      });
    }

    // refresh token ของขาออเดอร์
    const tokenLeftH = a.refresh_token_expires_at
      ? (new Date(a.refresh_token_expires_at).getTime() - now) / 3_600_000
      : null;
    if (tokenLeftH !== null && tokenLeftH <= 0) {
      issues.push({
        ...base,
        code: `token_expired:${a.id}`,
        groupKey: 'token_expired',
        scope: 'company',
        severity: 'critical',
        title: `${label} token หมดอายุ`,
        detail: `ร้าน ${shop} หมดสิทธิ์เข้าถึง API แล้ว — ออเดอร์ใหม่จะไม่เข้าระบบ`,
        fix: `เปิด ตั้งค่า > ช่องทางการขาย > เชื่อมต่อ Marketplace แล้วกดเชื่อมต่อร้าน ${shop} ใหม่`,
        actionLabel: 'ไปเชื่อมต่อใหม่',
        url: marketplaceSettingsUrl(platform),
      });
    } else if (tokenLeftH !== null && tokenLeftH < TOKEN_EXPIRY_WARN_DAYS * 24) {
      issues.push({
        ...base,
        code: `token_expiring:${a.id}`,
        groupKey: 'token_expiring',
        scope: 'company',
        severity: 'warning',
        title: `${label} token ใกล้หมดอายุ`,
        detail: `ร้าน ${shop} เหลืออีก ${roundHours(tokenLeftH)} ก่อนหมดสิทธิ์เข้าถึง API`,
        fix: `กดเชื่อมต่อร้าน ${shop} ใหม่ตั้งแต่ตอนนี้ จะได้ไม่ขาดตอนตอนหมดอายุจริง`,
        actionLabel: 'ไปต่ออายุการเชื่อมต่อ',
        url: marketplaceSettingsUrl(platform),
      });
    }

    // token ขาแชท (Shopee/TikTok/Lazada ใช้ app แชทแยก) — ตายแล้วต่ออายุเองไม่ได้ ต้องกดอนุญาตใหม่
    const chatLeftH = a.chat_access_token && a.chat_refresh_token_expires_at
      ? (new Date(a.chat_refresh_token_expires_at).getTime() - now) / 3_600_000
      : null;
    const chatDead = chatLeftH !== null && chatLeftH <= 0;
    if (chatDead) {
      issues.push({
        ...base,
        code: `chat_token_expired:${a.id}`,
        groupKey: 'chat_token_expired',
        scope: 'company',
        severity: 'warning',
        title: `แชท ${label} หมดอายุ`,
        detail: `ร้าน ${shop} รับ/ตอบแชทลูกค้าไม่ได้ — ข้อความใหม่จะไม่เข้าหน้ารวมแชท`,
        fix: `เปิด ตั้งค่า > ช่องทางแชท > ${label} แล้วกดปุ่ม "เชื่อมต่อแชทใหม่" ที่ร้าน ${shop}`,
        actionLabel: 'ไปเชื่อมต่อแชทใหม่',
        url: chatSettingsUrl(platform),
      });
    } else if (chatLeftH !== null && chatLeftH < TOKEN_EXPIRY_WARN_DAYS * 24) {
      // เตือนล่วงหน้าเหมือนขาออเดอร์ — ขาแชทหมดอายุเงียบกว่ามาก (ไม่มี cron ยิงให้รู้)
      // กว่าจะรู้ตัวคือตอนพนักงานกดตอบลูกค้าแล้วเด้ง error ซึ่งสายไปแล้ว
      issues.push({
        ...base,
        code: `chat_token_expiring:${a.id}`,
        groupKey: 'chat_token_expiring',
        scope: 'company',
        severity: 'warning',
        title: `แชท ${label} ใกล้หมดอายุ`,
        detail: `ร้าน ${shop} เหลืออีก ${roundHours(chatLeftH)} ก่อนหมดสิทธิ์รับ/ตอบแชท`,
        fix: `เปิด ตั้งค่า > ช่องทางแชท > ${label} แล้วกดปุ่ม "เชื่อมต่อแชทใหม่" ที่ร้าน ${shop} ตั้งแต่ตอนนี้`,
        actionLabel: 'ไปต่ออายุแชท',
        url: chatSettingsUrl(platform),
      });
    }
  }

  // ── ช่องทางแชท push (LINE/Facebook) — ตรวจจริงกับ API ของแพลตฟอร์ม ──
  //
  // ช่องทางพวกนี้ไม่มี cron ให้ดูว่าตามหลังไหม (ข้อความวิ่งเข้ามาเองทาง webhook)
  // ถ้า webhook หลุด · channel secret เปลี่ยน · token เพจหมดอายุ **มันจะเงียบสนิท**
  //
  // ⚠️ เคยเดาจาก "ความเงียบ" (1.5 × ช่องว่างที่เคยเงียบนานสุดใน 30 วัน) แล้ว
  // **เตือนผิดทั้งสุดสัปดาห์** — "ไม่มีใครทัก" กับ "ช่องทางพัง" มองจากฝั่งเราแล้ว
  // เหมือนกันเป๊ะ ไม่ว่าจะปรับสูตร/เพดานยังไงก็แยกไม่ออก (3–7 ก.ย. 2026)
  // ตอนนี้ถามแพลตฟอร์มตรง ๆ ว่า token ใช้ได้ไหม + webhook ชี้มาที่เราไหม
  // → [lib/chat/channel-health.ts](../chat/channel-health.ts) ตรวจซ้ำทุก 6 ชม./ช่องทาง
  //   แล้วเก็บผลไว้บน chat_accounts.health_* · ที่นี่แค่อ่านผลมาแจ้ง
  //
  // **ห้ามกลับไปเตือนจากความเงียบอีก** (สถิติความเงียบยังมีค่าในเชิงรายงาน —
  // RPC get_chat_channel_activity ยังอยู่ใน DB สำหรับหน้ารายงานในอนาคต แค่ไม่ใช่เกณฑ์เตือน)
  // ⚠️ ตัวตรวจจริง (ยิง API LINE/Facebook) รันใน runWatchdog() = cron เท่านั้น — ฟังก์ชันนี้
  // ถูกเรียกจาก /api/header/summary ทุกครั้งที่เปิดหน้า ถ้าตรวจตรงนี้ผู้ใช้จะรอ API ภายนอก
  // ทุกหน้าโหลด · ที่นี่อ่านผลที่ cron เก็บไว้บน chat_accounts.health_* อย่างเดียว

  let chatQuery = supabaseAdmin
    .from('chat_accounts')
    .select('id, company_id, platform, account_name, health_status, health_detail, health_checked_at')
    .in('platform', ['line', 'facebook'])
    .eq('is_active', true)
    // check_failed ไม่อยู่ในลิสต์ตั้งใจ — "ตรวจไม่สำเร็จ" ไม่ใช่หลักฐานว่าช่องทางพัง
    // (เน็ตสะดุดรอบเดียวแล้วปลุกเจ้าของร้าน = กลับไปเป็นเตือนผิดแบบเดิม)
    .in('health_status', ['token_invalid', 'webhook_missing', 'webhook_unreachable']);
  if (opts.companyId) chatQuery = chatQuery.eq('company_id', opts.companyId);
  const { data: unhealthyChats } = await chatQuery;

  for (const acc of unhealthyChats || []) {
    const platform = acc.platform as string;
    const status = acc.health_status as string;
    // ต้องบอกว่าเป็น "เพจ/OA ไหน" ไม่ใช่แค่ชื่อ — เพจชื่อ "aDay Fresh - Fruit Delivery" ของ
    // บริษัท aDay Fresh ถูกอ่านว่า "บริษัทนี้พัง" ทั้งที่อีกช่องทางของบริษัทเดียวกันปกติดี
    const kind = platform === 'line' ? 'LINE OA' : 'เพจ Facebook';
    const name = acc.account_name || (platform === 'line' ? 'LINE' : 'Facebook');
    const shortProblem = status === 'token_invalid'
      ? 'token หมดอายุ'
      : status === 'webhook_unreachable'
        ? 'เรียก webhook ของเราไม่ถึง'
        : platform === 'line' ? 'webhook ไม่ได้ชี้มาที่ระบบ' : 'ไม่ได้ subscribe แอปเราแล้ว';
    const checkedAt = acc.health_checked_at
      ? new Date(acc.health_checked_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
      : '-';

    issues.push({
      companyId: acc.company_id as string,
      companyName: companyName.get(acc.company_id) || null,
      channel: { platform, picture_url: null, shopName: name },
      code: `chat_health:${acc.id}`,
      groupKey: `chat_health:${platform}`,
      scope: 'company',
      // token ตาย = รับ/ตอบไม่ได้เลย · อีกสองอย่างยังตอบขาออกได้ ข้อความขาเข้าหายอย่างเดียว
      severity: status === 'token_invalid' ? 'critical' : 'warning',
      title: `${kind} "${name}" ${shortProblem}`,
      detail: `${acc.health_detail || shortProblem} · ตรวจเมื่อ ${checkedAt}`,
      fix: chatHealthFix(platform, acc.id as string),
      actionLabel: 'ไปตรวจช่องทางแชท',
      url: chatSettingsUrl(platform),
    });
  }

  // ── บัญชีโฆษณา Meta: token ตาย/ใกล้ตาย หรือตรวจแล้วไม่ผ่าน ──
  //
  // token ของบัญชีโฆษณามาจาก Login Facebook (อายุ ~60 วัน) — **หมดอายุแล้วเงียบสนิท**
  // ไม่มีอาการอะไรให้เห็นเลย นอกจาก "ยอดขายที่รายงานให้ Meta หายไปเฉย ๆ" แล้วโฆษณา
  // ก็ค่อย ๆ optimize ผิดทางโดยที่เจ้าของร้านนึกว่าโฆษณาเริ่มไม่เวิร์ก
  // (ตัวตรวจจริงอยู่ใน cron /api/ads/run-jobs — ที่นี่อ่านผลที่มันจดไว้บน ad_accounts)
  try {
    let adQuery = supabaseAdmin
      .from('ad_accounts')
      .select('id, company_id, name, external_id, status, last_error, token_expires_at')
      .eq('is_active', true);
    if (opts.companyId) adQuery = adQuery.eq('company_id', opts.companyId);
    const { data: adAccounts, error: adErr } = await adQuery;
    if (adErr) throw adErr;

    for (const acc of adAccounts || []) {
      const shopName = (acc.name as string | null) || `บัญชีโฆษณา ${acc.external_id}`;
      const base = {
        companyId: acc.company_id as string,
        companyName: companyName.get(acc.company_id) || null,
        channel: { platform: 'facebook', picture_url: null, shopName },
        scope: 'company' as const,
        actionLabel: 'ไปเชื่อมต่อใหม่',
        url: '/settings/ad-accounts',
      };
      const leftH = acc.token_expires_at
        ? (new Date(acc.token_expires_at as string).getTime() - now) / 3_600_000
        : null;

      if (acc.status === 'token_expired' || (leftH !== null && leftH <= 0)) {
        issues.push({
          ...base,
          code: `ad_token_expired:${acc.id}`,
          groupKey: 'ad_token_expired',
          severity: 'critical',
          title: `บัญชีโฆษณา "${shopName}" หมดอายุการเชื่อมต่อ`,
          detail: `ยอดขายจะไม่ถูกส่งเข้า Meta อีก — โฆษณาจะหาลูกค้าที่ซื้อจริงไม่เจอ (${acc.last_error || 'token ใช้ไม่ได้แล้ว'})`,
          fix: AD_ACCOUNT_FIX.token_expired,
        });
      } else if (leftH !== null && leftH < TOKEN_EXPIRY_WARN_DAYS * 24) {
        issues.push({
          ...base,
          code: `ad_token_expiring:${acc.id}`,
          groupKey: 'ad_token_expiring',
          severity: 'warning',
          title: `บัญชีโฆษณา "${shopName}" ใกล้หมดอายุ`,
          detail: `เหลืออีก ${roundHours(leftH)} ก่อนหยุดส่งยอดขายเข้า Meta`,
          fix: AD_ACCOUNT_FIX.token_expired,
          actionLabel: 'ไปต่ออายุการเชื่อมต่อ',
        });
      } else if (acc.status === 'error') {
        issues.push({
          ...base,
          code: `ad_account_error:${acc.id}`,
          groupKey: 'ad_account_error',
          severity: 'warning',
          title: `บัญชีโฆษณา "${shopName}" ตรวจแล้วไม่ผ่าน`,
          detail: (acc.last_error as string | null) || 'ตรวจการเชื่อมต่อไม่ผ่าน',
          // last_error เก็บวิธีแก้ที่ตรงอาการไว้แล้ว (ตัวตรวจเขียนจากผลจริง) — ไม่มีค่อยตกมาที่ตัวกลาง
          fix: (acc.last_error as string | null) || AD_ACCOUNT_FIX.dataset,
          actionLabel: 'ไปตรวจบัญชีโฆษณา',
        });
      }
    }

    // cron ของสายโฆษณาตาย — **เตือนเฉพาะเมื่อมีบัญชีให้ทำงานด้วยจริง**
    // (ไม่มีบัญชีสักใบ = ไม่ต้องตั้ง cron แล้วมาเตือนก็กวนเปล่า)
    if (!scoped && (adAccounts || []).length > 0) {
      const { data: flag } = await supabaseAdmin
        .from('app_flags').select('value').eq('key', ADS_JOBS_HEARTBEAT_KEY).maybeSingle();
      const at = (flag?.value as { at?: string } | null)?.at;
      const quietMin = at ? (now - new Date(at).getTime()) / 60_000 : null;
      if (quietMin === null || quietMin > ADS_JOBS_STALE_MINUTES) {
        issues.push({
          code: 'ad_jobs_stale',
          groupKey: 'ad_jobs_stale',
          scope: 'system',
          companyId: null,
          companyName: null,
          channel: null,
          severity: 'warning',
          title: 'งานเบื้องหลังของสายโฆษณาไม่ทำงาน',
          detail: at
            ? `ทำงานรอบล่าสุดเมื่อ ${roundHours(quietMin! / 60)}ที่แล้ว (ปกติทุก 15 นาที) — ออเดอร์ที่ยิงพลาดจะไม่มีใครกวาดตาม และ Meta รับย้อนหลังได้แค่ 7 วัน`
            : 'ยังไม่เคยทำงานเลย — ออเดอร์ที่ยิงพลาดจะไม่มีใครกวาดตาม และ Meta รับย้อนหลังได้แค่ 7 วัน',
          fix: 'ตั้ง cron-job.org ยิง GET /api/ads/run-jobs ทุก 15 นาที (header x-cron-secret) และเปิด Notify on failure',
          actionLabel: 'เปิด API Monitor',
          url: '/superadmin/api-monitor',
        });
      }
    }
  } catch (err) {
    // เรื่องนี้ล้มต้องไม่ทำให้ check อื่นทั้งหมดหายไป
    console.error('[watchdog] ad accounts check failed:', err instanceof Error ? err.message : err);
  }

  // เรื่องระดับระบบที่ไม่ผูกบริษัท — หน้า dashboard ของร้านไม่ต้องเห็น
  if (!scoped) {
    // webhook ที่ retry จนหมดสิทธิ์แล้ว = ออเดอร์/ข้อความหายจริง ต้องมีคนไปดู
    const { count: deadLetters } = await supabaseAdmin
      .from('marketplace_webhook_log')
      .select('id', { count: 'exact', head: true })
      .eq('processing_status', 'dead_letter')
      .gte('created_at', new Date(now - 24 * 3_600_000).toISOString());

    if (deadLetters && deadLetters > 0) {
      issues.push({
        code: 'dead_letter',
        groupKey: 'dead_letter',
        scope: 'system',
        companyId: null,
        companyName: null,
        channel: null,
        severity: 'critical',
        title: `webhook ตกค้าง ${deadLetters} ใบ`,
        detail: `24 ชม.ที่ผ่านมามี webhook ${deadLetters} ใบที่ retry จนครบแล้วยังไม่สำเร็จ — ของในใบนั้นยังไม่เข้าระบบ`,
        fix: 'เปิด API Monitor ดูรายการ dead letter แล้วไล่ซิงค์ออเดอร์ใบนั้นด้วยมือ',
        actionLabel: 'เปิด API Monitor',
        url: '/superadmin/api-monitor',
      });
    }

    // โควตาโดนแบนอยู่ — งานของ scope นั้นหยุดหมดจนกว่าจะถึงเวลาปลด
    const { data: flags } = await supabaseAdmin
      .from('app_flags').select('key, value').like('key', '%quota_exhausted%');
    for (const f of flags || []) {
      const value = f.value as { until?: string; at?: string } | null;
      const until = value?.until;
      if (!until || new Date(until).getTime() < now) continue;
      // แบนไม่กี่วินาที (rate limit ต่อวินาที) ไม่ใช่โควตาหมด — ไม่ต้องเตือน
      if (isShortPause(value)) continue;
      const name = f.key.replace('_quota_exhausted', '').replace(':', ' · ');
      issues.push({
        code: `quota:${f.key}`,
        groupKey: 'quota',
        scope: 'system',
        companyId: null,
        companyName: null,
        channel: null,
        severity: 'warning',
        title: `โควตา ${name} เต็ม`,
        detail: `พักการเรียก API ถึง ${new Date(until).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
        fix: 'ปกติรอให้ถึงเวลาปลดเองได้ · ถ้าแน่ใจว่าโควตากลับมาแล้ว กด "ปลดก่อนเวลา" ใน API Monitor',
        actionLabel: 'เปิด API Monitor',
        url: '/superadmin/api-monitor',
      });
    }

    // ── บริษัทที่เลิกใช้ไปเงียบ ๆ / ปิดครบกำหนดจนลบถาวรได้ ──
    //
    // เรื่องของผู้ดูแลระบบล้วน ๆ — **ห้ามผูก companyId** ไม่งั้น push จะไปโผล่ที่เจ้าของร้าน
    // ว่า "ร้านคุณเงียบนะ" ซึ่งไม่ใช่เรื่องที่เขาต้องแก้ · เตือนซ้ำสัปดาห์ละครั้งพอ
    // (ของแบบนี้ไม่มีอะไรเปลี่ยนภายใน 6 ชม. — เตือนถี่เท่ากับ cron ตายคือกวนเปล่า)
    try {
      const { data: overviewRaw, error: overviewErr } = await supabaseAdmin.rpc('get_company_overview');
      if (overviewErr) throw overviewErr;

      type Overview = {
        id: string; last_activity: string | null; last_login: string | null;
        last_order: string | null; last_chat: string | null; last_pos: string | null;
        last_product_edit: string | null;
      };
      const overview = new Map(
        ((Array.isArray(overviewRaw) ? overviewRaw : []) as Overview[]).map(o => [o.id, o]),
      );

      const { data: companyRows } = await supabaseAdmin
        .from('companies')
        .select('id, name, is_active, deactivated_at');

      for (const c of companyRows || []) {
        const name = (c.name as string) || 'ไม่มีชื่อ';

        if (c.is_active) {
          const o = overview.get(c.id as string);
          const lastActivity = o?.last_activity || null;
          if (!lastActivity) continue;
          const days = Math.floor((now - new Date(lastActivity).getTime()) / 86_400_000);
          if (days < COMPANY_QUIET_DAYS) continue;

          // บอกด้วยว่า "ครั้งสุดท้ายที่ขยับคืออะไร" — เงียบเพราะไม่มีออเดอร์ กับ
          // เงียบเพราะไม่มีใครล็อกอินเลย เป็นคนละเรื่องตอนตัดสินใจว่าจะติดต่อยังไง
          const signal =
            o?.last_order === lastActivity ? 'ออเดอร์ล่าสุด'
            : o?.last_chat === lastActivity ? 'ข้อความแชทล่าสุด'
            : o?.last_login === lastActivity ? 'การเข้าใช้งานล่าสุด'
            : o?.last_pos === lastActivity ? 'การขายหน้าร้านล่าสุด'
            : o?.last_product_edit === lastActivity ? 'การแก้ข้อมูลสินค้าล่าสุด'
            : 'ความเคลื่อนไหวล่าสุด';

          issues.push({
            code: `company_quiet:${c.id}`,
            groupKey: 'company_quiet',
            scope: 'system',
            companyId: null,
            companyName: name,
            channel: null,
            severity: 'warning',
            title: `บริษัท ${name} ไม่มีความเคลื่อนไหวมา ${days} วัน`,
            detail: `${signal}เมื่อ ${new Date(lastActivity).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })} — ไม่มีสัญญาณการใช้งานใด ๆ หลังจากนั้น`,
            fix: 'ถ้าเลิกใช้แล้วให้ปิดบริษัทในหน้า Companies — ปิดครบ 30 วันจึงลบถาวรได้ (บริษัทที่ไม่มีข้อมูลเลยลบได้ทันที)',
            actionLabel: 'ไปหน้า Companies',
            url: '/superadmin/companies?filter=quiet',
            renotifyHours: 24 * 7,
          });
          continue;
        }

        // ปิดแล้วและครบกำหนด — เตือนให้ไปเก็บกวาด (ข้อมูลที่ไม่มีใครใช้ยังกินที่และยังเป็นภาระ PDPA)
        const closedAt = c.deactivated_at ? new Date(c.deactivated_at as string).getTime() : null;
        if (closedAt === null || isNaN(closedAt)) continue;
        if (now - closedAt < COMPANY_QUIET_DAYS * 86_400_000) continue;

        issues.push({
          code: `company_purgeable:${c.id}`,
          groupKey: 'company_purgeable',
          scope: 'system',
          companyId: null,
          companyName: name,
          channel: null,
          severity: 'warning',
          title: `บริษัท ${name} ปิดครบ 30 วันแล้ว ลบถาวรได้`,
          detail: `ปิดการใช้งานเมื่อ ${new Date(closedAt).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })} — ข้อมูลทั้งหมดยังอยู่ในระบบ`,
          fix: 'ถ้าแน่ใจว่าไม่กลับมาใช้แล้ว เปิดหน้า Companies แล้วกด "ลบถาวร" (ต้องพิมพ์ชื่อบริษัทยืนยัน · ลบแล้วกู้คืนไม่ได้)',
          actionLabel: 'ไปหน้า Companies',
          url: '/superadmin/companies?filter=inactive',
          renotifyHours: 24 * 7,
        });
      }
    } catch (err) {
      // เรื่องนี้ล้มต้องไม่ทำให้ check อื่นทั้งหมดหายไป
      console.error('[watchdog] company activity check failed:', err instanceof Error ? err.message : err);
    }
  }

  // ── Beam Checkout: webhook ไม่เข้า ──
  // ระบบยังเก็บเงินได้เพราะมี reconcile ถาม Beam เอง (ทุก 15 นาที / ตอนลูกค้ากลับมาหน้าบิล)
  // แต่แปลว่าฝั่ง Beam Lighthouse ยังตั้ง webhook/HMAC key ไม่ครบ — ออเดอร์จะขยับช้ากว่าที่ควร
  // จับจากแถวที่ต้อง settle ผ่าน reconcile ใน 7 วัน (notes = BEAM_RECONCILE_NOTE)
  {
    let q = supabaseAdmin
      .from('payment_records')
      .select('company_id, created_at')
      .eq('gateway_provider', 'beam')
      .eq('notes', BEAM_RECONCILE_NOTE)
      .gte('updated_at', new Date(now - 7 * 86_400_000).toISOString());
    if (opts.companyId) q = q.eq('company_id', opts.companyId);
    const { data: reconciled } = await q;
    const byCompany = groupBy(reconciled || [], r => r.company_id as string);
    for (const [companyId, rows] of byCompany) {
      issues.push({
        companyId,
        companyName: companyName.get(companyId) || null,
        channel: null,
        code: `beam_webhook_silent:${companyId}`,
        groupKey: 'beam_webhook_silent',
        scope: 'company',
        severity: 'warning',
        title: 'Webhook ของ Beam Checkout ไม่เข้า',
        detail: `${rows.length} รายการใน 7 วันที่ระบบต้องไปถามสถานะกับ Beam เอง — ลูกค้าจ่ายแล้วออเดอร์ขยับช้าได้ถึง 15 นาที`,
        fix: 'ใน Beam Lighthouse สร้าง webhook ชี้มาที่ /api/beam/webhook เลือก event payment_link.paid แล้วนำ HMAC key ที่ได้มาวางในช่อง "Webhook HMAC Key" ของ Beam ในหน้าช่องทางชำระเงิน (ดู log ใน API Logs ว่าปฏิเสธเพราะอะไร)',
        actionLabel: 'ไปตั้งค่าช่องทางชำระเงิน',
        url: '/settings/payment-channels',
      });
    }
  }

  // ── บรอดแคสต์ที่ตั้งเวลาไว้แต่ไม่มีใครมาส่ง ──
  //
  // ใบที่ตั้งเวลาไม่ถูกส่งจาก after() ของ POST — ต้องรอ cron /api/broadcasts/run-scheduled
  // มาหยิบ ⇒ **cron ตายเมื่อไหร่ ใบจะค้างเงียบโดยไม่มีใครรู้** (ผู้ใช้เข้าใจว่าส่งไปแล้ว)
  // เตือนทั้งผู้ดูแลระบบ (ต้องไปตั้ง cron) และร้าน (กด "ส่งต่อ" เองได้ระหว่างนี้)
  try {
    let q = supabaseAdmin
      .from('broadcasts')
      .select('id, company_id, scheduled_at, preview')
      .eq('status', 'scheduled')
      .lt('scheduled_at', new Date(now - BROADCAST_OVERDUE_MINUTES * 60_000).toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20);
    if (opts.companyId) q = q.eq('company_id', opts.companyId);
    const { data: overdue, error: overdueErr } = await q;
    if (overdueErr) throw overdueErr;

    for (const b of overdue || []) {
      const at = new Date(b.scheduled_at as string).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
      issues.push({
        code: `broadcast_scheduled_overdue:${b.id}`,
        groupKey: 'broadcast_scheduler',
        scope: 'system',
        companyId: b.company_id as string,
        companyName: companyName.get(b.company_id) || null,
        channel: null,
        severity: 'warning',
        title: 'บรอดแคสต์ที่ตั้งเวลาไว้ยังไม่ถูกส่ง',
        detail: `ถึงเวลาส่งเมื่อ ${at} แต่ยังค้างสถานะ "ตั้งเวลาไว้" — ตัวส่งตามเวลา (cron) ไม่ได้ทำงาน`,
        fix: 'ตั้ง cron ที่ cron-job.org ให้เรียก GET /api/broadcasts/run-scheduled ทุก 5 นาที พร้อม header x-cron-secret แล้วเปิด Notify on failure · ระหว่างนี้กด "ส่งต่อ" ในหน้ารายการเพื่อส่งเองได้',
        actionLabel: 'เปิดรายการบรอดแคสต์',
        url: '/marketing/broadcast',
      });
    }
  } catch (err) {
    // เรื่องนี้ล้มต้องไม่ทำให้ check อื่นทั้งหมดหายไป
    console.error('[watchdog] scheduled broadcast check failed:', err instanceof Error ? err.message : err);
  }

  return issues;
}

// notified_at ว่าง = ยังไม่เคยส่งถึงเครื่องไหนเลย (รอบหน้าจะพยายามใหม่)
type WatchdogState = Record<string, { since: string; notified_at?: string }>;

/**
 * ตรวจ + เด้งเตือนคนที่แก้ได้ + จำว่าเตือนอะไรไปแล้ว
 * - เรื่องใหม่ → เตือนทันที · เรื่องเดิมที่ยังไม่หาย → ซ้ำได้ทุก RENOTIFY_HOURS ชม.
 * - เรื่องที่หายแล้ว → บอกว่ากลับมาปกติ 1 ครั้ง แล้วลืมมันไป
 * - หลายเรื่องที่มีสาเหตุเดียวกัน → รวมเป็นใบเดียว (ไม่เด้ง 6 ใบบอกเรื่องเดียวกัน)
 */
/**
 * ผลของ collectWatchdogIssues แบบ cache 5 นาทีต่อบริษัท — สำหรับสายที่ผู้ใช้รอ
 * (กระดิ่งบน header ผ่าน /api/header/summary เรียกทุกครั้งที่เปิดหน้า) ทั้งที่ผลจริง
 * เปลี่ยนแค่ตอน cron รอบละ 15 นาที · single-flight: หลายหน้าโหลดพร้อมกันคำนวณครั้งเดียว
 * cache อยู่ในหน่วยความจำของ instance นั้น (Vercel มีหลาย instance) จึงเป็น best-effort
 * — cron (`runWatchdog`) ล้าง cache หลังคำนวณรอบใหม่ ให้กระดิ่งได้ผลสดตามหลัง cron
 */
const ISSUE_CACHE_TTL_MS = 5 * 60_000;
const issueCache = new Map<string, { at: number; promise: Promise<WatchdogIssue[]> }>();

export function collectWatchdogIssuesCached(
  opts: { companyId?: string } = {}
): Promise<WatchdogIssue[]> {
  const key = opts.companyId || '*';
  const hit = issueCache.get(key);
  if (hit && Date.now() - hit.at < ISSUE_CACHE_TTL_MS) return hit.promise;
  const promise = collectWatchdogIssues(opts).catch(err => {
    issueCache.delete(key); // ผลที่ล้มไม่ควรถูกจำไว้ 5 นาที
    throw err;
  });
  issueCache.set(key, { at: Date.now(), promise });
  return promise;
}

export function invalidateWatchdogIssueCache(): void {
  issueCache.clear();
}

export async function runWatchdog(): Promise<{ issues: number; notified: number; recovered: number }> {
  // ตรวจสุขภาพช่องทางแชทแบบถามแพลตฟอร์มจริงก่อน (ทุก 6 ชม./ช่องทาง, มีงบเวลาในตัว)
  // แล้วค่อยรวบรวมปัญหาจากผลที่เก็บไว้ — ทำเฉพาะใน cron ไม่ทำในสายที่ผู้ใช้รอ
  await runChatChannelHealthChecks({ companyId: null }).catch(err =>
    console.error('[watchdog] chat health checks failed:', err instanceof Error ? err.message : err)
  );
  const issues = await collectWatchdogIssues();
  // รอบใหม่คำนวณแล้ว → กระดิ่งที่อ่านจาก cache ต้องเห็นผลชุดนี้ ไม่ใช่ของ 5 นาทีก่อน
  invalidateWatchdogIssueCache();
  const now = new Date();

  const { data: flagRow } = await supabaseAdmin
    .from('app_flags').select('value').eq('key', WATCHDOG_STATE_KEY).maybeSingle();
  const prev = ((flagRow?.value as WatchdogState) || {}) as WatchdogState;

  const next: WatchdogState = {};
  const due: WatchdogIssue[] = [];
  for (const issue of issues) {
    const before = prev[issue.code];
    const lastNotified = before?.notified_at ? new Date(before.notified_at).getTime() : 0;
    const isDue = now.getTime() - lastNotified > (issue.renotifyHours ?? RENOTIFY_HOURS) * 3_600_000;
    // ยังไม่ stamp ตรงนี้ — stamp เฉพาะใบที่ "ส่งถึงเครื่องจริง" หลังยิงเสร็จ
    next[issue.code] = { since: before?.since || now.toISOString(), notified_at: before?.notified_at };
    if (isDue) due.push(issue);
  }

  let notified = 0;
  const superAdminIds = await getSuperAdminIds();

  // นับว่าส่งถึงเครื่องจริงกี่เครื่อง ถ้า 0 = ยังไม่มีใครเปิดแจ้งเตือน → **ห้ามจดว่าแจ้งแล้ว**
  // ไม่งั้นพอผู้ใช้เพิ่งมาเปิดสวิตช์ จะเงียบไปอีก 6 ชม. แล้วเข้าใจว่าระบบพัง
  const markNotified = (group: WatchdogIssue[], sent: number) => {
    if (sent <= 0) return;
    for (const i of group) next[i.code].notified_at = now.toISOString();
    notified += sent;
  };

  // ── ผู้ดูแลระบบ: เฉพาะเรื่องระดับระบบ · รวมตามสาเหตุ
  if (superAdminIds.length > 0) {
    for (const [, group] of groupBy(due.filter(i => i.scope === 'system'), i => i.groupKey)) {
      const sent = await sendPushToUsers(superAdminIds, buildPush(group, '/superadmin/api-monitor'), {
        audience: 'superadmin',
      });
      markNotified(group, sent);
    }
  }

  // ── เจ้าของร้าน: ทุกเรื่องที่เป็นของร้านตัวเอง (รวมเรื่องระบบที่กระทบร้าน) · รวมต่อบริษัท
  for (const [companyId, group] of groupBy(due.filter(i => i.companyId), i => i.companyId!)) {
    const targets = await getCompanyManagerIds(companyId);
    if (targets.length === 0) continue;
    // เรื่องของร้าน → แอปของร้าน (แม้ผู้รับจะเป็น superadmin ที่ควบเจ้าของร้านอยู่ด้วย)
    // ต่อ ?company= เพื่อให้กดแล้วสลับไปร้านที่มีปัญหาเอง — คนดูแลหลายร้านจะได้ไม่ต้อง
    // มานั่งเดาว่าเรื่องนี้ของร้านไหนแล้วกดสลับหาเอง
    const push = buildPush(group, '/dashboard');
    const sent = await sendPushToUsers(
      targets,
      { ...push, url: withCompanyParam(push.url, companyId) },
      { audience: 'app' }
    );
    markNotified(group, sent);
  }

  // เรื่องที่หายไปแล้ว — บอกครั้งเดียวว่ากลับมาปกติ
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
    }, { audience: 'superadmin' });
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

/** หลายเรื่องรวมใบเดียว — ใบเดียวบอกวิธีแก้ได้เลย หลายใบบอกจำนวนแล้วพาไปดูรายการ */
function buildPush(group: WatchdogIssue[], listUrl: string) {
  const worst = group.some(i => i.severity === 'critical');
  if (group.length === 1) {
    const only = group[0];
    return {
      title: worst ? `⚠️ ${only.title}` : only.title,
      body: `${only.detail}\n\nวิธีแก้: ${only.fix}`,
      url: only.url,
      tag: only.code,
    };
  }
  return {
    title: worst ? `⚠️ มี ${group.length} เรื่องต้องแก้` : `มี ${group.length} เรื่องต้องดู`,
    body: group.map(i => `• ${i.title}`).join('\n'),
    url: listUrl,
    tag: group[0].groupKey,
  };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) || [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

async function getSuperAdminIds(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('user_profiles').select('id').eq('is_super_admin', true);
  return (data || []).map(u => u.id as string);
}

/** เจ้าของ/แอดมินของบริษัทนั้น — เรื่องที่ร้านแก้เองได้ ไม่ต้องปลุกพนักงานทุกคน */
async function getCompanyManagerIds(companyId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('company_members').select('user_id, roles')
    .eq('company_id', companyId).eq('is_active', true);
  return (data || [])
    .filter(m => (m.roles as string[] | null)?.some(r => r === 'owner' || r === 'admin'))
    .map(m => m.user_id as string);
}
