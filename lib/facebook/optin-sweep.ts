// Path: lib/facebook/optin-sweep.ts
//
// กวาดห้องแชท Facebook ที่ "คุยจบแล้วเงียบไป" เพื่อชวนกดรับข่าวสาร (cron ทุก ~10 นาที)
//
// ⚠️ หัวใจของความปลอดภัยอยู่ที่ **หน้าต่างเป็นช่วง ไม่ใช่ "เงียบเกิน N นาที"**
// ถ้าไม่มีขอบบน วันที่ร้านเปิดสวิตช์ครั้งแรกจะกวาดทุกห้องในร้านพร้อมกัน → ลูกค้าบล็อก/รีพอร์ต
// ถล่ม → คะแนนเพจตกทั้งร้าน (แก้ยากกว่าที่คิดมาก) · บวก cap ต่อเพจต่อรอบอีกชั้น
//
// ลำดับที่เลือกใช้: กรองด้วยข้อมูลของเราให้เหลือน้อยที่สุดก่อน **แล้วค่อยถาม Meta**
// ว่าใครกดรับไปแล้ว — เพจที่ไม่มีใครเข้าเกณฑ์ในรอบนั้นจึงไม่เสีย Graph call เลย

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';
import { listMarketingSubscribers } from '@/lib/meta/marketing-messages';
import { readOptinConfig, OPTIN_MAX_PER_ACCOUNT_PER_RUN } from '@/lib/broadcast/optin';
import { sendOptinInvite } from './optin-invite';

const DEFAULT_TIME_BUDGET_MS = 240_000;
/** เว้นจังหวะระหว่างใบ — เท่ากับตัวส่งบรอดแคสต์ฝั่ง FB */
const SEND_GAP_MS = 120;

export interface OptinSweepResult {
  accounts: number;
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  /** เพจที่ถามรายชื่อผู้สมัครจาก Meta ไม่สำเร็จ — รอบนั้นข้ามไปทั้งเพจ */
  reconcileFailed: number;
}

interface AccountRow {
  id: string;
  company_id: string;
  account_name: string | null;
  credentials: Record<string, unknown> | null;
}

interface ContactRow {
  id: string;
  fb_psid: string;
  last_message_at: string | null;
  optin_invited_at: string | null;
  optin_invite_count: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * @param opts.companyId ระบุ = บริษัทเดียว (สายคนกดเอง/ทดสอบ) · ไม่ระบุ = ทุกบริษัท (สาย cron)
 */
export async function sweepQuietOptinInvites(
  opts: { timeBudgetMs?: number; companyId?: string } = {},
): Promise<OptinSweepResult> {
  const deadline = Date.now() + (opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const out: OptinSweepResult = { accounts: 0, candidates: 0, sent: 0, skipped: 0, failed: 0, reconcileFailed: 0 };

  let q = supabaseAdmin
    .from('chat_accounts')
    .select('id, company_id, account_name, credentials')
    .eq('platform', 'facebook')
    .eq('is_active', true);
  if (opts.companyId) q = q.eq('company_id', opts.companyId);
  const { data: accounts } = await q;

  for (const account of (accounts || []) as AccountRow[]) {
    if (Date.now() > deadline) break;
    try {
      const handled = await sweepAccount(account, deadline, out);
      if (handled) out.accounts++;
    } catch (err) {
      // เพจเดียวพังห้ามหยุดทั้งรอบ (token หมดอายุ · Meta ล่มชั่วคราว)
      console.error('[optin/sweep] account failed:', account.id, err instanceof Error ? err.message : String(err));
    }
  }

  return out;
}

/** @returns เพจนี้ถูกประมวลผลไหม (false = ปิดสวิตช์/ไม่มี token) */
async function sweepAccount(account: AccountRow, deadline: number, out: OptinSweepResult): Promise<boolean> {
  const creds = account.credentials || {};
  const pageId = typeof creds.page_id === 'string' ? creds.page_id : '';
  const pageToken = typeof creds.page_access_token === 'string' ? creds.page_access_token : '';
  if (!pageId || !pageToken) return false;

  const cfg = readOptinConfig(creds, account.account_name || 'ร้าน');
  if (!cfg.quiet.enabled) return false;

  // 1) ลูกค้าทักล่าสุดเมื่อไหร่ + ทักมากี่ครั้ง (รอบเดียวทั้งเพจ)
  // ⛔ ห้ามใช้ fb_contacts.last_message_at เป็น "ลูกค้าทักล่าสุด" — ขยับตอนแอดมินตอบด้วย
  const { data: counts, error: rpcError } = await supabaseAdmin.rpc('get_fb_contact_message_counts', {
    p_company_id: account.company_id,
    p_chat_account_id: account.id,
  });
  if (rpcError) {
    console.error('[optin/sweep] get_fb_contact_message_counts:', rpcError.message);
    return false;
  }
  const engagement = new Map<string, { count: number; lastIncomingAt: string | null }>(
    ((counts || []) as { contact_id: string; incoming_count: number; last_incoming_at: string | null }[]).map((r) => [
      r.contact_id,
      { count: Number(r.incoming_count) || 0, lastIncomingAt: r.last_incoming_at },
    ]),
  );

  // 2) ห้องที่ยังไม่เคยกดรับ และพ้นระยะถามซ้ำแล้ว (เข้า partial index fb_contacts_optin_sweep_idx)
  const reaskBefore = new Date(Date.now() - cfg.reask_days * 86_400_000).toISOString();
  const { rows } = await fetchAllRows<ContactRow>((from, to) =>
    supabaseAdmin
      .from('fb_contacts')
      .select('id, fb_psid, last_message_at, optin_invited_at, optin_invite_count', { count: 'exact' })
      .eq('company_id', account.company_id)
      .eq('chat_account_id', account.id)
      .eq('source', 'facebook')
      .eq('status', 'active')
      .eq('optin_status', 'none')
      .eq('unread_count', 0)
      .lt('optin_invite_count', cfg.max_asks)
      .or(`optin_invited_at.is.null,optin_invited_at.lt.${reaskBefore}`)
      .order('id')
      .range(from, to) as never,
  );

  // 3) คัดในหน่วยความจำ — ตรรกะล้วน ทดสอบได้โดยไม่ต้องมี DB
  const now = Date.now();
  const windowStart = now - cfg.quiet_max_minutes * 60_000; // เก่าสุดที่ยังชวนได้
  const windowEnd = now - cfg.quiet_min_minutes * 60_000;   // เพิ่งคุยจบพอดี
  const candidates: { contact: ContactRow; lastIncomingAt: string }[] = [];

  for (const row of rows) {
    const eng = engagement.get(row.id);
    if (!eng?.lastIncomingAt) continue;
    if (eng.count < cfg.quiet_min_messages) continue; // ทักคำเดียวแล้วหายไม่ต้องชวน

    const lastIncoming = new Date(eng.lastIncomingAt).getTime();
    if (lastIncoming < windowStart || lastIncoming > windowEnd) continue;

    // แอดมินตอบเป็นคนสุดท้าย = คุยจบแล้ว · ห้องที่ลูกค้าถามค้างอยู่ห้ามขัดจังหวะ
    const lastAny = row.last_message_at ? new Date(row.last_message_at).getTime() : 0;
    if (lastAny <= lastIncoming) continue;

    candidates.push({ contact: row, lastIncomingAt: eng.lastIncomingAt });
  }
  if (candidates.length === 0) return true;

  // 4) ถาม Meta ว่าใครกดรับไปแล้ว — ยิงเฉพาะเพจที่มีคนเข้าเกณฑ์จริง
  // webhook เชื่อ 100% ไม่ได้ (พลาดได้ · ลูกค้ากดจากการ์ดที่ Meta ส่งเองก็ได้ · เพจเพิ่งเปิดใช้)
  const subs = await listMarketingSubscribers(pageId, pageToken);
  if (!subs.ok) {
    // รายชื่อที่ขาดกลางคันแล้วเอาไปตัดสิน = ชวนคนที่กดรับแล้วซ้ำ — ข้ามทั้งเพจดีกว่า
    out.reconcileFailed++;
    return true;
  }
  const subscribed = new Set(subs.subscribers.map((s) => s.psid));
  if (subscribed.size > 0) {
    const ids = candidates.filter((c) => subscribed.has(c.contact.fb_psid)).map((c) => c.contact.id);
    if (ids.length > 0) {
      await supabaseAdmin
        .from('fb_contacts')
        .update({ optin_status: 'subscribed', optin_status_at: new Date().toISOString() })
        .in('id', ids)
        .eq('company_id', account.company_id);
    }
  }

  // 5) ส่ง — ห้องที่ใกล้หลุดหน้าต่างไปก่อน
  const queue = candidates
    .filter((c) => !subscribed.has(c.contact.fb_psid))
    .sort((a, b) => new Date(a.lastIncomingAt).getTime() - new Date(b.lastIncomingAt).getTime())
    .slice(0, OPTIN_MAX_PER_ACCOUNT_PER_RUN);
  out.candidates += queue.length;

  for (const item of queue) {
    if (Date.now() > deadline) break;
    const result = await sendOptinInvite({
      companyId: account.company_id,
      contactId: item.contact.id,
      trigger: 'quiet',
      knownLastIncomingAt: item.lastIncomingAt,
    });
    if (result.status === 'sent') out.sent++;
    else if (result.status === 'failed') out.failed++;
    else out.skipped++;
    await sleep(SEND_GAP_MS);
  }

  return true;
}
