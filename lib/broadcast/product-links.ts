// Path: lib/broadcast/product-links.ts
//
// เติมลิงก์หน้าสินค้าในหน้าร้านออนไลน์ให้การ์ดสินค้าที่ผู้ใช้ไม่ได้ใส่ลิงก์เอง
//
// ทำไมต้องมี: ร้านค้าไม่ควรต้องไปเปิดหน้าร้านแล้วคัดลอก URL มาแปะทีละใบ —
// **ลิงก์เปลี่ยนเองเมื่อร้านเปิด storefront ไม่ต้องแก้ใบ** · ยังไม่เปิดร้าน = ไม่มีหน้าสินค้า
// ให้ลิงก์ไป ปุ่มจึงตกไปเป็น "สนใจสินค้านี้" ที่ส่งข้อความเข้าห้องแชทแทน (ขายต่อได้เหมือนกัน)
//
// เติมตอน **สร้างใบ** ไม่ใช่ตอนส่ง — ใบที่ตั้งเวลาไว้จะได้ยิงลิงก์ชุดเดียวกับที่ผู้ใช้เห็น
// ตอนกดยืนยัน ไม่ใช่ชุดที่เปลี่ยนไปแล้วโดยไม่มีใครรู้
//
// server-only (แตะ supabaseAdmin) — ห้าม import จากหน้าจอ

import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseStorefront, storefrontUrl } from '@/lib/storefront';
import type { BroadcastProductCard } from './content';

/**
 * โฮสต์สาธารณะของระบบ — ลิงก์ที่ส่งออกไปกับข้อความต้องเป็น URL เต็มเสมอ
 * (path เปล่า ๆ เปิดจากในแอป LINE ไม่ได้) · ค่าสำรองตรงกับ `lib/chat/channel-health.ts`
 */
const PUBLIC_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://aoocommerce.vercel.app')
  .replace(/\/+$/, '');

/** ร้านที่ยังไม่ตั้งโดเมนของตัวเอง `storefrontUrl()` คืน path ภายใน — ต้องเติมโฮสต์ให้ */
function absolute(url: string): string {
  return url.startsWith('/') ? `${PUBLIC_BASE_URL}${url}` : url;
}

interface ProductLinkRow {
  id: string;
  slug: string | null;
  storefront_visible: boolean | null;
  is_active: boolean | null;
}

export async function fillStorefrontProductLinks(
  companyId: string,
  products: BroadcastProductCard[],
): Promise<BroadcastProductCard[]> {
  if (products.length === 0) return products;

  // ⚠️ **ห้ามทับลิงก์ที่ผู้ใช้พิมพ์เอง** — เขาอาจตั้งใจส่งไปหน้าโปรฯ ไม่ใช่หน้าสินค้า
  const needIds = [...new Set(
    products.filter(p => !p.url && p.product_id).map(p => p.product_id as string),
  )];
  if (needIds.length === 0) return products;

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('settings, storefront_slug')
    .eq('id', companyId)
    .maybeSingle();

  const slug = ((company?.storefront_slug as string | null) || '').trim();
  const cfg = parseStorefront(company?.settings as Record<string, unknown> | null);
  // ไม่มีชื่อลิงก์ = เปิดหน้าร้านไม่ได้อยู่แล้ว (API กันไว้ตั้งแต่ตอนกดเปิด)
  if (!cfg.enabled || !slug) return products;

  const { data } = await supabaseAdmin
    .from('products')
    .select('id, slug, storefront_visible, is_active')
    .eq('company_id', companyId)
    .in('id', needIds);

  const linkById = new Map<string, string>();
  for (const r of (data || []) as ProductLinkRow[]) {
    // ซ่อนจากหน้าร้าน/ปิดการขายอยู่ = ลิงก์ไปแล้วเจอ 404 — ปล่อยให้ตกไปเป็น "สนใจสินค้านี้"
    if (!r.slug || !r.storefront_visible || !r.is_active) continue;
    linkById.set(r.id, absolute(storefrontUrl(cfg, slug, `/p/${r.slug}`)));
  }
  if (linkById.size === 0) return products;

  return products.map(p => (
    !p.url && p.product_id && linkById.has(p.product_id)
      ? { ...p, url: linkById.get(p.product_id) as string }
      : p
  ));
}
