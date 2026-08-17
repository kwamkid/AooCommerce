// Cart link + live item count in the storefront header.
// The count pops whenever it grows, so adding from anywhere on the site gives
// visible feedback up here even when the button that did it is far down the page.
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/lib/storefront-cart';
import { storefrontHref } from '@/lib/storefront';

export default function CartBadge({ shop }: { shop: string }) {
  const { count, hydrated } = useCart(shop);
  const [bump, setBump] = useState(false);
  const prevCount = useRef(0);

  useEffect(() => {
    if (!hydrated) return;
    if (count > prevCount.current) {
      setBump(true);
      const t = window.setTimeout(() => setBump(false), 400);
      prevCount.current = count;
      return () => window.clearTimeout(t);
    }
    prevCount.current = count;
  }, [count, hydrated]);

  return (
    <Link
      href={storefrontHref(shop, '/cart')}
      className="sf-cart-link"
      aria-label={hydrated && count > 0 ? `ตะกร้าสินค้า ${count} ชิ้น` : 'ตะกร้าสินค้า'}
    >
      <span className={`sf-cart-icon ${bump ? 'sf-bump' : ''}`} data-sf-cart-target="">
        <ShoppingBag strokeWidth={1.75} aria-hidden="true" />
        {hydrated && count > 0 && (
          <span className="sf-cart-count">{count > 99 ? '99+' : count}</span>
        )}
      </span>
      <span className="sf-cart-text">ตะกร้า</span>
    </Link>
  );
}
