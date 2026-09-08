// Storefront config — read/write companies.settings.storefront
// (JSONB, same approach as feature flags — no dedicated table).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import {
  parseStorefront,
  storefrontSlugLockRemainingDays,
  type StorefrontConfig,
} from '@/lib/storefront';

export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabaseAdmin
    .from('companies')
    .select('slug, storefront_slug, storefront_slug_changed_at, name, logo_url, phone, email, address, settings')
    .eq('id', auth.companyId)
    .single();

  return NextResponse.json({
    // slug ที่ใช้จริงในลิงก์ — ตั้งเองไว้ก็ใช้ตัวนั้น ไม่งั้นตกไปที่ตัวระบุบริษัท
    slug: data?.storefront_slug || data?.slug || '',
    /** ตั้งเองไว้หรือยัง — ว่าง = หน้าจอโชว์ตัวของบริษัทเป็น placeholder */
    storefront_slug: data?.storefront_slug || '',
    company_slug: data?.slug || '',
    // ล็อกนับเฉพาะตอนร้านเปิดอยู่ — ยังไม่เปิด = ยังไม่มีลิงก์ไหนอยู่ข้างนอก แก้ได้อิสระ
    slug_lock_days_left: parseStorefront((data?.settings as Record<string, unknown>) || {}).enabled
      ? storefrontSlugLockRemainingDays(data?.storefront_slug_changed_at ?? null)
      : 0,
    // ใช้ในพรีวิว + เป็น placeholder ของช่องที่ปล่อยว่างแล้วตกไปใช้ของบริษัท
    company_name: data?.name || '',
    company_phone: data?.phone || '',
    company_email: data?.email || '',
    company_address: data?.address || '',
    logo_url: data?.logo_url || null,
    storefront: parseStorefront((data?.settings as Record<string, unknown>) || {}),
  });
}

const RADIUS = new Set(['sharp', 'soft', 'round']);
const LAYOUT = new Set(['grid', 'editorial', 'masonry']);
const HEADER = new Set(['light', 'brand', 'dark']);
const HEADER_LAYOUT = new Set(['left', 'stacked', 'center']);
const HEADER_BEHAVIOR = new Set(['sticky', 'auto_hide', 'static']);
// ล้อกับที่ Shopee รองรับ (1:1 / 3:4) — มาตรฐานเดียวทั้งระบบ · ค่าเก่า '4:5' map เป็น '3:4'
const RATIO = new Set(['1:1', '3:4', 'auto']);
const LOGO = new Set(['logo_name', 'logo_only', 'name_only']);
const BTN = new Set(['solid', 'outline', 'soft']);
const HEX = /^#[0-9a-f]{6}$/i;
/** slug ในลิงก์ที่ลูกค้าเห็น — ตัวเล็ก ตัวเลข ขีดกลาง 3–40 ตัว ห้ามขึ้น/ลงท้ายด้วยขีด */
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export async function PUT(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth, 'settings.access')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขหน้าร้านออนไลน์' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as
    (Partial<StorefrontConfig> & { storefront_slug?: string }) | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  // ── slug ของหน้าร้าน (คนละตัวกับตัวระบุบริษัท) ──────────────────────
  //
  // ⛔ **ห้ามให้ค่าซ้ำเกิดขึ้นได้เลย** — ทั้งซ้ำกับ `storefront_slug` และซ้ำกับ
  // `companies.slug` ของบริษัทอื่น · DB มี unique เฉพาะภายในคอลัมน์เดียวกัน
  // กันข้ามคอลัมน์ไม่ได้ ด่านนี้จึงเป็นด่านเดียวที่กันได้ (อีกด่านคือตอนสร้างบริษัท
  // ใน /api/companies ซึ่งเช็คย้อนกลับมาที่ storefront_slug ด้วย)
  let storefrontSlug: string | null | undefined;
  let slugChangedAt: string | undefined;
  if (body.storefront_slug !== undefined) {
    const raw = (body.storefront_slug || '').trim().toLowerCase();
    const { data: own } = await supabaseAdmin
      .from('companies')
      .select('slug, storefront_slug, storefront_slug_changed_at, settings')
      .eq('id', auth.companyId)
      .single();

    if (!raw) {
      storefrontSlug = null;
    } else if (raw === own?.slug) {
      // กรอกตรงกับ slug ของบริษัทตัวเอง = ไม่ได้ตั้งอะไรใหม่ — เก็บเป็นค่าว่างไปเลย
      // (เก็บค่าซ้ำไว้สองที่แล้ววันหลังใครแก้ทีละที่ จะกลายเป็นสองความจริง)
      storefrontSlug = null;
    } else if (!SLUG.test(raw)) {
      return NextResponse.json(
        { error: 'ชื่อลิงก์ใช้ได้เฉพาะ a-z 0-9 และขีดกลาง ยาว 3–40 ตัว และห้ามขึ้นหรือลงท้ายด้วยขีด' },
        { status: 400 },
      );
    } else {
      const { data: clash } = await supabaseAdmin
        .from('companies')
        .select('id')
        .or(`slug.eq.${raw},storefront_slug.eq.${raw}`)
        .neq('id', auth.companyId)
        .limit(1);
      if (clash && clash.length > 0) {
        return NextResponse.json({ error: 'ชื่อลิงก์นี้มีร้านอื่นใช้อยู่แล้ว' }, { status: 400 });
      }
      storefrontSlug = raw;
    }

    // เปลี่ยนจริงเมื่อไหร่ถึงติดกติกา — กรอกค่าเดิมซ้ำไม่นับว่าเปลี่ยน
    const currentSlug = own?.storefront_slug ?? null;
    if (storefrontSlug !== currentSlug) {
      const wasEnabled = parseStorefront((own?.settings as Record<string, unknown>) || {}).enabled;
      const daysLeft = wasEnabled
        ? storefrontSlugLockRemainingDays(own?.storefront_slug_changed_at ?? null)
        : 0;
      if (daysLeft > 0) {
        return NextResponse.json({
          error: `เปลี่ยนชื่อลิงก์ได้ครั้งเดียวทุก 30 วัน — เปลี่ยนได้อีกครั้งในอีก ${daysLeft} วัน`,
        }, { status: 400 });
      }
      slugChangedAt = new Date().toISOString();
    }
  }

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
  // สีปุ่มเว้นว่างได้ = ใช้สีแบรนด์
  const buttonColor = (body.button_color ?? '').trim();
  if (buttonColor && !HEX.test(buttonColor)) {
    return NextResponse.json({ error: 'สีปุ่มไม่ถูกต้อง — ใช้รูปแบบ #RRGGBB' }, { status: 400 });
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
    // URL มาจาก /api/companies/logo ของเราเอง — ยอมรับเฉพาะ absolute http(s) หรือค่าว่าง
    logo_url: /^https?:\/\//.test((body.logo_url ?? '').trim()) ? body.logo_url!.trim() : (body.logo_url !== undefined ? '' : current.logo_url),
    public_base_url: body.public_base_url !== undefined ? baseUrl : current.public_base_url,
    public_base_path: (body.public_base_path ?? current.public_base_path).trim(),
    allow_ai_crawlers: body.allow_ai_crawlers ?? current.allow_ai_crawlers,
    line_login: body.line_login ?? current.line_login,
    primary_color: color || current.primary_color,
    button_color: body.button_color !== undefined ? buttonColor : current.button_color,
    header_style: HEADER.has(body.header_style as string) ? body.header_style! : current.header_style,
    header_layout: HEADER_LAYOUT.has(body.header_layout as string) ? body.header_layout! : current.header_layout,
    header_behavior: HEADER_BEHAVIOR.has(body.header_behavior as string) ? body.header_behavior! : current.header_behavior,
    logo_display: LOGO.has(body.logo_display as string) ? body.logo_display! : current.logo_display,
    button_style: BTN.has(body.button_style as string) ? body.button_style! : current.button_style,
    radius: RADIUS.has(body.radius as string) ? body.radius! : current.radius,
    layout: LAYOUT.has(body.layout as string) ? body.layout! : current.layout,
    image_ratio: RATIO.has(body.image_ratio as string) ? body.image_ratio! : current.image_ratio,
    announcement: (body.announcement ?? current.announcement).trim(),
    // ว่าง = ใช้ของบริษัท (ตกที่ตอนแสดงผล ไม่ copy มาเก็บ — ไม่งั้นแก้ข้อมูลบริษัทแล้วหน้าร้านค้างของเก่า)
    contact_phone: (body.contact_phone ?? current.contact_phone).trim(),
    contact_email: (body.contact_email ?? current.contact_email).trim(),
    contact_address: (body.contact_address ?? current.contact_address).trim(),
  };

  const { error } = await supabaseAdmin
    .from('companies')
    .update({
      settings: { ...currentSettings, storefront: next },
      ...(storefrontSlug !== undefined ? { storefront_slug: storefrontSlug } : {}),
      ...(slugChangedAt ? { storefront_slug_changed_at: slugChangedAt } : {}),
    })
    .eq('id', auth.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, storefront: next, storefront_slug: storefrontSlug });
}
