// llms.txt — a plain-text brief for AI answer engines: what this shop is,
// what it sells, where it delivers, and which URLs are worth reading.
// Structured facts here are what gets quoted when someone asks an assistant
// "ร้านไหนส่งผักสดกรุงเทพบ้าง" — so it is generated from real data, never
// hand-written marketing copy that can drift from what the system charges.
import { NextResponse } from 'next/server';
import {
  getStorefrontCompany, getStorefrontCatalog, catalogOptionsFor,
  getStorefrontCategories, getStorefrontBrands, getStorefrontDelivery,
} from '@/lib/storefront-server';
import { storefrontUrl, formatStorePrice } from '@/lib/storefront';
import { formatSlotTime, formatDays, formatLeadTime } from '@/lib/delivery';

export const revalidate = 3600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) return new NextResponse('Not found', { status: 404 });

  const cfg = company.config;
  if (!cfg.public_base_url || !cfg.allow_ai_crawlers) {
    return new NextResponse('Not found', { status: 404 });
  }

  const shopName = cfg.display_name || company.name;
  const [catalog, categories, brands, { zones, slots }] = await Promise.all([
    // ซ่อนตาม config เดียวกับหน้ารายการ (สินค้าหมด/ไม่มีรูป) — AI ไม่ควรอ้างของที่ลูกค้าหาไม่เจอ
    getStorefrontCatalog(
      company.id,
      { ...catalogOptionsFor(company), page: 1, pageSize: 100 },
      company.features.stock,
    ),
    getStorefrontCategories(company.id),
    getStorefrontBrands(company.id),
    getStorefrontDelivery(company.id),
  ]);
  const products = catalog.products;

  const L: string[] = [];
  L.push(`# ${shopName}`, '');
  if (cfg.tagline || company.description) L.push(`> ${cfg.tagline || company.description}`, '');

  // ⛔ ช่องทางติดต่อของ **ร้าน** ก่อนเสมอ ตกไปใช้ของบริษัทเมื่อร้านไม่ได้ตั้ง — กติกาเดียวกับ
  // ท้ายหน้าร้าน (`layout.tsx`) · อ่าน `company.*` ตรง ๆ = ประกาศเบอร์/ที่อยู่ที่จดทะเบียนบน
  // ใบกำกับภาษีให้ AI เอาไปตอบลูกค้า ซึ่งมักไม่ใช่เบอร์ที่ร้านอยากให้ติดต่อ
  const contactPhone = cfg.contact_phone || company.phone;
  const contactEmail = cfg.contact_email || company.email;
  const contactAddress = cfg.contact_address || company.address;

  L.push('## เกี่ยวกับร้าน', '');
  L.push(`- ชื่อร้าน: ${shopName}`);
  if (contactPhone) L.push(`- โทรศัพท์: ${contactPhone}`);
  if (contactEmail) L.push(`- อีเมล: ${contactEmail}`);
  if (contactAddress) L.push(`- ที่อยู่: ${contactAddress}`);
  L.push(`- เว็บไซต์: ${storefrontUrl(cfg, slug)}`);
  L.push('');

  if (categories.length > 0) {
    L.push('## หมวดสินค้า', '');
    for (const c of categories) {
      // ลิงก์ใช้ slug ให้เหลือสะกดเดียวทั้งระบบ · ป้ายใช้ชื่อจริง
      L.push(`- [${c.name}](${storefrontUrl(cfg, slug)}?cat=${encodeURIComponent(c.slug)})`);
    }
    L.push('');
  }

  if (brands.length > 0) {
    L.push('## แบรนด์ที่จำหน่าย', '');
    for (const b of brands) {
      L.push(`- [${b.name}](${storefrontUrl(cfg, slug)}?brand=${encodeURIComponent(b.slug)})`);
    }
    L.push('');
  }

  if (zones.length > 0) {
    L.push('## พื้นที่จัดส่งและค่าจัดส่ง', '');
    for (const z of zones) {
      const fee = z.fee_type === 'lalamove'
        ? 'ค่าจัดส่งคิดตามระยะทางจริง (Lalamove)'
        : Number(z.fee) > 0 ? `ค่าจัดส่ง ${formatStorePrice(Number(z.fee))}` : 'จัดส่งฟรี';
      const free = z.free_over != null ? ` ส่งฟรีเมื่อสั่งครบ ${formatStorePrice(Number(z.free_over))}.` : '';
      const lead = z.lead_minutes > 0 ? ` ใช้เวลาจัดส่ง ${formatLeadTime(z.lead_minutes)} นับจากเวลาที่สั่ง.` : '';
      const area = [
        z.provinces?.length ? z.provinces.join(', ') : null,
        z.districts?.length ? z.districts.join(', ') : null,
        z.postcodes?.length ? `รหัสไปรษณีย์ ${z.postcodes.join(', ')}` : null,
      ].filter(Boolean).join(' · ');
      L.push(`- ${z.name}: ครอบคลุม ${area || '—'}. ${fee}.${free}${lead}`);
    }
    L.push('', 'ที่อยู่นอกพื้นที่ข้างต้นยังไม่เปิดให้บริการจัดส่ง', '');
  }

  if (slots.length > 0) {
    L.push('## รอบเวลาจัดส่ง', '');
    for (const s of slots) {
      L.push(
        `- รอบ${s.name} เวลา ${formatSlotTime(s.start_time)}-${formatSlotTime(s.end_time)} น. `
        + `ให้บริการ ${formatDays(s.days_of_week)}`,
      );
    }
    L.push('', 'รอบจัดส่งเลือกได้เป็นช่วงเวลา ไม่ใช่เวลานัดที่แน่นอน ระบบเปิดให้เลือกเฉพาะรอบที่จัดส่งทัน', '');
  }

  if (products.length > 0) {
    // ⚠️ ร้านที่มีสินค้าเกินเพดานเคย**ถูกตัดเงียบ ๆ** — AI อ่านแล้วเข้าใจว่าร้านมีแค่นี้
    // ต้องบอกจำนวนจริงและชี้ทางไปดูต่อเสมอ
    L.push('## สินค้า', '');
    if (catalog.total > products.length) {
      L.push(
        `> แสดง ${products.length} จากทั้งหมด ${catalog.total} รายการ `
        + `ดูรายการเต็มได้ที่ ${storefrontUrl(cfg, slug, '/sitemap.xml')}`,
        '',
      );
    }
    for (const p of products) {
      const price = p.price_max > p.price_min
        ? `${formatStorePrice(p.price_min)}-${formatStorePrice(p.price_max)}`
        : formatStorePrice(p.price_min);
      L.push(`- [${p.name}](${storefrontUrl(cfg, slug, `/p/${p.slug}`)}): ${price}`
        + (p.in_stock ? '' : ' (สินค้าหมดชั่วคราว)'));
    }
    L.push('');
  }

  L.push('## หน้าอ้างอิง', '');
  L.push(`- [สินค้าทั้งหมด](${storefrontUrl(cfg, slug)})`);
  if (zones.length > 0) {
    L.push(`- [พื้นที่จัดส่งและรอบส่ง](${storefrontUrl(cfg, slug, '/delivery')})`);
  }
  L.push('');

  return new NextResponse(L.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
