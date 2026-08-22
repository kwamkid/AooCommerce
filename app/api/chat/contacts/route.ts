import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

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
    const platform = searchParams.get('platform'); // 'line' | 'facebook' | null (all)
    const tagId = searchParams.get('tag'); // filter by customer tag
    const orderDaysMin = searchParams.get('order_days_min');
    const orderDaysMax = searchParams.get('order_days_max');
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // If filtering by tag, pre-fetch customer IDs + contact IDs with that tag
    let tagCustomerIds: string[] | null = null;
    let tagContactIds: { id: string; platform: string }[] | null = null;
    if (tagId) {
      const [{ data: custTagLinks }, { data: contTagLinks }] = await Promise.all([
        supabaseAdmin.from('customer_tag_links').select('customer_id').eq('tag_id', tagId),
        supabaseAdmin.from('contact_tag_links').select('contact_id, platform').eq('tag_id', tagId),
      ]);
      const custIds = (custTagLinks || []).map(l => l.customer_id);
      const contIds = (contTagLinks || []).map(l => ({ id: l.contact_id, platform: l.platform }));
      tagCustomerIds = custIds.length > 0 ? custIds : null;
      tagContactIds = contIds.length > 0 ? contIds : null;
      if (!tagCustomerIds && !tagContactIds) {
        return NextResponse.json({
          contacts: [],
          summary: { total: 0, totalUnread: 0, hasMore: false, offset, limit },
        });
      }
    }

    // Determine which platforms to query (default: all)
    let queryLine = !platform || platform === 'line';
    let queryFb = !platform || platform === 'facebook';
    let queryShopee = !platform || platform === 'shopee';
    let queryLazada = !platform || platform === 'lazada';
    let queryTiktok = !platform || platform === 'tiktok';

    // We need accounts for account_id filtering — but we can start contacts queries in parallel
    // For account_id filtering, we fetch accounts first (fast query)
    let includeNullAccountId = false;
    let accountsPromise: Promise<any[]>;
    if (accountId) {
      // Need accounts now to determine platform filter
      const { data: accs } = await supabaseAdmin
        .from('chat_accounts')
        .select('id, account_name, platform, credentials')
        .eq('company_id', companyId);
      const accounts = accs || [];
      accountsPromise = Promise.resolve(accounts);
      const selectedAccount = accounts.find(a => a.id === accountId);
      if (selectedAccount) {
        queryLine = selectedAccount.platform === 'line';
        queryFb = selectedAccount.platform === 'facebook';
        queryShopee = selectedAccount.platform === 'shopee';
        queryLazada = selectedAccount.platform === 'lazada';
        queryTiktok = selectedAccount.platform === 'tiktok';
        const sameplatformCount = accounts.filter(a => a.platform === selectedAccount.platform).length;
        includeNullAccountId = sameplatformCount === 1;
      }
    } else {
      // No account_id filter — fetch accounts in parallel with contacts
      accountsPromise = Promise.resolve(
        supabaseAdmin
          .from('chat_accounts')
          .select('id, account_name, platform, credentials')
          .eq('company_id', companyId)
      ).then(r => r.data || []);
    }

    // Build parallel queries
    const tagLineContactIds = tagContactIds?.filter(t => t.platform === 'line').map(t => t.id) || null;
    const tagFbContactIds = tagContactIds?.filter(t => t.platform === 'facebook').map(t => t.id) || null;
    const tagShopeeContactIds = tagContactIds?.filter(t => t.platform === 'shopee').map(t => t.id) || null;
    const tagLazadaContactIds = tagContactIds?.filter(t => t.platform === 'lazada').map(t => t.id) || null;
    const tagTiktokContactIds = tagContactIds?.filter(t => t.platform === 'tiktok').map(t => t.id) || null;
    // Only force linkedOnly when tag filter matches customers only (no contact-level tags)
    const tagLinkedOnly = linkedOnly || (!!tagCustomerIds && !tagContactIds);
    const linePromise = queryLine ? fetchLineContacts(companyId, { search, unreadOnly, linkedOnly: tagLinkedOnly, unlinkedOnly, accountId, includeNullAccountId, customerIds: tagCustomerIds, contactIds: tagLineContactIds }) : Promise.resolve([]);
    const fbPromise = queryFb ? fetchFbContacts(companyId, { search, unreadOnly, linkedOnly: tagLinkedOnly, unlinkedOnly, accountId, includeNullAccountId, customerIds: tagCustomerIds, contactIds: tagFbContactIds }) : Promise.resolve([]);
    const shopeePromise = queryShopee ? fetchShopeeContacts(companyId, { search, unreadOnly, linkedOnly: tagLinkedOnly, unlinkedOnly, accountId, includeNullAccountId, customerIds: tagCustomerIds, contactIds: tagShopeeContactIds }) : Promise.resolve([]);
    const lazadaPromise = queryLazada ? fetchLazadaContacts(companyId, { search, unreadOnly, linkedOnly: tagLinkedOnly, unlinkedOnly, accountId, includeNullAccountId, customerIds: tagCustomerIds, contactIds: tagLazadaContactIds }) : Promise.resolve([]);
    const tiktokPromise = queryTiktok ? fetchTiktokContacts(companyId, { search, unreadOnly, linkedOnly: tagLinkedOnly, unlinkedOnly, accountId, includeNullAccountId, customerIds: tagCustomerIds, contactIds: tagTiktokContactIds }) : Promise.resolve([]);

    const [lineContacts, fbContacts, shopeeContacts, lazadaContacts, tiktokContacts, accounts] = await Promise.all([linePromise, fbPromise, shopeePromise, lazadaPromise, tiktokPromise, accountsPromise]);

    // Build account lookup
    const accountMap = new Map<string, { name: string; platform: string; picture_url?: string }>();
    const defaultAccountByPlatform = new Map<string, { name: string; platform: string; picture_url?: string }>();
    (accounts || []).forEach(a => {
      const creds = a.credentials as Record<string, string>;
      let picture_url: string | undefined;
      if (a.platform === 'line') {
        picture_url = creds.bot_picture_url || undefined;
      } else if (a.platform === 'facebook') {
        // Use permanent Graph API URL (CDN URLs from page_picture_url expire)
        const pageId = creds.page_id;
        picture_url = pageId
          ? `https://graph.facebook.com/${pageId}/picture?type=small`
          : (creds.page_picture_url || undefined);
      } else if (a.platform === 'shopee') {
        picture_url = '/marketplace/shopee.svg';
      } else if (a.platform === 'lazada') {
        picture_url = '/marketplace/lazada.svg';
      } else if (a.platform === 'tiktok') {
        picture_url = '/marketplace/tiktok_shop.svg';
      }
      const info = { name: a.account_name, platform: a.platform, picture_url };
      accountMap.set(a.id, info);
      // Keep first account per platform as default fallback
      if (!defaultAccountByPlatform.has(a.platform)) {
        defaultAccountByPlatform.set(a.platform, info);
      }
    });

    // Normalize to unified format
    type UnifiedContact = {
      id: string;
      platform: 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok';
      source?: 'line' | 'facebook' | 'instagram' | 'shopee' | 'lazada' | 'tiktok';
      platform_user_id: string;
      display_name: string;
      picture_url?: string;
      status: string;
      customer_id?: string;
      customer?: Record<string, unknown>;
      unread_count: number;
      last_message_at?: string;
      last_message?: string;
      last_order_date?: string;
      last_order_created_at?: string;
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

    const unified: UnifiedContact[] = [];

    for (const c of lineContacts) {
      const acc = (c.chat_account_id ? accountMap.get(c.chat_account_id) : undefined) || defaultAccountByPlatform.get('line');
      const cust = c.customer;
      unified.push({
        id: c.id,
        platform: 'line',
        platform_user_id: c.line_user_id,
        display_name: c.display_name,
        picture_url: c.picture_url,
        status: c.status,
        customer_id: c.customer_id,
        customer: cust,
        unread_count: c.unread_count || 0,
        last_message_at: c.last_message_at,
        last_message: c.last_message,
        last_order_date: c.last_order_date,
        last_order_created_at: c.last_order_created_at,
        avg_order_frequency: c.avg_order_frequency,
        chat_account_id: c.chat_account_id,
        account_name: acc?.name,
        account_picture_url: acc?.picture_url,
      });
    }

    for (const c of fbContacts) {
      const acc = (c.chat_account_id ? accountMap.get(c.chat_account_id) : undefined) || defaultAccountByPlatform.get('facebook');
      const cust2 = c.customer;
      // Use proxy URL for FB/IG profile pictures (CDN URLs expire)
      const fbPictureUrl = c.chat_account_id
        ? `/api/chat/profile-picture?platform=${c.source === 'instagram' ? 'instagram' : 'facebook'}&psid=${c.fb_psid}&account_id=${c.chat_account_id}`
        : c.picture_url;
      unified.push({
        id: c.id,
        platform: 'facebook',
        source: c.source === 'instagram' ? 'instagram' : 'facebook',
        platform_user_id: c.fb_psid,
        display_name: c.display_name,
        picture_url: fbPictureUrl,
        status: c.status,
        customer_id: c.customer_id,
        customer: cust2,
        unread_count: c.unread_count || 0,
        last_message_at: c.last_message_at,
        last_message: c.last_message,
        last_order_date: c.last_order_date,
        last_order_created_at: c.last_order_created_at,
        avg_order_frequency: c.avg_order_frequency,
        chat_account_id: c.chat_account_id,
        account_name: acc?.name,
        account_picture_url: acc?.picture_url,
        referral_source: c.referral_source,
        referral_ad_id: c.referral_ad_id,
        referral_ad_title: c.referral_ad_title,
        referral_data: c.referral_data,
      });
    }

    for (const c of lazadaContacts) {
      const acc = (c.chat_account_id ? accountMap.get(c.chat_account_id) : undefined) || defaultAccountByPlatform.get('lazada');
      unified.push({
        id: c.id,
        platform: 'lazada',
        source: 'lazada',
        platform_user_id: String(c.buyer_user_id || c.session_id),
        display_name: c.display_name,
        picture_url: c.picture_url,
        status: c.status,
        customer_id: c.customer_id,
        customer: c.customer,
        unread_count: c.unread_count || 0,
        last_message_at: c.last_message_at,
        last_message: c.last_message,
        last_order_date: c.last_order_date,
        last_order_created_at: c.last_order_created_at,
        avg_order_frequency: c.avg_order_frequency,
        chat_account_id: c.chat_account_id,
        account_name: acc?.name,
        account_picture_url: acc?.picture_url,
      });
    }

    for (const c of tiktokContacts) {
      const acc = (c.chat_account_id ? accountMap.get(c.chat_account_id) : undefined) || defaultAccountByPlatform.get('tiktok');
      unified.push({
        id: c.id,
        platform: 'tiktok',
        source: 'tiktok',
        platform_user_id: String(c.buyer_user_id || c.conversation_id),
        display_name: c.display_name,
        picture_url: c.picture_url,
        status: c.status,
        customer_id: c.customer_id,
        customer: c.customer,
        unread_count: c.unread_count || 0,
        last_message_at: c.last_message_at,
        last_message: c.last_message,
        last_order_date: c.last_order_date,
        last_order_created_at: c.last_order_created_at,
        avg_order_frequency: c.avg_order_frequency,
        chat_account_id: c.chat_account_id,
        account_name: acc?.name,
        account_picture_url: acc?.picture_url,
      });
    }

    for (const c of shopeeContacts) {
      const acc = (c.chat_account_id ? accountMap.get(c.chat_account_id) : undefined) || defaultAccountByPlatform.get('shopee');
      unified.push({
        id: c.id,
        platform: 'shopee',
        source: 'shopee',
        platform_user_id: String(c.buyer_user_id),
        display_name: c.display_name,
        picture_url: c.picture_url,
        status: c.status,
        customer_id: c.customer_id,
        customer: c.customer,
        unread_count: c.unread_count || 0,
        last_message_at: c.last_message_at,
        last_message: c.last_message,
        last_order_date: c.last_order_date,
        last_order_created_at: c.last_order_created_at,
        avg_order_frequency: c.avg_order_frequency,
        chat_account_id: c.chat_account_id,
        account_name: acc?.name,
        account_picture_url: acc?.picture_url,
      });
    }

    // Enrich with order stats + tags in parallel (they don't depend on each other)
    // Skip heavy orders enrichment during search (user is just looking for a contact)
    const customerIds = unified.filter(c => c.customer_id).map(c => c.customer_id!);
    const contactIdArr = [...new Set(unified.map(c => c.id))];

    // Fire all enrichment queries in parallel
    const [ordersResult, custTagLinksResult, contTagLinksResult] = await Promise.all([
      // Orders for linked contacts — skip during search for speed
      !search && customerIds.length > 0
        ? supabaseAdmin.from('orders').select('customer_id, order_date, created_at')
            .eq('company_id', companyId).in('customer_id', customerIds)
            .neq('order_status', 'cancelled').order('order_date', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      // Customer tag links
      customerIds.length > 0
        ? supabaseAdmin.from('customer_tag_links').select('customer_id, tag_id').in('customer_id', customerIds)
        : Promise.resolve({ data: [] as any[] }),
      // Contact tag links
      contactIdArr.length > 0
        ? supabaseAdmin.from('contact_tag_links').select('contact_id, platform, tag_id').in('contact_id', contactIdArr)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // Process order stats
    const orders = ordersResult.data || [];
    if (orders.length > 0) {
      const customerOrderMap = new Map<string, { lastOrderDate: string; lastOrderCreatedAt: string | null; orderDates: string[] }>();
      orders.forEach((order: any) => {
        if (!customerOrderMap.has(order.customer_id)) {
          customerOrderMap.set(order.customer_id, { lastOrderDate: order.order_date, lastOrderCreatedAt: order.created_at, orderDates: [] });
        }
        customerOrderMap.get(order.customer_id)!.orderDates.push(order.order_date);
      });

      for (const contact of unified) {
        if (!contact.customer_id) continue;
        const orderData = customerOrderMap.get(contact.customer_id);
        contact.last_order_date = orderData?.lastOrderDate || undefined;
        contact.last_order_created_at = orderData?.lastOrderCreatedAt || undefined;

        if (orderData && orderData.orderDates.length >= 2) {
          const sortedDates = orderData.orderDates.map(d => new Date(d).getTime()).sort((a, b) => a - b);
          let totalGap = 0;
          for (let i = 1; i < sortedDates.length; i++) {
            totalGap += (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
          }
          contact.avg_order_frequency = Math.round(totalGap / (sortedDates.length - 1));
        }
      }

      // Filter by order days range if specified
      if (orderDaysMin && linkedOnly) {
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

    // Process tags
    const custTagLinks = (custTagLinksResult.data || []) as any[];
    const contTagLinks = (contTagLinksResult.data || []) as any[];
    const allTagIds = new Set([
      ...custTagLinks.map(l => l.tag_id),
      ...contTagLinks.map(l => l.tag_id),
    ]);

    if (allTagIds.size > 0) {
      const { data: tags } = await supabaseAdmin
        .from('customer_tags')
        .select('id, name, color')
        .in('id', [...allTagIds]);

      const tagMap = new Map<string, { id: string; name: string; color: string }>();
      (tags || []).forEach((t: any) => tagMap.set(t.id, t));

      const customerTagMap = new Map<string, { id: string; name: string; color: string }[]>();
      custTagLinks.forEach(link => {
        const tag = tagMap.get(link.tag_id);
        if (link.customer_id && tag) {
          if (!customerTagMap.has(link.customer_id)) customerTagMap.set(link.customer_id, []);
          customerTagMap.get(link.customer_id)!.push(tag);
        }
      });

      const contactTagMap = new Map<string, { id: string; name: string; color: string }[]>();
      contTagLinks.forEach(link => {
        const key = `${link.contact_id}:${link.platform}`;
        const tag = tagMap.get(link.tag_id);
        if (tag) {
          if (!contactTagMap.has(key)) contactTagMap.set(key, []);
          contactTagMap.get(key)!.push(tag);
        }
      });

      for (const contact of unified) {
        const custTags = contact.customer_id ? (customerTagMap.get(contact.customer_id) || []) : [];
        const contTags = contactTagMap.get(`${contact.id}:${contact.platform}`) || [];
        if (custTags.length > 0 || contTags.length > 0) {
          const seen = new Set<string>();
          const merged: { id: string; name: string; color: string }[] = [];
          for (const t of [...custTags, ...contTags]) {
            if (!seen.has(t.id)) { seen.add(t.id); merged.push(t); }
          }
          (contact as any).tags = merged;
        }
      }
    }

    // Sort by last_message_at descending
    unified.sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });

    const totalCount = unified.length;
    const totalUnread = unified.reduce((sum, c) => sum + c.unread_count, 0);
    const paged = unified.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;

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

    const table = platform === 'line' ? 'line_contacts' : platform === 'shopee' ? 'shopee_contacts' : platform === 'lazada' ? 'lazada_contacts' : platform === 'tiktok' ? 'tiktok_contacts' : 'fb_contacts';
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

// Helper: fetch LINE contacts
async function fetchLineContacts(companyId: string, filters: {
  search?: string | null; unreadOnly?: boolean; linkedOnly?: boolean;
  unlinkedOnly?: boolean; accountId?: string | null; includeNullAccountId?: boolean;
  customerIds?: string[] | null; contactIds?: string[] | null;
}) {
  let contacts: any[];

  if (filters.search) {
    // Use RPC for search — single query searches both display_name and customer.name
    const { data, error } = await supabaseAdmin.rpc('search_line_contacts', {
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
      .from('line_contacts')
      .select(`
        *,
        customer:customers(
          id, name, customer_code, contact_person, phone, email,
          customer_type, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code,
          tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active
        )
      `)
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

    const { data, error } = await query;
    if (error) throw error;
    contacts = data || [];
  }

  // Fetch customer data for RPC results (RPC returns flat rows without joined customer)
  if (filters.search && contacts.length > 0) {
    const custIds = [...new Set(contacts.filter(c => c.customer_id).map(c => c.customer_id))];
    if (custIds.length > 0) {
      const { data: custs } = await supabaseAdmin
        .from('customers')
        .select('id, name, customer_code, contact_person, phone, email, customer_type, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code, tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active')
        .in('id', custIds);
      const custMap = new Map((custs || []).map(c => [c.id, c]));
      for (const c of contacts) {
        if (c.customer_id) c.customer = custMap.get(c.customer_id) || null;
      }
    }
  }

  const contactIds = contacts.map(c => c.id);

  // Get last message preview — single batch query using RPC with DISTINCT ON
  const lastMessageMap = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: msgs } = await supabaseAdmin.rpc('get_latest_line_messages', {
      p_company_id: companyId,
      p_contact_ids: contactIds,
    });
    for (const msg of (msgs || [])) {
      let preview = msg.content;
      if (msg.message_type === 'sticker') preview = '🎭 สติกเกอร์';
      else if (msg.message_type === 'image') preview = '🖼️ รูปภาพ';
      else if (msg.message_type === 'video') preview = '🎬 วิดีโอ';
      else if (msg.message_type === 'audio') preview = '🎵 เสียง';
      else if (msg.message_type === 'location') preview = '📍 ตำแหน่ง';
      else if (msg.message_type === 'file') preview = '📎 ไฟล์';
      lastMessageMap.set(msg.line_contact_id, preview);
    }
  }

  return contacts.map(c => ({
    ...c,
    last_message: lastMessageMap.get(c.id) || null,
  }));
}

// Helper: fetch FB contacts
async function fetchFbContacts(companyId: string, filters: {
  search?: string | null; unreadOnly?: boolean; linkedOnly?: boolean;
  unlinkedOnly?: boolean; accountId?: string | null; includeNullAccountId?: boolean;
  customerIds?: string[] | null; contactIds?: string[] | null;
}) {
  let contacts: any[];

  if (filters.search) {
    // Use RPC for search — single query searches both display_name and customer.name
    const { data, error } = await supabaseAdmin.rpc('search_fb_contacts', {
      p_company_id: companyId,
      p_search: filters.search,
    });
    if (error) throw error;
    contacts = data || [];

    // Apply additional filters in-memory
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
      .from('fb_contacts')
      .select(`
        *,
        customer:customers(
          id, name, customer_code, contact_person, phone, email,
          customer_type, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code,
          tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active
        )
      `)
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

    const { data, error } = await query;
    if (error) throw error;
    contacts = data || [];
  }

  // Fetch customer data for RPC results (RPC returns flat rows without joined customer)
  if (filters.search && contacts.length > 0) {
    const custIds = [...new Set(contacts.filter(c => c.customer_id).map(c => c.customer_id))];
    if (custIds.length > 0) {
      const { data: custs } = await supabaseAdmin
        .from('customers')
        .select('id, name, customer_code, contact_person, phone, email, customer_type, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code, tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active')
        .in('id', custIds);
      const custMap = new Map((custs || []).map(c => [c.id, c]));
      for (const c of contacts) {
        if (c.customer_id) c.customer = custMap.get(c.customer_id) || null;
      }
    }
  }

  const contactIds = contacts.map(c => c.id);

  // Get last message preview — single batch query using RPC with DISTINCT ON
  const lastMessageMap = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: msgs } = await supabaseAdmin.rpc('get_latest_fb_messages', {
      p_company_id: companyId,
      p_contact_ids: contactIds,
    });
    for (const msg of (msgs || [])) {
      let preview = msg.content;
      if (msg.message_type === 'image') preview = '🖼️ รูปภาพ';
      else if (msg.message_type === 'video') preview = '🎬 วิดีโอ';
      else if (msg.message_type === 'audio') preview = '🎵 เสียง';
      else if (msg.message_type === 'file') preview = '📎 ไฟล์';
      lastMessageMap.set(msg.fb_contact_id, preview);
    }
  }

  return contacts.map(c => ({
    ...c,
    last_message: lastMessageMap.get(c.id) || null,
  }));
}

// Helper: fetch Shopee contacts
async function fetchShopeeContacts(companyId: string, filters: {
  search?: string | null; unreadOnly?: boolean; linkedOnly?: boolean;
  unlinkedOnly?: boolean; accountId?: string | null; includeNullAccountId?: boolean;
  customerIds?: string[] | null; contactIds?: string[] | null;
}) {
  let contacts: any[];

  if (filters.search) {
    // Use RPC for search — single query searches both display_name and customer.name
    const { data, error } = await supabaseAdmin.rpc('search_shopee_contacts', {
      p_company_id: companyId,
      p_search: filters.search,
    });
    if (error) throw error;
    contacts = data || [];

    // Apply additional filters in-memory
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
      .from('shopee_contacts')
      .select(`
        *,
        customer:customers(
          id, name, customer_code, contact_person, phone, email,
          customer_type, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code,
          tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active
        )
      `)
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

    const { data, error } = await query;
    if (error) throw error;
    contacts = data || [];
  }

  // Fetch customer data for RPC results (RPC returns flat rows without joined customer)
  if (filters.search && contacts.length > 0) {
    const custIds = [...new Set(contacts.filter(c => c.customer_id).map(c => c.customer_id))];
    if (custIds.length > 0) {
      const { data: custs } = await supabaseAdmin
        .from('customers')
        .select('id, name, customer_code, contact_person, phone, email, customer_type, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code, tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active')
        .in('id', custIds);
      const custMap = new Map((custs || []).map(c => [c.id, c]));
      for (const c of contacts) {
        if (c.customer_id) c.customer = custMap.get(c.customer_id) || null;
      }
    }
  }

  const contactIds = contacts.map(c => c.id);

  // Get last message preview — single batch query using RPC with DISTINCT ON
  const lastMessageMap = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: msgs } = await supabaseAdmin.rpc('get_latest_shopee_messages', {
      p_company_id: companyId,
      p_contact_ids: contactIds,
    });
    for (const msg of (msgs || [])) {
      let preview = msg.content;
      if (msg.message_type === 'sticker') preview = '🎭 สติกเกอร์';
      else if (msg.message_type === 'image') preview = '🖼️ รูปภาพ';
      else if (msg.message_type === 'video') preview = '🎬 วิดีโอ';
      else if (msg.message_type === 'item') preview = '🛍️ สินค้า';
      else if (msg.message_type === 'order') preview = '📦 คำสั่งซื้อ';
      lastMessageMap.set(msg.shopee_contact_id, preview);
    }
  }

  return contacts.map(c => ({
    ...c,
    last_message: lastMessageMap.get(c.id) || null,
  }));
}

// Helper: fetch Lazada contacts
async function fetchLazadaContacts(companyId: string, filters: {
  search?: string | null; unreadOnly?: boolean; linkedOnly?: boolean;
  unlinkedOnly?: boolean; accountId?: string | null; includeNullAccountId?: boolean;
  customerIds?: string[] | null; contactIds?: string[] | null;
}) {
  let contacts: any[];

  if (filters.search) {
    const { data, error } = await supabaseAdmin.rpc('search_lazada_contacts', {
      p_company_id: companyId,
      p_search: filters.search,
    });
    if (error) throw error;
    contacts = data || [];

    if (filters.accountId) {
      contacts = contacts.filter(c =>
        c.chat_account_id === filters.accountId || (filters.includeNullAccountId && !c.chat_account_id)
      );
    }
    if (filters.unreadOnly) contacts = contacts.filter(c => (c.unread_count || 0) > 0);
    if (filters.linkedOnly) contacts = contacts.filter(c => c.customer_id);
    if (filters.unlinkedOnly) contacts = contacts.filter(c => !c.customer_id);
    if (filters.customerIds || filters.contactIds) {
      const custIdSet = filters.customerIds ? new Set(filters.customerIds) : null;
      const contIdSet = filters.contactIds ? new Set(filters.contactIds) : null;
      contacts = contacts.filter(c =>
        (custIdSet && c.customer_id && custIdSet.has(c.customer_id)) ||
        (contIdSet && contIdSet.has(c.id))
      );
    }
  } else {
    let query = supabaseAdmin
      .from('lazada_contacts')
      .select(`
        *,
        customer:customers(
          id, name, customer_code, contact_person, phone, email,
          customer_type, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code,
          tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active
        )
      `)
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

    const { data, error } = await query;
    if (error) throw error;
    contacts = data || [];
  }

  // Fetch customer data for RPC results
  if (filters.search && contacts.length > 0) {
    const custIds = [...new Set(contacts.filter(c => c.customer_id).map(c => c.customer_id))];
    if (custIds.length > 0) {
      const { data: custs } = await supabaseAdmin
        .from('customers')
        .select('id, name, customer_code, contact_person, phone, email, customer_type, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code, tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active')
        .in('id', custIds);
      const custMap = new Map((custs || []).map(c => [c.id, c]));
      for (const c of contacts) {
        if (c.customer_id) c.customer = custMap.get(c.customer_id) || null;
      }
    }
  }

  const contactIds = contacts.map(c => c.id);

  const lastMessageMap = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: msgs } = await supabaseAdmin.rpc('get_latest_lazada_messages', {
      p_company_id: companyId,
      p_contact_ids: contactIds,
    });
    for (const msg of (msgs || [])) {
      let preview = msg.content;
      if (msg.message_type === 'image') preview = '🖼️ รูปภาพ';
      else if (msg.message_type === 'video') preview = '🎬 วิดีโอ';
      else if (msg.message_type === 'item') preview = '🛍️ สินค้า';
      else if (msg.message_type === 'order') preview = '📦 คำสั่งซื้อ';
      else if (msg.message_type === 'voucher') preview = '🎟️ คูปอง';
      lastMessageMap.set(msg.lazada_contact_id, preview);
    }
  }

  return contacts.map(c => ({
    ...c,
    last_message: lastMessageMap.get(c.id) || null,
  }));
}

// Helper: fetch TikTok contacts
async function fetchTiktokContacts(companyId: string, filters: {
  search?: string | null; unreadOnly?: boolean; linkedOnly?: boolean;
  unlinkedOnly?: boolean; accountId?: string | null; includeNullAccountId?: boolean;
  customerIds?: string[] | null; contactIds?: string[] | null;
}) {
  let contacts: any[];

  if (filters.search) {
    const { data, error } = await supabaseAdmin.rpc('search_tiktok_contacts', {
      p_company_id: companyId,
      p_search: filters.search,
    });
    if (error) throw error;
    contacts = data || [];

    if (filters.accountId) {
      contacts = contacts.filter(c =>
        c.chat_account_id === filters.accountId || (filters.includeNullAccountId && !c.chat_account_id)
      );
    }
    if (filters.unreadOnly) contacts = contacts.filter(c => (c.unread_count || 0) > 0);
    if (filters.linkedOnly) contacts = contacts.filter(c => c.customer_id);
    if (filters.unlinkedOnly) contacts = contacts.filter(c => !c.customer_id);
    if (filters.customerIds || filters.contactIds) {
      const custIdSet = filters.customerIds ? new Set(filters.customerIds) : null;
      const contIdSet = filters.contactIds ? new Set(filters.contactIds) : null;
      contacts = contacts.filter(c =>
        (custIdSet && c.customer_id && custIdSet.has(c.customer_id)) ||
        (contIdSet && contIdSet.has(c.id))
      );
    }
  } else {
    let query = supabaseAdmin
      .from('tiktok_contacts')
      .select(`
        *,
        customer:customers(
          id, name, customer_code, contact_person, phone, email,
          customer_type, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code,
          tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active
        )
      `)
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

    const { data, error } = await query;
    if (error) throw error;
    contacts = data || [];
  }

  // Fetch customer data for RPC results
  if (filters.search && contacts.length > 0) {
    const custIds = [...new Set(contacts.filter(c => c.customer_id).map(c => c.customer_id))];
    if (custIds.length > 0) {
      const { data: custs } = await supabaseAdmin
        .from('customers')
        .select('id, name, customer_code, contact_person, phone, email, customer_type, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code, tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active')
        .in('id', custIds);
      const custMap = new Map((custs || []).map(c => [c.id, c]));
      for (const c of contacts) {
        if (c.customer_id) c.customer = custMap.get(c.customer_id) || null;
      }
    }
  }

  const contactIds = contacts.map(c => c.id);

  const lastMessageMap = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: msgs } = await supabaseAdmin.rpc('get_latest_tiktok_messages', {
      p_company_id: companyId,
      p_contact_ids: contactIds,
    });
    for (const msg of (msgs || [])) {
      let preview = msg.content;
      if (msg.message_type === 'image') preview = '🖼️ รูปภาพ';
      else if (msg.message_type === 'video') preview = '🎬 วิดีโอ';
      else if (msg.message_type === 'item') preview = '🛍️ สินค้า';
      else if (msg.message_type === 'order') preview = '📦 คำสั่งซื้อ';
      else if (msg.message_type === 'voucher') preview = '🎟️ คูปอง';
      lastMessageMap.set(msg.tiktok_contact_id, preview);
    }
  }

  return contacts.map(c => ({
    ...c,
    last_message: lastMessageMap.get(c.id) || null,
  }));
}

// Helper: fetch all linked contacts for a specific customer_id
async function getLinkedContactsByCustomer(companyId: string, customerId: string) {
  // Fetch accounts for name mapping
  const { data: accounts } = await supabaseAdmin
    .from('chat_accounts')
    .select('id, account_name, platform')
    .eq('company_id', companyId);

  const accountMap = new Map<string, { name: string; platform: string }>();
  (accounts || []).forEach(a => accountMap.set(a.id, { name: a.account_name, platform: a.platform }));

  // Query all tables in parallel
  const [{ data: lineData }, { data: fbData }, { data: shopeeData }, { data: lazadaData }, { data: tiktokData }] = await Promise.all([
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
  ]);

  const linked: { id: string; platform: 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok'; display_name: string; picture_url?: string; last_message_at?: string; account_name?: string }[] = [];

  (lineData || []).forEach(c => {
    const acc = c.chat_account_id ? accountMap.get(c.chat_account_id) : null;
    linked.push({ id: c.id, platform: 'line', display_name: c.display_name, picture_url: c.picture_url, last_message_at: c.last_message_at, account_name: acc?.name });
  });

  (fbData || []).forEach(c => {
    const acc = c.chat_account_id ? accountMap.get(c.chat_account_id) : null;
    const proxyUrl = c.chat_account_id
      ? `/api/chat/profile-picture?platform=${c.source === 'instagram' ? 'instagram' : 'facebook'}&psid=${c.fb_psid}&account_id=${c.chat_account_id}`
      : c.picture_url;
    linked.push({ id: c.id, platform: 'facebook', display_name: c.display_name, picture_url: proxyUrl, last_message_at: c.last_message_at, account_name: acc?.name });
  });

  (shopeeData || []).forEach(c => {
    const acc = c.chat_account_id ? accountMap.get(c.chat_account_id) : null;
    linked.push({ id: c.id, platform: 'shopee', display_name: c.display_name, picture_url: c.picture_url, last_message_at: c.last_message_at, account_name: acc?.name });
  });

  (lazadaData || []).forEach(c => {
    const acc = c.chat_account_id ? accountMap.get(c.chat_account_id) : null;
    linked.push({ id: c.id, platform: 'lazada', display_name: c.display_name, picture_url: c.picture_url, last_message_at: c.last_message_at, account_name: acc?.name });
  });

  (tiktokData || []).forEach(c => {
    const acc = c.chat_account_id ? accountMap.get(c.chat_account_id) : null;
    linked.push({ id: c.id, platform: 'tiktok', display_name: c.display_name, picture_url: c.picture_url, last_message_at: c.last_message_at, account_name: acc?.name });
  });

  // Sort by last_message_at desc
  linked.sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });

  return NextResponse.json({ linked_contacts: linked });
}
