// Path: app/pos/components/CartPanel.tsx
'use client';

import { Minus, Plus, Trash2, User, Percent } from 'lucide-react';
import { formatPrice } from '@/lib/utils/format';

export interface CartItem {
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variation_label?: string;
  quantity: number;
  unit_price: number;
  discount_type: 'percent' | 'amount';
  discount_value: number;
  max_stock: number;
  image_url?: string | null;
}

interface CartPanelProps {
  items: CartItem[];
  orderDiscount: number;
  customerName: string | null;
  onUpdateQuantity: (variationId: string, delta: number) => void;
  onRemoveItem: (variationId: string) => void;
  onUpdateItemDiscount: (variationId: string, type: 'percent' | 'amount', value: number) => void;
  onUpdateOrderDiscount: (amount: number) => void;
  onOpenCustomerSearch: () => void;
  onCheckout: () => void;
  allowOversell: boolean;
}

function getLineTotal(item: CartItem): number {
  const sub = item.quantity * item.unit_price;
  if (item.discount_type === 'amount') return sub - (item.discount_value || 0);
  return sub - sub * ((item.discount_value || 0) / 100);
}

export default function CartPanel({
  items,
  orderDiscount,
  customerName,
  onUpdateQuantity,
  onRemoveItem,
  onUpdateItemDiscount,
  onUpdateOrderDiscount,
  onOpenCustomerSearch,
  onCheckout,
  allowOversell,
}: CartPanelProps) {
  const itemsSubtotal = items.reduce((s, i) => s + getLineTotal(i), 0);
  const totalWithVAT = itemsSubtotal - orderDiscount;
  const subtotalBeforeVAT = Math.round((totalWithVAT / 1.07) * 100) / 100;
  const vatAmount = Math.round((totalWithVAT - subtotalBeforeVAT) * 100) / 100;

  return (
    <div className="flex flex-col h-full">
      {/* Customer */}
      <button
        onClick={onOpenCustomerSearch}
        className="flex items-center gap-2 px-3 py-2 mb-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
      >
        <User className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-300 truncate">
          {customerName || 'ลูกค้าทั่วไป (Walk-in)'}
        </span>
      </button>

      {/* Cart header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-white font-semibold">
          ตะกร้า ({items.reduce((s, i) => s + i.quantity, 0)} รายการ)
        </h3>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-3">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            ยังไม่มีสินค้าในตะกร้า
          </div>
        ) : (
          items.map(item => {
            const lineTotal = getLineTotal(item);
            const canAdd = allowOversell || item.quantity < item.max_stock;
            return (
              <div key={item.variation_id} className="bg-white/5 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  {/* Product image */}
                  <div className="w-[52px] h-[52px] rounded-lg bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-gray-500 text-xs">--</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{item.product_name}</p>
                    {item.variation_label && (
                      <p className="text-gray-400 text-xs">{item.variation_label}</p>
                    )}
                    <p className="text-gray-400 text-xs mt-0.5">฿{formatPrice(item.unit_price)} / ชิ้น</p>
                  </div>
                  <button
                    onClick={() => onRemoveItem(item.variation_id)}
                    className="p-1.5 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-2">
                  {/* Quantity controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onUpdateQuantity(item.variation_id, -1)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 active:scale-95"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-10 text-center text-white font-medium text-sm">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(item.variation_id, 1)}
                      disabled={!canAdd}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Line total */}
                  <p className="text-white font-semibold text-sm">฿{formatPrice(lineTotal)}</p>
                </div>

                {/* Per-item discount */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => {
                      const newType = item.discount_type === 'percent' ? 'amount' : 'percent';
                      onUpdateItemDiscount(item.variation_id, newType, 0);
                    }}
                    className="p-1 rounded bg-white/10 text-gray-400 hover:text-white"
                    title="สลับประเภทส่วนลด"
                  >
                    {item.discount_type === 'percent' ? <Percent className="w-3 h-3" /> : <span className="text-xs font-bold leading-none">฿</span>}
                  </button>
                  <input
                    type="number"
                    value={item.discount_value || ''}
                    onChange={(e) => onUpdateItemDiscount(item.variation_id, item.discount_type, Number(e.target.value) || 0)}
                    placeholder={item.discount_type === 'percent' ? 'ส่วนลด %' : 'ส่วนลด ฿'}
                    className="flex-1 px-2 py-1 bg-white/5 border border-gray-700 rounded text-white text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#F4511E] w-0"
                    min="0"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Order discount */}
      <div className="border-t border-gray-700 pt-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs">ส่วนลดทั้งบิล (฿)</span>
          <input
            type="number"
            value={orderDiscount || ''}
            onChange={(e) => onUpdateOrderDiscount(Number(e.target.value) || 0)}
            placeholder="0"
            className="w-24 ml-auto px-2 py-1 bg-white/5 border border-gray-700 rounded text-white text-xs text-right placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#F4511E]"
            min="0"
          />
        </div>
      </div>

      {/* Totals */}
      <div className="border-t border-gray-700 pt-3 mt-2 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">รวม</span>
          <span className="text-white">฿{formatPrice(itemsSubtotal)}</span>
        </div>
        {orderDiscount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">ส่วนลด</span>
            <span className="text-red-400">-฿{formatPrice(orderDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">VAT 7%</span>
          <span className="text-gray-300">฿{formatPrice(vatAmount)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold pt-1">
          <span className="text-white">ยอดชำระ</span>
          <span className="text-[#F4511E]">฿{formatPrice(totalWithVAT)}</span>
        </div>
      </div>

      {/* Checkout button */}
      <button
        onClick={onCheckout}
        disabled={items.length === 0}
        className="w-full mt-3 py-4 bg-[#F4511E] hover:bg-[#D63B0E] text-white font-bold text-lg rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98]"
      >
        ชำระเงิน
      </button>
    </div>
  );
}
