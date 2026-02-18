// Path: app/pos/components/VariationPicker.tsx
'use client';

import { X } from 'lucide-react';
import { formatPrice } from '@/lib/utils/format';
import { PosProduct } from './ProductGrid';

interface VariationPickerProps {
  productName: string;
  variations: PosProduct[];
  onSelect: (variation: PosProduct) => void;
  onClose: () => void;
}

export default function VariationPicker({ productName, variations, onSelect, onClose }: VariationPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#1E293B] rounded-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{productName}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-4">เลือกตัวเลือก</p>

        <div className="grid grid-cols-2 gap-3">
          {variations.map(v => {
            const noStockTracking = v.stock < 0;
            const outOfStock = !noStockTracking && v.stock <= 0;
            return (
              <button
                key={v.variation_id}
                onClick={() => onSelect(v)}
                disabled={outOfStock}
                className={`p-4 rounded-xl text-left transition-all ${
                  outOfStock
                    ? 'bg-white/5 opacity-50 cursor-not-allowed'
                    : 'bg-white/10 hover:bg-white/20 active:scale-95'
                }`}
              >
                <p className="text-white font-medium text-sm">{v.variation_label}</p>
                <p className="text-[#F4511E] font-bold mt-1">฿{formatPrice(v.price)}</p>
                {noStockTracking ? null : (
                  <p className={`text-xs mt-1 ${outOfStock ? 'text-red-400' : 'text-gray-400'}`}>
                    {outOfStock ? 'หมด' : `คงเหลือ ${v.stock}`}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
