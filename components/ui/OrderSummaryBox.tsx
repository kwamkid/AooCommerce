'use client';

import { ReactNode } from 'react';
import { formatNumber } from '@/lib/utils/format';

interface OrderSummaryBoxProps {
  /** Box title */
  title: string;
  /** Total amount including VAT (the "gross" sum of items) */
  subtotalAmount: number;
  /** Is the company VAT registered? Shows VAT breakdown if true */
  vatRegistered?: boolean;

  // ── Optional editable fields ──────────────────────────
  /** Shipping fee — shows input if onShippingChange provided, else read-only if > 0 */
  shippingFee?: number;
  onShippingChange?: (v: number) => void;

  /** Discount — shows input if onDiscountChange provided */
  discountValue?: number;
  discountType?: 'percent' | 'amount';
  onDiscountChange?: (v: number) => void;
  onDiscountTypeToggle?: () => void;

  /** Disable inputs (view mode) */
  readOnly?: boolean;

  /** Extra content below the total line (e.g. exchange credit) */
  children?: ReactNode;
}

export default function OrderSummaryBox({
  title,
  subtotalAmount,
  vatRegistered = false,
  shippingFee = 0,
  onShippingChange,
  discountValue = 0,
  discountType = 'percent',
  onDiscountChange,
  onDiscountTypeToggle,
  readOnly = false,
  children,
}: OrderSummaryBoxProps) {
  const discountAmount = discountType === 'percent'
    ? subtotalAmount * discountValue / 100
    : discountValue;
  const totalWithVAT = Math.max(0, subtotalAmount - discountAmount + shippingFee);
  const subtotalExVAT = vatRegistered ? Math.round((totalWithVAT / 1.07) * 100) / 100 : totalWithVAT;
  const vat = vatRegistered ? totalWithVAT - subtotalExVAT : 0;

  const hasShipping = onShippingChange || shippingFee > 0;
  const hasDiscount = onDiscountChange || discountValue > 0;

  return (
    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4">
      <h3 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-3">{title}</h3>
      <div className="space-y-2 text-base">
        {/* Subtotal */}
        <div className="flex justify-between text-gray-500 dark:text-slate-400">
          <span>ยอดรวมสินค้า{vatRegistered ? ' (รวม VAT)' : ''}</span>
          <span>฿{formatNumber(subtotalAmount)}</span>
        </div>

        {/* Shipping */}
        {hasShipping && (
          <div className="flex justify-between items-center text-gray-500 dark:text-slate-400">
            <span>ค่าจัดส่ง</span>
            {onShippingChange && !readOnly ? (
              <div className="relative w-[108px]">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={shippingFee || ''}
                  onChange={e => onShippingChange(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-2 pr-7 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-right text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-slate-500 pointer-events-none">฿</span>
              </div>
            ) : (
              <span>฿{formatNumber(shippingFee)}</span>
            )}
          </div>
        )}

        {/* Discount */}
        {hasDiscount && (
          <div className="flex justify-between items-center">
            <span className="text-gray-500 dark:text-slate-400">ส่วนลดรวม</span>
            {onDiscountChange && !readOnly ? (
              <div className="flex items-stretch w-[108px]">
                <input
                  type="number"
                  min={0}
                  max={discountType === 'percent' ? 100 : undefined}
                  step={0.01}
                  value={discountValue}
                  onChange={e => onDiscountChange(parseFloat(e.target.value) || 0)}
                  className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-l-lg border-r-0 text-right text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:z-10"
                />
                <button
                  type="button"
                  onClick={onDiscountTypeToggle}
                  className="px-2 text-xs font-medium border border-gray-300 dark:border-slate-600 rounded-r-lg bg-gray-50 dark:bg-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-500 transition-colors min-w-[28px] flex items-center justify-center"
                >
                  {discountType === 'percent' ? '%' : '฿'}
                </button>
              </div>
            ) : (
              <span className="text-gray-500 dark:text-slate-400">
                {discountType === 'percent' ? `${formatNumber(discountValue)}%` : `฿${formatNumber(discountValue)}`}
              </span>
            )}
          </div>
        )}

        {/* VAT breakdown */}
        {vatRegistered && (
          <>
            <div className="flex justify-between text-gray-500 dark:text-slate-400 pt-2 border-t border-gray-200 dark:border-slate-600">
              <span>ยอดก่อน VAT</span>
              <span>฿{formatNumber(subtotalExVAT)}</span>
            </div>
            <div className="flex justify-between text-gray-500 dark:text-slate-400">
              <span>VAT 7%</span>
              <span>฿{formatNumber(vat)}</span>
            </div>
          </>
        )}

        {/* Total */}
        <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100">
          <span>ยอดรวมสุทธิ</span>
          <span className="text-[#F4511E]">฿{formatNumber(totalWithVAT)}</span>
        </div>

        {children}
      </div>
    </div>
  );
}
