// Path: app/settings/features/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import { useCompany } from '@/lib/company-context';
import { can } from '@/lib/permissions';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  type FeatureFlags,
  type DeliveryFieldMode, DELIVERY_FIELD_MODE_LABELS, DELIVERY_FIELD_MODE_HINTS, deliveryFieldMode, deliveryFieldFromMode,
} from '@/lib/features';
import { CalendarDays, ShoppingCart, Monitor, Handshake, Tag, Factory, PackageCheck, Loader2, Truck, Warehouse, Lock, MapPin, Clock, Store, Megaphone, Target, Settings } from 'lucide-react';
import { featureLockReason, type PackageGates } from '@/lib/package-features';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE, type FilterChip } from '@/components/ui/FilterChips';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import ToggleCard from '@/components/ui/ToggleCard';
import { NoPermissionCard } from '@/components/ui/StateCard';
import StickyActionBar from '@/components/ui/StickyActionBar';
import { InfoChip } from '@/components/ui/StatusBadge';

// ---- Feature definitions ----

interface FeatureSection {
  key: keyof FeatureFlags;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string; // tailwind text color when active
  comingSoon?: boolean;
  /** หน้าตั้งค่าของฟีเจอร์นี้ — มีแล้วจะมีปุ่ม "ตั้งค่า" ข้างสวิตช์ (เปิดอยู่เท่านั้น)
   *  ⛔ ห้ามเอาฟอร์มตั้งค่ามาฝังในการ์ด — หน้ารวมฟีเจอร์จะบวมจนหาอะไรไม่เจอ */
  settingsHref?: string;
}

export default function FeaturesPage() {
  const router = useRouter();
  const { currentCompany, companyRoles, permissions } = useCompany();
  const { features: currentFeatures, gates, fetched: featuresFetched, refreshFeatures } = useFeatures();
  const { showToast } = useToast();

  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(currentFeatures);
  const [featuresLoaded, setFeaturesLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * หน้านี้ถือแค่ "เปิด/ปิดฟีเจอร์" — ค่าตั้งต้นทางธุรกิจ (GP% · เงื่อนไขชำระ)
   * ย้ายไปแท็บของตัวเองที่ ตั้งค่า > ทั่วไป > ลูกค้าตัวแทน / ลูกค้าห้าง แล้ว
   */
  const savedRef = useRef<FeatureFlags | null>(null);

  useEffect(() => {
    if (featuresFetched && !featuresLoaded) {
      setFeatureFlags(currentFeatures);
      setFeaturesLoaded(true);
      apiFetch('/api/settings/features').then(r => r.json()).then(data => {
        const flags = (data.features ?? currentFeatures) as FeatureFlags;
        setFeatureFlags(flags);
        savedRef.current = flags;
      }).catch(() => {});
    }
  }, [featuresFetched, currentFeatures, featuresLoaded]);

  // ช่องจัดส่งทั้งสามตัวอยู่ในการ์ดของตัวเอง (DeliveryFieldsCard) ไม่ผ่านทางนี้
  const getFeatureValue = (key: keyof FeatureFlags): boolean => {
    const v = featureFlags[key];
    return typeof v === 'object' && v !== null ? (v as { enabled: boolean }).enabled : Boolean(v);
  };

  const toggleFeature = (key: keyof FeatureFlags) => {
    // Package-gated features can't be turned on
    if (featureLockReason(key, gates)) return;
    setFeatureFlags(prev => {
      // อ่านจาก prev ไม่ใช่ state ที่ปิดไว้ในฟังก์ชัน — ตัว updater ต้องพึ่งค่าล่าสุดเสมอ
      const cur = prev[key];
      const newValue = !(typeof cur === 'object' && cur !== null ? (cur as { enabled: boolean }).enabled : Boolean(cur));
      const next = { ...prev, [key]: newValue };
      // ตัวแทนฝากขายต้องมีซัพพลายเออร์ (ใบสั่งซื้อ/รายงานฝั่งซื้อใช้ร่วมกัน)
      if (key === 'consignment' && newValue) next.supplier = true;
      if (key === 'supplier' && !newValue) next.consignment = false;
      return next;
    });
  };

  const handleSave = async () => {
    if (!currentCompany?.id) return;
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/settings/features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: featureFlags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');

      showToast('บันทึก Feature เสริมสำเร็จ', 'success');
      await refreshFeatures();

      // state ของหน้า = ความจริงจากเซิร์ฟเวอร์หลังบันทึก (รวมที่ API clamp ตามแพ็กเกจให้)
      const fresh = await apiFetch('/api/settings/features').then(r => r.json()).catch(() => null);
      if (fresh?.features) {
        setFeatureFlags(fresh.features as FeatureFlags);
        savedRef.current = fresh.features as FeatureFlags;
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const isOwnerOrAdmin = can({ roles: companyRoles, permissions }, 'settings.access');

  const isDirty = featuresLoaded
    && savedRef.current !== null
    && JSON.stringify(featureFlags) !== JSON.stringify(savedRef.current);

  // ---- Feature list ----
  // จัดกลุ่มเพราะรายการยาวขึ้นเรื่อย ๆ — เรียงเป็นแถวเดียว 14 ใบหาไม่เจอ
  // ⛔ ฟีเจอร์ที่ติดมาเป็น default เสมอ (คูปอง · แยกพัสดุ · Beam · Shippop · PWA)
  //    ห้ามเอามาใส่ที่นี่ — มันไม่ใช่ของที่เลือกเปิด/ปิด
  const FEATURE_GROUPS: { title: string; items: FeatureSection[] }[] = [
    {
      title: 'ช่องทางขาย',
      items: [
        {
          key: 'marketplace_sync',
          label: 'ซิงค์ Marketplace',
          description: 'เชื่อม Shopee · Lazada · TikTok Shop — ดึงออเดอร์และส่งสต็อกขึ้นร้าน',
          icon: <ShoppingCart className="w-5 h-5" />,
          color: 'text-orange-500',
          settingsHref: '/settings/sales-channels',
        },
        {
          key: 'pos',
          label: 'Cashier (POS)',
          description: 'ขายหน้าร้านผ่านเครื่องแคชเชียร์ ตัดสต็อกทันทีที่จ่ายเงิน',
          icon: <Monitor className="w-5 h-5" />,
          color: 'text-teal-600',
          settingsHref: '/settings/pos-terminals',
        },
        {
          key: 'storefront',
          label: 'หน้าร้านออนไลน์',
          description: 'ลิงก์ร้านของตัวเอง ลูกค้าสั่งเองได้ พร้อมตะกร้าและชำระเงิน',
          icon: <Store className="w-5 h-5" />,
          color: 'text-sky-600',
          settingsHref: '/settings/storefront',
        },
        {
          key: 'counter_sales',
          label: 'หน้าขาย PC ประจำห้าง',
          description: 'ให้ PC ที่เคาน์เตอร์บันทึกยอดขายหน้างานเข้าระบบเอง',
          icon: <Store className="w-5 h-5" />,
          color: 'text-indigo-600',
        },
      ],
    },
    {
      title: 'ลูกค้าธุรกิจ',
      items: [
        {
          key: 'consignment',
          label: 'ลูกค้าตัวแทน',
          description: 'ฝากขาย (ม.78(3)) · ขายขาดเงินสด · ขายขาดเครดิต — วางบิลรอบเดือน',
          icon: <Handshake className="w-5 h-5" />,
          color: 'text-amber-600',
          settingsHref: '/settings/consignment',
        },
        {
          key: 'department_store',
          label: 'ลูกค้าห้าง',
          description: 'ห้างฝากขาย · ขายขาดเงินสด · ขายขาดเครดิต — วางบิลรอบเดือน',
          icon: <PackageCheck className="w-5 h-5" />,
          color: 'text-purple-600',
          settingsHref: '/settings/department-store',
        },
      ],
    },
    {
      title: 'สินค้า & คลัง',
      items: [
        {
          key: 'stock',
          label: 'ระบบคลังสินค้า',
          description: 'ติดตามสต็อก รับเข้า ย้ายคลัง แยกตามสาขา',
          icon: <Warehouse className="w-5 h-5" />,
          color: 'text-emerald-600',
          settingsHref: '/settings/warehouses',
        },
        {
          key: 'product_brand',
          label: 'แบรนด์สินค้า',
          description: 'จัดกลุ่มสินค้าตามแบรนด์ และตั้ง GP% รายแบรนด์ได้',
          icon: <Tag className="w-5 h-5" />,
          color: 'text-pink-600',
          settingsHref: '/settings/brands',
        },
        {
          key: 'supplier',
          label: 'ซัพพลายเออร์ / ใบสั่งซื้อ',
          description: 'ผู้ผลิต ใบสั่งซื้อ (PO) และรายงานฝั่งซื้อ',
          icon: <Factory className="w-5 h-5" />,
          color: 'text-slate-600',
          settingsHref: '/settings/suppliers',
        },
      ],
    },
    {
      title: 'การตลาด',
      items: [
        {
          key: 'broadcast',
          label: 'บรอดแคสต์',
          description: 'ส่งข้อความการตลาดเข้าห้องแชท LINE · Facebook',
          icon: <Megaphone className="w-5 h-5" />,
          color: 'text-rose-600',
        },
        {
          key: 'audience',
          label: 'กลุ่มเป้าหมาย + Audience Sync',
          description: 'สร้างกลุ่มลูกค้าแล้วส่งขึ้นแพลตฟอร์มโฆษณาเพื่อยิงแอด',
          icon: <Target className="w-5 h-5" />,
          color: 'text-fuchsia-600',
          settingsHref: '/settings/ad-accounts',
        },
      ],
    },
  ];

  if (!isOwnerOrAdmin && featuresLoaded) {
    return (
      <Layout>
        <NoPermissionCard subtitle="เฉพาะเจ้าของและผู้ดูแลระบบเท่านั้น" />
      </Layout>
    );
  }

  return (
    <Layout>
      <Container size="full">
        <PageHeader title="Feature เสริม" subtitle="เปิด/ปิดฟีเจอร์ที่ใช้กับธุรกิจของคุณ" />

        {!featuresLoaded ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3">
            {FEATURE_GROUPS.map(group => (
              <div key={group.title} className="flex flex-col gap-3">
                <h3 className="nav-section-title text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-[0.08em] mt-2 px-1">
                  {group.title}
                </h3>

                {group.items.map((feat) => {
                  const isEnabled = getFeatureValue(feat.key);
                  const lockReason = featureLockReason(feat.key, gates);
                  const isLocked = lockReason !== null;

                  // สวิตช์เปลี่ยนแค่ state ในหน้า — บันทึกจริงที่ปุ่มด้านล่าง
                  return (
                    <ToggleCard
                      key={feat.key}
                      icon={feat.icon}
                      iconClass={isEnabled ? feat.color : 'text-gray-400 dark:text-slate-500'}
                      title={feat.label}
                      description={isLocked ? lockReason : feat.description}
                      badge={isLocked ? (
                        <InfoChip className="border" colors="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-900/50" icon={<Lock className="w-3 h-3" />}>ต้องอัปเกรด</InfoChip>
                      ) : undefined}
                      checked={isEnabled}
                      onChange={() => toggleFeature(feat.key)}
                      disabled={!isOwnerOrAdmin || isLocked}
                      highlight
                      className={isLocked ? 'opacity-70' : ''}
                      action={feat.settingsHref ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Settings className="w-4 h-4" />}
                          onClick={() => router.push(feat.settingsHref!)}
                        >
                          ตั้งค่า
                        </Button>
                      ) : undefined}
                    />
                  );
                })}
              </div>
            ))}

            {/* ช่องในการ์ด "จัดส่ง" ของฟอร์มเปิดบิล — สามแถว สามชิป ไม่มีพับเก็บ
                (เดิมเป็นสองการ์ด + ตัวเลือกย่อยที่ซ่อนอยู่ในปุ่มกาง ผู้ใช้หาไม่เจอ) */}
            <DeliveryFieldsCard
              flags={featureFlags}
              onChange={setFeatureFlags}
              gates={gates}
              canEdit={isOwnerOrAdmin}
            />
              </div>{/* end feature list */}

            </div>

            {isOwnerOrAdmin && (
              <StickyActionBar
                saving={isSaving}
                dirty={isDirty}
                onSave={handleSave}
                // ย้อนกลับไปค่าที่บันทึกล่าสุด ไม่ใช่ค่าจาก context (อาจเก่ากว่า)
                onCancel={() => setFeatureFlags(savedRef.current ?? currentFeatures)}
              />
            )}
          </>
        )}
      </Container>
    </Layout>
  );
}

// ── การจัดส่งของร้าน ──────────────────────────────────────────────────────
// สามแถว = สามช่องจริงในการ์ด "จัดส่ง" ของฟอร์มเปิดบิล แต่ละแถวเลือกได้ว่า
// ไม่แสดง / แสดง / บังคับกรอก — ไม่มีพับเก็บ เพราะของเดิมซ่อนตัวเลือกย่อยไว้ใน
// ปุ่มกางแล้วผู้ใช้หาไม่เจอ
//
// ⛔ ห้ามซ่อนแถวที่ยังเลือกไม่ได้ — แถวช่วงเวลาส่งต้องเห็นเสมอ แค่กดไม่ได้
//    พร้อมบอกเหตุผล ("ต้องเปิดวันที่ส่งของก่อน")

const modeChips = (
  ids: readonly DeliveryFieldMode[],
  hints: Partial<Record<DeliveryFieldMode, string>> = {},
): FilterChip<DeliveryFieldMode>[] =>
  ids.map(id => ({
    id,
    label: DELIVERY_FIELD_MODE_LABELS[id],
    activeClass: FILTER_CHIP_PRIMARY_ACTIVE,
    tooltip: hints[id] ?? DELIVERY_FIELD_MODE_HINTS[id],
  }));

const DATE_SLOT_CHIPS = modeChips(['off', 'optional', 'required']);
// พื้นที่จัดส่งไม่มี "บังคับ" — ระบบเติมให้เองจากที่อยู่ ไม่ใช่ช่องที่พนักงานต้องกรอก
const ZONE_CHIPS = modeChips(['off', 'optional'], {
  off: 'ไม่มีช่องนี้ในฟอร์ม\nค่าส่งกรอกเองทุกบิล',
  optional: 'มีช่องนี้ในฟอร์ม\nระบบจับคู่พื้นที่จากที่อยู่แล้วเติมค่าส่งให้ แก้เองได้',
});

function DeliveryFieldRow({
  icon, title, description, chips, mode, onMode, disabled, locked,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  chips: FilterChip<DeliveryFieldMode>[];
  mode: DeliveryFieldMode;
  onMode: (mode: DeliveryFieldMode) => void;
  disabled: boolean;
  locked: boolean;
}) {
  // แถวที่เปิดใช้ = `.choice-card-active` (ขอบส้ม + พื้นส้มอ่อน โทน "ถูกเลือก" ของทั้งระบบ)
  // แถวที่ไม่แสดง = พื้นขาวขอบเทา — ห้ามพื้นเทา เพราะเทาในระบบนี้อ่านว่า "กดไม่ได้"
  // (เจ้าของทัก 10 ก.ย. 2026 สองรอบ: เทาอ่อนกลืน · เทาเข้มเหมือน disabled)
  const active = mode !== 'off';
  return (
    <div className={`choice-card ${active ? 'choice-card-active' : 'bg-white dark:bg-slate-800'} px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3`}>
      <div className="flex items-start gap-3 min-w-0">
        {icon}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900 dark:text-white">{title}</p>
            {locked && (
              <InfoChip className="border" colors="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-900/50" icon={<Lock className="w-3 h-3" />}>ต้องอัปเกรด</InfoChip>
            )}
          </div>
          <p className="subtitle-text text-gray-500 dark:text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="sm:ml-auto flex-shrink-0">
        <FilterChips chips={chips} value={mode} onChange={onMode} disabled={disabled} />
      </div>
    </div>
  );
}

function DeliveryFieldsCard({
  flags, onChange, gates, canEdit,
}: {
  flags: FeatureFlags;
  onChange: (next: FeatureFlags) => void;
  gates: PackageGates;
  canEdit: boolean;
}) {
  const dateLock = featureLockReason('delivery_date', gates);
  const slotLock = featureLockReason('delivery_slot', gates);
  const zoneLock = featureLockReason('delivery_zone', gates);

  const dateMode = deliveryFieldMode(flags.delivery_date);
  const slotMode = deliveryFieldMode(flags.delivery_slot);
  const zoneMode: DeliveryFieldMode = flags.delivery_zone ? 'optional' : 'off';
  const anyOn = flags.delivery_date.enabled || flags.delivery_slot.enabled || flags.delivery_zone;

  const iconClass = (on: boolean, color: string) =>
    `w-5 h-5 flex-shrink-0 mt-0.5 ${on ? color : 'text-gray-400 dark:text-slate-500'}`;

  // ปิดวันส่ง → ช่วงเวลาปิดตาม · ลดวันส่งเหลือ "แสดง" → ช่วงเวลาบังคับไม่ได้แล้ว
  const setDate = (mode: DeliveryFieldMode) => {
    const date = deliveryFieldFromMode(mode);
    let slot = flags.delivery_slot;
    if (!date.enabled) slot = { enabled: false, required: false };
    else if (!date.required && slot.required) slot = { ...slot, required: false };
    onChange({ ...flags, delivery_date: date, delivery_slot: slot });
  };

  // บังคับช่วงเวลา → วันส่งต้องบังคับตาม (เลือกช่วงโดยไม่มีวันไม่ได้)
  const setSlot = (mode: DeliveryFieldMode) => {
    const slot = deliveryFieldFromMode(mode);
    const date = slot.required ? { enabled: true, required: true } : flags.delivery_date;
    onChange({ ...flags, delivery_slot: slot, delivery_date: date });
  };

  const setZone = (mode: DeliveryFieldMode) => {
    onChange({ ...flags, delivery_zone: mode === 'optional' });
  };

  return (
    <Card className={`transition-all ${anyOn ? 'ring-1 ring-primary/20' : ''}`}>
      <div className="flex items-center gap-4">
        <div className={`flex-shrink-0 ${anyOn ? 'text-blue-600' : 'text-gray-400 dark:text-slate-500'}`}>
          <Truck className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-gray-900 dark:text-white">การจัดส่งของร้าน</p>
          <p className="subtitle-text text-gray-500 dark:text-slate-400">
            ช่องที่โผล่ในการ์ด &quot;จัดส่ง&quot; ตอนเปิดบิลเอง — ไม่กระทบออเดอร์จาก Shopee/Lazada/TikTok ที่มีค่าส่งมาแล้ว
          </p>
        </div>
      </div>

      {/* แถวย่อยเยื้องเข้ามาใต้หัวข้อ + เส้นแนวตั้งใต้ไอคอนรถ — ให้เห็นว่าเป็นลูกของการ์ดนี้
          (เดิมพื้นเทาอ่อนบนการ์ดขาว กลืนจนดูเป็นการ์ดเดี่ยว ๆ — เจ้าของทัก 10 ก.ย. 2026) */}
      <div className="mt-3 ml-[9px] pl-6 border-l-2 border-gray-200 dark:border-slate-600 space-y-2">
        <DeliveryFieldRow
          icon={<CalendarDays className={iconClass(flags.delivery_date.enabled, 'text-blue-600')} />}
          title="วันที่ส่งของ"
          description={dateLock ?? 'เปิดแล้วได้เมนู "จัดของเตรียมส่ง" และรายงานคิวส่งของรายวันด้วย'}
          chips={DATE_SLOT_CHIPS}
          mode={dateMode}
          onMode={setDate}
          disabled={!canEdit || !!dateLock}
          locked={!!dateLock}
        />

        <DeliveryFieldRow
          icon={<Clock className={iconClass(flags.delivery_slot.enabled, 'text-indigo-600')} />}
          title="ช่วงเวลาส่ง"
          description={
            slotLock
              ?? (!flags.delivery_date.enabled
                ? 'ต้องเปิดวันที่ส่งของก่อน'
                : 'รอบส่งเป็นช่วง 2-3 ชม. เช่น 09:00-12:00 · ตั้งรอบได้ที่ ตั้งค่า → การจัดส่ง')
          }
          chips={DATE_SLOT_CHIPS}
          mode={slotMode}
          onMode={setSlot}
          disabled={!canEdit || !!slotLock || !flags.delivery_date.enabled}
          locked={!!slotLock}
        />

        <DeliveryFieldRow
          icon={<MapPin className={iconClass(flags.delivery_zone, 'text-emerald-600')} />}
          title="พื้นที่จัดส่ง + ค่าส่ง"
          description={zoneLock ?? 'ระบบดูที่อยู่ลูกค้าแล้วเติมค่าส่งให้เองตามพื้นที่ที่ตั้งไว้ (เช่น กทม.ชั้นใน ฿100) · นอกทุกพื้นที่ = ไม่รับส่ง · ตั้งพื้นที่ได้ที่ ตั้งค่า → การจัดส่ง'}
          chips={ZONE_CHIPS}
          mode={zoneMode}
          onMode={setZone}
          disabled={!canEdit || !!zoneLock}
          locked={!!zoneLock}
        />
      </div>
    </Card>
  );
}
