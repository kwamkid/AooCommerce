// Path: app/store/[slug]/page.tsx
// Storefront catalog — SSR + ISR so Google/AI crawlers get real HTML (they
// mostly don't run JS) and Core Web Vitals stay fast.
import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getStorefrontCompany, getStorefrontCatalog, getClosedStorefront, catalogOptionsFor,
  getStorefrontDelivery, resolveCategoryParam, resolveBrandParam,
  type StorefrontCompany,
} from '@/lib/storefront-server';
import {
  storefrontUrl, storefrontHref, storefrontAbsoluteUrl, jsonLdScript, STOREFRONT_PAGE_SIZE,
  type StorefrontProduct,
} from '@/lib/storefront';
import StoreProductCard from '@/components/storefront/StoreProductCard';
import StorePagination from '@/components/storefront/StorePagination';
import CatalogSkeleton from '@/components/storefront/CatalogSkeleton';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cat?: string; brand?: string; q?: string; page?: string }>;
}

/**
 * คำค้นมาจากผู้ใช้ ไม่จำกัดความยาว — ยัดลง `<title>`/`<h1>` ดิบ ๆ ไม่ได้
 * (ใครก็ทำ URL ที่ทำให้หน้าบนโดเมนของร้านมีข้อความของตัวเองได้)
 */
const QUERY_DISPLAY_MAX = 50;
function clampQuery(raw: string): string {
  const q = raw.replace(/\s+/g, ' ').trim();
  return q.length <= QUERY_DISPLAY_MAX ? q : `${q.slice(0, QUERY_DISPLAY_MAX)}…`;
}

/** เลขหน้าจาก URL — ค่าเพี้ยน (0 · ติดลบ · ไม่ใช่ตัวเลข) = หน้า 1 */
function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { cat, brand, q, page: pageParam } = await searchParams;
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
  // ชื่อหมวดใน <title> ต้องเป็น**ชื่อจริง** ไม่ใช่ค่าดิบใน URL — ลิงก์แบบ slug จะโชว์
  // "easier-beginnings" และค่ามั่วจะกลายเป็นหัวข้อหน้าบนโดเมนของร้าน
  const catName = (await resolveCategoryParam(company.id, cat))?.name || null;
  const brandName = (await resolveBrandParam(company.id, brand))?.name || null;
  // ⚠️ หน้าแรกคือหน้าที่มีน้ำหนักที่สุดของร้าน แต่ `<title>` เคยเป็น**ชื่อร้านเปล่า ๆ**
  // ไม่มีคำค้นสักคำ ("ร้านเบบี้เลิฟ" ไม่มีคำว่า สั่งออนไลน์/จัดส่ง/จังหวัดที่ส่งถึง)
  // ⇒ ต่อท้ายด้วยคำโปรยของร้าน ถ้าไม่ได้ตั้งก็ประกอบจากพื้นที่จัดส่งจริง
  const homeSuffix = cfg.tagline || (await homeTitleSuffix(company));
  const baseTitle = q
    ? `ค้นหา "${clampQuery(q)}" | ${shopName}`
    : brandName && catName ? `${brandName} · ${catName} | ${shopName}`
    : brandName ? `${brandName} | ${shopName}`
    : catName ? `${catName} | ${shopName}`
    : homeSuffix ? `${shopName} — ${homeSuffix}` : shopName;
  // หน้า 2 ขึ้นไปต้องมีชื่อของตัวเอง ไม่งั้น Google เห็นเป็นหน้าซ้ำกันทั้งชุด
  const title = page > 1 ? `${baseTitle} — หน้า ${page}` : baseTitle;
  const description = cfg.tagline || company.description || `สั่งซื้อสินค้าออนไลน์จาก ${shopName}`;
  // canonical ของหน้า 2 ขึ้นไป = ตัวมันเอง (?page=N) ไม่ใช่หน้าแรก — ไม่งั้นสินค้า
  // ที่อยู่หน้าหลัง ๆ ไม่มีทางถูกเก็บ index
  //
  // ⛔ **หน้ากรอง/ค้นหาห้ามมี canonical** — หน้าพวกนั้นเป็น noindex อยู่แล้ว (ดู `robots` ข้างล่าง)
  // การจับคู่ noindex กับ canonical ที่ชี้ไป **URL อื่น** เป็นสิ่งที่ Google บอกห้ามชัด ๆ เพราะ
  // สัญญาณ noindex อาจถูกโอนไปติดหน้าเป้าหมาย — ของเดิมชี้ไปหน้าแรกของร้าน แปลว่าเสี่ยง
  // ทำให้หน้าแรกหลุด index ทั้งร้าน · ไม่ใส่ canonical เลย = Google ใช้ URL ของหน้านั้นเอง
  // ⚠️ **ตัวกรองใหม่ต้องมาเพิ่มที่นี่ด้วยทุกครั้ง** — ลืมแล้วหน้า facet หลุดเข้า index
  // แล้วระเบิดเป็นหน้าขยะนับพัน (กฎเดิมทำไว้เพื่อ `cat`/`q` เท่านั้น)
  const indexable = !cat && !brand && !q;
  const canonical = cfg.public_base_url && indexable
    ? `${storefrontUrl(cfg, slug)}${page > 1 ? `?page=${page}` : ''}`
    : null;

  return {
    title,
    description,
    // ไม่มีโดเมนของร้าน = ยังไม่ควรถูก index (SEO บนโดเมน aoo ไม่มีค่ากับลูกค้า
    // และหลายร้านอยู่โดเมนเดียวกัน) · หน้า filter ก็ noindex กัน facet ระเบิด
    // หน้ากรอง/ค้นหา = noindex เสมอ (facet + คำค้นไม่จำกัด จะระเบิดเป็นหน้าขยะ)
    robots: (!cfg.public_base_url || !indexable) ? { index: false, follow: true } : undefined,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: shopName,
      locale: 'th_TH',
      ...(canonical ? { url: canonical } : {}),
      // โลโก้ของ **ร้าน** ก่อน ตกไปใช้ของบริษัท — ให้ตรงกับที่หัวร้าน/ท้ายหน้าร้านแสดงจริง
      ...((cfg.logo_url || company.logo_url) ? { images: [cfg.logo_url || company.logo_url!] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}


/**
 * ส่วนที่ต้องรอ getStorefrontCatalog() (RPC + ประกอบข้อมูล 200–600ms)
 * แยกออกมาเพื่อให้ห่อ <Suspense> ได้ — Next จะส่ง skeleton ออกไปทันทีตอน
 * navigate แล้ว stream ผลจริงตามมา (ก่อนหน้านี้หน้าค้างนิ่งจนผลมาถึง
 * เพราะ loading.tsx ไม่ทำงานเมื่อเปลี่ยนแค่ searchParams ใน segment เดิม)
 */
/**
 * ท้าย `<title>` ของหน้าแรกเมื่อร้านไม่ได้ตั้งคำโปรย — ประกอบจาก **โซนจัดส่งจริง**
 * ไม่ได้เดา · `getStorefrontDelivery` ห่อ cache() แล้วและ layout เรียกอยู่แล้วในคำขอเดียวกัน
 * จึงไม่ได้ยิง query เพิ่ม
 */
async function homeTitleSuffix(company: StorefrontCompany): Promise<string> {
  if (!company.features.delivery_zone) return 'สั่งซื้อออนไลน์ จัดส่งถึงบ้าน';
  const { zones } = await getStorefrontDelivery(company.id);
  const provinces = Array.from(new Set(zones.flatMap(z => z.provinces || []))).slice(0, 2);
  return provinces.length
    ? `สั่งซื้อออนไลน์ ส่ง${provinces.join(' ')} ถึงบ้าน`
    : 'สั่งซื้อออนไลน์ จัดส่งถึงบ้าน';
}

async function CatalogResults({
  company, slug, cat, brand, q, page,
}: {
  company: StorefrontCompany;
  slug: string;
  cat?: string;
  brand?: string;
  q?: string;
  page: number;
}) {
  // `?cat=` มาได้ทั้ง slug (ลิงก์ที่ระบบสร้าง) และชื่อหมวด (ลิงก์เก่า) — แปลงเป็นชื่อก่อนกรอง
  const resolved = await resolveCategoryParam(company.id, cat);
  const categoryName = resolved?.filter ?? null;
  const brandName = (await resolveBrandParam(company.id, brand))?.name || null;
  const { products, total, pageSize } = await getStorefrontCatalog(
    company.id,
    {
      ...catalogOptionsFor(company),
      category: categoryName ?? undefined,
      // แบรนด์ส่ง **slug ดิบ** ให้ RPC (กรองด้วย slug ตรง ๆ) ต่างจากหมวดที่ต้องแปลงเป็นชื่อก่อน
      brand: brand || undefined,
      search: q,
      page,
      pageSize: STOREFRONT_PAGE_SIZE,
    },
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
    name: [brandName, resolved?.name].filter(Boolean).join(' · ') || shopName,
    // จำนวนของ "รายการนี้" คือทั้งหมดหลังกรอง ไม่ใช่เท่าที่อยู่ในหน้านี้
    numberOfItems: total,
    itemListElement: products.slice(0, 50).map((p: StorefrontProduct, i: number) => ({
      '@type': 'ListItem',
      position: firstOnPage + i,
      name: p.name,
      // schema.org บังคับ URL เต็ม — ร้านที่ยังไม่มีโดเมนตัวเอง storefrontUrl() คืน path ภายใน
      url: storefrontAbsoluteUrl(cfg, slug, `/p/${p.slug}`),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(itemListLd) }}
      />

      {/* หัวข้อของหน้าค้นหาอยู่ตรงนี้เพราะบรรทัด "พบ N รายการ" ต้องรอยอดรวมจริง
          (หน้าหมวดไม่ต้องรอ จึงวาดไว้นอก Suspense แล้ว) */}
      {q && (
        <div className="sf-hero">
          <h1>{`ผลการค้นหา "${clampQuery(q)}"`}</h1>
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
            : q || cat || brand ? 'ไม่พบสินค้าที่ตรงกับที่เลือก' : 'ยังไม่มีสินค้าในหน้าร้านนี้'}
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
          <StorePagination slug={slug} page={page} totalPages={totalPages} cat={cat} brand={brand} q={q} />
        </>
      )}
    </>
  );
}


export default async function StorefrontCatalogPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { cat, brand, q, page: pageParam } = await searchParams;
  const company = await getStorefrontCompany(slug);
  if (!company) return null;   // layout แสดงหน้า 'ไม่พบร้านนี้' ให้แล้ว

  const page = parsePage(pageParam);
  // แปลง slug → ชื่อหมวดก่อนวาดหัวข้อ · ยังอยู่นอก Suspense ได้เพราะเป็นการอ่านแถวเดียวผ่าน index
  // (ที่จงใจไม่รอคือ**รายการสินค้า** ไม่ใช่ทุก query — และ cache() ใช้ผลร่วมกับ CatalogResults)
  const catName = (await resolveCategoryParam(company.id, cat))?.name || null;
  const brandInfo = await resolveBrandParam(company.id, brand);
  // หัวข้อหน้า: แบรนด์มาก่อนหมวด (เลือกทั้งคู่ = "Stokke · คาร์ซีท")
  const heading = [brandInfo?.name, catName].filter(Boolean).join(' · ');

  return (
    <div className="sf-container">
      {/* หน้าแรกไม่มีหัวข้อ/คำโปรย — ชื่อร้านอยู่ที่หัวร้านแล้ว คำโปรยอยู่ใน <title>/description
          ให้ Google (เจ้าของสั่ง 2026-09-14) · หน้าหมวดมีหัวข้อไว้บอกว่ากำลังดูอะไร และ
          ไม่ต้องรอข้อมูล จึงอยู่นอก Suspense (เห็นทันทีที่กด) · หน้าค้นหาอยู่ใน CatalogResults */}
      {heading && !q && (
        <div className="sf-hero sf-hero-brand">
          {/* โลโก้แบรนด์ — ร้านที่ยังไม่อัปก็ไม่ต้องหาอะไรมาแทน ปล่อยให้เหลือแค่ชื่อ
              ⛔ ไม่ผ่าน thumbUrl() — กติกาโปรเจกต์ห้ามย่อโลโก้ (ตัวอักษรในโลโก้จะแตก) */}
          {brandInfo?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brandInfo.logo_url} alt={brandInfo.name} className="sf-brand-logo" />
          )}
          <h1>{heading}</h1>
        </div>
      )}

      {/* key เปลี่ยนตาม searchParams = Suspense boundary ใหม่ทุกครั้งที่กรอง/ค้น/เปลี่ยนหน้า
          → ผู้ใช้เห็น skeleton ทันที แทนที่จะนั่งมองหน้าเดิมค้างจนผลใหม่มาถึง */}
      <Suspense key={`${cat ?? ''}|${brand ?? ''}|${q ?? ''}|${page}`} fallback={<CatalogSkeleton />}>
        <CatalogResults company={company} slug={slug} cat={cat} brand={brand} q={q} page={page} />
      </Suspense>
    </div>
  );
}
