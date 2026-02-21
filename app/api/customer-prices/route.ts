// Path: app/api/customer-prices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET - Get customer's last prices for products
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
    const customerId = searchParams.get('customer_id');

    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 }
      );
    }

    // Get last prices for this customer using the database function
    const { data, error } = await supabaseAdmin
      .rpc('get_customer_last_prices_by_variation', {
        p_customer_id: customerId,
      });

    if (error) {
      console.error('Error fetching customer prices:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Transform to object for easier lookup (using variation_id as key)
    const priceMap: Record<string, { unit_price: number; discount_percent: number }> = {};
    if (data) {
      data.forEach((item: any) => {
        priceMap[item.variation_id] = {
          unit_price: item.last_unit_price,
          discount_percent: item.last_discount_percent
        };
      });
    }

    return NextResponse.json({ prices: priceMap });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
