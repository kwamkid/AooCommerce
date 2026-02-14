// Path: app/products/new/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import ProductForm, { type ProductItem } from '@/components/products/ProductForm';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { ArrowLeft, Loader2 } from 'lucide-react';

function NewProductContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile, loading: authLoading } = useAuth();

  const duplicateId = searchParams.get('duplicate');

  const [duplicateProduct, setDuplicateProduct] = useState<ProductItem | null>(null);
  const [loading, setLoading] = useState(!!duplicateId);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!duplicateId || authLoading || !userProfile) return;

    const loadSourceProduct = async () => {
      try {
        const response = await apiFetch('/api/products');
        const data = await response.json();

        const found = (data.products || []).find((p: ProductItem) => p.product_id === duplicateId);
        if (!found) {
          setError('ไม่พบสินค้าต้นฉบับ');
          setLoading(false);
          return;
        }

        // Create duplicated product with cleared identifiers
        const duplicated: ProductItem = {
          ...found,
          product_id: '', // empty = create mode in ProductForm
          code: '', // will auto-generate in ProductForm
          name: found.name + ' (สำเนา)',
          image: '', // don't copy image reference
          main_image_url: '', // don't copy image
          variations: found.variations.map((v: ProductItem['variations'][0]) => ({
            ...v,
            variation_id: undefined, // clear ID so it creates new
            sku: '', // must be unique
            barcode: '', // must be unique
          })),
        };

        setDuplicateProduct(duplicated);
      } catch (err) {
        console.error('Error loading source product:', err);
        setError('ไม่สามารถโหลดข้อมูลสินค้าได้');
      } finally {
        setLoading(false);
      }
    };

    loadSourceProduct();
  }, [duplicateId, authLoading, userProfile]);

  const title = duplicateId ? 'คัดลอกสินค้า' : 'เพิ่มสินค้า';

  if (duplicateId && (authLoading || loading)) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">กำลังโหลดข้อมูล...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="max-w-4xl space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/products')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          </div>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/products')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
        </div>

        {/* Form */}
        <ProductForm editingProduct={duplicateProduct} />
      </div>
    </Layout>
  );
}

export default function NewProductPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">กำลังโหลด...</p>
          </div>
        </div>
      </Layout>
    }>
      <NewProductContent />
    </Suspense>
  );
}
