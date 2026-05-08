'use client';

import { useState } from 'react';
import TaxInfoForm, { type TaxInfoData } from './TaxInfoForm';
import Modal from './Modal';

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

const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1";

/**
 * Modal for editing tax invoice info on an order.
 * Edits are snapshot-only — does NOT patch back to customer.
 */
export default function TaxInvoiceEditModal({ data, onSave, onClose }: Props) {
  const [form, setForm] = useState<TaxInvoiceSnapshot>({ ...data });

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="แก้ไขข้อมูลใบกำกับภาษี"
      size="lg"
      footer={
        <div className="flex justify-end gap-3 px-6 py-4">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
            ยกเลิก
          </button>
          <button type="button" onClick={() => onSave(form)}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors">
            บันทึก
          </button>
        </div>
      }
    >
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
    </Modal>
  );
}
