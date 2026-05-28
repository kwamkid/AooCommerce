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
  /** Render an additional "Save and also update customer record" button.
   *  Use this when the customer already has tax info on file and the user
   *  is editing — they choose whether the change is order-snapshot-only or
   *  should also overwrite the customer master. */
  onSaveAndUpdateCustomer?: (data: TaxInvoiceSnapshot) => void;
}

// 16px (text-base) — matches the rest of the form, IBM Plex Sans Thai
const inputClass = "w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base font-sans bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50";
const labelClass = "block text-base font-medium text-gray-700 dark:text-slate-300 mb-1";

/**
 * Modal for editing tax invoice info on an order.
 * Edits are snapshot-only — does NOT patch back to customer.
 */
export default function TaxInvoiceEditModal({ data, onSave, onClose, onSaveAndUpdateCustomer }: Props) {
  const [form, setForm] = useState<TaxInvoiceSnapshot>({ ...data });
  const [taxIdError, setTaxIdError] = useState<string | undefined>();

  const handleChange = (patch: Partial<TaxInfoData>) => {
    // Tax ID / Citizen ID: digits only, max 13 chars. Clears any existing
    // error while user is typing — re-validated only on save.
    if (typeof patch.tax_id === 'string') {
      patch.tax_id = patch.tax_id.replace(/\D/g, '').slice(0, 13);
      if (taxIdError) setTaxIdError(undefined);
    }
    setForm(prev => ({ ...prev, ...patch }));
  };

  // Validate before either save path; returns true if OK.
  const validate = () => {
    const id = form.tax_id.trim();
    if (id.length !== 13) {
      setTaxIdError(`ต้องเป็นตัวเลข 13 หลัก (ตอนนี้ ${id.length || 0} หลัก)`);
      return false;
    }
    setTaxIdError(undefined);
    return true;
  };

  const handleSave = () => {
    if (validate()) onSave(form);
  };

  const handleSaveAndUpdate = () => {
    if (validate()) onSaveAndUpdateCustomer!(form);
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="แก้ไขข้อมูลใบกำกับภาษี"
      size="lg"
      footer={
        <div className="flex justify-end gap-2 px-6 py-4 flex-wrap">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
            ยกเลิก
          </button>
          <button type="button" onClick={handleSave}
            className="px-4 py-2 border border-primary text-primary rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
            บันทึก
          </button>
          {onSaveAndUpdateCustomer && (
            <button type="button" onClick={handleSaveAndUpdate}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
              title="บันทึกในออเดอร์นี้ และอัพเดทข้อมูลลูกค้าด้วย">
              บันทึก + อัพเดทลูกค้า
            </button>
          )}
        </div>
      }
    >
      <div className="px-6 py-5 space-y-4">
        <TaxInfoForm
          data={form as TaxInfoData}
          onChange={handleChange}
          showAddress
          address={form.billing_address}
          onAddressChange={(v) => setForm(prev => ({ ...prev, billing_address: v }))}
          inputClassName={inputClass}
          labelClassName={labelClass}
          required
          taxIdError={taxIdError}
        />
        <p className="text-xs text-gray-400 dark:text-slate-500">แก้ไขเฉพาะออเดอร์นี้ ไม่กระทบข้อมูลลูกค้า</p>
      </div>
    </Modal>
  );
}
