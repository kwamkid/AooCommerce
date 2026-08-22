import { TikTokCredentials, tiktokApiRequest, generateSign } from '@/lib/tiktok/api';

// TikTok Shop Customer Service (chat) API wrappers.
// Message types: TEXT, IMAGE, VIDEO, PRODUCT_CARD, ORDER_CARD, EMOTICONS,
// RETURN_REFUND_CARD, COUPON_CARD, LOGISTICS_CARD + system types
// (NOTIFICATION, ALLOCATED_SERVICE, BUYER_ENTER_FROM_*, OTHER)

const TIKTOK_API_HOST = 'https://open-api.tiktokglobalshop.com';

export interface TikTokParticipant {
  im_user_id?: string;
  user_id?: string;
  avatar?: string;
  role?: 'BUYER' | 'SHOP' | 'CUSTOMER_SERVICE' | 'SYSTEM' | 'ROBOT';
  nickname?: string;
}

export interface TikTokChatMessage {
  id: string;
  type?: string;               // TEXT / IMAGE / ...
  content?: string;            // JSON serialized string per type
  create_time?: number;        // unix seconds
  is_visible?: boolean;
  sender?: TikTokParticipant;
  index?: string;
}

export interface TikTokConversation {
  id: string;
  participant_count?: number;
  can_send_message?: boolean;
  unread_count?: number;
  create_time?: number;
  participants?: TikTokParticipant[];
  latest_message?: TikTokChatMessage;
}

export async function getConversations(
  creds: TikTokCredentials,
  opts: { pageSize?: number; pageToken?: string } = {}
): Promise<{ conversations: TikTokConversation[]; nextPageToken?: string; error?: string }> {
  const params: Record<string, string> = {
    page_size: String(Math.min(opts.pageSize ?? 20, 20)), // API max 20
    locale: 'th-TH',
  };
  if (opts.pageToken) params.page_token = opts.pageToken;

  const { data, error } = await tiktokApiRequest(creds, 'GET', '/customer_service/202309/conversations', params);
  if (error || !data) return { conversations: [], error };
  const d = data as Record<string, unknown>;
  return {
    conversations: (d.conversations as TikTokConversation[]) || [],
    nextPageToken: (d.next_page_token as string) || undefined,
  };
}

export async function getConversationDetail(
  creds: TikTokCredentials,
  conversationId: string
): Promise<TikTokConversation | null> {
  const { data, error } = await tiktokApiRequest(
    creds, 'GET', `/customer_service/202601/conversations/${conversationId}`, { locale: 'th-TH' }
  );
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  // 202601 wraps in { conversation }, defensive fallback to flat shape
  return ((d.conversation as TikTokConversation) || (d as unknown as TikTokConversation)) ?? null;
}

export async function getConversationMessages(
  creds: TikTokCredentials,
  conversationId: string,
  opts: { pageSize?: number; pageToken?: string } = {}
): Promise<{ messages: TikTokChatMessage[]; nextPageToken?: string; error?: string }> {
  const params: Record<string, string> = {
    page_size: String(Math.min(opts.pageSize ?? 10, 10)), // API max 10
    locale: 'th-TH',
    sort_order: 'DESC',
    sort_field: 'create_time',
  };
  if (opts.pageToken) params.page_token = opts.pageToken;

  const { data, error } = await tiktokApiRequest(
    creds, 'GET', `/customer_service/202309/conversations/${conversationId}/messages`, params
  );
  if (error || !data) return { messages: [], error };
  const d = data as Record<string, unknown>;
  return {
    messages: (d.messages as TikTokChatMessage[]) || [],
    nextPageToken: (d.next_page_token as string) || undefined,
  };
}

export async function sendChatText(
  creds: TikTokCredentials,
  conversationId: string,
  text: string
): Promise<{ message_id?: string; error?: string }> {
  const { data, error } = await tiktokApiRequest(
    creds, 'POST', `/customer_service/202309/conversations/${conversationId}/messages`, {},
    { type: 'TEXT', content: JSON.stringify({ content: text }) }
  );
  if (error) return { error };
  const d = data as Record<string, unknown> | null;
  return { message_id: (d?.message_id as string) || undefined };
}

/**
 * Send an image: TikTok does not accept external URLs — download from our
 * storage URL, re-upload via images/upload, then send the TikTok-hosted URL
 * (same flow as Shopee's sellerchat/upload_image).
 */
export async function sendChatImage(
  creds: TikTokCredentials,
  conversationId: string,
  imageUrl: string
): Promise<{ message_id?: string; error?: string }> {
  let buffer: Buffer;
  let contentType = 'image/jpeg';
  try {
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) return { error: `Failed to download image: HTTP ${imageRes.status}` };
    contentType = (imageRes.headers.get('content-type') || 'image/jpeg').split(';')[0];
    buffer = Buffer.from(await imageRes.arrayBuffer());
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to download image' };
  }

  const uploaded = await uploadChatImage(creds, { buffer, contentType });
  if (uploaded.error || !uploaded.url) {
    return { error: uploaded.error || 'Image upload failed' };
  }

  const { data, error } = await tiktokApiRequest(
    creds, 'POST', `/customer_service/202309/conversations/${conversationId}/messages`, {},
    {
      type: 'IMAGE',
      content: JSON.stringify({
        url: uploaded.url,
        width: String(uploaded.width || 600),
        height: String(uploaded.height || 600),
      }),
    }
  );
  if (error) return { error };
  const d = data as Record<string, unknown> | null;
  return { message_id: (d?.message_id as string) || undefined };
}

/**
 * Upload an image to TikTok's IM storage — required before sending IMAGE
 * (external URLs are not accepted, unlike Lazada).
 *
 * multipart/form-data — the signature must NOT include the body
 * (per TikTok sign spec: "if not multipart, append body").
 */
export async function uploadChatImage(
  creds: TikTokCredentials,
  file: { buffer: Buffer; contentType: string; filename?: string }
): Promise<{ url?: string; width?: number; height?: number; error?: string }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string> = {
    app_key: creds.app_key,
    timestamp: String(timestamp),
  };
  if (creds.shop_cipher) params.shop_cipher = creds.shop_cipher;
  params.sign = generateSign('/customer_service/202309/images/upload', params);

  const form = new FormData();
  form.append(
    'data',
    new Blob([new Uint8Array(file.buffer)], { type: file.contentType }),
    file.filename || 'image.jpg'
  );

  const url = `${TIKTOK_API_HOST}/customer_service/202309/images/upload?${new URLSearchParams(params).toString()}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-tts-access-token': creds.access_token }, // content-type ให้ fetch ใส่ boundary เอง
      body: form,
    });
    const json = await res.json();
    if (json.code !== 0) return { error: json.message || `Upload failed: code ${json.code}` };
    return {
      url: json.data?.url,
      width: Number(json.data?.width) || undefined,
      height: Number(json.data?.height) || undefined,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Upload failed' };
  }
}

/** Mark messages read on the TikTok side (best-effort). */
export async function readConversation(
  creds: TikTokCredentials,
  conversationId: string
): Promise<void> {
  await tiktokApiRequest(
    creds, 'POST', `/customer_service/202309/conversations/${conversationId}/messages/read`, {}, {}
  ).catch(() => {});
}

/**
 * Parse a TikTok chat message content (JSON string keyed by type) into
 * display text + metadata. Defensive — unknown types fall back to labels.
 */
export function parseTikTokMessageContent(msg: TikTokChatMessage): {
  messageContent: string; messageType: string; metadata: Record<string, unknown>;
} {
  const metadata: Record<string, unknown> = {};
  let obj: Record<string, unknown> = {};
  if (msg.content) {
    try { obj = JSON.parse(msg.content); } catch { obj = { content: msg.content }; }
  }

  const type = msg.type || 'TEXT';
  let messageType = 'text';
  let messageContent = '';

  switch (type) {
    case 'TEXT':
    case 'EMOTICONS':
      messageContent = (obj.content as string) || '[ข้อความ]';
      break;
    case 'IMAGE': {
      messageType = 'image';
      messageContent = '[รูปภาพ]';
      if (obj.url) metadata.imageUrl = obj.url;
      break;
    }
    case 'VIDEO': {
      messageType = 'video';
      messageContent = '[วิดีโอ]';
      if (obj.url) metadata.videoUrl = obj.url;
      if (obj.cover) metadata.videoCover = obj.cover;
      break;
    }
    case 'PRODUCT_CARD':
    case 'BUYER_ENTER_FROM_PRODUCT': {
      messageType = 'item';
      messageContent = type === 'PRODUCT_CARD' ? '[สินค้า]' : '[ลูกค้าดูสินค้าอยู่]';
      if (obj.product_id) metadata.item_id = obj.product_id;
      break;
    }
    case 'ORDER_CARD':
    case 'BUYER_ENTER_FROM_ORDER': {
      messageType = 'order';
      messageContent = obj.order_id ? `[คำสั่งซื้อ ${obj.order_id}]` : '[คำสั่งซื้อ]';
      if (obj.order_id) metadata.order_id = obj.order_id;
      break;
    }
    case 'RETURN_REFUND_CARD': {
      messageType = 'order';
      messageContent = '[คำขอคืนสินค้า/คืนเงิน]';
      if (obj.order_id) metadata.order_id = obj.order_id;
      break;
    }
    case 'LOGISTICS_CARD': {
      messageType = 'order';
      messageContent = '[ข้อมูลการจัดส่ง]';
      if (obj.order_id) metadata.order_id = obj.order_id;
      break;
    }
    case 'COUPON_CARD':
      messageType = 'voucher';
      messageContent = '[คูปองส่วนลด]';
      break;
    case 'NOTIFICATION':
    case 'ALLOCATED_SERVICE':
    case 'BUYER_ENTER_FROM_TRANSFER':
      messageType = 'system';
      messageContent = (obj.content as string) || '[ข้อความจากระบบ]';
      break;
    default:
      messageContent = (obj.content as string) || `[${type}]`;
  }

  return { messageContent, messageType, metadata };
}
