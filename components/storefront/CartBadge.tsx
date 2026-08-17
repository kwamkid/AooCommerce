// Cart link + live item count in the storefront header.
// Renders the count only after hydration so the SSR HTML and the first client
// render match (the server has no localStorage).
'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/lib/storefront-cart';
import { storefrontHref } from '@/lib/storefront';

export default function CartBadge({ shop }: { shop: string }) {
  const { count, hydrated } = useCart(shop);

  return (
    <Link
      href={storefrontHref(shop, '/cart')}
      className="sf-cart-link"
      aria-label={hydrated && count > 0 ? `ตะกร้าสินค้า ${count} ชิ้น` : 'ตะกร้าสินค้า'}
    >
      <span className="sf-cart-icon">
        <ShoppingBag strokeWidth={1.75} aria-hidden="true" />
        {hydrated && count > 0 && <span className="sf-cart-count">{count > 99 ? '99+' : count}</span>}
      </span>
      <span className="sf-cart-text">ตะกร้า</span>
    </Link>
  );
}
