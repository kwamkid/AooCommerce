// Path: app/api/ads/events/route.ts
//
// สมุดบันทึก event ที่ยิงขึ้น Conversions API — อ่านอย่างเดียว
//
// สองผู้เรียก สองระดับสิทธิ์:
// - `?order_id=` — **หน้าออเดอร์** ใครที่เห็นออเดอร์ได้ก็ควรเห็นว่า "บอก Meta แล้วหรือยัง"
//   (ตรวจว่าออเดอร์เป็นของบริษัทนี้ก่อนเสมอ — `listAdEventsForOrder` ค้นด้วย order_id ล้วน)
// - อย่างอื่น — หน้าตั้งค่าบัญชีโฆษณา ต้องมีสิทธิ์ `masterdata.ad_accounts`
//
// ชื่อปลายทาง (`destination_name`) หาแบบ batch: บัญชีโฆษณาของบริษัท 1 query +
// ช่องทางแชท 1 query — **ห้ามยิงต่อแถว** (หน้าออเดอร์เปิดทีละใบก็จริง แต่หน้าตั้งค่าขอทีละ 50)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { listAdEvents, listAdEventsForOrder, type AdEventRecord, type AdEventStatus } from '@/lib/ads/ledger';
import type { AdEventRow } from '@/lib/ads/meta-ui';

const VALID_STATUS = new Set<AdEventStatus>(['pending', 'sent', 'failed', 'skipped']);

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order_id')?.trim() || '';
    const adAccountId = searchParams.get('ad_account_id')?.trim() || '';
    const contactId = searchParams.get('contact_id')?.trim() || '';
    const statusParam = (searchParams.get('status')?.trim() || '') as AdEventStatus;
    const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit')) || 50));

    // หน้าออเดอร์/หน้าแชทเข้าทางนี้ — สิทธิ์ระดับ "เห็นของที่ถามถึง" พอ ไม่ต้องเป็นผู้ดูแล
    // (ทั้งสองทางถูกจำกัดด้วย company_id อยู่แล้ว และตอบแค่ว่า "บอก Meta แล้วหรือยัง")
    const capability = orderId ? 'order.view' : contactId ? 'chat.view' : 'masterdata.ad_accounts';
    if (!can(auth, capability)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
    }

    let records: AdEventRecord[] = [];
    if (orderId) {
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('id', orderId)
        .eq('company_id', auth.companyId)
        .maybeSingle();
      if (!order) return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อนี้' }, { status: 404 });
      records = await listAdEventsForOrder(orderId);
    } else {
      records = await listAdEvents({
        companyId: auth.companyId,
        ...(adAccountId ? { adAccountId } : {}),
        ...(contactId ? { contactId } : {}),
        ...(VALID_STATUS.has(statusParam) ? { status: statusParam } : {}),
        limit,
      });
    }

    if (records.length === 0) return NextResponse.json({ events: [] });

    // ─── ชื่อปลายทาง ───────────────────────────────────────────────
    const nameByAdAccountId = new Map<string, string | null>();
    const nameByDatasetId = new Map<string, string | null>();
    const { data: adAccounts } = await supabaseAdmin
      .from('ad_accounts')
      .select('id, dataset_id, dataset_name, name')
      .eq('company_id', auth.companyId);
    for (const a of (adAccounts || []) as {
      id: string;
      dataset_id: string | null;
      dataset_name: string | null;
      name: string | null;
    }[]) {
      const label = a.dataset_name || a.name || null;
      nameByAdAccountId.set(a.id, label);
      if (a.dataset_id) nameByDatasetId.set(a.dataset_id, label);
    }

    const pageNameByDataset = new Map<string, string | null>();
    if (records.some((r) => r.destination === 'page_dataset')) {
      const { data: chatAccounts } = await supabaseAdmin
        .from('chat_accounts')
        .select('credentials')
        .eq('company_id', auth.companyId);
      for (const c of (chatAccounts || []) as { credentials: Record<string, unknown> | null }[]) {
        const creds = c.credentials || {};
        const datasetId = String(creds.meta_dataset_id || '');
        if (!datasetId) continue;
        pageNameByDataset.set(datasetId, (creds.page_name as string) || null);
      }
    }

    // ─── เลขที่บิล ─────────────────────────────────────────────────
    const orderNumberById = new Map<string, string | null>();
    const orderIds = [...new Set(records.map((r) => r.order_id).filter((v): v is string => !!v))];
    if (orderIds.length > 0) {
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('id, order_number')
        .eq('company_id', auth.companyId)
        .in('id', orderIds);
      for (const o of (orders || []) as { id: string; order_number: string | null }[]) {
        orderNumberById.set(o.id, o.order_number);
      }
    }

    const events: AdEventRow[] = records.map((r) => ({
      id: r.id,
      event_name: r.event_name,
      destination: r.destination,
      destination_id: r.destination_id,
      destination_name:
        r.destination === 'page_dataset'
          ? pageNameByDataset.get(r.destination_id) ?? null
          : (r.ad_account_id ? nameByAdAccountId.get(r.ad_account_id) : undefined) ??
            nameByDatasetId.get(r.destination_id) ??
            null,
      status: r.status,
      event_time: r.event_time,
      sent_at: r.sent_at,
      error: r.error,
      order_id: r.order_id ?? null,
      order_number: r.order_id ? orderNumberById.get(r.order_id) ?? null : null,
      contact_platform: r.contact_platform ?? null,
      contact_id: r.contact_id ?? null,
    }));

    return NextResponse.json({ events });
  } catch (err) {
    console.error('[api/ads/events] GET failed:', err);
    return NextResponse.json({ error: 'โหลดประวัติการส่งไม่สำเร็จ' }, { status: 500 });
  }
}
