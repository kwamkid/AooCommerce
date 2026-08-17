// Quick add-to-cart on a catalog card.
//
// สินค้าที่มีหลายตัวเลือกจะไม่เดาให้ — ส่งไปหน้าสินค้าให้ลูกค้าเลือกเอง
// (เดาผิดแล้วลูกค้าได้ของผิดขนาด เสียกว่าคลิกเพิ่มอีกครั้ง)
'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Check, SlidersHorizontal } from 'lucide-react';
import { addToCart } from '@/lib/storefront-cart';
import { flyToCart, findProductImage, FLY_DURATION } from '@/lib/storefront-fly-to-cart';
import { storefrontHref, type StorefrontVariation } from '@/lib/storefront';

interface Props {
  shop: string;
  productSlug: string;
  productName: string;
  variations: StorefrontVariation[];
  cover: string | null;
}

export default function QuickAddButton({ shop, productSlug, productName, variations, cover }: Props) {
  const [added, setAdded] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const sellable = variations.filter(v => v.in_stock);

  if (sellable.length === 0) {
    return <span className="sf-quickadd sf-quickadd-off">สินค้าหมด</span>;
  }

  // หลายตัวเลือก → ให้ไปเลือกที่หน้าสินค้า
  if (sellable.length > 1) {
    return (
      <Link href={storefrontHref(shop, `/p/${productSlug}`)} className="sf-quickadd">
        <SlidersHorizontal strokeWidth={1.75} aria-hidden="true" />
        เลือกตัวเลือก
      </Link>
    );
  }

  const v = sellable[0];
  const handleAdd = () => {
    const flying = flyToCart(findProductImage(btnRef.current));
    setAdded(true);
    window.setTimeout(() => setAdded(false), FLY_DURATION + 900);
    // ใส่ตะกร้าตอนรูปบินถึงพอดี — badge จะเด้งรับ ไม่ใช่เด้งทิ้งไว้ก่อน
    const commit = () => addToCart(shop, {
      variation_id: v.id,
      product_slug: productSlug,
      name: productName,
      variation_label: v.label,
      price: v.price,
      image: v.image || cover,
    }, 1);
    if (flying) window.setTimeout(commit, FLY_DURATION - 120);
    else commit();
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className={`sf-quickadd ${added ? 'sf-quickadd-done' : ''}`}
      onClick={handleAdd}
      aria-label={`หยิบ ${productName} ใส่ตะกร้า`}
    >
      <span className="sf-quickadd-face" key={added ? 'done' : 'idle'}>
        {added
          ? <><Check strokeWidth={2} aria-hidden="true" />เพิ่มแล้ว</>
          : <><Plus strokeWidth={2} aria-hidden="true" />หยิบใส่ตะกร้า</>}
      </span>
    </button>
  );
}
