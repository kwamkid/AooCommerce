// Path: app/pos/components/VariationPicker.tsx
'use client';

import { formatPrice } from '@/lib/utils/format';
import Modal from '@/components/ui/Modal';
import { PosProduct } from './ProductGrid';

interface VariationPickerProps {
  productName: string;
  variations: PosProduct[];
  onSelect: (variation: PosProduct) => void;
  onClose: () => void;
}

export default function VariationPicker({ productName, variations, onSelect, onClose }: VariationPickerProps) {
  return (
    <Modal open onClose={onClose} size="md" title={productName}>
      <div className="p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">เลือกตัวเลือก</p>

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
                    ? 'bg-gray-50 dark:bg-white/5 opacity-50 cursor-not-allowed'
                    : 'bg-gray-50 dark:bg-white/10 hover:bg-gray-100 dark:hover:bg-white/20 active:scale-95'
                }`}
              >
                <p className="text-gray-900 dark:text-white font-medium text-sm">{v.variation_label}</p>
                <p className="text-primary font-bold mt-1">฿{formatPrice(v.price)}</p>
                {noStockTracking ? null : (
                  <p className={`text-xs mt-1 ${outOfStock ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {outOfStock ? 'หมด' : `คงเหลือ ${v.stock}`}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
