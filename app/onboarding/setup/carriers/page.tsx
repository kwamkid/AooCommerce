'use client';

import { Truck, Check } from 'lucide-react';
import WizardShell from '@/components/onboarding/WizardShell';
import { useWizardState, WIZARD_KEYS } from '@/components/onboarding/wizard-storage';

interface CarrierItem {
  code: string;
  name: string;
  shippop: string | null;
  popular: boolean;
}

const CARRIERS: CarrierItem[] = [
  { code: 'thai_post', name: 'ไปรษณีย์ไทย / EMS', shippop: 'EMST', popular: true },
  { code: 'kerry',     name: 'Kerry Express',      shippop: 'KEX',  popular: true },
  { code: 'flash',     name: 'Flash Express',      shippop: 'FLE',  popular: true },
  { code: 'j&t',       name: 'J&T Express',        shippop: 'JNT',  popular: true },
  { code: 'scg',       name: 'SCG Express',        shippop: 'SCG',  popular: false },
  { code: 'ninja',     name: 'Ninja Van',          shippop: 'NJV',  popular: false },
  { code: 'best',      name: 'BEST Express',       shippop: 'BEST', popular: false },
  { code: 'dhl',       name: 'DHL',                shippop: 'DHL',  popular: false },
  { code: 'grab',      name: 'Grab Express',       shippop: null,   popular: false },
  { code: 'lalamove',  name: 'Lalamove',           shippop: 'LLM',  popular: false },
];

export default function OnboardingCarriersPage() {
  // Prefill: top 4 popular ticked. self/other always seeded server-side.
  const [selectedList, setSelectedList] = useWizardState<string[]>(
    WIZARD_KEYS.carriers,
    CARRIERS.filter(c => c.popular).map(c => c.code),
  );
  const selected = new Set(selectedList);

  const toggle = (code: string) => {
    setSelectedList(prev => {
      const set = new Set(prev);
      if (set.has(code)) set.delete(code); else set.add(code);
      return Array.from(set);
    });
  };

  const handleNext = async () => {
    // sessionStorage already has the selection; finalize writes the carriers
    // table on the last wizard step.
  };

  const popular = CARRIERS.filter(c => c.popular);
  const others = CARRIERS.filter(c => !c.popular);

  const renderItem = (c: CarrierItem) => {
    const isSelected = selected.has(c.code);
    return (
      <button
        key={c.code}
        type="button"
        onClick={() => toggle(c.code)}
        className={`relative flex items-center gap-3 p-3.5 rounded-lg border-2 transition-all text-left ${
          isSelected
            ? 'border-primary bg-primary/5 dark:bg-primary/10'
            : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
        }`}
      >
        <div
          className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
            isSelected ? 'bg-primary text-white' : 'border-2 border-gray-300 dark:border-slate-600'
          }`}
        >
          {isSelected && <Check className="w-3.5 h-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 dark:text-white">{c.name}</div>
          {c.shippop && (
            <div className="text-sm text-gray-400 dark:text-slate-500">code: {c.shippop}</div>
          )}
        </div>
      </button>
    );
  };

  return (
    <WizardShell step={4} onNext={handleNext}>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">ใช้ขนส่งอะไรบ้าง?</h2>
      <p className="text-gray-600 dark:text-slate-400 mb-6">เลือกที่ใช้บ่อย — เพิ่มภายหลังได้ที่ ตั้งค่า {'>'} ขนส่ง</p>

      <div className="mb-6">
        <div className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2.5">ขนส่งยอดนิยม</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {popular.map(renderItem)}
        </div>
      </div>

      <div className="mb-6">
        <div className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2.5">ขนส่งอื่น</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {others.map(renderItem)}
        </div>
      </div>

      <div className="px-4 py-3 bg-gray-50 dark:bg-slate-700/40 rounded-lg text-sm text-gray-600 dark:text-slate-400 flex items-start gap-2">
        <Truck className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400 dark:text-slate-500" />
        <span>ระบบจะเพิ่ม &quot;จัดส่งเอง&quot; และ &quot;อื่นๆ&quot; ให้อัตโนมัติเสมอ — ใช้กรอกชื่อขนส่งใหม่หรือรถบริษัท</span>
      </div>
    </WizardShell>
  );
}
