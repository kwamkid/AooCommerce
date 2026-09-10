// Path: app/marketing/broadcast/new/components/product-search.ts
//
// ค้นสินค้าให้ตัวแก้ไขบรอดแคสต์ (การ์ดจากสินค้า · "ไปที่สินค้า") + แปลงผลค้นหาเป็นการ์ดสินค้าชนิดกลาง
// หน้าสร้างกับหน้าลองใน /dev/design ใช้ตัวเดียวกัน — ค้นฝั่ง server ของบริษัทที่ล็อกอินอยู่ (ต่อกับ useServerSearch)

import type { ProductSearchItem } from '@/components/ui/ProductSearchInput';
import { apiFetch } from '@/lib/api-client';
import type { ServerSearchPage } from '@/lib/useServerSearch';
import type { BroadcastProductCard } from '@/lib/broadcast/content';

export async function fetchProductPage(q: string): Promise<ServerSearchPage<ProductSearchItem>> {
  const res = await apiFetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=40`);
  if (!res.ok) throw new Error('product search failed');
  const json = await res.json();
  const rows: ProductSearchItem[] = (json.items || []).map((r: Record<string, unknown>) => ({
    id: String(r.variation_id),
    product_id: String(r.product_id),
    code: String(r.code ?? ''),
    name: String(r.name ?? ''),
    image: (r.image_url as string) ?? null,
    variation_label: (r.variation_label as string) ?? undefined,
    default_price: Number(r.default_price) || 0,
    discount_price: Number(r.discount_price) || 0,
  }));
  return { rows, complete: json.complete !== false };
}

/** การ์ดสินค้าจากผลค้นหา — ใช้ทั้งการ์ดจากสินค้าและ "ไปที่สินค้า" ของทุกจุดที่กดได้ */
export function productSearchItemToCard(p: ProductSearchItem): BroadcastProductCard {
  const discounted = !!p.discount_price && p.discount_price > 0;
  return {
    product_id: p.product_id,
    variation_id: p.id,
    // ชื่อบนการ์ดต้องแยกตัวเลือกออกจากกัน ไม่งั้นได้การ์ด "YOYO 0+ Newborn Pack" 5 ใบเหมือนกันหมด
    name: p.variation_label ? `${p.name} - ${p.variation_label}` : p.name,
    image_url: p.image ?? null,
    price: discounted ? (p.discount_price as number) : p.default_price ?? 0,
    // ราคาปกติเก็บไว้เฉพาะตอนลดจริง — การ์ดถึงจะขึ้นป้าย "ลด N%" กับราคาขีดฆ่าได้
    compare_at_price: discounted ? p.default_price ?? null : null,
    url: null,
  };
}
