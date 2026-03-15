'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Building2, User } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';

type BuyerType = 'company' | 'individual';

interface TaxInvoiceModalProps {
  orderId: string;
  orderNumber: string;
  customerId?: string;
  /** ถ้า true = มี ABB อยู่แล้ว → ใช้ void_abbreviated_invoice แทน set_tax_invoice */
  hasAbbrev?: boolean;
  onClose: () => void;
  onSaved: (updatedOrder: Record<string, unknown>) => void;
}

export default function TaxInvoiceModal({
  orderId,
  orderNumber,
  customerId,
  hasAbbrev = false,
  onClose,
  onSaved,
}: TaxInvoiceModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [prefilling, setPrefilling] = useState(true);

  const [buyerType, setBuyerType] = useState<BuyerType>('company');
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [branch, setBranch] = useState('สำนักงานใหญ่');
  const [address, setAddress] = useState('');

  // Pre-fill from customer tax fields
  useEffect(() => {
    if (!customerId) {
      setPrefilling(false);
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(`/api/customers/${customerId}`);
        if (res.ok) {
          const data = await res.json();
          const c = data.customer || data;

          // Auto-detect buyer type from customer data
          if (c.customer_type === 'individual' || (!c.tax_company_name && c.name)) {
            setBuyerType('individual');
            setName(c.name || '');
          } else {
            setBuyerType('company');
            if (c.tax_company_name) setName(c.tax_company_name);
          }

          if (c.tax_id) setTaxId(c.tax_id);
          if (c.tax_branch) setBranch(c.tax_branch);
          const addrParts = [
            c.billing_address, c.billing_district, c.billing_amphoe,
            c.billing_province, c.billing_postal_code,
          ].filter(Boolean).join(' ');
          if (addrParts) setAddress(addrParts);
        }
      } catch {
        // Ignore pre-fill errors
      } finally {
        setPrefilling(false);
      }
    })();
  }, [customerId]);

  const handleSave = async () => {
    if (!name.trim()) {
      showToast(buyerType === 'company' ? 'กรุณากรอกชื่อกิจการ' : 'กรุณากรอกชื่อผู้ซื้อ', 'error');
      return;
    }
    if (!taxId.trim()) {
      showToast('กรุณากรอกเลขประจำตัวผู้เสียภาษี', 'error');
      return;
    }

    setLoading(true);
    try {
      const action = hasAbbrev ? 'void_abbreviated_invoice' : 'set_tax_invoice';
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          id: orderId,
          tax_invoice_name: name.trim(),
          tax_invoice_tax_id: taxId.trim(),
          tax_invoice_branch: buyerType === 'company' ? branch.trim() : '',
          tax_invoice_address: address.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'บันทึกไม่สำเร็จ');
      }

      const result = await res.json();
      showToast('บันทึกข้อมูลใบกำกับภาษีสำเร็จ', 'success');
      onSaved(result.order || result);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-green-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
            ออกใบกำกับภาษี — {orderNumber}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {prefilling ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-500">กำลังโหลดข้อมูล...</span>
            </div>
          ) : (
            <>
              {hasAbbrev && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                  ระบบจะยกเลิกใบกำกับอย่างย่อที่ออกไปแล้ว และออกใบกำกับภาษีแทน
                </p>
              )}

              {/* Buyer type toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBuyerType('company')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    buyerType === 'company'
                      ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 ring-1 ring-green-500'
                      : 'bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-600'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  นิติบุคคล
                </button>
                <button
                  type="button"
                  onClick={() => setBuyerType('individual')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    buyerType === 'individual'
                      ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 ring-1 ring-green-500'
                      : 'bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-600'
                  }`}
                >
                  <User className="w-4 h-4" />
                  บุคคลธรรมดา
                </button>
              </div>

              {/* ชื่อ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  {buyerType === 'company' ? 'ชื่อบริษัท/กิจการ' : 'ชื่อ-นามสกุล'}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder={buyerType === 'company' ? 'บริษัท XXX จำกัด' : 'ชื่อ นามสกุล'}
                />
              </div>

              {/* เลขผู้เสียภาษี + สาขา (สาขาเฉพาะนิติบุคคล) */}
              <div className={buyerType === 'company' ? 'grid grid-cols-2 gap-3' : ''}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    {buyerType === 'company' ? 'เลขประจำตัวผู้เสียภาษี' : 'เลขประจำตัวผู้เสียภาษี/บัตรประชาชน'}
                  </label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className={inputClass}
                    placeholder={buyerType === 'company' ? 'X-XXXX-XXXXX-XX-X' : 'X-XXXX-XXXXX-XX-X'}
                    maxLength={17}
                  />
                </div>
                {buyerType === 'company' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">สาขา</label>
                    <input
                      type="text"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className={inputClass}
                      placeholder="สำนักงานใหญ่"
                    />
                  </div>
                )}
              </div>

              {/* ที่อยู่ออกบิล */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่ออกบิล</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder="เลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={loading || prefilling}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            บันทึกและพิมพ์
          </button>
        </div>
      </div>
    </div>
  );
}
