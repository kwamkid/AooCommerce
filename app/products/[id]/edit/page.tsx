// Path: app/products/[id]/edit/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import ProductForm, { type ProductItem } from '@/components/products/ProductForm';
import { type ProductImage } from '@/components/ui/ImageUploader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const productId = params.id as string;

  const [product, setProduct] = useState<ProductItem | null>(null);
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [variationImages, setVariationImages] = useState<Record<string, ProductImage[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !userProfile || !productId) return;

    const loadProduct = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token || '';

        // Fetch all products (API returns grouped data)
        const response = await fetch('/api/products', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const found = (data.products || []).find((p: ProductItem) => p.product_id === productId);
        if (!found) {
          setError('ไม่พบสินค้า');
          setLoading(false);
          return;
        }
        setProduct(found);

        // Load all images in one call (product + all variations)
        const imgResponse = await fetch(`/api/product-images?product_id=${productId}&include_variations=true`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const imgData = await imgResponse.json();
        setProductImages(imgData.images || []);
        setVariationImages(imgData.variation_images || {});
      } catch (err) {
        console.error('Error loading product:', err);
        setError('ไม่สามารถโหลดข้อมูลสินค้าได้');
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, [authLoading, userProfile, productId]);

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[#E9B308] animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">กำลังโหลดข้อมูล...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !product) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/products')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">แก้ไขสินค้า</h1>
          </div>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error || 'ไม่พบสินค้า'}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/products')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">แก้ไขสินค้า</h1>
          <span className="text-sm text-gray-400 font-mono">{product.code}</span>
        </div>

        {/* Form */}
        <ProductForm
          editingProduct={product}
          initialImages={productImages}
          initialVariationImages={variationImages}
        />
      </div>
    </Layout>
  );
}
