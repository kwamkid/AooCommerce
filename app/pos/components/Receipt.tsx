// Path: app/pos/components/Receipt.tsx
'use client';

import { useState } from 'react';
import { CloseIcon, PrintIcon } from '@/lib/icons';
import { formatPrice } from '@/lib/utils/format';
import ProductName from '@/components/ui/ProductName';
import { generatePosReceiptPdf, receiptDocTitle, type ReceiptData } from '@/lib/pos-receipt-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import { useToast } from '@/lib/toast-context';

interface ReceiptProps {
  data: ReceiptData;
  onClose: () => void;
  onNewSale: () => void;
}

export default function Receipt({ data, onClose, onNewSale }: ReceiptProps) {
  const { showToast } = useToast();
  const [printing, setPrinting] = useState(false);

  // PDF กว้าง 80mm ที่ฝังขนาดไว้ในไฟล์ — เครื่องพิมพ์พิมพ์ตามนั้นโดยไม่ต้องตั้งขนาด
  // กระดาษเอง (เดิม `window.print()` ได้ผลต่างกันตามการตั้งค่า driver ของแต่ละเครื่อง)
  const handlePrint = async () => {
    setPrinting(true);
    try {
      const blob = await generatePosReceiptPdf(data);
      showPdfPreview(blob, `${docTitle} ${docNumber}`);
    } catch (err) {
      console.error('receipt pdf failed:', err);
      showToast('สร้างใบเสร็จไม่สำเร็จ', 'error');
    } finally {
      setPrinting(false);
    }
  };

  const dateStr = new Date(data.order.created_at).toLocaleString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const vatRegistered = data.company.vat_registered || false;
  const docTitle = receiptDocTitle(vatRegistered);
  const docNumber = data.order.tax_invoice_number || data.order.receipt_number;
  // Prefer the legal/tax-registered name over the brand name for ABB compliance
  const displayName = data.company.tax_company_name?.trim() || data.company.name;
  const branchLabel = vatRegistered ? data.company.tax_branch?.trim() : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 print:bg-white print:static print:block" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-sm mx-4 max-h-[90vh] overflow-y-auto print:rounded-none print:max-w-none print:mx-0 print:max-h-none print:shadow-none print:overflow-visible"
        onClick={e => e.stopPropagation()}
      >
        {/* Screen-only controls */}
        <div className="flex items-center justify-between p-4 border-b print:hidden">
          <h3 className="text-lg font-bold text-gray-900">{docTitle}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={printing}
              className="p-2 text-gray-600 hover:text-primary transition-colors disabled:opacity-50"
              title="พิมพ์"
            >
              <PrintIcon className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 text-gray-600 hover:text-gray-900">
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Receipt content — thermal-friendly */}
        <div className="p-6 text-center text-sm text-gray-900 print:p-2 print:text-xs" id="receipt-content">
          {/* Company header */}
          {data.company.logo_url && (
            <img
              src={data.company.logo_url}
              alt={data.company.name}
              className="w-14 h-14 rounded-full object-cover mx-auto mb-2"
            />
          )}
          <p className="font-bold text-base">{displayName}</p>
          {/* VAT branch — bolded so it's obvious which registration the
              receipt was issued under (required for multi-branch businesses) */}
          {branchLabel && (
            <p className="text-xs font-medium text-gray-700">({branchLabel})</p>
          )}
          {data.company.address && <p className="text-xs text-gray-600">{data.company.address}</p>}
          {data.company.phone && <p className="text-xs text-gray-600">โทร: {data.company.phone}</p>}
          {data.company.tax_id && (
            <p className="text-xs text-gray-600">เลขผู้เสียภาษี: {data.company.tax_id}</p>
          )}

          {/* Document title */}
          <p className="font-bold text-base mt-2 text-green-700">{docTitle}</p>

          <div className="border-t border-dashed border-gray-300 my-3" />

          {/* Receipt info */}
          <div className="text-left space-y-0.5">
            <p>เลขที่: <span className="code-text font-bold">{docNumber}</span></p>
            <p>วันที่: {dateStr}</p>
            <p>แคชเชียร์: {data.cashier_name}</p>
            <p>สาขา: {data.branch_name}</p>
            {data.order.customer_name !== 'ลูกค้าทั่วไป' && (
              <p>ลูกค้า: {data.order.customer_name}</p>
            )}
          </div>

          <div className="border-t border-dashed border-gray-300 my-3" />

          {/* Items */}
          <div className="text-left">
            {data.items.map((item, i) => (
              <div key={i} className="py-0.5">
                <div className="flex justify-between">
                  <div className="flex-1 min-w-0">
                    <ProductName item={item} as="span" lines={1} className="block" />
                  </div>
                  <span className="ml-2 whitespace-nowrap">฿{formatPrice(item.total)}</span>
                </div>
                <div className="text-gray-500 text-xs">
                  {item.quantity} x ฿{formatPrice(item.unit_price)}
                  {item.sku && <span className="ml-2">SKU: <span className="code-text">{item.sku}</span></span>}
                  {item.barcode && <span className="ml-2">BC: <span className="code-text">{item.barcode}</span></span>}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-gray-300 my-3" />

          {/* Totals */}
          <div className="text-left space-y-0.5">
            <div className="flex justify-between">
              <span>รวม</span>
              <span>฿{formatPrice(Number(data.order.subtotal) + Number(data.order.vat_amount) + Number(data.order.discount_amount))}</span>
            </div>
            {Number(data.order.discount_amount) > 0 && (
              <div className="flex justify-between text-red-600">
                <span>ส่วนลด</span>
                <span>-฿{formatPrice(data.order.discount_amount)}</span>
              </div>
            )}
            {data.order.vat_amount > 0 && (
              <>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>มูลค่าก่อน VAT</span>
                  <span>฿{formatPrice(data.order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>VAT 7%</span>
                  <span>฿{formatPrice(data.order.vat_amount)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-base pt-1">
              <span>ยอดชำระ</span>
              <span>฿{formatPrice(data.order.total_amount)}</span>
            </div>
            {/* Required by Revenue Code §86/6 — must explicitly state that the
                stated price already includes VAT */}
            {vatRegistered && data.order.vat_amount > 0 && (
              <p className="text-xs text-gray-500 text-right pt-0.5">
                ราคารวมภาษีมูลค่าเพิ่มแล้ว
              </p>
            )}
          </div>

          <div className="border-t border-dashed border-gray-300 my-3" />

          {/* Payment details */}
          <div className="text-left space-y-0.5">
            {data.payments.map((p, i) => (
              <div key={i} className="flex justify-between">
                <span>{p.channel_name}</span>
                <span>฿{formatPrice(p.amount)}</span>
              </div>
            ))}
            {(data.change_amount ?? 0) > 0 && (
              <div className="flex justify-between font-medium">
                <span>เงินทอน</span>
                <span>฿{formatPrice(data.change_amount!)}</span>
              </div>
            )}
          </div>

          <div className="border-t border-dashed border-gray-300 my-3" />

          <p className="text-gray-500 text-xs">ขอบคุณที่อุดหนุนค่ะ</p>
        </div>

        {/* Actions — screen only */}
        <div className="p-4 border-t flex gap-3 print:hidden">
          <button
            onClick={onNewSale}
            className="flex-1 py-3 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl transition-colors"
          >
            ขายรายการถัดไป
          </button>
        </div>
      </div>
    </div>
  );
}
