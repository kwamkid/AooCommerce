// Path: app/api/users/profile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error in profile update:', authError);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const name = body?.name;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุชื่อ' }, { status: 400 });
    }

    // Check if profile exists
    const { data: existing } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (existing) {
      // Update only the name
      const { error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) {
        console.error('Profile update error detail:', JSON.stringify(updateError));
        return NextResponse.json({ error: `เกิดข้อผิดพลาดในการบันทึก: ${updateError.message}` }, { status: 500 });
      }
    } else {
      // Create new profile
      const { error: insertError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: user.id,
          email: user.email || `user_${user.id}@placeholder.local`,
          name: name.trim(),
          is_active: true,
        });

      if (insertError) {
        console.error('Profile insert error detail:', JSON.stringify(insertError));
        return NextResponse.json({ error: `เกิดข้อผิดพลาดในการบันทึก: ${insertError.message}` }, { status: 500 });
      }
    }

    // Also update auth user metadata so Supabase Dashboard shows correct name
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, full_name: name.trim(), name: name.trim() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Profile update catch error:', error);
    return NextResponse.json({ error: `เกิดข้อผิดพลาด: ${error instanceof Error ? error.message : 'unknown'}` }, { status: 500 });
  }
}
