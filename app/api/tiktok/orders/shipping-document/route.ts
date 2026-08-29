import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { ensureValidToken, getShippingDocument, type TikTokAccountRow } from '@/lib/tiktok/api';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import { logIntegration } from '@/lib/integration-logger';

// ใบปะหน้าพัสดุ TikTok — POST { order_id }
//
// TikTok คืนเป็น URL (`doc_url`) เราต้องโหลดมาส่งต่อเป็นไฟล์
// เพราะฝั่งหน้าเว็บทำ res.blob() → showPdfPreview (สัญญาเดียวกับ Shopee/Lazada)

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.ship')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { order_id } = await request.json().catch(() => ({}));
  if (!order_id) return NextResponse.json({ error: 'ต้องระบุออเดอร์' }, { status: 400 });

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, source, marketplace_account_id, external_data')
    .eq('id', order_id)
    .eq('company_id', companyId)
    .single();

  if (!order) return NextResponse.json({ error: 'ไม่พบออเดอร์' }, { status: 404 });
  if (order.source !== 'tiktok' || !order.marketplace_account_id) {
    return NextResponse.json({ error: 'ออเดอร์นี้ไม่ใช่ของ TikTok' }, { status: 400 });
  }

  // เหมือน ship route — หลังแบ่งกล่อง external_data จะเก่า ใช้ order_parcels เป็นหลัก
  const { data: parcelRows } = await supabaseAdmin
    .from('order_parcels')
    .select('package_number')
    .eq('order_id', order_id)
    .not('package_number', 'is', null);

  const lineItems = ((order.external_data as Record<string, unknown>)?.line_items || []) as
    { package_id?: string }[];
  const packageIds = (parcelRows?.length || 0) > 0
    ? [...new Set(parcelRows!.map(p => p.package_number as string))]
    : [...new Set(lineItems.map(li => li.package_id).filter((v): v is string => !!v))];
  if (packageIds.length === 0) {
    return NextResponse.json({ error: 'ยังไม่มีเลขพัสดุ — ต้องกดจัดส่งก่อน' }, { status: 400 });
  }

  const quota = await isQuotaBlocked('tiktok', 'fulfillment');
  if (quota.blocked) {
    return NextResponse.json({ error: 'TikTok จำกัดการเรียกชั่วคราว — ลองใหม่อีกครั้งภายหลัง' }, { status: 429 });
  }

  const { data: account } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', order.marketplace_account_id)
    .single();
  if (!account) return NextResponse.json({ error: 'ไม่พบร้าน TikTok' }, { status: 404 });

  try {
    const creds = await ensureValidToken(account as unknown as TikTokAccountRow);

    // ออเดอร์ที่แบ่งกล่องมีหลายพัสดุ — เอาใบแรกไปก่อน (พิมพ์ทีละใบ)
    // TODO: รวมหลายใบเป็น PDF เดียวด้วย mergePdfBlobs เมื่อมีเคสจริง
    const { doc_url } = await getShippingDocument(creds, packageIds[0]);
    if (!doc_url) {
      return NextResponse.json({ error: 'TikTok ไม่ได้ส่งลิงก์ใบปะหน้ากลับมา' }, { status: 400 });
    }

    const res = await fetch(doc_url);
    if (!res.ok) {
      return NextResponse.json({ error: `โหลดใบปะหน้าไม่สำเร็จ (HTTP ${res.status})` }, { status: 400 });
    }
    const pdf = new Uint8Array(await res.arrayBuffer());
    if (pdf.byteLength === 0) {
      return NextResponse.json({ error: 'ไฟล์ใบปะหน้าว่างเปล่า' }, { status: 400 });
    }

    logIntegration({
      company_id: companyId,
      integration: 'tiktok',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'shipping_document',
      api_path: '/fulfillment/202309/packages/shipping_document',
      request_body: { package_ids: packageIds },
      status: 'success',
      reference_type: 'order',
      reference_id: order_id,
    });

    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="tiktok-label-${packageIds[0]}.pdf"`,
      },
    });
  } catch (err) {
    logIntegration({
      company_id: companyId,
      integration: 'tiktok',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'shipping_document',
      api_path: '/fulfillment/202309/packages/shipping_document',
      status: 'error',
      error_message: err instanceof Error ? err.message : 'unknown',
      reference_type: 'order',
      reference_id: order_id,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' },
      { status: 500 }
    );
  }
}
