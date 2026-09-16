// Path: app/store/[slug]/delivery/page.tsx
// หน้า "ข้อมูลการจัดส่ง" — generate อัตโนมัติจาก delivery_zones / delivery_slots
// ร้านไม่ต้องเขียนเอง และไม่มีทางหลุด sync กับค่าที่ระบบใช้คิดเงินจริง
//
// นี่คือหน้าที่ AEO จะอ้างถึงมากที่สุด (เช่นคำถาม "ร้านผักสดส่งกรุงเทพวันไหนได้บ้าง")
// → ทุกอย่างเป็นประโยคเต็มใน server HTML + FAQPage schema
import type { Metadata } from 'next';
import { getStorefrontCompany, getStorefrontDelivery, getStorefrontPayments } from '@/lib/storefront-server';
import { storefrontUrl, jsonLdScript, formatStorePrice } from '@/lib/storefront';
import { formatSlotTime, formatDays } from '@/lib/delivery';

export const revalidate = 600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) return { title: 'ไม่พบร้านนี้', robots: { index: false, follow: false } };

  const cfg = company.config;
  const shopName = cfg.display_name || company.name;
  return {
    title: `พื้นที่จัดส่งและรอบส่ง | ${shopName}`,
    description: `พื้นที่ที่ ${shopName} จัดส่งถึง ค่าจัดส่งแต่ละพื้นที่ ระยะเวลาจัดส่ง และรอบเวลาจัดส่งในแต่ละวัน`,
    robots: cfg.public_base_url ? undefined : { index: false, follow: true },
    alternates: cfg.public_base_url
      ? { canonical: storefrontUrl(cfg, slug, '/delivery') }
      : undefined,
  };
}

function minutesLabel(m: number): string {
  if (m <= 0) return 'ไม่ต้องสั่งล่วงหน้า';
  if (m % 1440 === 0) return `${m / 1440} วัน`;
  if (m % 60 === 0) return `${m / 60} ชั่วโมง`;
  return `${m} นาที`;
}

export default async function StorefrontDeliveryPage({ params }: PageProps) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) return null;   // layout แสดงหน้า 'ไม่พบร้านนี้' ให้แล้ว

  const { zones, slots } = await getStorefrontDelivery(company.id);
  const payments = await getStorefrontPayments(company.id);
  const shopName = company.config.display_name || company.name;

  const areaSummary = (z: typeof zones[number]) => {
    const parts: string[] = [];
    if (z.provinces?.length) parts.push(z.provinces.join(', '));
    if (z.districts?.length) parts.push(z.districts.join(', '));
    if (z.postcodes?.length) parts.push(`รหัสไปรษณีย์ ${z.postcodes.join(', ')}`);
    return parts.join(' · ') || '—';
  };

  const feeSummary = (z: typeof zones[number]) =>
    z.fee_type === 'lalamove'
      ? 'คิดตามระยะทางจริง (Lalamove)'
      : Number(z.fee) > 0 ? formatStorePrice(Number(z.fee)) : 'ส่งฟรี';

  // FAQPage — รูปแบบที่ AI answer engine ยกไปตอบตรง ๆ ได้มากที่สุด
  const faq: { q: string; a: string }[] = [];
  if (zones.length > 0) {
    faq.push({
      q: `${shopName} จัดส่งพื้นที่ไหนบ้าง`,
      a: `จัดส่งใน ${zones.length} พื้นที่ ได้แก่ ${zones.map(z => `${z.name} (${areaSummary(z)})`).join('; ')}. `
        + 'พื้นที่นอกเหนือจากนี้ยังไม่เปิดให้บริการจัดส่ง',
    });
    const withLead = zones.filter(z => z.lead_minutes > 0);
    if (withLead.length > 0) {
      faq.push({
        q: 'ใช้เวลาจัดส่งนานแค่ไหน',
        a: withLead.map(z => `${z.name} ใช้เวลา ${minutesLabel(z.lead_minutes)} นับจากเวลาที่สั่ง`).join('; ')
          + '. ระบบจะแสดงเฉพาะรอบจัดส่งที่ส่งทันเท่านั้น',
      });
    }
    faq.push({
      q: 'ค่าจัดส่งเท่าไร',
      a: zones.map(z => `${z.name} ${feeSummary(z)}`
        + (z.free_over != null ? ` และส่งฟรีเมื่อสั่งครบ ${formatStorePrice(Number(z.free_over))}` : ''),
      ).join('; '),
    });
  }
  if (payments.length > 0) {
    faq.push({
      q: `${shopName} รับชำระเงินด้วยวิธีไหนบ้าง`,
      a: `รับชำระเงิน ${payments.length} วิธี ได้แก่ ${payments.join(', ')}. `
        + 'ระบบจะแสดงรายละเอียดการชำระเงินหลังยืนยันคำสั่งซื้อ',
    });
  }
  if (slots.length > 0) {
    faq.push({
      q: 'มีรอบจัดส่งช่วงเวลาไหนบ้าง',
      a: slots.map(s =>
        `รอบ${s.name} ${formatSlotTime(s.start_time)}-${formatSlotTime(s.end_time)} น. (${formatDays(s.days_of_week)})`,
      ).join('; ')
        + '. เลือกได้เป็นช่วงเวลา ไม่ใช่เวลานัดที่แน่นอน '
        + 'ระบบจะแสดงเฉพาะรอบที่จัดส่งทันตามระยะเวลาจัดส่งของพื้นที่ปลายทาง',
    });
  }

  // ── ย่อหน้าตอบคำถาม + ขั้นตอนสั่งซื้อ (featured snippet) ───────────────────────
  // ⚠️ ย่อหน้าใต้ h1 เดิมเป็น**คำบรรยายหน้า** ("ข้อมูลพื้นที่ที่ X จัดส่งถึง ค่าจัดส่ง…")
  // ไม่ใช่คำตอบ — Google ยกไปทำ paragraph snippet ไม่ได้ เพราะไม่มีข้อเท็จจริงสักตัว
  // ⇒ เขียนเป็นประโยคตอบที่มีชื่อโซน ค่าส่ง และรอบจริงอยู่ในนั้น
  const zoneNames = zones.map(z => z.name);
  const freeZone = zones.find(z => z.free_over != null);
  const answerParts: string[] = [];
  if (zoneNames.length > 0) {
    answerParts.push(
      `${shopName} จัดส่งใน ${zoneNames.length} พื้นที่ ได้แก่ ${zoneNames.join(', ')}`
      + (freeZone ? ` โดยส่งฟรีเมื่อสั่งครบ ${formatStorePrice(Number(freeZone.free_over))}` : ''),
    );
  }
  if (slots.length > 0) {
    answerParts.push(
      `รอบจัดส่งต่อวันมี ${slots.length} รอบ คือ `
      + slots.map(s => `${formatSlotTime(s.start_time)}-${formatSlotTime(s.end_time)} น.`).join(' และ ')
      + ' เลือกได้เป็นช่วงเวลา ไม่ใช่เวลานัดที่แน่นอน',
    );
  }
  const answerParagraph = answerParts.length > 0
    ? answerParts.join(' ') + '.'
    : `ข้อมูลพื้นที่ที่ ${shopName} จัดส่งถึง ค่าจัดส่งแต่ละพื้นที่ และรอบเวลาจัดส่งในแต่ละวัน`;

  // ขั้นตอนสั่งซื้อ — ordered-list snippet เป็นชนิดที่ได้ง่ายที่สุดและหน้าร้านยังไม่มี `<ol>` สักอัน
  const orderSteps = [
    'เลือกสินค้าที่ต้องการแล้วกดใส่ตะกร้า',
    'เปิดตะกร้าเพื่อตรวจรายการและจำนวน',
    'กรอกชื่อ เบอร์โทร และที่อยู่จัดส่ง',
    ...(zones.length > 0 ? ['ระบบจะจับคู่พื้นที่จัดส่งและคำนวณค่าจัดส่งให้อัตโนมัติ'] : []),
    ...(slots.length > 0 ? ['เลือกวันและรอบเวลาที่ต้องการให้จัดส่ง'] : []),
    payments.length > 0
      ? `ยืนยันคำสั่งซื้อแล้วชำระเงินด้วย${payments.join(' หรือ ')} และติดตามสถานะได้จากลิงก์ที่ได้รับ`
      : 'ยืนยันคำสั่งซื้อและชำระเงิน แล้วติดตามสถานะได้จากลิงก์ที่ได้รับ',
  ];
  const howToLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `วิธีสั่งซื้อและรับสินค้าจาก ${shopName}`,
    step: orderSteps.map((text, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      text,
    })),
  };

  const faqLd = faq.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  } : null;

  return (
    <div className="sf-container">
      {faqLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqLd) }} />
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(howToLd) }} />

      <div className="sf-hero">
        <h1>พื้นที่จัดส่งและรอบส่ง</h1>
        {/* ประโยคตอบที่มีชื่อโซน/ค่าส่ง/รอบจริงอยู่ในนั้น — ตัวที่ Google ยกไปทำ paragraph snippet */}
        <p>{answerParagraph}</p>
      </div>

      {/* ขั้นตอนสั่งซื้อเป็น <ol> จริง — ordered-list snippet ได้ง่ายที่สุดและหน้าร้านยังไม่เคยมี */}
      <section className="sf-section">
        <h2>สั่งซื้อและรับของอย่างไร</h2>
        <ol className="sf-steps">
          {orderSteps.map(step => <li key={step}>{step}</li>)}
        </ol>
      </section>

      {/* วิธีชำระเงิน — ประกอบจากช่องทางที่ร้านเปิดใช้จริง ไม่ให้ร้านมานั่งเขียนเอง
          เดิมข้อมูลนี้อยู่**หลัง checkout เท่านั้น** ⇒ ทั้ง Google และ AI ไม่มีทางรู้ */}
      {payments.length > 0 && (
        <section className="sf-section">
          <h2>วิธีชำระเงิน</h2>
          <p className="sf-facts">
            {shopName} รับชำระเงิน {payments.length} วิธี ได้แก่ {payments.join(', ')}
          </p>
          <ul className="sf-steps">
            {payments.map(m => <li key={m}>{m}</li>)}
          </ul>
        </section>
      )}

      {zones.length === 0 && slots.length === 0 && payments.length === 0 && (
        <p className="sf-empty">ยังไม่ได้ประกาศข้อมูลการจัดส่ง</p>
      )}

      {zones.length > 0 && (
        <section className="sf-section">
          <h2>พื้นที่จัดส่งและค่าจัดส่ง</h2>
          <div className="sf-scroll-x">
            <table className="sf-table">
              <thead>
                <tr>
                  <th>พื้นที่</th>
                  <th>ครอบคลุม</th>
                  <th>ค่าจัดส่ง</th>
                  <th>ส่งฟรีเมื่อครบ</th>
                  <th>ระยะเวลาจัดส่ง</th>
                </tr>
              </thead>
              <tbody>
                {zones.map(z => (
                  <tr key={z.id}>
                    <td>{z.name}</td>
                    <td>{areaSummary(z)}</td>
                    <td>{feeSummary(z)}</td>
                    <td>{z.free_over != null ? formatStorePrice(Number(z.free_over)) : '—'}</td>
                    <td>{minutesLabel(z.lead_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sf-footer-text" style={{ marginTop: 10 }}>
            ที่อยู่ที่อยู่นอกพื้นที่ข้างต้นยังไม่เปิดให้บริการจัดส่ง
          </p>
        </section>
      )}

      {slots.length > 0 && (
        <section className="sf-section">
          <h2>รอบเวลาจัดส่ง</h2>
          <div className="sf-scroll-x">
            <table className="sf-table">
              <thead>
                <tr>
                  <th>รอบ</th>
                  <th>ช่วงเวลา</th>
                  <th>วันที่ให้บริการ</th>
                </tr>
              </thead>
              <tbody>
                {slots.map(s => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{formatSlotTime(s.start_time)}-{formatSlotTime(s.end_time)} น.</td>
                    <td>{formatDays(s.days_of_week)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sf-footer-text" style={{ marginTop: 10 }}>
            รอบจัดส่งเป็นช่วงเวลา ไม่ใช่เวลานัดที่แน่นอน เพื่อให้จัดส่งได้ตรงตามที่แจ้งไว้จริง
            — ตอนสั่งซื้อระบบจะแสดงเฉพาะรอบที่จัดส่งทันตามพื้นที่ของคุณ
          </p>
        </section>
      )}

      {faq.length > 0 && (
        <section className="sf-section">
          <h2>คำถามที่พบบ่อย</h2>
          {/* ⚠️ คำถามต้องเป็น <h3> จริง ไม่ใช่ <p> ตัวหนา — Google ต้องรู้ว่าอันไหนคือหัวข้อคำถาม
              ถึงจะยกไปทำ featured snippet ได้ และนี่คือหน้าที่ AEO อ้างมากที่สุดของร้าน */}
          <div className="sf-facts sf-faq">
            {faq.map(f => (
              <div key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
