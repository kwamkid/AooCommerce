import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuth } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuth(request);
    if (!auth.isAuth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const companyId = formData.get('companyId') as string;

    if (!file || !companyId) {
      return NextResponse.json({ error: 'ไฟล์และ Company ID จำเป็น' }, { status: 400 });
    }

    // Check permission
    const { data: membership } = await supabaseAdmin
      .from('company_members')
      .select('roles')
      .eq('company_id', companyId)
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .single();

    if (!membership || !(membership.roles as string[])?.some((r: string) => ['owner', 'admin'].includes(r))) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์อัพโหลดโลโก้' }, { status: 403 });
    }

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop() || 'png';
    const filePath = `${companyId}/logo.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from('company-logos')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('company-logos')
      .getPublicUrl(filePath);

    // Update company record
    await supabaseAdmin
      .from('companies')
      .update({ logo_url: urlData.publicUrl })
      .eq('id', companyId);

    return NextResponse.json({ success: true, logoUrl: urlData.publicUrl });
  } catch (error) {
    console.error('Upload logo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
