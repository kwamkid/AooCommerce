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
  storefrontUrl, storefrontHref, storefrontAbsoluteUrl, jsonLdScript,
  formatStorePrice, storefrontCssVars, storefrontRootClasses,
} from '@/lib/storefront';
import { formatSlotTime } from '@/lib/delivery';
import AddToCartButton from '@/components/storefront/AddToCartButton';
import DetailPrice from '@/components/storefront/DetailPrice';
import ProductGallery from '@/components/storefront/ProductGallery';
import UnavailableProduct from '@/components/storefront/UnavailableProduct';

export const revalidate = 300;

/** เพดานที่ Google แสดงจริงก่อนตัด — เผื่อที่ให้ " | ชื่อร้าน" ต่อท้ายเสมอ */
const TITLE_PRODUCT_MAX = 45;
const DESCRIPTION_MAX = 160;

/** ตัดที่ช่องว่างคำสุดท้าย ไม่ตัดกลางคำ · ไทยไม่มีช่องว่างระหว่างคำจึงตกไปตัดตรง ๆ */
function clampForTitle(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

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

  // ⚠️ ต้องส่งอาร์กิวเมนต์ **ชุดเดียวกับที่หน้าเรียก** ไม่งั้น `cache()` ถือเป็นคนละคีย์
  // แล้วยิง query ชุดเต็มสองรอบต่อการเปิดหน้า 1 ครั้ง (กระทบ TTFB/CWV โดยตรง)
  const product = await getStorefrontProduct(company.id, productSlug, company.features.stock);
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
  // ⚠️ ชื่อสินค้ายาวได้ถึง 120 ตัว — ต่อชื่อร้านดิบ ๆ แล้ว Google ตัดชื่อร้านทิ้งทุกหน้า
  // ตัดชื่อสินค้าก่อน เหลือที่ให้ชื่อร้านเสมอ (แบรนด์ต้องอยู่ใน SERP)
  const title = `${clampForTitle(product.name, TITLE_PRODUCT_MAX)} | ${shopName}`;
  // 300 ตัวถูก Google ตัดที่ ~160 อยู่ดี และ 160 ตัวแรกของคำอธิบายที่ร้านพิมพ์มักเป็นสเปก
  // ⇒ นำด้วยข้อเท็จจริงที่ทำให้คนกด (ราคา + ร้าน) แล้วค่อยต่อด้วยคำอธิบายเท่าที่เหลือ
  const priceText = product.price_max > product.price_min
    ? `${formatStorePrice(product.price_min)}–${formatStorePrice(product.price_max)} บาท`
    : `${formatStorePrice(product.price_min)} บาท`;
  const lead = `${product.name} ราคา ${priceText} จาก ${shopName}`;
  const rest = (product.description || 'สั่งซื้อออนไลน์ จัดส่งถึงบ้าน').replace(/\s+/g, ' ').trim();
  const description = clampForTitle(`${lead} — ${rest}`, DESCRIPTION_MAX);

  return {
    title,
    description,
    robots: cfg.public_base_url ? undefined : { index: false, follow: true },
    alternates: cfg.public_base_url
      ? { canonical: storefrontUrl(cfg, slug, `/p/${product.slug}`) }
      : undefined,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: shopName,
      locale: 'th_TH',
      ...(cfg.public_base_url ? { url: storefrontUrl(cfg, slug, `/p/${product.slug}`) } : {}),
      // สินค้าไม่มีรูป (ร้านที่เปิด show_without_image) ตกไปใช้โลโก้ร้าน — ดีกว่าแชร์แล้วไม่มีรูปเลย
      images: [product.images[0] || cfg.logo_url || company.logo_url].filter(Boolean) as string[],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
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

  // ⚠️ URL ใน JSON-LD ต้องเป็น absolute เสมอ (schema.org บังคับ · Rich Results Test จับ)
  const productUrl = storefrontAbsoluteUrl(cfg, slug, `/p/${product.slug}`);
  const availability = product.in_stock
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';
  const firstSku = product.variations.find(v => v.sku)?.sku || null;

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(product.images.length ? { image: product.images } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(product.category ? { category: product.category } : {}),
    // ⚠️ ต้องมี identifier เสมอ ไม่ใช่เฉพาะสินค้าที่มีตัวเลือกเดียว — สินค้าที่มีหลายตัวเลือก
    // เคยไม่มี `sku` เลย ซึ่ง Google Merchant ปฏิเสธ · หลายตัวเลือกใช้ sku ของตัวแรกที่มี
    // (ตัวจริงแยกอยู่ใน `offers[]` ของแต่ละตัวแล้ว)
    ...(firstSku ? { sku: firstSku } : {}),
    // สินค้าหลายตัวเลือก = `offers[]` ตัวละใบ (มี sku/ราคา/สถานะของจริงต่อตัว) ไม่ใช่
    // `AggregateOffer` ใบเดียวที่บอกแค่ช่วงราคา — แบบเดิม Google ไม่รู้ว่าตัวไหนมีของ
    // ตัวไหนหมด และไม่มี identifier ให้สักตัว
    offers: hasRange
      ? product.variations.map(v => ({
          '@type': 'Offer',
          priceCurrency: 'THB',
          price: v.price,
          ...(v.sku ? { sku: v.sku } : {}),
          ...(v.label ? { name: v.label } : {}),
          availability: v.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: productUrl,
          seller: { '@type': 'Organization', name: shopName },
        }))
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
      { '@type': 'ListItem', position: 1, name: shopName, item: storefrontAbsoluteUrl(cfg, slug) },
      ...(product.category
        ? [{
            '@type': 'ListItem',
            position: 2,
            name: product.category,
            item: `${storefrontAbsoluteUrl(cfg, slug)}?cat=${encodeURIComponent(product.category_slug || product.category)}`,
          }]
        : []),
      { '@type': 'ListItem', position: product.category ? 3 : 2, name: product.name, item: productUrl },
    ],
  };

  // ประโยคข้อเท็จจริงเรื่องจัดส่ง — ประกอบจาก zone/slot จริง ไม่ให้ร้านมานั่งเขียนเอง
  // ประโยคข้อเท็จจริงของตัวสินค้า — ราคา/สต็อก/แบรนด์ **เคยอยู่แต่ใน JSON-LD กับป้าย UI**
  // (`฿259` ไม่มีคำว่า "ราคา"/"บาท" · สต็อกอยู่แค่บนป้ายปุ่ม) ซึ่งผิดกติกาของโปรเจกต์ที่ว่า
  // ข้อเท็จจริงต้องเป็น**ประโยคเต็มใน server HTML** เพราะ AI crawler ส่วนใหญ่ไม่รัน JS
  // และ AEO อ้างอิงทีละ passage — ไม่มีประโยค = ไม่มีอะไรให้ยกไปตอบ
  const priceSentence = hasRange
    ? `ราคา ${formatStorePrice(product.price_min)}–${formatStorePrice(product.price_max)} บาท`
    : `ราคา ${formatStorePrice(product.price_min)} บาท`;
  const factSentence =
    `${product.name}`
    + (product.brand ? ` เป็นสินค้าแบรนด์ ${product.brand}` : '')
    + (product.category ? `${product.brand ? ' ' : ' อยู่'}ในหมวด ${product.category}` : '')
    + ` จาก ${shopName} ${priceSentence}`
    + (product.variations.length > 1 ? ` มีให้เลือก ${product.variations.length} แบบ` : '')
    + (product.in_stock ? ' ขณะนี้มีสินค้าพร้อมจัดส่ง' : ' ขณะนี้สินค้าหมดชั่วคราว')
    + '.';

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(productLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }} />

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
          {/* ประโยคข้อเท็จจริงสำหรับ AI/Google — ไม่ซ้ำกับของที่เห็นอยู่แล้วบนหน้า จึงซ่อนจากสายตา
              แต่**อยู่ใน HTML จริง** (sr-only ไม่ใช่ display:none — crawler อ่านได้ ไม่ถือว่าซ่อนข้อความ) */}
          <p className="sf-sr-only">{factSentence}</p>

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
