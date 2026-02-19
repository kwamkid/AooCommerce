// Path: app/settings/company/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Layout from '@/components/layout/Layout';
import { useCompany } from '@/lib/company-context';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { PRESET_DEFAULTS, PRESET_LABELS, PRESET_DESCRIPTIONS, detectPreset, type BusinessPreset, type FeatureFlags } from '@/lib/features';
import {
  Building2, FileText, Phone, Mail, MapPin, Receipt, Upload, X,
  AlertCircle, Loader2, Save,
  Truck, ShoppingBag, Store, CalendarDays, CreditCard, ShoppingCart, Monitor, Handshake, Tag,
} from 'lucide-react';

interface CompanyData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  tax_company_name: string | null;
  tax_branch: string | null;
  logo_url: string | null;
}

// --- Business Mode configs ---
const PRESETS: { key: BusinessPreset; icon: React.ReactNode }[] = [
  { key: 'delivery', icon: <Truck className="w-7 h-7" /> },
  { key: 'ecommerce', icon: <ShoppingBag className="w-7 h-7" /> },
  { key: 'omnichannel', icon: <Store className="w-7 h-7" /> },
];

interface FeatureConfig {
  key: keyof FeatureFlags;
  label: string;
  description: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
  hasRequired?: boolean;
}

const FEATURE_CONFIGS: FeatureConfig[] = [
  { key: 'customer_branches', label: 'สาขาลูกค้า', description: 'ลูกค้าที่มีหลายสาขา', icon: <Building2 className="w-5 h-5" /> },
  { key: 'delivery_date', label: 'ธุรกิจเดลิเวอรี่', description: 'กำหนดวันส่งของ และเมนูจัดของเตรียมส่ง & คิวคนขับรถ', icon: <CalendarDays className="w-5 h-5" />, hasRequired: true },
  { key: 'billing_cycle', label: 'วางบิล / เครดิต', description: 'ระบบวางบิลสิ้นเดือน', icon: <CreditCard className="w-5 h-5" /> },
  { key: 'marketplace_sync', label: 'Marketplace', description: 'เชื่อม Shopee, Lazada ฯลฯ', icon: <ShoppingCart className="w-5 h-5" /> },
  { key: 'pos', label: 'POS', description: 'ขายหน้าร้าน', icon: <Monitor className="w-5 h-5" /> },
  { key: 'consignment', label: 'ฝากขาย', description: 'Consignment', icon: <Handshake className="w-5 h-5" />, comingSoon: true },
  { key: 'product_brand', label: 'แบรนด์สินค้า', description: 'จัดกลุ่มสินค้าตามแบรนด์', icon: <Tag className="w-5 h-5" /> },
];

export default function CompanySettingsPage() {
  const { currentCompany, companyRoles, refreshCompanies } = useCompany();
  const { session } = useAuth();
  const { features: currentFeatures, fetched: featuresFetched, refreshFeatures } = useFeatures();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Company form state
  const [formData, setFormData] = useState({
    name: '', description: '', phone: '', email: '', address: '',
    taxId: '', taxCompanyName: '', taxBranch: '',
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Business mode state — preset is derived from features, not stored
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(currentFeatures);
  const [featuresLoaded, setFeaturesLoaded] = useState(false);

  // Sync features from context — wait until API data is actually fetched
  useEffect(() => {
    if (featuresFetched && !featuresLoaded) {
      setFeatureFlags(currentFeatures);
      setFeaturesLoaded(true);
    }
  }, [featuresFetched, currentFeatures, featuresLoaded]);

  // Fetch company data
  useFetchOnce(async () => {
    try {
      const response = await apiFetch('/api/companies');
      const data = await response.json();
      if (response.ok && data.companies) {
        const company = data.companies.find(
          (m: { company_id: string; company: CompanyData }) => m.company_id === currentCompany!.id
        )?.company as CompanyData | undefined;
        if (company) {
          setFormData({
            name: company.name || '', description: company.description || '',
            phone: company.phone || '', email: company.email || '',
            address: company.address || '', taxId: company.tax_id || '',
            taxCompanyName: company.tax_company_name || '', taxBranch: company.tax_branch || '',
          });
          setLogoUrl(company.logo_url);
        }
      }
    } catch {
      setError('ไม่สามารถโหลดข้อมูลบริษัทได้');
    } finally {
      setIsLoading(false);
    }
  }, !!currentCompany?.id);

  // --- Business mode helpers ---
  const derivedPreset = detectPreset(featureFlags);
  const isCustom = derivedPreset === null;

  const handlePresetSelect = (preset: BusinessPreset) => {
    setFeatureFlags(PRESET_DEFAULTS[preset]);
  };

  const toggleFeature = (key: keyof FeatureFlags) => {
    setFeatureFlags(prev => {
      if (key === 'delivery_date') {
        const dd = prev.delivery_date;
        return { ...prev, delivery_date: { enabled: !dd.enabled, required: !dd.enabled ? dd.required : false } };
      }
      return { ...prev, [key]: !prev[key as keyof Omit<FeatureFlags, 'delivery_date'>] };
    });
  };

  const toggleDeliveryDateRequired = () => {
    setFeatureFlags(prev => ({
      ...prev,
      delivery_date: { ...prev.delivery_date, required: !prev.delivery_date.required },
    }));
  };

  const getFeatureValue = (key: keyof FeatureFlags): boolean => {
    if (key === 'delivery_date') return featureFlags.delivery_date.enabled;
    return featureFlags[key] as boolean;
  };

  // --- Logo handlers ---
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUploadLogo = async () => {
    if (!logoFile || !currentCompany?.id || !session?.access_token) return;
    setIsUploadingLogo(true);
    try {
      const logoFormData = new FormData();
      logoFormData.append('file', logoFile);
      logoFormData.append('companyId', currentCompany.id);
      const response = await fetch('/api/companies/logo', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: logoFormData,
      });
      const result = await response.json();
      if (response.ok && result.logoUrl) {
        setLogoUrl(result.logoUrl);
        setLogoFile(null);
        setLogoPreview(null);
        await refreshCompanies();
      } else {
        setError(result.error || 'ไม่สามารถอัพโหลดโลโก้ได้');
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการอัพโหลดโลโก้');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // --- Submit all (company info + features) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      showToast('กรุณาระบุชื่อบริษัท', 'error');
      return;
    }
    if (!currentCompany?.id) return;

    setIsSaving(true);
    try {
      // Save company info + features in parallel
      const [companyRes, featuresRes] = await Promise.all([
        apiFetch('/api/companies', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentCompany.id,
            name: formData.name,
            description: formData.description || undefined,
            phone: formData.phone || undefined,
            email: formData.email || undefined,
            address: formData.address || undefined,
            taxId: formData.taxId || undefined,
            taxCompanyName: formData.taxCompanyName || undefined,
            taxBranch: formData.taxBranch || undefined,
          }),
        }),
        apiFetch('/api/settings/features', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preset: derivedPreset || 'custom', features: featureFlags }),
        }),
      ]);

      const companyResult = await companyRes.json();
      const featuresResult = await featuresRes.json();

      if (!companyRes.ok) throw new Error(companyResult.error || 'ไม่สามารถบันทึกข้อมูลบริษัทได้');
      if (!featuresRes.ok) throw new Error(featuresResult.error || 'ไม่สามารถบันทึก features ได้');

      showToast('บันทึกสำเร็จ', 'success');

      await Promise.all([refreshCompanies(), refreshFeatures()]);

      if (logoFile) await handleUploadLogo();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Check permissions
  const isOwnerOrAdmin = companyRoles.includes('owner') || companyRoles.includes('admin');

  if (!isOwnerOrAdmin && !isLoading) {
    return (
      <Layout title="ข้อมูลบริษัท" breadcrumbs={[{ label: 'ตั้งค่า', href: '/settings' }, { label: 'ข้อมูลบริษัท' }]}>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">ไม่มีสิทธิ์เข้าถึง</h3>
          <p className="text-gray-500 dark:text-slate-400">เฉพาะเจ้าของและผู้ดูแลระบบเท่านั้นที่สามารถแก้ไขข้อมูลบริษัทได้</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="ข้อมูลบริษัท" breadcrumbs={[{ label: 'ตั้งค่า', href: '/settings' }, { label: 'ข้อมูลบริษัท' }]}>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#F4511E]" />
          <span className="ml-3 text-gray-500 dark:text-slate-400">กำลังโหลดข้อมูล...</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Error alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* 2-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* === LEFT COLUMN: Company Info === */}
            <div className="space-y-6">
              {/* Logo */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">โลโก้บริษัท</h3>
                <div className="flex items-center space-x-4">
                  {logoPreview || logoUrl ? (
                    <div className="relative">
                      <img src={logoPreview || logoUrl || ''} alt="โลโก้" className="w-20 h-20 rounded-lg object-cover border-2 border-gray-200 dark:border-slate-600" />
                      {logoPreview && (
                        <button type="button" onClick={removeLogo} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 dark:text-slate-500">
                      <Building2 className="w-7 h-7 mb-1" />
                      <span className="text-[10px]">ไม่มีโลโก้</span>
                    </div>
                  )}
                  <div>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors flex items-center">
                      <Upload className="w-4 h-4 mr-2" />
                      เลือกรูป
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">JPG, PNG แนะนำ 200x200px</p>
                  </div>
                  {logoPreview && (
                    <button type="button" onClick={handleUploadLogo} disabled={isUploadingLogo} className="px-3 py-2 bg-[#F4511E] text-white rounded-lg text-sm font-medium hover:bg-[#F4511E]/90 disabled:opacity-50 flex items-center">
                      {isUploadingLogo ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                      อัพโหลด
                    </button>
                  )}
                </div>
              </div>

              {/* General Info */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">ข้อมูลทั่วไป</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อบริษัท <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E]" placeholder="ชื่อบริษัท" required disabled={isSaving} />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">คำอธิบาย</label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                      <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E] resize-none" placeholder="อธิบายเกี่ยวกับธุรกิจ" rows={3} disabled={isSaving} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">โทรศัพท์</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E]" placeholder="0xx-xxx-xxxx" disabled={isSaving} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">อีเมล</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E]" placeholder="company@email.com" disabled={isSaving} />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                      <textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E] resize-none" placeholder="ที่อยู่บริษัท" rows={2} disabled={isSaving} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Tax Info */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <Receipt className="w-5 h-5 mr-2 text-[#F4511E]" />
                  ข้อมูลใบกำกับภาษี
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เลขประจำตัวผู้เสียภาษี</label>
                    <input type="text" value={formData.taxId} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E]" placeholder="13 หลัก" disabled={isSaving} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">สาขา</label>
                    <input type="text" value={formData.taxBranch} onChange={(e) => setFormData({ ...formData, taxBranch: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E]" placeholder="สำนักงานใหญ่" disabled={isSaving} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อบริษัท (ใบกำกับภาษี)</label>
                    <input type="text" value={formData.taxCompanyName} onChange={(e) => setFormData({ ...formData, taxCompanyName: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E]" placeholder="ชื่อตามจดทะเบียน (ถ้าต่างจากชื่อบริษัท)" disabled={isSaving} />
                  </div>
                </div>
              </div>
            </div>

            {/* === RIGHT COLUMN: Business Mode === */}
            <div className="space-y-6">
              {/* Preset Selector */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">ประเภทธุรกิจ</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">เลือก preset แล้วปรับแต่งด้านล่าง</p>

                <div className="grid grid-cols-3 gap-3">
                  {PRESETS.map(({ key, icon }) => {
                    const isSelected = derivedPreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        title={PRESET_DESCRIPTIONS[key]}
                        onClick={() => handlePresetSelect(key)}
                        className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/20'
                            : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                        }`}
                      >
                        <div className={isSelected ? 'text-[#F4511E]' : 'text-gray-400 dark:text-slate-500'}>{icon}</div>
                        <span className={`font-medium text-sm ${isSelected ? 'text-[#F4511E]' : 'text-gray-700 dark:text-slate-300'}`}>
                          {PRESET_LABELS[key]}
                        </span>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-[#F4511E] rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {isCustom && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">* ปรับแต่งเอง — ไม่ตรงกับ preset ใดๆ</p>
                )}
              </div>

              {/* Feature Toggles */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">ปรับแต่ง Features</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">เปิด/ปิดตามความต้องการ</p>

                <div className="space-y-3">
                  {FEATURE_CONFIGS.map((config) => {
                    const isEnabled = getFeatureValue(config.key);
                    const isComingSoon = config.comingSoon;

                    return (
                      <div key={config.key} className="border border-gray-100 dark:border-slate-700 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`flex-shrink-0 ${isEnabled && !isComingSoon ? 'text-[#F4511E]' : 'text-gray-400 dark:text-slate-500'}`}>
                              {config.icon}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900 dark:text-white">{config.label}</span>
                                {isComingSoon && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400">
                                    เร็วๆ นี้
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500 dark:text-slate-400">{config.description}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => !isComingSoon && toggleFeature(config.key)}
                            disabled={isComingSoon}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                              isComingSoon ? 'bg-gray-200 dark:bg-slate-700 cursor-not-allowed opacity-50'
                                : isEnabled ? 'bg-[#F4511E]' : 'bg-gray-300 dark:bg-slate-600'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>

                        {config.hasRequired && isEnabled && (
                          <div className="mt-3 ml-7 flex items-center justify-between bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3">
                            <span className="text-sm text-gray-700 dark:text-slate-300">บังคับกรอก</span>
                            <button
                              type="button"
                              onClick={toggleDeliveryDateRequired}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                featureFlags.delivery_date.required ? 'bg-[#F4511E]' : 'bg-gray-300 dark:bg-slate-600'
                              }`}
                            >
                              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${featureFlags.delivery_date.required ? 'translate-x-5' : 'translate-x-1'}`} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end mt-6">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isSaving ? (
                <><Loader2 className="w-5 h-5 animate-spin mr-2" />กำลังบันทึก...</>
              ) : (
                <><Save className="w-5 h-5 mr-2" />บันทึกข้อมูล</>
              )}
            </button>
          </div>
        </form>
      )}
    </Layout>
  );
}
