// Path: app/store/[slug]/p/[product]/page.tsx
// Product detail — the page that has to rank (SEO) and be quotable (AEO).
//
// AEO rules applied here:
//   • ทุกข้อเท็จจริงเป็น text ใน server HTML (AI crawler ส่วนใหญ่ไม่รัน JS)
//   • บล็อกข้อเท็จจริงเขียนเป็นประโยคเต็ม — AEO อ้างอิงทีละ passage ไม่ใช่ทั้งหน้า
//   • Product + Offer + BreadcrumbList JSON-LD ครบ (ราคา/สต็อกที่ AI อ่านจริง)
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStorefrontCompany, getStorefrontProduct, getStorefrontDelivery } from '@/lib/storefront-server';
import { storefrontUrl, storefrontHref, formatStorePrice } from '@/lib/storefront';
import { formatSlotTime } from '@/lib/delivery';
import AddToCartButton from '@/components/storefront/AddToCartButton';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string; product: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, product: productSlug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) return { title: 'ไม่พบหน้าร้าน' };

  const product = await getStorefrontProduct(company.id, productSlug);
  if (!product) return { title: 'ไม่พบสินค้า', robots: { index: false, follow: false } };

  const cfg = company.config;
  const shopName = cfg.display_name || company.name;
  const description = (product.description || `${product.name} จาก ${shopName} สั่งซื้อออนไลน์ จัดส่งถึงบ้าน`)
    .replace(/\s+/g, ' ')
    .slice(0, 300);

  return {
    title: `${product.name} | ${shopName}`,
    description,
    robots: cfg.public_base_url ? undefined : { index: false, follow: true },
    alternates: cfg.public_base_url
      ? { canonical: storefrontUrl(cfg, slug, `/p/${product.slug}`) }
      : undefined,
    openGraph: {
      title: product.name,
      description,
      type: 'website',
      ...(cfg.public_base_url ? { url: storefrontUrl(cfg, slug, `/p/${product.slug}`) } : {}),
      ...(product.images[0] ? { images: [product.images[0]] } : {}),
    },
  };
}

export default async function StorefrontProductPage({ params }: PageProps) {
  const { slug, product: productSlug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) notFound();

  const product = await getStorefrontProduct(company.id, productSlug, company.features.stock);
  if (!product) notFound();

  const cfg = company.config;
  const shopName = cfg.display_name || company.name;
  const hasRange = product.price_max > product.price_min;
  const { zones, slots } = company.features.delivery_zone || company.features.delivery_slot
    ? await getStorefrontDelivery(company.id)
    : { zones: [], slots: [] };

  const productUrl = storefrontUrl(cfg, slug, `/p/${product.slug}`);
  const availability = product.in_stock
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(product.images.length ? { image: product.images } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(product.variations.length === 1 && product.variations[0].sku
      ? { sku: product.variations[0].sku }
      : {}),
    offers: hasRange
      ? {
          '@type': 'AggregateOffer',
          priceCurrency: 'THB',
          lowPrice: product.price_min,
          highPrice: product.price_max,
          offerCount: product.variations.length,
          availability,
          url: productUrl,
          seller: { '@type': 'Organization', name: shopName },
        }
      : {
          '@type': 'Offer',
          priceCurrency: 'THB',
          price: product.price_min,
          availability,
          url: productUrl,
          seller: { '@type': 'Organization', name: shopName },
        },
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: shopName, item: storefrontUrl(cfg, slug) },
      ...(product.category
        ? [{
            '@type': 'ListItem',
            position: 2,
            name: product.category,
            item: `${storefrontUrl(cfg, slug)}?cat=${encodeURIComponent(product.category)}`,
          }]
        : []),
      { '@type': 'ListItem', position: product.category ? 3 : 2, name: product.name, item: productUrl },
    ],
  };

  // ประโยคข้อเท็จจริงเรื่องจัดส่ง — ประกอบจาก zone/slot จริง ไม่ให้ร้านมานั่งเขียนเอง
  const deliverySentences: string[] = [];
  if (zones.length > 0) {
    const free = zones.find(z => z.free_over != null);
    deliverySentences.push(
      `${shopName} จัดส่งใน ${zones.length} พื้นที่ ได้แก่ ${zones.map(z => z.name).join(', ')}`
      + (free ? ` และส่งฟรีเมื่อสั่งครบ ${formatStorePrice(Number(free.free_over))}` : '')
      + '.',
    );
  }
  if (slots.length > 0) {
    deliverySentences.push(
      `รอบจัดส่งต่อวันมี ${slots.map(s => `${formatSlotTime(s.start_time)}-${formatSlotTime(s.end_time)} น.`).join(', ')} `
      + 'โดยเลือกได้เป็นช่วงเวลา ไม่ใช่เวลานัดที่แน่นอน และระบบจะแสดงเฉพาะรอบที่จัดส่งทัน.',
    );
  }

  return (
    <div className="sf-container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <nav className="sf-detail-meta" aria-label="เส้นทาง">
        <Link href={storefrontHref(slug)} className="sf-footer-link">{shopName}</Link>
        {product.category && (
          <>
            {' / '}
            <Link
              href={`${storefrontHref(slug)}?cat=${encodeURIComponent(product.category)}`}
              className="sf-footer-link"
            >
              {product.category}
            </Link>
          </>
        )}
      </nav>

      <div className="sf-detail">
        <div>
          <div className="sf-gallery-main">
            {product.images[0]
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={product.images[0]} alt={product.name} />
              : <span className="sf-card-media-empty">ไม่มีรูป</span>}
          </div>
          {product.images.length > 1 && (
            <div className="sf-gallery-thumbs">
              {product.images.slice(1, 6).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={`${product.name} รูปที่ ${i + 2}`} loading="lazy" />
              ))}
            </div>
          )}
        </div>

        <div>
          <h1>{product.name}</h1>
          <p className="sf-detail-meta">
            {[product.brand, product.category].filter(Boolean).join(' · ') || shopName}
          </p>

          <div className="sf-detail-price">
            {hasRange
              ? `${formatStorePrice(product.price_min)}–${formatStorePrice(product.price_max)}`
              : formatStorePrice(product.price_min)}
          </div>

          <AddToCartButton
            shop={slug}
            productSlug={product.slug}
            productName={product.name}
            variations={product.variations}
            images={product.images}
          />

          {product.description && (
            <div className="sf-section">
              <h2>รายละเอียดสินค้า</h2>
              <div className="sf-prose">{product.description}</div>
            </div>
          )}

          {deliverySentences.length > 0 && (
            <div className="sf-section">
              <h2>การจัดส่ง</h2>
              <div className="sf-facts">
                {deliverySentences.map((sentence, i) => <p key={i}>{sentence}</p>)}
              </div>
              <p style={{ marginTop: 8 }}>
                <Link href={storefrontHref(slug, '/delivery')} className="sf-footer-link">
                  ดูพื้นที่จัดส่งและรอบส่งทั้งหมด
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
