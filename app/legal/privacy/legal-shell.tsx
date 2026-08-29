import Link from 'next/link';
import type { ReactNode } from 'react';

// เปลือกร่วมของหน้าเอกสารทางกฎหมาย (ข้อตกลง + ความเป็นส่วนตัว)
//
// เป็นหน้า public เต็มตัว — ไม่มี sidebar ไม่ต้อง login เพราะผู้ตรวจแอปของ
// TikTok / Meta / Google เปิดดูก่อนอนุมัติ scope · path อยู่ใน PUBLIC_PREFIXES
// ของ proxy.ts และ PUBLIC_ROUTES ของ auth-context (สองที่ต้องตรงกันเสมอ)

export function LegalSection({
  title,
  titleEn,
  children,
}: {
  title: string;
  /** หัวข้อภาษาอังกฤษ — ผู้ตรวจของแพลตฟอร์มอ่านอังกฤษ ต้องกวาดสายตาหาหัวข้อได้ */
  titleEn?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="heading-3 text-gray-900">
        {title}
        {titleEn && <span className="ml-2 text-base font-normal text-gray-400">{titleEn}</span>}
      </h2>
      <div className="mt-2 space-y-3 body-text text-gray-700 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_li]:text-gray-700">
        {children}
      </div>
    </section>
  );
}

export default function LegalPage({
  title,
  subtitle,
  updated,
  children,
}: {
  title: string;
  subtitle: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-primary">AooCommerce</Link>
          <nav className="flex gap-4 subtitle-text">
            <Link href="/legal/terms" className="text-gray-600 hover:text-primary">ข้อตกลงการใช้บริการ</Link>
            <Link href="/legal/privacy" className="text-gray-600 hover:text-primary">ความเป็นส่วนตัว</Link>
            <Link href="/legal/data-deletion" className="text-gray-600 hover:text-primary">การลบข้อมูล</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        <h1 className="heading-1 text-gray-900">{title}</h1>
        <p className="page-subtitle" lang="en">{subtitle}</p>
        <p className="helper-text text-gray-500 mt-3">ปรับปรุงล่าสุด {updated}</p>

        <div className="mt-6 bg-white rounded-lg shadow-sm px-6 py-6 sm:px-8 sm:py-8">
          {children}

          <section className="mt-10 pt-6 border-t border-gray-200">
            <h2 className="heading-3 text-gray-900">
              ติดต่อเรา<span className="ml-2 text-base font-normal text-gray-400">Contact</span>
            </h2>
            <p className="mt-2 body-text text-gray-700">
              มีคำถามเกี่ยวกับเอกสารนี้ หรือต้องการใช้สิทธิ์เกี่ยวกับข้อมูลของคุณ ติดต่อได้ที่{' '}
              <a href="mailto:support@aoocommerce.com" className="text-primary underline">
                support@aoocommerce.com
              </a>
            </p>
          </section>
        </div>

        <p className="helper-text text-gray-400 mt-6 text-center">
          © {new Date().getFullYear()} AooCommerce
        </p>
      </main>
    </div>
  );
}
