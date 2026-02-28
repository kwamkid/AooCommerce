// Path: app/api/supplier-portal/[supplierId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { validatePortalAccess } from '@/lib/supplier-portal/validate';

// GET - Validate supplier + return basic info
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ supplierId: string }> }
) {
  try {
    const { supplierId } = await params;
    const result = await validatePortalAccess(supplierId);

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
