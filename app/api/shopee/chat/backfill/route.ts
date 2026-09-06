import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { syncShopeeConversationMessages } from '@/lib/services/chat/shopee';
import {
  createShopeeEnrichContext, resolveShopeeItemCard, resolveShopeeOrderCard,
  type ShopeeEnrichContext,
} from '@/lib/shopee/chat-enrich';
import type { ShopeeAccountRow } from '@/lib/shopee/api';

// ตามเก็บของเก่าให้เท่ากับของใหม่ — ใช้ครั้งเดียวหลัง deploy (หรือเมื่อสงสัยว่ามีรู)
//
// 1) ดึงข้อความจริงของทุกห้องที่คุยกันใน N วันหลังสุด (เติมข้อความที่ push ไม่ได้ส่งมา
//    + ข้อความย่อยของ bundle_message)
// 2) ลบฟอง "[หลายข้อความ]" (bundle_message) ที่เคยบันทึกไว้ — เนื้อจริงมาแล้ว
// 3) เติมเนื้อการ์ดสินค้า/ออเดอร์ให้แถวเก่าที่ยังมีแต่ id
//
// POST { days?, company_id?, limit? } — auth: CRON_SECRET หรือผู้ใช้ที่ดูแลช่องทางแชท

export const maxDuration = 300;
const TIME_BUDGET_MS = 210_000;   // หยุดเองก่อนโดน Vercel ตัด แล้วบอกว่าเหลือเท่าไหร่

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`
    || request.headers.get('x-cron-secret') === secret;
}

interface ContactRow {
  id: string;
  company_id: string;
  conversation_id: string;
  marketplace_account_id: string | null;
  shop_id: number;
  display_name: string | null;
  last_message_at: string | null;
}

/** เติมเนื้อการ์ดให้แถว item/order ที่ยังไม่มี raw_message.item / .order */
async function reenrichCards(
  enrich: ShopeeEnrichContext,
  contactId: string,
  companyId: string
): Promise<{ items: number; orders: number }> {
  const { data: rows } = await supabaseAdmin
    .from('shopee_messages')
    .select('id, message_type, content, raw_message')
    .eq('company_id', companyId)
    .eq('shopee_contact_id', contactId)
    .in('message_type', ['item', 'order']);

  let items = 0;
  let orders = 0;

  for (const row of rows || []) {
    const raw = (row.raw_message || {}) as Record<string, unknown>;

    if (row.message_type === 'item' && !raw.item) {
      const itemId = raw.item_id != null ? String(raw.item_id) : '';
      if (!itemId) continue;
      const card = await resolveShopeeItemCard(enrich, itemId, raw.shop_id as number | undefined);
      await supabaseAdmin
        .from('shopee_messages')
        .update({
          content: card.name ? `[สินค้า] ${card.name}` : row.content,
          raw_message: { ...raw, item: card, itemUrl: card.shopee_url, linkUrl: card.shopee_url, linkTitle: 'ดูสินค้าใน Shopee' },
        })
        .eq('id', row.id);
      items++;
      continue;
    }

    if (row.message_type === 'order' && !raw.order) {
      // order_sn อยู่ใน raw_message ตั้งแต่เวอร์ชันแรก — เผื่อไม่มี ดึงจากตัว content ที่เขียนไว้
      const orderSn = (raw.order_sn as string) || (row.content?.match(/\[คำสั่งซื้อ\s+([^\]]+)\]/)?.[1] ?? '');
      if (!orderSn) continue;
      const card = await resolveShopeeOrderCard(enrich, orderSn.trim());
      await supabaseAdmin
        .from('shopee_messages')
        .update({
          raw_message: { ...raw, order_sn: card.order_sn, order: card, ...(card.order_id ? { order_id: card.order_id } : {}) },
        })
        .eq('id', row.id);
      orders++;
    }
  }

  return { items, orders };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body.days) || 7, 1), 90);
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 1000);

  let companyFilter: string | null = body.company_id || null;
  if (!authorizeCron(request)) {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(companyRoles, 'masterdata.chat_channels')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    companyFilter = companyId;   // ผู้ใช้ทำได้เฉพาะบริษัทตัวเอง
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabaseAdmin
    .from('shopee_contacts')
    .select('id, company_id, conversation_id, marketplace_account_id, shop_id, display_name, last_message_at')
    .gte('last_message_at', cutoff)
    .order('last_message_at', { ascending: false })
    .limit(limit);
  if (companyFilter) query = query.eq('company_id', companyFilter);
  // cursor อยู่ที่ผู้เรียก (ไม่มี queue) — รอบถัดไปส่ง `before` ที่ได้จากรอบก่อนมา
  // ไม่งั้นรอบใหม่จะเริ่มที่ห้องเดิมทุกครั้งแล้วไม่มีวันเดินถึงห้องท้าย ๆ
  if (body.before) query = query.lt('last_message_at', String(body.before));

  const { data: contacts, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // โหลดร้านทีเดียว — หลายห้องสนทนาใช้ร้านเดียวกัน
  const accountCache = new Map<string, ShopeeAccountRow | null>();
  const enrichCache = new Map<string, ShopeeEnrichContext>();

  async function resolveAccount(c: ContactRow): Promise<ShopeeAccountRow | null> {
    const key = c.marketplace_account_id || `${c.company_id}:${c.shop_id}`;
    if (accountCache.has(key)) return accountCache.get(key)!;

    let account: ShopeeAccountRow | null = null;
    if (c.marketplace_account_id) {
      const { data } = await supabaseAdmin
        .from('marketplace_accounts').select('*')
        .eq('id', c.marketplace_account_id).eq('is_active', true).maybeSingle();
      account = (data as ShopeeAccountRow) || null;
    }
    if (!account) {
      const { data } = await supabaseAdmin
        .from('marketplace_accounts').select('*')
        .eq('company_id', c.company_id).eq('platform', 'shopee')
        .eq('shop_id', c.shop_id).eq('is_active', true).maybeSingle();
      account = (data as ShopeeAccountRow) || null;
    }
    accountCache.set(key, account);
    return account;
  }

  const result = {
    contacts_total: (contacts || []).length,
    contacts_processed: 0,
    contacts_skipped_no_account: 0,
    messages_inserted: 0,
    bundles_removed: 0,
    items_enriched: 0,
    orders_enriched: 0,
    remaining: 0,
    /** ส่งกลับมาเป็น `before` ในรอบถัดไปเพื่อไล่ต่อจากห้องที่ค้าง */
    next_before: null as string | null,
    days,
  };

  let lastSeenAt: string | null = null;

  for (const contact of (contacts || []) as ContactRow[]) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      // ผู้เรียกยิงซ้ำได้เลย — งานทั้งหมด idempotent (dedupe ด้วย shopee_message_id)
      result.remaining = result.contacts_total - result.contacts_processed - result.contacts_skipped_no_account;
      result.next_before = lastSeenAt;
      break;
    }
    lastSeenAt = contact.last_message_at;

    const account = await resolveAccount(contact);
    if (!account) {
      result.contacts_skipped_no_account++;
      continue;
    }

    // ถ้าห้องนี้เคยมีฟอง bundle ค้างอยู่ ให้ไล่ย้อนจนเจอข้อความย่อยของมันครบก่อน
    // (ข้อความชุดนั้นอาจเก่ากว่า 20 ใบล่าสุด — ดึงหน้าเดียวจะไม่ได้เนื้อ แล้วเราจะลบ
    //  ฟองทิ้งโดยที่ไม่มีอะไรมาแทน = ข้อมูลหายจริง ๆ)
    const { data: bundleRows } = await supabaseAdmin
      .from('shopee_messages')
      .select('raw_message')
      .eq('company_id', contact.company_id)
      .eq('shopee_contact_id', contact.id)
      .eq('message_type', 'bundle_message');
    const bundleTargets = (bundleRows || []).flatMap(r => {
      const ids = (r.raw_message as Record<string, unknown> | null)?.bundle_message_ids;
      return Array.isArray(ids) ? ids.map(String) : [];
    });

    // ฟอง bundle ที่บันทึกไว้ก่อนแก้นี้ไม่มี id ของข้อความย่อยเลย (raw_message = null)
    // — ไล่ 3 หน้าเผื่อไว้ ดีกว่าลบฟองทิ้งแล้วไม่ได้เนื้อมาแทน
    const pulled = await syncShopeeConversationMessages(account, contact, {
      pages: (bundleRows || []).length > 0 ? 3 : 1,
      pageSize: 20,
      targetMessageIds: bundleTargets.length > 0 ? bundleTargets : undefined,
    });
    result.messages_inserted += pulled.inserted;

    // ฟอง "[หลายข้อความ]" ไม่มีประโยชน์อีกแล้วเมื่อข้อความย่อยถูกดึงมาแล้ว
    const { data: removed } = await supabaseAdmin
      .from('shopee_messages')
      .delete()
      .eq('company_id', contact.company_id)
      .eq('shopee_contact_id', contact.id)
      .eq('message_type', 'bundle_message')
      .select('id');
    result.bundles_removed += (removed || []).length;

    if (!enrichCache.has(account.id)) enrichCache.set(account.id, createShopeeEnrichContext(account));
    const enriched = await reenrichCards(enrichCache.get(account.id)!, contact.id, contact.company_id);
    result.items_enriched += enriched.items;
    result.orders_enriched += enriched.orders;

    result.contacts_processed++;
  }

  // ทำครบทุกห้องที่ดึงมา แต่ query เต็ม limit พอดี = ยังมีห้องเก่ากว่านี้รออยู่
  if (!result.next_before && (contacts || []).length === limit && lastSeenAt) {
    result.next_before = lastSeenAt;
  }

  return NextResponse.json({ success: true, ...result, duration_ms: Date.now() - startedAt });
}
