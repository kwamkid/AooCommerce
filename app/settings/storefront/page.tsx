// Path: app/settings/storefront/page.tsx
// ตั้งค่าหน้าร้านออนไลน์ — เปิด/ปิด ธีม โดเมน และ AI crawler
'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import FormInput from '@/components/ui/FormInput';
import Alert from '@/components/ui/Alert';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useToast } from '@/lib/toast-context';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import {
  DEFAULT_STOREFRONT, storefrontCssVars, storefrontRootClasses,
  readableTextColor, relativeLuminance,
  type StorefrontConfig, type StorefrontProduct,
} from '@/lib/storefront';
import StoreHeader from '@/components/storefront/StoreHeader';
import StoreProductCard from '@/components/storefront/StoreProductCard';
import '@/components/storefront/storefront.css';
import ColorPicker from '@/components/ui/ColorPicker';
import OptionCards from '@/components/ui/OptionCards';
import { ExternalLink, Globe, Palette, Plus, Store } from 'lucide-react';
import Tabs from '@/components/ui/Tabs';

// ── ภาพจำลองในตัวเลือก — วาดรูปทรงจริงเพื่อให้ตัดสินใจได้โดยไม่ต้องกดลอง ──

function HeaderPreview({ bg, fg, border }: { bg: string; fg: string; border?: boolean }) {
  return (
    <span className="w-full max-w-[74px] rounded-md overflow-hidden border border-gray-200 dark:border-slate-600 block">
      <span className="flex items-center gap-1 px-1.5 py-1" style={{ background: bg, borderBottom: border ? '1px solid #e5e7eb' : undefined }}>
        <span className="rounded-sm" style={{ width: 16, height: 4, background: fg, opacity: .85 }} />
        <span className="ml-auto rounded-full" style={{ width: 5, height: 5, background: fg, opacity: .6 }} />
        <span className="rounded-full" style={{ width: 5, height: 5, background: fg, opacity: .6 }} />
      </span>
      <span className="block bg-gray-50 dark:bg-slate-700" style={{ height: 18 }} />
    </span>
  );
}

/** การจัดวางในแถบหัวร้าน — วาดตำแหน่งโลโก้/เมนู/ไอคอนตามจริง */
function HeadLayoutPreview({ mode }: { mode: 'left' | 'stacked' | 'center' }) {
  const logo = <span className="rounded-sm bg-gray-500 dark:bg-slate-300" style={{ width: 14, height: 5 }} />;
  const item = (w: number, k: number) => (
    <span key={k} className="rounded-sm bg-gray-300 dark:bg-slate-500" style={{ width: w, height: 3 }} />
  );
  const icons = (
    <span className="flex gap-0.5">
      {[0, 1].map(i => <span key={i} className="rounded-full bg-gray-400 dark:bg-slate-400" style={{ width: 4, height: 4 }} />)}
    </span>
  );
  return (
    <span className="w-full max-w-[74px] rounded-md overflow-hidden border border-gray-200 dark:border-slate-600 block bg-white dark:bg-slate-800">
      {mode === 'left' && (
        <span className="flex items-center gap-1 px-1.5 py-1.5">
          {logo}
          <span className="flex gap-1">{[8, 8].map((w, i) => item(w, i))}</span>
          <span className="ml-auto">{icons}</span>
        </span>
      )}
      {mode === 'stacked' && (
        <>
          <span className="flex items-center px-1.5 py-1.5">{logo}<span className="ml-auto">{icons}</span></span>
          <span className="flex gap-1 px-1.5 pb-1.5">{[9, 9, 9].map((w, i) => item(w, i))}</span>
        </>
      )}
      {mode === 'center' && (
        <>
          <span className="relative flex items-center justify-center px-1.5 py-1.5">
            {logo}
            <span className="absolute right-1.5">{icons}</span>
          </span>
          <span className="flex gap-1 px-1.5 pb-1.5 justify-center">{[9, 9, 9].map((w, i) => item(w, i))}</span>
        </>
      )}
    </span>
  );
}

function RatioPreview({ ratio }: { ratio: string }) {
  return (
    <span
      className="bg-gray-200 dark:bg-slate-600 rounded-md block"
      style={{ aspectRatio: ratio, height: 44 }}
    />
  );
}

/** ตามต้นฉบับ = แต่ละรูปสูงตามจริง จึงวาดเป็นแท่งสูงไม่เท่ากัน */
function AutoRatioPreview() {
  return (
    <span className="flex items-start gap-1">
      {[44, 30, 38].map((h, i) => (
        <span key={i} className="bg-gray-200 dark:bg-slate-600 rounded" style={{ width: 13, height: h }} />
      ))}
    </span>
  );
}

/**
 * ก่ออิฐ — การ์ดใบล่างขยับขึ้นไปชนใบบนทันที ไม่รอให้แถวเสมอกัน
 * รอยต่อของแต่ละคอลัมน์จึงอยู่คนละระดับ แต่ก้นคอลัมน์เสมอกัน = ไม่มีช่องว่าง
 */
function MasonryPreview() {
  const cell = 'bg-gray-200 dark:bg-slate-600 rounded-sm block';
  return (
    <span className="flex items-start" style={{ width: 54, gap: 2 }}>
      {[[22, 12], [12, 22], [17, 17]].map((col, i) => (
        <span key={i} className="flex flex-col flex-1" style={{ gap: 2 }}>
          {col.map((h, j) => <span key={j} className={cell} style={{ height: h }} />)}
        </span>
      ))}
    </span>
  );
}

function RadiusPreview({ r, color }: { r: number; color: string }) {
  return (
    <span
      className="flex flex-col overflow-hidden"
      style={{ width: 38, height: 48, borderRadius: r, border: `1px solid ${color}` }}
    >
      <span style={{ background: color, opacity: .85, flex: 1 }} />
      <span className="bg-gray-200 dark:bg-slate-600" style={{ height: 13 }} />
    </span>
  );
}

/** แสดงอะไรตรงหัวร้าน — วาดโลโก้เป็นบล็อกสี่เหลี่ยม ชื่อร้านเป็นแถบตัวอักษร */
function LogoDisplayPreview({ mode }: { mode: StorefrontConfig['logo_display'] }) {
  return (
    <span className="w-full max-w-[74px] rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 flex items-center justify-center gap-1.5 px-2" style={{ height: 42 }}>
      {mode !== 'name_only' && <span className="rounded-sm bg-gray-400 dark:bg-slate-400" style={{ width: 13, height: 13 }} />}
      {mode !== 'logo_only' && <span className="rounded-sm bg-gray-500 dark:bg-slate-300" style={{ width: 28, height: 5 }} />}
    </span>
  );
}

/** สไตล์ปุ่ม — วาดปุ่มจริงด้วยสีที่ร้านเลือก ไม่ใช่กล่องสีเทาสื่อความ */
function ButtonStylePreview({ mode, cta, contrast, ink }: {
  mode: StorefrontConfig['button_style']; cta: string; contrast: string; ink: string;
}) {
  const style =
    mode === 'solid' ? { background: cta, color: contrast, border: `1px solid ${cta}` }
    : mode === 'outline' ? { background: 'transparent', color: ink, border: `1px solid ${ink}` }
    : { background: `${cta}26`, color: ink, border: '1px solid transparent' };
  return (
    <span
      className="flex items-center justify-center gap-1 font-semibold rounded"
      style={{ ...style, width: 68, height: 24, fontSize: 9 }}
    >
      <Plus style={{ width: 9, height: 9 }} strokeWidth={2.5} aria-hidden="true" />
      หยิบใส่ตะกร้า
    </span>
  );
}

function LayoutPreview({ mode }: { mode: 'grid' | 'editorial' }) {
  const cell = 'bg-gray-200 dark:bg-slate-600 rounded-sm';
  return mode === 'grid' ? (
    <span className="grid grid-cols-3 gap-1" style={{ width: 54 }}>
      {[0, 1, 2, 3, 4, 5].map(i => <span key={i} className={cell} style={{ height: 14 }} />)}
    </span>
  ) : (
    <span className="grid grid-cols-1 gap-1" style={{ width: 54 }}>
      {[0, 1].map(i => <span key={i} className={cell} style={{ height: 18 }} />)}
    </span>
  );
}

/** ความสูงของกรอบพรีวิวก่อนย่อ — พอให้เห็นหัวร้าน + สินค้าสองแถว */
const PREVIEW_H = 900;
/** ความกว้างที่กรอบพรีวิวถูกย่อลงมาให้พอดีคอลัมน์ขวา */
const PREVIEW_BOX_W = 380;

const PREVIEW_NAV = [
  { href: '#', label: 'สินค้าทั้งหมด' },
  { href: '#', label: 'กระเช้าปีใหม่' },
  { href: '#', label: 'กระเช้าเยี่ยมไข้' },
  { href: '#', label: 'กระเช้าแสดงความยินดี' },
  { href: '#', label: 'การจัดส่ง' },
  { href: '#', label: 'บัญชีของฉัน' },
];

/** รูปตัวอย่างเป็น SVG data URI — ไม่ต้องยิงเน็ต และคุมสัดส่วนต้นฉบับได้เป๊ะ */
function previewPhoto(w: number, h: number, color: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="#eef2f7"/>` +
    `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.3}" fill="${color}" opacity="0.32"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * ลำดับสำคัญ: ตาราง = ไล่ซ้าย→ขวา, ก่ออิฐ = ไล่ลงคอลัมน์
 * เรียง [ชื่อยาว, ชื่อสั้น, ชื่อสั้น, ชื่อยาว] จึงเห็นความต่างทั้งสองโหมด
 */
const PREVIEW_SEED = [
  { name: 'กระเช้าผลไม้พรีเมียม รวมผลไม้นำเข้า 12 ชนิด', cat: 'กระเช้าปีใหม่', price: 1790, w: 800, h: 1000 },
  { name: 'กระเช้าส้มสายน้ำผึ้ง', cat: 'กระเช้าเยี่ยมไข้', price: 890, w: 800, h: 1000 },
  { name: 'ตะกร้าผลไม้รวม', cat: 'ของขวัญ', price: 650, w: 800, h: 800 },
  { name: 'กระเช้าแอปเปิลฟูจิ พร้อมการ์ดอวยพร', cat: 'กระเช้าปีใหม่', price: 1290, w: 800, h: 800 },
];

export default function StorefrontSettingsPage() {
  const { allowed, loading: guardLoading } = useAuthGuard('settings.access', { noRedirect: true });
  const { showToast } = useToast();

  const [cfg, setCfg] = useState<StorefrontConfig>(DEFAULT_STOREFRONT);
  const [slug, setSlug] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // แท็บเป็น state ไม่ใช่ route — cfg เป็นก้อนเดียว กดบันทึกครั้งเดียวเซฟทุกแท็บ
  // ถ้าแยกเป็น URL ผู้ใช้จะเผลอเปลี่ยนหน้าแล้วทิ้งค่าที่แก้ค้างในแท็บอื่น
  const [tab, setTab] = useState<'info' | 'design' | 'seo'>('info');
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');

  useFetchOnce(useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings/storefront');
      if (res.ok) {
        const data = await res.json();
        setCfg(data.storefront);
        setSlug(data.slug || '');
        setLogoUrl(data.logo_url || null);
        setCompanyName(data.company_name || '');
      }
    } finally {
      setLoading(false);
    }
  }, []), allowed);

  const patch = (p: Partial<StorefrontConfig>) => setCfg(prev => ({ ...prev, ...p }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/settings/storefront', {
        method: 'PUT',
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'บันทึกไม่สำเร็จ', 'error'); return; }
      setCfg(data.storefront);
      showToast('บันทึกหน้าร้านออนไลน์แล้ว', 'success');
    } finally {
      setSaving(false);
    }
  };

  if (guardLoading) return <Layout><Container size="2xl"><LoadingCard /></Container></Layout>;
  if (!allowed) return <Layout><Container size="2xl"><NoPermissionCard /></Container></Layout>;

  const previewWidth = device === 'mobile' ? 390 : 1120;
  const previewScale = PREVIEW_BOX_W / previewWidth;
  const previewShopName = cfg.display_name || companyName || 'ชื่อร้านของคุณ';
  const previewProducts = useMemo<StorefrontProduct[]>(() => PREVIEW_SEED.map((p, i) => ({
    id: `preview-${i}`,
    slug: `preview-${i}`,
    name: p.name,
    description: null,
    category: p.cat,
    brand: null,
    images: [previewPhoto(p.w, p.h, cfg.primary_color)],
    variations: [{
      id: `preview-v-${i}`, label: null, sku: null,
      price: p.price, compare_at: null, in_stock: true, image: null,
    }],
    price_min: p.price,
    price_max: p.price,
    in_stock: true,
    updated_at: '',
  })), [cfg.primary_color]);

  const ctaColor = cfg.button_color || cfg.primary_color;
  const ctaContrast = readableTextColor(ctaColor);
  const ctaInk = relativeLuminance(ctaColor) > 0.62 ? 'currentColor' : ctaColor;
  const showLogoPv = !!logoUrl && cfg.logo_display !== 'name_only';
  const showNamePv = cfg.logo_display !== 'logo_only' || !showLogoPv;

  const internalPath = slug ? `/store/${slug}` : '';
  const publicUrl = cfg.public_base_url ? `${cfg.public_base_url}${cfg.public_base_path}` : '';

  return (
    <Layout>
      <Container size="2xl">
        <PageHeader
          title="หน้าร้านออนไลน์"
          subtitle="หน้าร้านของคุณเอง พร้อม SEO และรองรับการค้นหาด้วย AI"
          backHref="/settings/company"
          actions={
            internalPath && cfg.enabled ? (
              <Link href={internalPath} target="_blank">
                <Button variant="secondary" icon={<ExternalLink className="w-4 h-4" />}>ดูหน้าร้าน</Button>
              </Link>
            ) : undefined
          }
        />

        {loading ? <LoadingCard /> : (
          <div className="space-y-4">
            <Tabs
              className="mb-0"
              activeKey={tab}
              onSelect={(k) => setTab(k as 'info' | 'design' | 'seo')}
              tabs={[
                { key: 'info', label: 'ข้อมูลร้าน', icon: <Store className="w-4 h-4" /> },
                { key: 'design', label: 'ตกแต่งร้าน', icon: <Palette className="w-4 h-4" /> },
                { key: 'seo', label: 'SEO & AI', icon: <Globe className="w-4 h-4" /> },
              ]}
            />

            {tab === 'info' && (<>
            <Card padding="md">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.enabled ? 'bg-orange-50' : 'bg-gray-100 dark:bg-slate-700'}`}>
                    <Store className={`w-5 h-5 ${cfg.enabled ? 'text-[#F4511E]' : 'text-gray-400'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="heading-4">เปิดหน้าร้านออนไลน์</p>
                    <p className="section-desc">
                      ปิดอยู่ = หน้าร้านตอบ 404 ทั้งหมด ข้อมูลสินค้าไม่หลุดออกไปไหน
                    </p>
                  </div>
                </div>
                <Toggle checked={cfg.enabled} onChange={(v) => patch({ enabled: v })} aria-label="เปิดหน้าร้าน" />
              </div>
            </Card>

            <Card padding="md">
              <p className="heading-4 mb-1">ข้อมูลร้าน</p>
              <p className="section-desc mb-4">ใช้แสดงบนหัวร้าน และเป็น title/description ตั้งต้นของ Google</p>
              <div className="space-y-4">
                <FormInput
                  label="ชื่อร้านที่แสดง"
                  value={cfg.display_name}
                  onChange={(e) => patch({ display_name: e.target.value })}
                  placeholder={companyName ? `เว้นว่าง = ${companyName}` : 'เว้นว่าง = ใช้ชื่อบริษัท'}
                />
                <FormInput
                  label="คำโปรย"
                  value={cfg.tagline}
                  onChange={(e) => patch({ tagline: e.target.value })}
                  placeholder="เช่น ผักสดออร์แกนิกส่งตรงจากฟาร์ม ส่งถึงบ้านทุกวัน"
                  hint="ใช้เป็น meta description ตั้งต้น — เขียนเป็นประโยคเต็มจะดีทั้ง Google และ AI"
                />
                <FormInput
                  label="ประกาศบนหัวร้าน"
                  value={cfg.announcement}
                  onChange={(e) => patch({ announcement: e.target.value })}
                  placeholder="เช่น สั่งก่อน 13:00 รับของวันนี้ — เว้นว่าง = ไม่แสดง"
                />
              </div>
            </Card>

            </>)}

            {tab === 'seo' && (<>
            {!cfg.public_base_url && (
              <Alert tone="warning" title="ยังไม่ได้ผูกโดเมนของร้าน">
                หน้าร้านจะถูกตั้งเป็น <strong>noindex</strong> จนกว่าจะใส่โดเมนของคุณเอง —
                เพราะ SEO บนโดเมนของระบบไม่มีค่ากับร้านคุณ (ลูกค้าไม่ได้เป็นเจ้าของ URL
                และหลายร้านอยู่โดเมนเดียวกัน) ระหว่างนี้เปิดดู/ทดสอบได้ตามปกติ
              </Alert>
            )}

            <Card padding="md">
              <p className="heading-4 mb-1">โดเมน</p>
              <p className="section-desc mb-4">
                ชี้ <code>shop.yourdomain.com</code> มาที่ระบบ (หรือ proxy path <code>/shop</code> จากเว็บเดิม)
                แล้วใส่โดเมนนั้นที่นี่ — ทุก canonical, sitemap และ OG จะใช้โดเมนนี้
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput
                  label="โดเมนของร้าน"
                  value={cfg.public_base_url}
                  onChange={(e) => patch({ public_base_url: e.target.value })}
                  placeholder="https://shop.example.com"
                />
                <FormInput
                  label="Path (ถ้าอยู่ใต้ path)"
                  value={cfg.public_base_path}
                  onChange={(e) => patch({ public_base_path: e.target.value })}
                  placeholder="เช่น /shop — เว้นว่าง = อยู่ที่ราก"
                />
              </div>
              {publicUrl && (
                <p className="helper-text text-gray-500 mt-3">
                  URL สินค้าจะเป็น <code>{publicUrl}/p/ชื่อสินค้า</code> · sitemap ที่ <code>{publicUrl}/sitemap.xml</code>
                </p>
              )}
              {internalPath && (
                <p className="helper-text text-gray-400 mt-1">
                  path ภายในระบบ: <code>{internalPath}</code> — ให้ edge proxy ชี้โดเมนคุณมาที่นี่
                </p>
              )}
            </Card>
            </>)}

            {tab === 'design' && (
            <Card padding="md">
              <p className="heading-4 mb-1">หน้าตา</p>
              <p className="section-desc mb-5">เปลี่ยนที่นี่ที่เดียว มีผลทั้งร้าน — ดูผลได้จากพรีวิวด้านขวา</p>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
                {/* ── ตัวเลือก ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                  <ColorPicker
                    label="สีแบรนด์"
                    value={cfg.primary_color}
                    onChange={(hex) => patch({ primary_color: hex })}
                  />
                  <ColorPicker
                    label="สีปุ่มสั่งซื้อ"
                    value={cfg.button_color}
                    onChange={(hex) => patch({ button_color: hex })}
                    allowEmpty
                    emptyLabel="ใช้สีแบรนด์"
                    fallbackValue={cfg.primary_color}
                  />

                  <OptionCards
                    label="แสดงตรงหัวร้าน"
                    value={cfg.logo_display}
                    onChange={(v) => patch({ logo_display: v })}
                    options={[
                      { id: 'logo_name' as const, label: 'โลโก้ + ชื่อ', preview: <LogoDisplayPreview mode="logo_name" /> },
                      { id: 'logo_only' as const, label: 'โลโก้อย่างเดียว', description: 'โลโก้มีชื่อร้านอยู่แล้ว', preview: <LogoDisplayPreview mode="logo_only" /> },
                      { id: 'name_only' as const, label: 'ชื่ออย่างเดียว', preview: <LogoDisplayPreview mode="name_only" /> },
                    ]}
                  />

                  <OptionCards
                    label="สไตล์ปุ่มสั่งซื้อ"
                    value={cfg.button_style}
                    onChange={(v) => patch({ button_style: v })}
                    options={[
                      { id: 'solid' as const, label: 'สีทึบ', preview: <ButtonStylePreview mode="solid" cta={ctaColor} contrast={ctaContrast} ink={ctaInk} /> },
                      { id: 'outline' as const, label: 'เส้นขอบ', preview: <ButtonStylePreview mode="outline" cta={ctaColor} contrast={ctaContrast} ink={ctaInk} /> },
                      { id: 'soft' as const, label: 'พื้นอ่อน', preview: <ButtonStylePreview mode="soft" cta={ctaColor} contrast={ctaContrast} ink={ctaInk} /> },
                    ]}
                  />

                  <OptionCards
                    label="แถบหัวร้าน"
                    value={cfg.header_style}
                    onChange={(v) => patch({ header_style: v })}
                    options={[
                      { id: 'light' as const, label: 'พื้นขาว', preview: <HeaderPreview bg="#ffffff" fg="#111827" border /> },
                      { id: 'brand' as const, label: 'สีแบรนด์', preview: <HeaderPreview bg={cfg.primary_color} fg={readableTextColor(cfg.primary_color)} /> },
                      { id: 'dark' as const, label: 'พื้นเข้ม', preview: <HeaderPreview bg="#111827" fg="#f9fafb" /> },
                    ]}
                  />

                  <OptionCards
                    label="การจัดวางหัวร้าน"
                    value={cfg.header_layout}
                    onChange={(v) => patch({ header_layout: v })}
                    options={[
                      { id: 'left' as const, label: 'โลโก้ซ้าย', description: 'เมนูต่อท้าย บรรทัดเดียว', preview: <HeadLayoutPreview mode="left" /> },
                      { id: 'stacked' as const, label: 'เมนูบรรทัดล่าง', description: 'เมนูเยอะไม่เบียด', preview: <HeadLayoutPreview mode="stacked" /> },
                      { id: 'center' as const, label: 'โลโก้กลาง', description: 'โลโก้เด่น', preview: <HeadLayoutPreview mode="center" /> },
                    ]}
                  />

                  <OptionCards
                    label="สัดส่วนรูปสินค้า"
                    value={cfg.image_ratio}
                    onChange={(v) => patch({ image_ratio: v })}
                    options={[
                      { id: '1:1' as const, label: 'จัตุรัส 1:1', description: 'ทุกใบเท่ากัน · ตัดขอบ', preview: <RatioPreview ratio="1 / 1" /> },
                      { id: '4:5' as const, label: 'แนวตั้ง 4:5', description: 'ทุกใบเท่ากัน · ตัดขอบ', preview: <RatioPreview ratio="4 / 5" /> },
                      { id: 'auto' as const, label: 'ตามไฟล์ต้นฉบับ', description: 'เห็นทั้งรูป · สูงไม่เท่ากัน', preview: <AutoRatioPreview /> },
                    ]}
                  />

                  <OptionCards
                    label="ความมนของมุม"
                    value={cfg.radius}
                    onChange={(v) => patch({ radius: v })}
                    options={[
                      { id: 'sharp' as const, label: 'เหลี่ยม', preview: <RadiusPreview r={0} color={cfg.primary_color} /> },
                      { id: 'soft' as const, label: 'มนเล็กน้อย', preview: <RadiusPreview r={6} color={cfg.primary_color} /> },
                      { id: 'round' as const, label: 'มนมาก', preview: <RadiusPreview r={13} color={cfg.primary_color} /> },
                    ]}
                  />

                  <OptionCards
                    label="เลย์เอาต์"
                    value={cfg.layout}
                    onChange={(v) => patch({ layout: v })}
                    options={[
                      { id: 'grid' as const, label: 'ตาราง', description: 'การ์ดเล็ก · มือถือ 2 ชิ้น/แถว', preview: <LayoutPreview mode="grid" /> },
                      { id: 'editorial' as const, label: 'รูปใหญ่', description: 'การ์ดใหญ่ · มือถือ 1 ชิ้น/แถว', preview: <LayoutPreview mode="editorial" /> },
                      { id: 'masonry' as const, label: 'ก่ออิฐ', description: 'ไม่มีช่องว่าง · เรียงลงคอลัมน์', preview: <MasonryPreview /> },
                    ]}
                  />

                  <p className="helper-text text-gray-500 sm:col-span-2">
                    สัดส่วนรูปเป็นการครอบตอนแสดงผลเท่านั้น — ไฟล์รูปที่อัปโหลดไว้ไม่ถูกแก้ เปลี่ยนกลับได้ตลอด
                    {cfg.image_ratio !== 'auto' && ' · ไม่อยากให้รูปโดนตัดเลย ใช้ "ตามไฟล์ต้นฉบับ" คู่กับเลย์เอาต์ "ก่ออิฐ"'}
                    {cfg.image_ratio === 'auto' && ' · "ตามไฟล์ต้นฉบับ" ไม่ครอบรูปเลย การ์ดจึงสูงไม่เท่ากัน — เข้ากับเลย์เอาต์ "ก่ออิฐ" ที่สุด'}
                    {cfg.layout === 'masonry' && ' · "ก่ออิฐ" เรียงสินค้าไล่ลงทีละคอลัมน์ (ไม่ใช่ซ้ายไปขวา) เหมาะกับร้านที่ลำดับสินค้าไม่สำคัญ'}
                  </p>

                  {/* ก่ออิฐ + กรอบคงที่ = การ์ดสูงเท่ากันอยู่แล้ว จึงได้หน้าตาเดียวกับตาราง แต่เสียลำดับการอ่านไปฟรี ๆ */}
                  {cfg.layout === 'masonry' && cfg.image_ratio !== 'auto' && (
                    <p className="helper-text text-amber-700 dark:text-amber-500 sm:col-span-2 -mt-2">
                      กรอบ {cfg.image_ratio} บังคับให้รูปสูงเท่ากันทุกใบอยู่แล้ว "ก่ออิฐ" จึงออกมาหน้าตาเกือบเหมือน "ตาราง"
                      (ต่างแค่การ์ดที่ชื่อสินค้ายาวคนละบรรทัด) แต่แลกด้วยลำดับการอ่านที่ไหลลงคอลัมน์ —
                      ถ้าอยากได้ก่ออิฐจริง ๆ ให้เลือกสัดส่วน "ตามไฟล์ต้นฉบับ" คู่กัน
                    </p>
                  )}
                </div>

                {/* พรีวิวเรนเดอร์จาก component ตัวเดียวกับหน้าร้านจริง (StoreHeader /
                    StoreProductCard) + CSS ไฟล์เดียวกัน — ไม่มีทางเพี้ยนจากของจริงอีก
                    responsive ใช้ @container ผูกกับความกว้างของ .sf-root ไม่ใช่ความกว้างจอ
                    ย่อกล่องเหลือ 390px จึงได้เลย์เอาต์มือถือจริงโดยไม่ต้องใช้ iframe */}
                <div className="lg:sticky lg:top-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="field-label mb-0">ตัวอย่างหน้าร้าน</p>
                    <div className="flex rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden">
                      {([['mobile', 'มือถือ'], ['desktop', 'เดสก์ท็อป']] as const).map(([d, label]) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDevice(d)}
                          className={`px-2.5 py-1 subtitle-text transition-colors ${
                            device === d
                              ? 'bg-[#F4511E] text-white'
                              : 'text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!logoUrl && (
                    <p className="helper-text text-gray-500 mb-2">
                      ยังไม่มีโลโก้ — อัปโหลดได้ที่{' '}
                      <Link href="/settings/company" className="text-[#F4511E] hover:underline">ข้อมูลร้านค้า</Link>
                    </p>
                  )}

                  <div
                    className="rounded-xl border border-gray-200 dark:border-slate-600 overflow-hidden bg-white dark:bg-slate-900"
                    style={{ height: Math.round(PREVIEW_H * previewScale) }}
                  >
                    <div
                      style={{
                        width: previewWidth,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                        pointerEvents: 'none',   /* พรีวิวไว้ดู ไม่ใช่ไว้กดสั่งของ */
                      }}
                      aria-hidden="true"
                    >
                      <div
                        className={storefrontRootClasses(cfg).join(' ')}
                        style={storefrontCssVars(cfg) as React.CSSProperties}
                      >
                        {cfg.announcement && <div className="sf-announcement">{cfg.announcement}</div>}
                        <StoreHeader
                          cfg={cfg}
                          slug={slug}
                          shopName={previewShopName}
                          logoUrl={logoUrl}
                          navLinks={PREVIEW_NAV}
                        />
                        <main className="sf-main">
                          <div className="sf-container">
                            <div className="sf-hero">
                              <h1>{previewShopName}</h1>
                              <p>{cfg.tagline || `เลือกซื้อสินค้าจาก ${previewShopName} จัดส่งถึงบ้าน`}</p>
                            </div>
                            <div className="sf-grid">
                              {previewProducts.map(p => (
                                <StoreProductCard key={p.id} product={p} slug={slug} />
                              ))}
                            </div>
                          </div>
                        </main>
                      </div>
                    </div>
                  </div>

                  <p className="helper-text text-gray-500 mt-2">
                    นี่คือหน้าร้านจริงย่อส่วน ไม่ใช่ภาพจำลอง — รูปตัวอย่างเป็น 1:1 และ 4:5
                    อย่างละ 2 ชิ้น ชื่อสินค้ามีทั้งสั้นและยาวเกิน 1 บรรทัด
                  </p>
                </div>
              </div>
            </Card>
            )}

            {tab === 'seo' && (
            <Card padding="md">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="heading-4">ให้ AI ค้นเจอร้าน (AEO)</p>
                  <p className="section-desc">
                    อนุญาต ChatGPT, Claude, Perplexity, Google AI Overviews ให้อ่านสินค้าและข้อมูลจัดส่ง
                    เพื่อยกไปตอบผู้ใช้ — ปิดได้ถ้าไม่ต้องการ
                  </p>
                </div>
                <Toggle
                  checked={cfg.allow_ai_crawlers}
                  onChange={(v) => patch({ allow_ai_crawlers: v })}
                  aria-label="อนุญาต AI crawler"
                />
              </div>
              {cfg.allow_ai_crawlers && publicUrl && (
                <p className="helper-text text-gray-500 mt-3">
                  ระบบสร้าง <code>{publicUrl}/llms.txt</code> ให้อัตโนมัติจากสินค้า โซนจัดส่ง และรอบส่งจริง
                </p>
              )}
            </Card>
            )}

            {/* ปุ่มบันทึกอยู่นอกแท็บ — แก้ข้ามแท็บแล้วกดครั้งเดียวจบ */}
            <div className="flex justify-end gap-3">
              <Button variant="primary" loading={saving} onClick={save}>บันทึก</Button>
            </div>
          </div>
        )}
      </Container>
    </Layout>
  );
}
