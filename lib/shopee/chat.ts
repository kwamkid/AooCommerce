import { ShopeeCredentials, shopeeApiRequest, signForCreds, resolveBaseUrl } from '@/lib/shopee/api';

// SellerChat (v2.sellerchat.*) API wrappers.
//
// ⚠️ conversation_id in sellerchat API RESPONSES is an int64 that overflows
// JS number precision. Never read conversation_id from a parsed response —
// the webhook push delivers it as a quoted string; that is the only source
// of truth we store (shopee_contacts.conversation_id TEXT).

export interface ShopeeChatSendResult {
  message_id?: string;
  error?: string;
}

/**
 * Send a text message to a buyer (to_id = buyer user id).
 */
export async function sendChatText(
  creds: ShopeeCredentials,
  toId: number,
  text: string
): Promise<ShopeeChatSendResult> {
  const { data, error } = await shopeeApiRequest(
    creds,
    'POST',
    '/api/v2/sellerchat/send_message',
    {},
    { to_id: toId, message_type: 'text', content: { text } }
  );
  if (error) return { error };
  const res = data as { message_id?: string } | null;
  return { message_id: res?.message_id };
}

/**
 * Upload an image for chat use. Shopee requires images to be uploaded via
 * sellerchat/upload_image first, then referenced by the returned url.
 * Supports jpg/jpeg/png/gif, max 2MB.
 */
export async function uploadChatImage(
  creds: ShopeeCredentials,
  imageUrl: string
): Promise<{ url?: string; thumbnail?: string; error?: string }> {
  const apiPath = '/api/v2/sellerchat/upload_image';
  const timestamp = Math.floor(Date.now() / 1000);
  // เซ็นด้วย key ของร้าน ไม่ใช่ env — ร้านที่อยู่ app seller จะ Wrong sign ทันที
  const sign = signForCreds(creds, apiPath, timestamp);

  const queryParams = new URLSearchParams({
    partner_id: String(creds.partner_id),
    timestamp: String(timestamp),
    sign,
    access_token: creds.access_token,
    shop_id: String(creds.shop_id),
  });

  const url = `${resolveBaseUrl(creds)}${apiPath}?${queryParams.toString()}`;

  try {
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return { error: `Failed to download image: HTTP ${imageRes.status}` };
    }
    const imageBuffer = await imageRes.arrayBuffer();
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : 'jpg';

    const formData = new FormData();
    formData.append('file', new Blob([imageBuffer], { type: contentType }), `image.${ext}`);

    console.log(`[Shopee Chat] POST ${apiPath} (multipart, ${imageBuffer.byteLength} bytes)`);
    const res = await fetch(url, { method: 'POST', body: formData });

    let data: Record<string, unknown>;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      return { error: `Shopee API returned non-JSON (HTTP ${res.status})` };
    }

    if (data.error) {
      return { error: (data.message as string) || (data.error as string) };
    }

    const response = (data.response || {}) as { url?: string; thumbnail?: string };
    if (!response.url) return { error: 'upload_image returned no url' };
    return { url: response.url, thumbnail: response.thumbnail };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Image upload failed' };
  }
}

/**
 * Send an image message: upload to Shopee first, then send with the hosted url.
 */
export async function sendChatImage(
  creds: ShopeeCredentials,
  toId: number,
  imageUrl: string
): Promise<ShopeeChatSendResult & { shopeeImageUrl?: string }> {
  const uploaded = await uploadChatImage(creds, imageUrl);
  if (uploaded.error || !uploaded.url) {
    return { error: uploaded.error || 'Image upload failed' };
  }

  const { data, error } = await shopeeApiRequest(
    creds,
    'POST',
    '/api/v2/sellerchat/send_message',
    {},
    { to_id: toId, message_type: 'image', content: { image_url: uploaded.url } }
  );
  if (error) return { error };
  const res = data as { message_id?: string } | null;
  return { message_id: res?.message_id, shopeeImageUrl: uploaded.url };
}

/**
 * Get a conversation's basic info (used for buyer name/avatar on contact creation).
 * conversation_id must be passed as the string from the webhook push.
 */
export async function getConversationInfo(
  creds: ShopeeCredentials,
  conversationId: string
): Promise<{ to_name?: string; to_avatar?: string; to_id?: number; unread_count?: number } | null> {
  const { data, error } = await shopeeApiRequest(
    creds,
    'GET',
    '/api/v2/sellerchat/get_one_conversation',
    { conversation_id: conversationId }
  );
  if (error || !data) return null;
  return data as { to_name?: string; to_avatar?: string; to_id?: number; unread_count?: number };
}

/**
 * Mark a conversation read on the Shopee side (mirrors in-app read state).
 * Best-effort — failures are non-fatal.
 */
export async function readConversation(
  creds: ShopeeCredentials,
  conversationId: string,
  lastReadMessageId: string
): Promise<void> {
  await shopeeApiRequest(
    creds,
    'POST',
    '/api/v2/sellerchat/read_conversation',
    {},
    { conversation_id: conversationId, last_read_message_id: lastReadMessageId }
  ).catch(() => {});
}

/**
 * Resolve a Shopee CDN media id to a full URL.
 * Webhook media fields (url/thumb_url/video_url) may be bare CDN file ids.
 */
export function resolveShopeeCdnUrl(value: string | undefined, region?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const tld = (region || 'TH').toUpperCase() === 'TH' ? 'co.th' : 'sg';
  return `https://cf.shopee.${tld}/file/${value}`;
}
