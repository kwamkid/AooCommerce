// Path: app/settings/features/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { useCompany } from '@/lib/company-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { type FeatureFlags, PRESET_DEFAULTS, PRESET_LABELS, PRESET_DESCRIPTIONS, detectPreset, type BusinessPreset } from '@/lib/features';
import {
  CalendarDays, ShoppingCart, Monitor, Handshake, Tag, Factory,
  PackageCheck, Loader2, Save, ChevronDown, ChevronUp,
  CreditCard, Building2, Truck, Store, Layers, Users, Warehouse, Building, Award,
} from 'lucide-react';
import BrandGpCommissions, { GpBaseRadio, type BrandGpRow } from '@/components/customers/BrandGpCommissions';

// Feature icons for showing inside preset chips
const FEATURE_ICONS: Partial<Record<keyof FeatureFlags, React.ReactNode>> = {
  customer_branches: <Building2 className="w-3 h-3" />,
  delivery_date: <CalendarDays className="w-3 h-3" />,
  billing_cycle: <CreditCard className="w-3 h-3" />,
  marketplace_sync: <ShoppingCart className="w-3 h-3" />,
  pos: <Monitor className="w-3 h-3" />,
  consignment: <Handshake className="w-3 h-3" />,
  product_brand: <Tag className="w-3 h-3" />,
  supplier: <Factory className="w-3 h-3" />,
  department_store: <PackageCheck className="w-3 h-3" />,
};

const FEATURE_SHORT: Partial<Record<keyof FeatureFlags, string>> = {
  customer_branches: 'สาขา',
  delivery_date: 'วันส่ง',
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
  hasRequired?: boolean; // for delivery_date sub-toggle
  settings?: React.ReactNode; // rendered when feature is enabled
}

export default function FeaturesPage() {
  const { currentCompany, companyRoles } = useCompany();
  const { features: currentFeatures, fetched: featuresFetched, refreshFeatures } = useFeatures();
  const { showToast } = useToast();

  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(currentFeatures);
  const [featuresLoaded, setFeaturesLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Consignment settings
  const [consignmentSettings, setConsignmentSettings] = useState({
    default_mode: 'dn' as 'dn' | 'invoice',
    default_gp_rate: 30,
    default_gp_base_price: 'retail' as 'retail' | 'discounted',
    default_report_due_days: 15,
    default_payment_terms: 30,
    vat_included: true,
  });
  const [brandGpRows, setBrandGpRows] = useState<BrandGpRow[]>([]);

  // Sync from context
  useEffect(() => {
    if (featuresFetched && !featuresLoaded) {
      setFeatureFlags(currentFeatures);
      setFeaturesLoaded(true);
      apiFetch('/api/settings/features').then(r => r.json()).then(data => {
        if (data.consignment_settings) {
          setConsignmentSettings(prev => ({ ...prev, ...data.consignment_settings }));
        }
        if (data.brand_gp_overrides) {
          setBrandGpRows(data.brand_gp_overrides.map((r: { brand_id: string; gp_rate: number; gp_base_price: string }) => ({
            brand_id: r.brand_id,
            gp_rate: String(r.gp_rate),
            gp_base_price: r.gp_base_price || 'retail',
          })));
        }
      }).catch(() => {});
    }
  }, [featuresFetched, currentFeatures, featuresLoaded]);

  const getFeatureValue = (key: keyof FeatureFlags): boolean => {
    if (key === 'delivery_date') return featureFlags.delivery_date.enabled;
    return featureFlags[key] as boolean;
  };

  const toggleFeature = (key: keyof FeatureFlags) => {
    setFeatureFlags(prev => {
      if (key === 'delivery_date') {
        const dd = prev.delivery_date;
        const enabling = !dd.enabled;
        if (enabling) setOpenSection(key);
        else setOpenSection(s => s === key ? null : s);
        return { ...prev, delivery_date: { enabled: enabling, required: enabling ? dd.required : false } };
      }
      const newValue = !prev[key as keyof Omit<FeatureFlags, 'delivery_date'>];
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
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const isOwnerOrAdmin = companyRoles.includes('owner') || companyRoles.includes('admin');

  // ---- Feature list ----
  const FEATURES: FeatureSection[] = [
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
      label: 'POS — ขายหน้าร้าน',
      description: 'ระบบ Point of Sale สำหรับขายหน้าร้านและแคชเชียร์',
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
      description: 'บริหารตัวแทนจำหน่ายแบบฝากขาย — DN / Invoice',
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
    {
      key: 'delivery_date',
      label: 'ธุรกิจเดลิเวอรี่',
      description: 'กำหนดวันส่งของ และเมนูจัดของเตรียมส่ง & คิวคนขับรถ',
      icon: <CalendarDays className="w-5 h-5" />,
      color: 'text-blue-600',
      hasRequired: true,
    },
    {
      key: 'customer_branches',
      label: 'สาขาลูกค้า',
      description: 'เปิดบิลเดียว ส่งหลายสาขา',
      icon: <Building2 className="w-5 h-5" />,
      color: 'text-cyan-600',
    },
  ];

  if (!isOwnerOrAdmin && featuresLoaded) {
    return (
      <Layout title="Feature เสริม" breadcrumbs={[{ label: 'ตั้งค่า', href: '/settings' }, { label: 'Feature เสริม' }]}>
        <div className="card text-center py-12">
          <p className="text-gray-500 dark:text-slate-400">เฉพาะเจ้าของและผู้ดูแลระบบเท่านั้น</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Feature เสริม" breadcrumbs={[{ label: 'ตั้งค่า', href: '/settings' }, { label: 'Feature เสริม' }]}>
      <div className="space-y-4">

        {!featuresLoaded ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-[#F4511E]" />
          </div>
        ) : (
          <>
            <div className="flex gap-6 items-start">

              {/* LEFT: Feature list — 60% */}
              <div className="flex-1 flex flex-col gap-3">
            {FEATURES.map((feat) => {
              const isEnabled = getFeatureValue(feat.key);
              const isOpen = openSection === feat.key;

              // Consignment settings inline
              const hasInlineSettings = feat.key === 'consignment' && isEnabled;
              const hasDeliveryRequired = feat.key === 'delivery_date' && isEnabled;
              const hasExpandable = hasInlineSettings || hasDeliveryRequired;

              return (
                <div
                  key={feat.key}
                  className={`card transition-all ${isEnabled ? 'ring-1 ring-[#F4511E]/20' : ''}`}
                >
                  {/* Row: icon + label + toggle */}
                  <div className="flex items-center gap-4">
                    <div className={`flex-shrink-0 ${isEnabled ? feat.color : 'text-gray-400 dark:text-slate-500'}`}>
                      {feat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-base font-medium ${isEnabled ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-slate-300'}`}>
                        {feat.label}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-slate-400">{feat.description}</p>
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

                    {/* Toggle */}
                    <button
                      type="button"
                      disabled={!isOwnerOrAdmin}
                      onClick={() => toggleFeature(feat.key)}
                      className={`relative flex-shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isEnabled ? 'bg-[#F4511E]' : 'bg-gray-300 dark:bg-slate-600'
                      } ${!isOwnerOrAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Expandable: delivery_date required sub-toggle */}
                  {hasDeliveryRequired && isOpen && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                      <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-700/50 rounded-lg px-4 py-3">
                        <div>
                          <p className="text-base font-medium text-gray-900 dark:text-white">บังคับกรอกวันส่ง</p>
                          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">ถ้าปิด — กรอกหรือไม่กรอกก็ได้</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFeatureFlags(prev => ({
                            ...prev,
                            delivery_date: { ...prev.delivery_date, required: !prev.delivery_date.required },
                          }))}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            featureFlags.delivery_date.required ? 'bg-blue-500' : 'bg-gray-300 dark:bg-slate-600'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${featureFlags.delivery_date.required ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>
                  )}

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
                        .filter(([k, v]) => k !== 'delivery_date' ? v === true : (v as { enabled: boolean }).enabled === true)
                        .map(([k]) => k as keyof FeatureFlags);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFeatureFlags(PRESET_DEFAULTS[key])}
                          disabled={!isOwnerOrAdmin}
                          className={`w-full flex flex-col gap-2 px-3 py-3 rounded-xl border-2 transition-all text-left outline-none focus:outline-none ${
                            isSelected
                              ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/20'
                              : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                          } ${!isOwnerOrAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`flex-shrink-0 ${isSelected ? 'text-[#F4511E]' : 'text-gray-400 dark:text-slate-500'}`}>{icon}</div>
                            <span className={`text-base font-semibold flex-1 ${isSelected ? 'text-[#F4511E]' : 'text-gray-800 dark:text-slate-200'}`}>{label}</span>
                            {isSelected && (
                              <div className="w-4 h-4 bg-[#F4511E] rounded-full flex items-center justify-center flex-shrink-0">
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
                                <span key={fk} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                  isSelected ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'
                                }`}>
                                  {FEATURE_ICONS[fk]}
                                  {FEATURE_SHORT[fk]}
                                </span>
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

            {/* Save button */}
            {isOwnerOrAdmin && (
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setFeatureFlags(currentFeatures); setOpenSection(null); }}
                  disabled={isSaving}
                  className="px-6 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 font-semibold rounded-lg transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  บันทึก
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

// ── Consignment settings sub-panel ────────────────────────────────────────

type ConsignmentSettingsData = {
  default_mode: 'dn' | 'invoice';
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
  const [gpExpanded, setGpExpanded] = useState(false);

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 space-y-4">

      {/* Mode */}
      <div>
        <p className="text-sm font-medium text-gray-600 dark:text-slate-400 mb-2">โหมดฝากขาย Default</p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: 'dn', label: 'ฝากขาย (DN)', desc: 'ม.78(3) — VAT เมื่อขายได้' },
            { key: 'invoice', label: 'เครดิตตัวแทน', desc: 'Invoice ทันที VAT upfront' },
          ] as const).map(({ key, label, desc }) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ default_mode: key })}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                settings.default_mode === key
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                  : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
              }`}
            >
              <p className={`text-base font-medium ${settings.default_mode === key ? 'text-amber-700 dark:text-amber-400' : 'text-gray-700 dark:text-slate-300'}`}>
                {label}
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-500 mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* GP% section — default + brand breakdown together */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 overflow-hidden">

        {/* GP% Default row */}
        <div className="flex items-center gap-4 px-4 py-3 bg-amber-50/40 dark:bg-amber-900/10">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">GP% Default</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">ใช้เมื่อไม่มีค่าเฉพาะแบรนด์หรือลูกค้า</p>
          </div>
          <GpBaseRadio
            name="default_gp_base_price"
            value={settings.default_gp_base_price}
            onChange={(v) => onChange({ default_gp_base_price: v })}
          />
          <div className="relative w-24 flex-shrink-0">
            <input
              type="number"
              value={settings.default_gp_rate}
              onChange={(e) => onChange({ default_gp_rate: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-1.5 pr-7 border border-amber-300 dark:border-amber-700/50 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-400"
              min="0" max="100" step="0.5"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
        </div>

        {/* Expand: GP% เฉพาะแบรนด์ */}
        <button
          type="button"
          onClick={() => setGpExpanded(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 border-t border-amber-200 dark:border-amber-800/50 hover:bg-amber-50/60 dark:hover:bg-amber-900/10 transition-colors text-left"
        >
          <span className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <Award className="w-4 h-4" />
            GP% เฉพาะแบรนด์
            <span className="text-xs font-normal text-gray-400 dark:text-slate-500">(override ต่อแบรนด์)</span>
          </span>
          {gpExpanded
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />
          }
        </button>

        {gpExpanded && (
          <div className="border-t border-amber-200 dark:border-amber-800/50 px-4 py-3">
            <BrandGpCommissions
              mode="global"
              rows={brandGpRows}
              onRowsChange={onBrandGpRowsChange}
              canEdit={isOwnerOrAdmin}
            />
          </div>
        )}
      </div>

      {/* Payment terms — separate group */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1">ส่งยอดภายใน</label>
          <div className="relative">
            <input
              type="number"
              value={settings.default_report_due_days}
              onChange={(e) => onChange({ default_report_due_days: parseInt(e.target.value) || 15 })}
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
            <input
              type="number"
              value={settings.default_payment_terms}
              onChange={(e) => onChange({ default_payment_terms: parseInt(e.target.value) || 30 })}
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
        <button
          type="button"
          onClick={() => onChange({ vat_included: !settings.vat_included })}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
            settings.vat_included ? 'bg-amber-500' : 'bg-gray-300 dark:bg-slate-600'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.vat_included ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

    </div>
  );
}
