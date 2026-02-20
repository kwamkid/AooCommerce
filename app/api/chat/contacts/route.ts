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
    const orderDaysMin = searchParams.get('order_days_min');
    const orderDaysMax = searchParams.get('order_days_max');
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Fetch chat accounts first (needed for account_id lookup and name mapping)
    const { data: accounts } = await supabaseAdmin
      .from('chat_accounts')
      .select('id, account_name, platform, credentials')
      .eq('company_id', companyId);

    // Determine which platforms to query
    let queryLine = !platform || platform === 'line';
    let queryFb = !platform || platform === 'facebook';

    // If filtering by account_id, only query the matching platform
    let includeNullAccountId = false;
    if (accountId && accounts) {
      const selectedAccount = accounts.find(a => a.id === accountId);
      if (selectedAccount) {
        queryLine = selectedAccount.platform === 'line';
        queryFb = selectedAccount.platform === 'facebook';
        // Include contacts with null chat_account_id if this is the only account for its platform
        const sameplatformCount = accounts.filter(a => a.platform === selectedAccount.platform).length;
        includeNullAccountId = sameplatformCount === 1;
      }
    }

    // Build parallel queries
    const linePromise = queryLine ? fetchLineContacts(companyId, { search, unreadOnly, linkedOnly, unlinkedOnly, accountId, includeNullAccountId }) : Promise.resolve([]);
    const fbPromise = queryFb ? fetchFbContacts(companyId, { search, unreadOnly, linkedOnly, unlinkedOnly, accountId, includeNullAccountId }) : Promise.resolve([]);

    const [lineContacts, fbContacts] = await Promise.all([linePromise, fbPromise]);

    // Build account lookup
    const accountMap = new Map<string, { name: string; platform: string; picture_url?: string }>();
    const defaultAccountByPlatform = new Map<string, { name: string; platform: string; picture_url?: string }>();
    (accounts || []).forEach(a => {
      const creds = a.credentials as Record<string, string>;
      let picture_url: string | undefined;
      if (a.platform === 'line') {
        picture_url = creds.bot_picture_url || undefined;
      } else if (a.platform === 'facebook') {
        picture_url = creds.page_picture_url || undefined;
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
      platform: 'line' | 'facebook';
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
    };

    const unified: UnifiedContact[] = [];

    for (const c of lineContacts) {
      const acc = (c.chat_account_id ? accountMap.get(c.chat_account_id) : undefined) || defaultAccountByPlatform.get('line');
      unified.push({
        id: c.id,
        platform: 'line',
        platform_user_id: c.line_user_id,
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

    for (const c of fbContacts) {
      const acc = (c.chat_account_id ? accountMap.get(c.chat_account_id) : undefined) || defaultAccountByPlatform.get('facebook');
      unified.push({
        id: c.id,
        platform: 'facebook',
        platform_user_id: c.fb_psid,
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

    // Enrich with order stats for linked contacts
    const customerIds = unified
      .filter(c => c.customer_id)
      .map(c => c.customer_id!);

    if (customerIds.length > 0) {
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('customer_id, order_date, created_at')
        .eq('company_id', companyId)
        .in('customer_id', customerIds)
        .neq('order_status', 'cancelled')
        .order('order_date', { ascending: false });

      const customerOrderMap = new Map<string, { lastOrderDate: string; lastOrderCreatedAt: string | null; orderDates: string[] }>();
      (orders || []).forEach(order => {
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

        // Replace unified with filtered
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

    const table = platform === 'line' ? 'line_contacts' : 'fb_contacts';
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
}) {
  let query = supabaseAdmin
    .from('line_contacts')
    .select(`
      *,
      customer:customers(
        id, name, customer_code, contact_person, phone, email,
        customer_type_new, address, district, amphoe, province, postal_code,
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
  if (filters.search) {
    query = query.ilike('display_name', `%${filters.search}%`);
  }
  if (filters.unreadOnly) query = query.gt('unread_count', 0);
  if (filters.linkedOnly) query = query.not('customer_id', 'is', null);
  if (filters.unlinkedOnly) query = query.is('customer_id', null);

  const { data, error } = await query;
  if (error) throw error;

  let contacts = data || [];

  // Also search by linked customer name (Supabase .or() doesn't support foreign table fields)
  if (filters.search) {
    let customerQuery = supabaseAdmin
      .from('line_contacts')
      .select(`
        *,
        customer:customers!inner(
          id, name, customer_code, contact_person, phone, email,
          customer_type_new, address, district, amphoe, province, postal_code,
          tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active
        )
      `)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .ilike('customer.name', `%${filters.search}%`)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (filters.accountId) {
      if (filters.includeNullAccountId) {
        customerQuery = customerQuery.or(`chat_account_id.eq.${filters.accountId},chat_account_id.is.null`);
      } else {
        customerQuery = customerQuery.eq('chat_account_id', filters.accountId);
      }
    }
    if (filters.unreadOnly) customerQuery = customerQuery.gt('unread_count', 0);
    if (filters.linkedOnly) customerQuery = customerQuery.not('customer_id', 'is', null);
    if (filters.unlinkedOnly) customerQuery = customerQuery.is('customer_id', null);

    const { data: customerResults } = await customerQuery;
    if (customerResults && customerResults.length > 0) {
      const existingIds = new Set(contacts.map(c => c.id));
      for (const c of customerResults) {
        if (!existingIds.has(c.id)) contacts.push(c);
      }
    }
  }

  const contactIds = contacts.map(c => c.id);

  // Get last message preview
  const lastMessageMap = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: msgs } = await supabaseAdmin
      .from('line_messages')
      .select('line_contact_id, content, message_type')
      .eq('company_id', companyId)
      .in('line_contact_id', contactIds)
      .order('created_at', { ascending: false })
      .limit(contactIds.length * 3);

    (msgs || []).forEach(msg => {
      if (!lastMessageMap.has(msg.line_contact_id)) {
        let preview = msg.content;
        if (msg.message_type === 'sticker') preview = '🎭 สติกเกอร์';
        else if (msg.message_type === 'image') preview = '🖼️ รูปภาพ';
        else if (msg.message_type === 'video') preview = '🎬 วิดีโอ';
        else if (msg.message_type === 'audio') preview = '🎵 เสียง';
        else if (msg.message_type === 'location') preview = '📍 ตำแหน่ง';
        else if (msg.message_type === 'file') preview = '📎 ไฟล์';
        lastMessageMap.set(msg.line_contact_id, preview);
      }
    });
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
}) {
  let query = supabaseAdmin
    .from('fb_contacts')
    .select(`
      *,
      customer:customers(
        id, name, customer_code, contact_person, phone, email,
        customer_type_new, address, district, amphoe, province, postal_code,
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
  if (filters.search) {
    query = query.ilike('display_name', `%${filters.search}%`);
  }
  if (filters.unreadOnly) query = query.gt('unread_count', 0);
  if (filters.linkedOnly) query = query.not('customer_id', 'is', null);
  if (filters.unlinkedOnly) query = query.is('customer_id', null);

  const { data, error } = await query;
  if (error) throw error;

  let contacts = data || [];

  // Also search by linked customer name (Supabase .or() doesn't support foreign table fields)
  if (filters.search) {
    let customerQuery = supabaseAdmin
      .from('fb_contacts')
      .select(`
        *,
        customer:customers!inner(
          id, name, customer_code, contact_person, phone, email,
          customer_type_new, address, district, amphoe, province, postal_code,
          tax_id, tax_company_name, tax_branch, credit_limit, credit_days, notes, is_active
        )
      `)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .ilike('customer.name', `%${filters.search}%`)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (filters.accountId) {
      if (filters.includeNullAccountId) {
        customerQuery = customerQuery.or(`chat_account_id.eq.${filters.accountId},chat_account_id.is.null`);
      } else {
        customerQuery = customerQuery.eq('chat_account_id', filters.accountId);
      }
    }
    if (filters.unreadOnly) customerQuery = customerQuery.gt('unread_count', 0);
    if (filters.linkedOnly) customerQuery = customerQuery.not('customer_id', 'is', null);
    if (filters.unlinkedOnly) customerQuery = customerQuery.is('customer_id', null);

    const { data: customerResults } = await customerQuery;
    if (customerResults && customerResults.length > 0) {
      const existingIds = new Set(contacts.map(c => c.id));
      for (const c of customerResults) {
        if (!existingIds.has(c.id)) contacts.push(c);
      }
    }
  }

  const contactIds = contacts.map(c => c.id);

  // Get last message preview
  const lastMessageMap = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: msgs } = await supabaseAdmin
      .from('fb_messages')
      .select('fb_contact_id, content, message_type')
      .eq('company_id', companyId)
      .in('fb_contact_id', contactIds)
      .order('created_at', { ascending: false })
      .limit(contactIds.length * 3);

    (msgs || []).forEach(msg => {
      if (!lastMessageMap.has(msg.fb_contact_id)) {
        let preview = msg.content;
        if (msg.message_type === 'image') preview = '🖼️ รูปภาพ';
        else if (msg.message_type === 'video') preview = '🎬 วิดีโอ';
        else if (msg.message_type === 'audio') preview = '🎵 เสียง';
        else if (msg.message_type === 'file') preview = '📎 ไฟล์';
        lastMessageMap.set(msg.fb_contact_id, preview);
      }
    });
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

  // Query both tables in parallel
  const [{ data: lineData }, { data: fbData }] = await Promise.all([
    supabaseAdmin
      .from('line_contacts')
      .select('id, display_name, picture_url, last_message_at, chat_account_id')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('status', 'active'),
    supabaseAdmin
      .from('fb_contacts')
      .select('id, display_name, picture_url, last_message_at, chat_account_id')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('status', 'active'),
  ]);

  const linked: { id: string; platform: 'line' | 'facebook'; display_name: string; picture_url?: string; last_message_at?: string; account_name?: string }[] = [];

  (lineData || []).forEach(c => {
    const acc = c.chat_account_id ? accountMap.get(c.chat_account_id) : null;
    linked.push({ id: c.id, platform: 'line', display_name: c.display_name, picture_url: c.picture_url, last_message_at: c.last_message_at, account_name: acc?.name });
  });

  (fbData || []).forEach(c => {
    const acc = c.chat_account_id ? accountMap.get(c.chat_account_id) : null;
    linked.push({ id: c.id, platform: 'facebook', display_name: c.display_name, picture_url: c.picture_url, last_message_at: c.last_message_at, account_name: acc?.name });
  });

  // Sort by last_message_at desc
  linked.sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });

  return NextResponse.json({ linked_contacts: linked });
}
