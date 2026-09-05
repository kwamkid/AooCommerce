import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse, after } from 'next/server';
import { isLineBotProfileStale, refreshLineBotProfile } from '@/lib/chat/line-bot-profile';
import { buildMessagePreview } from '@/lib/chat/message-preview';

type ChatPlatform = 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok';

/**
 * ตารางแชททั้ง 5 แพลตฟอร์ม — โครงเหมือนกันหมด (company_id · status · chat_account_id
 * · unread_count · customer_id · last_message_at) จึงดึง/นับด้วยโค้ดชุดเดียวได้
 * ต่างกันแค่ชื่อตาราง · ชื่อ RPC · ชื่อคอลัมน์ที่ RPC ข้อความล่าสุดใช้ชี้กลับมาที่ contact
 *
 * ⚠️ **ทำไมต้อง limit ตอนดึงรายการ** — ของเดิมดึง "ทุกแชทของบริษัท" พร้อม join ลูกค้า
 * เต็มก้อน แล้วไปดึงข้อความล่าสุด + ออเดอร์ + แท็ก ของ **ทุกแถว** ก่อนจะ slice เอาแค่ 30
 * ร้านที่มี 3,004 แชท (ของจริง 4 ก.ย. 2026) จึงรอหลายวินาทีทุกครั้งที่เปิดหน้าแชท
 *
 * เอา "หัวตาราง N แถว" จากแต่ละแพลตฟอร์มมารวมแล้วตัด N แถวแรก **ได้ผลเท่ากับเรียงทั้งหมด
 * แล้วตัด** (ทุกตารางเรียงด้วย last_message_at เหมือนกัน) — ตัวที่ 31 ของแพลตฟอร์มใด
 * ก็ไม่มีทางแซงขึ้นมาอยู่ใน 30 อันดับแรกของภาพรวม
 *
 * แลกมาด้วยการที่ยอดรวมนับจากหน้าที่ดึงมาไม่ได้อีก → RPC get_chat_contact_totals นับให้ใน SQL
 */
const PLATFORMS: Record<ChatPlatform, {
  table: string;
  searchRpc: string;
  latestRpc: string;
  /** ชื่อคอลัมน์ที่ latestRpc ใช้ชี้กลับมาที่แถว contact */
  contactIdField: string;
}> = {
  line: { table: 'line_contacts', searchRpc: 'search_line_contacts', latestRpc: 'get_latest_line_messages', contactIdField: 'line_contact_id' },
  facebook: { table: 'fb_contacts', searchRpc: 'search_fb_contacts', latestRpc: 'get_latest_fb_messages', contactIdField: 'fb_contact_id' },
  shopee: { table: 'shopee_contacts', searchRpc: 'search_shopee_contacts', latestRpc: 'get_latest_shopee_messages', contactIdField: 'shopee_contact_id' },
  lazada: { table: 'lazada_contacts', searchRpc: 'search_lazada_contacts', latestRpc: 'get_latest_lazada_messages', contactIdField: 'lazada_contact_id' },
  tiktok: { table: 'tiktok_contacts', searchRpc: 'search_tiktok_contacts', latestRpc: 'get_latest_tiktok_messages', contactIdField: 'tiktok_contact_id' },
};

const PLATFORM_KEYS = Object.keys(PLATFORMS) as ChatPlatform[];

/** ฟิลด์ลูกค้าที่หน้าแชทใช้ — ตัวเดียวกันทั้งขา join และขาดึงเพิ่มให้ผลลัพธ์ค้นหา */
const CUSTOMER_FIELDS =
  'id, name, customer_code, contact_person, phone, email, ' +
  'customer_type, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code, ' +
  'tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active';

type UnifiedContact = {
  id: string;
  platform: ChatPlatform;
  source?: 'line' | 'facebook' | 'instagram' | 'shopee' | 'lazada' | 'tiktok';
  platform_user_id: string;
  display_name: string;
  picture_url?: string;
  status: string;
  customer_id?: string;
  customer?: Record<string, unknown>;
  unread_count: number;
  last_message_at?: string;
  last_message?: string | null;
  last_order_date?: string;
  last_order_created_at?: string;
  /** true = ข้อมูล "สั่งล่าสุด" ถูก enrich จาก orders จริงในรอบนี้
   *  false = ไม่ได้ enrich (รายการปกติ/ค้นหา) → ไม่มีค่า ≠ ไม่เคยสั่ง ห้ามให้ UI ขึ้น "ยังไม่เคยสั่ง" */
  order_stats_loaded?: boolean;
  avg_order_frequency?: number | null;
  chat_account_id?: string;
  account_name?: string;
  account_picture_url?: string;
  referral_source?: string;
  referral_ad_id?: string;
  referral_ad_title?: string;
  referral_data?: Record<string, unknown>;
  tags?: { id: string; name: string; color: string }[];
};

type ChatTag = { id: string; name: string; color: string };

// GET - Get unified contacts from all platforms
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(request.url);

    // Fast path: fetch linked contacts for a specific customer
    const customerId = searchParams.get('customer_id');
    if (customerId) {
      return await getLinkedContactsByCustomer(companyId, customerId);
    }

    const search = searchParams.get('search');
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const linkedOnly = searchParams.get('linked_only') === 'true';
    const unlinkedOnly = searchParams.get('unlinked_only') === 'true';
    const accountId = searchParams.get('account_id');
    const platform = searchParams.get('platform'); // 'line' | 'facebook' | ... | null (all)
    const tagId = searchParams.get('tag'); // filter by customer tag
    const orderDaysMin = searchParams.get('order_days_min');
    const orderDaysMax = searchParams.get('order_days_max');
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // ── รอบที่ 0: เฉพาะสิ่งที่ต้องรู้ "ก่อน" ถึงจะประกอบ query ของรอบที่ 1 ได้ ──
    // แท็ก = ต้องได้ id ก่อนถึงจะใส่เป็นตัวกรองของแต่ละแพลตฟอร์มได้
    // account_id = ต้องรู้ว่าบัญชีนั้นอยู่แพลตฟอร์มไหน ถึงจะรู้ว่าต้องยิงกี่ตาราง
    let tagCustomerIds: string[] | null = null;
    let tagContactIds: { id: string; platform: string }[] | null = null;
    let prefetchedAccounts: AccountRow[] | null = null;
    let includeNullAccountId = false;

    let queryPlatforms: ChatPlatform[] = platform
      ? PLATFORM_KEYS.filter(p => p === platform)
      : [...PLATFORM_KEYS];

    if (tagId || accountId) {
      const [custTagRes, contTagRes, accRes] = await Promise.all([
        tagId
          ? supabaseAdmin.from('customer_tag_links').select('customer_id').eq('tag_id', tagId)
          : Promise.resolve({ data: null, error: null }),
        tagId
          ? supabaseAdmin.from('contact_tag_links').select('contact_id, platform').eq('tag_id', tagId)
          : Promise.resolve({ data: null, error: null }),
        accountId
          ? supabaseAdmin.from('chat_accounts').select('id, account_name, platform, credentials').eq('company_id', companyId)
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (tagId) {
        const custIds = (custTagRes.data || []).map((l: { customer_id: string }) => l.customer_id);
        const contIds = (contTagRes.data || []).map((l: { contact_id: string; platform: string }) => ({ id: l.contact_id, platform: l.platform }));
        tagCustomerIds = custIds.length > 0 ? custIds : null;
        tagContactIds = contIds.length > 0 ? contIds : null;
        if (!tagCustomerIds && !tagContactIds) {
          return NextResponse.json({
            contacts: [],
            summary: { total: 0, totalUnread: 0, hasMore: false, offset, limit },
          });
        }
      }

      if (accountId) {
        const accounts = (accRes.data || []) as AccountRow[];
        prefetchedAccounts = accounts;
        const selectedAccount = accounts.find(a => a.id === accountId);
        if (selectedAccount) {
          queryPlatforms = PLATFORM_KEYS.filter(p => p === selectedAccount.platform);
          const samePlatformCount = accounts.filter(a => a.platform === selectedAccount.platform).length;
          includeNullAccountId = samePlatformCount === 1;
        }
      }
    }

    // ── ดึงมาแค่ "หัวตาราง" ของแต่ละแพลตฟอร์มพอ ──
    // ข้ามการจำกัดเมื่อมีตัวกรองที่ทำในหน่วยความจำหลังดึงข้อมูล (ค้นหา · แท็ก · ช่วงวันสั่งซื้อ)
    // เพราะการตัดแถวก่อนกรองจะทำให้ผลลัพธ์ขาด — เคสพวกนั้นชุดข้อมูลเล็กอยู่แล้ว
    const canLimit = !search && !tagId && !orderDaysMin;
    const fetchLimit = canLimit ? offset + limit + 1 : undefined;

    // Only force linkedOnly when tag filter matches customers only (no contact-level tags)
    const tagLinkedOnly = linkedOnly || (!!tagCustomerIds && !tagContactIds);

    // ── รอบที่ 1: ทุกอย่างที่ไม่ต้องรอผลของกันและกัน ยิงพร้อมกันหมด ──
    // (ทุก round trip ที่ต่อคิว = latency ทิ้งเปล่า — ตอนที่ function ยังอยู่ iad1 คือ ~220ms ต่อรอบ)
    const contactsPromise = Promise.all(
      queryPlatforms.map(p => fetchPlatformContacts(companyId, p, {
        search,
        unreadOnly,
        linkedOnly: tagLinkedOnly,
        unlinkedOnly,
        accountId,
        includeNullAccountId,
        customerIds: tagCustomerIds,
        contactIds: tagContactIds?.filter(t => t.platform === p).map(t => t.id) || null,
        fetchLimit,
      })),
    );

    const accountsPromise: Promise<AccountRow[]> = prefetchedAccounts
      ? Promise.resolve(prefetchedAccounts)
      : Promise.resolve(
          supabaseAdmin
            .from('chat_accounts')
            .select('id, account_name, platform, credentials')
            .eq('company_id', companyId),
        ).then(r => (r.data || []) as AccountRow[]);

    const [contactsByPlatform, accounts, shopsRes, tagsRes, totals] = await Promise.all([
      contactsPromise,
      accountsPromise,
      // ดึงร้าน marketplace ทั้งบริษัท (ไม่กรองด้วย id ที่ได้จาก accounts) เพื่อไม่ต้องรอ accounts ก่อน
      // — ร้านต่อบริษัทมีไม่กี่แถว การกรองไม่ได้ประหยัดอะไรเท่ากับที่เสียไปกับการต่อคิว
      supabaseAdmin.from('marketplace_accounts').select('id, metadata').eq('company_id', companyId),
      // แท็กทั้งบริษัท (ตารางเล็ก) — ของเดิมรอ tag_links ก่อนแล้วค่อยดึงแท็กตาม id ที่เจอ = อีก 1 รอบ
      supabaseAdmin.from('customer_tags').select('id, name, color').eq('company_id', companyId),
      // จำกัดแถวแล้ว = ยอดรวมนับจากของที่ดึงมาไม่ได้อีก → ให้ SQL นับให้
      canLimit
        ? supabaseAdmin.rpc('get_chat_contact_totals', {
            p_company_id: companyId,
            p_platforms: queryPlatforms,
            p_account_id: accountId || null,
            p_include_null_account: includeNullAccountId,
            p_unread_only: unreadOnly,
            p_linked_only: linkedOnly,
            p_unlinked_only: unlinkedOnly,
          })
        : Promise.resolve(null),
    ]);

    // โลโก้ร้าน marketplace อยู่ที่ marketplace_accounts ไม่ใช่ credentials ของ chat_accounts
    // supabase ไม่ throw — ต้องอ่าน error ที่คืนมาเอง (บทเรียน 2026-08-28)
    if (shopsRes.error) console.error('[chat/contacts] marketplace_accounts:', shopsRes.error.message);
    const shopLogos: Record<string, string> = {};
    for (const shop of shopsRes.data || []) {
      const logo = (shop.metadata as Record<string, unknown> | null)?.shop_logo;
      if (typeof logo === 'string' && logo) shopLogos[shop.id] = logo;
    }

    if (tagsRes.error) console.error('[chat/contacts] customer_tags:', tagsRes.error.message);
    const tagMap = new Map<string, ChatTag>();
    for (const t of (tagsRes.data || []) as ChatTag[]) tagMap.set(t.id, t);

    // Build account lookup
    const accountMap = new Map<string, { name: string; platform: string; picture_url?: string }>();
    const defaultAccountByPlatform = new Map<string, { name: string; platform: string; picture_url?: string }>();
    accounts.forEach(a => {
      const creds = (a.credentials || {}) as Record<string, string>;
      let picture_url: string | undefined;
      if (a.platform === 'line') {
        picture_url = creds.bot_picture_url || undefined;
        // รูป OA ตายเมื่อ OA เปลี่ยนรูป (URL เดิม 404) → เส้นนี้คือเส้นที่หน้าแชทวิ่งทุกครั้ง
        // ที่เปิด จึงเป็นที่ที่รูปจะกลับมาเองเร็วที่สุด · after() เพราะงานเบื้องหลังใน
        // route handler ที่ปล่อยลอยจะโดน Vercel freeze ทิ้ง
        if (isLineBotProfileStale(creds)) {
          after(() => refreshLineBotProfile(a.id, creds));
        }
      } else if (a.platform === 'facebook') {
        // Use permanent Graph API URL (CDN URLs from page_picture_url expire)
        const pageId = creds.page_id;
        picture_url = pageId
          ? `https://graph.facebook.com/${pageId}/picture?type=small`
          : (creds.page_picture_url || undefined);
      } else {
        // marketplace — โลโก้ร้านจริง · ไม่มีก็ปล่อย undefined ให้ UI ใช้ไอคอน platform เอง
        // (เคยยัด path ไอคอน platform เป็นรูป → ทุกร้านหน้าตาเหมือนกันหมด 2026-08-28)
        picture_url = shopLogos[creds.marketplace_account_id as string] || undefined;
      }
      const info = { name: a.account_name, platform: a.platform, picture_url };
      accountMap.set(a.id, info);
      // Keep first account per platform as default fallback
      if (!defaultAccountByPlatform.has(a.platform)) {
        defaultAccountByPlatform.set(a.platform, info);
      }
    });

    // ── Normalize เป็นรูปแบบเดียว (ฟิลด์ประจำตัวของแต่ละแพลตฟอร์มต่างกัน จึงแยกลูป) ──
    const rowsByPlatform = new Map<ChatPlatform, Record<string, any>[]>();
    queryPlatforms.forEach((p, i) => rowsByPlatform.set(p, contactsByPlatform[i] || []));

    const unified: UnifiedContact[] = [];

    const accountOf = (c: Record<string, any>, p: ChatPlatform) =>
      (c.chat_account_id ? accountMap.get(c.chat_account_id) : undefined) || defaultAccountByPlatform.get(p);

    /** ฟิลด์ที่ทุกแพลตฟอร์มมีเหมือนกัน */
    const commonFields = (c: Record<string, any>, p: ChatPlatform) => {
      const acc = accountOf(c, p);
      return {
        id: c.id as string,
        display_name: c.display_name as string,
        status: c.status as string,
        customer_id: c.customer_id as string | undefined,
        customer: c.customer as Record<string, unknown> | undefined,
        unread_count: (c.unread_count as number) || 0,
        last_message_at: c.last_message_at as string | undefined,
        chat_account_id: c.chat_account_id as string | undefined,
        account_name: acc?.name,
        account_picture_url: acc?.picture_url,
      };
    };

    for (const c of rowsByPlatform.get('line') || []) {
      unified.push({
        ...commonFields(c, 'line'),
        platform: 'line',
        platform_user_id: c.line_user_id,
        picture_url: c.picture_url,
      });
    }

    for (const c of rowsByPlatform.get('facebook') || []) {
      // Use proxy URL for FB/IG profile pictures (CDN URLs expire)
      const fbPictureUrl = c.chat_account_id
        ? `/api/chat/profile-picture?platform=${c.source === 'instagram' ? 'instagram' : 'facebook'}&psid=${c.fb_psid}&account_id=${c.chat_account_id}`
        : c.picture_url;
      unified.push({
        ...commonFields(c, 'facebook'),
        platform: 'facebook',
        source: c.source === 'instagram' ? 'instagram' : 'facebook',
        platform_user_id: c.fb_psid,
        picture_url: fbPictureUrl,
        referral_source: c.referral_source,
        referral_ad_id: c.referral_ad_id,
        referral_ad_title: c.referral_ad_title,
        referral_data: c.referral_data,
      });
    }

    for (const c of rowsByPlatform.get('lazada') || []) {
      unified.push({
        ...commonFields(c, 'lazada'),
        platform: 'lazada',
        source: 'lazada',
        platform_user_id: String(c.buyer_user_id || c.session_id),
        picture_url: c.picture_url,
      });
    }

    for (const c of rowsByPlatform.get('tiktok') || []) {
      unified.push({
        ...commonFields(c, 'tiktok'),
        platform: 'tiktok',
        source: 'tiktok',
        platform_user_id: String(c.buyer_user_id || c.conversation_id),
        picture_url: c.picture_url,
      });
    }

    for (const c of rowsByPlatform.get('shopee') || []) {
      unified.push({
        ...commonFields(c, 'shopee'),
        platform: 'shopee',
        source: 'shopee',
        platform_user_id: String(c.buyer_user_id),
        picture_url: c.picture_url,
      });
    }

    // ── กรอง "ช่วงวันที่สั่งล่าสุด" ต้องทำกับ **ทุกแถว** ก่อนตัดหน้า ──
    // (ตัดหน้าก่อนแล้วค่อยกรอง = หน้าหนึ่งเหลือ 3 แถวบ้าง 0 แถวบ้าง) โหมดนี้ canLimit = false อยู่แล้ว
    let orderStatsFetched = false;
    let orderStatsOk = false;
    if (orderDaysMin) {
      const allCustomerIds = [...new Set(unified.filter(c => c.customer_id).map(c => c.customer_id!))];
      const stats = await fetchOrderStats(companyId, allCustomerIds);
      orderStatsFetched = true;
      orderStatsOk = !stats.error;
      applyOrderStats(unified, stats.map);

      // กรองเมื่อ query สถิติสำเร็จ — ไม่ผูกกับ "มีใครมีออเดอร์ไหม" (ของเดิมข้ามการกรองเมื่อ
      // ไม่มีออเดอร์เลย ทั้งที่ช่วงแบบ "เกิน N วัน" ตั้งใจให้ลูกค้าที่ไม่เคยสั่งติดมาด้วย)
      // query พัง = กรองไม่ได้ → ส่งทั้งหมดพร้อม order_stats_loaded=false ดีกว่ากรองมั่ว
      if (!stats.error && linkedOnly) {
        const minDays = parseInt(orderDaysMin, 10);
        const maxDays = orderDaysMax ? parseInt(orderDaysMax, 10) : null;
        const minCutoffDate = new Date();
        minCutoffDate.setDate(minCutoffDate.getDate() - minDays);
        const minCutoffStr = minCutoffDate.toISOString().split('T')[0];

        let maxCutoffStr: string | null = null;
        if (maxDays !== null) {
          const maxCutoffDate = new Date();
          maxCutoffDate.setDate(maxCutoffDate.getDate() - maxDays);
          maxCutoffStr = maxCutoffDate.toISOString().split('T')[0];
        }

        const filtered = unified.filter(c => {
          if (!c.customer_id) return false;
          const lastOrder = c.last_order_date;
          if (!lastOrder) return maxDays === null;
          if (lastOrder >= minCutoffStr) return false;
          if (maxCutoffStr !== null && lastOrder < maxCutoffStr) return false;
          return true;
        });

        unified.length = 0;
        unified.push(...filtered);
      }
    }

    // Sort by last_message_at descending
    unified.sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });

    // จำกัดแถวแล้ว = `unified` เป็นแค่หัวตาราง ยอดรวมต้องเอาจากตัวนับแยก
    const totalsRow = readTotals(totals);
    const totalCount = totalsRow ? totalsRow.total : unified.length;
    const totalUnread = totalsRow ? totalsRow.totalUnread : unified.reduce((sum, c) => sum + c.unread_count, 0);
    const paged = unified.slice(offset, offset + limit);
    // ดึงมาเกินมา 1 แถวต่อแพลตฟอร์ม → เหลือเกินหน้าปัจจุบัน = ยังมีต่อ
    const hasMore = totalsRow ? unified.length > offset + limit : offset + limit < totalCount;

    // ── รอบที่ 2: enrich **เฉพาะแถวที่จะส่งกลับ** ──
    // ของเดิม enrich ทุกแถวที่ดึงมา (5 แพลตฟอร์ม × 31 แถว) ทั้งที่ส่งกลับแค่ 30
    const pagedCustomerIds = [...new Set(paged.filter(c => c.customer_id).map(c => c.customer_id!))];
    const pagedContactIds = [...new Set(paged.map(c => c.id))];

    // "สั่งล่าสุด" โผล่ในรายการเฉพาะตอนกรอง "ผูกลูกค้าแล้ว" — โหมดอื่นไม่ต้องจ่ายค่า query นี้
    // (แผงข้อมูลลูกค้าดึงของตัวเองผ่าน ?customer_id=)
    const needOrderStats = linkedOnly && !orderStatsFetched;

    const [latestMessages, custTagLinksRes, contTagLinksRes, pagedStats] = await Promise.all([
      fetchLatestMessages(companyId, paged),
      pagedCustomerIds.length > 0
        ? supabaseAdmin.from('customer_tag_links').select('customer_id, tag_id').in('customer_id', pagedCustomerIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      pagedContactIds.length > 0
        ? supabaseAdmin.from('contact_tag_links').select('contact_id, platform, tag_id').in('contact_id', pagedContactIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      needOrderStats ? fetchOrderStats(companyId, pagedCustomerIds) : Promise.resolve(null),
    ]);

    for (const contact of paged) {
      contact.last_message = latestMessages.get(`${contact.platform}:${contact.id}`) ?? null;
    }

    if (pagedStats) {
      orderStatsFetched = true;
      orderStatsOk = !pagedStats.error;
      applyOrderStats(paged, pagedStats.map);
    }
    // ไม่ได้ดึง (หรือดึงแล้วพัง) = "ไม่รู้" ห้ามให้ UI ตีความว่า "ยังไม่เคยสั่ง"
    const orderStatsLoaded = orderStatsFetched && orderStatsOk;
    for (const contact of paged) contact.order_stats_loaded = orderStatsLoaded;

    // ── แท็ก: ของลูกค้า + ของตัว contact เอง รวมกันแล้วตัดตัวซ้ำ ──
    if (custTagLinksRes.error) console.error('[chat/contacts] customer_tag_links:', custTagLinksRes.error.message);
    if (contTagLinksRes.error) console.error('[chat/contacts] contact_tag_links:', contTagLinksRes.error.message);
    const custTagLinks = (custTagLinksRes.data || []) as { customer_id: string; tag_id: string }[];
    const contTagLinks = (contTagLinksRes.data || []) as { contact_id: string; platform: string; tag_id: string }[];

    if (custTagLinks.length > 0 || contTagLinks.length > 0) {
      const customerTagMap = new Map<string, ChatTag[]>();
      custTagLinks.forEach(link => {
        const tag = tagMap.get(link.tag_id);
        if (link.customer_id && tag) {
          if (!customerTagMap.has(link.customer_id)) customerTagMap.set(link.customer_id, []);
          customerTagMap.get(link.customer_id)!.push(tag);
        }
      });

      const contactTagMap = new Map<string, ChatTag[]>();
      contTagLinks.forEach(link => {
        const key = `${link.contact_id}:${link.platform}`;
        const tag = tagMap.get(link.tag_id);
        if (tag) {
          if (!contactTagMap.has(key)) contactTagMap.set(key, []);
          contactTagMap.get(key)!.push(tag);
        }
      });

      for (const contact of paged) {
        const custTags = contact.customer_id ? (customerTagMap.get(contact.customer_id) || []) : [];
        const contTags = contactTagMap.get(`${contact.id}:${contact.platform}`) || [];
        if (custTags.length > 0 || contTags.length > 0) {
          const seen = new Set<string>();
          const merged: ChatTag[] = [];
          for (const t of [...custTags, ...contTags]) {
            if (!seen.has(t.id)) { seen.add(t.id); merged.push(t); }
          }
          contact.tags = merged;
        }
      }
    }

    return NextResponse.json({
      contacts: paged,
      summary: { total: totalCount, totalUnread, hasMore, offset, limit },
    });
  } catch (error) {
    console.error('Unified contacts GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Link/unlink customer
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id, platform, customer_id } = await request.json();
    if (!id || !platform) {
      return NextResponse.json({ error: 'id and platform are required' }, { status: 400 });
    }

    const table = PLATFORMS[platform as ChatPlatform]?.table || PLATFORMS.facebook.table;
    const { error } = await supabaseAdmin
      .from(table)
      .update({ customer_id: customer_id || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unified contacts PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

type AccountRow = { id: string; account_name: string; platform: string; credentials: Record<string, unknown> | null };

type ContactFilters = {
  search?: string | null;
  unreadOnly?: boolean;
  linkedOnly?: boolean;
  unlinkedOnly?: boolean;
  accountId?: string | null;
  includeNullAccountId?: boolean;
  customerIds?: string[] | null;
  contactIds?: string[] | null;
  /** ดึงมาแค่กี่แถวพอ — ดูเหตุผลที่ PLATFORMS ด้านบน */
  fetchLimit?: number;
};

/**
 * ดึงรายชื่อแชทของแพลตฟอร์มเดียว — **ไม่รวมข้อความล่าสุด**
 * (ข้อความล่าสุดดึงทีหลังเฉพาะแถวที่จะส่งกลับ ไม่ใช่ทุกแถวที่ดึงมา)
 */
async function fetchPlatformContacts(
  companyId: string,
  platform: ChatPlatform,
  filters: ContactFilters,
): Promise<Record<string, any>[]> {
  const cfg = PLATFORMS[platform];
  let contacts: Record<string, any>[];

  if (filters.search) {
    // Use RPC for search — single query searches both display_name and customer.name
    const { data, error } = await supabaseAdmin.rpc(cfg.searchRpc, {
      p_company_id: companyId,
      p_search: filters.search,
    });
    if (error) throw error;
    contacts = data || [];

    // Apply additional filters in-memory (RPC returns base results)
    if (filters.accountId) {
      contacts = contacts.filter(c =>
        c.chat_account_id === filters.accountId || (filters.includeNullAccountId && !c.chat_account_id)
      );
    }
    if (filters.unreadOnly) contacts = contacts.filter(c => (c.unread_count || 0) > 0);
    if (filters.linkedOnly) contacts = contacts.filter(c => c.customer_id);
    if (filters.unlinkedOnly) contacts = contacts.filter(c => !c.customer_id);
    // Tag filter
    if (filters.customerIds || filters.contactIds) {
      const custIdSet = filters.customerIds ? new Set(filters.customerIds) : null;
      const contIdSet = filters.contactIds ? new Set(filters.contactIds) : null;
      contacts = contacts.filter(c =>
        (custIdSet && c.customer_id && custIdSet.has(c.customer_id)) ||
        (contIdSet && contIdSet.has(c.id))
      );
    }
  } else {
    // Non-search: use Supabase query builder
    let query = supabaseAdmin
      .from(cfg.table)
      .select(`*, customer:customers(${CUSTOMER_FIELDS})`)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (filters.accountId) {
      if (filters.includeNullAccountId) {
        query = query.or(`chat_account_id.eq.${filters.accountId},chat_account_id.is.null`);
      } else {
        query = query.eq('chat_account_id', filters.accountId);
      }
    }
    if (filters.unreadOnly) query = query.gt('unread_count', 0);
    if (filters.customerIds && filters.contactIds && filters.contactIds.length > 0) {
      const custFilter = filters.customerIds.length > 0
        ? `customer_id.in.(${filters.customerIds.join(',')})`
        : '';
      const contFilter = `id.in.(${filters.contactIds.join(',')})`;
      query = query.or([custFilter, contFilter].filter(Boolean).join(','));
    } else if (filters.customerIds) {
      query = query.in('customer_id', filters.customerIds);
    } else if (filters.contactIds && filters.contactIds.length > 0) {
      query = query.in('id', filters.contactIds);
    } else {
      if (filters.linkedOnly) query = query.not('customer_id', 'is', null);
      if (filters.unlinkedOnly) query = query.is('customer_id', null);
    }

    // ⚠️ ต้องมี limit เสมอ — ดูเหตุผลที่ PLATFORMS
    if (filters.fetchLimit) query = query.limit(filters.fetchLimit);

    const { data, error } = await query;
    if (error) throw error;
    contacts = data || [];
  }

  // Fetch customer data for RPC results (RPC returns flat rows without joined customer)
  // อยู่ในโหมดค้นหาเท่านั้น และ RPC จำกัด 100 แถวแล้ว จึงยอมให้ต่อคิวอีกรอบได้
  if (filters.search && contacts.length > 0) {
    const custIds = [...new Set(contacts.filter(c => c.customer_id).map(c => c.customer_id))];
    if (custIds.length > 0) {
      const { data: custs, error } = await supabaseAdmin
        .from('customers')
        .select(CUSTOMER_FIELDS)
        .in('id', custIds);
      if (error) console.error(`[chat/contacts] ${cfg.table} customers:`, error.message);
      // CUSTOMER_FIELDS ประกอบเป็น string ตอน runtime → supabase อนุมานรูปแถวไม่ได้ ต้องบอกเอง
      const custRows = (custs || []) as unknown as { id: string }[];
      const custMap = new Map(custRows.map(c => [c.id, c]));
      for (const c of contacts) {
        if (c.customer_id) c.customer = custMap.get(c.customer_id) || null;
      }
    }
  }

  return contacts;
}

/**
 * ข้อความล่าสุดของแถวที่จะส่งกลับ — ยิง RPC เฉพาะแพลตฟอร์มที่มีแถวจริงในหน้านี้
 * key = `${platform}:${contactId}` เพราะ id ข้ามแพลตฟอร์มไม่การันตีว่าไม่ชนกัน
 */
async function fetchLatestMessages(
  companyId: string,
  contacts: UnifiedContact[],
): Promise<Map<string, string>> {
  const idsByPlatform = new Map<ChatPlatform, string[]>();
  for (const c of contacts) {
    if (!idsByPlatform.has(c.platform)) idsByPlatform.set(c.platform, []);
    idsByPlatform.get(c.platform)!.push(c.id);
  }

  const previews = new Map<string, string>();
  await Promise.all([...idsByPlatform.entries()].map(async ([platform, ids]) => {
    const cfg = PLATFORMS[platform];
    const { data, error } = await supabaseAdmin.rpc(cfg.latestRpc, {
      p_company_id: companyId,
      p_contact_ids: ids,
    });
    if (error) {
      console.error(`[chat/contacts] ${cfg.latestRpc}:`, error.message);
      return;
    }
    for (const msg of (data || [])) {
      previews.set(`${platform}:${msg[cfg.contactIdField]}`, buildMessagePreview(msg.message_type, msg.content));
    }
  }));

  return previews;
}

type OrderStatsRow = {
  customer_id: string;
  last_order_date: string | null;
  last_order_created_at: string | null;
  order_count: number;
  avg_gap_days: number | null;
};

/** สั่งล่าสุด/จำนวน/ความถี่เฉลี่ย — นับใน SQL (เดิมดึง orders ทุกใบมาคำนวณใน Node) */
async function fetchOrderStats(
  companyId: string,
  customerIds: string[],
): Promise<{ map: Map<string, OrderStatsRow>; error: boolean }> {
  const map = new Map<string, OrderStatsRow>();
  if (customerIds.length === 0) return { map, error: false };

  const { data, error } = await supabaseAdmin.rpc('get_chat_customer_order_stats', {
    p_company_id: companyId,
    p_customer_ids: customerIds,
  });
  // supabase ไม่ throw — ต้องอ่าน error ที่คืนมาเอง
  if (error) {
    console.error('[chat/contacts] get_chat_customer_order_stats:', error.message);
    return { map, error: true };
  }
  for (const row of (data || []) as OrderStatsRow[]) map.set(row.customer_id, row);
  return { map, error: false };
}

function applyOrderStats(contacts: UnifiedContact[], stats: Map<string, OrderStatsRow>) {
  for (const contact of contacts) {
    if (!contact.customer_id) continue;
    const s = stats.get(contact.customer_id);
    contact.last_order_date = s?.last_order_date || undefined;
    contact.last_order_created_at = s?.last_order_created_at || undefined;
    contact.avg_order_frequency = s?.avg_gap_days ?? null;
  }
}

/** RPC คืนแถวเดียวแต่มาในรูป array (set-returning) · bigint มาเป็นตัวเลข JSON แต่ coerce กันเหนียว */
function readTotals(res: { data: unknown; error: { message: string } | null } | null) {
  if (!res) return null;
  if (res.error) {
    console.error('[chat/contacts] get_chat_contact_totals:', res.error.message);
    return null;
  }
  const row = (Array.isArray(res.data) ? res.data[0] : res.data) as { total?: unknown; total_unread?: unknown } | undefined;
  if (!row) return null;
  return { total: Number(row.total) || 0, totalUnread: Number(row.total_unread) || 0 };
}

// Helper: fetch all linked contacts for a specific customer_id
async function getLinkedContactsByCustomer(companyId: string, customerId: string) {
  // ทุกอย่างในรอบเดียว — ไม่มีอะไรต้องรอผลของกันและกัน
  const [accountsRes, lineRes, fbRes, shopeeRes, lazadaRes, tiktokRes, stats] = await Promise.all([
    supabaseAdmin
      .from('chat_accounts')
      .select('id, account_name, platform')
      .eq('company_id', companyId),
    supabaseAdmin
      .from('line_contacts')
      .select('id, display_name, picture_url, last_message_at, chat_account_id')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('status', 'active'),
    supabaseAdmin
      .from('fb_contacts')
      .select('id, display_name, picture_url, last_message_at, chat_account_id, fb_psid, source')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('status', 'active'),
    supabaseAdmin
      .from('shopee_contacts')
      .select('id, display_name, picture_url, last_message_at, chat_account_id')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('status', 'active'),
    supabaseAdmin
      .from('lazada_contacts')
      .select('id, display_name, picture_url, last_message_at, chat_account_id')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('status', 'active'),
    supabaseAdmin
      .from('tiktok_contacts')
      .select('id, display_name, picture_url, last_message_at, chat_account_id')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('status', 'active'),
    // แผงข้อมูลลูกค้าในหน้าแชทเอา "สั่งล่าสุด/ความถี่" จากตรงนี้ — รายการแชทจึงไม่ต้องคำนวณให้ทุกแถว
    fetchOrderStats(companyId, [customerId]),
  ]);

  const accountMap = new Map<string, { name: string; platform: string }>();
  (accountsRes.data || []).forEach(a => accountMap.set(a.id, { name: a.account_name, platform: a.platform }));

  const linked: { id: string; platform: ChatPlatform; display_name: string; picture_url?: string; last_message_at?: string; account_name?: string }[] = [];

  (lineRes.data || []).forEach(c => {
    const acc = c.chat_account_id ? accountMap.get(c.chat_account_id) : null;
    linked.push({ id: c.id, platform: 'line', display_name: c.display_name, picture_url: c.picture_url, last_message_at: c.last_message_at, account_name: acc?.name });
  });

  (fbRes.data || []).forEach(c => {
    const acc = c.chat_account_id ? accountMap.get(c.chat_account_id) : null;
    const proxyUrl = c.chat_account_id
      ? `/api/chat/profile-picture?platform=${c.source === 'instagram' ? 'instagram' : 'facebook'}&psid=${c.fb_psid}&account_id=${c.chat_account_id}`
      : c.picture_url;
    linked.push({ id: c.id, platform: 'facebook', display_name: c.display_name, picture_url: proxyUrl, last_message_at: c.last_message_at, account_name: acc?.name });
  });

  (shopeeRes.data || []).forEach(c => {
    const acc = c.chat_account_id ? accountMap.get(c.chat_account_id) : null;
    linked.push({ id: c.id, platform: 'shopee', display_name: c.display_name, picture_url: c.picture_url, last_message_at: c.last_message_at, account_name: acc?.name });
  });

  (lazadaRes.data || []).forEach(c => {
    const acc = c.chat_account_id ? accountMap.get(c.chat_account_id) : null;
    linked.push({ id: c.id, platform: 'lazada', display_name: c.display_name, picture_url: c.picture_url, last_message_at: c.last_message_at, account_name: acc?.name });
  });

  (tiktokRes.data || []).forEach(c => {
    const acc = c.chat_account_id ? accountMap.get(c.chat_account_id) : null;
    linked.push({ id: c.id, platform: 'tiktok', display_name: c.display_name, picture_url: c.picture_url, last_message_at: c.last_message_at, account_name: acc?.name });
  });

  // Sort by last_message_at desc
  linked.sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });

  // null = ลูกค้ารายนี้ยังไม่มีออเดอร์ (ที่ไม่ถูกยกเลิก) — ส่งคีย์นี้เสมอ ผู้เรียกจะได้แยก
  // "ไม่มีออเดอร์" ออกจาก "ยังไม่รู้" ได้
  // query พัง = ไม่ส่งคีย์เลย (หน้าแชทดู `'order_stats' in data` แล้วตั้ง order_stats_loaded=false)
  // ถ้าส่ง null ไปแทน UI จะขึ้น "ยังไม่เคยสั่ง" ทั้งที่แค่ดึงไม่สำเร็จ
  if (stats.error) return NextResponse.json({ linked_contacts: linked });
  const s = stats.map.get(customerId);
  const order_stats = s
    ? {
        last_order_date: s.last_order_date,
        last_order_created_at: s.last_order_created_at,
        avg_order_frequency: s.avg_gap_days ?? null,
        order_count: Number(s.order_count) || 0,
      }
    : null;

  return NextResponse.json({ linked_contacts: linked, order_stats });
}
