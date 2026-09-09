// Path: app/settings/features/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import { useCompany } from '@/lib/company-context';
import { can } from '@/lib/permissions';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  type FeatureFlags, PRESET_DEFAULTS, PRESET_LABELS, PRESET_DESCRIPTIONS, detectPreset, type BusinessPreset,
  type DeliveryFieldMode, DELIVERY_FIELD_MODE_LABELS, deliveryFieldMode, deliveryFieldFromMode,
} from '@/lib/features';
import { CalendarDays, ShoppingCart, Monitor, Handshake, Tag, Factory, PackageCheck, ChevronDown, ChevronUp, Loader2, CreditCard, Truck, Store, Layers, Users, Warehouse, Building, Lock, MapPin, Clock } from 'lucide-react';
import { featureLockReason, type PackageGates } from '@/lib/package-features';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE, type FilterChip } from '@/components/ui/FilterChips';
import { type BrandGpRow } from '@/components/customers/BrandGpCommissions';
import GpOverridePanel from '@/components/customers/GpOverridePanel';
import Toggle from '@/components/ui/Toggle';
import NumberInput from '@/components/ui/NumberInput';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import StickyActionBar from '@/components/ui/StickyActionBar';
import { InfoChip } from '@/components/ui/StatusBadge';

// Feature icons for showing inside preset chips
const FEATURE_ICONS: Partial<Record<keyof FeatureFlags, React.ReactNode>> = {
  delivery_date: <CalendarDays className="w-3 h-3" />,
  delivery_zone: <MapPin className="w-3 h-3" />,
  delivery_slot: <Clock className="w-3 h-3" />,
  billing_cycle: <CreditCard className="w-3 h-3" />,
  marketplace_sync: <ShoppingCart className="w-3 h-3" />,
  pos: <Monitor className="w-3 h-3" />,
  consignment: <Handshake className="w-3 h-3" />,
  product_brand: <Tag className="w-3 h-3" />,
  supplier: <Factory className="w-3 h-3" />,
  department_store: <PackageCheck className="w-3 h-3" />,
};

const FEATURE_SHORT: Partial<Record<keyof FeatureFlags, string>> = {
  delivery_date: 'วันส่ง',
  delivery_zone: 'พื้นที่ส่ง',
  delivery_slot: 'รอบส่ง',
  billing_cycle: 'วางบิล',
  marketplace_sync: 'Marketplace',
  pos: 'POS',
  consignment: 'ฝากขาย',
  product_brand: 'Brand',
  supplier: 'Supplier',
  department_store: 'ห้าง',
};

const PRESETS: { key: BusinessPreset; icon: React.ReactNode; label: string; desc: string }[] = [
  { key: 'delivery',          icon: <Truck className="w-5 h-5" />,      label: PRESET_LABELS.delivery,          desc: PRESET_DESCRIPTIONS.delivery },
  { key: 'ecommerce',         icon: <ShoppingCart className="w-5 h-5" />, label: PRESET_LABELS.ecommerce,       desc: PRESET_DESCRIPTIONS.ecommerce },
  { key: 'ecommerce_brand',   icon: <Layers className="w-5 h-5" />,     label: PRESET_LABELS.ecommerce_brand,   desc: PRESET_DESCRIPTIONS.ecommerce_brand },
  { key: 'omnichannel',       icon: <Store className="w-5 h-5" />,      label: PRESET_LABELS.omnichannel,       desc: PRESET_DESCRIPTIONS.omnichannel },
  { key: 'omnichannel_brand', icon: <Building className="w-5 h-5" />,   label: PRESET_LABELS.omnichannel_brand, desc: PRESET_DESCRIPTIONS.omnichannel_brand },
  { key: 'wholesale',         icon: <Warehouse className="w-5 h-5" />,  label: PRESET_LABELS.wholesale,         desc: PRESET_DESCRIPTIONS.wholesale },
  { key: 'distribution',      icon: <Users className="w-5 h-5" />,      label: PRESET_LABELS.distribution,      desc: PRESET_DESCRIPTIONS.distribution },
];

// ---- Feature definitions ----

interface FeatureSection {
  key: keyof FeatureFlags;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string; // tailwind text color when active
  comingSoon?: boolean;
  settings?: React.ReactNode; // rendered when feature is enabled
}

export default function FeaturesPage() {
  const { currentCompany, companyRoles, permissions } = useCompany();
  const { features: currentFeatures, gates, fetched: featuresFetched, refreshFeatures } = useFeatures();
  const { showToast } = useToast();

  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(currentFeatures);
  const [featuresLoaded, setFeaturesLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Consignment settings
  const [consignmentSettings, setConsignmentSettings] = useState({
    default_gp_rate: 30,
    default_gp_base_price: 'retail' as 'retail' | 'discounted',
    default_report_due_days: 15,
    default_payment_terms: 30,
    vat_included: true,
  });
  const [brandGpRows, setBrandGpRows] = useState<BrandGpRow[]>([]);

  // Track saved state to detect changes — null until first API load completes
  const savedRef = useRef<{ featureFlags: FeatureFlags; consignmentSettings: Record<string, unknown>; brandGpRows: string } | null>(null);

  // Sync from context
  useEffect(() => {
    if (featuresFetched && !featuresLoaded) {
      setFeatureFlags(currentFeatures);
      setFeaturesLoaded(true);
      apiFetch('/api/settings/features').then(r => r.json()).then(data => {
        const cs = data.consignment_settings || {};
        const bgr: BrandGpRow[] = (data.brand_gp_overrides || []).map((r: { brand_id: string; gp_rate: number; gp_base_price: string }) => ({
          brand_id: r.brand_id,
          gp_rate: String(r.gp_rate),
          gp_base_price: (r.gp_base_price || 'retail') as 'retail' | 'discounted',
        }));
        const loadedFlags = (data.features ?? currentFeatures) as FeatureFlags;
        setFeatureFlags(loadedFlags);
        if (data.consignment_settings) setConsignmentSettings(prev => ({ ...prev, ...cs }));
        setBrandGpRows(bgr);
        const snapshotCs = data.consignment_settings
          ? { ...{ default_gp_rate: 30, default_gp_base_price: 'retail', default_report_due_days: 15, default_payment_terms: 30, vat_included: true }, ...cs }
          : { default_gp_rate: 30, default_gp_base_price: 'retail', default_report_due_days: 15, default_payment_terms: 30, vat_included: true };
        savedRef.current = { featureFlags: loadedFlags, consignmentSettings: snapshotCs, brandGpRows: JSON.stringify(bgr) };
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
      if (key === 'consignment' && newValue) next.supplier = true;
      if (key === 'supplier' && !newValue) next.consignment = false;
      // Auto-expand when enabling a feature that has expandable settings
      if (newValue) setOpenSection(key);
      else setOpenSection(s => s === key ? null : s);
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
        body: JSON.stringify({
          features: featureFlags,
          consignment_settings: featureFlags.consignment ? consignmentSettings : null,
          brand_gp_overrides: featureFlags.consignment
            ? brandGpRows.filter(r => r.brand_id && r.gp_rate !== '').map(r => ({
                brand_id: r.brand_id,
                gp_rate: parseFloat(r.gp_rate),
                gp_base_price: r.gp_base_price,
              }))
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      showToast('บันทึก Feature เสริมสำเร็จ', 'success');
      await refreshFeatures();
      const fresh = await apiFetch('/api/settings/features').then(r => r.json()).catch(() => null);
      if (fresh) {
        const cs = fresh.consignment_settings || {};
        const bgr: BrandGpRow[] = (fresh.brand_gp_overrides || []).map((r: { brand_id: string; gp_rate: number; gp_base_price: string }) => ({
          brand_id: r.brand_id,
          gp_rate: String(r.gp_rate),
          gp_base_price: (r.gp_base_price || 'retail') as 'retail' | 'discounted',
        }));
        if (fresh.consignment_settings) setConsignmentSettings(prev => ({ ...prev, ...cs }));
        setBrandGpRows(bgr);
        savedRef.current = { featureFlags: (fresh.features ?? featureFlags) as FeatureFlags, consignmentSettings: cs, brandGpRows: JSON.stringify(bgr) };
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const isOwnerOrAdmin = can({ roles: companyRoles, permissions }, 'settings.access');

  const isDirty = featuresLoaded && savedRef.current !== null && (
    JSON.stringify(featureFlags) !== JSON.stringify(savedRef.current.featureFlags) ||
    JSON.stringify(consignmentSettings) !== JSON.stringify(savedRef.current.consignmentSettings) ||
    JSON.stringify(brandGpRows) !== savedRef.current.brandGpRows
  );

  // ---- Feature list ----
  const FEATURES: FeatureSection[] = [
    {
      key: 'stock',
      label: 'ระบบคลังสินค้า',
      description: 'ติดตามสต็อก, รับเข้า, ย้ายคลัง, แยกตามสาขา',
      icon: <Warehouse className="w-5 h-5" />,
      color: 'text-emerald-600',
    },
    {
      key: 'product_brand',
      label: 'แบรนด์สินค้า',
      description: 'จัดกลุ่มสินค้าตามแบรนด์',
      icon: <Tag className="w-5 h-5" />,
      color: 'text-pink-600',
    },
    {
      key: 'marketplace_sync',
      label: 'Marketplace',
      description: 'เชื่อมต่อ Shopee, Lazada, TikTok Shop ฯลฯ',
      icon: <ShoppingCart className="w-5 h-5" />,
      color: 'text-orange-500',
    },
    {
      key: 'pos',
      label: 'ระบบแคชเชียร์ - ขายหน้าร้าน',
      description: 'ระบบขายหน้าร้านสำหรับแคชเชียร์ (Point of Sale)',
      icon: <Monitor className="w-5 h-5" />,
      color: 'text-teal-600',
    },
    {
      key: 'supplier',
      label: 'ซัพพลายเออร์',
      description: 'จัดการ Supplier, ใบสั่งซื้อ (PO), รายงานฝากขาย',
      icon: <Factory className="w-5 h-5" />,
      color: 'text-slate-600',
    },
    {
      key: 'consignment',
      label: 'ฝากขาย (Consignment)',
      description: 'บริหารตัวแทนจำหน่ายแบบฝากขาย — DN (ม.78(3))',
      icon: <Handshake className="w-5 h-5" />,
      color: 'text-amber-600',
    },
    {
      key: 'department_store',
      label: 'ห้าง / Modern Trade',
      description: 'ลูกค้าห้าง Statement รายเดือน',
      icon: <PackageCheck className="w-5 h-5" />,
      color: 'text-purple-600',
    },
    {
      key: 'billing_cycle',
      label: 'วางบิล / เครดิต',
      description: 'ระบบวางบิลสิ้นเดือนสำหรับลูกค้าเครดิต',
      icon: <CreditCard className="w-5 h-5" />,
      color: 'text-violet-600',
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
            <div className="flex gap-6 items-start">

              {/* LEFT: Feature list — 60% */}
              <div className="flex-1 flex flex-col gap-3">
            {FEATURES.map((feat) => {
              const isEnabled = getFeatureValue(feat.key);
              const isOpen = openSection === feat.key;
              const lockReason = featureLockReason(feat.key, gates);
              const isLocked = lockReason !== null;

              // Consignment settings inline
              const hasInlineSettings = feat.key === 'consignment' && isEnabled;
              const hasExpandable = hasInlineSettings;

              return (
                <div
                  key={feat.key}
                  className={`card transition-all ${isEnabled ? 'ring-1 ring-primary/20' : ''} ${isLocked ? 'opacity-70' : ''}`}
                >
                  {/* Row: icon + label + toggle */}
                  <div className="flex items-center gap-4">
                    <div className={`flex-shrink-0 ${isEnabled ? feat.color : 'text-gray-400 dark:text-slate-500'}`}>
                      {feat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-base font-medium ${isEnabled ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-slate-300'}`}>
                          {feat.label}
                        </p>
                        {isLocked && (
                          <InfoChip className="border" colors="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-900/50" icon={<Lock className="w-3 h-3" />}>ต้องอัปเกรด</InfoChip>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-slate-400">
                        {isLocked ? lockReason : feat.description}
                      </p>
                    </div>

                    {/* Expand button (only when enabled + has settings) */}
                    {hasExpandable && (
                      <button
                        type="button"
                        onClick={() => setOpenSection(isOpen ? null : feat.key)}
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 transition-colors"
                      >
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}

                    {/* Toggle — local state only, save happens via the "บันทึก" button at the bottom */}
                    <span title={isLocked ? lockReason : undefined} className="flex-shrink-0">
                      <Toggle
                        checked={isEnabled}
                        onChange={() => toggleFeature(feat.key)}
                        disabled={!isOwnerOrAdmin || isLocked}
                      />
                    </span>
                  </div>

                  {/* Expandable: consignment settings */}
                  {hasInlineSettings && isOpen && (
                    <ConsignmentSettingsPanel
                      settings={consignmentSettings}
                      onChange={(patch) => setConsignmentSettings(prev => ({ ...prev, ...patch }))}
                      brandGpRows={brandGpRows}
                      onBrandGpRowsChange={setBrandGpRows}
                      isOwnerOrAdmin={isOwnerOrAdmin}
                    />
                  )}
                </div>
              );
            })}

            {/* ช่องในการ์ด "จัดส่ง" ของฟอร์มเปิดบิล — สามแถว สามชิป ไม่มีพับเก็บ
                (เดิมเป็นสองการ์ด + ตัวเลือกย่อยที่ซ่อนอยู่ในปุ่มกาง ผู้ใช้หาไม่เจอ) */}
            <DeliveryFieldsCard
              flags={featureFlags}
              onChange={setFeatureFlags}
              gates={gates}
              canEdit={isOwnerOrAdmin}
            />
              </div>{/* end feature list */}

              {/* RIGHT: Preset selector — 40% */}
              <div className="sticky top-4 flex flex-col gap-3" style={{ width: '40%', flexShrink: 0 }}>
                <div className="card">
                  <p className="text-base font-semibold text-gray-900 dark:text-white mb-0.5">รูปแบบธุรกิจ</p>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">เลือก preset เพื่อตั้งค่า features ทีเดียว หรือปรับแต่งเองทางซ้าย</p>
                  <div className="flex flex-col gap-2">
                    {PRESETS.map(({ key, icon, label, desc }) => {
                      const isSelected = detectPreset(featureFlags) === key;
                      // features that are ON in this preset
                      const presetFeatures = Object.entries(PRESET_DEFAULTS[key])
                        .filter(([, v]) => typeof v === 'object' && v !== null ? (v as { enabled: boolean }).enabled === true : v === true)
                        .map(([k]) => k as keyof FeatureFlags);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFeatureFlags(PRESET_DEFAULTS[key])}
                          disabled={!isOwnerOrAdmin}
                          className={`w-full flex flex-col gap-2 px-3 py-3 rounded-xl border-2 transition-all text-left outline-none focus:outline-none ${
                            isSelected
                              ? 'border-primary bg-orange-50 dark:bg-orange-900/20'
                              : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                          } ${!isOwnerOrAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`flex-shrink-0 ${isSelected ? 'text-primary' : 'text-gray-400 dark:text-slate-500'}`}>{icon}</div>
                            <span className={`text-base font-semibold flex-1 ${isSelected ? 'text-primary' : 'text-gray-800 dark:text-slate-200'}`}>{label}</span>
                            {isSelected && (
                              <div className="w-4 h-4 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <p className={`text-sm leading-snug ${isSelected ? 'text-orange-700 dark:text-orange-300' : 'text-gray-500 dark:text-slate-400'}`}>{desc}</p>
                          {presetFeatures.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {presetFeatures.map(fk => (
                                <InfoChip key={fk} colors={
                                  isSelected ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'
                                } icon={FEATURE_ICONS[fk]}>
                                  {FEATURE_SHORT[fk]}
                                </InfoChip>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {detectPreset(featureFlags) === null && (
                    <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">* ปรับแต่งเอง — ไม่ตรงกับ preset ใดๆ</p>
                  )}
                </div>
              </div>

            </div>{/* end flex */}

            {isOwnerOrAdmin && (
              <StickyActionBar
                saving={isSaving}
                dirty={isDirty}
                onSave={handleSave}
                onCancel={() => { setFeatureFlags(currentFeatures); setOpenSection(null); }}
              />
            )}
          </>
        )}
      </Container>
    </Layout>
  );
}

// ── Consignment settings sub-panel ────────────────────────────────────────

type ConsignmentSettingsData = {
  default_gp_rate: number;
  default_gp_base_price: 'retail' | 'discounted';
  default_report_due_days: number;
  default_payment_terms: number;
  vat_included: boolean;
};

function ConsignmentSettingsPanel({
  settings,
  onChange,
  brandGpRows,
  onBrandGpRowsChange,
  isOwnerOrAdmin,
}: {
  settings: ConsignmentSettingsData;
  onChange: (patch: Partial<ConsignmentSettingsData>) => void;
  brandGpRows: BrandGpRow[];
  onBrandGpRowsChange: (rows: BrandGpRow[]) => void;
  isOwnerOrAdmin: boolean;
}) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 space-y-4">

      {/* GP% section — default + brand breakdown together */}
      <GpOverridePanel
        mode="global"
        gpRate={settings.default_gp_rate}
        gpBasePrice={settings.default_gp_base_price}
        onGpRateChange={(v) => onChange({ default_gp_rate: v })}
        onGpBasePriceChange={(v) => onChange({ default_gp_base_price: v })}
        brandGpRows={brandGpRows}
        onBrandGpRowsChange={onBrandGpRowsChange}
        canEdit={isOwnerOrAdmin}
      />

      {/* Payment terms — separate group */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1">ส่งยอดภายใน</label>
          <div className="relative">
            <NumberInput
              value={settings.default_report_due_days}
              onChange={(n) => onChange({ default_report_due_days: n || 15 })}
              className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-amber-400"
              min="1" max="90"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">วัน</span>
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">หลังสิ้นเดือน</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1">ชำระภายใน</label>
          <div className="relative">
            <NumberInput
              value={settings.default_payment_terms}
              onChange={(n) => onChange({ default_payment_terms: n })}
              className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-amber-400"
              min="0" max="180"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">วัน</span>
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">หลังวางบิล</p>
        </div>
      </div>

      {/* VAT included */}
      <div className="flex items-center justify-between bg-amber-50/60 dark:bg-amber-900/10 rounded-lg px-4 py-3">
        <div>
          <p className="text-base font-medium text-gray-900 dark:text-white">ราคาตัวแทนรวม VAT แล้ว</p>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">ถ้าปิด = ราคาที่ตกลงยังไม่รวม VAT</p>
        </div>
        <Toggle
          checked={settings.vat_included}
          onChange={() => onChange({ vat_included: !settings.vat_included })}
        />
      </div>

    </div>
  );
}

// ── การจัดส่งของร้าน ──────────────────────────────────────────────────────
// สามแถว = สามช่องจริงในการ์ด "จัดส่ง" ของฟอร์มเปิดบิล แต่ละแถวเลือกได้ว่า
// ไม่แสดง / แสดง / บังคับกรอก — ไม่มีพับเก็บ เพราะของเดิมซ่อนตัวเลือกย่อยไว้ใน
// ปุ่มกางแล้วผู้ใช้หาไม่เจอ
//
// ⛔ ห้ามซ่อนแถวที่ยังเลือกไม่ได้ — แถวช่วงเวลาส่งต้องเห็นเสมอ แค่กดไม่ได้
//    พร้อมบอกเหตุผล ("ต้องเปิดวันที่ส่งของก่อน")

const modeChips = (ids: readonly DeliveryFieldMode[]): FilterChip<DeliveryFieldMode>[] =>
  ids.map(id => ({ id, label: DELIVERY_FIELD_MODE_LABELS[id], activeClass: FILTER_CHIP_PRIMARY_ACTIVE }));

const DATE_SLOT_CHIPS = modeChips(['off', 'optional', 'required']);
const ZONE_CHIPS = modeChips(['off', 'optional']);

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
  return (
    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
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
    <div className={`card transition-all ${anyOn ? 'ring-1 ring-primary/20' : ''}`}>
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

      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 space-y-2">
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
    </div>
  );
}
