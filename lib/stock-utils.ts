import { supabaseAdmin } from '@/lib/supabase-admin';

export interface StockConfig {
  stockEnabled: boolean;
  maxWarehouses: number | null; // null = unlimited
}

/**
 * Get stock configuration for a user based on their package tier
 * TODO: เมื่อมีระบบ package/subscription แล้ว ให้เปลี่ยนกลับไปดึงจาก user_subscriptions
 */
export async function getStockConfig(_userId: string): Promise<StockConfig> {
  // Hardcode เป็น enterprise (เปิด stock, คลังไม่จำกัด) ไปก่อน
  return { stockEnabled: true, maxWarehouses: null };
}

/**
 * Check if company can create another warehouse based on tier limits
 */
export async function canCreateWarehouse(companyId: string, userId: string): Promise<{ allowed: boolean; current: number; max: number | null }> {
  const config = await getStockConfig(userId);

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
