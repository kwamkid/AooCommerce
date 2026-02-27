import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import crypto from 'crypto';

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `SUP-${code}`;
}

// POST - Generate/regenerate supplier portal access code
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify supplier belongs to company
    const { data: supplier, error: fetchError } = await supabaseAdmin
      .from('suppliers')
      .select('id')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (fetchError || !supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Generate unique code (retry on collision)
    let accessCode = generateAccessCode();
    let retries = 5;
    while (retries > 0) {
      const { data, error } = await supabaseAdmin
        .from('suppliers')
        .update({ access_code: accessCode, portal_enabled: true })
        .eq('id', id)
        .eq('company_id', auth.companyId)
        .select('id, access_code, portal_enabled')
        .single();

      if (!error && data) {
        return NextResponse.json({ data });
      }

      if (error?.code === '23505') {
        // Unique constraint violation — regenerate
        accessCode = generateAccessCode();
        retries--;
        continue;
      }

      throw error;
    }

    return NextResponse.json({ error: 'Failed to generate unique code' }, { status: 500 });
  } catch (error) {
    console.error('POST regenerate-code error:', error);
    return NextResponse.json({ error: 'Failed to regenerate code' }, { status: 500 });
  }
}
