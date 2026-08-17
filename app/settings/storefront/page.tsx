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
import FormSelect from '@/components/ui/FormSelect';
import Alert from '@/components/ui/Alert';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useToast } from '@/lib/toast-context';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_STOREFRONT, storefrontCssVars, type StorefrontConfig } from '@/lib/storefront';
import { ExternalLink, Store } from 'lucide-react';

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
              <p className="section-desc mb-4">เปลี่ยนที่นี่ที่เดียว มีผลทั้งร้าน</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="field-label">สีหลัก</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={cfg.primary_color}
                      onChange={(e) => patch({ primary_color: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-gray-200 dark:border-slate-600 cursor-pointer bg-transparent"
                      aria-label="สีหลักของร้าน"
                    />
                    <span className="body-text font-mono">{cfg.primary_color}</span>
                  </div>
                </div>
                <div>
                  <label className="field-label">ความมนของมุม</label>
                  <FormSelect
                    value={cfg.radius}
                    onChange={(v) => patch({ radius: v as StorefrontConfig['radius'] })}
                    options={[
                      { id: 'sharp', label: 'เหลี่ยม' },
                      { id: 'soft', label: 'มนเล็กน้อย' },
                      { id: 'round', label: 'มนมาก' },
                    ]}
                  />
                </div>
                <div>
                  <label className="field-label">เลย์เอาต์</label>
                  <FormSelect
                    value={cfg.layout}
                    onChange={(v) => patch({ layout: v as StorefrontConfig['layout'] })}
                    options={[
                      { id: 'grid', label: 'ตาราง (สินค้าเยอะ)' },
                      { id: 'editorial', label: 'รูปใหญ่ (สินค้าน้อย)' },
                    ]}
                  />
                </div>
              </div>

              {/* พรีวิวธีมสด ๆ ด้วย token ชุดเดียวกับหน้าร้านจริง */}
              <div
                className="mt-4 rounded-lg border border-gray-200 dark:border-slate-600 p-4 flex items-center gap-3"
                style={storefrontCssVars(cfg) as React.CSSProperties}
              >
                <span
                  className="inline-flex items-center px-5 py-2.5 font-semibold"
                  style={{
                    background: 'var(--sf-primary)',
                    color: 'var(--sf-primary-contrast)',
                    borderRadius: 'var(--sf-radius)',
                  }}
                >
                  หยิบใส่ตะกร้า
                </span>
                <span className="subtitle-text text-gray-500">ตัวอย่างปุ่มบนหน้าร้าน</span>
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
