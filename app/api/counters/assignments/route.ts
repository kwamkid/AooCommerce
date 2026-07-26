// Path: app/api/counters/assignments/route.ts
// Assign PC users to branch counters (admin only).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

// GET — List assignments (?counter_id=)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'counter.manage')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const counterId = searchParams.get('counter_id');

    let query = supabaseAdmin
      .from('counter_assignments')
      .select('id, counter_id, user_id, created_at')
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: true });
    if (counterId) query = query.eq('counter_id', counterId);

    const { data: assignments, error } = await query;
    if (error) {
      console.error('GET counter assignments error:', error);
      return NextResponse.json({ error: 'ไม่สามารถดึงข้อมูลได้' }, { status: 500 });
    }

    const userIds = [...new Set((assignments || []).map(a => a.user_id))];
    const nameMap: Record<string, { name: string; email?: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, name, email')
        .in('id', userIds);
      for (const p of profiles || []) nameMap[p.id] = { name: p.name, email: p.email };
    }

    return NextResponse.json({
      assignments: (assignments || []).map(a => ({
        ...a,
        user_name: nameMap[a.user_id]?.name || null,
        user_email: nameMap[a.user_id]?.email || null,
      })),
    });
  } catch (error) {
    console.error('GET counter assignments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Assign a user to a counter: { counter_id, user_id }
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'counter.manage')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { counter_id, user_id } = await request.json();
    if (!counter_id || !user_id) {
      return NextResponse.json({ error: 'กรุณาระบุสาขาและผู้ใช้' }, { status: 400 });
    }

    const [{ data: counter }, { data: member }] = await Promise.all([
      supabaseAdmin
        .from('consignment_counters')
        .select('id')
        .eq('id', counter_id)
        .eq('company_id', auth.companyId)
        .maybeSingle(),
      supabaseAdmin
        .from('company_members')
        .select('id')
        .eq('company_id', auth.companyId)
        .eq('user_id', user_id)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    if (!counter) {
      return NextResponse.json({ error: 'ไม่พบสาขา' }, { status: 404 });
    }
    if (!member) {
      return NextResponse.json({ error: 'ผู้ใช้นี้ไม่ได้เป็นสมาชิกของร้าน' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('counter_assignments')
      .insert({ company_id: auth.companyId, counter_id, user_id })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'ผู้ใช้นี้ถูกมอบหมายสาขานี้อยู่แล้ว' }, { status: 400 });
      }
      console.error('POST counter assignment error:', error);
      return NextResponse.json({ error: 'ไม่สามารถมอบหมายได้' }, { status: 500 });
    }

    return NextResponse.json({ success: true, assignment_id: data.id });
  } catch (error) {
    console.error('POST counter assignment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT — Toggle rover flag (หน่วยแทน — access every counter): { user_id, pc_all_counters }
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'counter.manage')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { user_id, pc_all_counters } = await request.json();
    if (!user_id || typeof pc_all_counters !== 'boolean') {
      return NextResponse.json({ error: 'กรุณาระบุผู้ใช้และสถานะหน่วยแทน' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('company_members')
      .update({ pc_all_counters })
      .eq('company_id', auth.companyId)
      .eq('user_id', user_id)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      console.error('PUT rover flag error:', error);
      return NextResponse.json({ error: 'ไม่พบสมาชิก หรือแก้ไขไม่สำเร็จ' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT rover flag error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE — Unassign (?id=)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'counter.manage')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'กรุณาระบุรายการ' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('counter_assignments')
      .delete()
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) {
      console.error('DELETE counter assignment error:', error);
      return NextResponse.json({ error: 'ไม่สามารถลบได้' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE counter assignment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
