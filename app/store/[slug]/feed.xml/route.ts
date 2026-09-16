// Path: app/store/[slug]/feed.xml/route.ts
//
// ฟีดสินค้าสำหรับ **Google Merchant Center** (RSS 2.0 + namespace `g:`)
// ร้านเอา URL นี้ไปใส่เป็น "scheduled fetch" ใน Merchant Center แล้วมันดึงเองตามรอบ
//
// ทำไมต้องมีฟีด ทั้งที่หน้าสินค้ามี JSON-LD อยู่แล้ว:
//   • JSON-LD = ทาง *free listings* — Google คลานหน้าเว็บเองแล้วอ่าน ช้าและเลือกไม่ได้ว่าอะไรเข้าบ้าง
//   • ฟีด = ทางหลักของ Merchant — คุมได้ว่าส่งอะไร อัปเดตทุกวัน และเป็นทางเดียวที่ลง Shopping ads ได้
//   ⇒ ทั้งสองทางต้องบอกราคา/สต็อกตรงกันเสมอ ไม่งั้น Merchant ตีตก "price mismatch"
//   ทั้งคู่จึงอ่านจาก `getStorefrontCatalog` ตัวเดียวกับที่ลูกค้าเห็นบนหน้าร้าน
//
// ⛔ **1 แถว = 1 ตัวเลือก (variation) ไม่ใช่ 1 สินค้า** — Merchant ต้องการราคา/สต็อก/รหัส
//    ต่อสิ่งที่ซื้อได้จริง · สินค้าที่มีหลายตัวเลือกผูกกันด้วย `item_group_id`
//
// ⛔ ต้องมี `public_base_url` — Merchant บังคับให้ยืนยันความเป็นเจ้าของโดเมน และเราสั่ง
//    noindex ทุกหน้าที่ยังอยู่บนโดเมน aoo อยู่แล้ว (ส่งฟีดของ URL ที่ห้าม index = โดนตีตก)

import { NextResponse } from 'next/server';
import {
  getStorefrontCompany, getStorefrontCatalog, getStorefrontDelivery,
} from '@/lib/storefront-server';
import { storefrontAbsoluteUrl, type StorefrontProduct } from '@/lib/storefront';

export const revalidate = 3600;

/** ดึง catalog ทีละหน้าเท่านี้ */
const FEED_PAGE = 500;
/** เพดานจำนวนแถวในฟีดเดียว — Merchant รับได้ถึงหลักล้าน ตัวเลขนี้กันหน่วยความจำของ route เอง */
const FEED_MAX_ITEMS = 10_000;
/** Merchant ตัด title ที่ 150 และ description ที่ 5,000 */
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 5000;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // อักขระควบคุมทำให้ XML พังทั้งไฟล์ — ร้านพิมพ์อะไรมาก็ได้ในคำอธิบายสินค้า
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function clamp(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

function tag(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return `      <${name}>${xmlEscape(String(value))}</${name}>\n`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company || !company.config.public_base_url) {
    return new NextResponse('Not found', { status: 404 });
  }

  const cfg = company.config;
  const shopName = cfg.display_name || company.name;

  // ⚠️ **ไม่ใช้ `catalogOptionsFor(company)`** ต่างจาก sitemap/llms.txt โดยตั้งใจ:
  //   • `hideOutOfStock` เป็นค่าตั้งของ**การแสดงผล** — ฟีดส่งของหมดได้ปกติ แค่บอก
  //     `availability: out_of_stock` (หน้าสินค้ายังเปิดได้ Merchant จึงไม่ถือว่าลิงก์เสีย)
  //   • `hideNoImage` กลับกัน — Merchant **บังคับ** ต้องมี `image_link` ⇒ กรองทิ้งเสมอ
  //     ไม่ว่าร้านจะตั้งให้โชว์หรือไม่
  const products: StorefrontProduct[] = [];
  for (let page = 1; products.length < FEED_MAX_ITEMS; page++) {
    const result = await getStorefrontCatalog(
      company.id,
      { sort: 'name', hideOutOfStock: false, hideNoImage: true, page, pageSize: FEED_PAGE },
      company.features.stock,
    );
    products.push(...result.products);
    if (result.products.length === 0 || page * FEED_PAGE >= result.total) break;
  }

  // ค่าจัดส่ง — เอาเฉพาะโซนที่คิดค่าคงที่ · โซน Lalamove คิดตามระยะทางจริง ประกาศเป็นตัวเลข
  // ไม่ได้ (ประกาศผิด = ลูกค้าเห็นค่าส่งใน Google ไม่ตรงกับตอนเช็คเอาต์ → Merchant ตีตก)
  const { zones } = await getStorefrontDelivery(company.id);
  const shippingXml = zones
    .filter(z => z.fee_type !== 'lalamove')
    .map(z => `      <g:shipping>
        <g:country>TH</g:country>
        <g:service>${xmlEscape(z.name)}</g:service>
        <g:price>${(Number(z.fee) || 0).toFixed(2)} THB</g:price>
      </g:shipping>\n`)
    .join('');

  const items: string[] = [];
  for (const p of products) {
    const image = p.images[0];
    if (!image || !p.slug) continue;            // Merchant บังคับทั้งรูปและลิงก์ปลายทาง
    const link = storefrontAbsoluteUrl(cfg, slug, `/p/${p.slug}`);
    const description = clamp(p.description || `${p.name} จาก ${shopName}`, DESCRIPTION_MAX);
    const hasVariants = p.variations.length > 1;

    for (const v of p.variations) {
      // รหัสสินค้าต้อง **นิ่งตลอดอายุการขาย** — Merchant ผูกประวัติ/สถิติกับค่านี้
      // ใช้ id ของตัวเลือก ไม่ใช่ sku (sku ร้านแก้เองได้ทุกเมื่อ)
      const id = v.id;
      const title = clamp(v.label ? `${p.name} - ${v.label}` : p.name, TITLE_MAX);
      const gtin = (v.barcode || '').trim();
      const mpn = (v.sku || '').trim();

      items.push(
        '    <item>\n'
        + tag('g:id', id)
        + tag('g:title', title)
        + tag('g:description', description)
        + tag('g:link', link)
        + tag('g:image_link', image)
        + p.images.slice(1, 11).map(img => tag('g:additional_image_link', img)).join('')
        + tag('g:availability', v.in_stock ? 'in_stock' : 'out_of_stock')
        // ⚠️ `g:price` ออกได้ **ครั้งเดียว** · ลดราคา = `price` เป็นราคา**ก่อนลด** และ
        // `sale_price` เป็นราคาที่ขายจริง — สลับกันแล้ว Google โชว์ราคาขีดฆ่าผิดด้าน
        // (ของเราเก็บ `v.price` = ราคาขายจริง ส่วน `v.compare_at` = ราคาก่อนลด)
        + (v.compare_at && v.compare_at > v.price
          ? tag('g:price', `${v.compare_at.toFixed(2)} THB`) + tag('g:sale_price', `${v.price.toFixed(2)} THB`)
          : tag('g:price', `${v.price.toFixed(2)} THB`))
        + tag('g:condition', 'new')
        + tag('g:brand', p.brand)
        + tag('g:product_type', p.category)
        + (gtin ? tag('g:gtin', gtin) : '')
        + (mpn ? tag('g:mpn', mpn) : '')
        // ไม่มีทั้ง gtin และ mpn **ต้องประกาศให้ชัด** ไม่งั้น Merchant ตีตกทั้งแถว
        + (!gtin && !mpn ? tag('g:identifier_exists', 'no') : '')
        + (hasVariants ? tag('g:item_group_id', p.id) : '')
        + shippingXml
        + '    </item>\n',
      );
      if (items.length >= FEED_MAX_ITEMS) break;
    }
    if (items.length >= FEED_MAX_ITEMS) break;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(shopName)}</title>
    <link>${xmlEscape(storefrontAbsoluteUrl(cfg, slug))}</link>
    <description>${xmlEscape(cfg.tagline || `สินค้าจาก ${shopName}`)}</description>
${items.join('')}  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
