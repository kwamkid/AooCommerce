import { ShopeeCredentials, signForCreds, resolveBaseUrl } from '@/lib/shopee/api';
import { beginMarketplaceCall, reportMarketplaceError } from '@/lib/marketplace/quota';
import { logShopeeCallFailure } from '@/lib/shopee/api-log';

// SellerChat (v2.sellerchat.*) API wrappers.
//
// ⚠️ message_id / conversation_id ของ sellerchat เป็น **int64 19 หลักที่ส่งมาเป็น
// ตัวเลขเปล่าใน JSON** — `JSON.parse` ปัดทิ้งเงียบ ๆ (2434129165249003889 →
// 2434129165249003800) แล้วเราจะ dedupe ผิด/อ้าง conversation ผิดตลอดไป
// ⇒ **ทุก call ของ sellerchat ต้องผ่าน `shopeeChatRequest()` ในไฟล์นี้เท่านั้น**
// (`shopeeApiRequest` ของ lib/shopee/api.ts parse ด้วย JSON.parse ตรง ๆ)

// ─── BigInt-safe JSON ─────────────────────────────────────────────────────

/**
 * parse JSON โดยครอบ "จำนวนเต็มยาว ≥ 16 หลักที่อยู่นอกสตริง" ด้วยอัญประกาศก่อน
 * → id ยาวกลายเป็น string ที่ค่าตรงเป๊ะ แทนที่จะเป็น number ที่ปัดแล้ว
 *
 * เดินอ่านทีละตัวอักษรแทนการ replace ด้วย regex เพราะต้อง**ข้ามเนื้อในสตริง** —
 * ลูกค้าพิมพ์เลขยาว ๆ ในข้อความได้ (เลขพัสดุ/เลขบัญชี) ห้ามไปยุ่งกับข้อความ
 */
export function parseShopeeChatJson<T = unknown>(text: string): T {
  let out = '';
  let i = 0;
  let inString = false;

  while (i < text.length) {
    const ch = text[i];

    if (inString) {
      if (ch === '\\') {          // escape — คัดลอกคู่ไปเลย ไม่ตีความ
        out += ch + (text[i + 1] ?? '');
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      out += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }

    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < text.length && text[j] >= '0' && text[j] <= '9') j++;
      const digits = text.slice(i, j);
      // ทศนิยม/exponent ไม่ใช่ id — ปล่อยเป็นตัวเลขตามเดิม (จำนวนเงินไม่ควรกลายเป็น string)
      const isFractional = text[j] === '.' || text[j] === 'e' || text[j] === 'E';
      if (digits.length >= 16 && !isFractional) {
        if (out.endsWith('-')) out = `${out.slice(0, -1)}"-${digits}"`;
        else out += `"${digits}"`;
      } else {
        out += digits;
      }
      i = j;
      continue;
    }

    out += ch;
    i++;
  }

  return JSON.parse(out) as T;
}

// ─── Request helper (เหมือน shopeeApiRequest แต่ parse แบบ BigInt-safe) ────

async function shopeeChatRequest(
  creds: ShopeeCredentials,
  method: 'GET' | 'POST',
  apiPath: string,
  params: Record<string, unknown> = {},
  body?: Record<string, unknown>
): Promise<{ data: unknown; error?: string }> {
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
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) queryParams.set(k, String(v));
  }

  const url = `${resolveBaseUrl(creds)}${apiPath}?${queryParams.toString()}`;
  const options: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body && method === 'POST') options.body = JSON.stringify(body);

  // หน่วงจังหวะ + รู้ว่าอยู่ถังโควตาไหน (sellerchat → scope 'chat') เหมือน call อื่น
  const scope = await beginMarketplaceCall('shopee', apiPath);

  console.log(`[Shopee Chat] ${method} ${apiPath}`, params);
  const res = await fetch(url, options);
  const text = await res.text();

  let data: Record<string, unknown>;
  try {
    data = parseShopeeChatJson<Record<string, unknown>>(text);
  } catch {
    const nonJsonError = `Shopee API returned non-JSON response (HTTP ${res.status})`;
    await logShopeeCallFailure({
      shopId: creds.shop_id, method, apiPath, params, body,
      errorMessage: nonJsonError, httpStatus: res.status, responseBody: text.substring(0, 1000),
    });
    return { data: null, error: nonJsonError };
  }

  if (data.error) {
    const errMsg = (data.message as string) || (data.error as string);
    reportMarketplaceError('shopee', scope, typeof errMsg === 'string' ? errMsg : null, { httpStatus: res.status });
    await logShopeeCallFailure({
      shopId: creds.shop_id, method, apiPath, params, body,
      errorMessage: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg),
      httpStatus: res.status, responseBody: data,
    });
    return { data: null, error: errMsg };
  }

  return { data: data.response ?? data };
}

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
  const { data, error } = await shopeeChatRequest(
    creds,
    'POST',
    '/api/v2/sellerchat/send_message',
    {},
    { to_id: toId, message_type: 'text', content: { text } }
  );
  if (error) return { error };
  const res = data as { message_id?: string | number } | null;
  // message_id ต้องเก็บเป็น string ที่ค่าตรงเป๊ะ — เป็นคีย์ dedupe กับข้อความที่ pull กลับมา
  return { message_id: res?.message_id != null ? String(res.message_id) : undefined };
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
      data = parseShopeeChatJson<Record<string, unknown>>(text);
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

  const { data, error } = await shopeeChatRequest(
    creds,
    'POST',
    '/api/v2/sellerchat/send_message',
    {},
    { to_id: toId, message_type: 'image', content: { image_url: uploaded.url } }
  );
  if (error) return { error };
  const res = data as { message_id?: string | number } | null;
  return {
    message_id: res?.message_id != null ? String(res.message_id) : undefined,
    shopeeImageUrl: uploaded.url,
  };
}

/**
 * Get a conversation's basic info (used for buyer name/avatar on contact creation).
 * conversation_id must be passed as the string from the webhook push.
 */
export async function getConversationInfo(
  creds: ShopeeCredentials,
  conversationId: string
): Promise<{ to_name?: string; to_avatar?: string; to_id?: number; unread_count?: number } | null> {
  const { data, error } = await shopeeChatRequest(
    creds,
    'GET',
    '/api/v2/sellerchat/get_one_conversation',
    { conversation_id: conversationId }
  );
  if (error || !data) return null;
  return data as { to_name?: string; to_avatar?: string; to_id?: number; unread_count?: number };
}

// ─── get_message (ประวัติจริงของห้องสนทนา) ────────────────────────────────

/**
 * ข้อความหนึ่งใบตามที่ get_message ส่งกลับมา
 * (id ยาวเป็น string แล้วเพราะผ่าน parseShopeeChatJson)
 */
export interface ShopeeChatApiMessage {
  message_id: string;
  from_id?: number | string;
  to_id?: number | string;
  from_shop_id?: number | string;
  to_shop_id?: number | string;
  message_type?: string;
  content?: Record<string, unknown>;
  conversation_id?: string;
  created_timestamp?: number;
  region?: string;
  /** normal | offwork_autoreply | user_chat | ... */
  status?: string;
  /** openapi | ios | android | server (server = ระบบของ Shopee ตอบเอง) */
  source?: string;
  source_content?: Record<string, unknown>;
}

/**
 * ดึงข้อความของห้องสนทนา — **เรียงจากใหม่ไปเก่า**
 *
 * ใช้เติมข้อความที่ push ไม่ได้ส่งมาให้ (ร้านตอบจากแอป Shopee, ข้อความอัตโนมัตินอกเวลา,
 * และข้อความย่อยใน bundle_message ที่ push ส่งมาแค่ list ของ id)
 *
 * ⚠️ `message_id_list` เป็นพารามิเตอร์ไม่ได้ (ตอบ param_error) — ย้อนอดีตต้องเดินด้วย
 * `offset` = `page_result.next_offset` ของหน้าก่อนเท่านั้น
 */
export async function getConversationMessages(
  creds: ShopeeCredentials,
  conversationId: string,
  opts: { pageSize?: number; offset?: string } = {}
): Promise<{ messages: ShopeeChatApiMessage[]; nextOffset?: string; error?: string }> {
  const params: Record<string, unknown> = {
    conversation_id: conversationId,
    page_size: Math.min(Math.max(opts.pageSize ?? 20, 1), 50),
  };
  if (opts.offset) params.offset = opts.offset;

  const { data, error } = await shopeeChatRequest(creds, 'GET', '/api/v2/sellerchat/get_message', params);
  if (error || !data) return { messages: [], error };

  const res = data as {
    messages?: ShopeeChatApiMessage[];
    page_result?: { next_offset?: string | number; page_size?: number };
  };
  const next = res.page_result?.next_offset;
  return {
    messages: res.messages || [],
    nextOffset: next != null && String(next) !== '' && String(next) !== '0' ? String(next) : undefined,
  };
}

/** สรุปห้องสนทนาจาก get_conversation_list (ใช้ backfill ตอนเปิดใช้แชทครั้งแรก) */
export interface ShopeeConversationSummary {
  conversation_id: string;
  to_id?: number | string;
  to_name?: string;
  to_avatar?: string;
  unread_count?: number;
  last_message_timestamp?: number;
}

/**
 * รายชื่อห้องสนทนาล่าสุดของร้าน — ใช้ตอนเปิดสวิตช์แชทเพื่อไม่ให้หน้าแชทว่างเปล่า
 * (conversation_id ปลอดภัยแล้วเพราะ parse แบบ BigInt-safe)
 */
export async function getConversationList(
  creds: ShopeeCredentials,
  opts: { pageSize?: number } = {}
): Promise<{ conversations: ShopeeConversationSummary[]; error?: string }> {
  const { data, error } = await shopeeChatRequest(creds, 'GET', '/api/v2/sellerchat/get_conversation_list', {
    direction: 'latest',
    type: 'all',
    page_size: Math.min(Math.max(opts.pageSize ?? 20, 1), 50),
  });
  if (error || !data) return { conversations: [], error };
  const res = data as { conversations?: ShopeeConversationSummary[] };
  return { conversations: res.conversations || [] };
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
  await shopeeChatRequest(
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
