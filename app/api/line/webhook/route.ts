import { NextRequest, NextResponse } from 'next/server';
import { logIntegrationNow } from '@/lib/integration-logger';
import { LineChatService } from '@/lib/services/chat';

const lineService = new LineChatService();

// LINE Webhook event types
interface LineEvent {
  type: string;
  timestamp: number;
  source: {
    type: string;
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  replyToken?: string;
  message?: {
    id: string;
    type: string;
    text?: string;
    fileName?: string;
    fileSize?: number;
    stickerId?: string;
    packageId?: string;
    stickerResourceType?: string;
    title?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    contentProvider?: {
      type: string;
      originalContentUrl?: string;
      previewImageUrl?: string;
    };
  };
  postback?: {
    data: string;
  };
}

interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

// POST - Receive LINE webhook events
export async function POST(request: NextRequest) {
  // เก็บไว้นอก try เพื่อให้ตอน error ยังรู้ว่าเป็นของบริษัทไหน (integration_logs
  // บังคับ company_id) — LINE/FB เคยไม่มี log เลยสักบรรทัด ทั้งที่คุยกันวันละ
  // หลายร้อยข้อความ พังเมื่อไหร่จะไม่มีร่องรอยให้จับ
  let companyIdForLog: string | null = null;
  let chatAccountIdForLog: string | null = null;
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature') || '';

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account');
    const companyParam = searchParams.get('company');

    // Resolve credentials
    const webhookCreds = await lineService.resolveWebhookCredentials(accountId, companyParam);
    const { channelSecret, accessToken, companyId, chatAccountId, accountName } = webhookCreds;
    companyIdForLog = companyId;
    chatAccountIdForLog = chatAccountId;

    const webhookBody: LineWebhookBody = JSON.parse(body);

    // LINE verification request sends empty events array
    if (webhookBody.events.length === 0) {
      return NextResponse.json({ success: true });
    }

    // Verify signature
    if (!lineService.verifySignature(body, signature, channelSecret)) {
      console.error('Invalid LINE signature');
      if (companyId) await logIntegrationNow({
        company_id: companyId,
        integration: 'line',
        account_id: chatAccountId,
        direction: 'incoming',
        action: 'webhook_invalid_signature',
        status: 'error',
        error_message: 'ลายเซ็นไม่ตรง — channel secret อาจถูกเปลี่ยนที่ LINE Developers',
        http_status: 401,
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Process each event
    for (const event of webhookBody.events) {
      await processEvent(event, accessToken, companyId, chatAccountId, accountName);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('LINE webhook error:', error);
    // **await** — response กำลังจะออก ปล่อยลอยแล้ว Vercel freeze ทิ้ง
    // (งานตาย + หลักฐานตายพร้อมกัน — บทเรียนเดียวกับ cron ที่พังเงียบ 12 วัน)
    if (companyIdForLog) {
      await logIntegrationNow({
        company_id: companyIdForLog,
        integration: 'line',
        account_id: chatAccountIdForLog,
        direction: 'incoming',
        action: 'webhook_error',
        status: 'error',
        error_message: error instanceof Error ? error.message : String(error),
        http_status: 500,
      });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Process individual LINE event
async function processEvent(
  event: LineEvent,
  accessToken: string,
  companyId: string | null,
  chatAccountId: string | null,
  // ชื่อ OA — ไปขึ้นหัวข้อแจ้งเตือน ("Joolz Juice · LINE")
  accountName: string | null
) {
  const sourceType = event.source.type;
  const lineUserId = event.source.userId;
  const groupId = event.source.groupId;
  const roomId = event.source.roomId;

  let contactId: string;
  let isGroup = false;

  if (sourceType === 'group' && groupId) {
    contactId = groupId;
    isGroup = true;
  } else if (sourceType === 'room' && roomId) {
    contactId = roomId;
    isGroup = true;
  } else if (lineUserId) {
    contactId = lineUserId;
  } else {
    return;
  }

  if (event.type === 'message' && event.message) {
    const contact = await lineService.getOrCreateContact(contactId, isGroup, lineUserId, accessToken, companyId, chatAccountId);
    if (!contact) return;

    await lineService.saveIncomingMessage(
      contact,
      event.message as unknown as Record<string, unknown>,
      event,
      accessToken,
      companyId,
      lineUserId,
      isGroup,
      contactId,
      chatAccountId,
      accountName
    );
  }

  if (event.type === 'follow' && lineUserId && !isGroup) {
    await lineService.handleFollowEvent(lineUserId, accessToken, companyId, chatAccountId);
  }

  if (event.type === 'unfollow' && lineUserId && !isGroup) {
    await lineService.handleUnfollowEvent(lineUserId, companyId);
  }

  if (event.type === 'join' && isGroup) {
    await lineService.handleJoinGroupEvent(contactId, sourceType === 'group', accessToken, companyId, chatAccountId);
  }

  if (event.type === 'leave' && isGroup) {
    await lineService.handleLeaveGroupEvent(contactId, companyId);
  }
}

// GET - For LINE webhook verification
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
