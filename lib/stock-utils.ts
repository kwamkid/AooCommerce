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

// ===== ตรวจรายการของเอกสารสต็อก (รับเข้า/เบิกออก/โอนย้าย) =====
//
// ⛔ ต้องตรวจ **ทุกบรรทัดให้ครบก่อนเขียนอะไรลง DB ตัวแรก** — ของเดิมวนตัดสต็อกไปเรื่อย ๆ
// แล้วค่อยพบว่าบรรทัดท้าย ๆ ของไม่พอ จบด้วยใบครึ่ง ๆ กลาง ๆ ที่ผู้ใช้ต้องตามแก้เอง
// (ยังไม่ได้ทำ transaction จริง — atomicity เต็มรูปแบบยกยอดไว้ก่อน)

export interface StockDocLine {
  variation_id: string;
  quantity: number;
  /** บรรทัดต้นฉบับจาก body — ผู้เรียกยังอ่าน reason/notes/unit_cost ต่อได้ */
  raw: Record<string, unknown>;
}

/**
 * แปลง `items` จาก body เป็นบรรทัดที่ใช้ได้ + ข้อความผิดพลาดภาษาไทยของบรรทัดที่ใช้ไม่ได้
 * (บรรทัดซ้ำ variation เดียวกันก็นับเป็นข้อผิดพลาด — ยอดจะซ้อนกันโดยผู้ใช้ไม่รู้ตัว)
 */
export function parseStockDocLines(items: unknown): { lines: StockDocLine[]; errors: string[] } {
  const lines: StockDocLine[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  if (!Array.isArray(items) || items.length === 0) {
    return { lines, errors: ['กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ'] };
  }

  items.forEach((item, i) => {
    const no = i + 1;
    const row = (item ?? {}) as Record<string, unknown>;
    const variationId = typeof row.variation_id === 'string' ? row.variation_id.trim() : '';
    const quantity = Number(row.quantity);

    if (!variationId) {
      errors.push(`รายการที่ ${no}: ไม่พบสินค้า`);
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`รายการที่ ${no}: จำนวนต้องมากกว่า 0`);
      return;
    }
    if (seen.has(variationId)) {
      errors.push(`รายการที่ ${no}: สินค้าซ้ำกับรายการก่อนหน้า`);
      return;
    }
    seen.add(variationId);
    lines.push({ variation_id: variationId, quantity, raw: row });
  });

  return { lines, errors };
}

/** ชื่อที่อ่านออกของตัวเลือก — ใช้เฉพาะตอนสร้างข้อความผิดพลาด */
async function variationLabels(companyId: string, ids: string[]): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin
    .from('product_variations')
    .select('id, variation_label, sku, product:products(name)')
    .eq('company_id', companyId)
    .in('id', ids);

  const map: Record<string, string> = {};
  for (const row of (data ?? []) as unknown as {
    id: string; variation_label: string | null; sku: string | null; product: { name?: string } | null;
  }[]) {
    const name = row.product?.name || row.sku || row.id;
    map[row.id] = row.variation_label ? `${name} - ${row.variation_label}` : name;
  }
  return map;
}

/**
 * ยอดพร้อมใช้ในคลังต้นทางพอทุกบรรทัดไหม — คืนข้อความผิดพลาดภาษาไทยรายบรรทัด (ว่าง = ผ่าน)
 *
 * ใช้ RPC `get_variation_stock` แทนการอ่าน `inventory` ตรง เพราะสินค้าชุดไม่มีแถว `inventory`
 * ของตัวเอง (ยอดต้องมาจากชิ้นส่วนที่เหลือน้อยสุด) — อ่าน inventory ตรงจะตัดสินว่า 0 ทุกใบ
 */
export async function checkStockAvailability(
  companyId: string,
  warehouseId: string,
  lines: StockDocLine[],
): Promise<string[]> {
  if (lines.length === 0) return [];

  const ids = lines.map(l => l.variation_id);
  const { data, error } = await supabaseAdmin.rpc('get_variation_stock', {
    p_company_id: companyId,
    p_variation_ids: ids,
    p_warehouse_id: warehouseId,
  });
  if (error) throw new Error(error.message);

  const stock = (data ?? {}) as Record<string, { quantity?: unknown; available?: unknown }>;
  const short = lines.filter(l => l.quantity > (Number(stock[l.variation_id]?.available) || 0));
  if (short.length === 0) return [];

  const labels = await variationLabels(companyId, short.map(l => l.variation_id));
  return short.map(l => {
    const available = Number(stock[l.variation_id]?.available) || 0;
    const label = labels[l.variation_id] || l.variation_id;
    return `${label}: มี ${available.toLocaleString()} ชิ้นพร้อมใช้ แต่ขอ ${l.quantity.toLocaleString()} ชิ้น`;
  });
}
