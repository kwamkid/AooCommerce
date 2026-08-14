import { LazadaCredentials, lazadaApiRequest } from '@/lib/lazada/api';

// Lazada Instant Messaging (IM) API wrappers.
// Message template ids: 1=text 3=image 4=emoji 6=video 10006=item 10007=order 10008=voucher

export interface LazadaSession {
  session_id: string;
  title?: string;            // buyer nickname
  head_url?: string;
  buyer_id?: number;
  unread_count?: number;
  last_message_time?: number; // ms
  last_message_id?: string;
  summary?: string;
  site_id?: string;
}

export interface LazadaImMessage {
  message_id: string;
  session_id: string;
  from_account_type?: number; // 1=buyer 2=seller
  to_account_type?: number;
  from_account_id?: string;
  to_account_id?: string;
  template_id?: number;
  type?: number;              // 1=userSend 2=systemSend
  content?: string;           // JSON string per template
  send_time?: number;         // ms
  status?: number;            // 1 = recalled
  auto_reply?: boolean;
  process_msg?: string;
}

export async function getSessionList(
  creds: LazadaCredentials,
  opts: { startTime?: number; pageSize?: number; lastSessionId?: string } = {}
): Promise<{ sessions: LazadaSession[]; hasMore: boolean; nextStartTime?: number; lastSessionId?: string; error?: string }> {
  const { data, error } = await lazadaApiRequest(creds, 'GET', '/im/session/list', {
    start_time: String(opts.startTime ?? Date.now()),
    page_size: String(opts.pageSize ?? 20),
    ...(opts.lastSessionId ? { last_session_id: opts.lastSessionId } : {}),
  });
  if (error || !data) return { sessions: [], hasMore: false, error };
  const d = data as Record<string, unknown>;
  return {
    sessions: (d.session_list as LazadaSession[]) || [],
    hasMore: Boolean(d.has_more),
    nextStartTime: d.next_start_time as number | undefined,
    lastSessionId: d.last_session_id as string | undefined,
  };
}

export async function getSessionDetail(
  creds: LazadaCredentials,
  sessionId: string
): Promise<LazadaSession | null> {
  const { data, error } = await lazadaApiRequest(creds, 'GET', '/im/session/get', {
    session_id: sessionId,
  });
  if (error || !data) return null;
  return data as LazadaSession;
}

export async function getMessages(
  creds: LazadaCredentials,
  sessionId: string,
  opts: { startTime?: number; pageSize?: number; lastMessageId?: string } = {}
): Promise<{ messages: LazadaImMessage[]; hasMore: boolean; error?: string }> {
  const { data, error } = await lazadaApiRequest(creds, 'GET', '/im/message/list', {
    session_id: sessionId,
    start_time: opts.startTime ?? Date.now(),
    page_size: opts.pageSize ?? 30,
    ...(opts.lastMessageId ? { last_message_id: opts.lastMessageId } : {}),
  });
  if (error || !data) return { messages: [], hasMore: false, error };
  const d = data as Record<string, unknown>;
  return {
    messages: (d.message_list as LazadaImMessage[]) || [],
    hasMore: Boolean(d.has_more),
  };
}

export async function sendChatText(
  creds: LazadaCredentials,
  sessionId: string,
  text: string
): Promise<{ message_id?: string; error?: string }> {
  const { data, error } = await lazadaApiRequest(creds, 'POST', '/im/message/send', {
    session_id: sessionId,
    template_id: '1',
    txt: text,
  });
  if (error) return { error };
  const d = data as Record<string, unknown> | null;
  return { message_id: (d?.message_id as string) || undefined };
}

export async function sendChatImage(
  creds: LazadaCredentials,
  sessionId: string,
  imageUrl: string,
  width = 600,
  height = 600
): Promise<{ message_id?: string; error?: string }> {
  const { data, error } = await lazadaApiRequest(creds, 'POST', '/im/message/send', {
    session_id: sessionId,
    template_id: '3',
    img_url: imageUrl,
    width: String(width),
    height: String(height),
  });
  if (error) return { error };
  const d = data as Record<string, unknown> | null;
  return { message_id: (d?.message_id as string) || undefined };
}

/** Mark session read on the Lazada side (best-effort). */
export async function readSession(
  creds: LazadaCredentials,
  sessionId: string,
  lastReadMessageId: string
): Promise<void> {
  await lazadaApiRequest(creds, 'POST', '/im/session/read', {
    session_id: sessionId,
    last_read_message_id: lastReadMessageId,
  }).catch(() => {});
}

/**
 * Parse a Lazada IM message content (JSON string keyed by template) into
 * display text + metadata. Defensive — unknown templates fall back to labels.
 */
export function parseLazadaMessageContent(msg: LazadaImMessage): {
  messageContent: string; messageType: string; metadata: Record<string, unknown>;
} {
  const metadata: Record<string, unknown> = {};
  let obj: Record<string, unknown> = {};
  if (msg.content) {
    try { obj = JSON.parse(msg.content); } catch { obj = { txt: msg.content }; }
  }

  const templateId = msg.template_id ?? 1;
  let messageType = 'text';
  let messageContent = '';

  switch (templateId) {
    case 1: // text
    case 4: // emoji
      messageContent = (obj.txt as string) || (obj.text as string) || (obj.content as string) || '[ข้อความ]';
      break;
    case 3: { // image
      messageType = 'image';
      messageContent = '[รูปภาพ]';
      const img = (obj.imgUrl as string) || (obj.img_url as string) || (obj.url as string);
      if (img) metadata.imageUrl = img;
      break;
    }
    case 6: { // video
      messageType = 'video';
      messageContent = '[วิดีโอ]';
      const video = (obj.videoUrl as string) || (obj.video_url as string);
      if (video) metadata.videoUrl = video;
      break;
    }
    case 10006: { // item
      messageType = 'item';
      messageContent = (obj.title as string) ? `[สินค้า] ${obj.title}` : '[สินค้า]';
      if (obj.itemId || obj.item_id) metadata.item_id = obj.itemId || obj.item_id;
      const itemUrl = (obj.actionUrl as string) || (obj.pcUrl as string) || (obj.url as string);
      if (itemUrl) { metadata.itemUrl = itemUrl; metadata.linkUrl = itemUrl; metadata.linkTitle = 'ดูสินค้าใน Lazada'; }
      break;
    }
    case 10007: { // order
      messageType = 'order';
      messageContent = obj.orderId || obj.order_id ? `[คำสั่งซื้อ ${obj.orderId || obj.order_id}]` : '[คำสั่งซื้อ]';
      if (obj.orderId || obj.order_id) metadata.order_id = obj.orderId || obj.order_id;
      break;
    }
    case 10008: // voucher
      messageType = 'voucher';
      messageContent = '[คูปองส่วนลด]';
      break;
    case 10010:
      messageType = 'follow_invite';
      messageContent = '[ชวนติดตามร้าน]';
      break;
    default:
      messageContent = (obj.txt as string) || `[template ${templateId}]`;
  }

  if (msg.status === 1) {
    messageContent = '[ข้อความถูกเรียกคืน]';
    metadata.recalled = true;
  }
  if (msg.auto_reply) metadata.auto_reply = true;
  if (msg.process_msg) metadata.process_msg = msg.process_msg;

  return { messageContent, messageType, metadata };
}
