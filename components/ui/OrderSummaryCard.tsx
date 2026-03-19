'use client';

import { useState } from 'react';
import DiscountInput from '@/components/ui/DiscountInput';
import PostfixInput from '@/components/ui/PostfixInput';

interface Props {
  /** ยอดรวมราคาเต็ม (ก่อนส่วนลดรายการ) */
  totalOriginal: number;
  /** ยอดหลังส่วนลดรายการ */
  subtotal: number;
  /** ส่วนลดทั้งบิล (฿ หรือ %) */
  billDiscount?: number;
  billDiscountType?: 'amount' | 'percent';
  onBillDiscountChange?: (value: number, type: 'amount' | 'percent') => void;
  /** ค่าจัดส่ง */
  shippingFee?: number;
  onShippingFeeChange?: (value: number) => void;
  /** บริษัทจด VAT หรือไม่ */
  vatRegistered?: boolean;
  /** VAT rate (default 7) */
  vatRate?: number;
  /** Title */
  title?: string;
  /** Sticky */
  sticky?: boolean;
}

export default function OrderSummaryCard({
  totalOriginal,
  subtotal,
  billDiscount = 0,
  billDiscountType = 'amount',
  onBillDiscountChange,
  shippingFee = 0,
  onShippingFeeChange,
  vatRegistered = false,
  vatRate = 7,
  title = 'สรุปคำสั่งซื้อ',
  sticky = true,
}: Props) {
  const [discType, setDiscType] = useState<'amount' | 'percent'>(billDiscountType);

  const itemDiscount = totalOriginal - subtotal;

  // Bill-level discount
  const billDiscAmt = discType === 'percent'
    ? Math.round(subtotal * billDiscount / 100 * 100) / 100
    : billDiscount;
  const afterBillDiscount = subtotal - billDiscAmt;

  // Shipping
  const afterShipping = afterBillDiscount + shippingFee;

  // VAT
  const beforeVat = vatRegistered ? Math.round(afterShipping / (1 + vatRate / 100) * 100) / 100 : afterShipping;
  const vatAmount = vatRegistered ? afterShipping - beforeVat : 0;
  const grandTotal = afterShipping;

  const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3 ${sticky ? 'lg:sticky lg:top-4' : ''}`}>
      <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>

      <div className="space-y-2 text-sm">
        {/* ยอดรวมราคาเต็ม (แสดงเฉพาะเมื่อมีส่วนลดรายการ) */}
        {itemDiscount > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-slate-400">ยอดรวมสินค้า (ราคาเต็ม)</span>
            <span className="text-gray-900 dark:text-white">฿{fmt(totalOriginal)}</span>
          </div>
        )}

        {/* ส่วนลดรายการ */}
        {itemDiscount > 0 && (
          <div className="flex justify-between text-green-600 dark:text-green-400">
            <span>ส่วนลดรายการ</span>
            <span>-฿{fmt(itemDiscount)}</span>
          </div>
        )}

        {/* ยอดหลังลดรายการ */}
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-slate-400">ยอดรวมสินค้า{itemDiscount > 0 ? ' (หลังลด)' : ''}</span>
          <span className="text-gray-900 dark:text-white">฿{fmt(subtotal)}</span>
        </div>

        {/* ค่าจัดส่ง */}
        {onShippingFeeChange !== undefined && (
          <div className="flex justify-between items-center gap-3">
            <span className="text-gray-500 dark:text-slate-400 flex-shrink-0">ค่าจัดส่ง</span>
            <PostfixInput
              value={shippingFee || ''}
              onChange={v => onShippingFeeChange(parseFloat(v) || 0)}
              postfix="฿"
              type="number"
              placeholder="0"
              min={0}
              step={0.01}
              width="w-[120px]"
              compact
            />
          </div>
        )}

        {/* ส่วนลดทั้งบิล */}
        {onBillDiscountChange !== undefined && (
          <div className="flex justify-between items-center gap-3">
            <span className="text-gray-500 dark:text-slate-400 flex-shrink-0">ส่วนลดรวม</span>
            <DiscountInput
              value={String(billDiscount || '')}
              discountType={discType === 'percent' ? 'percent' : 'fixed_discount'}
              onValueChange={v => onBillDiscountChange(parseFloat(v) || 0, discType)}
              onTypeChange={t => {
                const newType = t === 'percent' ? 'percent' : 'amount';
                setDiscType(newType);
                onBillDiscountChange(0, newType);
              }}
              placeholder="0"
              compact
              width="w-[120px]"
            />
          </div>
        )}

        {/* แสดงส่วนลดทั้งบิล (ถ้ามี) */}
        {billDiscAmt > 0 && (
          <div className="flex justify-between text-green-600 dark:text-green-400">
            <span>ส่วนลดทั้งบิล</span>
            <span>-฿{fmt(billDiscAmt)}</span>
          </div>
        )}
      </div>

      {/* VAT breakdown (เฉพาะจด VAT) */}
      {vatRegistered && (
        <div className="border-t border-gray-100 dark:border-slate-700 pt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-slate-400">ยอดก่อน VAT</span>
            <span className="text-gray-900 dark:text-white">฿{fmt(beforeVat)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-slate-400">VAT {vatRate}%</span>
            <span className="text-gray-900 dark:text-white">฿{fmt(vatAmount)}</span>
          </div>
        </div>
      )}

      {/* Grand total */}
      <div className="border-t border-gray-200 dark:border-slate-700 pt-3 flex justify-between items-center">
        <span className="font-semibold text-gray-900 dark:text-white">ยอดรวมสุทธิ</span>
        <span className="text-xl font-bold text-[#F4511E]">฿{fmt(grandTotal)}</span>
      </div>
    </div>
  );
}
