// Path: app/api/supplier-portal/auth/route.ts
// Validate access code → return supplier ID for redirect
import { NextRequest, NextResponse } from 'next/server';
import { validateAccessCode } from '@/lib/supplier-portal/validate';

export async function POST(request: NextRequest) {
  try {
    const { access_code } = await request.json();

    if (!access_code || typeof access_code !== 'string') {
      return NextResponse.json({ error: 'Access code required' }, { status: 400 });
    }

    const result = await validateAccessCode(access_code.trim());

    if (!result.valid || !result.supplierId) {
      return NextResponse.json({ error: 'Invalid access code' }, { status: 403 });
    }

    return NextResponse.json({ supplier_id: result.supplierId });
  } catch (error) {
    console.error('Portal auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
