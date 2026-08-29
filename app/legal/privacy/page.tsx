import type { Metadata } from 'next';
import LegalPage, { LegalSection } from './legal-shell';

export const metadata: Metadata = {
  title: 'นโยบายความเป็นส่วนตัว | AooCommerce',
  description: 'นโยบายความเป็นส่วนตัวของ AooCommerce — Privacy Policy.',
};

// หน้านี้ต้องเปิดได้โดยไม่ต้อง login (อยู่ใน PUBLIC_PREFIXES ของ proxy.ts)
//
// ⚠️ หัวข้อ "ข้อมูลจากแพลตฟอร์มที่คุณเชื่อมต่อ" คือส่วนที่ผู้ตรวจของ TikTok อ่านจริง
//    ต้องระบุให้ตรงกับ scope ที่ขอเป๊ะ — ขอ user.info.basic ก็ต้องเขียนว่าเก็บ
//    display_name กับ avatar_url เอาไปทำอะไร เก็บนานแค่ไหน เพิกถอนยังไง
//    เพิ่ม/ลด scope เมื่อไหร่ ต้องกลับมาแก้หน้านี้ให้ตรงเสมอ

export default function PrivacyPage() {
  return (
    <LegalPage
      title="นโยบายความเป็นส่วนตัว"
      subtitle="Privacy Policy"
      updated="30 สิงหาคม 2569"
    >
      <LegalSection title="1. ข้อมูลที่เราเก็บ" titleEn="What we collect">
        <ul>
          <li><strong>ข้อมูลบัญชี</strong> — ชื่อ อีเมล และข้อมูลบริษัทที่คุณกรอกตอนสมัคร</li>
          <li><strong>ข้อมูลธุรกิจ</strong> — คำสั่งซื้อ สินค้า สต็อก ลูกค้า และเอกสารที่คุณสร้างหรือนำเข้า</li>
          <li><strong>ข้อมูลจากแพลตฟอร์มที่คุณเชื่อมต่อ</strong> — ตามหัวข้อ 2</li>
          <li><strong>ข้อมูลการใช้งาน</strong> — บันทึกการเรียก API และข้อผิดพลาด เพื่อแก้ปัญหาและความปลอดภัย</li>
        </ul>
      </LegalSection>

      <LegalSection
        title="2. ข้อมูลจากแพลตฟอร์มที่คุณเชื่อมต่อ"
        titleEn="Data from connected platforms"
      >
        <p>
          เราเข้าถึงเฉพาะข้อมูลตามสิทธิ์ (scope) ที่คุณอนุมัติ และใช้เพื่อทำงานที่คุณสั่งเท่านั้น
        </p>

        <div className="rounded-lg border border-gray-200 overflow-hidden mt-3">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr className="helper-text text-gray-600">
                <th className="px-4 py-2 font-medium">แหล่งข้อมูล</th>
                <th className="px-4 py-2 font-medium">เก็บอะไร</th>
                <th className="px-4 py-2 font-medium">ใช้ทำอะไร</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 subtitle-text text-gray-700">
              <tr>
                <td className="px-4 py-2.5">TikTok Shop, Shopee, Lazada<br /><span className="text-gray-400">(ร้านค้า)</span></td>
                <td className="px-4 py-2.5">คำสั่งซื้อ สินค้า สต็อก ยอดโอนเงิน ชื่อร้าน</td>
                <td className="px-4 py-2.5">รวมคำสั่งซื้อและสต็อกจากทุกช่องทาง ออกเอกสาร และสรุปยอด</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">
                  TikTok Login Kit<br />
                  <span className="text-gray-400" lang="en">scope: user.info.basic</span>
                </td>
                <td className="px-4 py-2.5">
                  ชื่อที่แสดงและรูปโปรไฟล์ของบัญชี TikTok<br />
                  <span className="text-gray-400" lang="en">display_name, avatar_url</span>
                </td>
                <td className="px-4 py-2.5">
                  แสดงรูปและชื่อร้านคู่กับร้านที่เชื่อมต่อ เพื่อให้แยกร้านออกจากกันได้เมื่อมีหลายร้าน
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">LINE, Facebook และแชทของ marketplace</td>
                <td className="px-4 py-2.5">ข้อความ ชื่อ และรูปโปรไฟล์ของผู้ติดต่อ</td>
                <td className="px-4 py-2.5">แสดงบทสนทนาในหน้ารวมแชท และตอบกลับลูกค้า</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-3">
          <strong>เฉพาะ TikTok Login Kit</strong> — เราเรียก <code>/v2/user/info/</code> ครั้งเดียวตอนที่คุณกดเชื่อมต่อ
          เก็บเฉพาะชื่อที่แสดงและลิงก์รูปโปรไฟล์ แล้ว <strong>ทิ้ง access token ทันที ไม่เก็บไว้</strong>{' '}
          เราไม่โพสต์เนื้อหา ไม่อ่านวิดีโอ และไม่เข้าถึงข้อมูลอื่นของบัญชีคุณ
        </p>
        <p lang="en" className="text-gray-500">
          For TikTok Login Kit we call <code>/v2/user/info/</code> once when you connect, store only
          <code> display_name</code> and <code>avatar_url</code>, and discard the access token
          immediately. We never post content, read videos, or access any other account data.
        </p>
      </LegalSection>

      <LegalSection title="3. เราไม่ทำอะไรกับข้อมูลของคุณ" titleEn="What we never do">
        <ul>
          <li><strong>ไม่ขายข้อมูล</strong>ของคุณหรือของลูกค้าคุณให้ใคร</li>
          <li>ไม่ใช้ข้อมูลธุรกิจของคุณเพื่อโฆษณา หรือส่งต่อให้ผู้โฆษณา</li>
          <li>ไม่นำข้อมูลของบริษัทหนึ่งไปให้อีกบริษัทเห็น — ข้อมูลถูกแยกตามบริษัทในระดับฐานข้อมูล</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. การเปิดเผยข้อมูล" titleEn="Sharing">
        <p>เราเปิดเผยข้อมูลเฉพาะกรณีเหล่านี้</p>
        <ul>
          <li>ผู้ให้บริการโครงสร้างพื้นฐานที่จำเป็นต่อการทำงาน (โฮสติ้ง ฐานข้อมูล อีเมล) ภายใต้สัญญารักษาความลับ</li>
          <li>แพลตฟอร์มที่คุณเชื่อมต่อ เท่าที่จำเป็นต่อคำสั่งของคุณ เช่น ส่งเลขพัสดุกลับไปที่ marketplace</li>
          <li>เมื่อกฎหมายบังคับ หรือเพื่อป้องกันความเสียหายร้ายแรง</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. การเก็บรักษาและความปลอดภัย" titleEn="Retention and security">
        <ul>
          <li>ข้อมูลถูกเก็บตราบเท่าที่บัญชีของคุณยังใช้งานอยู่</li>
          <li>Token ของแพลตฟอร์มถูกเก็บแบบเข้ารหัสระหว่างส่ง และเข้าถึงได้เฉพาะระบบเบื้องหลัง</li>
          <li>การเข้าถึงข้อมูลถูกจำกัดตามบริษัทและตามสิทธิ์ของผู้ใช้ที่ระดับฐานข้อมูล</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. สิทธิ์ของคุณ" titleEn="Your rights">
        <ul>
          <li><strong>เพิกถอนการเชื่อมต่อ</strong> — ยกเลิกได้ทุกเมื่อจากหน้าตั้งค่าช่องทางขาย หรือจากหน้าจัดการสิทธิ์ของแพลตฟอร์มนั้นเอง</li>
          <li><strong>ลบข้อมูล</strong> — ขอให้ลบบัญชีและข้อมูลทั้งหมดได้ เราจะดำเนินการภายใน 30 วัน เว้นแต่กฎหมายกำหนดให้เก็บ</li>
          <li><strong>ขอสำเนาข้อมูล</strong> — ขอไฟล์ข้อมูลธุรกิจของคุณได้</li>
          <li><strong>แก้ไขข้อมูล</strong> — แก้ไขข้อมูลบัญชีและข้อมูลธุรกิจได้เองในระบบ</li>
        </ul>
        <p>
          การเพิกถอนสิทธิ์ TikTok ทำได้ที่ TikTok &gt; Settings and privacy &gt; Security and permissions
          &gt; Manage app permissions หรือกดยกเลิกการเชื่อมต่อในระบบเรา
        </p>
      </LegalSection>

      <LegalSection title="7. การเปลี่ยนแปลงนโยบาย" titleEn="Changes">
        <p>
          หากมีการเปลี่ยนแปลงที่มีนัยสำคัญ โดยเฉพาะการเก็บข้อมูลประเภทใหม่หรือขอสิทธิ์เพิ่ม
          เราจะแจ้งให้ทราบล่วงหน้าและปรับปรุงวันที่ด้านบนของหน้านี้
        </p>
      </LegalSection>
    </LegalPage>
  );
}
