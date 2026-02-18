// Path: app/pos/components/ProductGrid.tsx
'use client';

import { Package2 } from 'lucide-react';
import { formatPrice } from '@/lib/utils/format';

export interface PosProduct {
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variation_label: string;
  barcode: string | null;
  price: number;
  original_price: number;
  stock: number;
  category_id: string | null;
  image_url: string | null;
}

interface ProductGridProps {
  products: PosProduct[];
  onAddToCart: (product: PosProduct) => void;
  loading?: boolean;
  allowOversell?: boolean;
}

export default function ProductGrid({ products, onAddToCart, loading, allowOversell }: ProductGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white/5 rounded-xl p-3 animate-pulse">
            <div className="aspect-square bg-white/10 rounded-lg mb-2" />
            <div className="h-4 bg-white/10 rounded w-3/4 mb-1" />
            <div className="h-4 bg-white/10 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Package2 className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-sm">ไม่พบสินค้า</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
      {products.map(product => {
        const noStockTracking = product.stock < 0; // -1 = no warehouse, unlimited
        const outOfStock = !allowOversell && !noStockTracking && product.stock <= 0;
        return (
          <button
            key={product.variation_id}
            onClick={() => !outOfStock && onAddToCart(product)}
            disabled={outOfStock}
            className={`relative bg-white/5 rounded-xl p-3 text-left transition-all ${
              outOfStock
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-white/10 active:scale-[0.97]'
            }`}
          >
            {/* Image */}
            <div className="aspect-square bg-white/10 rounded-lg mb-2 overflow-hidden flex items-center justify-center">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.product_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package2 className="w-8 h-8 text-gray-500" />
              )}
            </div>

            {/* Name */}
            <p className="text-white text-sm font-medium truncate">
              {product.product_name}
            </p>
            {product.variation_label && (
              <p className="text-gray-400 text-xs truncate">{product.variation_label}</p>
            )}

            {/* Price */}
            <p className="text-[#F4511E] font-bold text-sm mt-1">
              ฿{formatPrice(product.price)}
            </p>

            {/* Stock badge */}
            {noStockTracking ? null : (
              <p className={`text-xs mt-0.5 ${outOfStock ? 'text-red-400' : 'text-gray-500'}`}>
                {outOfStock ? 'หมด' : `คงเหลือ ${product.stock}`}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
