// Path: lib/facebook/optin-reward.ts
//
// ส่งคูปองให้ลูกค้าที่เพิ่ง "กดรับข่าวสาร"
//
// ทำไมต้องรอ webhook: **การ์ดชวนสมัครใส่คูปองไม่ได้** (Meta ให้แค่รูป/หัวข้อ/ปุ่ม) ทางเดียว
// ที่แจกได้คือรอจังหวะที่เขากดรับ แล้วส่งโค้ดตามเข้าไปในแชท
//
// ⛔ **คูปองต้องมาจากโมดูลคูปองเท่านั้น** (`/marketing/coupons`) — ห้ามสร้างระบบคูปองซ้อนที่นี่
// เงื่อนไข/โควตา/วันหมดอายุ/ช่องทางที่ใช้ได้ ร้านตั้งที่หน้านั้นที่เดียว
// ⛔ ห้ามตัดสิทธิ์/บวก `used_count` ที่นี่ — คูปองถูกใช้ตอนสร้างบิลเท่านั้น (domains/coupons.md)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getChatAccount } from '@/lib/chat-config';
import { graphPost } from '@/lib/meta/graph';
import { logIntegrationNow } from '@/lib/integration-logger';
import { readOptinConfig, type OptinTrigger } from '@/lib/broadcast/optin';
import { applySavedReplyVars } from '@/lib/chat/saved-reply-vars';

interface ContactRow {
  id: string;
  company_id: string;
  fb_psid: string;
  chat_account_id: string | null;
  display_name: string | null;
}

interface CouponRow {
  id: string;
  code: string;
  is_active: boolean;
  valid_until: string | null;
  usage_limit_total: number | null;
  used_count: number;
}

/**
 * ส่งคูปองของ "จังหวะที่เขากดรับมา" ให้ผู้ติดต่อรายนี้
 *
 * @param trigger จังหวะที่ชวน — มาจาก `optin.payload` (`AOO_OPTIN_<trigger>`) ที่เราแนบไปกับการ์ด
 *   คนที่ซื้อแล้วกับคนที่ยังไม่ซื้อจึงได้คูปองคนละใบและข้อความคนละแบบ
 *
 * ไม่ throw — เรียกจาก webhook ใน `after()` ล้มแล้วต้องไม่กระทบการบันทึกว่าเขากดรับ
 */
export async function grantOptinReward(
  companyId: string,
  contactId: string,
  trigger: OptinTrigger,
): Promise<void> {
  try {
    const { data: contact } = await supabaseAdmin
      .from('fb_contacts')
      .select('id, company_id, fb_psid, chat_account_id, display_name')
      .eq('id', contactId)
      .maybeSingle<ContactRow>();
    if (!contact || contact.company_id !== companyId || !contact.chat_account_id) return;

    const account = await getChatAccount(contact.chat_account_id);
    if (!account || account.company_id !== companyId) return;
    const creds = (account.credentials || {}) as Record<string, unknown>;
    const pageId = typeof creds.page_id === 'string' ? creds.page_id : '';
    const pageToken = typeof creds.page_access_token === 'string' ? creds.page_access_token : '';
    if (!pageId || !pageToken) return;

    const scenario = readOptinConfig(creds, account.account_name || 'ร้าน')[trigger];
    if (!scenario.coupon_id) return; // จังหวะนี้ร้านเลือกไม่ส่งคูปอง

    // อ่านคูปองจริงจากโมดูลคูปอง — ร้านอาจปิด/ลบ/หมดอายุไปแล้วหลังจากตั้งค่าไว้
    const { data: coupon } = await supabaseAdmin
      .from('coupons')
      .select('id, code, is_active, valid_until, usage_limit_total, used_count')
      .eq('id', scenario.coupon_id)
      .eq('company_id', companyId)
      .maybeSingle<CouponRow>();

    const unusable = !coupon
      || !coupon.is_active
      || (coupon.valid_until != null && new Date(coupon.valid_until).getTime() < Date.now())
      || (coupon.usage_limit_total != null && coupon.used_count >= coupon.usage_limit_total);
    if (unusable) {
      // ส่งโค้ดที่ใช้ไม่ได้ออกไปแย่กว่าไม่ส่ง — ลูกค้าจะไปกรอกแล้วเจอปฏิเสธหน้าเช็คเอาต์
      console.warn('[optin/reward] คูปองที่ตั้งไว้ใช้ไม่ได้แล้ว:', scenario.coupon_id);
      return;
    }

    // กันส่งซ้ำ — คนเดิมกดรับ/เลิกรับ/กดใหม่ ไม่ใช่เหตุให้ได้โค้ดอีกรอบ
    const { count: alreadySent } = await supabaseAdmin
      .from('fb_messages')
      .select('id', { count: 'exact', head: true })
      .eq('fb_contact_id', contact.id)
      .contains('raw_message', { optin_reward: true, coupon_id: coupon!.id });
    if (alreadySent) return;

    // ⚠️ แทนค่า {{ตัวแปร}} ก่อนเสมอ (ชุดเดียวกับข้อความสำเร็จรูปในหน้าแชท)
    const message = applySavedReplyVars(scenario.reward_message, {
      customerName: contact.display_name,
      shopName: account.account_name,
    });
    const text = message.includes('{code}')
      ? message.replace('{code}', coupon!.code)
      : `${message} ${coupon!.code}`;

    const res = await graphPost<{ message_id?: string }>(`/${pageId}/messages`, pageToken, {
      recipient: { id: contact.fb_psid },
      message: { text },
    });

    await logIntegrationNow({
      company_id: companyId,
      integration: 'facebook',
      account_id: account.id,
      account_name: account.account_name,
      direction: 'outgoing',
      action: 'send_optin_reward',
      method: 'POST',
      api_path: `/${pageId}/messages`,
      http_status: res.status,
      status: res.ok ? 'success' : 'error',
      error_message: res.error?.message,
      reference_type: 'coupon',
      reference_id: coupon!.id,
      reference_label: `${coupon!.code} · ${trigger}`,
    });

    if (!res.ok) return;

    // สำเนาลงห้องแชท — แอดมินต้องเห็นว่าลูกค้าได้โค้ดอะไรไป (ลูกค้าโทรมาถามได้)
    // ⛔ ไม่แตะ last_message_at / unread_count (ไม่ใช่บทสนทนาที่ต้องมีคนตอบ)
    const at = new Date().toISOString();
    await supabaseAdmin.from('fb_messages').insert({
      company_id: companyId,
      fb_contact_id: contact.id,
      fb_message_id: res.body?.message_id || null,
      direction: 'outgoing',
      message_type: 'text',
      content: text,
      raw_message: { optin_reward: true, trigger, coupon_id: coupon!.id, coupon_code: coupon!.code },
      sent_at: at,
      created_at: at,
    });
  } catch (err) {
    console.error('[optin/reward] failed:', err instanceof Error ? err.message : String(err));
  }
}
