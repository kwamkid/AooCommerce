'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import TaxInvoiceEditModal, { type TaxInvoiceSnapshot } from './TaxInvoiceEditModal';

interface TaxInvoiceInfoProps {
  /** Customer name — to hide tax_company_name if same */
  customerName: string;
  /** Tax data */
  taxCompanyName: string;
  taxId: string;
  taxBranch: string;
  billingAddress: string;
  /** Allow editing → show "แก้ไข" button + modal */
  onEdit?: (data: TaxInvoiceSnapshot) => void;
  /** Compact mode (view/disabled) — simpler display */
  compact?: boolean;
}

/**
 * Shared tax invoice info display + edit button
 * Used below เบอร์โทร/อีเมล in DealerOrderForm + ReplenishmentForm
 */
export default function TaxInvoiceInfo({
  customerName, taxCompanyName, taxId, taxBranch, billingAddress, onEdit, compact,
}: TaxInvoiceInfoProps) {
  const [showModal, setShowModal] = useState(false);
  const hasTax = taxId || taxCompanyName;

  if (compact) {
    if (!hasTax) return null;
    const parts = [
      taxCompanyName && taxCompanyName !== customerName ? taxCompanyName : null,
      taxId, taxBranch,
    ].filter(Boolean);
    return <p className="text-sm text-gray-500 dark:text-slate-400">ข้อมูลใบกำกับ: {parts.join('  ')}</p>;
  }

  return (
    <>
      <div className="text-sm text-gray-500 dark:text-slate-400 space-y-1 pt-2 mt-1 border-t border-gray-100 dark:border-slate-700">
        {hasTax ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="font-medium text-gray-600 dark:text-slate-300">ข้อมูลใบกำกับ:</span>
              {taxCompanyName && taxCompanyName !== customerName && <span>{taxCompanyName}</span>}
              {taxId && <span>{taxId}</span>}
              {taxBranch && <span>{taxBranch}</span>}
            </div>
            {billingAddress && (
              <div className="flex items-start gap-1 text-xs">
                <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                <span>{billingAddress}</span>
                {onEdit && (
                  <button type="button" onClick={() => setShowModal(true)}
                    className="text-[#F4511E] hover:text-[#D63B0E] hover:underline transition-colors ml-1 flex-shrink-0">
                    แก้ไข
                  </button>
                )}
              </div>
            )}
            {!billingAddress && onEdit && (
              <button type="button" onClick={() => setShowModal(true)}
                className="text-xs text-[#F4511E] hover:text-[#D63B0E] hover:underline transition-colors">
                แก้ไข
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-orange-500 dark:text-orange-400">ยังไม่มีข้อมูลภาษี</span>
            {onEdit && (
              <button type="button" onClick={() => setShowModal(true)}
                className="text-xs text-[#F4511E] hover:text-[#D63B0E] hover:underline transition-colors">
                แก้ไข
              </button>
            )}
          </div>
        )}
      </div>

      {showModal && onEdit && (
        <TaxInvoiceEditModal
          data={{
            tax_type: (taxId && !taxCompanyName?.includes('บริษัท') ? 'personal' : 'corporate') as 'personal' | 'corporate',
            tax_company_name: taxCompanyName, tax_id: taxId, tax_branch: taxBranch, billing_address: billingAddress,
          }}
          onSave={(data) => { onEdit(data); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
