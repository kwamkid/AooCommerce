// Path: app/api/line/contacts/route.ts
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// GET - Get LINE contacts list
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Login required.' },
        { status: 401 }
      );
    }
    if (!companyId) {
      return NextResponse.json(
        { error: 'No company context' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const linkedOnly = searchParams.get('linked_only') === 'true';
    const unlinkedOnly = searchParams.get('unlinked_only') === 'true';
    // Order days range filter
    const orderDaysMin = searchParams.get('order_days_min');
    const orderDaysMax = searchParams.get('order_days_max');
    // Pagination
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    // When orderDaysMin is active, we can't paginate at DB level (post-fetch filtering)
    const canPaginateAtDb = !orderDaysMin;

    // Count query (same filters, no pagination) for total
    let countQuery = supabaseAdmin
      .from('line_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'active');

    let query = supabaseAdmin
      .from('line_contacts')
      .select(`
        *,
        customer:customers(
          id,
          name,
          customer_code,
          contact_person,
          phone,
          email,
          customer_type_new,
          address,
          district,
          amphoe,
          province,
          postal_code,
          tax_id,
          tax_company_name,
          tax_branch,
          credit_limit,
          credit_days,
          notes,
          is_active
        )
      `)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false, nullsFirst: false });

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

    // Apply DB-level pagination only when no post-fetch filtering needed
    if (canPaginateAtDb) {
      query = query.range(offset, offset + limit - 1);
    }

    const [{ data: contacts, error }, { count: totalCount }] = await Promise.all([
      query,
      countQuery
    ]);

    // If filtering by last order days, we need to filter after fetching
    let filteredContacts = contacts || [];

    if (orderDaysMin && linkedOnly) {
      // Get customer IDs from contacts
      const customerIds = filteredContacts
        .filter(c => c.customer_id)
        .map(c => c.customer_id);

      if (customerIds.length > 0) {
        // Get all orders for each customer (for avg frequency calculation)
        const { data: allOrders } = await supabaseAdmin
          .from('orders')
          .select('customer_id, order_date, created_at')
          .eq('company_id', companyId)
          .in('customer_id', customerIds)
          .neq('order_status', 'cancelled')
          .order('order_date', { ascending: false });

        // Build map of customer_id -> { lastOrderDate, lastOrderCreatedAt, orderDates[] }
        const customerOrderMap = new Map<string, { lastOrderDate: string; lastOrderCreatedAt: string | null; orderDates: string[] }>();
        (allOrders || []).forEach(order => {
          if (!customerOrderMap.has(order.customer_id)) {
            customerOrderMap.set(order.customer_id, { lastOrderDate: order.order_date, lastOrderCreatedAt: order.created_at, orderDates: [] });
          }
          customerOrderMap.get(order.customer_id)!.orderDates.push(order.order_date);
        });

        // Calculate cutoff dates for range
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

        // Filter contacts by last order date range
        // Show customers whose last order is between minDays and maxDays ago
        filteredContacts = filteredContacts.filter(c => {
          if (!c.customer_id) return false;
          const orderData = customerOrderMap.get(c.customer_id);
          const lastOrder = orderData?.lastOrderDate;

          // No orders = include if we want 60+ days (no max)
          if (!lastOrder) {
            return maxDays === null; // Only include "never ordered" in 60+ category
          }

          // Last order must be older than minDays (before minCutoff)
          if (lastOrder >= minCutoffStr) return false;

          // If maxDays specified, last order must be newer than maxDays (after maxCutoff)
          if (maxCutoffStr !== null && lastOrder < maxCutoffStr) return false;

          return true;
        });

        // Add last_order_date and avg_order_frequency to contacts
        filteredContacts = filteredContacts.map(c => {
          const orderData = c.customer_id ? customerOrderMap.get(c.customer_id) : null;
          let avgOrderFrequency: number | null = null;

          // Calculate average order frequency (if has 2+ orders)
          if (orderData && orderData.orderDates.length >= 2) {
            const sortedDates = orderData.orderDates
              .map(d => new Date(d).getTime())
              .sort((a, b) => a - b);

            let totalGap = 0;
            for (let i = 1; i < sortedDates.length; i++) {
              totalGap += (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
            }
            avgOrderFrequency = Math.round(totalGap / (sortedDates.length - 1));
          }

          return {
            ...c,
            last_order_date: orderData?.lastOrderDate || null,
            last_order_created_at: orderData?.lastOrderCreatedAt || null,
            avg_order_frequency: avgOrderFrequency
          };
        });
      } else {
        filteredContacts = [];
      }
    } else if (linkedOnly) {
      // Add last order date even without day filter
      const customerIds = filteredContacts
        .filter(c => c.customer_id)
        .map(c => c.customer_id);

      if (customerIds.length > 0) {
        const { data: lastOrders } = await supabaseAdmin
          .from('orders')
          .select('customer_id, order_date, created_at')
          .eq('company_id', companyId)
          .in('customer_id', customerIds)
          .neq('order_status', 'cancelled')
          .order('order_date', { ascending: false });

        // Build map of customer_id -> { lastOrderDate, lastOrderCreatedAt, orderDates[] }
        const customerOrderMap = new Map<string, { lastOrderDate: string; lastOrderCreatedAt: string | null; orderDates: string[] }>();
        (lastOrders || []).forEach(order => {
          if (!customerOrderMap.has(order.customer_id)) {
            customerOrderMap.set(order.customer_id, { lastOrderDate: order.order_date, lastOrderCreatedAt: order.created_at, orderDates: [] });
          }
          customerOrderMap.get(order.customer_id)!.orderDates.push(order.order_date);
        });

        filteredContacts = filteredContacts.map(c => {
          const orderData = c.customer_id ? customerOrderMap.get(c.customer_id) : null;
          let avgOrderFrequency: number | null = null;

          // Calculate average order frequency (if has 2+ orders)
          if (orderData && orderData.orderDates.length >= 2) {
            const sortedDates = orderData.orderDates
              .map(d => new Date(d).getTime())
              .sort((a, b) => a - b);

            let totalGap = 0;
            for (let i = 1; i < sortedDates.length; i++) {
              totalGap += (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
            }
            avgOrderFrequency = Math.round(totalGap / (sortedDates.length - 1));
          }

          return {
            ...c,
            last_order_date: orderData?.lastOrderDate || null,
            last_order_created_at: orderData?.lastOrderCreatedAt || null,
            avg_order_frequency: avgOrderFrequency
          };
        });
      }
    } else {
      // For non-linkedOnly, still add order stats for linked contacts
      const customerIds = filteredContacts
        .filter(c => c.customer_id)
        .map(c => c.customer_id);

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

        filteredContacts = filteredContacts.map(c => {
          const orderData = c.customer_id ? customerOrderMap.get(c.customer_id) : null;
          let avgOrderFrequency: number | null = null;

          if (orderData && orderData.orderDates.length >= 2) {
            const sortedDates = orderData.orderDates
              .map(d => new Date(d).getTime())
              .sort((a, b) => a - b);

            let totalGap = 0;
            for (let i = 1; i < sortedDates.length; i++) {
              totalGap += (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
            }
            avgOrderFrequency = Math.round(totalGap / (sortedDates.length - 1));
          }

          return {
            ...c,
            last_order_date: orderData?.lastOrderDate || null,
            last_order_created_at: orderData?.lastOrderCreatedAt || null,
            avg_order_frequency: avgOrderFrequency
          };
        });
      }
    }

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // For post-fetch filtered results, apply pagination after filtering
    let totalFiltered = filteredContacts.length;
    if (!canPaginateAtDb) {
      totalFiltered = filteredContacts.length;
      filteredContacts = filteredContacts.slice(offset, offset + limit);
    }

    // Get last message for each contact
    const contactIds = filteredContacts.map(c => c.id);

    // Get latest message per contact (only for current page)
    let lastMessageMap = new Map<string, string>();
    if (contactIds.length > 0) {
      const { data: lastMessages } = await supabaseAdmin
        .from('line_messages')
        .select('line_contact_id, content, message_type')
        .eq('company_id', companyId)
        .in('line_contact_id', contactIds)
        .order('created_at', { ascending: false });

      // Build a map of contact_id -> last message
      (lastMessages || []).forEach(msg => {
        if (!lastMessageMap.has(msg.line_contact_id)) {
          // Format last message preview
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

    // Add last_message to contacts
    const contactsWithLastMessage = filteredContacts.map(contact => ({
      ...contact,
      last_message: lastMessageMap.get(contact.id) || null
    }));

    // Get unread counts summary
    const totalUnread = filteredContacts.reduce((sum, c) => sum + (c.unread_count || 0), 0);

    // Determine total and hasMore
    const effectiveTotal = canPaginateAtDb ? (totalCount || 0) : totalFiltered;
    const hasMore = offset + limit < effectiveTotal;

    return NextResponse.json({
      contacts: contactsWithLastMessage,
      summary: {
        total: effectiveTotal,
        totalUnread,
        hasMore,
        offset,
        limit
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update LINE contact (link to customer, etc.)
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Login required.' },
        { status: 401 }
      );
    }
    if (!companyId) {
      return NextResponse.json(
        { error: 'No company context' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, customer_id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Contact ID is required' },
        { status: 400 }
      );
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (customer_id !== undefined) {
      updateData.customer_id = customer_id || null;
    }

    const { error } = await supabaseAdmin
      .from('line_contacts')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
