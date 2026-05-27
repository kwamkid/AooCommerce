'use client';

import { ShoppingBag, Store, Package, ShoppingCart, Building, Check } from 'lucide-react';
import WizardShell from '@/components/onboarding/WizardShell';
import { useWizardState, WIZARD_KEYS } from '@/components/onboarding/wizard-storage';

type Channel = 'retail' | 'wholesale' | 'consignment' | 'marketplace' | 'pos';

interface ChannelOption {
  key: Channel;
  label: string;
  sublabel: string;
  description: string;
  icon: typeof ShoppingBag;
  color: string;
}

const CHANNELS: ChannelOption[] = [
  { key: 'retail',      label: 'ขายปลีก',    sublabel: 'B2C',         description: 'ขายตรงให้ลูกค้าทั่วไป',           icon: ShoppingBag,  color: 'text-orange-600 dark:text-orange-400' },
  { key: 'wholesale',   label: 'ขายส่ง',     sublabel: 'B2B',         description: 'ขายให้ตัวแทน หรือ องค์กร',          icon: Store,        color: 'text-blue-600 dark:text-blue-400' },
  { key: 'consignment', label: 'ฝากขาย',     sublabel: 'Consignment', description: 'ส่งของให้ตัวแทน หรือ ห้าง',         icon: Package,      color: 'text-amber-600 dark:text-amber-400' },
  { key: 'marketplace', label: 'Marketplace', sublabel: 'Online',      description: 'Shopee, TikTok, Lazada, ฯลฯ',     icon: ShoppingCart, color: 'text-purple-600 dark:text-purple-400' },
  { key: 'pos',         label: 'หน้าร้าน',   sublabel: 'POS',         description: 'ขายหน้าร้าน หรือ มีสาขา',            icon: Building,     color: 'text-emerald-600 dark:text-emerald-400' },
];

export default function OnboardingChannelsPage() {
  // Prefill: retail ticked. Persisted to sessionStorage so back/forward keeps
  // the choice. The actual application of channels happens at finalize.
  const [selectedList, setSelectedList] = useWizardState<Channel[]>(WIZARD_KEYS.channels, ['retail']);
  const selected = new Set(selectedList);

  const toggle = (key: Channel) => {
    setSelectedList(prev => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key); else set.add(key);
      return Array.from(set);
    });
  };

  // No per-step API call — just persist + let WizardShell navigate.
  const handleNext = async () => { /* sessionStorage already up-to-date via useWizardState */ };

  return (
    <WizardShell step={2} onNext={handleNext}>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">ธุรกิจของคุณขายผ่านช่องทางไหนบ้าง?</h2>
      <p className="text-gray-600 dark:text-slate-400 mb-6">เลือกได้หลายอัน — ปรับเปลี่ยนได้ภายหลังที่ตั้งค่า</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CHANNELS.map(({ key, label, sublabel, description, icon: Icon, color }) => {
          const isSelected = selected.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
              }`}
            >
              {isSelected && (
                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
                  <Check className="w-4 h-4" />
                </div>
              )}
              <Icon className={`w-7 h-7 mb-3 ${color}`} />
              <div className="font-semibold text-gray-900 dark:text-white">{label}</div>
              <div className="text-sm text-gray-400 dark:text-slate-500">{sublabel}</div>
              <div className="text-sm text-gray-600 dark:text-slate-400 mt-1.5">{description}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-lg text-sm text-blue-800 dark:text-blue-300">
        💡 ไม่เลือกก็ได้ — ระบบจะใช้ขายปลีกเป็นค่าเริ่มต้น
      </div>
    </WizardShell>
  );
}
