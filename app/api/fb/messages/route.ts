import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { getFbCredentials } from '@/lib/fb-config';
import { getChatAccount, getDefaultChatAccount, getFbCredsFromAccount } from '@/lib/chat-config';

// GET - Get messages for a FB contact
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contact_id');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!contactId) {
      return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    }

    // Get messages
    const { data: messages, error } = await supabaseAdmin
      .from('fb_messages')
      .select(`
        *,
        sent_by_user:user_profiles!sent_by(id, name)
      `)
      .eq('company_id', companyId)
      .eq('fb_contact_id', contactId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mark as read - reset unread count
    await supabaseAdmin
      .from('fb_contacts')
      .update({ unread_count: 0 })
      .eq('id', contactId)
      .eq('company_id', companyId);

    // Return messages in chronological order (oldest first for chat display)
    return NextResponse.json({
      messages: (messages || []).reverse()
    });
  } catch (error) {
    console.error('FB messages GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Message types
interface TextMessageBody {
  contact_id: string;
  message: string;
  type?: 'text';
}

interface ImageMessageBody {
  contact_id: string;
  type: 'image';
  imageUrl: string;
}

type MessageBody = TextMessageBody | ImageMessageBody;

// POST - Send a message via Facebook
export async function POST(request: NextRequest) {
  try {
    const { isAuth, userId, companyId } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }

    const body: MessageBody = await request.json();
    const { contact_id } = body;
    const messageType = body.type || 'text';

    if (!contact_id) {
      return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    }

    // Validate based on message type
    if (messageType === 'text') {
      if (!(body as TextMessageBody).message) {
        return NextResponse.json({ error: 'message is required for text type' }, { status: 400 });
      }
    } else if (messageType === 'image') {
      if (!(body as ImageMessageBody).imageUrl) {
        return NextResponse.json({ error: 'imageUrl is required for image type' }, { status: 400 });
      }
    }

    // Get contact's FB PSID and chat_account_id
    const { data: contact, error: contactError } = await supabaseAdmin
      .from('fb_contacts')
      .select('fb_psid, chat_account_id')
      .eq('id', contact_id)
      .eq('company_id', companyId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Get FB credentials — try account-based first, fallback to legacy
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
      return NextResponse.json(
        { error: 'Facebook ยังไม่ได้ตั้งค่า กรุณาตั้งค่าที่ ตั้งค่า > ช่องทาง Chat' },
        { status: 400 }
      );
    }

    // Send message via Facebook Send API
    const fbResponse = await sendFbMessage(
      contact.fb_psid,
      body,
      pageAccessToken,
      pageId
    );

    if (!fbResponse.success) {
      return NextResponse.json(
        { error: fbResponse.error || 'Failed to send Facebook message' },
        { status: 500 }
      );
    }

    // Prepare message data for database
    let messageContent = '';
    let rawMessage: Record<string, unknown> = {};

    if (messageType === 'text') {
      messageContent = (body as TextMessageBody).message;
    } else if (messageType === 'image') {
      const imageBody = body as ImageMessageBody;
      messageContent = '[รูปภาพ]';
      rawMessage = { imageUrl: imageBody.imageUrl };
    }

    // Save message to database
    const { data: savedMessage, error: saveError } = await supabaseAdmin
      .from('fb_messages')
      .insert({
        company_id: companyId,
        fb_contact_id: contact_id,
        fb_message_id: fbResponse.messageId || null,
        direction: 'outgoing',
        message_type: messageType,
        content: messageContent,
        raw_message: Object.keys(rawMessage).length > 0 ? rawMessage : null,
        sent_by: userId,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select(`
        *,
        sent_by_user:user_profiles!sent_by(id, name)
      `)
      .single();

    if (saveError) {
      console.error('Failed to save FB message:', saveError);
    }

    // Update contact's last_message_at
    await supabaseAdmin
      .from('fb_contacts')
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact_id)
      .eq('company_id', companyId);

    return NextResponse.json({
      success: true,
      message: savedMessage,
    });
  } catch (error) {
    console.error('FB messages POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Send message via Facebook Send API
async function sendFbMessage(
  psid: string,
  body: MessageBody,
  accessToken: string,
  pageId: string
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const messageType = body.type || 'text';
    let fbMessage: Record<string, unknown>;

    if (messageType === 'text') {
      fbMessage = { text: (body as TextMessageBody).message };
    } else if (messageType === 'image') {
      fbMessage = {
        attachment: {
          type: 'image',
          payload: { url: (body as ImageMessageBody).imageUrl, is_reusable: true },
        },
      };
    } else {
      return { success: false, error: 'Unsupported message type' };
    }

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: psid },
          message: fbMessage,
          messaging_type: 'RESPONSE',
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Facebook Send API error:', errorData);
      return {
        success: false,
        error: errorData.error?.message || 'Facebook API error',
      };
    }

    const result = await response.json();
    return { success: true, messageId: result.message_id };
  } catch (error) {
    console.error('Error sending FB message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}
