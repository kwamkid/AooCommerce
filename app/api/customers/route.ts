// Path: app/api/customers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// Type definitions
interface CustomerData {
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  district?: string;
  amphoe?: string;
  province?: string;
  postal_code?: string;
  tax_id?: string;
  tax_company_name?: string;
  tax_branch?: string;
  customer_type: 'retail' | 'wholesale' | 'distributor';
  credit_limit?: number;
  credit_days?: number;
  assigned_salesperson?: string;
  is_active?: boolean;
  notes?: string;
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
        address: customerData.address || null,
        district: customerData.district || null,
        amphoe: customerData.amphoe || null,
        province: customerData.province || null,
        postal_code: customerData.postal_code || null,
        tax_id: customerData.tax_id || null,
        tax_company_name: customerData.tax_company_name || null,
        tax_branch: customerData.tax_branch || null,
        customer_type_new: customerData.customer_type,
        credit_limit: customerData.credit_limit || 0,
        credit_days: customerData.credit_days || 0,
        assigned_salesperson: customerData.assigned_salesperson || null,
        is_active: customerData.is_active !== undefined ? customerData.is_active : true,
        notes: customerData.notes || null,
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

    // Auto-create default shipping address if address info is provided
    if (data && customerData.address && customerData.province) {
      try {
        await supabaseAdmin
          .from('shipping_addresses')
          .insert({
            company_id: auth.companyId,
            customer_id: data.id,
            address_name: 'สำนักงานใหญ่', // Default name
            contact_person: customerData.contact_person || null,
            phone: customerData.phone || null,
            address_line1: customerData.address,
            district: customerData.district || null,
            amphoe: customerData.amphoe || null,
            province: customerData.province,
            postal_code: customerData.postal_code || null,
            is_default: true,
            is_active: true,
            created_by: auth.userId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      } catch (shippingError) {
        console.error('Shipping address creation error:', shippingError);
        // Don't fail the customer creation if shipping address fails
      }
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
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : null;

    let query = supabaseAdmin
      .from('customers')
      .select('*')
      .eq('company_id', auth.companyId);

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,customer_code.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    if (customerType && customerType !== 'all') {
      query = query.eq('customer_type', customerType);
    }

    if (isActive !== null && isActive !== undefined && isActive !== 'all') {
      query = query.eq('is_active', isActive === 'true');
    }

    query = query.order('created_at', { ascending: false });
    if (limit) query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // If with_stats is true, fetch additional data in batch
    if (withStats && data && data.length > 0) {
      const customerIds = data.map(c => c.id);

      // Fetch all stats in parallel
      const [addressResult, lineResult, orderResult] = await Promise.all([
        supabaseAdmin
          .from('shipping_addresses')
          .select('customer_id')
          .in('customer_id', customerIds)
          .eq('company_id', auth.companyId)
          .eq('is_active', true),
        supabaseAdmin
          .from('line_contacts')
          .select('customer_id, display_name, line_user_id')
          .in('customer_id', customerIds),
        supabaseAdmin
          .from('orders')
          .select('customer_id, total_amount')
          .in('customer_id', customerIds)
          .eq('company_id', auth.companyId)
          .neq('order_status', 'cancelled'),
      ]);

      const { data: addressCounts } = addressResult;
      const { data: lineContacts, error: lineError } = lineResult;
      const { data: orderTotals } = orderResult;

      if (lineError) {
        console.error('Error fetching LINE contacts:', lineError);
      }

      // Create lookup maps
      const addressCountMap: Record<string, number> = {};
      addressCounts?.forEach(addr => {
        addressCountMap[addr.customer_id] = (addressCountMap[addr.customer_id] || 0) + 1;
      });

      const lineContactMap: Record<string, string> = {}; // customer_id -> display_name
      lineContacts?.forEach(contact => {
        if (contact.customer_id) {
          lineContactMap[contact.customer_id] = contact.display_name || 'LINE';
        }
      });

      const orderTotalMap: Record<string, number> = {};
      orderTotals?.forEach(order => {
        if (order.customer_id) {
          orderTotalMap[order.customer_id] = (orderTotalMap[order.customer_id] || 0) + (order.total_amount || 0);
        }
      });

      // Merge stats into customers
      const customersWithStats = data.map(customer => ({
        ...customer,
        shipping_address_count: addressCountMap[customer.id] || 0,
        line_display_name: lineContactMap[customer.id] || null,
        total_order_amount: orderTotalMap[customer.id] || 0
      }));

      return NextResponse.json({ customers: customersWithStats });
    }

    return NextResponse.json({ customers: data });
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
    const { id, customer_type, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 }
      );
    }

    // Map customer_type to customer_type_new for database
    const dataToUpdate = {
      ...updateData,
      updated_at: new Date().toISOString()
    };

    // Add customer_type_new if customer_type is provided
    if (customer_type) {
      dataToUpdate.customer_type_new = customer_type;
    }

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

// DELETE - ลบลูกค้า (soft delete)
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

    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 }
      );
    }

    // Soft delete - ปิดการใช้งาน
    const { error } = await supabaseAdmin
      .from('customers')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', customerId)
      .eq('company_id', auth.companyId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
