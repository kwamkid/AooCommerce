// ร้านไม่มีอยู่ / ปิดหน้าร้านออนไลน์อยู่
//
// ไม่ใช้ notFound() เพราะได้หน้า 404 มาตรฐานของ Next ที่ไม่มีธีมร้านเลย
// และรหัสสถานะก็ออกมาเป็น 200 อยู่ดี (พฤติกรรมของ Next 16 ในโปรเจกต์นี้)
// หน้าตัวเองจึงคุมข้อความได้ และหน้าที่เรียกมันตั้ง robots: noindex ไว้แล้ว
import { Store } from 'lucide-react';

export default function ShopUnavailable() {
  return (
    <div className="sf-root sf-standalone">
      <div className="sf-container sf-gone" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <Store className="sf-gone-icon" strokeWidth={1.4} aria-hidden="true" />
        <div>
          <h1>ไม่พบหน้าร้านนี้</h1>
          <p>ร้านนี้อาจปิดหน้าร้านออนไลน์ชั่วคราว หรือลิงก์ไม่ถูกต้อง</p>
        </div>
      </div>
    </div>
  );
}
