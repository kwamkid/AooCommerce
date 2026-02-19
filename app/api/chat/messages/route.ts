import { checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { getChatService } from '@/lib/services/chat';

// GET - Get messages for a contact (any platform)
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contact_id');
    const platform = searchParams.get('platform') as 'line' | 'facebook';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!contactId || !platform) {
      return NextResponse.json({ error: 'contact_id and platform are required' }, { status: 400 });
    }

    const service = getChatService(platform);
    const { messages, error } = await service.getMessages({ contactId, companyId, limit, offset });

    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ messages });
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

    const service = getChatService(platform);
    const result = await service.sendMessage({
      contactId: contact_id,
      companyId,
      userId,
      type,
      text: message,
      imageUrl,
      packageId,
      stickerId,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Unified messages POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
