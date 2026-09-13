// ค้นแบรนด์บนร้าน — **route เดียวทุกแพลตฟอร์ม**
//   GET ?account_id=&q=  → { supported, brands: [{id, name}] }
// แพลตฟอร์มที่ไม่มีทะเบียนแบรนด์ให้ค้น คืน `supported: false` (หน้า wizard ซ่อนช่องให้เอง)

import { NextRequest, NextResponse } from 'next/server';
import { resolveExportContext, isResponse, errorResponse } from '../helpers';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ctx = await resolveExportContext(request, searchParams.get('account_id'));
    if (isResponse(ctx)) return ctx;

    if (!ctx.adapter.searchBrands) {
      return NextResponse.json({ platform: ctx.platform, supported: false, brands: [] });
    }

    const brands = await ctx.adapter.searchBrands(ctx.account, searchParams.get('q') || '');
    return NextResponse.json({ platform: ctx.platform, supported: true, brands });
  } catch (error) {
    return errorResponse(error, 'ค้นแบรนด์ไม่สำเร็จ');
  }
}
