import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET — ประวัติ "ทักมาจากโฆษณา/ลิงก์" ของผู้ติดต่อหนึ่งราย (Facebook/Instagram เท่านั้น
// เพราะทั้งคู่เป็นแถวใน fb_contacts) · ทักซ้ำจากโฆษณาคนละตัวจะเป็นคนละแถว
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id: contactId } = await params;

    // ยืนยันว่าผู้ติดต่อเป็นของบริษัทนี้ — service role bypass RLS จึงต้องกันเองที่นี่
    const { data: contact } = await supabaseAdmin
      .from('fb_contacts')
      .select('id')
      .eq('id', contactId)
      .eq('company_id', companyId)
      .single();
    if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await supabaseAdmin
      .from('fb_contact_referrals')
      .select('id, source, type, ref, ad_id, ad_title, post_id, product_id, media_kind, media_url, received_at')
      .eq('contact_id', contactId)
      .eq('company_id', companyId)
      .order('received_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    return NextResponse.json({ referrals: data || [] });
  } catch (error) {
    console.error('Contact referrals GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
