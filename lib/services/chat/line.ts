import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendChatPush } from '@/lib/push/send';
import { logIntegrationNow } from '@/lib/integration-logger';
import { getChatAccount, getDefaultChatAccount, getLineCredsFromAccount } from '@/lib/chat-config';
import { buildMessagePreview } from '@/lib/chat/message-preview';
import crypto from 'crypto';
import type { SendMessageParams, SendMessageResult, ResolvedCredentials, PlatformProfile, GetMessagesParams } from './types';

/**
 * reply token ของ LINE ใช้ได้ **ครั้งเดียว** และ **ภายในราว 1 นาที** หลัง webhook เข้า
 * เผื่อเวลาเดินทางของ webhook + คิว จึงถือว่าใช้ได้แค่ 50 วิ (เกินนั้นให้ push ไปเลย ไม่เสียเที่ยว)
 */
const REPLY_TOKEN_TTL_MS = 50_000;

export class LineChatService {
  // ─── Credential Resolution ───────────────────────────────────────────

  async resolveCredentials(contactAccountId?: string | null, companyId?: string | null): Promise<ResolvedCredentials | null> {
    let accessToken: string | null = null;
    let secret: string | null = null;
    let accountId: string | null = null;

    if (contactAccountId) {
      const account = await getChatAccount(contactAccountId);
      if (account) {
        const creds = getLineCredsFromAccount(account);
        if (creds) {
          accessToken = creds.channel_access_token;
          secret = creds.channel_secret;
          accountId = account.id;
        }
      }
    }

    if (!accessToken && companyId) {
      const account = await getDefaultChatAccount(companyId, 'line');
      if (account) {
        const creds = getLineCredsFromAccount(account);
        if (creds) {
          accessToken = creds.channel_access_token;
          secret = creds.channel_secret;
          accountId = account.id;
        }
      }
    }

    if (!accessToken) return null;
    return { accessToken, secret: secret || undefined, accountId: accountId || undefined };
  }

  // ─── Send Message ────────────────────────────────────────────────────

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { contactId, companyId, userId, type, text, imageUrl, previewUrl, packageId, stickerId } = params;

    // Get contact
    const { data: contact } = await supabaseAdmin
      .from('line_contacts')
      .select('line_user_id, chat_account_id')
      .eq('id', contactId)
      .eq('company_id', companyId)
      .single();

    if (!contact) return { success: false, error: 'Contact not found' };

    // Resolve credentials
    const creds = await this.resolveCredentials(contact.chat_account_id, companyId);
    if (!creds) return { success: false, error: 'LINE ยังไม่ได้ตั้งค่า กรุณาตั้งค่าที่ ตั้งค่า > ช่องทาง Chat' };

    // Build LINE message
    let lineMessage: Record<string, unknown>;
    if (type === 'text') {
      lineMessage = { type: 'text', text };
    } else if (type === 'image') {
      lineMessage = { type: 'image', originalContentUrl: imageUrl, previewImageUrl: previewUrl || imageUrl };
    } else if (type === 'sticker') {
      lineMessage = { type: 'sticker', packageId, stickerId };
    } else {
      return { success: false, error: 'Unsupported message type' };
    }

    // ตอบด้วย reply token ก่อน — **ไม่นับโควตาข้อความของ OA** (push/multicast/broadcast นับทุกใบ)
    // ใช้ได้เฉพาะตอบข้อความล่าสุดของลูกค้าภายใน ~1 นาทีและครั้งเดียว · หยิบไม่ได้/LINE ปฏิเสธ
    // → push ตามเดิมโดยผู้ใช้ไม่รู้สึกอะไร (ข้อความต้องถึงลูกค้าเสมอ ประหยัดโควตาเป็นของแถม)
    const startTime = Date.now();
    const replyToken = await this.claimReplyToken(contactId);
    let sentVia: 'reply' | 'push' = 'push';
    let lineRes: Response | null = null;

    if (replyToken) {
      const replyRes = await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${creds.accessToken}` },
        body: JSON.stringify({ replyToken, messages: [lineMessage] }),
      });
      if (replyRes.ok) {
        sentVia = 'reply';
        lineRes = replyRes;
      } else {
        // 400 "Invalid reply token" = หมดอายุ/ถูกใช้ไปแล้ว — ไม่ใช่ความผิดพลาดของการส่ง แค่ตกไป push
        const replyErr = await replyRes.json().catch(() => ({} as { message?: string }));
        console.warn('LINE reply token ใช้ไม่ได้ → push:', replyRes.status, (replyErr as { message?: string })?.message);
      }
    }

    if (!lineRes) {
      lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${creds.accessToken}` },
        body: JSON.stringify({ to: contact.line_user_id, messages: [lineMessage] }),
      });
    }

    const errBody = lineRes.ok ? null : await lineRes.json().catch(() => ({} as { message?: string }));
    const errMessage = lineRes.ok
      ? undefined
      : (errBody as { message?: string })?.message || `LINE API ${lineRes.status}`;

    // **await** — อยู่ใน request handler ปล่อยลอยแล้ว Vercel freeze ทิ้ง
    // token ของ OA หมดอายุ/ถูกเปลี่ยนคือเรื่องที่ต้องเห็นในหน้า API Monitor
    await logIntegrationNow({
      company_id: companyId,
      account_id: contact.chat_account_id,
      integration: 'line',
      direction: 'outgoing',
      action: 'chat_send_message',
      method: 'POST',
      api_path: sentVia === 'reply' ? '/v2/bot/message/reply' : '/v2/bot/message/push',
      http_status: lineRes.status,
      status: lineRes.ok ? 'success' : 'error',
      error_message: errMessage,
      reference_type: 'chat',
      reference_id: contact.line_user_id,
      reference_label: sentVia === 'reply'
        ? 'ตอบผ่าน reply token (ไม่นับโควตา)'
        : replyToken ? 'reply token ใช้ไม่ได้ → push' : undefined,
      duration_ms: Date.now() - startTime,
    });

    if (!lineRes.ok) {
      console.error('LINE API error:', errBody);
      return { success: false, error: errMessage };
    }

    // Save to DB
    const { messageContent, rawMessage } = this.buildMessageContent(type, text, imageUrl, packageId, stickerId);
    if (sentVia === 'reply') rawMessage.sent_via = 'reply';

    const { data: savedMessage } = await supabaseAdmin
      .from('line_messages')
      .insert({
        company_id: companyId,
        line_contact_id: contactId,
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
      .from('line_contacts')
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('company_id', companyId);

    return { success: true, message: savedMessage };
  }

  /**
   * หยิบ reply token ของข้อความล่าสุดที่ลูกค้าส่งมา — เฉพาะที่ยังไม่ถูกใช้และอายุไม่เกิน
   * REPLY_TOKEN_TTL_MS · "จอง" ด้วย UPDATE แบบมีเงื่อนไข (ยังไม่ถูกใช้) จึงกันสองคนตอบ
   * พร้อมกันหยิบ token ใบเดียวกัน · คืน null = ให้ push ตามเดิม
   */
  private async claimReplyToken(contactId: string): Promise<string | null> {
    const { data: latest } = await supabaseAdmin
      .from('line_messages')
      .select('id, raw_message')
      .eq('line_contact_id', contactId)
      .eq('direction', 'incoming')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) return null;

    const raw = (latest.raw_message as Record<string, unknown> | null) || {};
    const token = typeof raw.reply_token === 'string' ? raw.reply_token : null;
    if (!token || raw.reply_token_used) return null;
    const issuedAt = typeof raw.reply_token_at === 'string' ? Date.parse(raw.reply_token_at) : NaN;
    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > REPLY_TOKEN_TTL_MS) return null;

    const { data: claimed } = await supabaseAdmin
      .from('line_messages')
      .update({ raw_message: { ...raw, reply_token_used: true } })
      .eq('id', latest.id)
      .is('raw_message->>reply_token_used', null)
      .select('id');
    return claimed && claimed.length > 0 ? token : null;
  }

  // ─── Get Messages ───────────────────────────────────────────────────

  async getMessages(params: GetMessagesParams) {
    const { contactId, companyId, limit, offset, markRead = true } = params;

    const { data: messages, error } = await supabaseAdmin
      .from('line_messages')
      .select('*, sent_by_user:user_profiles!sent_by(id, name)')
      .eq('company_id', companyId)
      .eq('line_contact_id', contactId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { messages: null, error: error.message };

    // Mark as read
    // .gt() ไม่ใช่การกันงานเปล่า — UPDATE ค่าเดิมก็ยังยิง Realtime event ทำให้ทุกหน้าแชท
    // ที่เปิดอยู่ + header ของทุกคนดึงรายชื่อใหม่ทั้งชุด (เปิดแชทที่อ่านแล้วก็เกิด)
    if (markRead) {
      await supabaseAdmin
        .from('line_contacts')
        .update({ unread_count: 0 })
        .eq('id', contactId)
        .eq('company_id', companyId)
        .gt('unread_count', 0);
    }

    return { messages: (messages || []).reverse(), error: null };
  }

  // ─── Webhook: Verify Signature ──────────────────────────────────────

  verifySignature(body: string, signature: string, channelSecret: string): boolean {
    if (!channelSecret) return false;
    const hash = crypto.createHmac('sha256', channelSecret).update(body).digest('base64');
    return hash === signature;
  }

  // ─── Webhook: Resolve credentials from query params ─────────────────

  async resolveWebhookCredentials(accountId: string | null, companyId: string | null): Promise<{
    channelSecret: string; accessToken: string; companyId: string | null;
    chatAccountId: string | null; accountName: string | null;
  }> {
    // ไม่มี env fallback แล้ว (ถอด 2026-09-07 หลังตัวเฝ้ายืนยันว่าทุก OA ชี้ URL ที่มี ?account=)
    // — webhook ที่ไม่มี ?account= / ?company= จะได้ secret ว่าง → verifySignature ตก → 401
    let channelSecret = '';
    let accessToken = '';
    let resolvedCompanyId = companyId;
    let chatAccountId = accountId;
    // ชื่อ OA ไปขึ้นหัวข้อแจ้งเตือน — แถว chat_accounts ถูกอ่านอยู่ตรงนี้แล้ว
    // เอาชื่อติดกลับไปด้วยเลย จะได้ไม่ต้อง query ซ้ำตอนยิง push ทุกข้อความ
    let accountName: string | null = null;

    if (accountId) {
      const account = await getChatAccount(accountId);
      if (account && account.is_active) {
        const creds = getLineCredsFromAccount(account);
        if (creds) {
          channelSecret = creds.channel_secret;
          accessToken = creds.channel_access_token;
          resolvedCompanyId = account.company_id;
          accountName = account.account_name || null;
        }
      }
    } else if (companyId) {
      const account = await getDefaultChatAccount(companyId, 'line');
      if (account) {
        chatAccountId = account.id;
        const creds = getLineCredsFromAccount(account);
        if (creds) {
          channelSecret = creds.channel_secret;
          accessToken = creds.channel_access_token;
          accountName = account.account_name || null;
        }
      }
    }

    return { channelSecret, accessToken, companyId: resolvedCompanyId, chatAccountId, accountName };
  }

  // ─── Webhook: Get or Create Contact ─────────────────────────────────

  async getOrCreateContact(
    contactId: string, isGroup: boolean, senderUserId: string | undefined,
    accessToken: string, companyId: string | null, chatAccountId: string | null
  ) {
    let query = supabaseAdmin.from('line_contacts').select('*').eq('line_user_id', contactId);
    if (companyId) query = query.eq('company_id', companyId);
    const { data: existing } = await query.single();
    if (existing) return existing;

    // Get profile/info based on type
    let displayName = 'Unknown';
    let pictureUrl: string | null = null;

    if (isGroup) {
      const groupInfo = await this.getGroupInfo(contactId, true, accessToken);
      displayName = groupInfo?.groupName || groupInfo?.roomName || 'กลุ่มลูกค้า';
      pictureUrl = groupInfo?.pictureUrl || null;
    } else {
      const profile = await this.fetchProfile(contactId, accessToken);
      displayName = profile?.displayName || 'Unknown';
      pictureUrl = profile?.pictureUrl || null;
    }

    const insertData: Record<string, unknown> = {
      line_user_id: contactId,
      display_name: displayName,
      picture_url: pictureUrl,
      status: 'active',
      unread_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (companyId) insertData.company_id = companyId;
    if (chatAccountId) insertData.chat_account_id = chatAccountId;

    const { data: newContact, error } = await supabaseAdmin
      .from('line_contacts').insert(insertData).select().single();

    if (error) { console.error('Failed to create contact:', error); return null; }
    return newContact;
  }

  // ─── Webhook: Save Incoming Message ─────────────────────────────────

  async saveIncomingMessage(
    contact: { id: string; unread_count: number; display_name?: string | null; picture_url?: string | null },
    message: Record<string, unknown>,
    event: { timestamp: number; source: { type: string; userId?: string; groupId?: string } },
    accessToken: string,
    companyId: string | null,
    senderUserId?: string,
    isGroup?: boolean,
    contactId?: string,
    chatAccountId?: string | null,
    accountName?: string | null,
    replyToken?: string | null
  ) {
    // Get sender profile
    let senderName: string | null = null;
    let senderPictureUrl: string | null = null;
    // ซ่อมชื่อ/รูปของผู้ติดต่อ 1:1 จากโปรไฟล์ที่เพิ่งดึงได้ — ผู้ติดต่อที่ถูกสร้างตอน token ยังใช้
    // ไม่ได้จะค้างเป็น "Unknown" ไม่มีรูปตลอดไป เพราะ getOrCreateContact คืนแถวเดิมโดยไม่ดึงซ้ำ
    // (เคสจริง ABC the Baby 7 ก.ย. 2026: ทุกข้อความมีชื่อ Nokzi3659 แต่หัวแชทเป็น Unknown)
    // และคนที่เปลี่ยนชื่อ/รูปใน LINE ก็ได้ของใหม่ตาม · แพตช์รวมไป UPDATE เดิมข้างล่าง ไม่ยิงเพิ่ม
    const contactPatch: Record<string, unknown> = {};

    if (senderUserId) {
      if (isGroup && contactId) {
        const memberProfile = await this.getGroupMemberProfile(contactId, senderUserId, event.source.type === 'group', accessToken);
        senderName = memberProfile?.displayName || null;
        senderPictureUrl = memberProfile?.pictureUrl || null;
      } else {
        const profile = await this.fetchProfile(senderUserId, accessToken);
        senderName = profile?.displayName || null;
        senderPictureUrl = profile?.pictureUrl || null;
        if (profile?.displayName && profile.displayName !== contact.display_name) contactPatch.display_name = profile.displayName;
        if (profile?.pictureUrl && profile.pictureUrl !== contact.picture_url) contactPatch.picture_url = profile.pictureUrl;
      }
    }

    // Prepare message content
    const msgType = message.type as string;
    let messageContent = '';
    const metadata: Record<string, unknown> = {};

    if (msgType === 'text' && message.text) {
      messageContent = message.text as string;
    } else if (msgType === 'image') {
      messageContent = '[รูปภาพ]';
      const contentProvider = message.contentProvider as { type: string; originalContentUrl?: string; previewImageUrl?: string } | undefined;
      if (contentProvider?.type === 'line') {
        const imageUrl = await this.fetchAndStoreMedia(message.id as string, 'image', accessToken);
        if (imageUrl) metadata.imageUrl = imageUrl;
      } else if (contentProvider?.originalContentUrl) {
        metadata.imageUrl = contentProvider.originalContentUrl;
      }
    } else if (msgType === 'video') {
      messageContent = '[วิดีโอ]';
      const contentProvider = message.contentProvider as { type: string; originalContentUrl?: string; previewImageUrl?: string } | undefined;
      if (contentProvider?.type === 'line') {
        const videoUrl = await this.fetchAndStoreMedia(message.id as string, 'video', accessToken);
        if (videoUrl) metadata.videoUrl = videoUrl;
      } else if (contentProvider?.originalContentUrl) {
        metadata.videoUrl = contentProvider.originalContentUrl;
      }
      if (contentProvider?.previewImageUrl) metadata.previewUrl = contentProvider.previewImageUrl;
    } else if (msgType === 'audio') {
      messageContent = '[เสียง]';
      const contentProvider = message.contentProvider as { type: string; originalContentUrl?: string } | undefined;
      if (contentProvider?.type === 'line') {
        const audioUrl = await this.fetchAndStoreMedia(message.id as string, 'audio', accessToken);
        if (audioUrl) metadata.audioUrl = audioUrl;
      } else if (contentProvider?.originalContentUrl) {
        metadata.audioUrl = contentProvider.originalContentUrl;
      }
      if (message.duration) metadata.duration = message.duration;
    } else if (msgType === 'file') {
      messageContent = `[ไฟล์: ${message.fileName || 'unknown'}]`;
      metadata.fileName = message.fileName;
      metadata.fileSize = message.fileSize;
      const fileUrl = await this.fetchAndStoreMedia(message.id as string, 'file', accessToken);
      if (fileUrl) metadata.fileUrl = fileUrl;
    } else if (msgType === 'sticker') {
      messageContent = '[สติกเกอร์]';
      metadata.stickerId = message.stickerId;
      metadata.packageId = message.packageId;
      metadata.stickerResourceType = message.stickerResourceType;
    } else if (msgType === 'location') {
      messageContent = (message.title as string) || (message.address as string) || '[ตำแหน่ง]';
      metadata.latitude = message.latitude;
      metadata.longitude = message.longitude;
      metadata.address = message.address;
    } else if (msgType === 'flex') {
      messageContent = (message.altText as string) || '[Flex Message]';
      metadata.flexContents = message.contents;
    } else if (msgType === 'template') {
      messageContent = (message.altText as string) || '[Template]';
      metadata.template = message.template;
      metadata.template_type = (message.template as Record<string, unknown>)?.type;
    } else if (msgType === 'imagemap') {
      messageContent = (message.altText as string) || '[Imagemap]';
      metadata.baseUrl = message.baseUrl;
      metadata.baseSize = message.baseSize;
    } else {
      messageContent = `[${msgType}]`;
    }

    // รูปชุดเดียวกันที่ลูกค้าส่งรวดเดียว — LINE ส่งมาทีละใบพร้อมเลขลำดับ
    if (message.imageSet) metadata.image_set = message.imageSet;
    // อีโมจิของ LINE (ไม่ใช่ตัวอักษร) — ในข้อความเป็นตัวยึดตำแหน่ง ต้องวาดเป็นรูปทับ
    if (Array.isArray(message.emojis) && message.emojis.length > 0) metadata.emojis = message.emojis;
    // การกล่าวถึงในกลุ่ม — เก็บไว้ก่อน (ยังไม่มีตัวแสดงเฉพาะ)
    if (message.mention) metadata.mention = message.mention;
    // reply token — ตอบกลับได้ฟรี (ไม่นับโควตา) ภายใน ~1 นาที ครั้งเดียว · sendMessage หยิบไปใช้ก่อน push
    if (replyToken) {
      metadata.reply_token = replyToken;
      metadata.reply_token_at = new Date().toISOString();
    }

    // ตอบกลับข้อความเดิม — snapshot ไว้ในข้อความนี้เลย ไม่ต้อง join ตอนแสดง
    // quoteToken เก็บไว้ใช้ตอนเรา "ตอบกลับ" กลับไปบ้างในอนาคต (LINE บังคับใช้โทเคนนี้)
    if (typeof message.quoteToken === 'string') metadata.quote_token = message.quoteToken;
    if (typeof message.quotedMessageId === 'string' && message.quotedMessageId) {
      metadata.reply_to_id = message.quotedMessageId;
      try {
        const quoted = await this.buildQuotedSnapshot(companyId, contact.id, message.quotedMessageId);
        if (quoted) metadata.quoted = quoted;
      } catch (err) {
        console.error('LINE quoted lookup failed:', err);
      }
    }

    // Save to DB
    const insertData: Record<string, unknown> = {
      line_contact_id: contact.id,
      line_message_id: message.id,
      direction: 'incoming',
      message_type: msgType,
      content: messageContent,
      raw_message: { ...message, ...metadata },
      sender_user_id: senderUserId || null,
      sender_name: senderName,
      sender_picture_url: senderPictureUrl,
      received_at: new Date(event.timestamp).toISOString(),
      created_at: new Date().toISOString(),
    };
    if (companyId) insertData.company_id = companyId;

    const { error } = await supabaseAdmin.from('line_messages').insert(insertData);
    if (error) console.error('Failed to save message:', error);

    // Update contact (+ ชื่อ/รูปที่ซ่อมได้จากโปรไฟล์รอบนี้)
    await supabaseAdmin
      .from('line_contacts')
      .update({
        ...contactPatch,
        last_message_at: new Date(event.timestamp).toISOString(),
        unread_count: contact.unread_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id);

    // Push แจ้งเตือนแชทใหม่ (เฉพาะข้อความสด — เก่าเกิน 10 นาทีถูกกรองใน helper)
    if (!error && companyId) {
      await sendChatPush(companyId, {
        platform: 'line',
        senderName: senderName || contact.display_name,
        preview: messageContent,
        contactId: contact.id,
        messageTime: event.timestamp,
        accountName,
        chatAccountId,
      });
    }
  }

  /**
   * ข้อความความยาวหนึ่งบรรทัดของข้อความที่ถูกอ้างถึง — ใช้ตัวแปลตัวเดียวกับรายชื่อแชท
   * เพื่อให้ "ตอบกลับ: …" อ่านได้เหมือนที่เห็นในรายชื่อ
   */
  private async buildQuotedSnapshot(
    companyId: string | null,
    contactId: string,
    quotedMessageId: string
  ): Promise<Record<string, unknown> | null> {
    let query = supabaseAdmin
      .from('line_messages')
      .select('line_message_id, content, message_type, direction, raw_message')
      .eq('line_contact_id', contactId)
      .eq('line_message_id', quotedMessageId);
    if (companyId) query = query.eq('company_id', companyId);

    const { data } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;

    const raw = (data.raw_message as Record<string, unknown> | null) || {};
    const imageUrl = typeof raw.imageUrl === 'string' ? raw.imageUrl : undefined;
    return {
      message_id: data.line_message_id,
      content: buildMessagePreview(data.message_type, data.content),
      message_type: data.message_type,
      direction: data.direction,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    };
  }

  /**
   * ผู้ส่งกด "ยกเลิกการส่ง" — ทำเครื่องหมายที่แถวเดิม **ห้ามเพิ่มแถวใหม่**
   * (ไม่ขยับ last_message_at ไม่บวก unread ไม่ยิงแจ้งเตือน)
   */
  async handleUnsendEvent(messageId: string, companyId: string | null) {
    if (!messageId) return;
    let query = supabaseAdmin
      .from('line_messages')
      .select('id, raw_message')
      .eq('line_message_id', messageId);
    if (companyId) query = query.eq('company_id', companyId);

    const { data: existing } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!existing) {
      console.warn('LINE unsend: ไม่พบข้อความต้นทางที่จะทำเครื่องหมาย', messageId);
      return;
    }

    const raw = (existing.raw_message as Record<string, unknown> | null) || {};
    const { error } = await supabaseAdmin
      .from('line_messages')
      .update({ content: '[ข้อความถูกเรียกคืน]', raw_message: { ...raw, recalled: true } })
      .eq('id', existing.id);
    if (error) console.error('Failed to mark LINE message recalled:', error);
  }

  /**
   * มีคนเข้า/ออกกลุ่ม — เป็นเหตุการณ์ ไม่ใช่ข้อความของใคร (หน้าแชทวาดเป็นชิปกลางจอ)
   * ดึงชื่อแบบ best effort · ไม่บวก unread และไม่ยิงแจ้งเตือน
   */
  async handleMemberChangeEvent(
    contact: { id: string },
    action: 'joined' | 'left',
    members: Array<{ userId?: string }> | undefined,
    groupId: string,
    isGroup: boolean,
    accessToken: string,
    companyId: string | null,
    timestamp: number
  ) {
    const ids = (members || []).map(m => m?.userId).filter((id): id is string => !!id);
    const names = await Promise.all(
      ids.map(async userId => {
        try {
          const profile = await this.getGroupMemberProfile(groupId, userId, isGroup, accessToken);
          return profile?.displayName || 'สมาชิก';
        } catch {
          return 'สมาชิก';
        }
      })
    );
    const label = names.length > 0 ? names.join(', ') : 'สมาชิก';
    const content = action === 'joined' ? `${label} เข้าร่วมกลุ่ม` : `${label} ออกจากกลุ่ม`;

    const insertData: Record<string, unknown> = {
      line_contact_id: contact.id,
      direction: 'incoming',
      message_type: 'system',
      content,
      raw_message: {
        system_event: action === 'joined' ? 'member_joined' : 'member_left',
        members: ids,
      },
      received_at: new Date(timestamp).toISOString(),
      created_at: new Date().toISOString(),
    };
    if (companyId) insertData.company_id = companyId;

    const { error } = await supabaseAdmin.from('line_messages').insert(insertData);
    if (error) console.error('Failed to save LINE member event:', error);
  }

  /**
   * ลูกค้ากดปุ่มใน rich menu / template — เป็นการกระทำที่ต้องเห็นในสายสนทนา
   * (ของเดิม webhook ข้ามทิ้ง แชทเลยขาดตอนตรงที่ลูกค้า "กดเลือก" อะไรบางอย่าง)
   */
  async savePostbackMessage(
    contact: { id: string; unread_count: number; display_name?: string | null },
    postback: { data?: string; params?: Record<string, string> },
    timestamp: number,
    companyId: string | null,
    chatAccountId?: string | null,
    accountName?: string | null,
    replyToken?: string | null
  ) {
    const paramLabel = postback.params
      ? Object.values(postback.params).filter(Boolean).join(' ')
      : '';
    const label = paramLabel || postback.data || '';
    const content = `[กดปุ่ม] ${label}`.trim();

    const insertData: Record<string, unknown> = {
      line_contact_id: contact.id,
      direction: 'incoming',
      message_type: 'postback',
      content,
      // การกดปุ่มก็มี reply token — ตอบกลับได้ฟรีเหมือนข้อความ
      raw_message: {
        postback,
        ...(replyToken ? { reply_token: replyToken, reply_token_at: new Date().toISOString() } : {}),
      },
      received_at: new Date(timestamp).toISOString(),
      created_at: new Date().toISOString(),
    };
    if (companyId) insertData.company_id = companyId;

    const { error } = await supabaseAdmin.from('line_messages').insert(insertData);
    if (error) {
      console.error('Failed to save LINE postback:', error);
      return;
    }

    await supabaseAdmin
      .from('line_contacts')
      .update({
        last_message_at: new Date(timestamp).toISOString(),
        unread_count: (contact.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id);

    if (companyId) {
      await sendChatPush(companyId, {
        platform: 'line',
        senderName: contact.display_name,
        preview: content,
        contactId: contact.id,
        messageTime: timestamp,
        accountName,
        chatAccountId,
      });
    }
  }

  // ─── Profile Fetching ───────────────────────────────────────────────

  async fetchProfile(lineUserId: string, accessToken: string): Promise<PlatformProfile | null> {
    if (!accessToken) return null;
    try {
      const response = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error fetching LINE profile:', error);
      return null;
    }
  }

  async getGroupMemberProfile(groupId: string, userId: string, isGroup: boolean, accessToken: string): Promise<PlatformProfile | null> {
    if (!accessToken) return null;
    try {
      const endpoint = isGroup
        ? `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`
        : `https://api.line.me/v2/bot/room/${groupId}/member/${userId}`;
      const response = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      if (!response.ok) return await this.fetchProfile(userId, accessToken);
      return await response.json();
    } catch (error) {
      console.error('Error fetching group member profile:', error);
      return null;
    }
  }

  async getGroupInfo(groupId: string, isGroup: boolean, accessToken: string) {
    if (!accessToken) return null;
    try {
      const endpoint = isGroup
        ? `https://api.line.me/v2/bot/group/${groupId}/summary`
        : `https://api.line.me/v2/bot/room/${groupId}/summary`;
      const response = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error fetching group info:', error);
      return null;
    }
  }

  // ─── Media Storage ──────────────────────────────────────────────────

  async fetchAndStoreMedia(messageId: string, type: 'image' | 'video' | 'audio' | 'file', accessToken: string): Promise<string | null> {
    if (!accessToken) return null;
    try {
      const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!response.ok) return null;

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      let buffer: Buffer<ArrayBuffer> = Buffer.from(await response.arrayBuffer()) as Buffer<ArrayBuffer>;

      let ext = 'bin';
      let finalContentType = contentType;
      if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
      else if (contentType.includes('png')) ext = 'png';
      else if (contentType.includes('gif')) ext = 'gif';
      else if (contentType.includes('webp')) ext = 'webp';
      else if (contentType.includes('mp4')) ext = 'mp4';
      else if (contentType.includes('m4a')) ext = 'm4a';

      // Compress images over 500KB
      const MAX_IMAGE_SIZE = 500 * 1024;
      if (type === 'image' && buffer.length > MAX_IMAGE_SIZE) {
        try {
          // sharp โหลดตอนต้องย่อรูปจริงเท่านั้น — native module ก้อนใหญ่ ถ้า import บนหัวไฟล์
          // ทุก route ที่แตะ service นี้ (แค่อ่านข้อความ) ต้องรอมันโหลดตอน cold start
          const { default: sharp } = await import('sharp');
          const img = sharp(buffer).resize(1920, 1920, { fit: 'inside', withoutEnlargement: true });
          for (const quality of [80, 60, 40]) {
            const compressed = await img.jpeg({ quality }).toBuffer();
            if (compressed.length <= MAX_IMAGE_SIZE || quality === 40) {
              buffer = compressed as Buffer<ArrayBuffer>;
              break;
            }
          }
          ext = 'jpg';
          finalContentType = 'image/jpeg';
        } catch (compressError) {
          console.error('Image compression failed, using original:', compressError);
        }
      }

      const fileName = `line-${type}/${messageId}.${ext}`;
      const { error } = await supabaseAdmin.storage
        .from('chat-media')
        .upload(fileName, buffer, { contentType: finalContentType, upsert: true });

      if (error) { console.error('Failed to upload to storage:', error); return null; }

      const { data: urlData } = supabaseAdmin.storage.from('chat-media').getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (error) {
      console.error('Error fetching LINE content:', error);
      return null;
    }
  }

  // ─── Follow / Unfollow / Group Events ───────────────────────────────

  async handleFollowEvent(lineUserId: string, accessToken: string, companyId: string | null, chatAccountId: string | null) {
    const profile = await this.fetchProfile(lineUserId, accessToken);
    const upsertData: Record<string, unknown> = {
      line_user_id: lineUserId,
      display_name: profile?.displayName || 'Unknown',
      picture_url: profile?.pictureUrl || null,
      status: 'active',
      followed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (companyId) upsertData.company_id = companyId;
    if (chatAccountId) upsertData.chat_account_id = chatAccountId;

    const { error } = await supabaseAdmin.from('line_contacts').upsert(upsertData, { onConflict: 'line_user_id' });
    if (error) console.error('Failed to create/update contact on follow:', error);
  }

  async handleUnfollowEvent(lineUserId: string, companyId: string | null) {
    let query = supabaseAdmin.from('line_contacts')
      .update({ status: 'blocked', updated_at: new Date().toISOString() })
      .eq('line_user_id', lineUserId);
    if (companyId) query = query.eq('company_id', companyId);
    const { error } = await query;
    if (error) console.error('Failed to update contact on unfollow:', error);
  }

  async handleJoinGroupEvent(groupId: string, isGroup: boolean, accessToken: string, companyId: string | null, chatAccountId: string | null) {
    const groupInfo = await this.getGroupInfo(groupId, isGroup, accessToken);
    const upsertData: Record<string, unknown> = {
      line_user_id: groupId,
      display_name: groupInfo?.groupName || groupInfo?.roomName || 'กลุ่มลูกค้า',
      picture_url: groupInfo?.pictureUrl || null,
      status: 'active',
      followed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (companyId) upsertData.company_id = companyId;
    if (chatAccountId) upsertData.chat_account_id = chatAccountId;

    const { error } = await supabaseAdmin.from('line_contacts').upsert(upsertData, { onConflict: 'line_user_id' });
    if (error) console.error('Failed to create/update group contact:', error);
  }

  async handleLeaveGroupEvent(groupId: string, companyId: string | null) {
    let query = supabaseAdmin.from('line_contacts')
      .update({ status: 'blocked', updated_at: new Date().toISOString() })
      .eq('line_user_id', groupId);
    if (companyId) query = query.eq('company_id', companyId);
    const { error } = await query;
    if (error) console.error('Failed to update group contact on leave:', error);
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private buildMessageContent(type: string, text?: string, imageUrl?: string, packageId?: string, stickerId?: string) {
    let messageContent = '';
    let rawMessage: Record<string, unknown> = {};

    if (type === 'text') {
      messageContent = text!;
    } else if (type === 'image') {
      messageContent = '[รูปภาพ]';
      rawMessage = { imageUrl };
    } else if (type === 'sticker') {
      messageContent = '[สติกเกอร์]';
      rawMessage = { packageId, stickerId };
    }

    return { messageContent, rawMessage };
  }
}
