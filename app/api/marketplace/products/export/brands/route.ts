// ค้นแบรนด์บนร้าน — **route เดียวทุกแพลตฟอร์ม**
//   GET ?account_id=&q=&category_id=  → { supported, needs_category, brands: [{id, name}] }
// แพลตฟอร์มที่ไม่มีทะเบียนแบรนด์ให้ค้น คืน `supported: false` (หน้า wizard ซ่อนช่องให้เอง)
// `needs_category` = ทะเบียนแบรนด์แยกตามหมวด (Shopee) — ไม่ส่ง category_id มาจะได้รายการว่าง

import { NextRequest, NextResponse } from 'next/server';
import { resolveExportContext, isResponse, errorResponse } from '../helpers';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ctx = await resolveExportContext(request, searchParams.get('account_id'));
    if (isResponse(ctx)) return ctx;

    if (!ctx.adapter.searchBrands) {
      return NextResponse.json({ platform: ctx.platform, supported: false, needs_category: false, brands: [] });
    }

    const needsCategory = ctx.adapter.brandsNeedCategory === true;
    const categoryId = searchParams.get('category_id') || null;
    const brands = needsCategory && !categoryId
      ? []
      : await ctx.adapter.searchBrands(ctx.account, searchParams.get('q') || '', { categoryId });
    return NextResponse.json({ platform: ctx.platform, supported: true, needs_category: needsCategory, brands });
  } catch (error) {
    return errorResponse(error, 'ค้นแบรนด์ไม่สำเร็จ');
  }
}
