// การ์ดสินค้าในหน้ารวมสินค้า
//
// อยู่ที่ components/ ไม่ใช่ในไฟล์ page เพราะหน้าตั้งค่าธีมเอาไปเรนเดอร์เป็น
// พรีวิวด้วย — พรีวิวต้องเป็น "ของจริง" ไม่ใช่ HTML ที่วาดเลียนแบบ ไม่งั้น
// ทุกครั้งที่แก้การ์ด พรีวิวจะเพี้ยนตามไม่ทันแล้วผู้ใช้ตั้งค่าจากภาพที่ผิด
import Link from 'next/link';
import QuickAddButton from '@/components/storefront/QuickAddButton';
import { storefrontHref, formatStorePrice, type StorefrontProduct } from '@/lib/storefront';

export default function StoreProductCard({ product, slug }: { product: StorefrontProduct; slug: string }) {
  const cover = product.images[0];
  const hasRange = product.price_max > product.price_min;
  const firstCompare = product.variations.find(v => v.compare_at != null)?.compare_at ?? null;

  // การ์ดเป็น <article> ไม่ใช่ <a> ทั้งใบ เพราะ <button> ซ้อนใน <a> เป็น HTML
  // ที่ไม่ถูกต้อง — ลิงก์ครอบเฉพาะรูป+ชื่อ ซึ่งพอสำหรับ crawler เดินหน้าสินค้า
  return (
    <article className="sf-card">
      <Link href={storefrontHref(slug, `/p/${product.slug}`)} className="sf-card-link">
        <div className="sf-card-media">
          {cover
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={cover} alt={product.name} loading="lazy" />
            : <span className="sf-card-media-empty">ไม่มีรูป</span>}
        </div>
        <div className="sf-card-body">
          {product.category && <span className="sf-card-cat">{product.category}</span>}
          <span className="sf-card-name">{product.name}</span>
          <span className="sf-card-price">
            {product.in_stock ? (
              <>
                {hasRange
                  ? `${formatStorePrice(product.price_min)}–${formatStorePrice(product.price_max)}`
                  : formatStorePrice(product.price_min)}
                {!hasRange && firstCompare && (
                  <span className="sf-card-compare">{formatStorePrice(firstCompare)}</span>
                )}
              </>
            ) : (
              <span className="sf-oos">สินค้าหมดชั่วคราว</span>
            )}
          </span>
        </div>
      </Link>

      <div className="sf-card-foot">
        <QuickAddButton
          shop={slug}
          productSlug={product.slug}
          productName={product.name}
          variations={product.variations}
          cover={cover ?? null}
        />
      </div>
    </article>
  );
}
