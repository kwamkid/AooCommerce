'use client';

import { Building2, FileText, Upload } from 'lucide-react';
import ImageDropzone from '@/components/ui/ImageDropzone';
import WizardShell from '@/components/onboarding/WizardShell';
import { useWizardState, WIZARD_KEYS } from '@/components/onboarding/wizard-storage';

interface CompanyForm {
  name: string;
  description: string;
  // Logo lives in sessionStorage as a data URL so it survives back/forward —
  // we ship it to the server as part of /api/onboarding/finalize at the end
  // of the wizard, not now (no orphan upload if the user abandons).
  logoDataUrl: string | null;
  logoFileName: string | null;
  logoMimeType: string | null;
}

const INITIAL: CompanyForm = {
  name: '',
  description: '',
  logoDataUrl: null,
  logoFileName: null,
  logoMimeType: null,
};

export default function OnboardingCompanyPage() {
  const [form, setForm] = useWizardState<CompanyForm>(WIZARD_KEYS.company, INITIAL);
  const patch = (p: Partial<CompanyForm>) => setForm(prev => ({ ...prev, ...p }));

  /**
   * บริษัทยังไม่ถูกสร้างตอนนี้ จึงยัง**อัปขึ้น storage ไม่ได้** (ไม่มี company_id)
   * เก็บเป็น data URL ใน wizard state พาข้ามหน้าไปก่อน แล้วอัปตอนสร้างบริษัทจริง
   * ⇒ ใช้ `LogoUploader` ที่นี่ไม่ได้ (ตัวนั้นอัปทันทีและต้องมี companyId)
   *
   * ImageDropzone ย่อรูปให้ก่อน — สำคัญมาก เพราะ data URL ของโลโก้ 2MB
   * จะกลายเป็นสตริง ~2.7MB ใน storage ของเบราว์เซอร์ ซึ่งชนเพดานได้ง่าย ๆ
   */
  const onLogoPick = (file: File | null) => {
    if (!file) { patch({ logoDataUrl: null, logoFileName: null, logoMimeType: null }); return; }
    const reader = new FileReader();
    reader.onloadend = () => patch({
      logoDataUrl: reader.result as string,
      logoFileName: file.name,
      logoMimeType: file.type,
    });
    reader.readAsDataURL(file);
  };

  const handleNext = async () => {
    if (!form.name.trim()) throw new Error('กรุณาระบุชื่อบริษัท');
    // No API call here — sessionStorage already has the data; finalize handles
    // company creation + logo upload atomically on the last step.
  };

  return (
    <WizardShell step={1} onNext={handleNext} nextDisabled={!form.name.trim()}>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">ตั้งค่าบริษัท</h2>
      <p className="text-gray-600 dark:text-slate-400 mb-6">เริ่มต้นจากชื่อบริษัทและโลโก้ของคุณ — แก้ไขภายหลังได้ที่ตั้งค่า</p>

      <div className="space-y-6">
        {/* Logo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
            โลโก้บริษัท (ไม่บังคับ)
          </label>
          <div className="flex items-center space-x-4">
            <ImageDropzone
              value={null}
              onChange={onLogoPick}
              initialPreviewUrl={form.logoDataUrl}
              icon={<Upload className="w-6 h-6" />}
              label="อัพโหลด"
              alt="โลโก้"
              maxWidthOrHeight={300}
              maxSizeMB={0.3}
              classNames={{
                root: 'w-20 h-20 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-600 text-gray-500 hover:border-primary/50 hover:text-primary transition-colors text-xs',
                preview: 'relative inline-block',
                previewImg: 'w-20 h-20 rounded-lg object-cover border-2 border-primary/30',
                clear: 'absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors',
              }}
            />
            <div className="text-xs text-gray-500 dark:text-slate-400">
              <p>รองรับไฟล์ JPG, PNG</p>
              <p>แนะนำขนาด 200x200 พิกเซล</p>
            </div>
          </div>
        </div>

        {/* Company name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
            ชื่อร้าน/ชื่อแบรนด์ <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              name="wizard_company_name"
              autoComplete="off"
              value={form.name}
              onChange={e => patch({ name: e.target.value })}
              placeholder="ชื่อร้านค้าหรือแบรนด์ของคุณ"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              required
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
            คำอธิบาย (ไม่บังคับ)
          </label>
          <div className="relative">
            <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <textarea
              name="wizard_company_description"
              autoComplete="off"
              value={form.description}
              onChange={e => patch({ description: e.target.value })}
              placeholder="อธิบายเกี่ยวกับธุรกิจของคุณ"
              rows={3}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
            />
          </div>
        </div>
      </div>
    </WizardShell>
  );
}
