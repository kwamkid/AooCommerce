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

    const table = platform === 'line' ? 'line_contacts' : 'fb_contacts';
    await supabaseAdmin
      .from(table)
      .update({ unread_count: 0 })
      .eq('id', id)
      .eq('company_id', companyId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
