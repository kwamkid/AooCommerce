// ของใช้ร่วมของ route ส่งสินค้าขึ้นร้าน (โหลดร้าน · เช็คสิทธิ์ · เช็คโควตา)
// ⛔ ห้าม `switch (platform)` ที่นี่ — ทุกอย่างผ่านทะเบียน adapter

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import type { QuotaPlatform } from '@/lib/marketplace/platforms';
import {
  getProductExportAdapter,
  exportPlatformLabel,
  type ProductExportAccount,
  type ProductExportAdapter,
} from '@/lib/marketplace/product-export-adapter';

export interface ExportRouteContext {
  companyId: string;
  account: ProductExportAccount & Record<string, unknown>;
  adapter: ProductExportAdapter;
  platform: string;
}

/**
 * ด่านเดียวของทุก route ในกลุ่มนี้ — คืน `NextResponse` เมื่อไม่ผ่าน
 * (สิทธิ์ `marketplace.push` · ร้านเป็นของบริษัทนี้จริง · platform มี adapter · โควตายังไม่เต็ม)
 */
export async function resolveExportContext(
  request: NextRequest,
  accountId: string | null,
): Promise<ExportRouteContext | NextResponse> {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId || !can(auth, 'marketplace.push')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!accountId) {
    return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
  }

  const { data } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('company_id', auth.companyId)
    .eq('is_active', true)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: 'ไม่พบร้านนี้' }, { status: 404 });

  const account = data as unknown as ProductExportAccount & Record<string, unknown>;
  const platform = (account.platform as string) || '';
  const adapter = getProductExportAdapter(platform);
  if (!adapter) {
    return NextResponse.json(
      { error: `ยังไม่รองรับส่งสินค้าขึ้น ${exportPlatformLabel(platform)}` },
      { status: 400 },
    );
  }

  const quota = await isQuotaBlocked(platform as QuotaPlatform, 'product');
  if (quota.blocked) {
    return NextResponse.json(
      { error: `${exportPlatformLabel(platform)} จำกัดความถี่ API ชั่วคราว — ระบบพักการยิงอยู่ ลองใหม่ภายหลัง` },
      { status: 429 },
    );
  }

  return { companyId: auth.companyId, account, adapter, platform };
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export function errorResponse(error: unknown, fallback: string): NextResponse {
  console.error(`[Marketplace Export] ${fallback}:`, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}
