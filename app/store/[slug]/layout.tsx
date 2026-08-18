// Path: app/store/[slug]/layout.tsx
// Storefront shell — header/footer + per-company theme tokens.
// Standalone surface (SEO/AEO primary). The embedded (WordPress) surface will
// reuse the same page bodies without this chrome.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { getStorefrontCompany, getStorefrontCategories, getClosedStorefront } from '@/lib/storefront-server';
import { storefrontCssVars, storefrontRootClasses, storefrontHref } from '@/lib/storefront';
import StoreHeader from '@/components/storefront/StoreHeader';
import ShopUnavailable from '@/components/storefront/ShopUnavailable';
import '@/components/storefront/storefront.css';

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) {
    // แยกให้ออก: ปิดชั่วคราว (มีร้านจริง) vs ไม่มีร้านนี้
    return <ShopUnavailable closed={await getClosedStorefront(slug)} />;
  }

  const categories = await getStorefrontCategories(company.id);
  const cfg = company.config;
  const shopName = cfg.display_name || company.name;

  const navLinks = [
    { href: storefrontHref(slug), label: 'สินค้าทั้งหมด' },
    ...categories.slice(0, 6).map(cat => ({
      href: `${storefrontHref(slug)}?cat=${encodeURIComponent(cat)}`,
      label: cat,
    })),
    { href: storefrontHref(slug, '/delivery'), label: 'การจัดส่ง' },
    { href: storefrontHref(slug, '/account'), label: 'บัญชีของฉัน' },
  ];

  return (
    <div
      className={storefrontRootClasses(cfg).join(' ')}
      style={storefrontCssVars(cfg) as React.CSSProperties}
    >
      {/* ธีมตามเครื่องลูกค้า (prefers-color-scheme) — ไม่มีปุ่มสลับเอง เพราะกินที่บนหัวร้านที่มีของสำคัญกว่า */}
      {cfg.announcement && (
        <div className="sf-announcement">{cfg.announcement}</div>
      )}

      <StoreHeader
        cfg={cfg}
        slug={slug}
        shopName={shopName}
        logoUrl={company.logo_url || null}
        navLinks={navLinks}
      />

      <main className="sf-main">{children}</main>

      <footer className="sf-footer">
        <div className="sf-container sf-footer-inner">
          <div>
            <div className="sf-footer-title">{shopName}</div>
            {cfg.tagline && <p className="sf-footer-text">{cfg.tagline}</p>}
            {company.address && <p className="sf-footer-text">{company.address}</p>}
          </div>
          <div className="sf-footer-contact">
            {company.phone && <p className="sf-footer-text">โทร {company.phone}</p>}
            {company.email && <p className="sf-footer-text">{company.email}</p>}
            <Link href={storefrontHref(slug, '/delivery')} className="sf-footer-link">
              พื้นที่จัดส่งและรอบส่ง
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
