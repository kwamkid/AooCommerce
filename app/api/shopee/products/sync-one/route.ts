import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow, isShopeeQuotaBlocked } from '@/lib/shopee/api';
import {
  syncProductWithShop,
  SYNC_FIELDS,
  type SyncDirection,
  type SyncField,
} from '@/lib/shopee/sync-one-product';

/**
 * ซิงค์สินค้า 1 ตัวกับร้าน 1 ร้าน — **ต้องระบุ direction เสมอ ไม่มีค่า default**
 *
 * body: { product_id, marketplace_account_id, direction: 'pull'|'push', fields?: SyncField[], dry_run?: boolean }
 *
 * ตั้งใจไม่ให้มี default: ปุ่ม "sync" ที่ไม่บอกว่าใครทับใครคือที่มาของสต็อกหลุดกัน
 * 3 เดือนโดยไม่มีใครรู้ (ดู fix-bug.md 2026-08-29)
 */
export async function POST(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.sync')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { product_id, marketplace_account_id, direction, fields, dry_run, cover_image_url } = body as {
    product_id?: string;
    marketplace_account_id?: string;
    direction?: string;
    fields?: string[];
    dry_run?: boolean;
    cover_image_url?: string;
  };

  if (!product_id || !marketplace_account_id) {
    return NextResponse.json({ error: 'ต้องระบุ product_id และ marketplace_account_id' }, { status: 400 });
  }
  if (direction !== 'pull' && direction !== 'push') {
    return NextResponse.json(
      { error: 'ต้องระบุ direction เป็น "pull" (เอา Shopee ทับเรา) หรือ "push" (เอาเราทับ Shopee)' },
      { status: 400 }
    );
  }

  const invalidField = (fields || []).find(f => !SYNC_FIELDS.includes(f as SyncField));
  if (invalidField) {
    return NextResponse.json(
      { error: `field "${invalidField}" ไม่รองรับ — เลือกได้: ${SYNC_FIELDS.join(', ')}` },
      { status: 400 }
    );
  }

  const quota = await isShopeeQuotaBlocked('product');
  if (quota.blocked) {
    return NextResponse.json(
      { error: `Shopee พักโควตาส่วนสินค้าถึง ${quota.until} — ลองใหม่หลังจากนั้น` },
      { status: 429 }
    );
  }

  const { data: account } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', marketplace_account_id)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .single();
  if (!account) {
    return NextResponse.json({ error: 'ไม่พบร้านนี้' }, { status: 404 });
  }

  // สินค้าต้องเป็นของบริษัทนี้ — กันยิง product_id ข้ามบริษัท
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('id', product_id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!product) {
    return NextResponse.json({ error: 'ไม่พบสินค้า' }, { status: 404 });
  }

  const result = await syncProductWithShop(account as ShopeeAccountRow, product_id, {
    direction: direction as SyncDirection,
    fields: fields as SyncField[] | undefined,
    dryRun: dry_run === true,
    coverImageUrl: cover_image_url,
  });

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
