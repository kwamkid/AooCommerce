import { supabaseAdmin } from '@/lib/supabase-admin';
import { getChatAccount, getDefaultChatAccount, getLineCredsFromAccount } from '@/lib/chat-config';
import { getLineCredentials } from '@/lib/line-config';
import crypto from 'crypto';
import sharp from 'sharp';
import type { SendMessageParams, SendMessageResult, ResolvedCredentials, PlatformProfile, GetMessagesParams } from './types';

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

    if (!accessToken && companyId) {
      const credentials = await getLineCredentials(companyId);
      if (credentials) {
        accessToken = credentials.channel_access_token;
        secret = credentials.channel_secret;
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

    // Send via LINE API
    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${creds.accessToken}` },
      body: JSON.stringify({ to: contact.line_user_id, messages: [lineMessage] }),
    });

    if (!lineRes.ok) {
      const err = await lineRes.json();
      console.error('LINE API error:', err);
      return { success: false, error: err.message || 'LINE API error' };
    }

    // Save to DB
    const { messageContent, rawMessage } = this.buildMessageContent(type, text, imageUrl, packageId, stickerId);

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

  // ─── Get Messages ───────────────────────────────────────────────────

  async getMessages(params: GetMessagesParams) {
    const { contactId, companyId, limit, offset } = params;

    const { data: messages, error } = await supabaseAdmin
      .from('line_messages')
      .select('*, sent_by_user:user_profiles!sent_by(id, name)')
      .eq('company_id', companyId)
      .eq('line_contact_id', contactId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { messages: null, error: error.message };

    // Mark as read
    await supabaseAdmin
      .from('line_contacts')
      .update({ unread_count: 0 })
      .eq('id', contactId)
      .eq('company_id', companyId);

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
    channelSecret: string; accessToken: string; companyId: string | null; chatAccountId: string | null;
  }> {
    let channelSecret = process.env.LINE_CHANNEL_SECRET || '';
    let accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    let resolvedCompanyId = companyId;
    let chatAccountId = accountId;

    if (accountId) {
      const account = await getChatAccount(accountId);
      if (account && account.is_active) {
        const creds = getLineCredsFromAccount(account);
        if (creds) {
          channelSecret = creds.channel_secret;
          accessToken = creds.channel_access_token;
          resolvedCompanyId = account.company_id;
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
        }
      } else {
        const credentials = await getLineCredentials(companyId);
        if (credentials && credentials.is_active) {
          channelSecret = credentials.channel_secret;
          accessToken = credentials.channel_access_token;
        }
      }
    }

    return { channelSecret, accessToken, companyId: resolvedCompanyId, chatAccountId };
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
    contact: { id: string; unread_count: number },
    message: Record<string, unknown>,
    event: { timestamp: number; source: { type: string; userId?: string; groupId?: string } },
    accessToken: string,
    companyId: string | null,
    senderUserId?: string,
    isGroup?: boolean,
    contactId?: string
  ) {
    // Get sender profile
    let senderName: string | null = null;
    let senderPictureUrl: string | null = null;

    if (senderUserId) {
      if (isGroup && contactId) {
        const memberProfile = await this.getGroupMemberProfile(contactId, senderUserId, event.source.type === 'group', accessToken);
        senderName = memberProfile?.displayName || null;
        senderPictureUrl = memberProfile?.pictureUrl || null;
      } else {
        const profile = await this.fetchProfile(senderUserId, accessToken);
        senderName = profile?.displayName || null;
        senderPictureUrl = profile?.pictureUrl || null;
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
    } else if (msgType === 'file') {
      messageContent = `[ไฟล์: ${message.fileName || 'unknown'}]`;
      metadata.fileName = message.fileName;
      metadata.fileSize = message.fileSize;
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
    } else {
      messageContent = `[${msgType}]`;
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

    // Update contact
    await supabaseAdmin
      .from('line_contacts')
      .update({
        last_message_at: new Date(event.timestamp).toISOString(),
        unread_count: contact.unread_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id);
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
