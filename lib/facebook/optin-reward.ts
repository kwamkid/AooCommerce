// Path: lib/facebook/optin-reward.ts
//
// ออกคูปองให้ลูกค้าที่เพิ่ง "กดรับข่าวสาร" แล้วส่งโค้ดเข้าแชททันที
//
// ทำไมต้องรอ webhook: **การ์ดชวนสมัครใส่คูปองไม่ได้** (Meta ให้แค่รูป/หัวข้อ/ปุ่ม) ทางเดียว
// ที่แจกได้คือรอจังหวะที่เขากดรับ แล้วออกโค้ดเฉพาะคนนั้นส่งตามไป — ได้เปรียบด้วยซ้ำ เพราะ
// โค้ดผูกกับตัวคน (`coupons.fb_contact_id`) ไม่ใช่โค้ดกลางที่หลุดไปให้คนอื่นใช้ได้
//
// ⛔ ห้ามตัดสิทธิ์/หัก `used_count` ที่นี่ — คูปองถูกใช้ตอนสร้างบิลเท่านั้น (domains/coupons.md)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getChatAccount } from '@/lib/chat-config';
import { graphPost } from '@/lib/meta/graph';
import { logIntegrationNow } from '@/lib/integration-logger';
import { generateCouponCode } from '@/lib/coupons';
import { readOptinConfig } from '@/lib/broadcast/optin';

/** คูปองที่ออกจากช่องทางนี้ใช้ได้ทุกที่ที่กรอกโค้ดได้ (marketplace กรอกไม่ได้อยู่แล้ว) */
const REWARD_CHANNELS = ['chat_order', 'bill_online', 'storefront', 'pos'];
const CODE_PREFIX = 'FB';

interface ContactRow {
  id: string;
  company_id: string;
  fb_psid: string;
  chat_account_id: string | null;
  customer_id: string | null;
}

/**
 * ออกคูปองให้ผู้ติดต่อรายนี้ (ถ้าเพจเปิดใช้ไว้) แล้วส่งโค้ดเข้าแชท
 * ไม่ throw — เรียกจาก webhook ใน `after()` ล้มแล้วต้องไม่กระทบการบันทึกว่าเขากดรับ
 */
export async function grantOptinReward(companyId: string, contactId: string): Promise<void> {
  try {
    const { data: contact } = await supabaseAdmin
      .from('fb_contacts')
      .select('id, company_id, fb_psid, chat_account_id, customer_id')
      .eq('id', contactId)
      .maybeSingle<ContactRow>();
    if (!contact || contact.company_id !== companyId || !contact.chat_account_id) return;

    const account = await getChatAccount(contact.chat_account_id);
    if (!account || account.company_id !== companyId) return;
    const creds = (account.credentials || {}) as Record<string, unknown>;
    const pageId = typeof creds.page_id === 'string' ? creds.page_id : '';
    const pageToken = typeof creds.page_access_token === 'string' ? creds.page_access_token : '';
    if (!pageId || !pageToken) return;

    const reward = readOptinConfig(creds, account.account_name || 'ร้าน').reward;
    if (!reward.enabled) return;

    // กันออกซ้ำ — คนเดิมกดรับ/เลิกรับ/กดรับใหม่ ไม่ใช่เหตุให้ได้คูปองเพิ่มอีกใบ
    const { count: existing } = await supabaseAdmin
      .from('coupons')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('fb_contact_id', contact.id)
      .eq('source', 'fb_optin')
      .eq('is_active', true);
    if (existing) return;

    const code = generateCouponCode(CODE_PREFIX);
    const validUntil = new Date(Date.now() + reward.valid_days * 86_400_000).toISOString();

    const { data: coupon, error } = await supabaseAdmin
      .from('coupons')
      .insert({
        company_id: companyId,
        code,
        name: 'ของขวัญสำหรับผู้รับข่าวสาร',
        discount_type: reward.discount_type,
        discount_value: reward.discount_value,
        max_discount: reward.max_discount,
        min_spend: reward.min_spend,
        valid_until: validUntil,
        usage_limit_total: 1,
        usage_limit_per_customer: 1,
        // ผูกกับตัวคนในแชท — `customer_id` จะถูกผูกตอนเขาเปิดบิลครั้งแรก
        fb_contact_id: contact.id,
        customer_id: contact.customer_id,
        channels: REWARD_CHANNELS,
        source: 'fb_optin',
      })
      .select('id, code')
      .maybeSingle<{ id: string; code: string }>();
    if (error || !coupon) {
      console.error('[optin/reward] สร้างคูปองไม่สำเร็จ:', error?.message);
      return;
    }

    const text = reward.message.includes('{code}')
      ? reward.message.replace('{code}', coupon.code)
      : `${reward.message} ${coupon.code}`;

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
      reference_id: coupon.id,
      reference_label: coupon.code,
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
      raw_message: { optin_reward: true, coupon_code: coupon.code, coupon_id: coupon.id },
      sent_at: at,
      created_at: at,
    });
  } catch (err) {
    console.error('[optin/reward] failed:', err instanceof Error ? err.message : String(err));
  }
}
