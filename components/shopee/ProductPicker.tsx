'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Package, X, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { apiFetch } from '@/lib/api-client';

interface ProductVariation {
  variation_id: string;
  variation_label: string;
  sku: string | null;
  default_price: number;
}

interface ProductResult {
  product_id: string;
  code: string;
  name: string;
  image: string | null;
  product_type: string;
  main_image_url: string | null;
  variations: ProductVariation[];
}

interface ProductPickerProps {
  onSelect: (product: ProductResult) => void;
  onCancel: () => void;
  excludeProductIds?: string[];
}

export default function ProductPicker({ onSelect, onCancel, excludeProductIds = [] }: ProductPickerProps) {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchProducts = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (q) params.set('search', q);
      const res = await apiFetch(`/api/products?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(debouncedSearch);
  }, [debouncedSearch, fetchProducts]);

  const filtered = products.filter(p => {
    if (excludeProductIds.includes(p.product_id)) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold text-lg text-gray-900 dark:text-white">เลือกสินค้าที่จะผูก</h3>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-gray-500 dark:text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-200 dark:border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="ค้นหาชื่อ, รหัส, SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
              autoFocus
            />
          </div>
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400 dark:text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-slate-500">
              <Package className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">ไม่พบสินค้า</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map(product => (
                <button
                  key={product.product_id}
                  onClick={() => onSelect(product)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-500/15 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                    {(product.main_image_url || product.image) ? (
                      <Image
                        src={product.main_image_url || product.image!}
                        alt={product.name}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-slate-500">
                        <Package className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{product.name}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {product.code}
                      {product.variations.length > 1 && ` · ${product.variations.length} ตัวเลือก`}
                      {product.variations[0]?.sku && ` · ${product.variations[0].sku}`}
                    </p>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">
                    {product.product_type === 'simple' ? 'สินค้าเดี่ยว' : 'สินค้าตัวเลือก'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
