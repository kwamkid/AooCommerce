'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import TaxInfoForm, { type TaxType } from '@/components/ui/TaxInfoForm';
import Modal from '@/components/ui/Modal';

interface TaxInvoiceModalProps {
  orderId: string;
  orderNumber: string;
  customerId?: string;
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

  const [taxType, setTaxType] = useState<TaxType>('corporate');
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [branch, setBranch] = useState('สำนักงานใหญ่');
  const [address, setAddress] = useState('');

  // Pre-fill from customer
  useEffect(() => {
    if (!customerId) { setPrefilling(false); return; }
    (async () => {
      try {
        const res = await apiFetch(`/api/customers/${customerId}`);
        if (res.ok) {
          const data = await res.json();
          const c = data.customer || data;

          if (c.tax_type === 'personal' || c.customer_type === 'individual' || (!c.tax_company_name && c.name)) {
            setTaxType('personal');
            setName(c.name || '');
          } else {
            setTaxType('corporate');
            if (c.tax_company_name) setName(c.tax_company_name);
          }

          if (c.tax_id) setTaxId(c.tax_id);
          if (c.tax_branch) setBranch(c.tax_branch);
          const addrParts = [c.billing_address, c.billing_district, c.billing_amphoe, c.billing_province, c.billing_postal_code].filter(Boolean).join(' ');
          if (addrParts) setAddress(addrParts);
        }
      } catch { /* ignore */ }
      finally { setPrefilling(false); }
    })();
  }, [customerId]);

  const handleSave = async () => {
    if (!name.trim()) {
      showToast(taxType === 'corporate' ? 'กรุณากรอกชื่อกิจการ' : 'กรุณากรอกชื่อผู้ซื้อ', 'error');
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
          tax_invoice_branch: taxType === 'corporate' ? branch.trim() : '',
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

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`ออกใบกำกับภาษี — ${orderNumber}`}
      size="md"
      footer={
        <div className="flex justify-end gap-2 px-5 py-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={loading || prefilling}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {hasAbbrev ? 'ออกใบกำกับภาษี (ยกเลิก ABB)' : 'บันทึก'}
          </button>
        </div>
      }
    >
      <div className="px-5 py-4">
        {prefilling ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">กำลังโหลดข้อมูล...</span>
          </div>
        ) : (
          <>
            {hasAbbrev && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 mb-4">
                ระบบจะยกเลิกใบกำกับอย่างย่อที่ออกไปแล้ว และออกใบกำกับภาษีแทน
              </p>
            )}

            <TaxInfoForm
              data={{ tax_type: taxType, tax_company_name: name, tax_id: taxId, tax_branch: branch }}
              onChange={(patch) => {
                if (patch.tax_type !== undefined) setTaxType(patch.tax_type);
                if (patch.tax_company_name !== undefined) setName(patch.tax_company_name);
                if (patch.tax_id !== undefined) setTaxId(patch.tax_id);
                if (patch.tax_branch !== undefined) setBranch(patch.tax_branch);
              }}
              showAddress
              address={address}
              onAddressChange={setAddress}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
