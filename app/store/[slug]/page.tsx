// Path: app/store/[slug]/page.tsx
// Storefront catalog — SSR + ISR so Google/AI crawlers get real HTML (they
// mostly don't run JS) and Core Web Vitals stay fast.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStorefrontCompany, getStorefrontCatalog } from '@/lib/storefront-server';
import { storefrontUrl, storefrontHref, formatStorePrice, type StorefrontProduct } from '@/lib/storefront';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cat?: string; q?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { cat } = await searchParams;
  const company = await getStorefrontCompany(slug);
  if (!company) return { title: 'ไม่พบหน้าร้าน' };

  const cfg = company.config;
  const shopName = cfg.display_name || company.name;
  const title = cat ? `${cat} | ${shopName}` : shopName;
  const description = cfg.tagline || company.description || `สั่งซื้อสินค้าออนไลน์จาก ${shopName}`;

  return {
    title,
    description,
    // ไม่มีโดเมนของร้าน = ยังไม่ควรถูก index (SEO บนโดเมน aoo ไม่มีค่ากับลูกค้า
    // และหลายร้านอยู่โดเมนเดียวกัน) · หน้า filter ก็ noindex กัน facet ระเบิด
    robots: (!cfg.public_base_url || !!cat) ? { index: false, follow: true } : undefined,
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

function ProductCard({ product, slug }: { product: StorefrontProduct; slug: string }) {
  const cover = product.images[0];
  const hasRange = product.price_max > product.price_min;
  const firstCompare = product.variations.find(v => v.compare_at != null)?.compare_at ?? null;

  return (
    <Link href={storefrontHref(slug, `/p/${product.slug}`)} className="sf-card">
      <div className="sf-card-media">
        {cover
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cover} alt={product.name} loading="lazy" />
          : <span className="sf-card-media-empty">ไม่มีรูป</span>}
      </div>
      <div className="sf-card-body">
        {product.category && <span className="sf-card-cat">{product.category}</span>}
        <span className="sf-card-name">{product.name}</span>
        <span className="sf-card-price">
          {product.in_stock ? (
            <>
              {hasRange
                ? `${formatStorePrice(product.price_min)}–${formatStorePrice(product.price_max)}`
                : formatStorePrice(product.price_min)}
              {!hasRange && firstCompare && (
                <span className="sf-card-compare">{formatStorePrice(firstCompare)}</span>
              )}
            </>
          ) : (
            <span className="sf-oos">สินค้าหมดชั่วคราว</span>
          )}
        </span>
      </div>
    </Link>
  );
}

export default async function StorefrontCatalogPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { cat, q } = await searchParams;
  const company = await getStorefrontCompany(slug);
  if (!company) notFound();

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
        <h1>{cat || shopName}</h1>
        {/* คำโปรยเป็นประโยคเต็ม — หน้า grid เปล่า ๆ ถือเป็น thin content */}
        <p>{cfg.tagline || company.description || `เลือกซื้อสินค้าจาก ${shopName} จัดส่งถึงบ้าน`}</p>
      </div>

      {products.length === 0 ? (
        <p className="sf-empty">
          {q || cat ? 'ไม่พบสินค้าที่ตรงกับที่เลือก' : 'ยังไม่มีสินค้าในหน้าร้านนี้'}
        </p>
      ) : (
        <div className="sf-grid">
          {products.map(p => <ProductCard key={p.id} product={p} slug={slug} />)}
        </div>
      )}
    </div>
  );
}
