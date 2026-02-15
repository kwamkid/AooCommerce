import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// GET - Get Facebook contacts list
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const linkedOnly = searchParams.get('linked_only') === 'true';
    const unlinkedOnly = searchParams.get('unlinked_only') === 'true';
    const accountId = searchParams.get('account_id');
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Count query
    let countQuery = supabaseAdmin
      .from('fb_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'active');

    let query = supabaseAdmin
      .from('fb_contacts')
      .select(`
        *,
        customer:customers(
          id, name, customer_code, phone, email
        )
      `)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (accountId) {
      query = query.eq('chat_account_id', accountId);
      countQuery = countQuery.eq('chat_account_id', accountId);
    }

    if (search) {
      query = query.ilike('display_name', `%${search}%`);
      countQuery = countQuery.ilike('display_name', `%${search}%`);
    }

    if (unreadOnly) {
      query = query.gt('unread_count', 0);
      countQuery = countQuery.gt('unread_count', 0);
    }

    if (linkedOnly) {
      query = query.not('customer_id', 'is', null);
      countQuery = countQuery.not('customer_id', 'is', null);
    }

    if (unlinkedOnly) {
      query = query.is('customer_id', null);
      countQuery = countQuery.is('customer_id', null);
    }

    query = query.range(offset, offset + limit - 1);

    const [{ data: contacts, error }, { count: totalCount }] = await Promise.all([
      query,
      countQuery,
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const filteredContacts = contacts || [];

    // Get last message for each contact
    const contactIds = filteredContacts.map(c => c.id);
    const lastMessageMap = new Map<string, string>();

    if (contactIds.length > 0) {
      const { data: lastMessages } = await supabaseAdmin
        .from('fb_messages')
        .select('fb_contact_id, content, message_type')
        .eq('company_id', companyId)
        .in('fb_contact_id', contactIds)
        .order('created_at', { ascending: false });

      (lastMessages || []).forEach(msg => {
        if (!lastMessageMap.has(msg.fb_contact_id)) {
          let preview = msg.content;
          if (msg.message_type === 'sticker') preview = 'สติกเกอร์';
          else if (msg.message_type === 'image') preview = 'รูปภาพ';
          else if (msg.message_type === 'video') preview = 'วิดีโอ';
          else if (msg.message_type === 'audio') preview = 'เสียง';
          else if (msg.message_type === 'file') preview = 'ไฟล์';
          lastMessageMap.set(msg.fb_contact_id, preview);
        }
      });
    }

    const contactsWithLastMessage = filteredContacts.map(contact => ({
      ...contact,
      last_message: lastMessageMap.get(contact.id) || null,
    }));

    const totalUnread = filteredContacts.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    const effectiveTotal = totalCount || 0;
    const hasMore = offset + limit < effectiveTotal;

    return NextResponse.json({
      contacts: contactsWithLastMessage,
      summary: {
        total: effectiveTotal,
        totalUnread,
        hasMore,
        offset,
        limit,
      },
    });
  } catch (error) {
    console.error('FB contacts GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update FB contact (link to customer)
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }

    const body = await request.json();
    const { id, customer_id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Contact ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (customer_id !== undefined) {
      updateData.customer_id = customer_id || null;
    }

    const { error } = await supabaseAdmin
      .from('fb_contacts')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('FB contacts PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
