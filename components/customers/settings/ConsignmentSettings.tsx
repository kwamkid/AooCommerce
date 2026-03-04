'use client';

import { PackageCheck } from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';
import BrandGpCommissions from '@/components/customers/BrandGpCommissions';

interface ConsignmentSettingsData {
  consignment_mode?: string;
  consignment_gp_rate?: number | '';
  consignment_report_due_days?: number | '';
  consignment_payment_terms?: number | '';
  contract_number?: string;
  contract_date?: string;
  rd_submitted_at?: string;
}

interface Props {
  data: ConsignmentSettingsData;
  onChange: (patch: Partial<ConsignmentSettingsData>) => void;
  inputClassName: string;
  labelClassName: string;
  customerId?: string;
}

const CONSIGNMENT_MODE_OPTIONS = [
  { id: 'dn',      label: 'ฝากขาย (DN) — ม.78(3)' },
  { id: 'invoice', label: 'เครดิตตัวแทน (Invoice)' },
];

export default function ConsignmentSettings({ data, onChange, inputClassName, labelClassName, customerId }: Props) {
  return (
    <div className="card border border-amber-200 dark:border-amber-800/50">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
        <PackageCheck className="w-5 h-5 text-amber-600" />
        ตั้งค่าฝากขาย
      </h3>
      <div className="space-y-4">
        <div>
          <label className={labelClassName}>โหมดฝากขาย</label>
          <FormSelect
            value={data.consignment_mode || ''}
            onChange={(val) => onChange({ consignment_mode: val })}
            options={CONSIGNMENT_MODE_OPTIONS}
            placeholder="— ใช้ค่า default (ตามการตั้งค่าบริษัท) —"
          />
          <p className="data-muted text-gray-400 dark:text-slate-500 mt-1">
            DN = ฝากขาย ตามมาตรา 78(3) | Invoice = เครดิตตัวแทน (ออก Invoice ทันที)
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClassName}>GP% Default (ลูกค้านี้)</label>
            <div className="relative">
              <input
                type="number"
                value={data.consignment_gp_rate ?? ''}
                onChange={(e) => onChange({ consignment_gp_rate: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                className={inputClassName}
                min="0" max="100" step="0.5"
                placeholder="ค่า default"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 data-muted">%</span>
            </div>
          </div>
          <div>
            <label className={labelClassName}>ส่งยอดภายใน (วัน)</label>
            <input
              type="number"
              value={data.consignment_report_due_days ?? ''}
              onChange={(e) => onChange({ consignment_report_due_days: e.target.value === '' ? '' : parseInt(e.target.value) })}
              className={inputClassName}
              min="1" max="90"
              placeholder="ค่า default"
            />
            <p className="data-muted text-gray-400 mt-0.5">หลังสิ้นเดือน</p>
          </div>
          <div>
            <label className={labelClassName}>ระยะเวลาชำระ (วัน)</label>
            <input
              type="number"
              value={data.consignment_payment_terms ?? ''}
              onChange={(e) => onChange({ consignment_payment_terms: e.target.value === '' ? '' : parseInt(e.target.value) })}
              className={inputClassName}
              min="0" max="180"
              placeholder="ค่า default"
            />
            <p className="data-muted text-gray-400 mt-0.5">หลังวางบิล</p>
          </div>
        </div>

        {/* Contract fields — for DN mode (or unset = could be DN) */}
        {(data.consignment_mode === 'dn' || !data.consignment_mode) && (
          <div className="border border-dashed border-amber-300 dark:border-amber-700/50 rounded-lg p-4 space-y-3 bg-amber-50/30 dark:bg-amber-900/10">
            <p className="data-muted font-medium text-amber-700 dark:text-amber-400">
              สัญญาฝากขาย (ม.78(3)) — ต้องยื่นต่อสรรพากรภายใน 15 วันนับจากวันทำสัญญา
            </p>
            <div className="grid grid-cols-2 gap-4">
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
                <input
                  type="date"
                  value={data.contract_date || ''}
                  onChange={(e) => onChange({ contract_date: e.target.value })}
                  className={inputClassName}
                />
              </div>
            </div>
            <div>
              <label className={labelClassName}>วันที่ยื่นสรรพากร</label>
              <input
                type="date"
                value={data.rd_submitted_at || ''}
                onChange={(e) => onChange({ rd_submitted_at: e.target.value })}
                className={inputClassName}
              />
              {data.contract_date && !data.rd_submitted_at && (
                <p className="data-muted text-amber-600 dark:text-amber-400 mt-1">
                  ควรยื่นภายใน {new Date(new Date(data.contract_date).getTime() + 15 * 86400000).toLocaleDateString('th-TH')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Special GP% by brand — แสดงเสมอ เพราะ customerId เป็น pre-gen UUID */}
        <div className="border-t border-amber-200 dark:border-amber-800/40 pt-4">
          <BrandGpCommissions mode="customer" customerId={customerId!} canEdit={true} />
        </div>
      </div>
    </div>
  );
}
