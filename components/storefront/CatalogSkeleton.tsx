// โครงเทาของหน้ารายการสินค้า — ใช้ระหว่างรอ getStorefrontCatalog() (200–600ms)
// ทั้งตอนเปลี่ยน searchParams (Suspense ใน page.tsx) และตอนเข้า segment ใหม่
// (loading.tsx)
//
// ใช้ `.sf-grid` + `.sf-card` + `.sf-card-body` + `.sf-card-foot` ของจริง เพื่อให้
// จำนวนคอลัมน์/ระยะขอบตรงกับผลลัพธ์ทุกเลย์เอาต์ (ตาราง · รูปใหญ่ · ก่ออิฐ) —
// โครงที่ขยับตอนผลจริงมาถึงจะดูเหมือนหน้าเด้ง ซึ่งแย่กว่าไม่มีโครงเลย
// server component ล้วน (ไม่มี state/effect) — CSS อยู่ใน storefront-skeleton.css
// 12 ใบพอเต็มจอแรกทุกเลย์เอาต์ — 20 ใบทำ HTML บวม (โครงถูกส่งซ้ำทั้งใน flight และ HTML)
const CARDS = Array.from({ length: 12 }, (_, i) => i);

export default function CatalogSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="กำลังโหลดสินค้า">
      <div className="sf-skel sf-skel-count" />
      <div className="sf-grid sf-skel-grid">
        {CARDS.map(i => (
          <div key={i} className="sf-card sf-skel-card" aria-hidden="true">
            <div className="sf-skel sf-skel-media" />
            <div className="sf-card-body">
              <div className="sf-skel sf-skel-line" />
              <div className="sf-skel sf-skel-line sf-skel-line-short" />
              <div className="sf-skel sf-skel-price" />
            </div>
            <div className="sf-card-foot">
              <div className="sf-skel sf-skel-btn" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
