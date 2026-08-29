import type { Metadata } from 'next';
import LegalPage, { LegalSection } from '../privacy/legal-shell';

export const metadata: Metadata = {
  title: 'การลบข้อมูล | AooCommerce',
  description: 'วิธีเพิกถอนการเชื่อมต่อและขอลบข้อมูลของคุณจาก AooCommerce — Data Deletion.',
};

// ผู้ตรวจแอปของ TikTok และ Meta ขอ URL หน้านี้แยกจาก Privacy Policy
// ต้องบอกได้ว่า "ผู้ใช้กดตรงไหน แล้วอะไรถูกลบ ภายในกี่วัน" อย่างเป็นรูปธรรม

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="การลบข้อมูล"
      subtitle="Data Deletion"
      updated="30 สิงหาคม 2569"
    >
      <LegalSection title="1. เพิกถอนการเชื่อมต่อแพลตฟอร์ม" titleEn="Disconnect a platform">
        <p>ทำเองได้ทันที ไม่ต้องติดต่อเรา — เลือกทางไหนก็ได้</p>
        <ul>
          <li>
            <strong>ในระบบเรา</strong> — ตั้งค่า &gt; ช่องทางขาย &gt; เชื่อมต่อ Marketplace
            แล้วกด &quot;ยกเลิกการเชื่อมต่อ&quot; ที่การ์ดร้านนั้น
          </li>
          <li>
            <strong>ที่ TikTok</strong> — เปิดแอป TikTok &gt; Settings and privacy &gt;
            Security and permissions &gt; Manage app permissions แล้วถอนสิทธิ์ AooCommerce
          </li>
          <li>
            <strong>ที่ TikTok Shop</strong> — Seller Center &gt; Authorized Apps แล้วถอนสิทธิ์
          </li>
        </ul>
        <p>
          เมื่อเพิกถอน เราจะหยุดเรียก API ของแพลตฟอร์มนั้นทันที และลบ token ที่เก็บไว้ออกจากระบบ
        </p>
        <p lang="en" className="text-gray-500">
          Disconnecting removes the stored access tokens for that platform immediately and stops all
          further API calls. You can do it from our settings page or from the platform&apos;s own app
          permissions screen.
        </p>
      </LegalSection>

      <LegalSection title="2. ขอลบบัญชีและข้อมูลทั้งหมด" titleEn="Delete your account and data">
        <p>
          ส่งอีเมลจากอีเมลที่ใช้สมัครมาที่{' '}
          <a href="mailto:support@aoocommerce.com" className="text-primary underline">
            support@aoocommerce.com
          </a>{' '}
          หัวข้อ &quot;ขอลบข้อมูล&quot; พร้อมระบุชื่อบริษัทในระบบ
        </p>
        <p>
          เราจะยืนยันตัวตนแล้วดำเนินการ <strong>ภายใน 30 วัน</strong> และแจ้งกลับเมื่อลบเสร็จ
        </p>

        <div className="rounded-lg border border-gray-200 overflow-hidden mt-3">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr className="helper-text text-gray-600">
                <th className="px-4 py-2 font-medium">สิ่งที่ถูกลบ</th>
                <th className="px-4 py-2 font-medium">สิ่งที่เก็บต่อ และเพราะอะไร</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 subtitle-text text-gray-700">
              <tr>
                <td className="px-4 py-2.5">
                  ข้อมูลบัญชีและผู้ใช้ · ข้อมูลธุรกิจทั้งหมด (คำสั่งซื้อ สินค้า สต็อก ลูกค้า เอกสาร) ·
                  token และข้อมูลโปรไฟล์จากทุกแพลตฟอร์มที่เชื่อมต่อ · ประวัติแชท
                </td>
                <td className="px-4 py-2.5">
                  เอกสารทางบัญชีและภาษีที่กฎหมายไทยกำหนดให้เก็บ (โดยทั่วไป 5 ปี) ·
                  บันทึกที่จำเป็นต่อการตรวจสอบการทุจริตหรือข้อพิพาทที่ยังไม่ยุติ
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="3. ลบเฉพาะข้อมูลจาก TikTok" titleEn="Delete only TikTok data">
        <p>
          ถ้าต้องการลบเฉพาะรูปโปรไฟล์และชื่อที่ดึงมาจากบัญชี TikTok โดยไม่ลบบัญชีทั้งหมด
          กดที่รูปโลโก้ร้านในหน้าตั้งค่าช่องทางขาย แล้วล้างค่าออก — ข้อมูลนั้นถูกลบทันที
          ไม่ต้องรอ 30 วัน
        </p>
        <p lang="en" className="text-gray-500">
          To remove only the TikTok profile picture and display name without deleting your account,
          clear the shop logo field in Settings &gt; Sales Channels. It is deleted immediately.
          We do not retain the TikTok access token at any point.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
