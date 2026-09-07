// Superadmin > Companies — ศูนย์รวม "บริษัทนี้ยังมีชีวิตอยู่ไหม" + ลบถาวร
//
// GET    รายชื่อบริษัท + ความเคลื่อนไหวล่าสุด/สมาชิก/จำนวนข้อมูล (RPC get_company_overview)
// PUT    เปิด/ปิดบริษัท (ปิด = stamp deactivated_at เริ่มนับ 30 วันก่อนลบได้) · เปลี่ยน package
// DELETE ลบถาวร (RPC purge_company) — ต้องพิมพ์ชื่อบริษัทให้ตรง + ผ่านเงื่อนไขฝั่งเซิร์ฟเวอร์
//
// ⚠️ เงื่อนไขลบถาวรคำนวณใหม่ที่เซิร์ฟเวอร์เสมอ — ธง can_purge ที่ส่งไปหน้าจอเป็นแค่ของ UI

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkSuperAdmin } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';
import { parseStorageObjectRef } from '@/lib/storage-object-ref';
import { invalidateWatchdogIssueCache } from '@/lib/marketplace/watchdog';
import { formatThaiDate } from '@/lib/utils/format';

/** ไม่มีความเคลื่อนไหวเกินเท่านี้ = "เงียบ" · ปิดบริษัทครบเท่านี้ = ลบถาวรได้ */
const QUIET_DAYS = 30;
const DAY_MS = 86_400_000;

/** แถวหนึ่งของ RPC get_company_overview */
interface OverviewMember {
  user_id: string;
  name: string | null;
  email: string | null;
  roles: string[] | null;
  permissions: Record<string, string> | null;
  is_active: boolean;
  joined_at: string | null;
  last_sign_in_at: string | null;
}

interface CompanyOverview {
  id: string;
  members: number;
  members_list: OverviewMember[] | null;
  last_login: string | null;
  orders: number;
  last_order: string | null;
  products: number;
  last_product_edit: string | null;
  customers: number;
  shops: number;
  chat_channels: number;
  last_chat: string | null;
  last_pos: string | null;
  last_activity: string | null;
  is_empty: boolean;
}

interface CompanyRow {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  is_active: boolean;
  deactivated_at: string | null;
  created_at: string;
}

async function loadOverview(): Promise<Map<string, CompanyOverview>> {
  const { data, error } = await supabaseAdmin.rpc('get_company_overview');
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as CompanyOverview[];
  return new Map(rows.map(r => [r.id, r]));
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / DAY_MS));
}

/** เงื่อนไขลบถาวร — ใช้ทั้งตอนส่งธงให้หน้าจอ และตอนตรวจซ้ำใน DELETE */
function purgeEligibility(company: Pick<CompanyRow, 'is_active' | 'deactivated_at'>, isEmpty: boolean) {
  const purgeAvailableAt = company.deactivated_at
    ? new Date(new Date(company.deactivated_at).getTime() + QUIET_DAYS * DAY_MS).toISOString()
    : null;
  const closedLongEnough =
    !company.is_active && !!purgeAvailableAt && new Date(purgeAvailableAt).getTime() <= Date.now();
  return { canPurge: closedLongEnough || isEmpty, purgeAvailableAt };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const filter = searchParams.get('filter') || 'all';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // โหลดทั้งตาราง (บริษัททั้งระบบมีหลักสิบ) แล้วค่อยกรอง/ตัดหน้าในหน่วยความจำ —
    // ตัวกรอง "เงียบ/ปิดแล้ว" คำนวณจากข้อมูลของ RPC ซึ่ง query ฝั่ง DB กรองให้ไม่ได้
    const { rows: allCompanies, error } = await fetchAllRows<CompanyRow>((from, to) => {
      let q = supabaseAdmin
        .from('companies')
        .select('id, name, slug, logo_url, is_active, deactivated_at, created_at', { count: 'exact' })
        .order('created_at', { ascending: false });
      if (search) q = q.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
      return q.range(from, to);
    });
    if (error) throw error;

    let overview: Map<string, CompanyOverview>;
    try {
      overview = await loadOverview();
    } catch (err) {
      console.error('get_company_overview failed:', err);
      overview = new Map();
    }

    const enriched = allCompanies.map(c => {
      const o = overview.get(c.id);
      const lastActivity = o?.last_activity || c.created_at;
      const quietDays = daysSince(lastActivity);
      const isEmpty = o?.is_empty ?? false;
      const { canPurge, purgeAvailableAt } = purgeEligibility(c, isEmpty);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        logo_url: c.logo_url,
        is_active: c.is_active,
        deactivated_at: c.deactivated_at,
        created_at: c.created_at,
        member_count: o?.members ?? 0,
        members_list: o?.members_list ?? [],
        orders: o?.orders ?? 0,
        products: o?.products ?? 0,
        customers: o?.customers ?? 0,
        shops: o?.shops ?? 0,
        chat_channels: o?.chat_channels ?? 0,
        last_activity: lastActivity,
        last_login: o?.last_login ?? null,
        last_order: o?.last_order ?? null,
        last_chat: o?.last_chat ?? null,
        is_empty: isEmpty,
        quiet_days: quietDays,
        is_quiet: c.is_active && quietDays !== null && quietDays >= QUIET_DAYS,
        can_purge: canPurge,
        purge_available_at: purgeAvailableAt,
      };
    });

    const filtered =
      filter === 'quiet' ? enriched.filter(c => c.is_quiet)
      : filter === 'inactive' ? enriched.filter(c => !c.is_active)
      : enriched;

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const pageRows = filtered.slice(offset, offset + limit);
    const companyIds = pageRows.map(c => c.id);

    // เจ้าของ + package ดึงเฉพาะแถวที่จะส่งกลับ (ไม่ใช่ทั้งตาราง)
    const ownerMap: Record<string, { name: string; email: string }> = {};
    const packageMap: Record<string, { package_id: string; package_name: string; package_slug: string }> = {};

    if (companyIds.length > 0) {
      const [{ data: owners }, { data: subs }] = await Promise.all([
        supabaseAdmin
          .from('company_members')
          .select('company_id, user:user_profiles(name, email)')
          .in('company_id', companyIds)
          .contains('roles', ['owner']),
        supabaseAdmin
          .from('user_subscriptions')
          .select('company_id, package:packages(id, name, slug)')
          .in('company_id', companyIds)
          .eq('status', 'active'),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (owners || []).forEach((o: any) => {
        if (o.user) ownerMap[o.company_id] = { name: o.user.name || '', email: o.user.email || '' };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (subs || []).forEach((s: any) => {
        if (s.company_id && s.package) {
          packageMap[s.company_id] = {
            package_id: s.package.id,
            package_name: s.package.name,
            package_slug: s.package.slug,
          };
        }
      });
    }

    const result = pageRows.map(c => ({
      ...c,
      owner_name: ownerMap[c.id]?.name || '',
      owner_email: ownerMap[c.id]?.email || '',
      package_id: packageMap[c.id]?.package_id || null,
      package_name: packageMap[c.id]?.package_name || '-',
      package_slug: packageMap[c.id]?.package_slug || '',
    }));

    return NextResponse.json({
      companies: result,
      total,
      page,
      limit,
      filter,
      counts: {
        all: enriched.length,
        quiet: enriched.filter(c => c.is_quiet).length,
        inactive: enriched.filter(c => !c.is_active).length,
      },
    });
  } catch (error) {
    console.error('GET superadmin/companies error:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { id, is_active, package_id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // เปิด/ปิดบริษัท — ปิดคือจุดเริ่มนับ 30 วันก่อนลบถาวรได้ จึง stamp เวลาไว้ในอัปเดตเดียวกัน
    if (is_active !== undefined) {
      const { error } = await supabaseAdmin
        .from('companies')
        .update({
          is_active,
          deactivated_at: is_active ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      // ตัวเฝ้ามีเรื่อง "บริษัทปิดครบ 30 วัน" อยู่ด้วย — ผลเปลี่ยนทันทีที่กดสวิตช์
      invalidateWatchdogIssueCache();
    }

    // Change package
    if (package_id) {
      const { data: pkg } = await supabaseAdmin
        .from('packages')
        .select('id, name')
        .eq('id', package_id)
        .single();

      if (!pkg) {
        return NextResponse.json({ error: 'Package not found' }, { status: 404 });
      }

      // Expire current active subscription
      await supabaseAdmin
        .from('user_subscriptions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('company_id', id)
        .eq('status', 'active');

      // Create new subscription
      const { error } = await supabaseAdmin
        .from('user_subscriptions')
        .insert({
          company_id: id,
          user_id: auth.userId,
          package_id: package_id,
          status: 'active',
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;

      return NextResponse.json({ success: true, message: `เปลี่ยน package เป็น ${pkg.name} สำเร็จ` });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT superadmin/companies error:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
  }
}

// ─── ลบถาวร ─────────────────────────────────────────────────────────────

/** คอลัมน์ที่เก็บ URL ไฟล์ในสตอเรจของเรา — ต้องเก็บก่อน purge ไม่งั้นไฟล์กลายเป็นขยะที่ไม่มีใครอ้าง */
const URL_COLUMNS: { table: string; column: string; scope: 'company' | 'id' }[] = [
  { table: 'companies', column: 'logo_url', scope: 'id' },
  { table: 'customers', column: 'avatar_url', scope: 'company' },
  { table: 'product_images', column: 'image_url', scope: 'company' },
  { table: 'products', column: 'image', scope: 'company' },
  { table: 'payment_records', column: 'slip_image_url', scope: 'company' },
  { table: 'replenishments', column: 'receive_photo_url', scope: 'company' },
];

/** ตารางข้อความแชท — ไฟล์ที่เราอัปเองอยู่ใน raw_message (imageUrl/videoUrl/audioUrl/fileUrl) */
const CHAT_MESSAGE_TABLES = ['line_messages', 'fb_messages', 'shopee_messages', 'lazada_messages', 'tiktok_messages'];
const CHAT_MEDIA_KEYS = ['imageUrl', 'videoUrl', 'audioUrl', 'fileUrl', 'previewUrl'];
/** เพดานแถวที่ไล่เก็บ URL ต่อหนึ่งตาราง — best effort ไม่ให้ request บานเมื่อบริษัทมีข้อความเป็นแสน */
const SCAN_ROW_CAP = 20_000;

/** รวบรวมไฟล์ในสตอเรจที่เป็นของบริษัทนี้ — พังตรงไหนข้ามตรงนั้น (ลบแถวสำคัญกว่าลบไฟล์) */
async function collectStorageRefs(companyId: string): Promise<Map<string, Set<string>>> {
  const byBucket = new Map<string, Set<string>>();
  const add = (url: unknown) => {
    if (typeof url !== 'string') return;
    const ref = parseStorageObjectRef(url);
    if (!ref) return;
    const set = byBucket.get(ref.bucket) || new Set<string>();
    set.add(ref.path);
    byBucket.set(ref.bucket, set);
  };

  for (const { table, column, scope } of URL_COLUMNS) {
    try {
      const { rows, error } = await fetchAllRows<Record<string, unknown>>(
        (from, to) => {
          const q = supabaseAdmin.from(table).select(column, { count: 'exact' });
          const scoped = scope === 'id' ? q.eq('id', companyId) : q.eq('company_id', companyId);
          // ชื่อคอลัมน์เป็นตัวแปร → supabase-js เดา type ของแถวไม่ได้ ต้องบอกเอง
          return scoped.range(from, to) as unknown as PromiseLike<{
            data: Record<string, unknown>[] | null;
            error: { message: string } | null;
            count?: number | null;
          }>;
        },
        { to: SCAN_ROW_CAP - 1 },
      );
      if (error) throw new Error(error.message);
      for (const row of rows) add(row[column]);
    } catch (err) {
      console.warn(`[purge] เก็บ URL จาก ${table}.${column} ไม่สำเร็จ:`, err instanceof Error ? err.message : err);
    }
  }

  // โลโก้ร้าน marketplace อยู่ใน metadata.shop_logo (JSONB) ไม่ใช่คอลัมน์ของตัวเอง
  try {
    const { data } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('metadata')
      .eq('company_id', companyId);
    for (const row of data || []) {
      add((row.metadata as Record<string, unknown> | null)?.shop_logo);
    }
  } catch (err) {
    console.warn('[purge] เก็บโลโก้ร้าน marketplace ไม่สำเร็จ:', err instanceof Error ? err.message : err);
  }

  for (const table of CHAT_MESSAGE_TABLES) {
    try {
      const { rows, error } = await fetchAllRows<{ raw_message: Record<string, unknown> | null }>(
        (from, to) =>
          supabaseAdmin
            .from(table)
            .select('raw_message', { count: 'exact' })
            .eq('company_id', companyId)
            .in('message_type', ['image', 'video', 'audio', 'file'])
            .range(from, to),
        { to: SCAN_ROW_CAP - 1 },
      );
      if (error) throw new Error(error.message);
      for (const row of rows) {
        const raw = row.raw_message;
        if (!raw) continue;
        for (const key of CHAT_MEDIA_KEYS) add(raw[key]);
      }
    } catch (err) {
      console.warn(`[purge] เก็บสื่อแชทจาก ${table} ไม่สำเร็จ:`, err instanceof Error ? err.message : err);
    }
  }

  return byBucket;
}

/** ไล่ทุกไฟล์ใต้ prefix ของบริษัทในบัคเก็ตโลโก้ (list ของ Supabase ไม่ recursive เอง) */
async function listCompanyLogoPaths(bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 3) return [];
  const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];
  const paths: string[] = [];
  for (const item of data) {
    const full = `${prefix}/${item.name}`;
    // โฟลเดอร์ของ Supabase ไม่มี id — ต้องไล่ลงไปอีกชั้น
    if (item.id) paths.push(full);
    else paths.push(...(await listCompanyLogoPaths(bucket, full, depth + 1)));
  }
  return paths;
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const id: string | undefined = body?.id;
    const confirmName: string | undefined = body?.confirm_name;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('id, name, is_active, deactivated_at')
      .eq('id', id)
      .maybeSingle();

    if (!company) return NextResponse.json({ error: 'ไม่พบบริษัทนี้' }, { status: 404 });

    if (typeof confirmName !== 'string' || confirmName !== company.name) {
      return NextResponse.json(
        { error: 'ชื่อบริษัทที่พิมพ์ยืนยันไม่ตรงกับชื่อจริง' },
        { status: 400 },
      );
    }

    // ตรวจเงื่อนไขใหม่จากข้อมูลจริง — ห้ามเชื่อธงจากหน้าจอ
    let isEmpty = false;
    try {
      const overview = await loadOverview();
      isEmpty = overview.get(id)?.is_empty ?? false;
    } catch (err) {
      console.error('get_company_overview failed during purge:', err);
      return NextResponse.json(
        { error: 'ตรวจสถานะบริษัทไม่สำเร็จ ลองใหม่อีกครั้ง' },
        { status: 500 },
      );
    }

    const { canPurge, purgeAvailableAt } = purgeEligibility(company, isEmpty);
    if (!canPurge) {
      const reason = company.is_active
        ? 'บริษัทนี้ยังเปิดใช้งานและมีข้อมูลอยู่ — ต้องปิดการใช้งานก่อน แล้วรออีก 30 วันจึงลบถาวรได้'
        : purgeAvailableAt
          ? `บริษัทนี้ปิดยังไม่ครบ 30 วัน — ลบถาวรได้ตั้งแต่ ${formatThaiDate(purgeAvailableAt)}`
          : 'บริษัทนี้ยังไม่ได้ปิดการใช้งานอย่างถูกต้อง — กดปิดการใช้งานก่อนแล้วรอ 30 วัน';
      return NextResponse.json({ error: reason }, { status: 403 });
    }

    // เก็บ URL ไฟล์ก่อน purge — หลัง purge แถวหายหมด ตามหาไฟล์ไม่ได้อีก
    const storageRefs = await collectStorageRefs(id);
    try {
      const logoPaths = await listCompanyLogoPaths('company-logos', id);
      if (logoPaths.length > 0) {
        const set = storageRefs.get('company-logos') || new Set<string>();
        logoPaths.forEach(p => set.add(p));
        storageRefs.set('company-logos', set);
      }
    } catch (err) {
      console.warn('[purge] list company-logos ไม่สำเร็จ:', err instanceof Error ? err.message : err);
    }

    const { data: purgeResult, error: purgeError } = await supabaseAdmin.rpc('purge_company', {
      p_company_id: id,
    });
    if (purgeError) {
      console.error('purge_company failed:', purgeError);
      return NextResponse.json(
        { error: `ลบไม่สำเร็จ: ${purgeError.message}` },
        { status: 500 },
      );
    }

    const summary = (purgeResult || {}) as { deleted?: Record<string, number>; passes?: number };
    const deletedRows = Object.values(summary.deleted || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);

    // ลบไฟล์ตาม — ล้มไม่เป็นไร (แถวหายแล้ว ไฟล์ที่เหลือเป็นขยะที่ไม่มีใครเห็น)
    let storageRemoved = 0;
    let storageFailed = 0;
    for (const [bucket, paths] of storageRefs) {
      const all = [...paths];
      for (let i = 0; i < all.length; i += 100) {
        const batch = all.slice(i, i + 100);
        try {
          const { error } = await supabaseAdmin.storage.from(bucket).remove(batch);
          if (error) throw new Error(error.message);
          storageRemoved += batch.length;
        } catch (err) {
          storageFailed += batch.length;
          console.warn(`[purge] ลบไฟล์ใน ${bucket} ไม่สำเร็จ:`, err instanceof Error ? err.message : err);
        }
      }
    }

    invalidateWatchdogIssueCache();

    console.warn(
      `[purge] superadmin ${auth.userId} ลบบริษัทถาวร "${company.name}" (${id}) — ` +
      `${deletedRows} แถว / ${summary.passes ?? '?'} รอบ · ไฟล์ลบ ${storageRemoved} ล้มเหลว ${storageFailed}`,
      summary.deleted || {},
    );

    return NextResponse.json({
      success: true,
      deleted_rows: deletedRows,
      deleted: summary.deleted || {},
      passes: summary.passes ?? null,
      storage_removed: storageRemoved,
      storage_failed: storageFailed,
      message: `ลบบริษัท "${company.name}" ถาวรแล้ว (${deletedRows} แถว)`,
    });
  } catch (error) {
    console.error('DELETE superadmin/companies error:', error);
    return NextResponse.json({ error: 'Failed to delete company' }, { status: 500 });
  }
}
