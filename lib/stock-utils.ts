import { supabaseAdmin } from '@/lib/supabase-admin';

export interface StockConfig {
  stockEnabled: boolean;
  maxWarehouses: number | null; // null = unlimited
  allowOversell: boolean; // true = allow selling when stock is 0 or negative
}

/**
 * Get stock configuration for a company based on their package tier
 * ถ้ามี subscription → ใช้ค่าจาก package.features
 * ถ้าไม่มี subscription → default เปิด stock ไม่จำกัด
 */
export async function getStockConfig(companyId: string): Promise<StockConfig> {
  try {
    const [subResult, companyResult] = await Promise.all([
      supabaseAdmin
        .from('user_subscriptions')
        .select('package:packages(features)')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .single(),
      supabaseAdmin
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .single(),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features = (subResult.data?.package as any)?.features || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const companySettings = (companyResult.data?.settings as any) || {};

    return {
      // Default เปิด stock ถ้าไม่ได้ระบุ stock_enabled: false ใน features
      stockEnabled: features.stock_enabled !== false,
      maxWarehouses: features.max_warehouses ?? null,
      // Default true (allow oversell) — เหมือนพฤติกรรมเดิม
      allowOversell: companySettings.allow_oversell !== false,
    };
  } catch {
    // ไม่มี subscription หรือ query error → default เปิดหมด
    return { stockEnabled: true, maxWarehouses: null, allowOversell: true };
  }
}

/**
 * Check if company can create another warehouse based on tier limits
 */
export async function canCreateWarehouse(companyId: string): Promise<{ allowed: boolean; current: number; max: number | null }> {
  const config = await getStockConfig(companyId);

  if (!config.stockEnabled) {
    return { allowed: false, current: 0, max: 0 };
  }

  // Unlimited
  if (config.maxWarehouses === null) {
    return { allowed: true, current: 0, max: null };
  }

  const { count } = await supabaseAdmin
    .from('warehouses')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_active', true);

  const current = count || 0;
  return {
    allowed: current < config.maxWarehouses,
    current,
    max: config.maxWarehouses,
  };
}
