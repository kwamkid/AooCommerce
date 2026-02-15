// Creates a Beam Checkout payment link and redirects customer to pay
// Public API - no authentication required (called from customer-facing bill page)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Map internal channel codes to Beam linkSettings keys
const BEAM_LINK_SETTINGS_MAP: Record<string, string> = {
  'CARD': 'card',
  'QR_PROMPT_PAY': 'qrPromptPay',
  'LINE_PAY': 'eWallets',
  'SHOPEE_PAY': 'eWallets',
  'TRUE_MONEY': 'eWallets',
  'WECHAT_PAY': 'eWallets',
  'ALIPAY': 'eWallets',
  'CARD_INSTALLMENTS': 'cardInstallments',
  'BANGKOK_BANK_APP': 'mobileBanking',
  'KPLUS': 'mobileBanking',
  'SCB_EASY': 'mobileBanking',
  'KRUNGSRI_APP': 'mobileBanking',
};

export async function POST(request: NextRequest) {
  try {
    const { order_id } = await request.json();

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    // 1. Validate order exists and is in pending state (get company_id from order)
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, total_amount, payment_status, order_status, customer_id, company_id')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.order_status === 'cancelled') {
      return NextResponse.json({ error: 'Order has been cancelled' }, { status: 400 });
    }

    if (order.payment_status !== 'pending') {
      return NextResponse.json({ error: 'Order is not in pending payment state' }, { status: 400 });
    }

    const companyId = order.company_id;

    // 2. Fetch gateway config from payment_channels
    const { data: gatewayChannel } = await supabaseAdmin
      .from('payment_channels')
      .select('config')
      .eq('company_id', companyId)
      .eq('channel_group', 'bill_online')
      .eq('type', 'payment_gateway')
      .eq('is_active', true)
      .single();

    if (!gatewayChannel) {
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 400 });
    }

    const cfg = gatewayChannel.config as Record<string, unknown>;
    const merchantId = cfg.merchant_id as string;
    const apiKey = cfg.api_key as string;
    const environment = cfg.environment as string;
    const channels = (cfg.channels || {}) as Record<string, Record<string, unknown>>;

    if (!merchantId || !apiKey) {
      return NextResponse.json({ error: 'Payment gateway credentials not configured' }, { status: 400 });
    }

    // 3. Get customer type for filtering
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('customer_type_new')
      .eq('id', order.customer_id)
      .eq('company_id', companyId)
      .single();

    const customerType = customer?.customer_type_new || 'retail';

    // 4. Build Beam linkSettings from enabled channels
    const linkSettings: Record<string, { isEnabled: boolean }> = {
      card: { isEnabled: false },
      qrPromptPay: { isEnabled: false },
      eWallets: { isEnabled: false },
      mobileBanking: { isEnabled: false },
      cardInstallments: { isEnabled: false },
    };

    for (const [code, conf] of Object.entries(channels)) {
      if (!conf.enabled) continue;
      if (conf.min_amount && (order.total_amount as number) < (conf.min_amount as number)) continue;
      if (conf.customer_types && Array.isArray(conf.customer_types) && conf.customer_types.length > 0) {
        if (!conf.customer_types.includes(customerType)) continue;
      }

      const beamKey = BEAM_LINK_SETTINGS_MAP[code];
      if (beamKey) {
        linkSettings[beamKey] = { isEnabled: true };
      }
    }

    // Check at least one channel is enabled
    const hasEnabledChannel = Object.values(linkSettings).some(s => s.isEnabled);
    if (!hasEnabledChannel) {
      return NextResponse.json({ error: 'No payment channels available for this order' }, { status: 400 });
    }

    // 5. Determine Beam API URL
    const baseUrl = environment === 'production'
      ? 'https://api.beamcheckout.com'
      : 'https://playground.api.beamcheckout.com';

    // 6. Build redirect URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || '';
    const redirectUrl = `${appUrl}/bills/${order.id}?payment=success`;

    // 7. Call Beam API to create payment link
    const amountInSatang = Math.round((order.total_amount as number) * 100);

    const beamResponse = await fetch(`${baseUrl}/api/v1/payment-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${merchantId}:${apiKey}`).toString('base64'),
      },
      body: JSON.stringify({
        order: {
          currency: 'THB',
          netAmount: amountInSatang,
          description: `Order #${order.order_number}`,
          referenceId: order.id,
        },
        linkSettings,
        redirectUrl,
      }),
    });

    if (!beamResponse.ok) {
      const errBody = await beamResponse.text();
      console.error('Beam API error:', beamResponse.status, errBody);
      return NextResponse.json({ error: 'Failed to create payment link' }, { status: 500 });
    }

    const beamResult = await beamResponse.json();

    // 8. Cancel any existing pending gateway payment records for this order
    // (customer might have clicked pay before but didn't complete)
    await supabaseAdmin.from('payment_records').update({
      status: 'cancelled',
      gateway_status: 'CANCELLED',
      updated_at: new Date().toISOString(),
    })
      .eq('order_id', order.id)
      .eq('company_id', companyId)
      .eq('payment_method', 'payment_gateway')
      .eq('status', 'pending');

    // Create new payment record
    await supabaseAdmin.from('payment_records').insert({
      company_id: companyId,
      order_id: order.id,
      payment_method: 'payment_gateway',
      amount: order.total_amount,
      status: 'pending',
      gateway_provider: 'beam',
      gateway_payment_link_id: beamResult.paymentLinkId,
      gateway_status: beamResult.status || 'ACTIVE',
      gateway_raw_response: beamResult,
    });

    // 9. Do NOT change payment_status here — keep it 'pending' until
    // Beam webhook confirms actual payment. This allows the customer
    // to go back and retry if they didn't complete the payment.

    // 10. Return payment URL
    return NextResponse.json({
      payment_url: beamResult.url,
      payment_link_id: beamResult.paymentLinkId,
    });
  } catch (error) {
    console.error('Create payment link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
