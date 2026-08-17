// Storefront config — read/write companies.settings.storefront
// (JSONB, same approach as feature flags — no dedicated table).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { parseStorefront, type StorefrontConfig } from '@/lib/storefront';

export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabaseAdmin
    .from('companies')
    .select('slug, settings')
    .eq('id', auth.companyId)
    .single();

  return NextResponse.json({
    slug: data?.slug || '',
    storefront: parseStorefront((data?.settings as Record<string, unknown>) || {}),
  });
}

const RADIUS = new Set(['sharp', 'soft', 'round']);
const LAYOUT = new Set(['grid', 'editorial']);
const HEX = /^#[0-9a-f]{6}$/i;

export async function PUT(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'settings.access')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขหน้าร้านออนไลน์' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Partial<StorefrontConfig> | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  // Domain must be a real absolute http(s) origin — a bad value silently
  // breaks every canonical + the sitemap, so reject instead of coercing.
  let baseUrl = (body.public_base_url || '').trim().replace(/\/+$/, '');
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
      baseUrl = parsed.origin;
    } catch {
      return NextResponse.json(
        { error: 'โดเมนไม่ถูกต้อง — ใส่แบบเต็ม เช่น https://shop.example.com' },
        { status: 400 },
      );
    }
  }

  const color = (body.primary_color || '').trim();
  if (color && !HEX.test(color)) {
    return NextResponse.json({ error: 'สีไม่ถูกต้อง — ใช้รูปแบบ #RRGGBB' }, { status: 400 });
  }

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('settings')
    .eq('id', auth.companyId)
    .single();

  const currentSettings = (company?.settings as Record<string, unknown>) || {};
  const current = parseStorefront(currentSettings);

  const next: StorefrontConfig = {
    enabled: body.enabled ?? current.enabled,
    display_name: (body.display_name ?? current.display_name).trim(),
    tagline: (body.tagline ?? current.tagline).trim(),
    public_base_url: body.public_base_url !== undefined ? baseUrl : current.public_base_url,
    public_base_path: (body.public_base_path ?? current.public_base_path).trim(),
    allow_ai_crawlers: body.allow_ai_crawlers ?? current.allow_ai_crawlers,
    primary_color: color || current.primary_color,
    radius: RADIUS.has(body.radius as string) ? body.radius! : current.radius,
    layout: LAYOUT.has(body.layout as string) ? body.layout! : current.layout,
    announcement: (body.announcement ?? current.announcement).trim(),
  };

  const { error } = await supabaseAdmin
    .from('companies')
    .update({ settings: { ...currentSettings, storefront: next } })
    .eq('id', auth.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, storefront: next });
}
