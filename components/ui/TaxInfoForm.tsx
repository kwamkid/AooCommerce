'use client';

import { Building2, User } from 'lucide-react';

export type TaxType = 'personal' | 'corporate';

export interface TaxInfoData {
  tax_type: TaxType;
  tax_company_name: string;
  tax_id: string;
  tax_branch: string;
}

interface Props {
  data: TaxInfoData;
  onChange: (patch: Partial<TaxInfoData>) => void;
  /** Show address field (for order modal — customer form uses main address) */
  showAddress?: boolean;
  address?: string;
  onAddressChange?: (value: string) => void;
  /** Read-only mode */
  readOnly?: boolean;
  /** Input class */
  inputClassName?: string;
  labelClassName?: string;
  /** Show required marker on tax_id */
  required?: boolean;
  /**
   * ทำเครื่องหมายบังคับกับ ชื่อ / สาขา / ที่อยู่ ด้วย — ใช้เฉพาะที่ออกใบกำกับ
   * เต็มรูปจริง (ต้องมีครบตามประกาศกรมสรรพากร)
   *
   * แยกจาก `required` เพราะ CustomerForm ส่ง required มาแต่ validate แค่เลขภาษี
   * ติดดาวให้ฟิลด์ที่ไม่มีการตรวจ = ดาวโกหก
   */
  requireFullInvoice?: boolean;
  /** ข้อความ error รายฟิลด์ (ใบกำกับเต็มรูปต้องมีชื่อ/เลขภาษี/สาขา/ที่อยู่ครบ
   *  ตามประกาศกรมสรรพากร — ขาดข้อใดข้อหนึ่งใบนั้นใช้ไม่ได้) */
  nameError?: string;
  branchError?: string;
  addressError?: string;
  /** Error message for tax_id field */
  taxIdError?: string;
}

/**
 * Shared tax info form — used in CustomerForm + TaxInvoiceModal
 * Toggle: บุคคลธรรมดา / นิติบุคคล
 */
export default function TaxInfoForm({
  data,
  onChange,
  showAddress,
  address,
  onAddressChange,
  readOnly,
  inputClassName = 'w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50',
  labelClassName = 'block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1',
  required,
  requireFullInvoice,
  nameError,
  branchError,
  addressError,
  taxIdError,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Toggle: บุคคล / นิติบุคคล */}
      {!readOnly && (
        <div className="inline-flex rounded-lg bg-gray-100 dark:bg-slate-700 p-0.5">
          <button type="button"
            onClick={() => onChange({ tax_type: 'personal', tax_branch: '' })}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
              data.tax_type === 'personal'
                ? 'bg-white dark:bg-slate-600 text-primary shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'
            }`}>
            <User className="w-3.5 h-3.5" />
            บุคคลธรรมดา
          </button>
          <button type="button"
            onClick={() => onChange({ tax_type: 'corporate' })}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
              data.tax_type === 'corporate'
                ? 'bg-white dark:bg-slate-600 text-primary shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'
            }`}>
            <Building2 className="w-3.5 h-3.5" />
            นิติบุคคล
          </button>
        </div>
      )}

      {/* Read-only badge */}
      {readOnly && (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
          data.tax_type === 'personal'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
        }`}>
          {data.tax_type === 'personal' ? <><User className="w-3 h-3" /> บุคคลธรรมดา</> : <><Building2 className="w-3 h-3" /> นิติบุคคล</>}
        </span>
      )}

      {/* ชื่อ */}
      <div>
        <label className={labelClassName}>
          {data.tax_type === 'personal' ? 'ชื่อ-นามสกุล' : 'ชื่อบริษัท/กิจการ'}
          {requireFullInvoice && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {readOnly
          ? <p className="text-sm text-gray-900 dark:text-white">{data.tax_company_name || '-'}</p>
          : <input type="text" data-field="tax_company_name" value={data.tax_company_name}
              onChange={e => onChange({ tax_company_name: e.target.value })}
              className={`${inputClassName} ${nameError ? 'border-red-400 ring-1 ring-red-400' : ''}`}
              placeholder={data.tax_type === 'personal' ? 'ชื่อ นามสกุล' : 'บริษัท XXX จำกัด'} />
        }
        {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
      </div>

      {/* เลข + สาขา */}
      {data.tax_type === 'corporate' ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClassName}>เลขประจำตัวผู้เสียภาษี{required && <span className="text-red-500 ml-0.5">*</span>}</label>
            {readOnly
              ? <p className="text-sm text-gray-900 dark:text-white">{data.tax_id || '-'}</p>
              : <input type="text" inputMode="numeric" data-field="tax_id" value={data.tax_id}
                  onChange={e => onChange({ tax_id: e.target.value })}
                  className={`${inputClassName} ${taxIdError ? 'border-red-400 ring-1 ring-red-400' : ''}`} placeholder="1234567890123" maxLength={13} />
            }
            {taxIdError && <p className="text-red-500 text-xs mt-1">{taxIdError}</p>}
          </div>
          <div>
            <label className={labelClassName}>สาขา{requireFullInvoice && <span className="text-red-500 ml-0.5">*</span>}</label>
            {readOnly
              ? <p className="text-sm text-gray-900 dark:text-white">{data.tax_branch || 'สำนักงานใหญ่'}</p>
              : <input type="text" data-field="tax_branch" value={data.tax_branch}
                  onChange={e => onChange({ tax_branch: e.target.value })}
                  className={`${inputClassName} ${branchError ? 'border-red-400 ring-1 ring-red-400' : ''}`} placeholder="สำนักงานใหญ่" />
            }
            {branchError && <p className="text-red-500 text-xs mt-1">{branchError}</p>}
          </div>
        </div>
      ) : (
        <div>
          <label className={labelClassName}>เลขประจำตัวประชาชน{required && <span className="text-red-500 ml-0.5">*</span>}</label>
          {readOnly
            ? <p className="text-sm text-gray-900 dark:text-white">{data.tax_id || '-'}</p>
            : <input type="text" inputMode="numeric" value={data.tax_id}
                onChange={e => onChange({ tax_id: e.target.value })}
                className={`${inputClassName} ${taxIdError ? 'border-red-400 ring-1 ring-red-400' : ''}`} placeholder="1234567890123" maxLength={13} />
          }
          {taxIdError && <p className="text-red-500 text-xs mt-1">{taxIdError}</p>}
        </div>
      )}

      {/* ที่อยู่ (optional — for order modal) */}
      {showAddress && onAddressChange && (
        <div>
          <label className={labelClassName}>ที่อยู่ออกบิล{requireFullInvoice && <span className="text-red-500 ml-0.5">*</span>}</label>
          {readOnly
            ? <p className="text-sm text-gray-900 dark:text-white">{address || '-'}</p>
            : <textarea data-field="billing_address" value={address || ''}
                onChange={e => onAddressChange(e.target.value)}
                className={`${inputClassName} ${addressError ? 'border-red-400 ring-1 ring-red-400' : ''}`} rows={2} placeholder="ที่อยู่สำหรับออกใบกำกับภาษี" />
          }
          {addressError && <p className="text-red-500 text-xs mt-1">{addressError}</p>}
        </div>
      )}
    </div>
  );
}
