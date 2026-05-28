// Path: components/suppliers/SupplierForm.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Loader2,
  Factory,
  Banknote,
  CreditCard,
  Handshake,
  ChevronDown,
  X,
  Plus,
  Tag,
} from 'lucide-react';
import { THAI_BANKS, getBankByCode } from '@/lib/constants/banks';
import Checkbox from '@/components/ui/Checkbox';
import FormSelect from '@/components/ui/FormSelect';
import NumberInput from '@/components/ui/NumberInput';
import { apiFetch } from '@/lib/api-client';

const SUPPLIER_TYPES = [
  { value: 'cash', label: 'Cash (เงินสด)', icon: Banknote, desc: 'ชำระทันทีเมื่อสั่งซื้อ' },
  { value: 'credit', label: 'Credit (เครดิต)', icon: CreditCard, desc: 'สั่งก่อน จ่ายทีหลังตามเครดิต' },
  { value: 'consignment', label: 'Consignment (ฝากขาย)', icon: Handshake, desc: 'ฝากสินค้าไว้ ขายได้ค่อยจ่าย' },
] as const;

export interface SupplierFormData {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  tax_id: string;
  branch: string;
  is_vat_registered: boolean;
  supplier_type: 'cash' | 'credit' | 'consignment';
  payment_terms: number;
  bank_code: string;
  bank_name: string;
  bank_account: string;
  bank_account_name: string;
  notes: string;
  brand_ids?: string[];
}

export const emptySupplierForm: SupplierFormData = {
  name: '', contact_name: '', phone: '', email: '', address: '', tax_id: '',
  branch: '', is_vat_registered: false,
  supplier_type: 'cash', payment_terms: 0,
  bank_code: '', bank_name: '', bank_account: '', bank_account_name: '', notes: '',
  brand_ids: [],
};

interface Brand {
  id: string;
  name: string;
  supplier_id?: string | null;
}

interface SupplierFormProps {
  initialData?: Partial<SupplierFormData>;
  onSubmit: (data: SupplierFormData) => Promise<void>;
  onCancel: () => void;
  isEditing?: boolean;
  isLoading?: boolean;
  compact?: boolean;
}

const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-base sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary';
const labelClass = 'label';

function BankLogo({ code, size = 'sm' }: { code: string; size?: 'sm' | 'md' }) {
  const bank = getBankByCode(code);
  if (!bank) return null;
  const s = size === 'sm' ? 'w-5 h-5' : 'w-8 h-8';
  return bank.logo ? (
    <img src={bank.logo} alt={bank.name_th} className={`${s} rounded-full flex-shrink-0 object-contain`} />
  ) : (
    <div className={`${s} rounded-full flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold`}
      style={{ backgroundColor: bank.color }}>
      {bank.code.slice(0, 2)}
    </div>
  );
}

export default function SupplierForm({
  initialData,
  onSubmit,
  onCancel,
  isEditing = false,
  isLoading = false,
  compact = false,
}: SupplierFormProps) {
  const [form, setForm] = useState<SupplierFormData>({
    ...emptySupplierForm,
    ...initialData,
  });
  const [submitting, setSubmitting] = useState(false);
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const bankDropdownRef = useRef<HTMLDivElement>(null);

  // Brand picker state (full mode only)
  const [allBrands, setAllBrands] = useState<Brand[]>([]);
  const [newBrandName, setNewBrandName] = useState('');
  const [addingBrand, setAddingBrand] = useState(false);

  useEffect(() => {
    if (!bankDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node)) {
        setBankDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [bankDropdownOpen]);

  // Fetch brands for full mode
  useEffect(() => {
    if (compact) return;
    apiFetch('/api/brands').then(async res => {
      if (!res.ok) return;
      const data = await res.json();
      setAllBrands((data.data || []) as Brand[]);
    }).catch(() => {});
  }, [compact]);

  const selectedBrandIds = form.brand_ids || [];
  const availableBrands = allBrands.filter(b => !selectedBrandIds.includes(b.id));

  const addBrandId = (id: string) => {
    setForm(prev => ({ ...prev, brand_ids: [...(prev.brand_ids || []), id] }));
  };
  const removeBrandId = (id: string) => {
    setForm(prev => ({ ...prev, brand_ids: (prev.brand_ids || []).filter(bid => bid !== id) }));
  };
  const handleCreateBrand = async () => {
    if (!newBrandName.trim() || addingBrand) return;
    setAddingBrand(true);
    try {
      const res = await apiFetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBrandName.trim() }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'ไม่สามารถสร้างแบรนด์ได้');
      }
      const result = await res.json();
      const created = result.data;
      setAllBrands(prev => [...prev, { id: created.id, name: created.name }]);
      addBrandId(created.id);
      setNewBrandName('');
    } catch {
      // silently fail — user will see it didn't add
    } finally {
      setAddingBrand(false);
    }
  };

  const updateField = <K extends keyof SupplierFormData>(key: K, value: SupplierFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const selectBank = (code: string) => {
    const bank = getBankByCode(code);
    setForm(prev => ({
      ...prev,
      bank_code: code,
      bank_name: bank?.name_th || '',
    }));
    setBankDropdownOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  };

  const busy = isLoading || submitting;
  const selectedBank = form.bank_code ? getBankByCode(form.bank_code) : null;

  // Bank dropdown UI (shared)
  const bankDropdown = (
    <div ref={bankDropdownRef} className="relative">
      <label className={labelClass}>ธนาคาร</label>
      <button type="button" onClick={() => setBankDropdownOpen(!bankDropdownOpen)}
        className={`${inputClass} flex items-center gap-2 text-left min-h-[42px]`}>
        {selectedBank ? (
          <>
            <BankLogo code={form.bank_code} />
            <span>{selectedBank.name_th}</span>
          </>
        ) : (
          <span className="text-gray-400">เลือกธนาคาร</span>
        )}
        <ChevronDown className="w-4 h-4 text-gray-400 ml-auto flex-shrink-0" />
      </button>
      {bankDropdownOpen && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {/* Clear option */}
          <button type="button"
            onClick={() => { updateField('bank_code', ''); updateField('bank_name', ''); setBankDropdownOpen(false); }}
            className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors text-left text-sm text-gray-400">
            — ไม่ระบุ —
          </button>
          {THAI_BANKS.map(b => (
            <button key={b.code} type="button"
              onClick={() => selectBank(b.code)}
              className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors text-left ${form.bank_code === b.code ? 'bg-primary/10' : ''}`}>
              {b.logo ? (
                <img src={b.logo} alt={b.name_th} className="w-5 h-5 rounded-full flex-shrink-0 object-contain" />
              ) : (
                <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
              )}
              <span className="text-sm text-gray-900 dark:text-white">{b.name_th}</span>
              <span className="text-xs text-gray-400 ml-auto">{b.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // --- Compact mode (modal) ---
  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className={labelClass}>
            ชื่อซัพพลายเออร์ <span className="text-red-500">*</span>
          </label>
          <input type="text" value={form.name} onChange={e => updateField('name', e.target.value)}
            className={inputClass} placeholder="ชื่อบริษัท/ซัพพลายเออร์" autoFocus />
        </div>

        {/* Type cards — same style as full mode */}
        <div>
          <label className={`${labelClass} mb-2`}>ประเภท</label>
          <div className="grid grid-cols-3 gap-2">
            {SUPPLIER_TYPES.map(type => {
              const Icon = type.icon;
              const isSelected = form.supplier_type === type.value;
              return (
                <button key={type.value} type="button"
                  onClick={() => updateField('supplier_type', type.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center ${
                    isSelected
                      ? 'border-primary bg-orange-50 dark:bg-orange-900/20'
                      : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
                  }`}>
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isSelected ? 'text-primary' : 'text-gray-400'}`} />
                  <div className={`text-xs font-medium ${isSelected ? 'text-primary' : 'text-gray-700 dark:text-slate-300'}`}>
                    {type.value === 'cash' ? 'เงินสด' : type.value === 'credit' ? 'เครดิต' : 'ฝากขาย'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Credit terms */}
        {form.supplier_type === 'credit' && (
          <div>
            <label className={labelClass}>เครดิต (วัน)</label>
            <NumberInput value={form.payment_terms}
              onChange={(n) => updateField('payment_terms', n)}
              className="w-32 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-base sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              placeholder="30" min={0} />
          </div>
        )}

        {/* Contact */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>ผู้ติดต่อ</label>
            <input type="text" value={form.contact_name} onChange={e => updateField('contact_name', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>เบอร์โทร</label>
            <input type="tel" value={form.phone} onChange={e => updateField('phone', e.target.value)} className={inputClass} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-sm">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 text-sm">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEditing ? 'บันทึก' : 'เพิ่มซัพพลายเออร์'}
          </button>
        </div>
      </form>
    );
  }

  // --- Full mode (page) — 2 columns on wide screens ---
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* ข้อมูลทั่วไป */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Factory className="w-5 h-5 text-primary" />
              ข้อมูลทั่วไป
            </h2>

            <div>
              <label className={labelClass}>
                ชื่อซัพพลายเออร์ <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.name} onChange={e => updateField('name', e.target.value)}
                className={inputClass} placeholder="ชื่อบริษัท/ซัพพลายเออร์" autoFocus />
            </div>

            {/* VAT toggle */}
            <div className="flex items-center gap-3">
              <Checkbox
                checked={form.is_vat_registered}
                onChange={checked => updateField('is_vat_registered', checked)}
              />
              <label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer"
                onClick={() => updateField('is_vat_registered', !form.is_vat_registered)}>
                จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)
              </label>
            </div>

            {/* Tax fields — show when VAT registered */}
            {form.is_vat_registered && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>เลขประจำตัวผู้เสียภาษี</label>
                  <input type="text" value={form.tax_id} onChange={e => updateField('tax_id', e.target.value)}
                    className={inputClass} placeholder="เลข 13 หลัก" />
                </div>
                <div>
                  <label className={labelClass}>สาขา</label>
                  <input type="text" value={form.branch} onChange={e => updateField('branch', e.target.value)}
                    className={inputClass} placeholder="สำนักงานใหญ่ / 00000" />
                </div>
              </div>
            )}

            {/* ที่อยู่ */}
            <div>
              <label className={labelClass}>ที่อยู่</label>
              <textarea value={form.address} onChange={e => updateField('address', e.target.value)} rows={2}
                className={`${inputClass} resize-none`} placeholder="ที่อยู่สำหรับออกบิล" />
            </div>

            {/* Supplier Type */}
            <div>
              <label className={`${labelClass} mb-2`}>ประเภท</label>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {SUPPLIER_TYPES.map(type => {
                  const Icon = type.icon;
                  const isSelected = form.supplier_type === type.value;
                  return (
                    <button key={type.value} type="button"
                      onClick={() => updateField('supplier_type', type.value)}
                      className={`flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-lg border-2 transition-all text-center ${
                        isSelected
                          ? 'border-primary bg-orange-50 dark:bg-orange-900/20'
                          : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
                      }`}>
                      <Icon className={`w-5 h-5 flex-shrink-0 ${isSelected ? 'text-primary' : 'text-gray-400'}`} />
                      <div className={`text-xs sm:text-sm font-medium ${isSelected ? 'text-primary' : 'text-gray-700 dark:text-slate-300'}`}>
                        {type.value === 'cash' ? 'เงินสด' : type.value === 'credit' ? 'เครดิต' : 'ฝากขาย'}
                      </div>
                      <div className="hidden sm:block text-xs text-gray-500 dark:text-slate-400">{type.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Credit terms */}
            {form.supplier_type === 'credit' && (
              <div>
                <label className={labelClass}>เครดิต (วัน)</label>
                <NumberInput value={form.payment_terms}
                  onChange={(n) => updateField('payment_terms', n)}
                  className="w-32 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-base sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  placeholder="30" min={0} />
              </div>
            )}
          </div>

          {/* ข้อมูลติดต่อ */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ข้อมูลติดต่อ</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>ชื่อผู้ติดต่อ</label>
                <input type="text" value={form.contact_name} onChange={e => updateField('contact_name', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>เบอร์โทร</label>
                <input type="tel" value={form.phone} onChange={e => updateField('phone', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>อีเมล</label>
                <input type="email" value={form.email} onChange={e => updateField('email', e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* ข้อมูลการเงิน */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ข้อมูลการเงิน</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>{bankDropdown}</div>
              <div>
                <label className={labelClass}>เลขบัญชี</label>
                <input type="text" value={form.bank_account} onChange={e => updateField('bank_account', e.target.value)}
                  className={inputClass} placeholder="xxx-x-xxxxx-x" />
              </div>
              <div>
                <label className={labelClass}>ชื่อบัญชี</label>
                <input type="text" value={form.bank_account_name} onChange={e => updateField('bank_account_name', e.target.value)}
                  className={inputClass} />
              </div>
            </div>
          </div>

          {/* แบรนด์ */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              แบรนด์
            </h2>

            {/* Selected brands */}
            {selectedBrandIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedBrandIds.map(id => {
                  const brand = allBrands.find(b => b.id === id);
                  if (!brand) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 dark:bg-orange-900/20 text-primary text-sm rounded-full border border-primary/20">
                      {brand.name}
                      <button type="button" onClick={() => removeBrandId(id)} className="hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded-full p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Add existing brand */}
            {availableBrands.length > 0 && (
              <FormSelect
                value=""
                onChange={value => { if (value) addBrandId(value); }}
                options={availableBrands.map(b => ({ id: b.id, label: b.name }))}
                placeholder="เลือกแบรนด์ที่มีอยู่..."
              />
            )}

            {/* Create new brand inline */}
            <div className="flex gap-2">
              <input type="text" value={newBrandName}
                onChange={e => setNewBrandName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateBrand(); } }}
                className={inputClass} placeholder="สร้างแบรนด์ใหม่..." />
              <button type="button" onClick={handleCreateBrand} disabled={!newBrandName.trim() || addingBrand}
                className="px-3 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0">
                {addingBrand ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* หมายเหตุ */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">หมายเหตุ</h2>
            <textarea value={form.notes} onChange={e => updateField('notes', e.target.value)} rows={3}
              placeholder="บันทึกข้อมูลเพิ่มเติม..."
              className={`${inputClass} resize-none`} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pb-6">
        <button type="button" onClick={onCancel}
          className="px-6 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
          ยกเลิก
        </button>
        <button type="submit" disabled={busy}
          className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEditing ? 'บันทึก' : 'เพิ่มซัพพลายเออร์'}
        </button>
      </div>
    </form>
  );
}
