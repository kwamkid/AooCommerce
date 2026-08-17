'use client';

import Link from 'next/link';
import { useCart, setQuantity, removeFromCart } from '@/lib/storefront-cart';
import { formatStorePrice, storefrontHref } from '@/lib/storefront';

export default function CartClient({ shop }: { shop: string }) {
  const { lines, subtotal, hydrated } = useCart(shop);

  if (!hydrated) {
    return <div className="sf-container"><p className="sf-empty">กำลังโหลดตะกร้า…</p></div>;
  }

  if (lines.length === 0) {
    return (
      <div className="sf-container">
        <div className="sf-hero"><h1>ตะกร้าสินค้า</h1></div>
        <p className="sf-empty">ยังไม่มีสินค้าในตะกร้า</p>
        <p style={{ textAlign: 'center' }}>
          <Link href={storefrontHref(shop)} className="sf-cta">เลือกซื้อสินค้า</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="sf-container">
      <div className="sf-hero"><h1>ตะกร้าสินค้า</h1></div>

      <div className="sf-cart-list">
        {lines.map(l => (
          <div key={l.variation_id} className="sf-cart-row">
            <div className="sf-cart-thumb">
              {l.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={l.image} alt={l.name} />
                : <span className="sf-card-media-empty">—</span>}
            </div>

            <div className="sf-cart-info">
              <Link href={storefrontHref(shop, `/p/${l.product_slug}`)} className="sf-cart-name">
                {l.name}
              </Link>
              {l.variation_label && <div className="sf-cart-variant">{l.variation_label}</div>}
              <div className="sf-cart-unit">{formatStorePrice(l.price)} / ชิ้น</div>
            </div>

            <div className="sf-qty" role="group" aria-label={`จำนวนของ ${l.name}`}>
              <button type="button" onClick={() => setQuantity(shop, l.variation_id, l.quantity - 1)} aria-label="ลดจำนวน">−</button>
              <span>{l.quantity}</span>
              <button type="button" onClick={() => setQuantity(shop, l.variation_id, l.quantity + 1)} aria-label="เพิ่มจำนวน">+</button>
            </div>

            <div className="sf-cart-total">{formatStorePrice(l.price * l.quantity)}</div>

            <button
              type="button"
              className="sf-cart-remove"
              onClick={() => removeFromCart(shop, l.variation_id)}
              aria-label={`ลบ ${l.name} ออกจากตะกร้า`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="sf-cart-foot">
        <div>
          <div className="sf-cart-subtotal-label">ยอดรวมสินค้า</div>
          <div className="sf-cart-subtotal">{formatStorePrice(subtotal)}</div>
          <div className="sf-cart-note">ค่าจัดส่งคำนวณในขั้นตอนถัดไปตามพื้นที่จัดส่ง</div>
        </div>
        <div className="sf-cart-actions">
          <Link href={storefrontHref(shop)} className="sf-btn-ghost">เลือกซื้อต่อ</Link>
          <Link href={storefrontHref(shop, '/checkout')} className="sf-cta">สั่งซื้อ</Link>
        </div>
      </div>
    </div>
  );
}
