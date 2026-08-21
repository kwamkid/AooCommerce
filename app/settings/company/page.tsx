// Path: app/settings/company/page.tsx
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import StickyActionBar from '@/components/ui/StickyActionBar';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Layout from '@/components/layout/Layout';
import { useCompany } from '@/lib/company-context';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { Building2, FileText, Phone, Mail, MapPin, Receipt, Upload, X, AlertCircle, User, Briefcase, Landmark, Plus, Edit2, Trash2 } from 'lucide-react';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Tabs from '@/components/ui/Tabs';
import Modal from '@/components/ui/Modal';
import FormInput from '@/components/ui/FormInput';
import ListRow from '@/components/ui/ListRow';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';

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
  business_type: string | null;
  vat_registered: boolean | null;
}


export default function CompanySettingsPage() {
  const { currentCompany, companyRoles, refreshCompanies } = useCompany();
  const { session } = useAuth();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ phone?: string; email?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Company form state
  const [formData, setFormData] = useState({
    name: '', description: '', phone: '', email: '', address: '',
    district: '', amphoe: '', province: '', postalCode: '',
    taxId: '', taxCompanyName: '', taxBranch: '',
    businessType: 'individual' as string,
    vatRegistered: false,
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const initialFormRef = useRef(formData);
  const formRef = useRef<HTMLFormElement>(null);
  // มีอะไรเปลี่ยนรอบันทึกอยู่ไหม — รวมรูปโลโก้ที่เลือกไว้แต่ยังไม่อัปโหลดด้วย
  const isDirty = useMemo(
    () => !!logoFile || JSON.stringify(formData) !== JSON.stringify(initialFormRef.current),
    [formData, logoFile],
  );

  // ── Tax branches (VAT-registered branches for POS receipt routing) ──
  // Self-contained section: fetches independently when VAT is enabled and
  // saves each action immediately (separate from the main form's save flow).
  interface TaxBranchRow {
    id: string;
    code: string;
    name: string;
    address: string | null;
    is_default: boolean;
    sort_order: number;
  }
  const [branches, setBranches] = useState<TaxBranchRow[]>([]);
  const [branchModalMode, setBranchModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingBranch, setEditingBranch] = useState<TaxBranchRow | null>(null);
  const [branchForm, setBranchForm] = useState({ code: '', name: '', address: '' });
  const [savingBranch, setSavingBranch] = useState(false);
  const [reorderingBranch, setReorderingBranch] = useState(false);
  const [deleteBranchTarget, setDeleteBranchTarget] = useState<TaxBranchRow | null>(null);
  const [deletingBranch, setDeletingBranch] = useState(false);

  const loadBranches = async () => {
    try {
      const res = await apiFetch('/api/settings/tax-branches');
      if (!res.ok) return;
      const data = await res.json();
      setBranches((data.branches || []) as TaxBranchRow[]);
    } catch {
      // Silent — branches are optional and the page works without them
    }
  };

  const openCreateBranch = () => {
    // Suggest next 5-digit code following existing branches
    const maxCode = branches.reduce((m, b) => {
      const n = parseInt(b.code, 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, -1);
    const next = String(Math.max(0, maxCode + 1)).padStart(5, '0');
    setEditingBranch(null);
    setBranchForm({
      code: next,
      name: next === '00000' ? 'สำนักงานใหญ่' : `สาขาที่ ${parseInt(next, 10)}`,
      address: '',
    });
    setBranchModalMode('create');
  };

  const openEditBranch = (b: TaxBranchRow) => {
    setEditingBranch(b);
    setBranchForm({ code: b.code, name: b.name, address: b.address || '' });
    setBranchModalMode('edit');
  };

  const handleSaveBranch = async () => {
    if (!branchForm.name.trim() || !branchForm.code.trim()) {
      showToast('กรุณากรอกรหัสและชื่อสาขา', 'error');
      return;
    }
    setSavingBranch(true);
    try {
      const isEdit = branchModalMode === 'edit';
      const payload = isEdit
        ? { id: editingBranch!.id, name: branchForm.name.trim(), address: branchForm.address.trim() || null }
        : { code: branchForm.code.trim(), name: branchForm.name.trim(), address: branchForm.address.trim() || null };
      const res = await apiFetch('/api/settings/tax-branches', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      setBranchModalMode(null);
      await loadBranches();
      showToast(isEdit ? 'แก้ไขสาขาสำเร็จ' : 'เพิ่มสาขาสำเร็จ');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSavingBranch(false);
    }
  };

  const handleDeleteBranch = async () => {
    if (!deleteBranchTarget) return;
    setDeletingBranch(true);
    try {
      const res = await apiFetch(`/api/settings/tax-branches?id=${deleteBranchTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
      setDeleteBranchTarget(null);
      await loadBranches();
      showToast('ลบสาขาสำเร็จ');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ลบไม่สำเร็จ', 'error');
    } finally {
      setDeletingBranch(false);
    }
  };

  const handleMoveBranch = async (id: string, direction: 'up' | 'down') => {
    const idx = branches.findIndex(b => b.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= branches.length) return;
    const newList = [...branches];
    [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
    const reordered = newList.map((b, i) => ({ ...b, sort_order: i }));
    setBranches(reordered);
    setReorderingBranch(true);
    try {
      await apiFetch('/api/settings/tax-branches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: reordered.map((b, i) => ({ id: b.id, sort_order: i })) }),
      });
    } catch {
      showToast('บันทึกลำดับไม่สำเร็จ', 'error');
      loadBranches();
    } finally {
      setReorderingBranch(false);
    }
  };

  // Fetch branches whenever VAT registration is enabled (or page mounts with it on)
  useEffect(() => {
    if (formData.vatRegistered) loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.vatRegistered]);


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
          // Parse address — if stored as JSON in settings, use structured; otherwise use as street
          const companyAny = company as CompanyData & { settings?: Record<string, unknown> };
          const settings = companyAny.settings || {};
          const loaded = {
            name: company.name || '', description: company.description || '',
            phone: company.phone || '', email: company.email || '',
            address: company.address || '',
            district: (settings.district as string) || '',
            amphoe: (settings.amphoe as string) || '',
            province: (settings.province as string) || '',
            postalCode: (settings.postal_code as string) || '',
            taxId: company.tax_id || '',
            taxCompanyName: company.tax_company_name || '', taxBranch: company.tax_branch || '',
            businessType: company.business_type || 'individual',
            vatRegistered: company.vat_registered || false,
          };
          setFormData(loaded);
          initialFormRef.current = loaded;
          setLogoUrl(company.logo_url);
        }
      }
    } catch {
      setError('ไม่สามารถโหลดข้อมูลร้านค้าได้');
    } finally {
      setIsLoading(false);
    }
  }, !!currentCompany?.id);

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
    }
  };

  // --- Inline validation helpers ---
  const validatePhone = (phone: string): string | null => {
    if (!phone) return null;
    const cleaned = phone.replace(/[\s\-()]/g, '');
    if (!/^(0[0-9]{8,9}|[0-9]{9,10})$/.test(cleaned)) {
      return 'เบอร์โทรไม่ถูกต้อง (เช่น 0812345678)';
    }
    return null;
  };

  const validateEmail = (email: string): string | null => {
    if (!email) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'รูปแบบอีเมลไม่ถูกต้อง';
    }
    return null;
  };

  const handlePhoneChange = (value: string) => {
    setFormData(prev => ({ ...prev, phone: value }));
    if (fieldErrors.phone) {
      setFieldErrors(prev => ({ ...prev, phone: validatePhone(value) || undefined }));
    }
  };

  const handleEmailChange = (value: string) => {
    setFormData(prev => ({ ...prev, email: value }));
    if (fieldErrors.email) {
      setFieldErrors(prev => ({ ...prev, email: validateEmail(value) || undefined }));
    }
  };

  // --- Submit all (company info + features) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      showToast('กรุณาระบุชื่อร้านค้า', 'error');
      return;
    }

    const phoneErr = validatePhone(formData.phone);
    const emailErr = validateEmail(formData.email);
    if (phoneErr || emailErr) {
      setFieldErrors({ phone: phoneErr || undefined, email: emailErr || undefined });
      return;
    }
    setFieldErrors({});

    if (!currentCompany?.id) return;

    setIsSaving(true);
    try {
      const companyRes = await apiFetch('/api/companies', {
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
          businessType: formData.businessType,
          vatRegistered: formData.vatRegistered,
          addressParts: {
            district: formData.district,
            amphoe: formData.amphoe,
            province: formData.province,
            postalCode: formData.postalCode,
          },
        }),
      });

      const companyResult = await companyRes.json();

      if (!companyRes.ok) throw new Error(companyResult.error || 'ไม่สามารถบันทึกข้อมูลร้านค้าได้');

      if (logoFile) await handleUploadLogo();

      showToast('บันทึกสำเร็จ', 'success');

      await refreshCompanies();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Check permissions
  const isOwnerOrAdmin = can(companyRoles, 'company.edit');

  if (!isOwnerOrAdmin && !isLoading) {
    return (
      <Layout>
        <NoPermissionCard subtitle="เฉพาะเจ้าของและผู้ดูแลระบบเท่านั้นที่สามารถแก้ไขข้อมูลร้านค้าได้" />
      </Layout>
    );
  }

  return (
    <Layout>
      <Container size="full">
        <PageHeader title="ตั้งค่า" subtitle="ตั้งค่าชื่อร้านค้า ที่อยู่ เลขประจำตัวผู้เสียภาษี และโลโก้" />
        <Tabs
          activeKey="company"
          tabs={[
            { key: 'company', label: 'ข้อมูลร้านค้า', href: '/settings/company' },
            { key: 'general', label: 'บิล และสินค้า', href: '/settings' },
          ]}
        />
      {isLoading ? (
        <LoadingCard />
      ) : (
        <form ref={formRef} onSubmit={handleSubmit}>
          {/* Error alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* 2-Column Layout */}
          <Container size="full">
              {/* Logo */}
              <Card padding="md">
                <h3 className="heading-3 mb-4">โลโก้ร้านค้า</h3>
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
                </div>
              </Card>

              {/* Business Type */}
              <Card padding="md">
                <h3 className="heading-3 mb-4">ประเภทกิจการ</h3>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { key: 'individual', label: 'บุคคลธรรมดา', icon: <User className="w-6 h-6" /> },
                    { key: 'corporation', label: 'บริษัท (บจก.)', icon: <Briefcase className="w-6 h-6" /> },
                    { key: 'partnership', label: 'ห้างหุ้นส่วน (หจก.)', icon: <Landmark className="w-6 h-6" /> },
                  ] as const).map(({ key, label, icon }) => {
                    const isSelected = formData.businessType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          businessType: key,
                        }))}
                        disabled={isSaving}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-primary bg-orange-50 dark:bg-orange-900/20'
                            : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                        }`}
                      >
                        <div className={isSelected ? 'text-primary' : 'text-gray-400 dark:text-slate-500'}>{icon}</div>
                        <span className={`font-medium text-xs sm:text-sm text-center ${isSelected ? 'text-primary' : 'text-gray-700 dark:text-slate-300'}`}>
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>

              {/* General Info */}
              <Card padding="md">
                <h3 className="heading-3 mb-4">ข้อมูลทั่วไป</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      ชื่อร้าน/ชื่อแบรนด์ (ทางการค้า) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="ชื่อที่แสดงให้ลูกค้าเห็น" required disabled={isSaving} />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เกี่ยวกับเรา <span className="text-xs font-normal text-gray-400 dark:text-slate-500">(แสดงในส่วนท้ายบิลออนไลน์)</span></label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                      <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none" placeholder="อธิบายเกี่ยวกับธุรกิจ" rows={3} disabled={isSaving} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">โทรศัพท์</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="tel" value={formData.phone} onChange={(e) => handlePhoneChange(e.target.value)} onBlur={() => setFieldErrors(prev => ({ ...prev, phone: validatePhone(formData.phone) || undefined }))} className={`w-full pl-10 pr-4 py-2.5 border rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 ${fieldErrors.phone ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : 'border-gray-300 dark:border-slate-600 focus:ring-primary'}`} placeholder="0xx-xxx-xxxx" disabled={isSaving} />
                    </div>
                    {fieldErrors.phone && <p className="mt-1 text-xs text-red-500">{fieldErrors.phone}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">อีเมล</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="email" value={formData.email} onChange={(e) => handleEmailChange(e.target.value)} onBlur={() => setFieldErrors(prev => ({ ...prev, email: validateEmail(formData.email) || undefined }))} className={`w-full pl-10 pr-4 py-2.5 border rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 ${fieldErrors.email ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : 'border-gray-300 dark:border-slate-600 focus:ring-primary'}`} placeholder="company@email.com" disabled={isSaving} />
                    </div>
                    {fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                      <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="เลขที่ ซอย ถนน" disabled={isSaving} />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <ThaiAddressInput
                      compact
                      district={formData.district}
                      amphoe={formData.amphoe}
                      province={formData.province}
                      postalCode={formData.postalCode}
                      onAddressChange={(addr) => setFormData(prev => ({ ...prev, ...addr }))}
                      disabled={isSaving}
                    />
                  </div>
                </div>
              </Card>

              {/* Tax Info — show for non-individual or always allow tax_id */}
              <Card padding="md">
                <h3 className="heading-3 mb-4 flex items-center">
                  <Receipt className="w-5 h-5 mr-2 text-primary" />
                  ข้อมูลภาษี
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      {formData.businessType === 'individual' ? 'เลขบัตรประชาชน' : 'เลขประจำตัวผู้เสียภาษี'}
                    </label>
                    <input type="text" value={formData.taxId} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="13 หลัก" disabled={isSaving} />
                  </div>
                  {formData.businessType !== 'individual' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">สาขา</label>
                      <input type="text" value={formData.taxBranch} onChange={(e) => setFormData({ ...formData, taxBranch: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="สำนักงานใหญ่" disabled={isSaving} />
                    </div>
                  )}
                  {formData.businessType !== 'individual' && (
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อร้านค้า (ออกบิล/ใบกำกับภาษี)</label>
                      <input type="text" value={formData.taxCompanyName} onChange={(e) => setFormData({ ...formData, taxCompanyName: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="ชื่อตามจดทะเบียน (ถ้าต่างจากชื่อร้าน)" disabled={isSaving} />
                    </div>
                  )}

                  {/* VAT Toggle */}
                  <div className="sm:col-span-2 mt-2">
                      <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4">
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)</span>
                          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">แสดงยอดก่อน VAT และ VAT 7% ในบิล/ออเดอร์</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, vatRegistered: !prev.vatRegistered }))}
                          disabled={isSaving}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                            formData.vatRegistered ? 'bg-primary' : 'bg-gray-300 dark:bg-slate-600'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.vatRegistered ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>
                </div>
              </Card>

              {/* ── Tax branches — only when VAT-registered. Manages the list of
                  registered branches used for POS receipt sequence routing.
                  Saves immediately per action (separate from main form save). */}
              {formData.vatRegistered && (
                <Card padding="md">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="heading-3 flex items-center">
                        <Landmark className="w-5 h-5 mr-2 text-primary" />
                        สาขา VAT
                      </h3>
                      <p className="subtitle-text text-gray-500 dark:text-slate-400 mt-1">
                        รายการสาขาที่จดทะเบียน VAT — แคชเชียร์แต่ละเครื่องเลือกได้ว่าออกใบในนามสาขาไหน
                        และเลขใบกำกับจะรันแยกตามสาขา
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      icon={<Plus className="w-4 h-4" />}
                      onClick={openCreateBranch}
                    >
                      เพิ่มสาขา
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {branches.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-6">
                        ยังไม่มีสาขา — กด &ldquo;+ เพิ่มสาขา&rdquo; เพื่อเริ่ม
                      </p>
                    ) : (
                      branches.map((b, idx) => {
                        const isFirst = idx === 0;
                        const isLast = idx === branches.length - 1;
                        return (
                          <ListRow
                            key={b.id}
                            reorder={branches.length > 1 ? {
                              onMoveUp: () => handleMoveBranch(b.id, 'up'),
                              onMoveDown: () => handleMoveBranch(b.id, 'down'),
                              disableUp: isFirst,
                              disableDown: isLast,
                              disabled: reorderingBranch,
                            } : undefined}
                            icon={
                              <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                                <Landmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                              </div>
                            }
                            title={
                              <span className="inline-flex items-center gap-2">
                                <span className="text-xs font-mono text-gray-400 dark:text-slate-500">{b.code}</span>
                                <span>{b.name}</span>
                                {b.is_default && (
                                  <span className="badge badge-sm badge-pill badge-indigo">default</span>
                                )}
                              </span>
                            }
                            subtitle={b.address || 'ใช้ที่อยู่บริษัท'}
                            actions={
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditBranch(b)}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                                  aria-label="แก้ไข"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteBranchTarget(b)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                                  aria-label="ลบ"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            }
                          />
                        );
                      })
                    )}
                  </div>
                </Card>
              )}

          </Container>

          {/* ปุ่มบันทึกติดขอบล่างตลอด — ฟอร์มนี้ยาวกว่าหนึ่งหน้าจอ ปุ่มท้ายฟอร์ม
              ทำให้ต้องเลื่อนลงสุดทุกครั้งที่แก้ช่องบน */}
          <StickyActionBar
            saving={isSaving}
            dirty={isDirty}
            onSave={() => formRef.current?.requestSubmit()}
            onCancel={() => {
              setFormData(initialFormRef.current);
              setFieldErrors({});
              setLogoFile(null);
              setLogoPreview(null);
              setError('');
            }}
          />
        </form>
      )}
      </Container>

      {/* Tax branch create/edit modal */}
      <Modal
        open={branchModalMode !== null}
        onClose={() => !savingBranch && setBranchModalMode(null)}
        title={branchModalMode === 'edit' ? 'แก้ไขสาขา VAT' : 'เพิ่มสาขา VAT'}
        icon={<Landmark className="w-5 h-5 text-primary" />}
        size="sm"
        disableBackdropClose={savingBranch}
        footer={
          <div className="flex justify-end gap-3 px-6 py-4">
            <Button variant="secondary" onClick={() => setBranchModalMode(null)} disabled={savingBranch}>
              ยกเลิก
            </Button>
            <SaveButton
              onClick={handleSaveBranch}
              loading={savingBranch}
              disabled={savingBranch || !branchForm.name.trim() || !branchForm.code.trim()}
            />
          </div>
        }
      >
        <div className="px-6 py-5 space-y-4">
          <FormInput
            label="รหัสสาขา"
            required
            value={branchForm.code}
            onChange={e => setBranchForm({ ...branchForm, code: e.target.value.replace(/\D/g, '').slice(0, 5) })}
            placeholder="00000"
            hint={branchModalMode === 'edit'
              ? 'รหัสสาขาแก้ไม่ได้ — ใบกำกับเก่าอ้างอิงรหัสนี้อยู่'
              : 'ตัวเลข 5 หลัก จาก ภพ.20 — สำนักงานใหญ่ใช้ 00000'}
            disabled={branchModalMode === 'edit'}
            inputMode="numeric"
          />
          <FormInput
            label="ชื่อสาขา"
            required
            value={branchForm.name}
            onChange={e => setBranchForm({ ...branchForm, name: e.target.value })}
            placeholder="เช่น สำนักงานใหญ่, สาขาที่ 1"
          />
          <FormInput
            label="ที่อยู่สาขา"
            value={branchForm.address}
            onChange={e => setBranchForm({ ...branchForm, address: e.target.value })}
            placeholder="ไม่กรอก = ใช้ที่อยู่บริษัท"
            hint="ใส่ที่อยู่จริงของสาขานี้ ถ้าต่างจากที่อยู่หลักของบริษัท"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteBranchTarget}
        onClose={() => !deletingBranch && setDeleteBranchTarget(null)}
        onConfirm={handleDeleteBranch}
        title="ลบสาขา VAT"
        description={`ยืนยันการลบสาขา "${deleteBranchTarget?.name || ''}" — ถ้ามีออเดอร์ POS อ้างอิงสาขานี้อยู่ จะลบไม่ได้`}
        confirmLabel="ลบ"
        variant="danger"
        loading={deletingBranch}
        icon={<Trash2 className="w-6 h-6 text-red-600" />}
      />
    </Layout>
  );
}
