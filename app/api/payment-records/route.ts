import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

// POST - Create payment record
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'No authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      order_id,
      payment_method,
      amount,
      collected_by,
      transfer_date,
      transfer_time,
      notes
    } = body;

    // Validation
    if (!order_id || !payment_method || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate payment method specific fields
    if (payment_method === 'cash' && !collected_by) {
      return NextResponse.json(
        { error: 'กรุณาระบุชื่อคนเก็บเงิน' },
        { status: 400 }
      );
    }

    if (payment_method === 'transfer' && (!transfer_date || !transfer_time)) {
      return NextResponse.json(
        { error: 'กรุณาระบุวันที่และเวลาจากสลิป' },
        { status: 400 }
      );
    }

    // Insert payment record (admin-created = verified immediately)
    const { data: paymentRecord, error: insertError } = await supabaseAdmin
      .from('payment_records')
      .insert({
        order_id,
        payment_method,
        amount,
        collected_by: payment_method === 'cash' ? collected_by : null,
        transfer_date: payment_method === 'transfer' ? transfer_date : null,
        transfer_time: payment_method === 'transfer' ? transfer_time : null,
        notes,
        status: 'verified',
        created_by: user.id
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting payment record:', insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      payment_record: paymentRecord
    });
  } catch (error) {
    console.error('Error in payment-records POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Get payment records for an order
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'No authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const order_id = searchParams.get('order_id');

    if (!order_id) {
      return NextResponse.json(
        { error: 'order_id is required' },
        { status: 400 }
      );
    }

    // Fetch payment records
    const { data: paymentRecords, error: fetchError } = await supabaseAdmin
      .from('payment_records')
      .select('*')
      .eq('order_id', order_id)
      .order('payment_date', { ascending: false });

    if (fetchError) {
      console.error('Error fetching payment records:', fetchError);
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      payment_records: paymentRecords || []
    });
  } catch (error) {
    console.error('Error in payment-records GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
