// Path: app/api/customers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// Type definitions
interface CustomerData {
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  billing_address?: string;
  billing_district?: string;
  billing_amphoe?: string;
  billing_province?: string;
  billing_postal_code?: string;
  tax_id?: string;
  tax_company_name?: string;
  tax_branch?: string;
  tax_type?: string;
  customer_type: string;
  sale_type?: string;
  credit_limit?: number;
  credit_days?: number;
  assigned_salesperson?: string;
  is_active?: boolean;
  notes?: string;
  // Consignment fields
  consignment_mode?: string | null;
  consignment_gp_rate?: number | null;
  consignment_report_due_days?: number | null;
  consignment_payment_terms?: number | null;
  contract_number?: string | null;
  contract_date?: string | null;
  rd_submitted_at?: string | null;
}

// POST - สร้างลูกค้าใหม่
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const customerData: CustomerData = await request.json();

    // Validate required fields
    if (!customerData.name || !customerData.customer_type) {
      return NextResponse.json(
        { error: 'Missing required fields: name and customer_type' },
        { status: 400 }
      );
    }

    // Generate customer code (auto-gen: timestamp + random)
    const codeData = `C-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Create customer
    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert({
        company_id: auth.companyId,
        customer_code: codeData,
        name: customerData.name,
        contact_person: customerData.contact_person || null,
        phone: customerData.phone || null,
        email: customerData.email || null,
        billing_address: customerData.billing_address || null,
        billing_district: customerData.billing_district || null,
        billing_amphoe: customerData.billing_amphoe || null,
        billing_province: customerData.billing_province || null,
        billing_postal_code: customerData.billing_postal_code || null,
        tax_id: customerData.tax_id || null,
        tax_company_name: customerData.tax_company_name || null,
        tax_branch: customerData.tax_branch || null,
        tax_type: customerData.tax_type || 'corporate',
        customer_type: customerData.customer_type || 'retail',
        sale_type: customerData.sale_type || null,
        credit_limit: customerData.credit_limit || 0,
        credit_days: customerData.credit_days || 0,
        assigned_salesperson: customerData.assigned_salesperson || null,
        is_active: customerData.is_active !== undefined ? customerData.is_active : true,
        notes: customerData.notes || null,
        // Consignment fields
        consignment_mode: customerData.consignment_mode || null,
        consignment_gp_rate: customerData.consignment_gp_rate ?? null,
        consignment_report_due_days: customerData.consignment_report_due_days ?? null,
        consignment_payment_terms: customerData.consignment_payment_terms ?? null,
        contract_number: customerData.contract_number || null,
        contract_date: customerData.contract_date || null,
        rd_submitted_at: customerData.rd_submitted_at || null,
        created_by: auth.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Customer creation error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Normalize customer_type for response
    if (data) data.customer_type = data.customer_type || 'retail';

    // Auto-create consignment warehouse for consignment_dealer / department_store customers
    if (data && (data.customer_type === 'consignment_dealer' || data.customer_type === 'department_store')) {
      await supabaseAdmin
        .from('warehouses')
        .insert({
          company_id: auth.companyId,
          customer_id: data.id,
          warehouse_type: 'consignment',
          name: data.name,
          is_default: false,
          is_active: true,
          created_by: auth.userId,
        })
        .select('id')
        .single();
      // Non-critical: ignore errors (warehouse may already exist)
    }

    return NextResponse.json({
      success: true,
      customer: data
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - ดึงรายการลูกค้า
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const customerType = searchParams.get('type');
    const isActive = searchParams.get('active');
    const withStats = searchParams.get('with_stats') === 'true';
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : null;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const tagFilter = searchParams.get('tag_id');
    const channelFilter = searchParams.get('channel');

    let query = supabaseAdmin
      .from('customers')
      .select('*', { count: page ? 'exact' : undefined })
      .eq('company_id', auth.companyId);

    // Apply filters
    if (search) {
      // Support searching by UUID (exact match on id) or by name/code/phone
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search);
      if (isUuid) {
        query = query.eq('id', search);
      } else {
        query = query.or(`name.ilike.%${search}%,customer_code.ilike.%${search}%,phone.ilike.%${search}%`);
      }
    }

    if (customerType && customerType !== 'all') {
      // Supports comma-separated values: ?type=consignment_dealer,department_store
      const types = customerType.split(',').map(t => t.trim()).filter(Boolean);
      if (types.length === 1) {
        query = query.eq('customer_type', types[0]);
      } else if (types.length > 1) {
        query = query.in('customer_type', types);
      }
    }

    if (isActive !== null && isActive !== undefined && isActive !== 'all') {
      query = query.eq('is_active', isActive === 'true');
    }

    // Tag filter — find customer IDs with this tag first
    if (tagFilter) {
      const { data: taggedCustomers } = await supabaseAdmin
        .from('customer_tag_links')
        .select('customer_id')
        .eq('tag_id', tagFilter);
      const taggedIds = (taggedCustomers || []).map(t => t.customer_id).filter(Boolean);
      if (taggedIds.length === 0) {
        return NextResponse.json({ customers: [], ...(page ? { total: 0, page, limit } : {}) });
      }
      query = query.in('id', taggedIds);
    }

    // Channel filter — find customer IDs that have this channel
    if (channelFilter) {
      const channelCustomerIds = new Set<string>();

      if (channelFilter === 'line') {
        const { data: lc } = await supabaseAdmin
          .from('line_contacts')
          .select('customer_id')
          .not('customer_id', 'is', null);
        lc?.forEach(r => { if (r.customer_id) channelCustomerIds.add(r.customer_id); });
      } else if (channelFilter === 'facebook' || channelFilter === 'instagram') {
        const { data: fc } = await supabaseAdmin
          .from('fb_contacts')
          .select('customer_id')
          .eq('company_id', auth.companyId)
          .eq('source', channelFilter)
          .not('customer_id', 'is', null);
        fc?.forEach(r => { if (r.customer_id) channelCustomerIds.add(r.customer_id); });
      } else if (['shopee', 'tiktok', 'lazada'].includes(channelFilter)) {
        const { data: oc } = await supabaseAdmin
          .from('orders')
          .select('customer_id')
          .eq('company_id', auth.companyId)
          .eq('source', channelFilter)
          .not('customer_id', 'is', null);
        oc?.forEach(r => { if (r.customer_id) channelCustomerIds.add(r.customer_id); });
      } else if (channelFilter === 'manual') {
        // Manual = customers that have orders with source = 'manual' or null
        const { data: oc } = await supabaseAdmin
          .from('orders')
          .select('customer_id')
          .eq('company_id', auth.companyId)
          .or('source.is.null,source.eq.manual')
          .not('customer_id', 'is', null);
        oc?.forEach(r => { if (r.customer_id) channelCustomerIds.add(r.customer_id); });
      }

      if (channelCustomerIds.size === 0) {
        return NextResponse.json({ customers: [], ...(page ? { total: 0, page, limit } : {}) });
      }
      query = query.in('id', [...channelCustomerIds]);
    }

    query = query.order('created_at', { ascending: false });

    if (page) {
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);
    } else if (searchParams.has('limit')) {
      query = query.limit(limit);
    }

    const { data, error, count: totalCount } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // If with_stats is true, fetch additional data in batch
    if (withStats && data && data.length > 0) {
      const customerIds = data.map(c => c.id);

      // Fetch all stats in parallel (5 queries — orders use RPC for DB-side aggregation)
      const [addressResult, lineResult, fbResult, orderStatsResult, tagLinksResult] = await Promise.all([
        supabaseAdmin
          .from('shipping_addresses')
          .select('customer_id, address_line1, district, amphoe, province, postal_code, is_default')
          .in('customer_id', customerIds)
          .eq('company_id', auth.companyId)
          .eq('is_active', true),
        supabaseAdmin
          .from('line_contacts')
          .select('customer_id, display_name, line_user_id')
          .in('customer_id', customerIds),
        supabaseAdmin
          .from('fb_contacts')
          .select('customer_id, source')
          .in('customer_id', customerIds)
          .eq('company_id', auth.companyId),
        // RPC: aggregate count + sum + sources in DB (instead of fetching all order rows)
        supabaseAdmin.rpc('get_customer_order_stats', {
          p_company_id: auth.companyId,
          p_customer_ids: customerIds,
        }),
        supabaseAdmin
          .from('customer_tag_links')
          .select('customer_id, tag:customer_tags(id, name, color)')
          .in('customer_id', customerIds),
      ]);

      const { data: addresses } = addressResult;
      const { data: lineContacts, error: lineError } = lineResult;
      const { data: fbContacts } = fbResult;
      const { data: orderStats } = orderStatsResult;
      const { data: tagLinks } = tagLinksResult;

      if (lineError) {
        console.error('Error fetching LINE contacts:', lineError);
      }

      // Create lookup maps from single address query
      const addressCountMap: Record<string, number> = {};
      const defaultAddrMap: Record<string, { address_line1: string; district: string; amphoe: string; province: string; postal_code: string }> = {};
      addresses?.forEach(addr => {
        if (addr.customer_id) {
          addressCountMap[addr.customer_id] = (addressCountMap[addr.customer_id] || 0) + 1;
          if (addr.is_default) {
            defaultAddrMap[addr.customer_id] = addr;
          }
        }
      });

      const lineContactMap: Record<string, string> = {}; // customer_id -> display_name
      lineContacts?.forEach(contact => {
        if (contact.customer_id) {
          lineContactMap[contact.customer_id] = contact.display_name || 'LINE';
        }
      });

      // Order stats from RPC (already aggregated)
      const orderTotalMap: Record<string, number> = {};
      const orderCountMap: Record<string, number> = {};
      const orderSourcesMap: Record<string, string[]> = {};
      (orderStats || []).forEach((s: any) => {
        orderTotalMap[s.customer_id] = Number(s.total_amount) || 0;
        orderCountMap[s.customer_id] = Number(s.order_count) || 0;
        orderSourcesMap[s.customer_id] = s.sources || [];
      });

      // Tag lookup map
      const tagMap: Record<string, { id: string; name: string; color: string }[]> = {};
      tagLinks?.forEach((link: any) => {
        if (link.customer_id && link.tag) {
          if (!tagMap[link.customer_id]) tagMap[link.customer_id] = [];
          tagMap[link.customer_id].push(link.tag);
        }
      });

      // Channel derivation: collect all channels per customer
      const channelMap: Record<string, Set<string>> = {};
      // From LINE contacts
      lineContacts?.forEach(lc => {
        if (lc.customer_id) {
          if (!channelMap[lc.customer_id]) channelMap[lc.customer_id] = new Set();
          channelMap[lc.customer_id].add('line');
        }
      });
      // From FB contacts (source = 'facebook' or 'instagram')
      fbContacts?.forEach(fc => {
        if (fc.customer_id) {
          if (!channelMap[fc.customer_id]) channelMap[fc.customer_id] = new Set();
          channelMap[fc.customer_id].add(fc.source || 'facebook');
        }
      });
      // From marketplace order sources (from RPC)
      Object.entries(orderSourcesMap).forEach(([custId, sources]) => {
        sources.forEach(src => {
          if (!channelMap[custId]) channelMap[custId] = new Set();
          channelMap[custId].add(src);
        });
      });

      // Merge stats into customers
      const customersWithStats = data.map(customer => {
        const channels = channelMap[customer.id] ? [...channelMap[customer.id]] : [];
        // If no channels found but has orders, it's manual
        if (channels.length === 0 && (orderCountMap[customer.id] || 0) > 0) {
          channels.push('manual');
        }
        return {
          ...customer,
          customer_type: customer.customer_type || 'retail',
          shipping_address_count: addressCountMap[customer.id] || 0,
          default_address: defaultAddrMap[customer.id] || null,
          line_display_name: lineContactMap[customer.id] || null,
          total_order_amount: orderTotalMap[customer.id] || 0,
          order_count: orderCountMap[customer.id] || 0,
          tags: tagMap[customer.id] || [],
          channels,
        };
      });

      return NextResponse.json({
        customers: customersWithStats,
        ...(page ? { total: totalCount || 0, page, limit } : {}),
      });
    }

    const normalized = data?.map((c: any) => ({ ...c, customer_type: c.customer_type || 'retail' })) || [];
    return NextResponse.json({
      customers: normalized,
      ...(page ? { total: totalCount || 0, page, limit } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - อัพเดทลูกค้า
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, customer_type, address, district, amphoe, province, postal_code, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 }
      );
    }

    const dataToUpdate: Record<string, unknown> = {
      ...updateData,
      updated_at: new Date().toISOString()
    };

    if (customer_type) {
      dataToUpdate.customer_type = customer_type;
    }

    // Map old address field names to new billing_address columns (backward compat)
    if (address !== undefined) dataToUpdate.billing_address = address;
    if (district !== undefined) dataToUpdate.billing_district = district;
    if (amphoe !== undefined) dataToUpdate.billing_amphoe = amphoe;
    if (province !== undefined) dataToUpdate.billing_province = province;
    if (postal_code !== undefined) dataToUpdate.billing_postal_code = postal_code;

    const { data, error } = await supabaseAdmin
      .from('customers')
      .update(dataToUpdate)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      customer: data
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - ลบลูกค้า (single: ?id=xxx, bulk: ?ids=a,b,c, hard delete: ?hard=true)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('id');
    const bulkIds = searchParams.get('ids');
    const hardDelete = searchParams.get('hard') === 'true';

    // Collect IDs to delete
    const customerIds: string[] = [];
    if (bulkIds) {
      customerIds.push(...bulkIds.split(',').filter(Boolean));
    } else if (customerId) {
      customerIds.push(customerId);
    }

    if (customerIds.length === 0) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 }
      );
    }

    if (hardDelete) {
      // Hard delete: unlink orders → delete activities → delete customers
      await supabaseAdmin
        .from('orders')
        .update({ customer_id: null })
        .in('customer_id', customerIds);

      await supabaseAdmin
        .from('customer_activities')
        .delete()
        .in('customer_id', customerIds);

      const { error } = await supabaseAdmin
        .from('customers')
        .delete()
        .in('id', customerIds)
        .eq('company_id', auth.companyId);

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }
    } else {
      // Soft delete - ปิดการใช้งาน
      const { error } = await supabaseAdmin
        .from('customers')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .in('id', customerIds)
        .eq('company_id', auth.companyId);

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, deleted: customerIds.length });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
