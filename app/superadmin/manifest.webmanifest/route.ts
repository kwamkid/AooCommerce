// Manifest ของ **แอปผู้ดูแลระบบ** — คนละแอปกับของร้าน (app/manifest.ts)
//
// ติดตั้งแยกไอคอนได้เพราะ `id` กับ `start_url` ต่างกัน · `scope` จำกัดไว้ที่ /superadmin
// ทำให้กดลิงก์ออกนอกขอบเขตแล้วเด้งออกเบราว์เซอร์ปกติ ไม่ปนกับแอปร้าน
//
// ⚠️ `scope` ต้องสอดคล้องกับ PUSH_SCOPES.superadmin ใน lib/push/client.ts
// (service worker จดคนละ scope = คนละ subscription = แจ้งเตือนแยกสายกันจริง)
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
      scope: '/superadmin',
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
