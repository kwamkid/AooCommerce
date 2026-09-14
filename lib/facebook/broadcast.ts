// Path: lib/facebook/broadcast.ts
//
// ตัวส่งบรอดแคสต์ฝั่ง Facebook (ข้อความการตลาดบน Messenger) — เรียกผ่าน `runBroadcast()` เท่านั้น
//
// ต่างจาก LINE/TikTok ตรงไหน
//  • ผู้รับ **ไม่ได้มาจากห้องแชทของเรา** แต่เป็นคนที่กดรับข่าวสาร ซึ่งรายชื่ออยู่ที่ Meta
//  • ไม่มี multicast — ยิงทีละคน (1 call/คน) จึงเว้นจังหวะระหว่างใบ
//  • ต้องมี "แคมเปญ" ก่อนส่ง และ **แคมเปญที่เพิ่งสร้างส่งทันทีไม่ได้** (Meta เตรียมราว 2 ชม.)
//    → เจอ error ยังไม่พร้อม = หยุดทั้งรอบเป็น `partial` ให้กด "ส่งต่อ" ทีหลัง
//      (ไม่ใช่ mark ล็อตเป็น failed — มันคือเรื่องเวลา ไม่ใช่ความผิดพลาด)
//
// ⚠️ ล็อตเก็บ **PSID ไม่ใช่ subscription token** — token เป็นความลับและ `batches` เป็น jsonb
//    ที่ไม่ได้ mask · ตอนส่งค่อยดึงรายชื่อสดจาก Meta แล้ว map เอา (ได้ของใหม่เสมอด้วย)
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getChatAccount } from '@/lib/chat-config';
import { logIntegrationNow } from '@/lib/integration-logger';
import { BROADCAST_SETUP_KEYS } from '@/lib/broadcast/platforms';
import {
  getMarketingSystemToken,
  listMarketingSubscribers,
  createMessageCampaign,
  sendMarketingMessage,
  isEligibleNow,
  type MarketingSubscriber,
} from '@/lib/meta/marketing-messages';
import type { BroadcastAction, BroadcastContent, BroadcastBlock } from '@/lib/broadcast/content';

/** ส่งทีละคน — ล็อตเล็กพอให้จดความคืบหน้าบ่อย แต่ไม่ patch DB ถี่จนเปลือง */
const BATCH_SIZE = 25;
/** เว้นจังหวะระหว่างใบ — ยิงรัวคือทางลัดไปหา rate limit */
const SEND_GAP_MS = 120;
/** เพดานของ generic template ที่ Messenger รับ */
const TITLE_MAX = 80;
const SUBTITLE_MAX = 80;
const BUTTON_LABEL_MAX = 20;
const BUTTONS_PER_ELEMENT = 3;
const ELEMENTS_MAX = 10;

interface FacebookBatch {
  index: number;
  retry_key: string;
  /** PSID ของผู้รับในล็อตนี้ */
  user_ids: string[];
  contact_ids: string[];
  status: 'pending' | 'sent' | 'failed';
  /** จำนวนใบที่ Meta ปฏิเสธรายคน (ส่วนที่เหลือในล็อตถึงแล้ว) */
  rejected?: number;
  error?: string | null;
}

interface FacebookBroadcastRow {
  id: string;
  company_id: string;
  chat_account_id: string;
  created_by: string | null;
  content: BroadcastContent | null;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  batches: FacebookBatch[] | null;
  platform_data: Record<string, unknown> | null;
  started_at: string | null;
  preview: string | null;
}

// ─── เนื้อหาชนิดกลาง → ข้อความของ Messenger ───────────────────────────

/** ปุ่มหนึ่งใบ — Messenger รับเฉพาะที่เปิด URL ได้ (postback ต้องมีตัวรับฝั่งเรา ยังไม่ทำ) */
function toButton(label: string, action: BroadcastAction | null | undefined): Record<string, unknown> | null {
  if (!action) return null;
  const title = (label.trim() || 'เปิด').slice(0, BUTTON_LABEL_MAX);
  if (action.type === 'url' && action.url.trim()) return { type: 'web_url', title, url: action.url.trim() };
  if (action.type === 'product' && action.product?.url) return { type: 'web_url', title, url: action.product.url };
  if (action.type === 'coupon' && action.url) return { type: 'web_url', title, url: action.url };
  // ชนิดที่เหลือ (message / คูปองที่ยังไม่มีลิงก์หน้าร้าน) ไม่มีปุ่มให้ — ตัดทิ้งดีกว่าส่งปุ่มกดแล้วไม่เกิดอะไร
  return null;
}

function textMessage(text: string): Record<string, unknown> {
  return { text: text.slice(0, 2000) };
}

function imageMessage(url: string): Record<string, unknown> {
  return { attachment: { type: 'image', payload: { url, is_reusable: true } } };
}

function genericMessage(elements: Record<string, unknown>[]): Record<string, unknown> {
  return {
    attachment: {
      type: 'template',
      payload: { template_type: 'generic', elements: elements.slice(0, ELEMENTS_MAX) },
    },
  };
}

function blockToMessages(block: BroadcastBlock): Record<string, unknown>[] {
  if (block.type === 'text') return block.text.trim() ? [textMessage(block.text)] : [];
  if (block.type === 'image') return [imageMessage(block.image_url)];
  if (block.type === 'rich') {
    const btn = toButton('ดูเลย', block.action);
    return [genericMessage([{
      title: ' ',   // Messenger บังคับให้มี title — รูปเต็มจอของเราไม่มีหัวข้อ
      image_url: block.image_url,
      ...(btn ? { buttons: [btn] } : {}),
      ...(btn ? { default_action: { type: 'web_url', url: btn.url } } : {}),
    }])];
  }
  // cards
  const elements = block.cards.map(c => {
    const buttons = (c.buttons || [])
      .map(b => toButton(b.label, b.action))
      .filter((b): b is Record<string, unknown> => !!b)
      .slice(0, BUTTONS_PER_ELEMENT);
    const tap = toButton('เปิด', c.tap_action);
    return {
      title: (c.title || ' ').slice(0, TITLE_MAX),
      ...(c.text ? { subtitle: c.text.slice(0, SUBTITLE_MAX) } : {}),
      ...(c.image_url ? { image_url: c.image_url } : {}),
      ...(buttons.length ? { buttons } : {}),
      ...(tap ? { default_action: { type: 'web_url', url: tap.url } } : {}),
    };
  });
  return elements.length ? [genericMessage(elements)] : [];
}

/**
 * เนื้อหาชนิดกลาง → ข้อความที่ Messenger รับ (1 บล็อก = 1 ข้อความ)
 *
 * ⚠️ **แต่ละข้อความกินโควตา 1 ใบต่อคน** ซึ่ง Messenger จำกัด 1 ข้อความ/12 ชม./คน
 * ⇒ ส่งได้ **ใบเดียวเท่านั้น** — เอาบล็อกแรกที่มีเนื้อ ที่เหลือตัดทิ้งพร้อมบอกผู้ใช้
 * (ต่างจาก LINE ที่ ≤3 bubble ยังนับเป็น 1 ข้อความ)
 */
export function buildMessengerMessage(content: BroadcastContent | null): Record<string, unknown> | null {
  if (!content) return null;

  if (content.kind === 'blocks') {
    for (const block of content.blocks || []) {
      const msgs = blockToMessages(block);
      if (msgs.length) return msgs[0];
    }
    return null;
  }

  // ชนิดเดิม: มีรูป = การ์ดรูป + ข้อความเป็นคำอธิบาย · ไม่มีรูป = ข้อความล้วน
  const text = (content.text || '').trim();
  if (content.image_url) {
    const btn = toButton('ดูเลย', content.tap_action)
      || (content.link_url ? { type: 'web_url', title: 'ดูเลย', url: content.link_url } : null);
    return genericMessage([{
      title: (content.title || text || ' ').slice(0, TITLE_MAX),
      ...(content.title && text ? { subtitle: text.slice(0, SUBTITLE_MAX) } : {}),
      image_url: content.image_url,
      ...(btn ? { buttons: [btn], default_action: { type: 'web_url', url: btn.url } } : {}),
    }]);
  }
  return text ? textMessage(text) : null;
}

/** บรรทัดสำหรับสำเนาในห้องแชท — แอดมินต้องอ่านออกว่าส่งอะไรไป */
function previewLine(content: BroadcastContent | null, fallback: string | null): string {
  if (content?.kind === 'blocks') {
    for (const b of content.blocks || []) {
      if (b.type === 'text' && b.text.trim()) return b.text.trim();
      if (b.type === 'cards') {
        const names = b.cards.map(c => c.title).filter(Boolean);
        if (names.length) return names.map(n => `• ${n}`).join('\n');
      }
      if (b.type === 'rich' || b.type === 'image') return '[รูปภาพ]';
    }
  }
  return (content?.text || '').trim() || fallback || '[ข้อความการตลาด]';
}

// ─── ตัวส่ง ───────────────────────────────────────────────────────────

export async function runFacebookBroadcast(
  broadcastId: string,
  opts: { timeBudgetMs?: number } = {},
): Promise<void> {
  const timeBudgetMs = opts.timeBudgetMs ?? 240_000;
  const startedAt = Date.now();

  const patch = (values: Record<string, unknown>) =>
    supabaseAdmin.from('broadcasts').update(values).eq('id', broadcastId);

  const { data } = await supabaseAdmin.from('broadcasts').select('*').eq('id', broadcastId).single();
  const row = data as FacebookBroadcastRow | null;
  if (!row) {
    console.error('[FacebookBroadcast] not found:', broadcastId);
    return;
  }
  if (['sent', 'cancelled', 'scheduled'].includes(row.status)) return;

  const fail = async (message: string) => {
    await patch({ status: 'failed', error: message, finished_at: new Date().toISOString() });
  };

  try {
    const account = await getChatAccount(row.chat_account_id);
    if (!account || account.company_id !== row.company_id) return void (await fail('ไม่พบเพจต้นทาง'));

    const creds = (account.credentials || {}) as Record<string, unknown>;
    const pageId = typeof creds.page_id === 'string' ? creds.page_id : '';
    const pageToken = typeof creds.page_access_token === 'string' ? creds.page_access_token : '';
    const adAccountId = String(creds[BROADCAST_SETUP_KEYS.adAccountId] ?? '').trim();
    const dailyBudget = Number(creds[BROADCAST_SETUP_KEYS.dailyBudget] ?? 0);
    if (!pageId || !pageToken) return void (await fail('เพจนี้ยังไม่มี token — เชื่อมต่อเพจใหม่ก่อน'));
    if (!adAccountId || dailyBudget <= 0) {
      return void (await fail('ยังไม่ได้ตั้งค่าบัญชีโฆษณา/งบของเพจนี้ — ไปที่ การตลาด › บรอดแคสต์ › ตั้งค่า'));
    }

    const systemToken = await getMarketingSystemToken(row.company_id);
    if (!systemToken) {
      return void (await fail('ยังไม่ได้เชื่อม business สำหรับข้อความการตลาด — ไปที่ ตั้งค่า › บัญชีโฆษณา'));
    }

    const message = buildMessengerMessage(row.content);
    if (!message) return void (await fail('เนื้อหาว่าง — ใส่ข้อความหรือรูปก่อนส่ง'));

    await patch({ status: 'sending', started_at: row.started_at || new Date().toISOString() });

    // ── 1. แคมเปญ — สร้างครั้งเดียวต่อบรอดแคสต์ ──────────────────────────
    const platformData = { ...(row.platform_data || {}) } as Record<string, unknown>;
    let campaignId = typeof platformData.campaign_id === 'string' ? platformData.campaign_id : '';
    if (!campaignId) {
      const created = await createMessageCampaign(adAccountId, systemToken, {
        name: `${(row.preview || 'บรอดแคสต์').slice(0, 60)} ${new Date().toISOString().slice(0, 16)}`,
        pageId,
        dailyBudgetSatang: dailyBudget,
      });
      await logIntegrationNow({
        company_id: row.company_id,
        integration: 'facebook',
        account_id: row.chat_account_id,
        account_name: account.account_name,
        direction: 'outgoing',
        action: 'create_message_campaign',
        method: 'POST',
        api_path: `/act_${adAccountId}/message_campaign`,
        status: created.ok ? 'success' : 'error',
        error_message: created.error || undefined,
        reference_type: 'broadcast',
        reference_id: broadcastId,
      });
      if (!created.ok || !created.id) return void (await fail(created.error || 'สร้างแคมเปญไม่สำเร็จ'));
      campaignId = created.id;
      platformData.campaign_id = campaignId;
      platformData.campaign_created_at = new Date().toISOString();
      await patch({ platform_data: platformData });
    }

    // ── 2. ผู้รับ — ถามสดจาก Meta ทุกครั้ง (รายชื่ออยู่ที่เขา) ─────────────
    const subs = await listMarketingSubscribers(pageId, pageToken);
    if (!subs.ok) return void (await fail(subs.error || 'ดึงรายชื่อผู้สมัครไม่สำเร็จ'));
    const byPsid = new Map<string, MarketingSubscriber>(subs.subscribers.map(s => [s.psid, s]));

    let batches: FacebookBatch[] = Array.isArray(row.batches) ? row.batches : [];
    if (batches.length === 0) {
      const eligible = subs.subscribers.filter(s => isEligibleNow(s));
      if (eligible.length === 0) {
        return void (await fail(
          subs.subscribers.length === 0
            ? 'ยังไม่มีใครกดรับข่าวสารของเพจนี้'
            : 'ทุกคนเพิ่งได้รับข้อความไปแล้ว — ส่งได้คนละ 1 ข้อความต่อ 12 ชั่วโมง',
        ));
      }
      // ผูก PSID กับห้องแชทที่มีอยู่ เพื่อเขียนสำเนาให้แอดมินเห็น (ไม่มีห้อง = ส่งได้แต่ไม่มีสำเนา)
      const psids = eligible.map(s => s.psid);
      const contactByPsid = new Map<string, string>();
      for (let i = 0; i < psids.length; i += 300) {
        const { data: rows } = await supabaseAdmin
          .from('fb_contacts')
          .select('id, fb_psid')
          .eq('company_id', row.company_id)
          .in('fb_psid', psids.slice(i, i + 300));
        for (const c of (rows || []) as { id: string; fb_psid: string }[]) contactByPsid.set(c.fb_psid, c.id);
      }
      batches = [];
      for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
        const slice = eligible.slice(i, i + BATCH_SIZE);
        batches.push({
          index: batches.length,
          retry_key: crypto.randomUUID(),
          user_ids: slice.map(s => s.psid),
          contact_ids: slice.map(s => contactByPsid.get(s.psid) || ''),
          status: 'pending',
        });
      }
      await patch({ batches, recipient_count: eligible.length });
    }

    const tally = (status: FacebookBatch['status']) =>
      batches.filter(b => b.status === status).reduce((n, b) => n + b.user_ids.length, 0);
    let sentCount = tally('sent');
    let failedCount = tally('failed');

    // ── 3. ส่งทีละคน ────────────────────────────────────────────────────
    for (const batch of batches) {
      if (batch.status === 'sent') continue;
      if (Date.now() - startedAt > timeBudgetMs) {
        await patch({
          batches, sent_count: sentCount, failed_count: failedCount,
          status: 'partial', error: 'หมดเวลาของรอบนี้ — กด "ส่งต่อ" เพื่อส่งส่วนที่เหลือ',
        });
        return;
      }

      let rejected = 0;
      let lastError: string | null = null;
      const deliveredContacts: string[] = [];

      for (let i = 0; i < batch.user_ids.length; i++) {
        const psid = batch.user_ids[i];
        const sub = byPsid.get(psid);
        // หายไปจากรายชื่อ = กดเลิกรับระหว่างทาง · ยังไม่ถึงรอบ = ข้ามไปรอบหน้า
        if (!sub || !isEligibleNow(sub)) { rejected += 1; continue; }

        const res = await sendMarketingMessage(adAccountId, systemToken, {
          campaignId,
          subscriptionToken: sub.token,
          message,
        });

        if (res.notReady) {
          // แคมเปญยังเตรียมไม่เสร็จ — **หยุดทั้งรอบ** ไม่ mark ล็อตเป็น failed
          await logIntegrationNow({
            company_id: row.company_id,
            integration: 'facebook',
            account_id: row.chat_account_id,
            direction: 'outgoing',
            action: 'broadcast',
            method: 'POST',
            api_path: `/act_${adAccountId}/messages`,
            status: 'pending',
            error_message: res.error || undefined,
            reference_type: 'broadcast',
            reference_id: broadcastId,
          });
          await patch({
            batches, sent_count: sentCount, failed_count: failedCount,
            status: 'partial',
            error: 'Meta กำลังเตรียมแคมเปญ (ใช้เวลาราว 2 ชั่วโมงหลังสร้าง) — กด "ส่งต่อ" อีกครั้งภายหลัง',
          });
          return;
        }

        if (res.ok) {
          const contactId = batch.contact_ids[i];
          if (contactId) deliveredContacts.push(contactId);
        } else {
          rejected += 1;
          lastError = res.error;
        }
        await new Promise(r => setTimeout(r, SEND_GAP_MS));
      }

      batch.status = rejected >= batch.user_ids.length ? 'failed' : 'sent';
      batch.rejected = rejected;
      batch.error = lastError;
      sentCount = tally('sent');
      failedCount = tally('failed');
      await patch({ batches, sent_count: sentCount, failed_count: failedCount });

      if (deliveredContacts.length > 0) {
        await insertFacebookThreadRows(row, deliveredContacts, previewLine(row.content, row.preview));
      }
    }

    const anySent = batches.some(b => b.status === 'sent');
    const anyNotSent = batches.some(b => b.status !== 'sent');
    const rejectedTotal = batches.reduce((n, b) => n + (b.rejected || 0), 0);

    await patch({
      batches,
      sent_count: Math.max(0, tally('sent') - rejectedTotal),
      failed_count: tally('failed') + rejectedTotal,
      status: !anySent ? 'failed' : anyNotSent ? 'partial' : 'sent',
      finished_at: new Date().toISOString(),
      error: rejectedTotal
        ? `Meta ปฏิเสธผู้รับ ${rejectedTotal} ราย (มักเป็นคนที่เพิ่งได้รับไปใน 12 ชม. หรือกดเลิกรับแล้ว)`
        : null,
    });
  } catch (e) {
    console.error('[FacebookBroadcast] error:', e);
    await fail(e instanceof Error ? e.message : 'ส่งบรอดแคสต์ไม่สำเร็จ');
  }
}

/**
 * สำเนาลงห้องแชทของผู้รับ — แอดมินต้องเห็นว่าเคยส่งอะไรไป
 * ⚠️ **ห้ามแตะ `last_message_at` / `unread_count`** (กติกาเดียวกับ LINE) — บรอดแคสต์ไม่ใช่บทสนทนา
 * ถ้าดันขยับ รายชื่อแชททั้งร้านจะสลับลำดับทุกครั้งที่ส่ง
 */
async function insertFacebookThreadRows(
  row: FacebookBroadcastRow,
  contactIds: string[],
  line: string,
): Promise<void> {
  const at = new Date().toISOString();
  for (let i = 0; i < contactIds.length; i += 200) {
    const chunk = contactIds.slice(i, i + 200).map(contactId => ({
      company_id: row.company_id,
      fb_contact_id: contactId,
      direction: 'outgoing',
      message_type: 'text',
      content: line,
      raw_message: { broadcast_id: row.id, marketing_message: true },
      sent_by: row.created_by,
      sent_at: at,
      created_at: at,
    }));
    const { error } = await supabaseAdmin.from('fb_messages').insert(chunk);
    if (error) {
      // ข้อความออกไปหาลูกค้าแล้ว — เขียนสำเนาไม่ได้ก็ห้ามล้มทั้งงาน
      console.error('[FacebookBroadcast] insert thread rows failed:', error.message);
      return;
    }
  }
}
