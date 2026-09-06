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
import { sendPushToUsers, withCompanyParam } from '@/lib/push/send';
import { MARKETPLACE_PLATFORMS, type QuotaPlatform } from '@/lib/marketplace/platforms';
import { BEAM_RECONCILE_NOTE } from '@/lib/beam/settle';

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
}

/** ซิงค์ตามหลังเกินเท่านี้ = ผิดปกติ (cron ทุก 15 นาที — เผื่อพลาดได้หลายรอบก่อนกวน) */
const STALE_SYNC_HOURS = 3;
/** refresh token เหลือน้อยกว่านี้ = เตือนล่วงหน้าให้ไปต่ออายุ */
const TOKEN_EXPIRY_WARN_DAYS = 3;
/** เตือนซ้ำเรื่องเดิมได้บ่อยสุดเท่านี้ ตราบใดที่ยังไม่หาย */
const RENOTIFY_HOURS = 6;

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
          title: `${label} หลุดการเชื่อมต่อ`,
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
        title: `${label} ซิงค์ตามหลัง ${roundHours(behind)}`,
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

    // token ขาแชท (TikTok/Lazada ใช้ app แชทแยก) — ตายแล้วต่ออายุเองไม่ได้ ต้องกดอนุญาตใหม่
    const chatDead = a.chat_access_token
      && a.chat_refresh_token_expires_at
      && new Date(a.chat_refresh_token_expires_at).getTime() < now;
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
    }
  }

  // ── ช่องทางแชท push (LINE/Facebook) — จับ "เงียบผิดปกติ" ──
  //
  // ช่องทางพวกนี้ไม่มี cron ให้ดูว่าตามหลังไหม (ข้อความวิ่งเข้ามาเองทาง webhook)
  // ถ้า webhook หลุด · channel secret เปลี่ยน · token เพจหมดอายุ **มันจะเงียบสนิท
  // โดยไม่มีอะไรฟ้อง** — ซึ่งเป็นรูปแบบเดียวกับ cron Shopee ที่ตายเงียบ 12 วัน
  //
  // เกณฑ์เทียบกับ **ช่องว่างที่ยาวที่สุดที่ช่องทางนี้เคยเงียบได้ตามปกติ** (30 วัน)
  //
  // ⚠️ เคยใช้ "8 × ระยะห่างเฉลี่ย" แล้ว**เตือนผิดทุกคืน** — สูตรเฉลี่ยสมมติว่า
  // ข้อความกระจายเท่ากันทั้ง 168 ชม./สัปดาห์ ซึ่งไม่จริงเลย ลูกค้าไม่ทักตอนตี 3
  // LINE ที่คุยวันละ ~95 ข้อความจึงได้เกณฑ์ 6 ชม. แล้วลั่นทุกเช้ามืด
  // (เจอจริง 3–4 ก.ย. 2026 — ดู fix-bug.md)
  //
  // max gap รวม "กลางคืน/วันหยุด/ช่วงร้านปิด" ไว้ในตัวเองแล้ว ไม่ต้องฮาร์ดโค้ด
  // เวลาทำการของแต่ละร้าน (ซึ่งไม่มีทางรู้) · เพจที่แทบไม่มีใครทัก
  // (< 20 ข้อความ/สัปดาห์) ไม่ตรวจเลย เพราะตัดสินไม่ได้ว่าพังหรือไม่มีคนทัก
  const CHAT_MIN_WEEKLY = 20;
  const CHAT_GAP_MULTIPLIER = 1.5;
  const CHAT_MIN_HOURS = 6;
  const CHAT_MAX_HOURS = 48;

  let chatQuery = supabaseAdmin
    .from('chat_accounts')
    .select('id, company_id, platform, account_name')
    .in('platform', ['line', 'facebook'])
    .eq('is_active', true);
  if (opts.companyId) chatQuery = chatQuery.eq('company_id', opts.companyId);

  const [{ data: chatAccounts }, { data: chatActivity }] = await Promise.all([
    chatQuery,
    supabaseAdmin.rpc('get_chat_channel_activity', { p_company_id: opts.companyId ?? null }),
  ]);

  type ChatActivityRow = {
    chat_account_id: string;
    last_incoming_at: string | null;
    incoming_7d: number;
    max_gap_h: number | null;
  };
  const activityById = new Map(
    ((chatActivity as ChatActivityRow[] | null) || []).map(r => [r.chat_account_id, r])
  );

  for (const acc of chatAccounts || []) {
    const stat = activityById.get(acc.id);
    if (!stat || !stat.last_incoming_at || Number(stat.incoming_7d) < CHAT_MIN_WEEKLY) continue;

    // ไม่มีประวัติช่องว่าง (ช่องทางเพิ่งเปิด) = ยังตัดสินไม่ได้ว่าปกติเงียบได้แค่ไหน
    if (stat.max_gap_h === null) continue;
    const silentH = hoursAgo(stat.last_incoming_at)!;
    const normalGapH = Number(stat.max_gap_h);
    const thresholdH = Math.min(
      CHAT_MAX_HOURS,
      Math.max(CHAT_MIN_HOURS, normalGapH * CHAT_GAP_MULTIPLIER)
    );
    if (silentH <= thresholdH) continue;

    const label = acc.platform === 'line' ? 'LINE' : 'Facebook';
    const name = acc.account_name || label;
    issues.push({
      companyId: acc.company_id as string,
      companyName: companyName.get(acc.company_id) || null,
      channel: { platform: acc.platform as string, picture_url: null, shopName: name },
      code: `chat_silent:${acc.id}`,
      groupKey: `chat_silent:${acc.platform}`,
      scope: 'company',
      severity: 'warning',
      title: `${label} เงียบผิดปกติ ${roundHours(silentH)}`,
      detail: `${name} ไม่มีข้อความเข้าเลย ${roundHours(silentH)} ทั้งที่ปกติเงียบนานสุดแค่ ${roundHours(normalGapH)} — webhook อาจหลุดหรือ token หมดอายุ`,
      fix: acc.platform === 'line'
        ? `เช็คที่ LINE Developers ว่า Webhook URL ยังชี้มาที่ระบบและเปิด "Use webhook" อยู่ แล้วกด Verify · ถ้าเปลี่ยน Channel secret/Access token ต้องมาแก้ที่ ตั้งค่า > ช่องทางแชท > LINE`
        : `เพจ Facebook ต้องต่ออายุสิทธิ์ทุก 60 วัน — เปิด ตั้งค่า > ช่องทางแชท > Facebook แล้วกดเชื่อมเพจใหม่ (ถ้าเพจเงียบเพราะไม่มีคนทักจริง ๆ ก็ข้ามได้)`,
      actionLabel: 'ไปตรวจช่องทางแชท',
      url: chatSettingsUrl(acc.platform as string),
    });
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
      const until = (f.value as { until?: string } | null)?.until;
      if (!until || new Date(until).getTime() < now) continue;
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
export async function runWatchdog(): Promise<{ issues: number; notified: number; recovered: number }> {
  const issues = await collectWatchdogIssues();
  const now = new Date();

  const { data: flagRow } = await supabaseAdmin
    .from('app_flags').select('value').eq('key', WATCHDOG_STATE_KEY).maybeSingle();
  const prev = ((flagRow?.value as WatchdogState) || {}) as WatchdogState;

  const next: WatchdogState = {};
  const due: WatchdogIssue[] = [];
  for (const issue of issues) {
    const before = prev[issue.code];
    const lastNotified = before?.notified_at ? new Date(before.notified_at).getTime() : 0;
    const isDue = now.getTime() - lastNotified > RENOTIFY_HOURS * 3_600_000;
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
