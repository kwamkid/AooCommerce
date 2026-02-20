import { supabaseAdmin } from '@/lib/supabase-admin';
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
      type: string; // 'image' | 'video' | 'audio' | 'file' | 'fallback' | 'template'
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
          buttons?: Array<{ type: string; title: string; url?: string; payload?: string }>;
        }>;
      };
    }>;
    sticker_id?: number;
  };
  postback?: {
    title: string;
    payload: string;
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

    // Send via FB API
    const fbRes = await fetch(
      `https://graph.facebook.com/v21.0/${creds.pageId}/messages?access_token=${creds.accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: contact.fb_psid }, message: fbMessage, messaging_type: 'RESPONSE' }),
      }
    );

    if (!fbRes.ok) {
      const err = await fbRes.json();
      console.error('Facebook Send API error:', err);
      return { success: false, error: err.error?.message || 'Facebook API error' };
    }

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
      try {
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${psid}?fields=first_name,last_name,profile_pic&access_token=${accessToken}`
        );
        if (response.ok) {
          const profile = await response.json();
          const firstName = profile.first_name || '';
          const lastName = profile.last_name || '';
          displayName = `${firstName} ${lastName}`.trim() || 'Facebook User';
          pictureUrl = profile.profile_pic || null;
        }
      } catch (error) {
        console.error('Error fetching FB profile:', error);
      }
    }

    const insertData: Record<string, unknown> = {
      company_id: companyId,
      fb_psid: psid,
      fb_page_id: pageId,
      display_name: displayName,
      picture_url: pictureUrl,
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
    contact: { id: string; unread_count: number },
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

  // ─── Profile Fetching ───────────────────────────────────────────────

  async fetchProfile(psid: string, accessToken: string): Promise<PlatformProfile | null> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${psid}?fields=first_name,last_name,profile_pic&access_token=${accessToken}`
      );
      if (!response.ok) return null;
      const profile = await response.json();
      const firstName = profile.first_name || '';
      const lastName = profile.last_name || '';
      return {
        displayName: `${firstName} ${lastName}`.trim() || 'Facebook User',
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
        // Rich messages: receipts, buttons, generic templates
        messageType = 'template';
        const payload = attachment.payload;
        // Extract meaningful text from template
        if (payload?.text) {
          messageContent = payload.text;
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
      } else if (attachment.type === 'fallback') {
        // URL shares, link previews, rich content from Facebook
        messageContent = attachment.title || attachment.url || '[ลิงก์]';
        messageType = 'fallback';
        if (attachment.url) metadata.linkUrl = attachment.url;
        if (attachment.payload?.url) metadata.linkUrl = attachment.payload.url;
        if (attachment.title) metadata.linkTitle = attachment.title;
      } else {
        messageContent = `[${attachment.type}]`;
      }

      if (message.attachments.length > 1) {
        metadata.attachments = message.attachments;
      }
    } else if (message.sticker_id) {
      messageType = 'sticker';
      messageContent = '[สติกเกอร์]';
      metadata.sticker_id = message.sticker_id;
    } else {
      // Unknown message format — store raw for debugging
      messageContent = '[ข้อความ]';
    }

    return { messageContent, messageType, metadata };
  }
}
