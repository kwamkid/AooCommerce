// Path: app/settings/company/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import { useCompany } from '@/lib/company-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import {
  Building2, FileText, Phone, Mail, MapPin, Receipt, Upload, X,
  AlertCircle, Loader2, CheckCircle, Save,
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

export default function CompanySettingsPage() {
  const { currentCompany, companyRole, refreshCompanies } = useCompany();
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    phone: '',
    email: '',
    address: '',
    taxId: '',
    taxCompanyName: '',
    taxBranch: '',
  });

  // Logo state
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Fetch company data
  useEffect(() => {
    const fetchCompanyData = async () => {
      if (!currentCompany?.id) return;

      try {
        const response = await apiFetch('/api/companies');
        const data = await response.json();

        if (response.ok && data.companies) {
          const company = data.companies.find(
            (m: { company_id: string; company: CompanyData }) => m.company_id === currentCompany.id
          )?.company as CompanyData | undefined;

          if (company) {
            setFormData({
              name: company.name || '',
              description: company.description || '',
              phone: company.phone || '',
              email: company.email || '',
              address: company.address || '',
              taxId: company.tax_id || '',
              taxCompanyName: company.tax_company_name || '',
              taxBranch: company.tax_branch || '',
            });
            setLogoUrl(company.logo_url);
          }
        }
      } catch (err) {
        console.error('Error fetching company data:', err);
        setError('ไม่สามารถโหลดข้อมูลบริษัทได้');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompanyData();
  }, [currentCompany?.id]);

  // Handle logo selection
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove logo preview
  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Upload logo
  const handleUploadLogo = async () => {
    if (!logoFile || !currentCompany?.id || !session?.access_token) return;

    setIsUploadingLogo(true);
    try {
      const logoFormData = new FormData();
      logoFormData.append('file', logoFile);
      logoFormData.append('companyId', currentCompany.id);

      const response = await fetch('/api/companies/logo', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: logoFormData,
      });

      const result = await response.json();

      if (response.ok && result.logoUrl) {
        setLogoUrl(result.logoUrl);
        setLogoFile(null);
        setLogoPreview(null);
        setSuccess('อัพโหลดโลโก้สำเร็จ');
        setTimeout(() => setSuccess(''), 3000);
        // Refresh company context so sidebar/header logo updates
        await refreshCompanies();
      } else {
        setError(result.error || 'ไม่สามารถอัพโหลดโลโก้ได้');
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการอัพโหลดโลโก้');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name.trim()) {
      setError('กรุณาระบุชื่อบริษัท');
      return;
    }

    if (!currentCompany?.id) return;

    setIsSaving(true);

    try {
      const response = await apiFetch('/api/companies', {
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
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess('บันทึกข้อมูลบริษัทสำเร็จ');
        setTimeout(() => setSuccess(''), 3000);
        // Refresh company context so sidebar/header updates
        await refreshCompanies();

        // Upload logo if a new one was selected
        if (logoFile) {
          await handleUploadLogo();
        }
      } else {
        setError(result.error || 'ไม่สามารถบันทึกข้อมูลได้');
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setIsSaving(false);
    }
  };

  // Check permissions
  const isOwnerOrAdmin = companyRole === 'owner' || companyRole === 'admin';

  if (!isOwnerOrAdmin && !isLoading) {
    return (
      <Layout
        title="ข้อมูลบริษัท"
        breadcrumbs={[
          { label: 'ตั้งค่า', href: '/settings' },
          { label: 'ข้อมูลบริษัท' },
        ]}
      >
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">ไม่มีสิทธิ์เข้าถึง</h3>
          <p className="text-gray-500 dark:text-slate-400">เฉพาะเจ้าของและผู้ดูแลระบบเท่านั้นที่สามารถแก้ไขข้อมูลบริษัทได้</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="ข้อมูลบริษัท"
      breadcrumbs={[
        { label: 'ตั้งค่า', href: '/settings' },
        { label: 'ข้อมูลบริษัท' },
      ]}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#F4511E]" />
          <span className="ml-3 text-gray-500 dark:text-slate-400">กำลังโหลดข้อมูล...</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
          {/* Alerts */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}
          {success && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-700 dark:text-green-400">{success}</p>
            </div>
          )}

          {/* Logo Section */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">โลโก้บริษัท</h3>
            <div className="flex items-center space-x-4">
              {logoPreview || logoUrl ? (
                <div className="relative">
                  <img
                    src={logoPreview || logoUrl || ''}
                    alt="โลโก้บริษัท"
                    className="w-24 h-24 rounded-lg object-cover border-2 border-gray-200 dark:border-slate-600"
                  />
                  {logoPreview && (
                    <button
                      type="button"
                      onClick={removeLogo}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 dark:text-slate-500">
                  <Building2 className="w-8 h-8 mb-1" />
                  <span className="text-xs">ไม่มีโลโก้</span>
                </div>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors flex items-center"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  เลือกรูปภาพ
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">รองรับไฟล์ JPG, PNG ขนาดแนะนำ 200x200 พิกเซล</p>
              </div>
              {logoPreview && (
                <button
                  type="button"
                  onClick={handleUploadLogo}
                  disabled={isUploadingLogo}
                  className="px-4 py-2 bg-[#F4511E] text-white rounded-lg text-sm font-medium hover:bg-[#F4511E]/90 transition-colors disabled:opacity-50 flex items-center"
                >
                  {isUploadingLogo ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  อัพโหลด
                </button>
              )}
            </div>
          </div>

          {/* Company Info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">ข้อมูลทั่วไป</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Company Name */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  ชื่อบริษัท <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                    placeholder="ชื่อบริษัท"
                    required
                    disabled={isSaving}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  คำอธิบาย
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent resize-none"
                    placeholder="อธิบายเกี่ยวกับธุรกิจของคุณ"
                    rows={3}
                    disabled={isSaving}
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  โทรศัพท์
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                    placeholder="0xx-xxx-xxxx"
                    disabled={isSaving}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  อีเมล
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                    placeholder="company@email.com"
                    disabled={isSaving}
                  />
                </div>
              </div>

              {/* Address */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  ที่อยู่
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent resize-none"
                    placeholder="ที่อยู่บริษัท"
                    rows={2}
                    disabled={isSaving}
                  />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Tax ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  เลขประจำตัวผู้เสียภาษี
                </label>
                <input
                  type="text"
                  value={formData.taxId}
                  onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                  placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก"
                  disabled={isSaving}
                />
              </div>

              {/* Tax Branch */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  สาขา
                </label>
                <input
                  type="text"
                  value={formData.taxBranch}
                  onChange={(e) => setFormData({ ...formData, taxBranch: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                  placeholder="สำนักงานใหญ่ / สาขาที่ ..."
                  disabled={isSaving}
                />
              </div>

              {/* Tax Company Name */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  ชื่อบริษัท (สำหรับใบกำกับภาษี)
                </label>
                <input
                  type="text"
                  value={formData.taxCompanyName}
                  onChange={(e) => setFormData({ ...formData, taxCompanyName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                  placeholder="ชื่อบริษัทตามที่จดทะเบียน (ถ้าต่างจากชื่อบริษัท)"
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  บันทึกข้อมูล
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Layout>
  );
}
