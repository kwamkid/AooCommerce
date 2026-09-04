import type { Metadata } from 'next';
import Link from 'next/link';

// หน้าแรกสาธารณะ — **ต้องเปิดดูได้โดยไม่ต้อง login**
//
// ⚠️ ผู้ตรวจแอปของ TikTok / Meta / Google เปิด URL นี้เป็นด่านแรก และตีกลับถ้าเจอ
// หน้า login หรือหน้าเปล่า ๆ · TikTok for Developers ตีกลับมาแล้วครั้งหนึ่ง
// (4 ก.ย. 2026) ด้วยเหตุผลตรง ๆ ว่า "must be fully developed and cannot be a
// landing or login page" + "Privacy Policy and Terms of Service links must be
// clearly visible without needing to open a menu or log in"
//
// เพราะงั้นหน้านี้ต้องคง 3 อย่างไว้เสมอ:
//   1. อธิบายว่าระบบทำอะไรได้จริง (ไม่ใช่หน้าเปล่ารอ login)
//   2. ลิงก์ ข้อตกลง / ความเป็นส่วนตัว / การลบข้อมูล **เห็นได้เลยโดยไม่ต้องกดเมนู**
//   3. เป็น server component ล้วน — ผู้ตรวจและ crawler ที่ไม่รัน JS ต้องเห็นเนื้อหาครบ
//
// ผู้ใช้ที่ล็อกอินแล้วไม่ต้องเห็นหน้านี้ — proxy.ts เด้งไป /dashboard ให้ตั้งแต่ edge

export const metadata: Metadata = {
  title: 'AooCommerce — ระบบจัดการร้านค้าออนไลน์หลายช่องทาง',
  description:
    'รวมออเดอร์ แชท สต็อก และเอกสารจาก Shopee, TikTok Shop, Lazada, LINE และ Facebook ไว้ในระบบเดียว สำหรับร้านค้าออนไลน์ในประเทศไทย',
};

const FEATURES = [
  {
    title: 'รวมออเดอร์ทุกช่องทาง',
    detail:
      'ออเดอร์จาก Shopee, TikTok Shop, Lazada, หน้าร้านออนไลน์ และการเปิดบิลเอง เข้ามาที่เดียว พร้อมสถานะที่ตรงกับแพลตฟอร์มต้นทางเสมอ',
  },
  {
    title: 'กล่องแชทเดียวจบ',
    detail:
      'ข้อความจาก LINE OA, Facebook, Instagram และแชทของ marketplace มารวมในหน้าเดียว ตอบลูกค้าได้โดยไม่ต้องสลับแอป',
  },
  {
    title: 'สต็อกและต้นทุนที่เชื่อถือได้',
    detail:
      'ตัดสต็อกอัตโนมัติตามออเดอร์จริง คิดต้นทุนเฉลี่ยถ่วงน้ำหนัก และผลักสต็อกกลับขึ้นแพลตฟอร์มให้ตรงกัน',
  },
  {
    title: 'เอกสารครบตามกรมสรรพากร',
    detail:
      'ใบกำกับภาษี ใบเสร็จ ใบส่งของ ใบวางบิล และใบลดหนี้ ออกอัตโนมัติตามประเภทการขาย พร้อมเลขที่เอกสารต่อเนื่อง',
  },
  {
    title: 'รู้กำไรที่แท้จริง',
    detail:
      'ดึงยอดเงินที่แพลตฟอร์มโอนจริงมาเทียบกับต้นทุน เห็นว่าโดนหักค่าคอม ค่าส่ง ค่าโฆษณาไปเท่าไหร่ต่อออเดอร์',
  },
  {
    title: 'ขายหน้าร้านและฝากขาย',
    detail:
      'รองรับ POS หน้าร้าน ตัวแทนจำหน่าย ห้างสรรพสินค้าแบบฝากขาย และการเติมสินค้าประจำสาขา',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <span className="text-lg font-bold text-primary">AooCommerce</span>
          <nav className="flex items-center gap-4 subtitle-text">
            <Link href="/legal/terms" className="text-gray-600 hover:text-primary hidden sm:inline">
              ข้อตกลงการใช้บริการ
            </Link>
            <Link href="/legal/privacy" className="text-gray-600 hover:text-primary hidden sm:inline">
              ความเป็นส่วนตัว
            </Link>
            <Link href="/login" className="btn btn-sm btn-primary">เข้าสู่ระบบ</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-5 pt-12 pb-10">
          <h1 className="heading-1 text-gray-900">
            ระบบจัดการร้านค้าออนไลน์หลายช่องทาง
          </h1>
          <p className="mt-3 body-text text-gray-700 max-w-2xl">
            AooCommerce รวมออเดอร์ แชท สต็อก และเอกสารทางบัญชีของร้านค้าไทยไว้ในระบบเดียว
            เจ้าของร้านเชื่อมต่อร้านของตัวเองบน Shopee, TikTok Shop และ Lazada แล้วจัดการทุกอย่าง
            จากหน้าจอเดียว โดยไม่ต้องสลับไปมาหลายแอป
          </p>
          <p className="mt-2 body-text text-gray-700 max-w-2xl" lang="en">
            AooCommerce is a multi-channel commerce management system for Thai merchants. Sellers
            connect their own marketplace shops and chat channels, then manage orders, inventory,
            customer conversations and tax documents from one place.
          </p>
        </section>

        <section className="max-w-5xl mx-auto px-5 pb-12">
          <h2 className="heading-3 text-gray-900">ความสามารถหลัก</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white rounded-lg shadow-sm px-5 py-4">
                <h3 className="heading-4 text-gray-900">{f.title}</h3>
                <p className="mt-1.5 subtitle-text text-gray-600">{f.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-5 pb-14">
          <div className="bg-white rounded-lg shadow-sm px-6 py-6">
            <h2 className="heading-3 text-gray-900">
              ช่องทางที่เชื่อมต่อได้<span className="ml-2 text-base font-normal text-gray-400" lang="en">Connected platforms</span>
            </h2>
            <p className="mt-2 body-text text-gray-700">
              เจ้าของร้านเป็นผู้กดอนุญาตให้ระบบเข้าถึงร้านของตัวเอง และถอนสิทธิ์ได้ตลอดเวลา
              ระบบเข้าถึงเฉพาะข้อมูลของร้านที่อนุญาตเท่านั้น ไม่มีการนำข้อมูลไปใช้ข้ามร้าน
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 body-text text-gray-700 list-disc pl-5">
              <li>Shopee — ออเดอร์ สินค้า สต็อก ราคา และยอดเงินที่โอนจริง</li>
              <li>TikTok Shop — ออเดอร์ สินค้า และข้อความจากผู้ซื้อ</li>
              <li>Lazada — ออเดอร์ สินค้า ข้อความ และรายการเดินบัญชี</li>
              <li>LINE Official Account และ Facebook / Instagram — ข้อความลูกค้า</li>
            </ul>
          </div>
        </section>
      </main>

      {/* ⚠️ ลิงก์ 3 ตัวนี้ต้องอยู่ตรงนี้เสมอ เห็นได้โดยไม่ต้องกดเมนูและไม่ต้อง login
          — เป็นเงื่อนไขตรง ๆ ของผู้ตรวจ TikTok / Meta */}
      <footer className="bg-white border-t border-gray-200">
        <div className="max-w-5xl mx-auto px-5 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="helper-text text-gray-500">
            © {new Date().getFullYear()} AooCommerce
          </p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 subtitle-text">
            <Link href="/legal/terms" className="text-gray-600 hover:text-primary">
              ข้อตกลงการใช้บริการ <span lang="en" className="text-gray-400">(Terms of Service)</span>
            </Link>
            <Link href="/legal/privacy" className="text-gray-600 hover:text-primary">
              นโยบายความเป็นส่วนตัว <span lang="en" className="text-gray-400">(Privacy Policy)</span>
            </Link>
            <Link href="/legal/data-deletion" className="text-gray-600 hover:text-primary">
              การลบข้อมูล <span lang="en" className="text-gray-400">(Data Deletion)</span>
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
