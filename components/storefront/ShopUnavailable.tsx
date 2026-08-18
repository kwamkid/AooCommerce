// หน้าร้านเปิดไม่ได้ — 2 กรณีที่ต้องพูดคนละแบบ
//
//  1. ปิดชั่วคราว  → ร้านมีอยู่จริง แค่ยังไม่เปิดขาย ต้องคงแบรนด์ไว้ บอกว่า
//                    เดี๋ยวกลับมา และให้ช่องทางติดต่อ — ลูกค้าที่อุตส่าห์มาถึง
//                    ไม่ควรถูกไล่ออกไปมือเปล่า
//  2. ไม่พบร้าน   → slug ไม่มีจริง หรือบริษัทไม่เคยเปิดหน้าร้าน บอกกลาง ๆ
//                    ห้ามเผยชื่อบริษัท (ไม่งั้นเดา slug ไล่ดูได้ว่ามีใครในระบบบ้าง)
import { Store, Clock, Phone, Mail } from 'lucide-react';
import { storefrontCssVars } from '@/lib/storefront';
import type { ClosedStorefront } from '@/lib/storefront-server';

export default function ShopUnavailable({ closed }: { closed?: ClosedStorefront | null }) {
  if (!closed) {
    return (
      <div className="sf-root sf-standalone">
        <div className="sf-container sf-gone sf-gone-center">
          <Store className="sf-gone-icon" strokeWidth={1.4} aria-hidden="true" />
          <div>
            <h1>ไม่พบหน้าร้านนี้</h1>
            <p>ลิงก์อาจไม่ถูกต้อง หรือหน้าร้านนี้ถูกปิดไปแล้ว</p>
          </div>
        </div>
      </div>
    );
  }

  const announcement = closed.config.announcement;

  return (
    <div
      className="sf-root sf-standalone"
      style={storefrontCssVars(closed.config) as React.CSSProperties}
    >
      <div className="sf-container sf-closed">
        {closed.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={closed.logo_url} alt={closed.name} className="sf-closed-logo" />
        ) : (
          <Store className="sf-gone-icon" strokeWidth={1.4} aria-hidden="true" />
        )}

        <h1>{closed.name}</h1>
        <p className="sf-closed-badge">
          <Clock strokeWidth={1.75} aria-hidden="true" /> ปิดรับออร์เดอร์ชั่วคราว
        </p>
        <p className="sf-closed-msg">
          {/* ร้านตั้งข้อความประกาศไว้ ให้ใช้ของร้านก่อน — ตรงกว่าข้อความกลาง ๆ ของระบบ */}
          {announcement || 'ขออภัย ขณะนี้ร้านปิดรับออร์เดอร์ชั่วคราว แล้วเราจะกลับมาให้บริการเร็ว ๆ นี้'}
        </p>

        {(closed.phone || closed.email || closed.line_oa) && (
          <>
            <p className="sf-hint">ติดต่อร้านได้ที่</p>
            <div className="sf-closed-contact">
              {closed.phone && (
                <a href={`tel:${closed.phone.replace(/[^0-9+]/g, '')}`} className="sf-btn-ghost">
                  <Phone strokeWidth={1.75} aria-hidden="true" /> {closed.phone}
                </a>
              )}
              {closed.email && (
                <a href={`mailto:${closed.email}`} className="sf-btn-ghost">
                  <Mail strokeWidth={1.75} aria-hidden="true" /> {closed.email}
                </a>
              )}
              {closed.line_oa && (
                <a
                  href={closed.line_oa.add_friend_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sf-cta"
                  style={{ background: '#06C755', color: '#fff' }}
                >
                  ทักทาง LINE
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
