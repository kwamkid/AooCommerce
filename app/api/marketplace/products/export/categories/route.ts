// หมวดหมู่ของร้าน (ต้นไม้แบนแล้ว) — **route เดียวทุกแพลตฟอร์ม**
//   GET ?account_id=   → { platform, categories: [{id, parent_id, name, is_leaf}] }
// (route เดิม `/api/shopee/categories` ลบแล้ว ห้ามสร้าง route หมวดหมู่ต่อแพลตฟอร์มอีก)

import { NextRequest, NextResponse } from 'next/server';
import { resolveExportContext, isResponse, errorResponse } from '../helpers';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ctx = await resolveExportContext(request, searchParams.get('account_id'));
    if (isResponse(ctx)) return ctx;

    const categories = await ctx.adapter.getCategories(ctx.account);
    return NextResponse.json({ platform: ctx.platform, categories });
  } catch (error) {
    return errorResponse(error, 'โหลดหมวดหมู่ไม่สำเร็จ');
  }
}
