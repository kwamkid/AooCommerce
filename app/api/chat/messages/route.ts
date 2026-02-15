import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { getChatAccount, getDefaultChatAccount, getLineCredsFromAccount, getFbCredsFromAccount } from '@/lib/chat-config';
import { getLineCredentials } from '@/lib/line-config';
import { getFbCredentials } from '@/lib/fb-config';

// GET - Get messages for a contact (any platform)
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contact_id');
    const platform = searchParams.get('platform');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!contactId || !platform) {
      return NextResponse.json({ error: 'contact_id and platform are required' }, { status: 400 });
    }

    const table = platform === 'line' ? 'line_messages' : 'fb_messages';
    const contactIdCol = platform === 'line' ? 'line_contact_id' : 'fb_contact_id';
    const contactTable = platform === 'line' ? 'line_contacts' : 'fb_contacts';

    const { data: messages, error } = await supabaseAdmin
      .from(table)
      .select(`
        *,
        sent_by_user:user_profiles!sent_by(id, name)
      `)
      .eq('company_id', companyId)
      .eq(contactIdCol, contactId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mark as read
    await supabaseAdmin
      .from(contactTable)
      .update({ unread_count: 0 })
      .eq('id', contactId)
      .eq('company_id', companyId);

    return NextResponse.json({
      messages: (messages || []).reverse(),
    });
  } catch (error) {
    console.error('Unified messages GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Send a message (routes to correct platform)
export async function POST(request: NextRequest) {
  try {
    const { isAuth, userId, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const body = await request.json();
    const { contact_id, platform, message, type = 'text', imageUrl, packageId, stickerId } = body;

    if (!contact_id || !platform) {
      return NextResponse.json({ error: 'contact_id and platform are required' }, { status: 400 });
    }

    if (type === 'text' && !message) {
      return NextResponse.json({ error: 'message is required for text type' }, { status: 400 });
    }

    if (platform === 'line') {
      return await sendLineMessage(companyId, userId, contact_id, { type, message, imageUrl, packageId, stickerId });
    } else {
      return await sendFbMessage(companyId, userId, contact_id, { type, message, imageUrl });
    }
  } catch (error) {
    console.error('Unified messages POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// LINE message sending
async function sendLineMessage(
  companyId: string,
  userId: string | undefined,
  contactId: string,
  body: { type: string; message?: string; imageUrl?: string; packageId?: string; stickerId?: string }
) {
  // Get contact
  const { data: contact } = await supabaseAdmin
    .from('line_contacts')
    .select('line_user_id, chat_account_id')
    .eq('id', contactId)
    .eq('company_id', companyId)
    .single();

  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  // Get access token
  let accessToken: string | null = null;
  if (contact.chat_account_id) {
    const account = await getChatAccount(contact.chat_account_id);
    if (account) accessToken = getLineCredsFromAccount(account)?.channel_access_token || null;
  }
  if (!accessToken) {
    const account = await getDefaultChatAccount(companyId, 'line');
    if (account) accessToken = getLineCredsFromAccount(account)?.channel_access_token || null;
  }
  if (!accessToken) {
    const credentials = await getLineCredentials(companyId);
    accessToken = credentials?.channel_access_token || null;
  }
  if (!accessToken) {
    return NextResponse.json({ error: 'LINE ยังไม่ได้ตั้งค่า กรุณาตั้งค่าที่ ตั้งค่า > ช่องทาง Chat' }, { status: 400 });
  }

  // Build LINE message
  let lineMessage: Record<string, unknown>;
  if (body.type === 'text') {
    lineMessage = { type: 'text', text: body.message };
  } else if (body.type === 'image') {
    lineMessage = { type: 'image', originalContentUrl: body.imageUrl, previewImageUrl: body.imageUrl };
  } else if (body.type === 'sticker') {
    lineMessage = { type: 'sticker', packageId: body.packageId, stickerId: body.stickerId };
  } else {
    return NextResponse.json({ error: 'Unsupported message type' }, { status: 400 });
  }

  // Send via LINE API
  const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ to: contact.line_user_id, messages: [lineMessage] }),
  });

  if (!lineRes.ok) {
    const err = await lineRes.json();
    return NextResponse.json({ error: err.message || 'LINE API error' }, { status: 500 });
  }

  // Save to DB
  let messageContent = '';
  let rawMessage: Record<string, unknown> = {};
  if (body.type === 'text') messageContent = body.message!;
  else if (body.type === 'image') { messageContent = '[รูปภาพ]'; rawMessage = { imageUrl: body.imageUrl }; }
  else if (body.type === 'sticker') { messageContent = '[สติกเกอร์]'; rawMessage = { packageId: body.packageId, stickerId: body.stickerId }; }

  const { data: savedMessage } = await supabaseAdmin
    .from('line_messages')
    .insert({
      company_id: companyId,
      line_contact_id: contactId,
      direction: 'outgoing',
      message_type: body.type,
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

  return NextResponse.json({ success: true, message: savedMessage });
}

// FB message sending
async function sendFbMessage(
  companyId: string,
  userId: string | undefined,
  contactId: string,
  body: { type: string; message?: string; imageUrl?: string }
) {
  // Get contact
  const { data: contact } = await supabaseAdmin
    .from('fb_contacts')
    .select('fb_psid, chat_account_id')
    .eq('id', contactId)
    .eq('company_id', companyId)
    .single();

  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  // Get credentials
  let pageAccessToken: string | null = null;
  let pageId: string | null = null;

  if (contact.chat_account_id) {
    const account = await getChatAccount(contact.chat_account_id);
    if (account) {
      const creds = getFbCredsFromAccount(account);
      pageAccessToken = creds?.page_access_token || null;
      pageId = creds?.page_id || null;
    }
  }
  if (!pageAccessToken) {
    const account = await getDefaultChatAccount(companyId, 'facebook');
    if (account) {
      const creds = getFbCredsFromAccount(account);
      pageAccessToken = creds?.page_access_token || null;
      pageId = creds?.page_id || null;
    }
  }
  if (!pageAccessToken) {
    const credentials = await getFbCredentials(companyId);
    pageAccessToken = credentials?.page_access_token || null;
    pageId = credentials?.page_id || null;
  }
  if (!pageAccessToken || !pageId) {
    return NextResponse.json({ error: 'Facebook ยังไม่ได้ตั้งค่า กรุณาตั้งค่าที่ ตั้งค่า > ช่องทาง Chat' }, { status: 400 });
  }

  // Build FB message
  let fbMessage: Record<string, unknown>;
  if (body.type === 'text') {
    fbMessage = { text: body.message };
  } else if (body.type === 'image') {
    fbMessage = { attachment: { type: 'image', payload: { url: body.imageUrl, is_reusable: true } } };
  } else {
    return NextResponse.json({ error: 'Unsupported message type for Facebook' }, { status: 400 });
  }

  // Send via FB API
  const fbRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${pageAccessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: contact.fb_psid }, message: fbMessage, messaging_type: 'RESPONSE' }),
    }
  );

  if (!fbRes.ok) {
    const err = await fbRes.json();
    return NextResponse.json({ error: err.error?.message || 'Facebook API error' }, { status: 500 });
  }

  const fbResult = await fbRes.json();

  // Save to DB
  let messageContent = '';
  let rawMessage: Record<string, unknown> = {};
  if (body.type === 'text') messageContent = body.message!;
  else if (body.type === 'image') { messageContent = '[รูปภาพ]'; rawMessage = { imageUrl: body.imageUrl }; }

  const { data: savedMessage } = await supabaseAdmin
    .from('fb_messages')
    .insert({
      company_id: companyId,
      fb_contact_id: contactId,
      fb_message_id: fbResult.message_id || null,
      direction: 'outgoing',
      message_type: body.type,
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

  return NextResponse.json({ success: true, message: savedMessage });
}
