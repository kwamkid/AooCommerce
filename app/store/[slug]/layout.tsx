// Path: app/store/[slug]/layout.tsx
// Storefront shell — header/footer + per-company theme tokens.
// Standalone surface (SEO/AEO primary). The embedded (WordPress) surface will
// reuse the same page bodies without this chrome.
import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStorefrontCompany, getStorefrontCategories } from '@/lib/storefront-server';
import { storefrontCssVars, storefrontHref } from '@/lib/storefront';
import CartBadge from '@/components/storefront/CartBadge';
import ThemeToggle from '@/components/storefront/ThemeToggle';
import SearchBox from '@/components/storefront/SearchBox';
import './storefront.css';

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) notFound();

  const categories = await getStorefrontCategories(company.id);
  const cfg = company.config;
  const shopName = cfg.display_name || company.name;

  return (
    <div className="sf-root" style={storefrontCssVars(cfg) as React.CSSProperties}>
      {/* ตั้งธีมก่อน paint — ไม่งั้นหน้าจะกะพริบขาวก่อนเปลี่ยนเป็นมืด */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('aoo-sf-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-sf-theme',t);}catch(e){}})();`,
        }}
      />
      {cfg.announcement && (
        <div className="sf-announcement">{cfg.announcement}</div>
      )}

      <header className="sf-header">
        <div className="sf-container sf-header-top">
          <Link href={storefrontHref(slug)} className="sf-brand">
            {company.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt={shopName} className="sf-brand-logo" />
            )}
            <span className="sf-brand-name">{shopName}</span>
          </Link>

          <Suspense fallback={<div className="sf-search-skeleton" />}>
            <SearchBox shop={slug} />
          </Suspense>

          <div className="sf-header-actions">
            <ThemeToggle />
            <CartBadge shop={slug} />
          </div>
        </div>

        <div className="sf-container">
          <nav className="sf-nav" aria-label="หมวดสินค้า">
            <Link href={storefrontHref(slug)} className="sf-nav-link">สินค้าทั้งหมด</Link>
            {categories.slice(0, 6).map(cat => (
              <Link
                key={cat}
                href={`${storefrontHref(slug)}?cat=${encodeURIComponent(cat)}`}
                className="sf-nav-link"
              >
                {cat}
              </Link>
            ))}
            <Link href={storefrontHref(slug, '/delivery')} className="sf-nav-link">การจัดส่ง</Link>
          </nav>
        </div>
      </header>

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
