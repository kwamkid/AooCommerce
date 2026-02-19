import { checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { LineChatService } from '@/lib/services/chat';

const lineService = new LineChatService();

// GET - Get messages for a contact
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized. Login required.' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contact_id');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!contactId) {
      return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    }

    const { messages, error } = await lineService.getMessages({ contactId, companyId, limit, offset });
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Send a message
export async function POST(request: NextRequest) {
  try {
    const { isAuth, userId, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized. Login required.' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const body = await request.json();
    const { contact_id, message, type = 'text', imageUrl, previewUrl, packageId, stickerId } = body;

    if (!contact_id) return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    if (type === 'text' && !message) return NextResponse.json({ error: 'message is required for text type' }, { status: 400 });
    if (type === 'image' && !imageUrl) return NextResponse.json({ error: 'imageUrl is required for image type' }, { status: 400 });
    if (type === 'sticker' && (!packageId || !stickerId)) return NextResponse.json({ error: 'packageId and stickerId are required for sticker type' }, { status: 400 });

    const result = await lineService.sendMessage({
      contactId: contact_id,
      companyId,
      userId,
      type,
      text: message,
      imageUrl,
      previewUrl,
      packageId,
      stickerId,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send LINE message' }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
