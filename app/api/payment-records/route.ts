import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// POST - Create payment record (supports JSON or FormData with slip image)
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    let order_id: string;
    let payment_method: string;
    let amount: number;
    let collected_by: string | null = null;
    let transfer_date: string | null = null;
    let transfer_time: string | null = null;
    let notes: string | null = null;
    let slipImage: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      order_id = formData.get('order_id') as string;
      payment_method = formData.get('payment_method') as string;
      amount = parseFloat(formData.get('amount') as string);
      collected_by = (formData.get('collected_by') as string) || null;
      transfer_date = (formData.get('transfer_date') as string) || null;
      transfer_time = (formData.get('transfer_time') as string) || null;
      notes = (formData.get('notes') as string) || null;
      const file = formData.get('slip_image');
      if (file && file instanceof File && file.size > 0) slipImage = file;
    } else {
      const body = await request.json();
      order_id = body.order_id;
      payment_method = body.payment_method;
      amount = body.amount;
      collected_by = body.collected_by || null;
      transfer_date = body.transfer_date || null;
      transfer_time = body.transfer_time || null;
      notes = body.notes || null;
    }

    // Validation
    if (!order_id || !payment_method || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (payment_method === 'cash' && !collected_by) {
      return NextResponse.json({ error: 'กรุณาระบุชื่อคนเก็บเงิน' }, { status: 400 });
    }

    if (payment_method === 'transfer' && (!transfer_date || !transfer_time)) {
      return NextResponse.json({ error: 'กรุณาระบุวันที่และเวลาจากสลิป' }, { status: 400 });
    }

    // Upload slip image if provided
    let slipImageUrl: string | null = null;
    if (slipImage) {
      if (slipImage.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'ไฟล์สลิปใหญ่เกินไป (สูงสุด 5MB)' }, { status: 400 });
      }
      if (!slipImage.type.startsWith('image/')) {
        return NextResponse.json({ error: 'ไฟล์สลิปต้องเป็นรูปภาพเท่านั้น' }, { status: 400 });
      }
      const timestamp = Date.now();
      const ext = slipImage.name.split('.').pop() || 'jpg';
      const filePath = `${order_id}/${timestamp}.${ext}`;
      const arrayBuffer = await slipImage.arrayBuffer();
      const { error: uploadError } = await supabaseAdmin.storage
        .from('payment-slips')
        .upload(filePath, arrayBuffer, { contentType: slipImage.type, upsert: false });
      if (uploadError) {
        console.error('Slip upload error:', uploadError);
        return NextResponse.json({ error: 'ไม่สามารถอัพโหลดสลิปได้' }, { status: 500 });
      }
      const { data: publicUrl } = supabaseAdmin.storage.from('payment-slips').getPublicUrl(filePath);
      slipImageUrl = publicUrl.publicUrl;
    }

    // Insert payment record (admin-created = verified immediately)
    const { data: paymentRecord, error: insertError } = await supabaseAdmin
      .from('payment_records')
      .insert({
        company_id: auth.companyId,
        order_id,
        payment_method,
        amount,
        collected_by: payment_method === 'cash' ? collected_by : null,
        transfer_date: payment_method === 'transfer' ? transfer_date : null,
        transfer_time: payment_method === 'transfer' ? transfer_time : null,
        slip_image_url: slipImageUrl,
        notes,
        status: 'verified',
        created_by: auth.userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting payment record:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, payment_record: paymentRecord });
  } catch (error) {
    console.error('Error in payment-records POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET - Get payment records for an order
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
      .eq('company_id', auth.companyId)
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
