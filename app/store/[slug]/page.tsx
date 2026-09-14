// Path: app/store/[slug]/page.tsx
// Storefront catalog — SSR + ISR so Google/AI crawlers get real HTML (they
// mostly don't run JS) and Core Web Vitals stay fast.
import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getStorefrontCompany, getStorefrontCatalog, getClosedStorefront, catalogOptionsFor,
  type StorefrontCompany,
} from '@/lib/storefront-server';
import {
  storefrontUrl, storefrontHref, STOREFRONT_PAGE_SIZE,
  type StorefrontProduct,
} from '@/lib/storefront';
import StoreProductCard from '@/components/storefront/StoreProductCard';
import StorePagination from '@/components/storefront/StorePagination';
import CatalogSkeleton from '@/components/storefront/CatalogSkeleton';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cat?: string; q?: string; page?: string }>;
}

/** เลขหน้าจาก URL — ค่าเพี้ยน (0 · ติดลบ · ไม่ใช่ตัวเลข) = หน้า 1 */
function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { cat, q, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
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
  const baseTitle = q ? `ค้นหา "${q}" | ${shopName}` : cat ? `${cat} | ${shopName}` : shopName;
  // หน้า 2 ขึ้นไปต้องมีชื่อของตัวเอง ไม่งั้น Google เห็นเป็นหน้าซ้ำกันทั้งชุด
  const title = page > 1 ? `${baseTitle} — หน้า ${page}` : baseTitle;
  const description = cfg.tagline || company.description || `สั่งซื้อสินค้าออนไลน์จาก ${shopName}`;
  // canonical ของหน้า 2 ขึ้นไป = ตัวมันเอง (?page=N) ไม่ใช่หน้าแรก — ไม่งั้นสินค้า
  // ที่อยู่หน้าหลัง ๆ ไม่มีทางถูกเก็บ index
  const canonical = cfg.public_base_url
    ? `${storefrontUrl(cfg, slug)}${page > 1 ? `?page=${page}` : ''}`
    : null;

  return {
    title,
    description,
    // ไม่มีโดเมนของร้าน = ยังไม่ควรถูก index (SEO บนโดเมน aoo ไม่มีค่ากับลูกค้า
    // และหลายร้านอยู่โดเมนเดียวกัน) · หน้า filter ก็ noindex กัน facet ระเบิด
    // หน้ากรอง/ค้นหา = noindex เสมอ (facet + คำค้นไม่จำกัด จะระเบิดเป็นหน้าขยะ)
    robots: (!cfg.public_base_url || !!cat || !!q) ? { index: false, follow: true } : undefined,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      title,
      description,
      type: 'website',
      ...(canonical ? { url: canonical } : {}),
      ...(company.logo_url ? { images: [company.logo_url] } : {}),
    },
  };
}


/**
 * ส่วนที่ต้องรอ getStorefrontCatalog() (RPC + ประกอบข้อมูล 200–600ms)
 * แยกออกมาเพื่อให้ห่อ <Suspense> ได้ — Next จะส่ง skeleton ออกไปทันทีตอน
 * navigate แล้ว stream ผลจริงตามมา (ก่อนหน้านี้หน้าค้างนิ่งจนผลมาถึง
 * เพราะ loading.tsx ไม่ทำงานเมื่อเปลี่ยนแค่ searchParams ใน segment เดิม)
 */
async function CatalogResults({
  company, slug, cat, q, page,
}: {
  company: StorefrontCompany;
  slug: string;
  cat?: string;
  q?: string;
  page: number;
}) {
  const { products, total, pageSize } = await getStorefrontCatalog(
    company.id,
    { ...catalogOptionsFor(company), category: cat, search: q, page, pageSize: STOREFRONT_PAGE_SIZE },
    company.features.stock,
  );
  const cfg = company.config;
  const shopName = cfg.display_name || company.name;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstOnPage = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastOnPage = (page - 1) * pageSize + products.length;

  // ItemList ให้ AI/Google อ่านลำดับสินค้าในหน้าหมวดได้ (นับตำแหน่งต่อจากหน้าก่อน)
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: cat ? `${cat} — ${shopName}` : shopName,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 50).map((p: StorefrontProduct, i: number) => ({
      '@type': 'ListItem',
      position: firstOnPage + i,
      name: p.name,
      url: storefrontUrl(cfg, slug, `/p/${p.slug}`),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />

      {/* หัวข้อของหน้าค้นหาอยู่ตรงนี้เพราะบรรทัด "พบ N รายการ" ต้องรอยอดรวมจริง
          (หน้าหมวดไม่ต้องรอ จึงวาดไว้นอก Suspense แล้ว) */}
      {q && (
        <div className="sf-hero">
          <h1>{`ผลการค้นหา "${q}"`}</h1>
          <p>
            พบ {total.toLocaleString('th-TH')} รายการ{' '}
            <Link href={storefrontHref(slug)} className="sf-footer-link">ล้างคำค้นหา</Link>
          </p>
        </div>
      )}

      {products.length === 0 ? (
        <p className="sf-empty">
          {/* หน้าเกินช่วง (คนแก้ URL / ลิงก์เก่า) ต้องมีทางกลับ ไม่ใช่หน้าตัน */}
          {page > 1
            ? <>ไม่มีสินค้าในหน้านี้แล้ว <Link href={storefrontHref(slug)} className="sf-footer-link">กลับหน้าแรก</Link></>
            : q || cat ? 'ไม่พบสินค้าที่ตรงกับที่เลือก' : 'ยังไม่มีสินค้าในหน้าร้านนี้'}
        </p>
      ) : (
        <>
          <p className="sf-count">
            แสดง {firstOnPage.toLocaleString('th-TH')}–{lastOnPage.toLocaleString('th-TH')}
            {' '}จาก {total.toLocaleString('th-TH')} รายการ
          </p>
          <div className="sf-grid">
            {products.map((p: StorefrontProduct) => (
              <StoreProductCard key={p.id} product={p} slug={slug} />
            ))}
          </div>
          <StorePagination slug={slug} page={page} totalPages={totalPages} cat={cat} q={q} />
        </>
      )}
    </>
  );
}


export default async function StorefrontCatalogPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { cat, q, page: pageParam } = await searchParams;
  const company = await getStorefrontCompany(slug);
  if (!company) return null;   // layout แสดงหน้า 'ไม่พบร้านนี้' ให้แล้ว

  const page = parsePage(pageParam);

  return (
    <div className="sf-container">
      {/* หน้าแรกไม่มีหัวข้อ/คำโปรย — ชื่อร้านอยู่ที่หัวร้านแล้ว คำโปรยอยู่ใน <title>/description
          ให้ Google (เจ้าของสั่ง 2026-09-14) · หน้าหมวดมีหัวข้อไว้บอกว่ากำลังดูอะไร และ
          ไม่ต้องรอข้อมูล จึงอยู่นอก Suspense (เห็นทันทีที่กด) · หน้าค้นหาอยู่ใน CatalogResults */}
      {cat && !q && (
        <div className="sf-hero">
          <h1>{cat}</h1>
        </div>
      )}

      {/* key เปลี่ยนตาม searchParams = Suspense boundary ใหม่ทุกครั้งที่กรอง/ค้น/เปลี่ยนหน้า
          → ผู้ใช้เห็น skeleton ทันที แทนที่จะนั่งมองหน้าเดิมค้างจนผลใหม่มาถึง */}
      <Suspense key={`${cat ?? ''}|${q ?? ''}|${page}`} fallback={<CatalogSkeleton />}>
        <CatalogResults company={company} slug={slug} cat={cat} q={q} page={page} />
      </Suspense>
    </div>
  );
}
