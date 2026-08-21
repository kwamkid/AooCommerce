'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Warehouse, Check, Loader2 } from 'lucide-react';
import WizardShell from '@/components/onboarding/WizardShell';
import ThaiAddressInput from '@/components/ui/ThaiAddressInput';
import { useWizardState, WIZARD_KEYS } from '@/components/onboarding/wizard-storage';
import { useWizardPackage } from '@/components/onboarding/use-wizard-package';

interface WarehouseFormState {
  useWarehouse: boolean;
  name: string;
  address: string;
  district: string;
  amphoe: string;
  province: string;
  postalCode: string;
  phone: string;
}

const INITIAL: WarehouseFormState = {
  useWarehouse: true,
  name: 'คลังหลัก',
  address: '',
  district: '',
  amphoe: '',
  province: '',
  postalCode: '',
  phone: '',
};

export default function OnboardingWarehousePage() {
  const router = useRouter();
  const { stockEnabled, loaded: pkgLoaded } = useWizardPackage();
  const [form, setForm] = useWizardState<WarehouseFormState>(WIZARD_KEYS.warehouse, INITIAL);
  const { useWarehouse, name, address, district, amphoe, province, postalCode, phone } = form;
  const patch = (p: Partial<WarehouseFormState>) => setForm(prev => ({ ...prev, ...p }));

  // Package doesn't support stock → this step is not part of the visible flow
  // (WizardShell already filters it out of progress + nav). Redirect away if
  // the user lands here via URL or browser back/forward.
  useEffect(() => {
    if (pkgLoaded && !stockEnabled) {
      router.replace('/onboarding/setup/carriers');
    }
  }, [pkgLoaded, stockEnabled, router]);

  // Province is required when "ใช้ระบบคลัง" is selected (ThaiAddressInput shows `*`)
  const provinceMissing = useWarehouse && !province.trim();

  const handleNext = async () => {
    if (provinceMissing) throw new Error('กรุณากรอกจังหวัด');
    // No per-step API call — sessionStorage already has the data; finalize
    // creates the warehouse + writes settings on the last wizard step.
  };

  const cardClass = (active: boolean) =>
    `relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
      active
        ? 'border-primary bg-primary/5 dark:bg-primary/10'
        : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
    }`;

  // Package check still running, or about to redirect because the package
  // doesn't support stock — render a loader instead of flashing the form.
  if (!pkgLoaded || !stockEnabled) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <WizardShell step={3} onNext={handleNext} nextDisabled={provinceMissing}>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">ใช้ระบบคลังสินค้ามั้ย?</h2>
      <p className="text-gray-600 dark:text-slate-400 mb-6">ติดตามจำนวนสต็อก, รับเข้า, ย้ายคลัง — เปิดใช้ภายหลังได้</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div onClick={() => patch({ useWarehouse: true })} className={cardClass(useWarehouse)}>
          {useWarehouse && (
            <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
              <Check className="w-4 h-4" />
            </div>
          )}
          <Warehouse className="w-7 h-7 mb-3 text-emerald-600 dark:text-emerald-400" />
          <div className="font-semibold text-gray-900 dark:text-white">ใช้ระบบคลัง</div>
          <div className="text-sm text-gray-600 dark:text-slate-400 mt-1.5">ติดตามสต็อกแยกตามสาขา รับเข้า ย้ายคลัง</div>
        </div>

        <div onClick={() => patch({ useWarehouse: false })} className={cardClass(!useWarehouse)}>
          {!useWarehouse && (
            <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
              <Check className="w-4 h-4" />
            </div>
          )}
          <div className="w-7 h-7 mb-3 rounded-full border-2 border-gray-300 dark:border-slate-600" />
          <div className="font-semibold text-gray-900 dark:text-white">ไม่ใช้ระบบคลัง</div>
          <div className="text-sm text-gray-600 dark:text-slate-400 mt-1.5">เน้นรับออเดอร์อย่างเดียว ไม่ track สต็อก</div>
        </div>
      </div>

      {useWarehouse && (
        // autoComplete="off" + name attrs marked as the wizard so Chrome doesn't
        // bucket these into the personal-identity autofill (was prompting
        // "Save identity card?" because of tel + address + name combo).
        <div className="space-y-4 p-5 rounded-xl bg-gray-50 dark:bg-slate-700/40">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อคลัง</label>
            <input
              type="text"
              name="wizard_warehouse_name"
              autoComplete="off"
              value={name}
              onChange={e => patch({ name: e.target.value })}
              placeholder="คลังหลัก"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่ (ไม่บังคับ)</label>
            <input
              type="text"
              name="wizard_warehouse_address_line"
              autoComplete="off"
              value={address}
              onChange={e => patch({ address: e.target.value })}
              placeholder="เลขที่ ซอย ถนน"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <ThaiAddressInput
            compact
            district={district}
            amphoe={amphoe}
            province={province}
            postalCode={postalCode}
            provinceError={provinceMissing ? 'กรุณากรอกจังหวัด' : undefined}
            onAddressChange={(addr) => {
              const next: Partial<WarehouseFormState> = {};
              if (addr.district !== undefined) next.district = addr.district;
              if (addr.amphoe !== undefined) next.amphoe = addr.amphoe;
              if (addr.province !== undefined) next.province = addr.province;
              if (addr.postalCode !== undefined) next.postalCode = addr.postalCode;
              if (Object.keys(next).length > 0) patch(next);
            }}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทร (ไม่บังคับ)</label>
            <input
              type="text"
              inputMode="tel"
              name="wizard_warehouse_phone"
              autoComplete="off"
              value={phone}
              onChange={e => patch({ phone: e.target.value })}
              placeholder="0XX-XXX-XXXX"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      )}
    </WizardShell>
  );
}
