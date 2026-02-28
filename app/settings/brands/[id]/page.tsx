'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { getImageUrl } from '@/lib/utils/image';
import EntitySearchInput, { EntitySearchOption } from '@/components/ui/EntitySearchInput';
import {
  Loader2, Award, Package2, X, ArrowLeft, Factory,
} from 'lucide-react';

interface BrandDetail {
  id: string;
  name: string;
  sort_order: number;
  supplier_id?: string | null;
  supplier?: { id: string; name: string; supplier_type: string } | null;
}

interface BrandProduct {
  id: string;
  code: string;
  name: string;
  image?: string | null;
  product_type: 'simple' | 'variation';
}

interface SearchProduct {
  product_id: string;
  code: string;
  name: string;
  image?: string | null;
  main_image_url?: string | null;
  brand_id?: string | null;
}

export default function BrandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const { features } = useFeatures();

  const [brand, setBrand] = useState<BrandDetail | null>(null);
  const [products, setProducts] = useState<BrandProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  // Product search (for adding)
  const [searchResults, setSearchResults] = useState<EntitySearchOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  // Keep full search results for brand check
  const searchProductsRef = useRef<SearchProduct[]>([]);

  const fetchBrand = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/brands/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          router.replace('/settings/brands');
          return;
        }
        throw new Error('Failed to fetch');
      }
      const data = await res.json();
      setBrand(data.brand);
      setProducts(data.products || []);
    } catch (error) {
      console.error('Error fetching brand:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (userProfile && id) fetchBrand();
  }, [userProfile, id, fetchBrand]);

  const handleSearchChange = useCallback(async (search: string) => {
    if (search.length < 2) {
      setSearchResults([]);
      searchProductsRef.current = [];
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ search, limit: '10' });
      const res = await apiFetch(`/api/products?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const items: SearchProduct[] = data.products || [];
      searchProductsRef.current = items;

      // Filter out products already in this brand
      const existingIds = new Set(products.map(p => p.id));
      setSearchResults(
        items
          .filter(p => !existingIds.has(p.product_id))
          .map(p => ({
            id: p.product_id,
            label: p.name,
            subtitle: p.code + (p.brand_id && p.brand_id !== id ? ' (มี Brand อื่น)' : ''),
            icon: p.main_image_url || p.image ? (
              <img src={getImageUrl(p.main_image_url || p.image)} alt="" className="w-8 h-8 rounded object-cover" />
            ) : (
              <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                <Package2 className="w-4 h-4 text-gray-400" />
              </div>
            ),
          }))
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [id, products]);

  const handleAddProduct = useCallback(async (productId: string) => {
    // Check if product has another brand
    const searchProduct = searchProductsRef.current.find(p => p.product_id === productId);
    if (searchProduct?.brand_id && searchProduct.brand_id !== id) {
      if (!confirm('สินค้านี้มี Brand อื่นอยู่แล้ว ต้องการเปลี่ยนมาเป็น Brand นี้หรือไม่?')) {
        return;
      }
    }

    setAdding(true);
    try {
      const res = await apiFetch(`/api/brands/${id}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: [productId] }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      showToast('เพิ่มสินค้าสำเร็จ');
      setSearchResults([]);
      searchProductsRef.current = [];
      fetchBrand();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถเพิ่มสินค้าได้', 'error');
    } finally {
      setAdding(false);
    }
  }, [id, fetchBrand, showToast]);

  const handleRemoveProduct = useCallback(async (productId: string, productName: string) => {
    if (!confirm(`ต้องการนำ "${productName}" ออกจากแบรนด์นี้?`)) return;

    setRemoving(productId);
    try {
      const res = await apiFetch(`/api/brands/${id}/products?product_ids=${productId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      showToast('นำสินค้าออกสำเร็จ');
      setProducts(prev => prev.filter(p => p.id !== productId));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถนำสินค้าออกได้', 'error');
    } finally {
      setRemoving(null);
    }
  }, [id, showToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A1A2E]">
        <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
      </div>
    );
  }

  if (!brand) return null;

  const isAdmin = userProfile?.roles?.includes('admin') || userProfile?.roles?.includes('owner');
  if (!isAdmin || !features.product_brand) {
    router.replace('/settings/brands');
    return null;
  }

  return (
    <Layout
      title={brand.name}
      breadcrumbs={[
        { label: 'ตั้งค่าระบบ', href: '/settings' },
        { label: 'แบรนด์', href: '/settings/brands' },
        { label: brand.name },
      ]}
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back button */}
        <button
          onClick={() => router.push('/settings/brands')}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          กลับหน้าแบรนด์
        </button>

        {/* Brand Info Card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <Award className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{brand.name}</h2>
              {brand.supplier && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Factory className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-500 dark:text-slate-400">{brand.supplier.name}</span>
                </div>
              )}
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-gray-900 dark:text-white">{products.length}</span>
              <p className="text-xs text-gray-500 dark:text-slate-400">สินค้า</p>
            </div>
          </div>
        </div>

        {/* Add Product */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">เพิ่มสินค้าเข้า Brand</h3>
          <EntitySearchInput
            value=""
            onChange={(productId) => handleAddProduct(productId)}
            options={searchResults}
            onSearchChange={handleSearchChange}
            loading={searchLoading || adding}
            minSearchLength={2}
            placeholder="ค้นหาสินค้า (ชื่อ, รหัส)..."
            emptyMessage="ไม่พบสินค้า หรือสินค้าอยู่ใน Brand นี้แล้ว"
          />
        </div>

        {/* Product List */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              สินค้าใน Brand ({products.length})
            </h3>
          </div>

          {products.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Package2 className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-slate-500">ยังไม่มีสินค้าใน Brand นี้</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">ค้นหาและเพิ่มสินค้าด้านบน</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {products.map(product => (
                <div key={product.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                  {/* Product image */}
                  {product.image ? (
                    <img
                      src={getImageUrl(product.image)}
                      alt={product.name}
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <Package2 className="w-5 h-5 text-gray-400" />
                    </div>
                  )}

                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{product.name}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{product.code}</p>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => handleRemoveProduct(product.id, product.name)}
                    disabled={removing === product.id}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                    title="นำออกจากแบรนด์"
                  >
                    {removing === product.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
