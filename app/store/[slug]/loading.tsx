// Path: app/store/[slug]/loading.tsx
// หน้าร้านมีแบรนด์ของร้านเอง — ห้ามตกไปใช้ splash สีส้มของ aoo ใน app/loading.tsx
// (ลูกค้าของร้านไม่รู้จัก aoo และไม่ควรต้องเห็น)
export default function Loading() {
  return (
    <div className="sf-container">
      <p className="sf-empty">กำลังโหลด…</p>
    </div>
  );
}
