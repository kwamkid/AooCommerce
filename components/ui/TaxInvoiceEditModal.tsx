'use client';

import { useState } from 'react';
import TaxInfoForm, { type TaxInfoData } from './TaxInfoForm';
import Modal from './Modal';
import Button from './Button';
import SaveButton from './SaveButton';

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
  // นิติบุคคลเกือบทั้งหมดออกบิลในนามสำนักงานใหญ่ — เติมให้ล่วงหน้า แก้เป็น
  // "สาขาที่ 1" ได้ ดีกว่าปล่อยว่างแล้วบังคับให้พิมพ์คำที่ placeholder บอกอยู่แล้ว
  const [form, setForm] = useState<TaxInvoiceSnapshot>({
    ...data,
    tax_branch: data.tax_branch || (data.tax_type === 'corporate' ? 'สำนักงานใหญ่' : ''),
  });
  const [errors, setErrors] = useState<{ tax_id?: string; name?: string; branch?: string; address?: string }>({});
  const taxIdError = errors.tax_id;

  // ยังไม่เคยกรอกอะไรเลย = กำลัง "ขอ" ใบกำกับ ไม่ใช่ "แก้ไข"
  const isNew = !data.tax_id && !data.tax_company_name && !data.billing_address;

  const handleChange = (patch: Partial<TaxInfoData>) => {
    // Tax ID / Citizen ID: digits only, max 13 chars. Clears any existing
    // error while user is typing — re-validated only on save.
    if (typeof patch.tax_id === 'string') {
      patch.tax_id = patch.tax_id.replace(/\D/g, '').slice(0, 13);
      if (errors.tax_id) setErrors(prev => ({ ...prev, tax_id: undefined }));
    }
    if (patch.tax_company_name !== undefined && errors.name) setErrors(prev => ({ ...prev, name: undefined }));
    if (patch.tax_branch !== undefined && errors.branch) setErrors(prev => ({ ...prev, branch: undefined }));
    // เปลี่ยนประเภทผู้เสียภาษี → เติม/ล้างสาขาให้ตรงประเภท
    if (patch.tax_type) {
      patch.tax_branch = patch.tax_type === 'corporate' ? (form.tax_branch || 'สำนักงานใหญ่') : '';
    }
    setForm(prev => ({ ...prev, ...patch }));
  };

  /**
   * ใบกำกับภาษีเต็มรูปต้องมีครบตามประกาศกรมสรรพากร: ชื่อผู้ซื้อ + เลขประจำตัว
   * ผู้เสียภาษี + ที่อยู่ + สาขา (นิติบุคคล) — ขาดข้อใดข้อหนึ่งใบนั้นใช้ไม่ได้
   * ปล่อยให้บันทึกไม่ครบ = ไปรู้ตอนออกเอกสารจริงซึ่งสายเกินแก้แล้ว
   */
  const validate = () => {
    const next: typeof errors = {};
    const id = form.tax_id.replace(/\D/g, '');
    if (id.length !== 13) {
      next.tax_id = `ต้องเป็นตัวเลข 13 หลัก (ตอนนี้ ${id.length || 0} หลัก)`;
    }
    if (!form.tax_company_name.trim()) {
      next.name = form.tax_type === 'personal' ? 'กรุณากรอกชื่อ-นามสกุล' : 'กรุณากรอกชื่อบริษัท/กิจการ';
    }
    if (form.tax_type === 'corporate' && !form.tax_branch.trim()) {
      next.branch = 'ระบุสำนักงานใหญ่ หรือสาขาที่';
    }
    if (!form.billing_address.trim()) {
      next.address = 'กรุณากรอกที่อยู่ออกบิล';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      // โฟกัสช่องแรกที่ยังไม่ผ่าน — โมดัลนี้ยาวพอที่ error ล่างสุดจะหลุดจอ
      const first = next.name ? 'tax_company_name' : next.tax_id ? 'tax_id'
        : next.branch ? 'tax_branch' : 'billing_address';
      window.setTimeout(() => {
        document.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      }, 0);
      return false;
    }
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
      title={isNew ? 'ขอใบกำกับภาษี' : 'แก้ไขข้อมูลใบกำกับภาษี'}
      size="lg"
      footer={
        <div className="flex justify-end gap-2 px-6 py-4 flex-wrap">
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          {onSaveAndUpdateCustomer && (
            <Button
              variant="secondary"
              onClick={handleSaveAndUpdate}
              title="บันทึกในออเดอร์นี้ และอัพเดทข้อมูลลูกค้าด้วย"
            >
              บันทึก + อัพเดทลูกค้า
            </Button>
          )}
          <SaveButton onClick={handleSave} />
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
          requireFullInvoice
          taxIdError={taxIdError}
          nameError={errors.name}
          branchError={errors.branch}
          addressError={errors.address}
        />
        <p className="text-xs text-gray-400 dark:text-slate-500">{isNew ? 'บันทึกเฉพาะออเดอร์นี้ ไม่กระทบข้อมูลลูกค้า' : 'แก้ไขเฉพาะออเดอร์นี้ ไม่กระทบข้อมูลลูกค้า'}</p>
      </div>
    </Modal>
  );
}
