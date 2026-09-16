// Path: components/storefront/ShopJsonLd.tsx
//
// "ร้านนี้คือใคร" ในภาษาที่ Google/LLM อ่านออก — วางครั้งเดียวที่ layout จึงติดทุกหน้าของร้าน
//
// ก่อนหน้านี้ทั้งหน้าร้าน**ไม่มี entity ของร้านเลย** มีแต่ Product/ItemList/FAQ ⇒ ไม่มีอะไรให้
// Google ผูกว่าชื่อร้าน เบอร์ ที่อยู่ โลโก้ พื้นที่ให้บริการ เป็นของใคร และไม่มีสิทธิ์ได้
// sitelinks searchbox ทั้งที่ช่องค้นหาทำงานอยู่แล้ว
//
// ⚠️ ใส่เฉพาะร้านที่มีโดเมนของตัวเอง — ร้านที่ยังอยู่บนโดเมน aoo เป็น `noindex` ทั้งหมด
// ประกาศ entity ที่ชี้ไป URL ที่สั่งไม่ให้ index คือสัญญาณที่ขัดกันเอง
//
// ⛔ ช่องทางติดต่อต้องเป็นของ **ร้าน** ก่อน (`cfg.contact_*`) ตกไปใช้ของบริษัทเมื่อไม่ได้ตั้ง —
// กติกาเดียวกับท้ายหน้าร้านและ llms.txt (เคยหลุดไปอ่าน `company.*` ตรง ๆ แล้วประกาศ
// ที่อยู่จดทะเบียนบนใบกำกับภาษีให้ลูกค้า)

import { jsonLdScript, storefrontAbsoluteUrl, type StorefrontConfig } from '@/lib/storefront';

interface Props {
  cfg: StorefrontConfig;
  slug: string;
  shopName: string;
  logoUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
  /** รับแค่ `provinces` พอ — ไม่ผูกกับ `DeliveryZone` เต็ม ๆ เพราะหน้าร้าน select มาไม่ครบทุกคอลัมน์ */
  zones: { provinces?: string[] | null }[];
  /** วิธีชำระเงินที่ลูกค้าออนไลน์ใช้ได้ — ชื่อวิธีเท่านั้น ไม่มีเลขบัญชี/คีย์ */
  payments: string[];
}

export default function ShopJsonLd({
  cfg, slug, shopName, logoUrl, contactPhone, contactEmail, contactAddress, zones, payments,
}: Props) {
  if (!cfg.public_base_url) return null;

  const url = storefrontAbsoluteUrl(cfg, slug);
  // พื้นที่ที่ร้านส่งถึงจริง — มาจากโซนจัดส่งที่ร้านตั้งไว้ ไม่ได้เดา
  const areaServed = Array.from(new Set(
    zones.flatMap(z => z.provinces || []).map(p => p.trim()).filter(Boolean),
  ));

  const store = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': `${url}#store`,
    name: shopName,
    url,
    ...(cfg.tagline ? { description: cfg.tagline } : {}),
    ...(logoUrl ? { logo: logoUrl, image: logoUrl } : {}),
    ...(contactPhone ? { telephone: contactPhone } : {}),
    ...(contactEmail ? { email: contactEmail } : {}),
    ...(contactAddress
      ? { address: { '@type': 'PostalAddress', streetAddress: contactAddress, addressCountry: 'TH' } }
      : {}),
    ...(areaServed.length ? { areaServed: areaServed.map(name => ({ '@type': 'Place', name })) } : {}),
    currenciesAccepted: 'THB',
    ...(payments.length ? { paymentAccepted: payments.join(', ') } : {}),
  };

  // ช่องค้นหาของหน้าร้านใช้ `?q=` อยู่แล้ว — ประกาศไว้ถึงจะมีสิทธิ์ได้ sitelinks searchbox
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${url}#website`,
    name: shopName,
    url,
    inLanguage: 'th-TH',
    publisher: { '@id': `${url}#store` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${url}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(store) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(website) }} />
    </>
  );
}
