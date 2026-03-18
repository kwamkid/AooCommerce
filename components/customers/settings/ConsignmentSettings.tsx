'use client';

import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import GpOverridePanel, { type BrandGpRow } from '@/components/customers/GpOverridePanel';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { apiFetch } from '@/lib/api-client';

export { type BrandGpRow };

interface ConsignmentSettingsData {
  consignment_gp_rate?: number | '';
  consignment_gp_base_price?: 'retail' | 'discounted' | null;
  consignment_report_due_days?: number | '';
  consignment_payment_terms?: number | '';
  contract_number?: string;
  contract_date?: string;
  rd_submitted_at?: string;
}

interface CompanyDefaults {
  default_gp_rate: number;
  default_gp_base_price: 'retail' | 'discounted';
  default_report_due_days: number;
  default_payment_terms: number;
}

interface Props {
  data: ConsignmentSettingsData;
  onChange: (patch: Partial<ConsignmentSettingsData>) => void;
  inputClassName: string;
  labelClassName: string;
  brandGpRows: BrandGpRow[];
  onBrandGpRowsChange: (rows: BrandGpRow[]) => void;
  /** ซ่อนส่วนสัญญาฝากขาย — ใช้สำหรับห้าง (ไม่มีสัญญา ม.78(3)) */
  hideContract?: boolean;
  /** ขายขาด mode: เปลี่ยน label GP → ส่วนลด, ซ่อนเงื่อนไขชำระ + สัญญา */
  wholesale?: boolean;
}

function generateContractNumber() {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `CSN-${ym}-${rand}`;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ── Tab-style toggle: "ตามระบบ" vs "กำหนดเอง" ───────────────────────────
function DefaultOrCustomTab({
  isCustom,
  onToggle,
  defaultDesc,
}: {
  isCustom: boolean;
  onToggle: (custom: boolean) => void;
  defaultDesc?: string;
}) {
  const base = 'px-3 py-1.5 text-base font-medium transition-all cursor-pointer';
  const active = 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-400 shadow-sm';
  const inactive = 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300';
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="inline-flex rounded-lg bg-gray-100 dark:bg-slate-800 p-0.5">
        <button type="button" onClick={() => onToggle(false)} className={`${base} rounded-md ${!isCustom ? active : inactive}`}>
          ตามระบบ
        </button>
        <button type="button" onClick={() => onToggle(true)} className={`${base} rounded-md ${isCustom ? active : inactive}`}>
          กำหนดเอง
        </button>
      </div>
      {!isCustom && defaultDesc && (
        <span className="text-base text-gray-400 dark:text-slate-500">{defaultDesc}</span>
      )}
      {isCustom && (
        <span className="text-sm text-amber-600/70 dark:text-amber-400/60">จะไม่เปลี่ยนตาม ตั้งค่า &gt; ฝากขาย</span>
      )}
    </div>
  );
}

const GP_BASE_LABELS: Record<string, string> = { retail: 'ราคาปลีก', discounted: 'ราคาลด' };

export default function ConsignmentSettings({ data, onChange, inputClassName, labelClassName, brandGpRows, onBrandGpRowsChange, hideContract, wholesale }: Props) {
  const [defaults, setDefaults] = useState<CompanyDefaults | null>(null);

  useEffect(() => {
    apiFetch('/api/settings/features').then(r => r.json()).then(d => {
      const cs = d.consignment_settings;
      if (cs) {
        setDefaults({
          default_gp_rate: cs.default_gp_rate ?? 30,
          default_gp_base_price: cs.default_gp_base_price || 'retail',
          default_report_due_days: cs.default_report_due_days ?? 15,
          default_payment_terms: cs.default_payment_terms ?? 30,
        });
      }
    }).catch(() => {});
  }, []);

  // Custom = has value in DB, Default = null/empty → resolve from global at runtime
  const isCustomGp = data.consignment_gp_rate !== '' && data.consignment_gp_rate != null;
  const isCustomTerms = (data.consignment_report_due_days !== '' && data.consignment_report_due_days != null)
    || (data.consignment_payment_terms !== '' && data.consignment_payment_terms != null);

  const gpRate = isCustomGp ? Number(data.consignment_gp_rate) : null;

  return (
    <div className="space-y-4">

      {/* ─── 1. GP% / ส่วนลด + Brand GP ─── */}
      <div>
        <p className="text-base font-medium text-gray-600 dark:text-slate-400 mb-2">{wholesale ? 'ส่วนลดตัวแทน' : 'GP% ตัวแทน'}</p>
        <DefaultOrCustomTab
          isCustom={isCustomGp}
          onToggle={(custom) => {
            if (!custom) {
              // Clear → runtime จะ resolve จาก global settings
              onChange({ consignment_gp_rate: '', consignment_gp_base_price: null });
            } else {
              // Pre-fill ด้วย global default เป็นจุดเริ่มต้น
              onChange({
                consignment_gp_rate: defaults?.default_gp_rate ?? 30,
                consignment_gp_base_price: defaults?.default_gp_base_price ?? 'retail',
              });
            }
          }}
          defaultDesc={defaults ? `GP ${defaults.default_gp_rate}% จาก${GP_BASE_LABELS[defaults.default_gp_base_price]} + Brand GP ตามที่ตั้งไว้` : undefined}
        />

        {isCustomGp && (
          <div className="mt-1">
            <GpOverridePanel
              mode="customer"
              gpRate={gpRate}
              gpBasePrice={data.consignment_gp_base_price ?? null}
              onGpRateChange={(v) => onChange({ consignment_gp_rate: v ?? '' })}
              onGpBasePriceChange={(v) => onChange({ consignment_gp_base_price: v })}
              brandGpRows={brandGpRows}
              onBrandGpRowsChange={onBrandGpRowsChange}
              canEdit={true}
              defaultGpRate={defaults?.default_gp_rate}
              defaultGpBasePrice={defaults?.default_gp_base_price}
            />
          </div>
        )}
      </div>

      {/* ─── 3. เงื่อนไขการชำระ (ฝากขายเท่านั้น) ─── */}
      {!wholesale && (<div>
        <p className="text-base font-medium text-gray-600 dark:text-slate-400 mb-2">เงื่อนไขการชำระ</p>
        <DefaultOrCustomTab
          isCustom={isCustomTerms}
          onToggle={(custom) => {
            if (!custom) {
              onChange({ consignment_report_due_days: '', consignment_payment_terms: '' });
            } else {
              onChange({
                consignment_report_due_days: defaults?.default_report_due_days ?? 15,
                consignment_payment_terms: defaults?.default_payment_terms ?? 30,
              });
            }
          }}
          defaultDesc={defaults ? `ส่งยอด ${defaults.default_report_due_days} วัน / ชำระ ${defaults.default_payment_terms} วัน` : undefined}
        />

        {isCustomTerms && (
          <div className="grid grid-cols-2 gap-3 mt-1">
            <div>
              <label className={labelClassName}>ส่งยอดภายใน</label>
              <div className="relative">
                <input
                  type="number"
                  value={data.consignment_report_due_days ?? ''}
                  onChange={(e) => onChange({ consignment_report_due_days: e.target.value === '' ? '' : parseInt(e.target.value) })}
                  className={inputClassName}
                  min="1" max="90"
                  placeholder={defaults ? String(defaults.default_report_due_days) : '15'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">วัน</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">หลังสิ้นเดือน</p>
            </div>
            <div>
              <label className={labelClassName}>ชำระภายใน</label>
              <div className="relative">
                <input
                  type="number"
                  value={data.consignment_payment_terms ?? ''}
                  onChange={(e) => onChange({ consignment_payment_terms: e.target.value === '' ? '' : parseInt(e.target.value) })}
                  className={inputClassName}
                  min="0" max="180"
                  placeholder={defaults ? String(defaults.default_payment_terms) : '30'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">วัน</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">หลังวางบิล</p>
            </div>
          </div>
        )}
      </div>)}

      {/* ─── 4. สัญญาฝากขาย (DN — ม.78(3)) — ซ่อนสำหรับห้าง + ขายขาด ─── */}
      {!hideContract && !wholesale && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-900/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-amber-800 dark:text-amber-300">สัญญาฝากขาย (ม.78(3))</p>
              <p className="text-sm text-amber-600/70 dark:text-amber-400/70">ต้องยื่นต่อสรรพากรภายใน 15 วันนับจากวันทำสัญญา</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const patch: Partial<ConsignmentSettingsData> = {};
                if (!data.contract_number) patch.contract_number = generateContractNumber();
                if (!data.contract_date) patch.contract_date = toISODate(new Date());
                if (Object.keys(patch).length > 0) onChange(patch);
              }}
              className="flex items-center gap-1.5 text-base font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
            >
              <FileText className="w-4 h-4" />
              พิมพ์สัญญา
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClassName}>เลขที่สัญญา</label>
              <input
                type="text"
                value={data.contract_number || ''}
                onChange={(e) => onChange({ contract_number: e.target.value })}
                className={inputClassName}
                placeholder="เช่น CSN-2026-001"
              />
            </div>
            <div>
              <label className={labelClassName}>วันที่ทำสัญญา</label>
              <DateRangePicker
                asSingle
                useRange={false}
                showShortcuts={false}
                showFooter={false}
                placeholder="เลือกวันที่"
                value={data.contract_date ? { startDate: data.contract_date, endDate: data.contract_date } : null}
                onChange={(v) => onChange({ contract_date: v?.startDate ? String(v.startDate) : '' })}
              />
            </div>
          </div>

          <div>
            <label className={labelClassName}>วันที่ยื่นสรรพากร</label>
            <DateRangePicker
              asSingle
              useRange={false}
              showShortcuts={false}
              showFooter={false}
              placeholder="เลือกวันที่"
              value={data.rd_submitted_at ? { startDate: data.rd_submitted_at, endDate: data.rd_submitted_at } : null}
              onChange={(v) => onChange({ rd_submitted_at: v?.startDate ? String(v.startDate) : '' })}
            />
            {data.contract_date && !data.rd_submitted_at && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1 font-medium">
                ควรยื่นภายใน {new Date(new Date(data.contract_date).getTime() + 15 * 86400000).toLocaleDateString('th-TH')}
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
