'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import TaxInfoForm, { type TaxInfoData } from './TaxInfoForm';

export interface TaxInvoiceSnapshot {
  tax_type: 'personal' | 'corporate';
  tax_company_name: string;
  tax_id: string;
  tax_branch: string;
  billing_address: string;
}

interface Props {
  data: TaxInvoiceSnapshot;
  onSave: (data: TaxInvoiceSnapshot) => void;
  onClose: () => void;
}

const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1";

/**
 * Modal for editing tax invoice info on an order.
 * Edits are snapshot-only — does NOT patch back to customer.
 */
export default function TaxInvoiceEditModal({ data, onSave, onClose }: Props) {
  const [form, setForm] = useState<TaxInvoiceSnapshot>({ ...data });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl max-w-lg w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">แก้ไขข้อมูลใบกำกับภาษี</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <TaxInfoForm
            data={form as TaxInfoData}
            onChange={(patch) => setForm(prev => ({ ...prev, ...patch }))}
            showAddress
            address={form.billing_address}
            onAddressChange={(v) => setForm(prev => ({ ...prev, billing_address: v }))}
            inputClassName={inputClass}
            labelClassName={labelClass}
          />
          <p className="text-xs text-gray-400 dark:text-slate-500">แก้ไขเฉพาะออเดอร์นี้ ไม่กระทบข้อมูลลูกค้า</p>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-slate-700">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
            ยกเลิก
          </button>
          <button type="button" onClick={() => onSave(form)}
            className="px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors">
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
