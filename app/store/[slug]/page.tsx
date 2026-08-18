// Path: app/store/[slug]/page.tsx
// Storefront catalog — SSR + ISR so Google/AI crawlers get real HTML (they
// mostly don't run JS) and Core Web Vitals stay fast.
import type { Metadata } from 'next';
import Link from 'next/link';
import { getStorefrontCompany, getStorefrontCatalog, getClosedStorefront } from '@/lib/storefront-server';
import { storefrontUrl, storefrontHref, formatStorePrice, type StorefrontProduct } from '@/lib/storefront';
import StoreProductCard from '@/components/storefront/StoreProductCard';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cat?: string; q?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { cat, q } = await searchParams;
  const company = await getStorefrontCompany(slug);
  if (!company) {
    const closed = await getClosedStorefront(slug);
    return {
      title: closed ? `${closed.name} — ปิดรับออร์เดอร์ชั่วคราว` : 'ไม่พบร้านนี้',
      robots: { index: false, follow: false },
    };
  }

  const cfg = company.config;
  const shopName = cfg.display_name || company.name;
  const title = q ? `ค้นหา "${q}" | ${shopName}` : cat ? `${cat} | ${shopName}` : shopName;
  const description = cfg.tagline || company.description || `สั่งซื้อสินค้าออนไลน์จาก ${shopName}`;

  return {
    title,
    description,
    // ไม่มีโดเมนของร้าน = ยังไม่ควรถูก index (SEO บนโดเมน aoo ไม่มีค่ากับลูกค้า
    // และหลายร้านอยู่โดเมนเดียวกัน) · หน้า filter ก็ noindex กัน facet ระเบิด
    // หน้ากรอง/ค้นหา = noindex เสมอ (facet + คำค้นไม่จำกัด จะระเบิดเป็นหน้าขยะ)
    robots: (!cfg.public_base_url || !!cat || !!q) ? { index: false, follow: true } : undefined,
    alternates: cfg.public_base_url ? { canonical: storefrontUrl(cfg, slug) } : undefined,
    openGraph: {
      title,
      description,
      type: 'website',
      ...(cfg.public_base_url ? { url: storefrontUrl(cfg, slug) } : {}),
      ...(company.logo_url ? { images: [company.logo_url] } : {}),
    },
  };
}


export default async function StorefrontCatalogPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { cat, q } = await searchParams;
  const company = await getStorefrontCompany(slug);
  if (!company) return null;   // layout แสดงหน้า 'ไม่พบร้านนี้' ให้แล้ว

  const products = await getStorefrontCatalog(company.id, { category: cat, search: q }, company.features.stock);
  const cfg = company.config;
  const shopName = cfg.display_name || company.name;

  // ItemList ให้ AI/Google อ่านลำดับสินค้าในหน้าหมวดได้
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: cat ? `${cat} — ${shopName}` : shopName,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 50).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.name,
      url: storefrontUrl(cfg, slug, `/p/${p.slug}`),
    })),
  };

  return (
    <div className="sf-container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />

      <div className="sf-hero">
        <h1>{q ? `ผลการค้นหา "${q}"` : cat || shopName}</h1>
        {q ? (
          <p>
            พบ {products.length} รายการ{' '}
            <Link href={storefrontHref(slug)} className="sf-footer-link">ล้างคำค้นหา</Link>
          </p>
        ) : (
          /* คำโปรยเป็นประโยคเต็ม — หน้า grid เปล่า ๆ ถือเป็น thin content */
          <p>{cfg.tagline || company.description || `เลือกซื้อสินค้าจาก ${shopName} จัดส่งถึงบ้าน`}</p>
        )}
      </div>

      {products.length === 0 ? (
        <p className="sf-empty">
          {q || cat ? 'ไม่พบสินค้าที่ตรงกับที่เลือก' : 'ยังไม่มีสินค้าในหน้าร้านนี้'}
        </p>
      ) : (
        <div className="sf-grid">
          {products.map(p => <StoreProductCard key={p.id} product={p} slug={slug} />)}
        </div>
      )}
    </div>
  );
}
