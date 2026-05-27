// Path: app/products/new/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingCard } from '@/components/ui/StateCard';
import ProductForm, { type ProductItem } from '@/components/products/ProductForm';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateId, authLoading, userProfile]);

  const title = duplicateId ? 'คัดลอกสินค้า' : 'เพิ่มสินค้า';

  if (duplicateId && (authLoading || loading)) {
    return (
      <Layout>
        <Container size="4xl">
          <LoadingCard />
        </Container>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Container size="4xl" gap="sm">
          <PageHeader title={title} backHref="/products" />
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        </Container>
      </Layout>
    );
  }

  return (
    <Layout>
      <Container size="4xl" gap="sm">
        <PageHeader title={title} backHref="/products" />
        <ProductForm editingProduct={duplicateProduct} formOptions={null} />
      </Container>
    </Layout>
  );
}

export default function NewProductPage() {
  return (
    <Suspense fallback={
      <Layout>
        <Container size="4xl">
          <LoadingCard />
        </Container>
      </Layout>
    }>
      <NewProductContent />
    </Suspense>
  );
}
