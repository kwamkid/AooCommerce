// Storefront sitemap — served per company so it can sit on the customer's own
// domain (e.g. shop.adayfresh.com/sitemap.xml via the edge proxy).
// URLs always use the configured public domain; without one there is nothing
// worth submitting, so we return 404 rather than a sitemap of unindexable URLs.
import { NextResponse } from 'next/server';
import {
  getStorefrontCompany, getStorefrontCatalog, catalogOptionsFor, getStorefrontDelivery,
} from '@/lib/storefront-server';
import { storefrontUrl, type StorefrontProduct } from '@/lib/storefront';

/**
 * เพดานจำนวน URL สินค้าใน sitemap เดียว
 * ⚠️ ร้านที่เกินเพดานจะ **ถูกตัดเงียบ ๆ** — ยังไม่ได้ทำ sitemap index
 * ตอนนี้ร้านจริงอยู่หลักร้อย ยังไม่ถึง แต่ถ้าถึงเมื่อไหร่ต้องแตกเป็น index ไม่ใช่ขยายเพดาน
 * (มาตรฐาน sitemap จำกัด 50,000 URL / 50MB ต่อไฟล์)
 */
const SITEMAP_MAX = 5000;
/** ขนาดหน้าที่ใช้ไล่ catalog — ใหญ่พอให้รอบน้อย เล็กพอให้ `.in(...)` ไม่บวม */
const SITEMAP_PAGE = 500;

export const revalidate = 3600;

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  // ซ่อนตาม config เดียวกับหน้ารายการ — ไม่ควรพา crawler ไปหน้าที่ลูกค้าหาไม่เจอในร้าน
  const opts = catalogOptionsFor(company);
  const products: StorefrontProduct[] = [];
  for (let page = 1; products.length < SITEMAP_MAX; page++) {
    const result = await getStorefrontCatalog(
      company.id,
      { ...opts, page, pageSize: SITEMAP_PAGE },
      company.features.stock,
    );
    products.push(...result.products);
    if (result.products.length === 0 || page * SITEMAP_PAGE >= result.total) break;
  }
  products.length = Math.min(products.length, SITEMAP_MAX);

  // หน้า /delivery มีอยู่เสมอแม้ร้านไม่ได้ตั้งโซนไว้ — แต่ตอนนั้นมันว่างเปล่า (thin page)
  // และแถบหมวดก็ซ่อนลิงก์ไปแล้ว ⇒ อย่าส่งเข้า sitemap ให้ Google เก็บหน้าที่ไม่มีอะไร
  // (เงื่อนไขเดียวกับ `hasDelivery` ใน layout.tsx)
  const { zones } = await getStorefrontDelivery(company.id);

  // lastmod ของหน้าแรก = สินค้าที่ถูกแก้ล่าสุด — บอก Google ตรง ๆ ว่าควรกลับมาดูเมื่อไหร่
  // (เดิมหน้าแรกไม่มี lastmod เลย ทั้งที่เป็นหน้าที่เปลี่ยนบ่อยที่สุด)
  const newest = products.reduce<string | null>(
    (acc, p) => (!acc || p.updated_at > acc ? p.updated_at : acc), null,
  );

  const entries = [
    { loc: storefrontUrl(cfg, slug), priority: '1.0', lastmod: newest },
    ...(zones.length > 0
      ? [{ loc: storefrontUrl(cfg, slug, '/delivery'), priority: '0.5', lastmod: null as string | null }]
      : []),
    ...products.map(p => ({
      loc: storefrontUrl(cfg, slug, `/p/${p.slug}`),
      priority: '0.8',
      lastmod: p.updated_at as string | null,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(e => `  <url>
    <loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `
    <lastmod>${new Date(e.lastmod).toISOString().split('T')[0]}</lastmod>` : ''}
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
