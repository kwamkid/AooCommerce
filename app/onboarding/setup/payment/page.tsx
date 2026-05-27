'use client';

import { Coins, QrCode, Building2, Check, Plus, Trash2 } from 'lucide-react';
import WizardShell from '@/components/onboarding/WizardShell';
import FormSelect from '@/components/ui/FormSelect';
import { useWizardState, WIZARD_KEYS } from '@/components/onboarding/wizard-storage';
import { apiFetch } from '@/lib/api-client';
import { THAI_BANKS } from '@/lib/constants/banks';

interface BankRow {
  bank_code: string;
  account_number: string;
  account_name: string;
}

interface PaymentFormState {
  cashOn: boolean;
  promptpayOn: boolean;
  promptpayId: string;
  promptpayName: string;
  bankOn: boolean;
  banks: BankRow[];
}

const INITIAL: PaymentFormState = {
  cashOn: true,
  promptpayOn: false,
  promptpayId: '',
  promptpayName: '',
  bankOn: false,
  banks: [{ bank_code: '', account_number: '', account_name: '' }],
};

function ToggleRow({
  icon,
  title,
  subtitle,
  on,
  onChange,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  on: boolean;
  onChange: (next: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border-2 transition-all ${
        on ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-gray-200 dark:border-slate-700'
      }`}
    >
      <button
        type="button"
        onClick={() => onChange(!on)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div
          className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
            on ? 'bg-primary text-white' : 'border-2 border-gray-300 dark:border-slate-600'
          }`}
        >
          {on && <Check className="w-3.5 h-3.5" />}
        </div>
        <div className="flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 dark:text-white">{title}</div>
          <div className="text-sm text-gray-500 dark:text-slate-400">{subtitle}</div>
        </div>
      </button>
      {on && children && (
        <div className="px-4 pb-4 pt-2 space-y-3 border-t border-gray-200 dark:border-slate-700/50">
          {children}
        </div>
      )}
    </div>
  );
}

export default function OnboardingPaymentPage() {
  // Prefill: cash on, others off. Persisted to sessionStorage across back/forward.
  const [form, setForm] = useWizardState<PaymentFormState>(WIZARD_KEYS.payment, INITIAL);
  const { cashOn, promptpayOn, promptpayId, promptpayName, bankOn, banks } = form;
  const patch = (p: Partial<PaymentFormState>) => setForm(prev => ({ ...prev, ...p }));
  const setCashOn = (v: boolean) => patch({ cashOn: v });
  const setPromptpayOn = (v: boolean) => patch({ promptpayOn: v });
  const setPromptpayId = (v: string) => patch({ promptpayId: v });
  const setPromptpayName = (v: string) => patch({ promptpayName: v });
  const setBankOn = (v: boolean) => patch({ bankOn: v });

  const bankOptions = THAI_BANKS
    .filter(b => b.code !== 'PROMPTPAY')
    .map(b => ({ id: b.code, label: b.name_th }));

  const addBank = () => patch({ banks: [...banks, { bank_code: '', account_number: '', account_name: '' }] });
  const removeBank = (idx: number) => patch({ banks: banks.filter((_, i) => i !== idx) });
  const updateBank = (idx: number, p: Partial<BankRow>) =>
    patch({ banks: banks.map((b, i) => (i === idx ? { ...b, ...p } : b)) });

  const validate = (): string | null => {
    if (promptpayOn && !promptpayId.trim()) return 'กรุณากรอกหมายเลขพร้อมเพย์';
    if (bankOn) {
      const filled = banks.filter(b => b.bank_code || b.account_number);
      for (const b of filled) {
        if (!b.bank_code) return 'กรุณาเลือกธนาคาร';
        if (!b.account_number.trim()) return 'กรุณากรอกเลขบัญชี';
      }
    }
    return null;
  };

  // Read every wizard step's sessionStorage payload — used to assemble the
  // single /api/onboarding/finalize request that creates the company + applies
  // all settings atomically. If a step's storage is missing, fall back to
  // safe defaults (user can revisit and edit before clicking "เสร็จสิ้น").
  const readWizardState = <T,>(key: string, fallback: T): T => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  const handleNext = async () => {
    const err = validate();
    if (err) throw new Error(err);

    const company = readWizardState<{ name: string; description: string; logoDataUrl: string | null; logoFileName: string | null; logoMimeType: string | null }>(
      WIZARD_KEYS.company,
      { name: '', description: '', logoDataUrl: null, logoFileName: null, logoMimeType: null },
    );
    if (!company.name?.trim()) {
      throw new Error('ยังไม่ได้กรอกชื่อบริษัท — กลับไปขั้นตอนแรก');
    }

    const channels = readWizardState<string[]>(WIZARD_KEYS.channels, ['retail']);
    const warehouseForm = readWizardState<{ useWarehouse: boolean; name: string; address: string; district: string; amphoe: string; province: string; postalCode: string; phone: string }>(
      WIZARD_KEYS.warehouse,
      { useWarehouse: true, name: 'คลังหลัก', address: '', district: '', amphoe: '', province: '', postalCode: '', phone: '' },
    );
    const carrierCodes = readWizardState<string[]>(WIZARD_KEYS.carriers, ['thai_post', 'kerry', 'flash', 'j&t']);

    const finalizeBody = {
      company: {
        name: company.name.trim(),
        description: company.description?.trim() || null,
        logoDataUrl: company.logoDataUrl,
        logoFileName: company.logoFileName,
        logoMimeType: company.logoMimeType,
      },
      channels,
      warehouse: warehouseForm.useWarehouse
        ? {
            use_warehouse: true,
            name: warehouseForm.name.trim() || 'คลังหลัก',
            address: warehouseForm.address.trim() || null,
            district: warehouseForm.district.trim() || null,
            amphoe: warehouseForm.amphoe.trim() || null,
            province: warehouseForm.province.trim() || null,
            postal_code: warehouseForm.postalCode.trim() || null,
            phone: warehouseForm.phone.trim() || null,
          }
        : { use_warehouse: false },
      carriers: carrierCodes,
      payment: {
        cash: cashOn,
        promptpay: promptpayOn && promptpayId.trim()
          ? { id: promptpayId.trim(), name: promptpayName.trim() }
          : null,
        banks: bankOn
          ? banks.filter(b => b.bank_code && b.account_number.trim())
          : [],
      },
    };

    const res = await apiFetch('/api/onboarding/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalizeBody),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'สร้างบริษัทไม่สำเร็จ');

    // Point the rest of the app at the freshly-created company so /complete +
    // /dashboard pick it up after the AuthProvider cache is refreshed.
    if (result.company?.id) {
      try {
        localStorage.setItem('aoo-current-company-id', result.company.id);
        sessionStorage.removeItem('aoo-auth-cache');
      } catch { /* ignore */ }
    }
  };

  return (
    <WizardShell step={5} onNext={handleNext} finishLabel="สร้างบริษัท">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">รับเงินยังไง?</h2>
      <p className="text-gray-600 dark:text-slate-400 mb-6">เลือกช่องทางที่ใช้รับเงิน — เพิ่ม/แก้ไขภายหลังได้</p>

      <div className="space-y-3">
        <ToggleRow
          icon={<Coins className="w-6 h-6 text-emerald-600" />}
          title="เงินสด"
          subtitle="รับเงินสดจากลูกค้า / จ่ายหน้าร้าน"
          on={cashOn}
          onChange={setCashOn}
        />

        <ToggleRow
          icon={<QrCode className="w-6 h-6 text-blue-600" />}
          title="พร้อมเพย์"
          subtitle="QR PromptPay สำหรับโอนชำระ"
          on={promptpayOn}
          onChange={setPromptpayOn}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเลขพร้อมเพย์</label>
            <input
              type="text"
              name="wizard_promptpay_id"
              autoComplete="off"
              value={promptpayId}
              onChange={e => setPromptpayId(e.target.value)}
              placeholder="เบอร์โทร หรือ เลขประจำตัวผู้เสียภาษี"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อบัญชี</label>
            <input
              type="text"
              name="wizard_promptpay_name"
              autoComplete="off"
              value={promptpayName}
              onChange={e => setPromptpayName(e.target.value)}
              placeholder="ชื่อ-นามสกุล หรือ ชื่อบริษัท"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </ToggleRow>

        <ToggleRow
          icon={<Building2 className="w-6 h-6 text-indigo-600" />}
          title="โอนเข้าบัญชีธนาคาร"
          subtitle="รับโอนเงินเข้าบัญชี"
          on={bankOn}
          onChange={setBankOn}
        >
          {banks.map((b, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ธนาคาร</label>
                <FormSelect
                  value={b.bank_code}
                  onChange={(v) => updateBank(idx, { bank_code: v })}
                  options={bankOptions}
                  placeholder="เลือกธนาคาร"
                />
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เลขบัญชี</label>
                  <input
                    type="text"
                    value={b.account_number}
                    onChange={e => updateBank(idx, { account_number: e.target.value })}
                    placeholder="123-4-56789-0"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                {banks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeBank(idx)}
                    className="p-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อบัญชี</label>
                <input
                  type="text"
                  value={b.account_name}
                  onChange={e => updateBank(idx, { account_name: e.target.value })}
                  placeholder="ชื่อ-นามสกุล หรือ ชื่อบริษัท"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addBank}
            className="text-sm text-primary hover:text-primary-hover flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            เพิ่มบัญชีอีก
          </button>
        </ToggleRow>
      </div>
    </WizardShell>
  );
}
