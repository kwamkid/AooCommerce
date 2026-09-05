import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// POST - Mark a contact as read (set unread_count = 0)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const platform = body.platform || 'facebook';

    const table = platform === 'line' ? 'line_contacts' : platform === 'shopee' ? 'shopee_contacts' : platform === 'lazada' ? 'lazada_contacts' : platform === 'tiktok' ? 'tiktok_contacts' : 'fb_contacts';
    // .gt() ไม่ใช่การกันงานเปล่า — UPDATE ค่าเดิมก็ยังยิง Realtime event ทำให้ทุกหน้าแชท
    // ที่เปิดอยู่ + header ของทุกคนดึงรายชื่อใหม่ทั้งชุด (เปิดแชทที่อ่านแล้วก็เกิด)
    await supabaseAdmin
      .from(table)
      .update({ unread_count: 0 })
      .eq('id', id)
      .eq('company_id', companyId)
      .gt('unread_count', 0);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
