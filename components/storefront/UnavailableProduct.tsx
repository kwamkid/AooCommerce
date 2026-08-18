// หน้าสำหรับ URL สินค้าที่เปิดไม่ได้แล้ว
//
// ⚠️ ห้ามทำเป็นหน้า 404 เปล่า ๆ หรือ redirect ไปหน้าแรก
// URL สินค้าที่เลิกขาย = URL ที่ Google เคยเก็บไว้ตอนของยังขายอยู่ คนยังค้นเจอ
// และกดเข้ามาเรื่อย ๆ ถ้าเจอหน้าเปล่าก็เด้งออกทันที = เสียลูกค้าฟรี ๆ
// จึงบอกตรง ๆ ว่าไม่มีแล้ว แล้วพาไปดูของที่ยังขายอยู่แทน
import Link from 'next/link';
import { PackageX } from 'lucide-react';
import { storefrontHref, formatStorePrice, type StorefrontProduct } from '@/lib/storefront';

interface Props {
  shop: string;
  /** ชื่อสินค้าเดิม — null เมื่อ URL นี้ไม่เคยมีสินค้าอยู่จริง */
  productName: string | null;
  productImage?: string | null;
  category?: string | null;
  suggestions: StorefrontProduct[];
}

export default function UnavailableProduct({
  shop, productName, productImage, category, suggestions,
}: Props) {
  const discontinued = !!productName;

  return (
    <div className="sf-container">
      <div className="sf-gone">
        {productImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={productImage} alt={productName || ''} className="sf-gone-img" />
        ) : (
          <PackageX className="sf-gone-icon" strokeWidth={1.4} aria-hidden="true" />
        )}
        <div>
          <h1>
            {discontinued ? `${productName} ไม่มีจำหน่ายแล้ว` : 'ไม่พบสินค้าที่คุณค้นหา'}
          </h1>
          <p>
            {discontinued
              ? 'สินค้านี้ปิดการขายไปแล้ว แต่เรายังมีสินค้าอื่นที่น่าสนใจให้เลือก'
              : 'ลิงก์อาจไม่ถูกต้องหรือสินค้าถูกนำออกไปแล้ว ลองดูสินค้าที่มีอยู่ตอนนี้'}
          </p>
          <div className="sf-gone-actions">
            <Link href={storefrontHref(shop)} className="sf-cta">ดูสินค้าทั้งหมด</Link>
            {category && (
              <Link
                href={`${storefrontHref(shop)}?cat=${encodeURIComponent(category)}`}
                className="sf-btn-ghost"
              >
                ดูหมวด {category}
              </Link>
            )}
          </div>
        </div>
      </div>

      {suggestions.length > 0 && (
        <section className="sf-section">
          <h2>{category ? `สินค้าอื่นในหมวด ${category}` : 'สินค้าแนะนำ'}</h2>
          <div className="sf-grid">
            {suggestions.map(p => (
              <Link key={p.id} href={storefrontHref(shop, `/p/${p.slug}`)} className="sf-card">
                <div className="sf-card-media">
                  {p.images[0]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.images[0]} alt={p.name} loading="lazy" />
                    : <span className="sf-card-media-empty">ไม่มีรูป</span>}
                </div>
                <div className="sf-card-body">
                  {p.category && <span className="sf-card-cat">{p.category}</span>}
                  <span className="sf-card-name">{p.name}</span>
                  <span className="sf-card-price">{formatStorePrice(p.price_min)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
