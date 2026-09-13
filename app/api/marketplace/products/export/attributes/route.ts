// คุณสมบัติที่หมวดนั้นของร้านขอ — **route เดียวทุกแพลตฟอร์ม**
//   GET ?account_id=&category_id=  → { attributes: [{id, name, required, input_type, options}] }

import { NextRequest, NextResponse } from 'next/server';
import { resolveExportContext, isResponse, errorResponse } from '../helpers';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category_id');
    if (!categoryId) {
      return NextResponse.json({ error: 'category_id is required' }, { status: 400 });
    }

    const ctx = await resolveExportContext(request, searchParams.get('account_id'));
    if (isResponse(ctx)) return ctx;

    const attributes = await ctx.adapter.getCategoryAttributes(ctx.account, categoryId);
    return NextResponse.json({ platform: ctx.platform, attributes });
  } catch (error) {
    return errorResponse(error, 'โหลดคุณสมบัติของหมวดไม่สำเร็จ');
  }
}
