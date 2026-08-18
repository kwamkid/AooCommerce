// Path: app/store/[slug]/layout.tsx
// Storefront shell — header/footer + per-company theme tokens.
// Standalone surface (SEO/AEO primary). The embedded (WordPress) surface will
// reuse the same page bodies without this chrome.
import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { getStorefrontCompany, getStorefrontCategories, getClosedStorefront } from '@/lib/storefront-server';
import { storefrontCssVars, storefrontHref } from '@/lib/storefront';
import CartBadge from '@/components/storefront/CartBadge';
import MobileNav from '@/components/storefront/MobileNav';
import SearchBox from '@/components/storefront/SearchBox';
import ShopUnavailable from '@/components/storefront/ShopUnavailable';
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
  if (!company) {
    // แยกให้ออก: ปิดชั่วคราว (มีร้านจริง) vs ไม่มีร้านนี้
    return <ShopUnavailable closed={await getClosedStorefront(slug)} />;
  }

  const categories = await getStorefrontCategories(company.id);
  const cfg = company.config;
  const shopName = cfg.display_name || company.name;

  // ถ้าร้านยังไม่ได้อัปโหลดโลโก้ ต้องเหลือชื่อร้านไว้เสมอ ไม่งั้นหัวร้านว่างเปล่า
  // และไม่มีลิงก์กลับหน้าแรกให้คลิก
  const showLogo = !!company.logo_url && cfg.logo_display !== 'name_only';
  const showName = cfg.logo_display !== 'logo_only' || !showLogo;

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
      className={[
        'sf-root',
        cfg.layout === 'editorial' ? 'sf-layout-editorial' : cfg.layout === 'masonry' ? 'sf-layout-masonry' : '',
        cfg.image_ratio === 'auto' ? 'sf-ratio-auto' : '',
        cfg.button_style === 'outline' ? 'sf-btn-outline' : cfg.button_style === 'soft' ? 'sf-btn-soft' : '',
      ].filter(Boolean).join(' ')}
      style={storefrontCssVars(cfg) as React.CSSProperties}
    >
      {/* ธีมตามเครื่องลูกค้า (prefers-color-scheme) — ไม่มีปุ่มสลับเอง เพราะกินที่บนหัวร้านที่มีของสำคัญกว่า */}
      {cfg.announcement && (
        <div className="sf-announcement">{cfg.announcement}</div>
      )}

      <header className={`sf-header sf-head-${cfg.header_layout}`}>
        <div className="sf-container sf-header-top">
          <Link href={storefrontHref(slug)} className="sf-brand">
            {showLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url!} alt={shopName} className="sf-brand-logo" />
            )}
            {showName && <span className="sf-brand-name">{shopName}</span>}
          </Link>

          {/* left: เมนูต่อจากโลโก้ในบรรทัดเดียวกัน (จอแคบยุบเป็นแฮมเบอร์เกอร์) */}
          {cfg.header_layout === 'left' && (
            <nav className="sf-nav sf-nav-inline" aria-label="หมวดสินค้า">
              {navLinks.slice(0, 6).map(l => (
                <Link key={l.href} href={l.href} className="sf-nav-link">{l.label}</Link>
              ))}
            </nav>
          )}

          <div className="sf-header-actions">
            <Suspense fallback={<span className="sf-icon-btn" aria-hidden="true" />}>
              <SearchBox shop={slug} />
            </Suspense>
            <CartBadge shop={slug} />
          </div>

          <MobileNav links={navLinks} />
        </div>

        {/* stacked / center: เมนูอยู่บรรทัดล่าง */}
        {(cfg.header_layout === 'stacked' || cfg.header_layout === 'center') && (
          <div className="sf-container">
            <nav className="sf-nav" aria-label="หมวดสินค้า">
              {navLinks.map(l => (
                <Link key={l.href} href={l.href} className="sf-nav-link">{l.label}</Link>
              ))}
            </nav>
          </div>
        )}
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
