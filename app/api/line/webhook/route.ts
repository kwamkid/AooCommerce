// Path: app/api/line/webhook/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import sharp from 'sharp';
import { getLineCredentials } from '@/lib/line-config';
import { getChatAccount, getDefaultChatAccount, getLineCredsFromAccount } from '@/lib/chat-config';

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

// Verify LINE signature
function verifySignature(body: string, signature: string, channelSecret: string): boolean {
  if (!channelSecret) {
    console.error('LINE_CHANNEL_SECRET not set');
    return false;
  }

  const hash = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64');

  return hash === signature;
}

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
    // Sticker
    stickerId?: string;
    packageId?: string;
    stickerResourceType?: string;
    // Location
    title?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    // Content provider
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
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature') || '';

    // Get account or company ID from query param
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account');
    const companyParam = searchParams.get('company');

    let channelSecret = process.env.LINE_CHANNEL_SECRET || '';
    let accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    let companyId: string | null = companyParam;
    let chatAccountId: string | null = accountId;

    if (accountId) {
      // New: account-based routing
      const account = await getChatAccount(accountId);
      if (account && account.is_active) {
        const creds = getLineCredsFromAccount(account);
        if (creds) {
          channelSecret = creds.channel_secret;
          accessToken = creds.channel_access_token;
          companyId = account.company_id;
        }
      }
    } else if (companyId) {
      // Backward compat: company-based routing
      const account = await getDefaultChatAccount(companyId, 'line');
      if (account) {
        chatAccountId = account.id;
        const creds = getLineCredsFromAccount(account);
        if (creds) {
          channelSecret = creds.channel_secret;
          accessToken = creds.channel_access_token;
        }
      } else {
        // Legacy fallback to crm_settings
        const credentials = await getLineCredentials(companyId);
        if (credentials && credentials.is_active) {
          channelSecret = credentials.channel_secret;
          accessToken = credentials.channel_access_token;
        }
      }
    }

    const webhookBody: LineWebhookBody = JSON.parse(body);

    // LINE verification request sends empty events array - just return 200
    if (webhookBody.events.length === 0) {
      return NextResponse.json({ success: true });
    }

    // Verify signature for actual events
    if (!verifySignature(body, signature, channelSecret)) {
      console.error('Invalid LINE signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Process each event
    for (const event of webhookBody.events) {
      await processEvent(event, accessToken, companyId, chatAccountId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('LINE webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Process individual LINE event
async function processEvent(event: LineEvent, accessToken: string, companyId: string | null, chatAccountId: string | null) {
  const sourceType = event.source.type;
  const lineUserId = event.source.userId;
  const groupId = event.source.groupId;
  const roomId = event.source.roomId;

  // Determine the contact identifier
  // For groups/rooms: use groupId/roomId as the main identifier
  // For 1:1 chat: use userId
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
    console.log('No valid identifier in event');
    return;
  }

  // Handle message events
  if (event.type === 'message' && event.message) {
    await handleMessageEvent(contactId, event, isGroup, lineUserId, accessToken, companyId, chatAccountId);
  }

  // Handle follow event (user adds friend) - only for 1:1
  if (event.type === 'follow' && lineUserId && !isGroup) {
    await handleFollowEvent(lineUserId, accessToken, companyId, chatAccountId);
  }

  // Handle unfollow event (user blocks) - only for 1:1
  if (event.type === 'unfollow' && lineUserId && !isGroup) {
    await handleUnfollowEvent(lineUserId, companyId);
  }

  // Handle join event (bot joins group)
  if (event.type === 'join' && isGroup) {
    await handleJoinGroupEvent(contactId, sourceType === 'group', accessToken, companyId, chatAccountId);
  }

  // Handle leave event (bot leaves group)
  if (event.type === 'leave' && isGroup) {
    await handleLeaveGroupEvent(contactId, companyId);
  }
}

// Handle incoming message
async function handleMessageEvent(contactId: string, event: LineEvent, isGroup: boolean, senderUserId: string | undefined, accessToken: string, companyId: string | null, chatAccountId: string | null) {
  const message = event.message!;

  // Get or create LINE contact
  const contact = await getOrCreateLineContact(contactId, isGroup, senderUserId, accessToken, companyId, chatAccountId);

  if (!contact) {
    console.error('Failed to get/create contact for:', contactId);
    return;
  }

  // Get sender profile (for group messages or 1:1)
  let senderName: string | null = null;
  let senderPictureUrl: string | null = null;

  if (senderUserId) {
    // For groups: get sender profile from group member API
    // For 1:1: get user profile
    if (isGroup) {
      const memberProfile = await getGroupMemberProfile(contactId, senderUserId, event.source.type === 'group', accessToken);
      senderName = memberProfile?.displayName || null;
      senderPictureUrl = memberProfile?.pictureUrl || null;
    } else {
      const profile = await getLineProfile(senderUserId, accessToken);
      senderName = profile?.displayName || null;
      senderPictureUrl = profile?.pictureUrl || null;
    }
  }

  // Prepare message content and metadata based on type
  let messageContent = '';
  const messageType = message.type;
  const metadata: Record<string, unknown> = {};

  if (message.type === 'text' && message.text) {
    messageContent = message.text;
  } else if (message.type === 'image') {
    messageContent = '[รูปภาพ]';
    // For LINE provider images, fetch and store in Supabase Storage
    if (message.contentProvider?.type === 'line') {
      const imageUrl = await fetchAndStoreLineContent(message.id, 'image', accessToken);
      if (imageUrl) {
        metadata.imageUrl = imageUrl;
      }
    } else if (message.contentProvider?.originalContentUrl) {
      metadata.imageUrl = message.contentProvider.originalContentUrl;
    }
  } else if (message.type === 'video') {
    messageContent = '[วิดีโอ]';
    // Store video in Supabase Storage
    if (message.contentProvider?.type === 'line') {
      const videoUrl = await fetchAndStoreLineContent(message.id, 'video', accessToken);
      if (videoUrl) {
        metadata.videoUrl = videoUrl;
      }
    } else if (message.contentProvider?.originalContentUrl) {
      metadata.videoUrl = message.contentProvider.originalContentUrl;
    }
    if (message.contentProvider?.previewImageUrl) {
      metadata.previewUrl = message.contentProvider.previewImageUrl;
    }
  } else if (message.type === 'audio') {
    messageContent = '[เสียง]';
  } else if (message.type === 'file') {
    messageContent = `[ไฟล์: ${message.fileName || 'unknown'}]`;
    metadata.fileName = message.fileName;
    metadata.fileSize = message.fileSize;
  } else if (message.type === 'sticker') {
    messageContent = '[สติกเกอร์]';
    metadata.stickerId = message.stickerId;
    metadata.packageId = message.packageId;
    metadata.stickerResourceType = message.stickerResourceType;
  } else if (message.type === 'location') {
    messageContent = message.title || message.address || '[ตำแหน่ง]';
    metadata.latitude = message.latitude;
    metadata.longitude = message.longitude;
    metadata.address = message.address;
  } else {
    messageContent = `[${message.type}]`;
  }

  // Save message to database with sender info
  const insertData: Record<string, unknown> = {
    line_contact_id: contact.id,
    line_message_id: message.id,
    direction: 'incoming',
    message_type: messageType,
    content: messageContent,
    raw_message: { ...message, ...metadata },
    sender_user_id: senderUserId || null,
    sender_name: senderName,
    sender_picture_url: senderPictureUrl,
    received_at: new Date(event.timestamp).toISOString(),
    created_at: new Date().toISOString()
  };
  if (companyId) insertData.company_id = companyId;

  const { error } = await supabaseAdmin
    .from('line_messages')
    .insert(insertData);

  if (error) {
    console.error('Failed to save message:', error);
  }

  // Update contact's last_message_at
  await supabaseAdmin
    .from('line_contacts')
    .update({
      last_message_at: new Date(event.timestamp).toISOString(),
      unread_count: contact.unread_count + 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', contact.id);
}

// Handle follow event
async function handleFollowEvent(lineUserId: string, accessToken: string, companyId: string | null, chatAccountId: string | null) {
  // Get LINE profile
  const profile = await getLineProfile(lineUserId, accessToken);

  const upsertData: Record<string, unknown> = {
    line_user_id: lineUserId,
    display_name: profile?.displayName || 'Unknown',
    picture_url: profile?.pictureUrl || null,
    status: 'active',
    followed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (companyId) upsertData.company_id = companyId;
  if (chatAccountId) upsertData.chat_account_id = chatAccountId;

  // Create or update contact
  const { error } = await supabaseAdmin
    .from('line_contacts')
    .upsert(upsertData, {
      onConflict: 'line_user_id'
    });

  if (error) {
    console.error('Failed to create/update contact on follow:', error);
  }
}

// Handle unfollow event
async function handleUnfollowEvent(lineUserId: string, companyId: string | null) {
  let query = supabaseAdmin
    .from('line_contacts')
    .update({
      status: 'blocked',
      updated_at: new Date().toISOString()
    })
    .eq('line_user_id', lineUserId);

  if (companyId) query = query.eq('company_id', companyId);

  const { error } = await query;

  if (error) {
    console.error('Failed to update contact on unfollow:', error);
  }
}

// Handle join group event
async function handleJoinGroupEvent(groupId: string, isGroup: boolean, accessToken: string, companyId: string | null, chatAccountId: string | null) {
  // Get group summary (name)
  const groupInfo = await getGroupInfo(groupId, isGroup, accessToken);

  const upsertData: Record<string, unknown> = {
    line_user_id: groupId,
    display_name: groupInfo?.groupName || groupInfo?.roomName || 'กลุ่มลูกค้า',
    picture_url: groupInfo?.pictureUrl || null,
    status: 'active',
    followed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (companyId) upsertData.company_id = companyId;
  if (chatAccountId) upsertData.chat_account_id = chatAccountId;

  const { error } = await supabaseAdmin
    .from('line_contacts')
    .upsert(upsertData, {
      onConflict: 'line_user_id'
    });

  if (error) {
    console.error('Failed to create/update group contact:', error);
  }
}

// Handle leave group event
async function handleLeaveGroupEvent(groupId: string, companyId: string | null) {
  let query = supabaseAdmin
    .from('line_contacts')
    .update({
      status: 'blocked',
      updated_at: new Date().toISOString()
    })
    .eq('line_user_id', groupId);

  if (companyId) query = query.eq('company_id', companyId);

  const { error } = await query;

  if (error) {
    console.error('Failed to update group contact on leave:', error);
  }
}

// Get or create LINE contact (supports both 1:1 and group)
async function getOrCreateLineContact(contactId: string, isGroup: boolean, senderUserId: string | undefined, accessToken: string, companyId: string | null, chatAccountId: string | null) {
  // Check if contact exists
  let query = supabaseAdmin
    .from('line_contacts')
    .select('*')
    .eq('line_user_id', contactId);

  if (companyId) query = query.eq('company_id', companyId);

  const { data: existing } = await query.single();

  if (existing) {
    return existing;
  }

  // Get profile/info based on type
  let displayName = 'Unknown';
  let pictureUrl: string | null = null;

  if (isGroup) {
    // For groups, try to get group info
    const groupInfo = await getGroupInfo(contactId, true, accessToken);
    displayName = groupInfo?.groupName || groupInfo?.roomName || 'กลุ่มลูกค้า';
    pictureUrl = groupInfo?.pictureUrl || null;
  } else {
    // For 1:1 chat, get user profile
    const profile = await getLineProfile(contactId, accessToken);
    displayName = profile?.displayName || 'Unknown';
    pictureUrl = profile?.pictureUrl || null;
  }

  // Create new contact
  const insertData: Record<string, unknown> = {
    line_user_id: contactId,
    display_name: displayName,
    picture_url: pictureUrl,
    status: 'active',
    unread_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (companyId) insertData.company_id = companyId;
  if (chatAccountId) insertData.chat_account_id = chatAccountId;

  const { data: newContact, error } = await supabaseAdmin
    .from('line_contacts')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Failed to create contact:', error);
    return null;
  }

  return newContact;
}

// Get LINE group/room info
async function getGroupInfo(groupId: string, isGroup: boolean, accessToken: string) {
  if (!accessToken) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN not set');
    return null;
  }

  try {
    const endpoint = isGroup
      ? `https://api.line.me/v2/bot/group/${groupId}/summary`
      : `https://api.line.me/v2/bot/room/${groupId}/summary`;

    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      console.error('Failed to get group info:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching group info:', error);
    return null;
  }
}

// Fetch content from LINE and store in Supabase Storage
async function fetchAndStoreLineContent(messageId: string, type: 'image' | 'video' | 'audio' | 'file', accessToken: string): Promise<string | null> {
  if (!accessToken) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN not set');
    return null;
  }

  try {
    // Fetch content from LINE
    const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      console.error('Failed to fetch LINE content:', response.status);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    let buffer: Buffer<ArrayBuffer> = Buffer.from(await response.arrayBuffer()) as Buffer<ArrayBuffer>;

    // Determine file extension
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
        let img = sharp(buffer).resize(1920, 1920, { fit: 'inside', withoutEnlargement: true });
        // Try quality levels until under limit
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

    // Upload to Supabase Storage
    const { error } = await supabaseAdmin.storage
      .from('chat-media')
      .upload(fileName, buffer, {
        contentType: finalContentType,
        upsert: true
      });

    if (error) {
      console.error('Failed to upload to storage:', error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('chat-media')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Error fetching LINE content:', error);
    return null;
  }
}

// Get LINE user profile
async function getLineProfile(lineUserId: string, accessToken: string) {
  if (!accessToken) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN not set');
    return null;
  }

  try {
    const response = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      console.error('Failed to get LINE profile:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching LINE profile:', error);
    return null;
  }
}

// Get group/room member profile
async function getGroupMemberProfile(groupId: string, userId: string, isGroup: boolean, accessToken: string) {
  if (!accessToken) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN not set');
    return null;
  }

  try {
    const endpoint = isGroup
      ? `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`
      : `https://api.line.me/v2/bot/room/${groupId}/member/${userId}`;

    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      console.error('Failed to get group member profile:', response.status);
      // Fallback to regular profile
      return await getLineProfile(userId, accessToken);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching group member profile:', error);
    return null;
  }
}

// GET - For LINE webhook verification
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
