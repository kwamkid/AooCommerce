// Path: app/settings/storefront/page.tsx
// ตั้งค่าหน้าร้านออนไลน์ — เปิด/ปิด ธีม โดเมน และ AI crawler
'use client';

import { useState, useCallback } from 'react';
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
import { DEFAULT_STOREFRONT, storefrontCssVars, readableTextColor, type StorefrontConfig } from '@/lib/storefront';
import ColorPicker from '@/components/ui/ColorPicker';
import OptionCards from '@/components/ui/OptionCards';
import { ExternalLink, Store } from 'lucide-react';

// ── ภาพจำลองในตัวเลือก — วาดรูปทรงจริงเพื่อให้ตัดสินใจได้โดยไม่ต้องกดลอง ──

function HeaderPreview({ bg, fg, border }: { bg: string; fg: string; border?: boolean }) {
  return (
    <span className="w-full max-w-[58px] rounded overflow-hidden border border-gray-200 dark:border-slate-600 block">
      <span className="flex items-center gap-1 px-1.5 py-1" style={{ background: bg, borderBottom: border ? '1px solid #e5e7eb' : undefined }}>
        <span className="rounded-sm" style={{ width: 12, height: 3, background: fg, opacity: .85 }} />
        <span className="ml-auto rounded-full" style={{ width: 4, height: 4, background: fg, opacity: .6 }} />
        <span className="rounded-full" style={{ width: 4, height: 4, background: fg, opacity: .6 }} />
      </span>
      <span className="block bg-gray-50 dark:bg-slate-700" style={{ height: 13 }} />
    </span>
  );
}

function RatioPreview({ ratio }: { ratio: string }) {
  return (
    <span
      className="bg-gray-200 dark:bg-slate-600 rounded-md block"
      style={{ aspectRatio: ratio, height: 34 }}
    />
  );
}

/** เต็มกรอบ = รูป (แถบเฉียง) ล้นออกนอกกรอบแล้วถูกตัด · เห็นทั้งรูป = ย่อลงพอดี มีพื้นหลังเบลอ */
function FitPreview({ mode, ratio }: { mode: 'cover' | 'contain'; ratio: '1:1' | '4:5' }) {
  const frame = { aspectRatio: ratio === '1:1' ? '1 / 1' : '4 / 5', height: 34 };
  const photo = 'repeating-linear-gradient(135deg, #94a3b8 0 6px, #cbd5e1 6px 12px)';
  return (
    <span className="relative overflow-hidden rounded-md block border border-gray-300 dark:border-slate-500" style={frame}>
      {mode === 'cover' ? (
        // รูปกว้างกว่ากรอบ → ส่วนที่เกินหายไป
        <span className="absolute top-0 bottom-0" style={{ background: photo, left: '-25%', width: '150%' }} />
      ) : (
        <>
          <span className="absolute inset-0" style={{ background: photo, filter: 'blur(4px)', opacity: .45, transform: 'scale(1.3)' }} />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ background: photo, width: '78%', height: '58%' }} />
        </>
      )}
    </span>
  );
}

function RadiusPreview({ r, color }: { r: number; color: string }) {
  return (
    <span className="block" style={{ width: 32, height: 32, background: color, borderRadius: r * 0.7, opacity: .9 }} />
  );
}

function LayoutPreview({ mode }: { mode: 'grid' | 'editorial' }) {
  const cell = 'bg-gray-200 dark:bg-slate-600 rounded-sm';
  return mode === 'grid' ? (
    <span className="grid grid-cols-3 gap-0.5" style={{ width: 42 }}>
      {[0, 1, 2, 3, 4, 5].map(i => <span key={i} className={cell} style={{ height: 11 }} />)}
    </span>
  ) : (
    <span className="grid grid-cols-1 gap-0.5" style={{ width: 42 }}>
      {[0, 1].map(i => <span key={i} className={cell} style={{ height: 14 }} />)}
    </span>
  );
}

export default function StorefrontSettingsPage() {
  const { allowed, loading: guardLoading } = useAuthGuard('settings.access', { noRedirect: true });
  const { showToast } = useToast();

  const [cfg, setCfg] = useState<StorefrontConfig>(DEFAULT_STOREFRONT);
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useFetchOnce(useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings/storefront');
      if (res.ok) {
        const data = await res.json();
        setCfg(data.storefront);
        setSlug(data.slug || '');
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

            {!cfg.public_base_url && (
              <Alert tone="warning" title="ยังไม่ได้ผูกโดเมนของร้าน">
                หน้าร้านจะถูกตั้งเป็น <strong>noindex</strong> จนกว่าจะใส่โดเมนของคุณเอง —
                เพราะ SEO บนโดเมนของระบบไม่มีค่ากับร้านคุณ (ลูกค้าไม่ได้เป็นเจ้าของ URL
                และหลายร้านอยู่โดเมนเดียวกัน) ระหว่างนี้เปิดดู/ทดสอบได้ตามปกติ
              </Alert>
            )}

            <Card padding="md">
              <p className="heading-4 mb-1">ข้อมูลร้าน</p>
              <p className="section-desc mb-4">ใช้แสดงบนหัวร้าน และเป็น title/description ตั้งต้นของ Google</p>
              <div className="space-y-4">
                <FormInput
                  label="ชื่อร้านที่แสดง"
                  value={cfg.display_name}
                  onChange={(e) => patch({ display_name: e.target.value })}
                  placeholder="เว้นว่าง = ใช้ชื่อบริษัท"
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
            <Card padding="md">
              <p className="heading-4 mb-1">หน้าตา</p>
              <p className="section-desc mb-5">เปลี่ยนที่นี่ที่เดียว มีผลทั้งร้าน — ดูผลได้จากพรีวิวด้านขวา</p>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
                {/* ── ตัวเลือก ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
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
                    label="สัดส่วนรูปสินค้า"
                    value={cfg.image_ratio}
                    onChange={(v) => patch({ image_ratio: v })}
                    options={[
                      { id: '1:1' as const, label: 'จัตุรัส 1:1', preview: <RatioPreview ratio="1 / 1" /> },
                      { id: '4:5' as const, label: 'แนวตั้ง 4:5', preview: <RatioPreview ratio="4 / 5" /> },
                    ]}
                  />

                  <OptionCards
                    label="รูปที่สัดส่วนไม่ตรงกรอบ"
                    value={cfg.image_fit}
                    onChange={(v) => patch({ image_fit: v })}
                    options={[
                      { id: 'cover' as const, label: 'เต็มกรอบ', description: 'ตัดขอบส่วนเกิน', preview: <FitPreview mode="cover" ratio={cfg.image_ratio} /> },
                      { id: 'contain' as const, label: 'เห็นทั้งรูป', description: 'เติมพื้นหลังเบลอ', preview: <FitPreview mode="contain" ratio={cfg.image_ratio} /> },
                    ]}
                  />

                  <OptionCards
                    label="ความมนของมุม"
                    value={cfg.radius}
                    onChange={(v) => patch({ radius: v })}
                    options={[
                      { id: 'sharp' as const, label: 'เหลี่ยม', preview: <RadiusPreview r={0} color={cfg.primary_color} /> },
                      { id: 'soft' as const, label: 'มนเล็กน้อย', preview: <RadiusPreview r={8} color={cfg.primary_color} /> },
                      { id: 'round' as const, label: 'มนมาก', preview: <RadiusPreview r={18} color={cfg.primary_color} /> },
                    ]}
                  />

                  <OptionCards
                    label="เลย์เอาต์"
                    value={cfg.layout}
                    onChange={(v) => patch({ layout: v })}
                    options={[
                      { id: 'grid' as const, label: 'ตาราง', description: 'การ์ดเล็ก · มือถือ 2 ชิ้น/แถว', preview: <LayoutPreview mode="grid" /> },
                      { id: 'editorial' as const, label: 'รูปใหญ่', description: 'การ์ดใหญ่ · มือถือ 1 ชิ้น/แถว', preview: <LayoutPreview mode="editorial" /> },
                    ]}
                  />

                  <p className="helper-text text-gray-500 sm:col-span-2 lg:col-span-3">
                    สัดส่วนรูปเป็นการครอบตอนแสดงผลเท่านั้น — ไฟล์รูปที่อัปโหลดไว้ไม่ถูกแก้ เปลี่ยนกลับได้ตลอด
                  </p>
                </div>

                {/* ── พรีวิวสด — ใช้ token ชุดเดียวกับหน้าร้านจริง จึงตรงกับของจริงเสมอ ── */}
                <div className="lg:sticky lg:top-4">
                  <p className="field-label">ตัวอย่างหน้าร้าน</p>
                  <div
                    className="rounded-xl border border-gray-200 dark:border-slate-600 overflow-hidden bg-white dark:bg-slate-800"
                    style={storefrontCssVars(cfg) as React.CSSProperties}
                  >
                    {cfg.announcement && (
                      <div
                        className="px-3 py-1.5 text-center truncate"
                        style={{ background: 'var(--sf-primary)', color: 'var(--sf-primary-contrast)', fontSize: 11 }}
                      >
                        {cfg.announcement}
                      </div>
                    )}
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-slate-600"
                      style={
                        cfg.header_style === 'light'
                          ? undefined
                          : { background: 'var(--sf-header-bg)', color: 'var(--sf-header-fg)', borderColor: 'transparent' }
                      }
                    >
                      <span className="font-bold text-sm truncate">{cfg.display_name || 'ชื่อร้านของคุณ'}</span>
                      <span className="ml-auto opacity-60" style={{ fontSize: 11 }}>ค้นหา · ธีม · ตะกร้า</span>
                    </div>

                    <div className="p-3">
                      <div className={`grid gap-2 ${cfg.layout === 'grid' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {(cfg.layout === 'grid' ? [0, 1, 2, 3] : [0, 1]).map(i => (
                          <div
                            key={i}
                            className="border border-gray-200 dark:border-slate-600 overflow-hidden"
                            style={{ borderRadius: 'var(--sf-radius)' }}
                          >
                            <div
                              className="bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-400"
                              style={{ aspectRatio: 'var(--sf-img-ratio)' }}
                            >
                              <span style={{ fontSize: 10 }}>
                                {cfg.image_ratio} · {cfg.image_fit === 'cover' ? 'ตัดขอบ' : 'เห็นทั้งรูป'}
                              </span>
                            </div>
                            <div className="p-2">
                              <div className="text-gray-500" style={{ fontSize: 10 }}>กระเช้าปีใหม่</div>
                              <div className="font-semibold truncate" style={{ fontSize: 12 }}>สินค้าตัวอย่าง</div>
                              <div className="font-bold mt-0.5" style={{ fontSize: 12, color: 'var(--sf-primary)' }}>฿1,790</div>
                              <div
                                className="mt-1.5 text-center font-semibold py-1"
                                style={{
                                  background: 'var(--sf-cta)',
                                  color: 'var(--sf-cta-contrast)',
                                  borderRadius: 'calc(var(--sf-radius) / 1.5)',
                                  fontSize: 11,
                                }}
                              >
                                หยิบใส่ตะกร้า
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

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

            <div className="flex justify-end gap-3">
              <Button variant="primary" loading={saving} onClick={save}>บันทึก</Button>
            </div>
          </div>
        )}
      </Container>
    </Layout>
  );
}
