// Path: app/api/shipping-addresses/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Type definitions
interface ShippingAddressData {
  customer_id: string;
  address_name: string;
  contact_person?: string;
  phone?: string;
  address_line1: string;
  address_line2?: string;
  district?: string;
  amphoe?: string;
  province: string;
  postal_code?: string;
  google_maps_link?: string;
  latitude?: number;
  longitude?: number;
  delivery_notes?: string;
  is_default?: boolean;
  is_active?: boolean;
}

// Create Supabase Admin client (service role)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Helper function: Check authentication
async function checkAuth(request: NextRequest): Promise<{ isAuth: boolean; userId?: string }> {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return { isAuth: false };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return { isAuth: false };
    }

    return { isAuth: true, userId: user.id };
  } catch (error) {
    console.error('Auth check error:', error);
    return { isAuth: false };
  }
}

// GET - Get shipping addresses for a customer
export async function GET(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Login required.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customer_id');

    if (!customerId) {
      return NextResponse.json(
        { error: 'customer_id is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('shipping_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ addresses: data });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new shipping address
export async function POST(request: NextRequest) {
  try {
    const { isAuth, userId } = await checkAuth(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Login required.' },
        { status: 401 }
      );
    }

    const addressData: ShippingAddressData = await request.json();

    // Validate required fields
    if (!addressData.customer_id || !addressData.address_name || !addressData.address_line1 || !addressData.province) {
      return NextResponse.json(
        { error: 'Missing required fields: customer_id, address_name, address_line1, province' },
        { status: 400 }
      );
    }

    // Create shipping address
    const { data, error } = await supabaseAdmin
      .from('shipping_addresses')
      .insert({
        customer_id: addressData.customer_id,
        address_name: addressData.address_name,
        contact_person: addressData.contact_person || null,
        phone: addressData.phone || null,
        address_line1: addressData.address_line1,
        address_line2: addressData.address_line2 || null,
        district: addressData.district || null,
        amphoe: addressData.amphoe || null,
        province: addressData.province,
        postal_code: addressData.postal_code || null,
        google_maps_link: addressData.google_maps_link || null,
        latitude: addressData.latitude || null,
        longitude: addressData.longitude || null,
        delivery_notes: addressData.delivery_notes || null,
        is_default: addressData.is_default !== undefined ? addressData.is_default : false,
        is_active: addressData.is_active !== undefined ? addressData.is_active : true,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Shipping address creation error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      address: data
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update shipping address
export async function PUT(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Login required.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Address ID is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('shipping_addresses')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
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
      address: data
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete shipping address (soft delete)
export async function DELETE(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Login required.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const addressId = searchParams.get('id');

    if (!addressId) {
      return NextResponse.json(
        { error: 'Address ID is required' },
        { status: 400 }
      );
    }

    // Soft delete - set is_active to false
    const { error } = await supabaseAdmin
      .from('shipping_addresses')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', addressId);

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
