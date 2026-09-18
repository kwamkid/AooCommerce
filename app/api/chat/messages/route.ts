import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { NextRequest, NextResponse, after } from 'next/server';
import { getChatServiceLazy } from '@/lib/services/chat/registry';
import { markContactedByStaff } from '@/lib/leads/service';

// GET - Get messages for a contact (any platform)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contact_id');
    const platform = searchParams.get('platform') as 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!contactId || !platform) {
      return NextResponse.json({ error: 'contact_id and platform are required' }, { status: 400 });
    }

    // peek=1 = หน้าแชท prefetch ตอนเมาส์ชี้รายชื่อ — ห้าม mark read (เลขค้างต้องอยู่จนกว่าจะเปิดจริง)
    const peek = searchParams.get('peek') === '1';

    // โหลดเฉพาะ service ของแพลตฟอร์มนี้ — สายที่ผู้ใช้รอ cold start ต้องเบาที่สุด
    const service = await getChatServiceLazy(platform);
    const { messages, error } = await service.getMessages({ contactId, companyId, limit, offset, markRead: !peek });

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
    const auth = await checkAuthWithCompany(request);
    const { isAuth, userId, companyId } = auth;
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.reply')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ตอบแชท' }, { status: 403 });
    }

    const body = await request.json();
    const { contact_id, platform, message, type = 'text', imageUrl, packageId, stickerId, imageSet } = body;

    if (!contact_id || !platform) {
      return NextResponse.json({ error: 'contact_id and platform are required' }, { status: 400 });
    }
    if (type === 'text' && !message) {
      return NextResponse.json({ error: 'message is required for text type' }, { status: 400 });
    }

    const service = await getChatServiceLazy(platform);
    const result = await service.sendMessage({
      contactId: contact_id,
      companyId,
      userId,
      type,
      text: message,
      imageUrl,
      packageId,
      stickerId,
      imageSet,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error, errorCode: result.errorCode }, { status: 500 });
    }

    // พนักงานทักไปเองแล้ว = นัดติดตามของคนนี้หมดหน้าที่ — ล้างให้ทุกห้องของเขา
    // (บรอดแคสต์ไม่ผ่านทางนี้ จึงไม่ล้างนัดทั้งกอง) · ทำหลังตอบผู้ใช้ ห้ามทำให้การส่งข้อความล้ม
    after(async () => {
      try {
        await markContactedByStaff({ companyId, contactId: contact_id, platform, actorId: userId });
      } catch (e) {
        console.error('lead mark contacted failed:', e);
      }
    });

    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Unified messages POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
