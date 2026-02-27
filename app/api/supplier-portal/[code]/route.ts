// Path: app/api/supplier-portal/[code]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { validatePortalAccess } from '@/lib/supplier-portal/validate';

// GET - Validate code + return supplier basic info
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const result = await validatePortalAccess(code);

    if (!result.valid || !result.context) {
      return NextResponse.json({ error: result.error || 'Portal unavailable' }, { status: 403 });
    }

    return NextResponse.json({
      supplier: {
        name: result.context.supplierName,
        type: result.context.supplierType,
      },
      company: {
        name: result.context.companyName,
      },
    });
  } catch (error) {
    console.error('Portal validate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
