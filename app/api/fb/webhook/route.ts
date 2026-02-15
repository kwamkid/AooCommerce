import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getFbCredsFromAccount } from '@/lib/chat-config';

// Create Supabase Admin client (service role)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Facebook webhook event types
interface FbMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: string; // 'image', 'video', 'audio', 'file', 'fallback'
      payload?: {
        url?: string;
        sticker_id?: number;
      };
    }>;
    sticker_id?: number;
  };
  postback?: {
    title: string;
    payload: string;
  };
}

interface FbWebhookEntry {
  id: string;
  time: number;
  messaging?: FbMessagingEvent[];
}

interface FbWebhookBody {
  object: string;
  entry: FbWebhookEntry[];
}

// Verify Facebook signature
function verifySignature(body: string, signature: string, appSecret: string): boolean {
  if (!appSecret || !signature) return false;

  const expectedSig = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig)
  );
}

// Helper: lookup chat account by page_id from credentials JSON
async function findAccountByPageId(pageId: string) {
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

// GET - Facebook webhook verification
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode !== 'subscribe' || !token || !challenge) {
      return NextResponse.json({ error: 'Invalid verification request' }, { status: 400 });
    }

    // Search all FB chat accounts for matching verify_token
    const { data: accounts } = await supabaseAdmin
      .from('chat_accounts')
      .select('*')
      .eq('platform', 'facebook')
      .eq('is_active', true);

    let matched = false;
    if (accounts) {
      for (const account of accounts) {
        const creds = account.credentials as Record<string, string>;
        if (creds?.verify_token === token) {
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 });
    }

    // Return challenge as plain text (Facebook requires this)
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error) {
    console.error('FB webhook verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}

// POST - Receive Facebook webhook events
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';
    const envAppSecret = process.env.FACEBOOK_APP_SECRET || '';

    const webhookBody: FbWebhookBody = JSON.parse(body);

    if (webhookBody.object !== 'page') {
      return NextResponse.json({ status: 'ok' });
    }

    // Process each entry — each entry.id is the page_id
    for (const entry of webhookBody.entry) {
      if (!entry.messaging) continue;

      const pageId = entry.id;

      // Auto-lookup: find chat_account by page_id in credentials
      const account = await findAccountByPageId(pageId);
      if (!account) {
        console.error('FB webhook: no chat_account found for page_id:', pageId);
        continue;
      }

      const creds = getFbCredsFromAccount(account);
      if (!creds) {
        console.error('FB webhook: invalid credentials for account:', account.id);
        continue;
      }

      const appSecret = envAppSecret || creds.app_secret;
      const pageAccessToken = creds.page_access_token;
      const companyId = account.company_id;
      const chatAccountId = account.id;

      // Verify signature (once per request, but check with this account's secret)
      if (appSecret && !verifySignature(body, signature, appSecret)) {
        console.error('FB webhook: invalid signature for page_id:', pageId);
        continue;
      }

      for (const event of entry.messaging) {
        await processMessagingEvent(event, pageAccessToken, companyId, chatAccountId);
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('FB webhook error:', error);
    // Always return 200 to Facebook
    return NextResponse.json({ status: 'ok' });
  }
}

// Process individual messaging event
async function processMessagingEvent(event: FbMessagingEvent, accessToken: string, companyId: string, chatAccountId: string | null) {
  const senderPsid = event.sender.id;
  const recipientId = event.recipient.id;

  // Skip messages sent by our page (outgoing)
  if (senderPsid === recipientId) return;

  if (event.message) {
    await handleMessageEvent(senderPsid, recipientId, event, accessToken, companyId, chatAccountId);
  }
}

// Handle incoming message
async function handleMessageEvent(
  senderPsid: string,
  pageId: string,
  event: FbMessagingEvent,
  accessToken: string,
  companyId: string,
  chatAccountId: string | null
) {
  const message = event.message!;

  // Get or create contact
  const contact = await getOrCreateFbContact(senderPsid, pageId, accessToken, companyId, chatAccountId);
  if (!contact) {
    console.error('Failed to get/create FB contact for:', senderPsid);
    return;
  }

  // Determine message content and type
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
      if (attachment.payload?.url) {
        metadata.imageUrl = attachment.payload.url;
      }
    } else if (attachment.type === 'video') {
      messageContent = '[วิดีโอ]';
      if (attachment.payload?.url) metadata.videoUrl = attachment.payload.url;
    } else if (attachment.type === 'audio') {
      messageContent = '[เสียง]';
      if (attachment.payload?.url) metadata.audioUrl = attachment.payload.url;
    } else if (attachment.type === 'file') {
      messageContent = '[ไฟล์]';
      if (attachment.payload?.url) metadata.fileUrl = attachment.payload.url;
    } else {
      messageContent = `[${attachment.type}]`;
    }

    // Handle multiple attachments
    if (message.attachments.length > 1) {
      metadata.attachments = message.attachments;
    }
  } else if (message.sticker_id) {
    messageType = 'sticker';
    messageContent = '[สติกเกอร์]';
    metadata.sticker_id = message.sticker_id;
  } else {
    messageContent = '[ข้อความ]';
  }

  // Save message
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

  if (error) {
    console.error('Failed to save FB message:', error);
  }

  // Update contact's last_message_at and unread_count
  await supabaseAdmin
    .from('fb_contacts')
    .update({
      last_message_at: new Date(event.timestamp).toISOString(),
      unread_count: (contact.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contact.id);
}

// Get or create Facebook contact
async function getOrCreateFbContact(psid: string, pageId: string, accessToken: string, companyId: string, chatAccountId: string | null) {
  // Check if contact exists
  const { data: existing } = await supabaseAdmin
    .from('fb_contacts')
    .select('*')
    .eq('company_id', companyId)
    .eq('fb_psid', psid)
    .single();

  if (existing) return existing;

  // Get user profile from Graph API
  let displayName = 'Facebook User';
  let pictureUrl: string | null = null;

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

  // Create new contact
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
    .from('fb_contacts')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Failed to create FB contact:', error);
    return null;
  }

  return newContact;
}
