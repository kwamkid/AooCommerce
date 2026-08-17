// llms.txt — a plain-text brief for AI answer engines: what this shop is,
// what it sells, where it delivers, and which URLs are worth reading.
// Structured facts here are what gets quoted when someone asks an assistant
// "ร้านไหนส่งผักสดกรุงเทพบ้าง" — so it is generated from real data, never
// hand-written marketing copy that can drift from what the system charges.
import { NextResponse } from 'next/server';
import {
  getStorefrontCompany, getStorefrontCatalog,
  getStorefrontCategories, getStorefrontDelivery,
} from '@/lib/storefront-server';
import { storefrontUrl, formatStorePrice } from '@/lib/storefront';
import { formatSlotTime, formatDays } from '@/lib/delivery';

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
  const [products, categories, { zones, slots }] = await Promise.all([
    getStorefrontCatalog(company.id, { limit: 100 }),
    getStorefrontCategories(company.id),
    getStorefrontDelivery(company.id),
  ]);

  const L: string[] = [];
  L.push(`# ${shopName}`, '');
  if (cfg.tagline || company.description) L.push(`> ${cfg.tagline || company.description}`, '');

  L.push('## เกี่ยวกับร้าน', '');
  L.push(`- ชื่อร้าน: ${shopName}`);
  if (company.phone) L.push(`- โทรศัพท์: ${company.phone}`);
  if (company.email) L.push(`- อีเมล: ${company.email}`);
  if (company.address) L.push(`- ที่อยู่: ${company.address}`);
  L.push(`- เว็บไซต์: ${storefrontUrl(cfg, slug)}`);
  L.push('');

  if (categories.length > 0) {
    L.push('## หมวดสินค้า', '');
    for (const c of categories) {
      L.push(`- [${c}](${storefrontUrl(cfg, slug)}?cat=${encodeURIComponent(c)})`);
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
      const area = [
        z.provinces?.length ? z.provinces.join(', ') : null,
        z.districts?.length ? z.districts.join(', ') : null,
        z.postcodes?.length ? `รหัสไปรษณีย์ ${z.postcodes.join(', ')}` : null,
      ].filter(Boolean).join(' · ');
      L.push(`- ${z.name}: ครอบคลุม ${area || '—'}. ${fee}.${free}`);
    }
    L.push('', 'ที่อยู่นอกพื้นที่ข้างต้นยังไม่เปิดให้บริการจัดส่ง', '');
  }

  if (slots.length > 0) {
    L.push('## รอบเวลาจัดส่ง', '');
    for (const s of slots) {
      L.push(
        `- รอบ${s.name} เวลา ${formatSlotTime(s.start_time)}-${formatSlotTime(s.end_time)} น. `
        + `ให้บริการ ${formatDays(s.days_of_week)} ปิดรับออเดอร์ก่อนเริ่มรอบ ${s.cutoff_minutes} นาที`,
      );
    }
    L.push('', 'รอบจัดส่งเลือกได้เป็นช่วงเวลา ไม่ใช่เวลานัดที่แน่นอน', '');
  }

  if (products.length > 0) {
    L.push('## สินค้า', '');
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
  L.push(`- [พื้นที่จัดส่งและรอบส่ง](${storefrontUrl(cfg, slug, '/delivery')})`);
  L.push('');

  return new NextResponse(L.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
