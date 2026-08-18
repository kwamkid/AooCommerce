// หัวร้าน — ใช้ทั้งหน้าร้านจริงและพรีวิวในหน้าตั้งค่าธีม
//
// เดิมหัวร้านเขียนอยู่ใน layout ของหน้าร้าน ส่วนหน้าตั้งค่าวาด HTML เลียนแบบ
// ขึ้นมาอีกชุด ผลคือทุกครั้งที่แก้ของจริง (ขนาดโลโก้ ระยะไอคอน ตำแหน่งเมนู)
// พรีวิวจะเพี้ยนทันทีและผู้ใช้ตั้งค่าจากภาพที่ไม่ตรงความจริง — แชร์ component
// เดียวกันคือทางเดียวที่ทำให้มันตรงกันตลอดไปโดยไม่ต้องคอยไล่แก้
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SearchBox from '@/components/storefront/SearchBox';
import CartBadge from '@/components/storefront/CartBadge';
import MobileNav, { type NavLink } from '@/components/storefront/MobileNav';
import { storefrontHref, type StorefrontConfig } from '@/lib/storefront';

interface Props {
  cfg: StorefrontConfig;
  slug: string;
  shopName: string;
  logoUrl: string | null;
  navLinks: NavLink[];
  /** พรีวิวในหน้าตั้งค่าไม่ต้องซ่อนตามการเลื่อนของหน้าหลังบ้าน */
  autoHide?: boolean;
}

export default function StoreHeader({ cfg, slug, shopName, logoUrl, navLinks, autoHide = true }: Props) {
  // Headroom pattern (Material Design เรียก "Quick Return") — เลื่อนลงหัวร้านหลบ
  // ให้เนื้อหาเต็มจอ เลื่อนขึ้นเมื่อไหร่โผล่กลับมาทันทีโดยไม่ต้องเลื่อนกลับไปบนสุด
  // สำคัญกับมือถือที่หัวร้าน + แถบประกาศกินพื้นที่เหนือ fold ไปเยอะ
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!autoHide) return;
    let last = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        // ใกล้บนสุดโชว์เสมอ ไม่งั้นตอนดีดกลับสุดหน้าจะเห็นหัวร้านกระพริบ
        if (y < 80) { setHidden(false); last = y; return; }
        const dy = y - last;
        if (Math.abs(dy) < 6) return;   // กันสั่นจากการเลื่อนนิดเดียว
        setHidden(dy > 0);
        last = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [autoHide]);

  // ไม่มีไฟล์โลโก้ต้องเหลือชื่อร้านไว้เสมอ ไม่งั้นหัวร้านว่างและไม่มีลิงก์กลับหน้าแรก
  const showLogo = !!logoUrl && cfg.logo_display !== 'name_only';
  const showName = cfg.logo_display !== 'logo_only' || !showLogo;

  // แบบโลโก้ซ้ายวางเมนูในบรรทัดเดียวกับโลโก้ จึงใส่ได้จำกัด
  // อีกสองแบบมีบรรทัดของตัวเองเลยใส่ได้ครบ
  const inlineLinks = cfg.header_layout === 'left' ? navLinks.slice(0, 6) : navLinks;

  return (
    <header className={`sf-header${hidden ? ' sf-header-hidden' : ''}`}>
      <div className="sf-container sf-header-top">
        <Link href={storefrontHref(slug)} className="sf-brand">
          {showLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl!} alt={shopName} className="sf-brand-logo" />
          )}
          {showName && <span className="sf-brand-name">{shopName}</span>}
        </Link>

        <nav className="sf-nav" aria-label="หมวดสินค้า">
          {inlineLinks.map((l, i) => (
            <Link key={i} href={l.href} className="sf-nav-link">{l.label}</Link>
          ))}
        </nav>

        {/* แฮมเบอร์เกอร์อยู่ในกลุ่มไอคอนเดียวกับค้นหา/ตะกร้า ระยะห่างจะได้เท่ากัน
            (ตอนแยกออกมาเป็นลูกของแถว header มันไปกิน gap 16px ของแถวแทน) */}
        <div className="sf-header-actions">
          <Suspense fallback={<span className="sf-icon-btn" aria-hidden="true" />}>
            <SearchBox shop={slug} />
          </Suspense>
          <CartBadge shop={slug} />
          <MobileNav links={navLinks} />
        </div>
      </div>
    </header>
  );
}
