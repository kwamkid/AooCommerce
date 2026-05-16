import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';

interface BankAccount {
  bank_code: string;
  account_number: string;
  account_name: string;
}

interface Body {
  cash?: boolean;
  promptpay?: { id: string; name: string } | null;
  banks?: BankAccount[];
  // Reserved for future: card_terminal, payment_gateway. Wizard doesn't collect those today.
}

// POST — Step 4 of wizard. Insert payment_channels rows for ticked options.
// Idempotent across wizard retries: deletes wizard-seeded rows first then re-inserts.
// Only touches the 'bill_online' channel_group; users add more later in /settings/payment-channels.
export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminRole(auth.companyRoles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const wantCash = body?.cash !== false; // default true (prefill is cash on)
  const promptpay = body?.promptpay && body.promptpay.id ? body.promptpay : null;
  const banks: BankAccount[] = Array.isArray(body?.banks)
    ? body!.banks!.filter(b => b && b.bank_code && b.account_number)
    : [];

  // Wipe any existing wizard-seeded channels so retries don't duplicate.
  // We only delete the rows we'd recreate (cash + bank_transfer in bill_online),
  // preserving anything the user may have added manually.
  await supabaseAdmin
    .from('payment_channels')
    .delete()
    .eq('company_id', auth.companyId)
    .eq('channel_group', 'bill_online')
    .in('type', ['cash', 'bank_transfer']);

  const rows: Array<Record<string, unknown>> = [];
  let sort = 0;

  if (wantCash) {
    rows.push({
      company_id: auth.companyId,
      channel_group: 'bill_online',
      type: 'cash',
      name: 'เงินสด',
      is_active: true,
      sort_order: sort++,
      config: { description: 'รับเงินสดจากลูกค้า / จ่ายหน้าร้าน' },
    });
  }

  if (promptpay) {
    rows.push({
      company_id: auth.companyId,
      channel_group: 'bill_online',
      type: 'bank_transfer',
      name: 'พร้อมเพย์',
      is_active: true,
      sort_order: sort++,
      config: {
        promptpay_id: promptpay.id.trim(),
        account_name: promptpay.name?.trim() || '',
      },
    });
  }

  for (const b of banks) {
    rows.push({
      company_id: auth.companyId,
      channel_group: 'bill_online',
      type: 'bank_transfer',
      name: `ธนาคาร ${b.bank_code}`,
      is_active: true,
      sort_order: sort++,
      config: {
        bank_code: b.bank_code,
        account_number: b.account_number.trim(),
        account_name: b.account_name?.trim() || '',
      },
    });
  }

  // Always keep at least one channel to receive payment — fall back to cash if user
  // unticked everything (defensive: prefill ensures cash is on, but be safe).
  if (rows.length === 0) {
    rows.push({
      company_id: auth.companyId,
      channel_group: 'bill_online',
      type: 'cash',
      name: 'เงินสด',
      is_active: true,
      sort_order: 0,
      config: {},
    });
  }

  const { error } = await supabaseAdmin.from('payment_channels').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: rows.length });
}
