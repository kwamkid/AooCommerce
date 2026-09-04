import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendChatPush } from '@/lib/push/send';
import { logIntegrationNow } from '@/lib/integration-logger';
import { getChatAccount, getDefaultChatAccount, getFbCredsFromAccount } from '@/lib/chat-config';
import { getFbCredentials } from '@/lib/fb-config';
import crypto from 'crypto';
import type { SendMessageParams, SendMessageResult, ResolvedCredentials, PlatformProfile, GetMessagesParams } from './types';

// Facebook webhook event types
export interface FbMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    app_id?: number;
    attachments?: Array<{
      type: string; // 'image' | 'video' | 'audio' | 'file' | 'fallback' | 'template' | 'story_mention' | 'story_reply'
      title?: string;
      url?: string;
      payload?: {
        url?: string;
        sticker_id?: number;
        title?: string;
        template_type?: string;
        // Template payload fields
        text?: string;
        buttons?: Array<{ type: string; title: string; url?: string; payload?: string }>;
        elements?: Array<{
          title?: string;
          subtitle?: string;
          image_url?: string;
          quantity?: number;
          price?: number;
          currency?: string;
          buttons?: Array<{ type: string; title: string; url?: string; payload?: string }>;
        }>;
        // Receipt template
        recipient_name?: string;
        order_number?: string;
        currency?: string;
        payment_method?: string;
        order_url?: string;
        timestamp?: string;
        summary?: { subtotal?: number; shipping_cost?: number; total_tax?: number; total_cost?: number };
        address?: { street_1?: string; street_2?: string; city?: string; postal_code?: string; state?: string; country?: string };
        adjustments?: Array<{ name?: string; amount?: number }>;
        // Coupon template
        coupon_url?: string;
        coupon_code?: string;
      };
    }>;
    sticker_id?: number;
    // Instagram story reply context
    reply_to?: { story?: { url?: string; id?: string } };
  };
  postback?: {
    title: string;
    payload: string;
  };
  // Facebook/Instagram referral (from ads, shops, etc.)
  referral?: {
    source?: string;      // 'MESSENGER' | 'ADS' | 'SHORTLINK' | 'CUSTOMER_CHAT_PLUGIN'
    type?: string;        // 'OPEN_THREAD'
    ref?: string;         // custom ref param
    ad_id?: string;
    ads_context_data?: {
      ad_title?: string;
      photo_url?: string;
      video_url?: string;
      post_id?: string;
      product_id?: string;
    };
  };
}

export interface FbWebhookEntry {
  id: string;
  time: number;
  messaging?: FbMessagingEvent[];
}

export interface FbWebhookBody {
  object: string;
  entry: FbWebhookEntry[];
}

/**
 * ป้ายภาษาไทยของชนิดไฟล์แนบที่ Facebook/Instagram ส่งมาแต่เราไม่มีตัวแสดงเฉพาะ
 *
 * ⚠️ **ห้ามปล่อยโค้ดดิบของแพลตฟอร์มไปเป็นข้อความในแชท** — ของเดิมเขียน `[${type}]` ตรง ๆ
 * ทำให้ในแชทจริงมีข้อความอย่าง `[unsupported_type]` `[ig_post]` `[ephemeral]` โผล่ให้
 * แอดมินอ่าน 242 ข้อความ (เจอ 4 ก.ย. 2026 — ดู fix-bug.md) · ชนิดใหม่ที่ยังไม่รู้จัก
 * ตกไปที่ `[ไฟล์แนบ]` แล้วเก็บชื่อชนิดจริงไว้ใน metadata สำหรับไล่ทีหลัง
 *
 * `unsupported_type` = แพลตฟอร์มเองไม่ยอมส่งเนื้อหาผ่าน API (สื่อที่หายเอง ข้อความเสียง
 * การแชร์บางแบบ) ไม่ใช่บั๊กของเรา และดึงมาแสดงไม่ได้ — ต้องบอกให้ไปเปิดดูในแอปต้นทาง
 */
const ATTACHMENT_LABELS: Record<string, string> = {
  unsupported_type: '[แพลตฟอร์มไม่ส่งเนื้อหานี้มาให้ — เปิดดูในแอปต้นทาง]',
  ig_post: '[โพสต์ Instagram]',
  ig_reel: '[รีล Instagram]',
  ig_story: '[สตอรี่ Instagram]',
  reel: '[รีล]',
  share: '[แชร์ลิงก์]',
  ephemeral: '[สื่อที่ดูได้ครั้งเดียว]',
};

export class FacebookChatService {
  // ─── Credential Resolution ───────────────────────────────────────────

  async resolveCredentials(contactAccountId?: string | null, companyId?: string | null): Promise<ResolvedCredentials | null> {
    let pageAccessToken: string | null = null;
    let pageId: string | null = null;
    let accountId: string | null = null;

    if (contactAccountId) {
      const account = await getChatAccount(contactAccountId);
      if (account) {
        const creds = getFbCredsFromAccount(account);
        if (creds) {
          pageAccessToken = creds.page_access_token;
          pageId = creds.page_id;
          accountId = account.id;
        }
      }
    }

    if (!pageAccessToken && companyId) {
      const account = await getDefaultChatAccount(companyId, 'facebook');
      if (account) {
        const creds = getFbCredsFromAccount(account);
        if (creds) {
          pageAccessToken = creds.page_access_token;
          pageId = creds.page_id;
          accountId = account.id;
        }
      }
    }

    if (!pageAccessToken && companyId) {
      const credentials = await getFbCredentials(companyId);
      if (credentials) {
        pageAccessToken = credentials.page_access_token;
        pageId = credentials.page_id;
      }
    }

    if (!pageAccessToken || !pageId) return null;
    return { accessToken: pageAccessToken, pageId, accountId: accountId || undefined };
  }

  // ─── Send Message ────────────────────────────────────────────────────

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { contactId, companyId, userId, type, text, imageUrl } = params;

    // Get contact
    const { data: contact } = await supabaseAdmin
      .from('fb_contacts')
      .select('fb_psid, chat_account_id')
      .eq('id', contactId)
      .eq('company_id', companyId)
      .single();

    if (!contact) return { success: false, error: 'Contact not found' };

    // Resolve credentials
    const creds = await this.resolveCredentials(contact.chat_account_id, companyId);
    if (!creds) return { success: false, error: 'Facebook ยังไม่ได้ตั้งค่า กรุณาตั้งค่าที่ ตั้งค่า > ช่องทาง Chat' };

    // Build FB message
    let fbMessage: Record<string, unknown>;
    if (type === 'text') {
      fbMessage = { text };
    } else if (type === 'image') {
      fbMessage = { attachment: { type: 'image', payload: { url: imageUrl, is_reusable: true } } };
    } else {
      return { success: false, error: 'Unsupported message type for Facebook' };
    }

    // Send via FB API — try RESPONSE first, fallback to HUMAN_AGENT tag if outside 24h window
    const sendUrl = `https://graph.facebook.com/v21.0/${creds.pageId}/messages?access_token=${creds.accessToken}`;
    const sendPayload = { recipient: { id: contact.fb_psid }, message: fbMessage, messaging_type: 'RESPONSE' };

    const startTime = Date.now();
    // LINE/FB เคยไม่มี log สักบรรทัด — token เพจหมดอายุ (FB บังคับต่ออายุทุก 60 วัน)
    // หรือเพจถูกถอดสิทธิ์ จะเงียบสนิท ทั้งที่เป็นช่องทางที่คุยเยอะที่สุดของร้าน
    // **await** เพราะอยู่ใน request handler — ปล่อยลอยแล้วโดน freeze ทิ้ง
    const logSend = (httpStatus: number, errorMessage?: string) => logIntegrationNow({
      company_id: companyId,
      account_id: contact.chat_account_id,
      integration: 'facebook',
      direction: 'outgoing',
      action: 'chat_send_message',
      method: 'POST',
      api_path: `/${creds.pageId}/messages`,
      http_status: httpStatus,
      status: errorMessage ? 'error' : 'success',
      error_message: errorMessage,
      reference_type: 'chat',
      reference_id: contact.fb_psid,
      duration_ms: Date.now() - startTime,
    });

    let fbRes = await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sendPayload),
    });

    if (!fbRes.ok) {
      const err = await fbRes.json();
      const subcode = err.error?.error_subcode;
      const code = err.error?.code;
      // Outside messaging window: subcode 2018278 (FB), 2534022 (IG), or code 10
      const isWindowError = subcode === 2018278 || subcode === 2534022 || code === 10;

      if (isWindowError) {
        console.log('Outside messaging window, retrying with HUMAN_AGENT tag');
        fbRes = await fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: contact.fb_psid },
            message: fbMessage,
            messaging_type: 'MESSAGE_TAG',
            tag: 'HUMAN_AGENT',
          }),
        });

        if (!fbRes.ok) {
          const retryErr = await fbRes.json();
          console.error('Facebook Send API error (HUMAN_AGENT):', retryErr);
          await logSend(fbRes.status, `HUMAN_AGENT: ${retryErr.error?.message || 'send failed'}`);
          return {
            success: false,
            error: 'ไม่สามารถส่งข้อความได้ — ลูกค้าไม่ได้ส่งข้อความมาภายใน 7 วัน (หมดเวลาตอบกลับ)',
            errorCode: 'MESSAGING_WINDOW_EXPIRED',
          };
        }
      } else {
        console.error('Facebook Send API error:', err);
        await logSend(fbRes.status, err.error?.message || 'Facebook API error');
        return { success: false, error: err.error?.message || 'Facebook API error' };
      }
    }
    await logSend(fbRes.status);

    const fbResult = await fbRes.json();

    // Save to DB
    const { messageContent, rawMessage } = this.buildMessageContent(type, text, imageUrl);

    const { data: savedMessage } = await supabaseAdmin
      .from('fb_messages')
      .insert({
        company_id: companyId,
        fb_contact_id: contactId,
        fb_message_id: fbResult.message_id || null,
        direction: 'outgoing',
        message_type: type,
        content: messageContent,
        raw_message: Object.keys(rawMessage).length > 0 ? rawMessage : null,
        sent_by: userId,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select('*, sent_by_user:user_profiles!sent_by(id, name)')
      .single();

    await supabaseAdmin
      .from('fb_contacts')
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('company_id', companyId);

    return { success: true, message: savedMessage };
  }

  // ─── Get Messages ───────────────────────────────────────────────────

  async getMessages(params: GetMessagesParams) {
    const { contactId, companyId, limit, offset } = params;

    const { data: messages, error } = await supabaseAdmin
      .from('fb_messages')
      .select('*, sent_by_user:user_profiles!sent_by(id, name)')
      .eq('company_id', companyId)
      .eq('fb_contact_id', contactId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { messages: null, error: error.message };

    // Mark as read
    await supabaseAdmin
      .from('fb_contacts')
      .update({ unread_count: 0 })
      .eq('id', contactId)
      .eq('company_id', companyId);

    return { messages: (messages || []).reverse(), error: null };
  }

  // ─── Webhook: Verify Signature ──────────────────────────────────────

  verifySignature(body: string, signature: string, appSecret: string): boolean {
    if (!appSecret || !signature) return false;
    const expectedSig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(body).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    } catch {
      return false;
    }
  }

  // ─── Webhook: Find Account by Page ID ───────────────────────────────

  async findAccountByPageId(pageId: string) {
    const { data } = await supabaseAdmin
      .from('chat_accounts')
      .select('*')
      .eq('platform', 'facebook')
      .eq('is_active', true);

    if (!data) return null;
    for (const account of data) {
      const creds = account.credentials as Record<string, string>;
      if (creds?.page_id === pageId) return account;
    }
    return null;
  }

  // ─── Webhook: Find Account by IG Account ID ──────────────────────────

  async findAccountByIgAccountId(igAccountId: string) {
    const { data } = await supabaseAdmin
      .from('chat_accounts')
      .select('*')
      .eq('platform', 'facebook')
      .eq('is_active', true);

    if (!data) return null;
    for (const account of data) {
      const creds = account.credentials as Record<string, string>;
      if (creds?.ig_account_id === igAccountId) return account;
    }
    return null;
  }

  // ─── Webhook: Verify Token for Subscription ────────────────────────

  async verifySubscription(token: string): Promise<boolean> {
    const { data: accounts } = await supabaseAdmin
      .from('chat_accounts')
      .select('*')
      .eq('platform', 'facebook')
      .eq('is_active', true);

    if (!accounts) return false;
    for (const account of accounts) {
      const creds = account.credentials as Record<string, string>;
      if (creds?.verify_token === token) return true;
    }
    return false;
  }

  // ─── Webhook: Get or Create Contact ─────────────────────────────────

  async getOrCreateContact(psid: string, pageId: string, accessToken: string, companyId: string, chatAccountId: string | null, isInstagram: boolean = false) {
    const { data: existing } = await supabaseAdmin
      .from('fb_contacts')
      .select('*')
      .eq('company_id', companyId)
      .eq('fb_psid', psid)
      .single();

    if (existing) {
      // Retry profile fetch if still default name or no picture
      const defaultName = isInstagram ? 'Instagram User' : 'Facebook User';
      if (existing.display_name === defaultName || existing.display_name === 'Facebook User' || existing.display_name === 'Instagram User' || !existing.picture_url) {
        const profile = isInstagram
          ? await this.fetchIgProfile(psid, accessToken)
          : await this.fetchProfile(psid, accessToken);
        if (profile && (profile.displayName !== defaultName || profile.pictureUrl)) {
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (profile.displayName !== defaultName) updates.display_name = profile.displayName;
          if (profile.pictureUrl) updates.picture_url = profile.pictureUrl;
          await supabaseAdmin.from('fb_contacts').update(updates).eq('id', existing.id);
          return { ...existing, ...updates };
        }
      }
      return existing;
    }

    // Get user profile from Graph API
    let displayName = isInstagram ? 'Instagram User' : 'Facebook User';
    let pictureUrl: string | null = null;

    if (isInstagram) {
      // IG: Use /IGSID endpoint to get IG user profile
      const profile = await this.fetchIgProfile(psid, accessToken);
      if (profile) {
        displayName = profile.displayName || displayName;
        pictureUrl = profile.pictureUrl || null;
      }
    } else {
      const profile = await this.fetchProfile(psid, accessToken);
      if (profile) {
        displayName = profile.displayName || displayName;
        pictureUrl = profile.pictureUrl || null;
      }
    }

    const insertData: Record<string, unknown> = {
      company_id: companyId,
      fb_psid: psid,
      fb_page_id: pageId,
      display_name: displayName,
      picture_url: pictureUrl,
      source: isInstagram ? 'instagram' : 'facebook',
      status: 'active',
      unread_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (chatAccountId) insertData.chat_account_id = chatAccountId;

    const { data: newContact, error } = await supabaseAdmin
      .from('fb_contacts').insert(insertData).select().single();

    if (error) { console.error('Failed to create FB/IG contact:', error); return null; }
    return newContact;
  }

  // ─── Webhook: Save Incoming Message ─────────────────────────────────

  async saveIncomingMessage(
    contact: { id: string; unread_count: number; display_name?: string | null },
    event: FbMessagingEvent,
    companyId: string
  ) {
    const message = event.message!;
    const { messageContent, messageType, metadata } = this.parseMessageContent(message);

    // Save to DB
    const { error } = await supabaseAdmin
      .from('fb_messages')
      .insert({
        company_id: companyId,
        fb_contact_id: contact.id,
        fb_message_id: message.mid,
        direction: 'incoming',
        message_type: messageType,
        content: messageContent,
        raw_message: Object.keys(metadata).length > 0 ? metadata : null,
        received_at: new Date(event.timestamp).toISOString(),
        created_at: new Date().toISOString(),
      });

    if (error) console.error('Failed to save FB message:', error);

    // Update contact
    await supabaseAdmin
      .from('fb_contacts')
      .update({
        last_message_at: new Date(event.timestamp).toISOString(),
        unread_count: (contact.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id);

    // Push แจ้งเตือนแชทใหม่ (เฉพาะข้อความสด — เก่าเกิน 10 นาทีถูกกรองใน helper)
    if (!error) {
      await sendChatPush(companyId, {
        platform: 'facebook',
        senderName: contact.display_name,
        preview: messageContent,
        contactId: contact.id,
        messageTime: event.timestamp,
      });
    }
  }

  // ─── Webhook: Save Echo (outgoing from FB Messenger) ───────────────

  async saveEchoMessage(
    contact: { id: string },
    event: FbMessagingEvent,
    companyId: string
  ) {
    const message = event.message!;

    // Skip if we already have this message (sent via our API)
    if (message.mid) {
      const { data: existing } = await supabaseAdmin
        .from('fb_messages')
        .select('id')
        .eq('fb_message_id', message.mid)
        .eq('company_id', companyId)
        .maybeSingle();

      if (existing) return; // Already saved from our sendMessage()
    }

    const { messageContent, messageType, metadata } = this.parseMessageContent(message);

    const { error } = await supabaseAdmin
      .from('fb_messages')
      .insert({
        company_id: companyId,
        fb_contact_id: contact.id,
        fb_message_id: message.mid,
        direction: 'outgoing',
        message_type: messageType,
        content: messageContent,
        raw_message: Object.keys(metadata).length > 0 ? metadata : null,
        sent_at: new Date(event.timestamp).toISOString(),
        created_at: new Date().toISOString(),
      });

    if (error) console.error('Failed to save FB echo message:', error);

    // Update contact last_message_at
    await supabaseAdmin
      .from('fb_contacts')
      .update({
        last_message_at: new Date(event.timestamp).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id);
  }

  // ─── Webhook: Save Referral Data (from ads, shops, etc.) ───────────

  async saveReferralData(contactId: string, referral: NonNullable<FbMessagingEvent['referral']>) {
    const updateData: Record<string, unknown> = {
      referral_source: referral.source || 'unknown',
      referral_data: referral,
      updated_at: new Date().toISOString(),
    };

    if (referral.ad_id) {
      updateData.referral_ad_id = referral.ad_id;
    }
    if (referral.ads_context_data?.ad_title) {
      updateData.referral_ad_title = referral.ads_context_data.ad_title;
    }

    const { error } = await supabaseAdmin
      .from('fb_contacts')
      .update(updateData)
      .eq('id', contactId);

    if (error) console.error('Failed to save referral data:', error);
  }

  // ─── Profile Fetching ───────────────────────────────────────────────

  async fetchProfile(psid: string, accessToken: string): Promise<PlatformProfile | null> {
    try {
      // Try with name field first (works with pages_messaging permission)
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${psid}?fields=name,first_name,last_name,profile_pic&access_token=${accessToken}`
      );
      if (!response.ok) {
        console.log('FB profile fetch failed:', response.status);
        // Fallback: try with just profile_pic (pic usually works even without name permission)
        const picResponse = await fetch(
          `https://graph.facebook.com/v21.0/${psid}/picture?redirect=false&type=large&access_token=${accessToken}`
        );
        if (picResponse.ok) {
          const picData = await picResponse.json();
          if (picData.data?.url) {
            return { displayName: 'Facebook User', pictureUrl: picData.data.url };
          }
        }
        return null;
      }
      const profile = await response.json();
      const displayName = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Facebook User';
      return {
        displayName,
        pictureUrl: profile.profile_pic || undefined,
      };
    } catch (error) {
      console.error('Error fetching FB profile:', error);
      return null;
    }
  }

  // ─── IG Profile Fetching ────────────────────────────────────────────

  async fetchIgProfile(igsid: string, accessToken: string): Promise<PlatformProfile | null> {
    try {
      // For IG messaging, use the IGSID to get user profile
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${igsid}?fields=name,username,profile_pic&access_token=${accessToken}`
      );
      if (!response.ok) {
        console.log('IG profile fetch failed:', response.status, await response.text().catch(() => ''));
        return null;
      }
      const profile = await response.json();
      const displayName = profile.name || profile.username || 'Instagram User';
      return {
        displayName,
        pictureUrl: profile.profile_pic || undefined,
      };
    } catch (error) {
      console.error('Error fetching IG profile:', error);
      return null;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private buildMessageContent(type: string, text?: string, imageUrl?: string) {
    let messageContent = '';
    let rawMessage: Record<string, unknown> = {};

    if (type === 'text') {
      messageContent = text!;
    } else if (type === 'image') {
      messageContent = '[รูปภาพ]';
      rawMessage = { imageUrl };
    }

    return { messageContent, rawMessage };
  }

  private parseMessageContent(message: NonNullable<FbMessagingEvent['message']>): {
    messageContent: string; messageType: string; metadata: Record<string, unknown>;
  } {
    let messageContent = '';
    let messageType = 'text';
    const metadata: Record<string, unknown> = {};

    if (message.text) {
      messageContent = message.text;
      messageType = 'text';
      // Instagram: text reply to our Story — include story context
      if (message.reply_to?.story) {
        messageType = 'story_reply';
        if (message.reply_to.story.url) metadata.storyUrl = message.reply_to.story.url;
      }
    } else if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0];
      messageType = attachment.type;

      if (attachment.type === 'image') {
        messageContent = '[รูปภาพ]';
        if (attachment.payload?.sticker_id) {
          messageType = 'sticker';
          messageContent = '[สติกเกอร์]';
          metadata.sticker_id = attachment.payload.sticker_id;
        }
        if (attachment.payload?.url) metadata.imageUrl = attachment.payload.url;
      } else if (attachment.type === 'video') {
        messageContent = '[วิดีโอ]';
        if (attachment.payload?.url) metadata.videoUrl = attachment.payload.url;
      } else if (attachment.type === 'audio') {
        messageContent = '[เสียง]';
        if (attachment.payload?.url) metadata.audioUrl = attachment.payload.url;
      } else if (attachment.type === 'file') {
        messageContent = '[ไฟล์]';
        if (attachment.payload?.url) metadata.fileUrl = attachment.payload.url;
      } else if (attachment.type === 'template') {
        // Rich messages: receipts, buttons, generic, coupon templates
        messageType = 'template';
        const payload = attachment.payload;
        // Extract meaningful text from template
        if (payload?.text) {
          messageContent = payload.text;
        } else if (payload?.template_type === 'receipt') {
          messageContent = payload.recipient_name
            ? `ใบเสร็จสำหรับ ${payload.recipient_name}`
            : '[ใบเสร็จ]';
        } else if (payload?.elements && payload.elements.length > 0) {
          // Generic template — use first element's title + subtitle
          const el = payload.elements[0];
          messageContent = el.title || '';
          if (el.subtitle) messageContent += (messageContent ? ' — ' : '') + el.subtitle;
          if (!messageContent) messageContent = '[เทมเพลต]';
        } else {
          messageContent = attachment.title || payload?.title || '[เทมเพลต]';
        }
        // Store buttons info
        if (payload?.buttons) metadata.buttons = payload.buttons;
        if (payload?.elements) metadata.elements = payload.elements;
        if (payload?.url) metadata.templateUrl = payload.url;
        if (attachment.url) metadata.templateUrl = attachment.url;
        metadata.template_type = payload?.template_type;
        // Receipt template fields
        if (payload?.template_type === 'receipt') {
          if (payload.recipient_name) metadata.recipient_name = payload.recipient_name;
          if (payload.order_number) metadata.order_number = payload.order_number;
          if (payload.currency) metadata.currency = payload.currency;
          if (payload.payment_method) metadata.payment_method = payload.payment_method;
          if (payload.order_url) metadata.order_url = payload.order_url;
          if (payload.timestamp) metadata.timestamp = payload.timestamp;
          if (payload.summary) metadata.summary = payload.summary;
          if (payload.address) metadata.receipt_address = payload.address;
          if (payload.adjustments) metadata.adjustments = payload.adjustments;
        }
        // Coupon template fields
        if (payload?.template_type === 'coupon') {
          if (payload.coupon_url) metadata.coupon_url = payload.coupon_url;
          if (payload.coupon_code) metadata.coupon_code = payload.coupon_code;
        }
      } else if (attachment.type === 'story_mention') {
        // Instagram: someone mentioned our account in their Story
        messageType = 'story_mention';
        messageContent = '[กล่าวถึงในสตอรี่]';
        if (attachment.payload?.url) metadata.storyUrl = attachment.payload.url;
      } else if (attachment.type === 'story_reply') {
        // Instagram: someone replied to our Story
        messageType = 'story_reply';
        messageContent = message.text || '[ตอบกลับสตอรี่]';
        if (attachment.payload?.url) metadata.storyUrl = attachment.payload.url;
      } else if (attachment.type === 'fallback') {
        // URL shares, link previews, rich content from Facebook
        messageContent = attachment.title || attachment.url || '[ลิงก์]';
        messageType = 'fallback';
        if (attachment.url) metadata.linkUrl = attachment.url;
        if (attachment.payload?.url) metadata.linkUrl = attachment.payload.url;
        if (attachment.title) metadata.linkTitle = attachment.title;
      } else {
        // ชนิดที่ไม่มี branch เฉพาะ — แปลเป็นป้ายภาษาไทยจาก ATTACHMENT_LABELS
        // ⚠️ ห้ามตกมาถึงตรงนี้แล้วเขียน `[${attachment.type}]` เด็ดขาด (ของเดิมทำแบบนั้น)
        // โค้ดดิบของแพลตฟอร์มจะหลุดไปเป็นข้อความในแชทให้ลูกค้า/แอดมินอ่าน
        messageContent = ATTACHMENT_LABELS[attachment.type] || '[ไฟล์แนบ]';
        if (!ATTACHMENT_LABELS[attachment.type]) metadata.attachment_type = attachment.type;
        // ชนิดพวกนี้ (แชร์โพสต์/รีล/ลิงก์) มักแนบ url มาด้วย — เก็บไว้ให้กดดูต้นทางได้
        if (attachment.payload?.url) metadata.linkUrl = attachment.payload.url;
        if (attachment.url) metadata.linkUrl = attachment.url;
      }

      if (message.attachments.length > 1) {
        metadata.attachments = message.attachments;
      }
    } else if (message.sticker_id) {
      messageType = 'sticker';
      messageContent = '[สติกเกอร์]';
      metadata.sticker_id = message.sticker_id;
    } else {
      // Echo messages from FB Pages Manager / Business Suite may not include text
      // Store raw keys for debugging
      messageContent = '[ข้อความ]';
      metadata.raw_keys = Object.keys(message);
    }

    return { messageContent, messageType, metadata };
  }
}
