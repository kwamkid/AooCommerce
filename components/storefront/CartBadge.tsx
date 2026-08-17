// Cart link + live item count in the storefront header.
// Renders nothing until hydrated so SSR HTML and the first client render match.
'use client';

import Link from 'next/link';
import { useCart } from '@/lib/storefront-cart';
import { storefrontHref } from '@/lib/storefront';

export default function CartBadge({ shop }: { shop: string }) {
  const { count, hydrated } = useCart(shop);

  return (
    <Link href={storefrontHref(shop, '/cart')} className="sf-cart-link" aria-label="ตะกร้าสินค้า">
      <span aria-hidden="true">🛒</span>
      <span>ตะกร้า</span>
      {hydrated && count > 0 && <span className="sf-cart-count">{count}</span>}
    </Link>
  );
}
