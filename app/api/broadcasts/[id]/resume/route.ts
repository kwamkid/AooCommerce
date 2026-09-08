import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { isBroadcastPlatform } from '@/lib/broadcast/platforms';
import { runBroadcast } from '@/lib/broadcast/run';

export const maxDuration = 300;

// POST — เดินงานส่งที่ค้างต่อ (หมดงบเวลา / โดน 429 / ฟังก์ชันตายกลางทาง)
// ล็อตที่ส่งไปแล้วมี retry key ของตัวเอง กดซ้ำจึงไม่ทำให้ลูกค้าได้ข้อความซ้ำ
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.broadcast')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await context.params;

    const { data: row } = await supabaseAdmin
      .from('broadcasts')
      .select('id, status, platform')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .maybeSingle();

    if (!row) return NextResponse.json({ error: 'ไม่พบบรอดแคสต์นี้' }, { status: 404 });
    if (!['pending', 'sending', 'partial'].includes(row.status)) {
      return NextResponse.json({ error: 'บรอดแคสต์นี้จบแล้ว ส่งต่อไม่ได้' }, { status: 400 });
    }
    if (!isBroadcastPlatform(row.platform)) {
      return NextResponse.json({ error: 'ช่องทางของบรอดแคสต์นี้ส่งต่อไม่ได้' }, { status: 400 });
    }

    after(() => runBroadcast(id, row.platform));

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST broadcast resume error:', e);
    return NextResponse.json({ error: 'ส่งต่อไม่สำเร็จ' }, { status: 500 });
  }
}
