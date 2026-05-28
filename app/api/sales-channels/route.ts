import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';

interface SalesChannelRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  channel_type: 'manual' | 'chat';
  platform: string | null;
  chat_account_id: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  is_system: boolean;
  is_default: boolean;
  sort_order: number;
}

const CODE_REGEX = /^[a-z0-9_-]{2,32}$/;

// GET — list channels. ?active=true to filter active; chat-linked rows always included.
// Orphaned chat mirrors (chat_account_id IS NULL — chat_account was deleted but
// historical orders still reference them) are hidden so the list only shows
// currently-linked channels.
export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const activeOnly = url.searchParams.get('active') === 'true';

  let query = supabaseAdmin
    .from('sales_channels')
    .select('id, code, name, channel_type, platform, chat_account_id, icon, color, is_active, is_system, is_default, sort_order')
    .eq('company_id', auth.companyId)
    .or('channel_type.neq.chat,chat_account_id.not.is.null')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ channels: data || [] });
}

// POST — create a custom manual channel (chat channels are managed by chat-accounts sync).
export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminRole(auth.companyRoles)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการช่องทางการขาย' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Partial<SalesChannelRow> | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const code = (body.code || '').trim().toLowerCase();
  const name = (body.name || '').trim();

  if (!code || !CODE_REGEX.test(code)) {
    return NextResponse.json({ error: 'รหัสต้องเป็น a-z, 0-9, -, _ ความยาว 2-32 ตัว' }, { status: 400 });
  }
  if (code.startsWith('chat_')) {
    return NextResponse.json({ error: 'รหัสขึ้นต้นด้วย "chat_" สงวนไว้สำหรับช่องทางที่เชื่อมกับ chat' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'กรุณาระบุชื่อช่องทาง' }, { status: 400 });
  }

  // unique check
  const { data: existing } = await supabaseAdmin
    .from('sales_channels')
    .select('id')
    .eq('company_id', auth.companyId)
    .eq('code', code)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `รหัส "${code}" มีอยู่แล้ว` }, { status: 409 });
  }

  // sort_order: append to the end of manual range (< 200, which is reserved for chat)
  const { data: maxRow } = await supabaseAdmin
    .from('sales_channels')
    .select('sort_order')
    .eq('company_id', auth.companyId)
    .lt('sort_order', 200)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = Math.min((maxRow?.sort_order ?? 100) + 10, 199);

  const { data, error } = await supabaseAdmin
    .from('sales_channels')
    .insert({
      company_id: auth.companyId,
      code,
      name,
      channel_type: 'manual',
      platform: typeof body.platform === 'string' ? body.platform : null,
      chat_account_id: null,
      icon: body.icon?.toString().trim() || null,
      color: body.color?.toString().trim() || null,
      is_active: body.is_active !== false,
      is_system: false,
      sort_order: nextSort,
    })
    .select('id, code, name, channel_type, platform, chat_account_id, icon, color, is_active, is_system, is_default, sort_order')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channel: data });
}

// PUT — update name / metadata / is_active. Code is immutable. Chat-linked rows can
// only toggle is_active (everything else is owned by chat_accounts via the sync layer).
export async function PUT(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminRole(auth.companyRoles)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการช่องทางการขาย' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as (Partial<SalesChannelRow> & { id?: string }) | null;
  if (!body?.id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const { data: row, error: getErr } = await supabaseAdmin
    .from('sales_channels')
    .select('id, company_id, code, channel_type, is_system, is_active')
    .eq('id', body.id)
    .single();

  if (getErr || !row) return NextResponse.json({ error: 'ไม่พบช่องทาง' }, { status: 404 });
  if (row.company_id !== auth.companyId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const patch: Record<string, unknown> = {};
  const isChatLinked = row.channel_type === 'chat';

  if (typeof body.name === 'string') {
    if (isChatLinked) {
      return NextResponse.json({ error: 'ชื่อช่องทางที่เชื่อมกับ chat แก้ที่ /settings/chat-channels' }, { status: 400 });
    }
    if (row.is_system) {
      return NextResponse.json({ error: 'ช่องทางของระบบแก้ชื่อไม่ได้' }, { status: 400 });
    }
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อช่องทาง' }, { status: 400 });
    patch.name = name;
  }

  if (!isChatLinked) {
    if ('icon' in body) patch.icon = body.icon?.toString().trim() || null;
    if ('color' in body) patch.color = body.color?.toString().trim() || null;
    if ('platform' in body && !row.is_system) {
      patch.platform = typeof body.platform === 'string' && body.platform.trim() ? body.platform.trim() : null;
    }
  }

  if (typeof body.is_active === 'boolean') {
    // Don't allow deactivating the last active channel — OrderForm needs ≥1.
    if (!body.is_active && row.is_active) {
      const { count } = await supabaseAdmin
        .from('sales_channels')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', auth.companyId)
        .eq('is_active', true);
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: 'ต้องเหลือช่องทางที่เปิดใช้งานอย่างน้อย 1 รายการ' }, { status: 400 });
      }
    }
    patch.is_active = body.is_active;
  }

  // Default channel — at most one per company (enforced by partial unique index).
  // Setting one as default unsets all the others first, in the same request.
  if (body.is_default === true) {
    await supabaseAdmin
      .from('sales_channels')
      .update({ is_default: false })
      .eq('company_id', auth.companyId)
      .neq('id', body.id);
    patch.is_default = true;
  } else if (body.is_default === false) {
    patch.is_default = false;
  }

  if (typeof body.sort_order === 'number') {
    // Allow reordering but keep ranges segregated: manual <200, chat ≥200.
    const minSort = isChatLinked ? 200 : 0;
    const maxSort = isChatLinked ? 999 : 199;
    patch.sort_order = Math.max(minSort, Math.min(maxSort, Math.floor(body.sort_order)));
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'ไม่มีการเปลี่ยนแปลง' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('sales_channels')
    .update(patch)
    .eq('id', body.id)
    .select('id, code, name, channel_type, platform, chat_account_id, icon, color, is_active, is_system, is_default, sort_order')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channel: data });
}

// DELETE — only custom manual channels can be hard-deleted. System + chat-linked rows
// must be deactivated instead (and chat-linked rows usually flip via chat-accounts).
// If any order references this channel we soft-delete to preserve history.
export async function DELETE(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminRole(auth.companyRoles)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการช่องทางการขาย' }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const { data: row } = await supabaseAdmin
    .from('sales_channels')
    .select('id, company_id, channel_type, is_system')
    .eq('id', id)
    .single();

  if (!row) return NextResponse.json({ error: 'ไม่พบช่องทาง' }, { status: 404 });
  if (row.company_id !== auth.companyId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (row.is_system) {
    return NextResponse.json({ error: 'ช่องทางของระบบลบไม่ได้ — ใช้ปิดใช้งานแทน' }, { status: 400 });
  }
  if (row.channel_type === 'chat') {
    return NextResponse.json({ error: 'ช่องทางที่เชื่อมกับ chat ลบไม่ได้ — ถอด chat account ออกเพื่อปิดอัตโนมัติ' }, { status: 400 });
  }

  // If any order references this channel, soft-deactivate to keep history queryable.
  const { count } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', auth.companyId)
    .eq('sales_channel_id', id);

  if ((count ?? 0) > 0) {
    const { error: deactivateErr } = await supabaseAdmin
      .from('sales_channels')
      .update({ is_active: false })
      .eq('id', id);
    if (deactivateErr) return NextResponse.json({ error: deactivateErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, soft_deleted: true, message: 'มีออเดอร์ใช้ช่องทางนี้อยู่ — ปิดใช้งานแทน' });
  }

  const { error } = await supabaseAdmin.from('sales_channels').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
