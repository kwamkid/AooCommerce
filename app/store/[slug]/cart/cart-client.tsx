'use client';

import Link from 'next/link';
import { ChevronLeft, Minus, Plus, X } from 'lucide-react';
import { useCart, setQuantity, removeFromCart } from '@/lib/storefront-cart';
import { formatStorePrice, storefrontHref } from '@/lib/storefront';
import CheckoutSteps from '@/components/storefront/CheckoutSteps';

export default function CartClient({ shop }: { shop: string }) {
  const { lines, subtotal, hydrated } = useCart(shop);

  if (!hydrated) {
    return <div className="sf-container"><p className="sf-empty">กำลังโหลดตะกร้า…</p></div>;
  }

  if (lines.length === 0) {
    return (
      <div className="sf-container">
        <CheckoutSteps shop={shop} current="cart" />
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
      <CheckoutSteps shop={shop} current="cart" />
      <div className="sf-hero"><h1>ตะกร้าสินค้า</h1></div>

      {/* ใช้กริดเดียวกับหน้าชำระเงิน — กล่องสรุปอยู่ขวาและติดหน้าจอบนเดสก์ท็อป
          ปุ่มสั่งซื้อจึงอยู่ในสายตาตลอด ไม่ต้องเลื่อนลงไปหาท้ายรายการ */}
      <div className="sf-checkout">
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
              <button type="button" onClick={() => setQuantity(shop, l.variation_id, l.quantity - 1)} aria-label="ลดจำนวน"><Minus strokeWidth={2} aria-hidden="true" /></button>
              <span>{l.quantity}</span>
              <button type="button" onClick={() => setQuantity(shop, l.variation_id, l.quantity + 1)} aria-label="เพิ่มจำนวน"><Plus strokeWidth={2} aria-hidden="true" /></button>
            </div>

            <div className="sf-cart-total">{formatStorePrice(l.price * l.quantity)}</div>

            <button
              type="button"
              className="sf-cart-remove"
              onClick={() => removeFromCart(shop, l.variation_id)}
              aria-label={`ลบ ${l.name} ออกจากตะกร้า`}
            >
              <X strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <aside className="sf-summary">
        <h2>สรุปคำสั่งซื้อ</h2>
        {lines.map(l => (
          <div key={l.variation_id} className="sf-summary-row">
            <span>{l.name}{l.variation_label ? ` · ${l.variation_label}` : ''} × {l.quantity}</span>
            <span>{formatStorePrice(l.price * l.quantity)}</span>
          </div>
        ))}
        <div className="sf-summary-row sf-summary-total">
          <span>ยอดรวมสินค้า</span>
          <span>{formatStorePrice(subtotal)}</span>
        </div>
        <p className="sf-cart-note">ค่าจัดส่งคำนวณในขั้นตอนถัดไปตามพื้นที่จัดส่ง</p>
        <div className="sf-order-actions">
          <Link href={storefrontHref(shop, '/checkout')} className="sf-cta sf-cta-block">สั่งซื้อ</Link>
          <Link href={storefrontHref(shop)} className="sf-btn-ghost sf-cta-block">
            <ChevronLeft strokeWidth={2} aria-hidden="true" />ช้อปต่อ
          </Link>
        </div>
      </aside>
      </div>
    </div>
  );
}
