import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { ensureValidToken, getLazadaShippingLabel, type LazadaAccountRow } from '@/lib/lazada/api';

// ใบปะหน้าพัสดุ Lazada — POST { order_id }
//
// Lazada คืนมาได้ 2 แบบแล้วแต่ร้าน: ไฟล์ base64 (`file`) หรือ URL (`pdf_url`)
// ต้องเช็คทั้งคู่เสมอ · เลขพัสดุมาจาก order_parcels (ถ้าแบ่งกล่อง) หรือ external_data

export async function POST(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.ship')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { order_id } = await request.json().catch(() => ({}));
  if (!order_id) return NextResponse.json({ error: 'ต้องระบุออเดอร์' }, { status: 400 });

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, source, external_order_sn, marketplace_account_id, external_data')
    .eq('id', order_id)
    .eq('company_id', companyId)
    .single();

  if (!order) return NextResponse.json({ error: 'ไม่พบออเดอร์' }, { status: 404 });
  if (order.source !== 'lazada' || !order.marketplace_account_id) {
    return NextResponse.json({ error: 'ออเดอร์นี้ไม่ใช่ของ Lazada' }, { status: 400 });
  }

  // เลขพัสดุ: จากกล่องที่แบ่งไว้ก่อน ถ้าไม่มีค่อยเอาจากข้อมูลออเดอร์ที่ดูดมา
  const { data: parcels } = await supabaseAdmin
    .from('order_parcels')
    .select('package_number')
    .eq('order_id', order_id)
    .not('package_number', 'is', null);

  let packageIds = (parcels || []).map(p => p.package_number as string);
  if (packageIds.length === 0) {
    const items = ((order.external_data as Record<string, unknown>)?.items || []) as
      { package_id?: string }[];
    packageIds = [...new Set(items.map(i => i.package_id).filter((v): v is string => !!v))];
  }
  if (packageIds.length === 0) {
    return NextResponse.json({ error: 'ยังไม่มีเลขพัสดุ — ต้องกดจัดส่งก่อน' }, { status: 400 });
  }

  const { data: account } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', order.marketplace_account_id)
    .single();
  if (!account) return NextResponse.json({ error: 'ไม่พบร้าน Lazada' }, { status: 404 });

  try {
    const creds = await ensureValidToken(account as unknown as LazadaAccountRow, 'main');
    const { file, pdfUrl, error } = await getLazadaShippingLabel(creds, packageIds);
    if (error) return NextResponse.json({ error: `ดึงใบปะหน้าไม่สำเร็จ: ${error}` }, { status: 400 });
    if (!file && !pdfUrl) {
      return NextResponse.json({ error: 'Lazada ไม่ได้ส่งไฟล์กลับมา' }, { status: 400 });
    }
    return NextResponse.json({ success: true, file, pdf_url: pdfUrl, package_ids: packageIds });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' },
      { status: 500 }
    );
  }
}
