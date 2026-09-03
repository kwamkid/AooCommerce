// Manifest ของ **แอปผู้ดูแลระบบ** — คนละแอปกับของร้าน (app/manifest.ts)
//
// ติดตั้งแยกไอคอนได้เพราะ `id` กับ `start_url` ต่างกัน
//
// ⚠️ **`scope` ต้องเป็น '/' ห้ามจำกัดไว้ที่ '/superadmin'**
// ของเดิมจำกัดไว้เพื่อกันเดินหลงไปแอปร้าน แต่ผลคือ: พอ session ในแอปนี้หมดอายุ
// (แอปที่ติดตั้งบน iOS มีถังคุกกี้ของตัวเอง แยกจาก Safari และแยกจากแอปร้าน)
// ตัวกันสิทธิ์จะพาไป `/login` ซึ่ง**อยู่นอก scope** → iOS เตะออกไปเปิดใน Safari
// → ใน Safari ล็อกอินเป็นผู้ใช้ปกติอยู่แล้ว เลยไปโผล่หน้า "เลือกบริษัท"
// → กลับเข้าแอปผู้ดูแลระบบก็ยังไม่ได้ล็อกอิน วนแบบนี้ตลอด
// (เจอจริง 4 ก.ย. 2026 — ดู fix-bug.md) · ล็อกอินต้องเกิด**ในแอปเดียวกัน**
//
// ℹ️ scope ของ manifest **คนละเรื่อง** กับ scope ของ service worker
// (PUSH_SCOPES.superadmin = '/superadmin/' ใน lib/push/client.ts) — ตัวหลังต่างหาก
// ที่ทำให้ subscription แจ้งเตือนแยกสายกัน และไม่ต้องเท่ากับ scope ของ manifest
export async function GET() {
  return Response.json(
    {
      id: '/superadmin',
      name: 'AooCommerce Admin — ผู้ดูแลระบบ',
      short_name: 'Aoo Admin',
      description: 'เฝ้าสุขภาพ integration และจัดการระบบข้ามทุกบริษัท',
      // เปิดที่หน้าแรกของ superadmin แล้วเดินต่อไปหน้าไหนก็ได้ในเมนู —
      // scope '/superadmin' ครอบทุกหน้า (Dashboard/Companies/Packages/Users/
      // API Logs/API Monitor/Error Translations) ไม่ได้จำกัดแค่หน้าเดียว
      start_url: '/superadmin',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#0f172a',
      theme_color: '#0f172a',
      icons: [
        { src: '/icons/admin-icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/admin-icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/admin-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } }
  );
}
