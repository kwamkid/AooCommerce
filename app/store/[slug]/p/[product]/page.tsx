// Path: app/store/[slug]/p/[product]/page.tsx
// Product detail — the page that has to rank (SEO) and be quotable (AEO).
//
// AEO rules applied here:
//   • ทุกข้อเท็จจริงเป็น text ใน server HTML (AI crawler ส่วนใหญ่ไม่รัน JS)
//   • บล็อกข้อเท็จจริงเขียนเป็นประโยคเต็ม — AEO อ้างอิงทีละ passage ไม่ใช่ทั้งหน้า
//   • Product + Offer + BreadcrumbList JSON-LD ครบ (ราคา/สต็อกที่ AI อ่านจริง)
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getStorefrontCompany, getStorefrontProduct, getStorefrontDelivery,
  getDiscontinuedProduct, getStorefrontCatalog, catalogOptionsFor,
} from '@/lib/storefront-server';
import {
  storefrontUrl, storefrontHref, formatStorePrice, storefrontCssVars, storefrontRootClasses,
} from '@/lib/storefront';
import { formatSlotTime } from '@/lib/delivery';
import AddToCartButton from '@/components/storefront/AddToCartButton';
import DetailPrice from '@/components/storefront/DetailPrice';
import ProductGallery from '@/components/storefront/ProductGallery';
import UnavailableProduct from '@/components/storefront/UnavailableProduct';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string; product: string }>;
}

/**
 * slug สินค้าเป็น unicode ไทยได้ (`products.slug` เก็บไทยตรง ๆ เหมือน URL ของ Google/Wikipedia)
 * แต่ path segment ที่ Next ส่งมาใน params ยังเป็น `%E0%B8…` — ต้องถอดก่อนเอาไปค้น
 * ไม่งั้นสินค้าชื่อไทยทั้งร้านเปิดไม่ได้ (2026-09-14) · ค่าที่ถอดไม่ได้ (เช่น `%` เดี่ยว ๆ) ใช้ค่าดิบ
 */
function decodeSlug(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, product: rawProduct } = await params;
  const productSlug = decodeSlug(rawProduct);
  const company = await getStorefrontCompany(slug);
  if (!company) return { title: 'ไม่พบร้านนี้', robots: { index: false, follow: false } };

  const product = await getStorefrontProduct(company.id, productSlug);
  if (!product) {
    // URL ที่เคยมีสินค้า → บอกให้ชัดว่าเลิกขาย · follow:true เพื่อให้ crawler
    // เดินต่อไปหน้าสินค้าที่แนะนำได้ ไม่ตัน
    const gone = await getDiscontinuedProduct(company.id, productSlug);
    const shopName = company.config.display_name || company.name;
    return {
      title: gone ? `${gone.name} — ไม่มีจำหน่ายแล้ว | ${shopName}` : `ไม่พบสินค้า | ${shopName}`,
      robots: { index: false, follow: true },
    };
  }

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
  const { slug, product: rawProduct } = await params;
  const productSlug = decodeSlug(rawProduct);
  const company = await getStorefrontCompany(slug);
  if (!company) return null;   // layout แสดงหน้า 'ไม่พบร้านนี้' ให้แล้ว

  const product = await getStorefrontProduct(company.id, productSlug, company.features.stock);
  if (!product) {
    const gone = await getDiscontinuedProduct(company.id, productSlug);
    // ดึงของที่ยังขายอยู่มาแนะนำ — หมวดเดิมก่อน ถ้าไม่มีก็ทั้งร้าน
    const opts = { ...catalogOptionsFor(company), page: 1, pageSize: 8 };
    const sameCategory = gone?.category
      ? (await getStorefrontCatalog(company.id, { ...opts, category: gone.category }, company.features.stock)).products
      : [];
    const suggestions = sameCategory.length > 0
      ? sameCategory
      : (await getStorefrontCatalog(company.id, opts, company.features.stock)).products;
    return (
      <UnavailableProduct
        shop={slug}
        productName={gone?.name ?? null}
        productImage={gone?.image ?? null}
        category={gone?.category ?? null}
        categorySlug={gone?.categorySlug ?? null}
        suggestions={suggestions.slice(0, 8)}
      />
    );
  }

  const cfg = company.config;
  const shopName = cfg.display_name || company.name;
  const hasRange = product.price_max > product.price_min;
  const { zones, slots } = company.features.delivery_zone || company.features.delivery_slot.enabled
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
            item: `${storefrontUrl(cfg, slug)}?cat=${encodeURIComponent(product.category_slug || product.category)}`,
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
              href={`${storefrontHref(slug)}?cat=${encodeURIComponent(product.category_slug || product.category)}`}
              className="sf-footer-link"
            >
              {product.category}
            </Link>
          </>
        )}
      </nav>

      <div className="sf-detail">
        <div>
          {/* server HTML = `<img>` ของทุกใบครบ (SEO) · ปัด/กดรูปจิ๋วเปลี่ยนใบได้หลัง hydrate */}
          <ProductGallery images={product.images} alt={product.name} />
        </div>

        <div>
          <h1>{product.name}</h1>
          <p className="sf-detail-meta">
            {[product.brand, product.category].filter(Boolean).join(' · ') || shopName}
          </p>

          {/* ช่วงราคาใน HTML แรก (SEO) แล้วเปลี่ยนเป็นราคาของแบบที่ลูกค้ากดเลือก */}
          <DetailPrice priceMin={product.price_min} priceMax={product.price_max} />

          <AddToCartButton
            shop={slug}
            productSlug={product.slug}
            productName={product.name}
            variations={product.variations}
            images={product.images}
            defaultVariationId={product.default_variation_id}
            optionGroups={product.option_groups}
            /* ธีมสำหรับแถบซื้อล่างจอบนมือถือ ซึ่งอยู่นอก .sf-root (portal) จึงสืบทอด
               token/คลาสธีมจาก layout ไม่ได้ — ส่งชุดเดียวกับที่ layout ใส่ให้ .sf-root */
            themeClasses={storefrontRootClasses(cfg).filter(c => c !== 'sf-root')}
            themeVars={storefrontCssVars(cfg)}
          />

          {/* สินค้าชุด: ตัวเลือกเป็นประโยคเต็มใน server HTML ให้ AI อ้างได้ (ปุ่มเลือกไม่ใช่ประโยค) */}
          {product.option_groups && (
            <div className="sf-section">
              <h2>ตัวเลือกของชุด</h2>
              <div className="sf-facts">
                <p>
                  {`${product.name} เป็นสินค้าชุด เลือกได้ `}
                  {product.option_groups.map(g => `${g.name} ${g.values.length} แบบ (${g.values.join(', ')})`).join(' และ ')}
                  {'.'}
                </p>
              </div>
            </div>
          )}

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
