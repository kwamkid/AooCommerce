// Client island on the (server-rendered) product page. The page stays SSR for
// SEO/AEO; only this button needs interactivity.
'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, Check } from 'lucide-react';
import { addToCart } from '@/lib/storefront-cart';
import { flyToCart, findProductImage, FLY_DURATION } from '@/lib/storefront-fly-to-cart';
import { formatStorePrice, storefrontHref, type StorefrontVariation } from '@/lib/storefront';

interface Props {
  shop: string;
  productSlug: string;
  productName: string;
  variations: StorefrontVariation[];
  images: string[];
}

export default function AddToCartButton({ shop, productSlug, productName, variations, images }: Props) {
  const sellable = variations.filter(v => v.in_stock);
  const [selectedId, setSelectedId] = useState(sellable[0]?.id || '');
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  if (sellable.length === 0) {
    return <button type="button" className="sf-cta" disabled>สินค้าหมดชั่วคราว</button>;
  }

  const selected = sellable.find(v => v.id === selectedId) || sellable[0];

  const handleAdd = () => {
    const flying = flyToCart(findProductImage(btnRef.current));
    setAdded(true);
    window.setTimeout(() => setAdded(false), FLY_DURATION + 900);
    const commit = () => addToCart(shop, {
      variation_id: selected.id,
      product_slug: productSlug,
      name: productName,
      variation_label: selected.label,
      price: selected.price,
      image: selected.image || images[0] || null,
    }, qty);
    if (flying) window.setTimeout(commit, FLY_DURATION - 120);
    else commit();
  };

  return (
    <div>
      {sellable.length > 1 && (
        <div className="sf-variations">
          {variations.map(v => (
            <button
              key={v.id}
              type="button"
              disabled={!v.in_stock}
              onClick={() => { setSelectedId(v.id); setAdded(false); }}
              className={`sf-variation ${!v.in_stock ? 'sf-variation-oos' : ''} ${v.id === selected.id ? 'sf-variation-active' : ''}`}
            >
              {v.label || 'ตัวเลือก'} · {formatStorePrice(v.price)}
              {!v.in_stock && ' (หมด)'}
            </button>
          ))}
        </div>
      )}

      <div className="sf-buy-row">
        <div className="sf-qty" role="group" aria-label="จำนวน">
          <button type="button" onClick={() => { setQty(q => Math.max(1, q - 1)); setAdded(false); }} aria-label="ลดจำนวน"><Minus strokeWidth={2} aria-hidden="true" /></button>
          <span aria-live="polite">{qty}</span>
          <button type="button" onClick={() => { setQty(q => Math.min(99, q + 1)); setAdded(false); }} aria-label="เพิ่มจำนวน"><Plus strokeWidth={2} aria-hidden="true" /></button>
        </div>
        <button
          ref={btnRef}
          type="button"
          className={`sf-cta sf-cta-add ${added ? 'sf-cta-added' : ''}`}
          onClick={handleAdd}
        >
          <span className="sf-cta-face" key={added ? 'done' : 'idle'}>
            {added
              ? <><Check strokeWidth={2.2} aria-hidden="true" />เพิ่มลงตะกร้าแล้ว</>
              : <>หยิบใส่ตะกร้า · {formatStorePrice(selected.price * qty)}</>}
          </span>
        </button>
      </div>

      {added && (
        <p className="sf-added sf-fade-up">
          <Link href={storefrontHref(shop, '/cart')} className="sf-footer-link">ดูตะกร้า →</Link>
        </p>
      )}
    </div>
  );
}
