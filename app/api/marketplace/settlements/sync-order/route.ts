import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { logIntegrationNow } from '@/lib/integration-logger';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import { syncOrderSettlement } from '@/lib/marketplace/settlement';
import { MARKETPLACE_PLATFORMS, type QuotaPlatform } from '@/lib/marketplace/platforms';
import { guardFeature } from '@/lib/package-gates-server';

// ดึงยอดเงินของออเดอร์ "ใบเดียว" ตามที่ผู้ใช้กดจากหน้าออเดอร์
//
// POST { order_id } → { status: 'saved'|'pending'|'unsupported'|'error', message? }
//
// ต่างจาก /settlements/sync (cron ไล่ทั้งร้าน) ตรงที่ใบเดียวและผู้ใช้รอผลอยู่
// — งานจึงทำในสายที่ผู้ใช้รอ ไม่ต้อง after()
//
// ชั้นกลาง `syncOrderSettlement()` เลือก adapter ตาม platform ของร้านให้เอง
// **route นี้ห้ามรู้จักชื่อ platform** (ดู lib/marketplace/settlement-adapter.ts)

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
  const blocked = await guardFeature(auth.companyId, 'marketplace_sync');
  if (blocked) return blocked;
  if (!can(auth, 'marketplace.sync')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ดึงยอดเงินจากแพลตฟอร์ม' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const orderId: string = body.order_id;
  if (!orderId) return NextResponse.json({ error: 'ต้องระบุ order_id' }, { status: 400 });

  const startedAt = Date.now();

  // หา platform ก่อนยิง เพื่อเช็ค breaker ของ scope finance — โควตาการเงินเต็มอยู่
  // ยิงไปก็ล้มแน่ ๆ และยังทำให้โดนแบนนานขึ้นอีก
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, marketplace_account_id')
    .eq('id', orderId)
    .eq('company_id', auth.companyId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: 'ไม่พบออเดอร์นี้' }, { status: 404 });

  const { data: account } = order.marketplace_account_id
    ? await supabaseAdmin
        .from('marketplace_accounts')
        .select('id, platform, shop_name')
        .eq('id', order.marketplace_account_id)
        .eq('company_id', auth.companyId)
        .maybeSingle()
    : { data: null };

  if (!account?.platform) {
    return NextResponse.json({ status: 'unsupported', message: 'ออเดอร์นี้ไม่ได้มาจากร้านบนแพลตฟอร์ม' });
  }

  const platform = account.platform as QuotaPlatform;
  if (MARKETPLACE_PLATFORMS[platform]) {
    const quota = await isQuotaBlocked(platform, 'finance');
    if (quota.blocked) {
      return NextResponse.json({
        status: 'error',
        message: `${MARKETPLACE_PLATFORMS[platform].label} กำลังพักการเรียกข้อมูลการเงิน — ลองใหม่ภายหลัง`,
        until: quota.until,
      });
    }
  }

  const result = await syncOrderSettlement(orderId, auth.companyId);

  // log ด้วย action เดียวกับ cron — ดูย้อนหลังได้ที่เดียวว่ายอดของใบนี้ดึงเมื่อไหร่/ล้มเพราะอะไร
  await logIntegrationNow({
    company_id: auth.companyId,
    integration: platform,
    account_id: account.id,
    account_name: account.shop_name,
    direction: 'outgoing',
    action: 'settlement_sync',
    request_body: { order_id: orderId },
    response_body: result,
    status: result.status === 'error' ? 'error' : 'success',
    error_message: result.status === 'error' ? result.message : undefined,
    reference_type: 'order',
    reference_id: orderId,
    reference_label: 'ยอดโอนรายใบ',
    duration_ms: Date.now() - startedAt,
  });

  return NextResponse.json(result);
}
