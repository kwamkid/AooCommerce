// ข้อมูลอ้างอิงจาก "ร้านที่สินค้าตัวนี้ขายอยู่แล้ว" — `GET ?account_id=&product_ids=a,b,c`
//
// ใช้ตอนจะส่งสินค้าขึ้นร้านใหม่: ชื่อ/ราคา/น้ำหนัก/แบรนด์ ที่เคยตั้งไว้บนร้านอื่น
// ใกล้เคียงกับที่ควรใช้บนร้านใหม่มากกว่าข้อมูลกลางในระบบ (ชื่อยาวกว่า · ราคาบวก
// ค่าธรรมเนียมไว้แล้ว) — ทั้งหมดอ่านจาก `marketplace_product_links` ที่ซิงค์ไว้แล้ว
// **ไม่ยิง API ของแพลตฟอร์มใด ๆ**
//
// ⛔ ห้าม `switch (platform)` ที่นี่ — ป้ายชื่อร้านมาจากแถว link เอง

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveExportContext, isResponse, errorResponse } from '../helpers';
import { sellingPrice } from '@/lib/product-display';

export const maxDuration = 60;

interface LinkRow {
  platform: string;
  account_id: string;
  account_name: string | null;
  product_id: string;
  variation_id: string | null;
  platform_product_name: string | null;
  platform_price: number | null;
  platform_discount_price: number | null;
  weight: number | null;
  shopee_brand_name: string | null;
  shopee_attributes: unknown;
  updated_at: string | null;
}

/** คุณสมบัติที่เคยกรอกไว้บนร้านเดิม — เก็บเป็น "ชื่อ + ค่า" ไม่ใช่ id */
interface ReferenceAttribute {
  name: string;
  values: string[];
}

/**
 * แกะคุณสมบัติจากก้อนที่ขา import จดไว้
 * ⛔ เก็บเป็นชื่อเท่านั้น — id ของแต่ละแพลตฟอร์มเป็นคนละทะเบียนกัน ส่งข้ามเจ้าไม่ได้
 */
function readAttributes(raw: unknown): ReferenceAttribute[] {
  if (!Array.isArray(raw)) return [];
  const out: ReferenceAttribute[] = [];
  for (const item of raw) {
    const row = item as {
      original_attribute_name?: string;
      attribute_name?: string;
      attribute_value_list?: { original_value_name?: string; value_name?: string }[];
    };
    const name = (row.original_attribute_name || row.attribute_name || '').trim();
    if (!name) continue;
    const values = (row.attribute_value_list || [])
      .map(v => (v.original_value_name || v.value_name || '').trim())
      .filter(Boolean);
    if (values.length > 0) out.push({ name, values });
  }
  return out;
}

/** ข้อมูลจากร้านหนึ่งของสินค้าหนึ่ง — ฝั่งหน้าเลือกได้ว่าจะเอาของร้านไหน */
interface ReferenceSource {
  account_id: string;
  platform: string;
  account_name: string;
  title: string | null;
  weight: number | null;
  brand_name: string | null;
  attributes: ReferenceAttribute[];
  /** ราคาต่อตัวเลือก (variation_id → ราคาที่ตั้งไว้บนร้านนั้น) */
  prices: Record<string, number>;
  /** ครบแค่ไหน — ใช้เรียงว่าร้านไหนควรเป็นค่าตั้งต้น */
  filled: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ctx = await resolveExportContext(request, searchParams.get('account_id'));
    if (isResponse(ctx)) return ctx;

    const productIds = (searchParams.get('product_ids') || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (productIds.length === 0) {
      return NextResponse.json({ references: {}, variations: {} });
    }

    const { data, error } = await supabaseAdmin
      .from('marketplace_product_links')
      .select(
        'platform, account_id, account_name, product_id, variation_id, platform_product_name,' +
        ' platform_price, platform_discount_price, weight, shopee_brand_name, shopee_attributes, updated_at',
      )
      .eq('company_id', ctx.companyId)
      .in('product_id', productIds)
      // ร้านที่กำลังจะส่งขึ้นไม่ใช่ "ร้านอ้างอิง" (ถ้ามีอยู่แล้วก็ส่งซ้ำไม่ได้อยู่ดี)
      .neq('account_id', ctx.account.id)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message);

    // product_id → account_id → ข้อมูลของร้านนั้น (แถวเป็นรายตัวเลือก จึงต้องยุบ)
    const byProduct = new Map<string, Map<string, ReferenceSource>>();

    for (const row of (data || []) as unknown as LinkRow[]) {
      let sources = byProduct.get(row.product_id);
      if (!sources) {
        sources = new Map();
        byProduct.set(row.product_id, sources);
      }
      let source = sources.get(row.account_id);
      if (!source) {
        source = {
          account_id: row.account_id,
          platform: row.platform,
          account_name: row.account_name || '',
          title: null,
          weight: null,
          brand_name: null,
          attributes: [],
          prices: {},
          filled: 0,
        };
        sources.set(row.account_id, source);
      }

      // แถวเรียงใหม่→เก่า ค่าแรกที่เจอคือค่าล่าสุดของร้านนั้น
      if (!source.title && row.platform_product_name) source.title = row.platform_product_name;
      if (source.weight === null && row.weight && row.weight > 0) source.weight = Number(row.weight);
      if (!source.brand_name && row.shopee_brand_name) source.brand_name = row.shopee_brand_name;
      if (source.attributes.length === 0) source.attributes = readAttributes(row.shopee_attributes);

      // ราคาที่ลูกค้าจ่ายจริงบนร้านนั้น (มีราคาลดใช้ราคาลด — กติกาเดียวกับฝั่งเรา)
      const price = Number(row.platform_discount_price || 0) > 0
        ? Number(row.platform_discount_price)
        : Number(row.platform_price || 0);
      if (row.variation_id && price > 0 && source.prices[row.variation_id] === undefined) {
        source.prices[row.variation_id] = price;
      }
    }

    // ตัวเลือกของสินค้าแต่ละตัว — หน้าตั้งค่าต้องใช้ตอนให้แก้ราคารายตัวเลือก
    const { data: variationRows } = await supabaseAdmin
      .from('product_variations')
      .select('id, product_id, variation_label, default_price, discount_price')
      .eq('company_id', ctx.companyId)
      .in('product_id', productIds)
      .eq('is_active', true)
      // ตัวเลือกที่ลบจากฟอร์มยัง `is_active = true` — ต้องดู `deleted_at` ด้วย
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const variations: Record<string, {
      id: string; label: string; price: number;
    }[]> = {};
    for (const row of (variationRows || []) as {
      id: string; product_id: string; variation_label: string | null;
      default_price: number | null; discount_price: number | null;
    }[]) {
      // ราคาที่ลูกค้าจ่ายจริงในระบบ (มีส่วนลดใช้ส่วนลด — กติกาเดียวกับ `sellingPrice`)
      const price = sellingPrice(row);
      (variations[row.product_id] ||= []).push({
        id: row.id,
        label: row.variation_label || '',
        price,
      });
    }

    const references: Record<string, ReferenceSource[]> = {};
    for (const [productId, sources] of byProduct) {
      const list = [...sources.values()];
      for (const s of list) {
        s.filled = (s.title ? 1 : 0) + (Object.keys(s.prices).length > 0 ? 1 : 0)
          + (s.weight ? 1 : 0) + (s.brand_name ? 1 : 0) + (s.attributes.length > 0 ? 1 : 0);
      }
      // ร้านที่ข้อมูลครบที่สุดขึ้นก่อน = ค่าตั้งต้นที่หน้าเลือกให้เอง
      list.sort((a, b) => b.filled - a.filled);
      references[productId] = list;
    }

    return NextResponse.json({ references, variations });
  } catch (error) {
    return errorResponse(error, 'อ่านข้อมูลจากร้านเดิมไม่สำเร็จ');
  }
}
