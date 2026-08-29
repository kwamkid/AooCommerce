import type { Metadata } from 'next';
import LegalPage, { LegalSection } from '../privacy/legal-shell';

export const metadata: Metadata = {
  title: 'ข้อตกลงการใช้บริการ | AooCommerce',
  description: 'ข้อตกลงและเงื่อนไขการใช้บริการ AooCommerce — Terms of Service.',
};

// หน้านี้ต้องเปิดได้โดยไม่ต้อง login (อยู่ใน PUBLIC_PREFIXES ของ proxy.ts)
// เพราะผู้ตรวจแอปของ TikTok / Meta / Google เปิดดูก่อนอนุมัติ scope

export default function TermsPage() {
  return (
    <LegalPage
      title="ข้อตกลงการใช้บริการ"
      subtitle="Terms of Service"
      updated="30 สิงหาคม 2569"
    >
      <LegalSection title="1. บริการนี้คืออะไร" titleEn="What this service is">
        <p>
          AooCommerce เป็นระบบจัดการการขายออนไลน์สำหรับร้านค้า ช่วยรวมคำสั่งซื้อ สินค้า สต็อก
          และเอกสารจากหลายช่องทางไว้ที่เดียว รองรับการเชื่อมต่อกับ TikTok Shop, Shopee, Lazada
          และช่องทางแชท
        </p>
        <p lang="en">
          AooCommerce is an order and inventory management service for merchants. It consolidates
          orders, products, stock and documents from multiple sales channels — including TikTok Shop,
          Shopee and Lazada — into a single dashboard.
        </p>
      </LegalSection>

      <LegalSection title="2. บัญชีและการใช้งาน" titleEn="Accounts">
        <ul>
          <li>คุณต้องให้ข้อมูลที่ถูกต้องในการสมัคร และรับผิดชอบการรักษาความปลอดภัยของบัญชี</li>
          <li>คุณรับผิดชอบการกระทำทั้งหมดที่เกิดขึ้นภายใต้บัญชีของคุณ รวมถึงผู้ใช้ที่คุณเชิญเข้ามา</li>
          <li>ห้ามใช้บริการเพื่อการที่ผิดกฎหมาย หรือละเมิดข้อตกลงของแพลตฟอร์มที่คุณเชื่อมต่อ</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. การเชื่อมต่อกับแพลตฟอร์มภายนอก" titleEn="Third-party connections">
        <p>
          เมื่อคุณเชื่อมต่อร้านค้าหรือบัญชีจากแพลตฟอร์มภายนอก คุณอนุญาตให้เราเข้าถึงข้อมูลเท่าที่จำเป็น
          ตามสิทธิ์ (scope) ที่คุณอนุมัติ เพื่อทำงานที่คุณสั่งเท่านั้น เช่น ดึงคำสั่งซื้อ ปรับสต็อก
          หรือแสดงชื่อและรูปโปรไฟล์ของร้าน
        </p>
        <p>
          คุณเพิกถอนสิทธิ์เมื่อไหร่ก็ได้ ทั้งจากหน้าตั้งค่าในระบบเรา และจากหน้าจัดการสิทธิ์ของแพลตฟอร์มนั้นเอง
        </p>
        <p>
          การใช้งานแพลตฟอร์มภายนอกอยู่ภายใต้ข้อตกลงของแพลตฟอร์มนั้น ๆ ด้วย
          เราไม่รับผิดชอบต่อการเปลี่ยนแปลงนโยบาย ข้อจำกัด หรือการหยุดให้บริการของแพลตฟอร์มภายนอก
        </p>
      </LegalSection>

      <LegalSection title="4. ข้อมูลของคุณ" titleEn="Your data">
        <p>
          ข้อมูลธุรกิจที่คุณนำเข้าหรือสร้างในระบบยังเป็นของคุณ เราประมวลผลเพื่อให้บริการตามที่คุณสั่ง
          รายละเอียดการเก็บและใช้ข้อมูลอยู่ใน{' '}
          <a href="/legal/privacy" className="text-primary underline">นโยบายความเป็นส่วนตัว</a>
        </p>
      </LegalSection>

      <LegalSection title="5. ค่าบริการ" titleEn="Fees">
        <p>
          แพ็กเกจและอัตราค่าบริการเป็นไปตามที่แจ้งในระบบ ณ เวลาที่สมัคร
          การเปลี่ยนแปลงอัตราจะแจ้งล่วงหน้าตามสมควรก่อนมีผล
        </p>
      </LegalSection>

      <LegalSection title="6. การหยุดให้บริการ" titleEn="Suspension and termination">
        <p>
          คุณยกเลิกการใช้บริการได้ทุกเมื่อ · เราอาจระงับบัญชีที่ใช้งานผิดข้อตกลง
          ละเมิดกฎหมาย หรือก่อความเสียหายต่อระบบ โดยจะแจ้งเหตุผลเท่าที่ทำได้
        </p>
      </LegalSection>

      <LegalSection title="7. ข้อจำกัดความรับผิด" titleEn="Limitation of liability">
        <p>
          เราให้บริการตามสภาพที่เป็นอยู่ และพยายามอย่างเต็มที่ให้ระบบทำงานถูกต้องและต่อเนื่อง
          แต่ไม่รับประกันว่าจะไม่มีข้อผิดพลาดหรือหยุดชะงักเลย
          โดยเฉพาะส่วนที่ขึ้นกับแพลตฟอร์มภายนอกซึ่งอยู่นอกการควบคุมของเรา
        </p>
        <p>
          ความรับผิดของเราต่อความเสียหายใด ๆ จำกัดไม่เกินค่าบริการที่คุณชำระในรอบ 3 เดือนล่าสุด
        </p>
      </LegalSection>

      <LegalSection title="8. การแก้ไขข้อตกลง" titleEn="Changes">
        <p>
          เราอาจปรับปรุงข้อตกลงนี้เป็นครั้งคราว การเปลี่ยนแปลงที่มีนัยสำคัญจะแจ้งให้ทราบล่วงหน้า
          การใช้บริการต่อหลังจากนั้นถือว่ายอมรับข้อตกลงฉบับใหม่
        </p>
      </LegalSection>
    </LegalPage>
  );
}
