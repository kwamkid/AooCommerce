// Path: app/products/new/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProductNavigation } from '@/lib/useProductNavigation';
import { productEditorUrl } from '@/lib/product-navigation';
import Alert from '@/components/ui/Alert';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingCard } from '@/components/ui/StateCard';
import ProductForm, { type ProductItem } from '@/components/products/ProductForm';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { useAuthGuard } from '@/lib/useAuthGuard';

function NewProductContent() {
  const router = useRouter();
  const navigation = useProductNavigation();
  const [formVersion, setFormVersion] = useState(0);
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
        // Same payload as the edit page — carries composite slots/combos for สินค้าชุด
        const response = await apiFetch(`/api/products/${duplicateId}`);
        const data = await response.json().catch(() => ({}));

        const found: ProductItem | undefined = response.ok ? data.product : undefined;
        if (!found) {
          setError('ไม่พบสินค้าต้นฉบับ');
          setLoading(false);
          return;
        }

        // Create duplicated product with cleared identifiers
        const duplicated: ProductItem = {
          ...found,
          product_id: '', // empty = create mode in ProductForm
          code: '', // user must enter the new product's own code
          name: found.name + ' (สำเนา)',
          image: '', // don't copy image reference
          main_image_url: '', // don't copy image
          variations: found.variations.map((v: ProductItem['variations'][0]) => ({
            ...v,
            variation_id: undefined, // clear ID so it creates new
            sku: '', // must be unique
            barcode: '', // must be unique
          })),
          // สินค้าชุด: keep slots + per-combo settings, drop row identity/SKU/stock
          composite_combos: found.composite_combos?.map(c => ({
            ...c,
            variation_id: undefined,
            sku: null,
            barcode: null,
            quantity: null,
            available: null,
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

  const title = duplicateId && formVersion === 0 ? 'คัดลอกสินค้า' : 'เพิ่มสินค้า';

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
          <PageHeader title={title} backHref={navigation.returnTo} onBack={navigation.back} />
          <Alert tone="danger">{error}</Alert>
        </Container>
      </Layout>
    );
  }

  return (
    <Layout>
      <Container size="4xl" gap="sm">
        <PageHeader title={title} backHref={navigation.returnTo} onBack={navigation.back} />
        <ProductForm key={formVersion} editingProduct={formVersion === 0 ? duplicateProduct : null} formOptions={null}
          returnTo={navigation.returnTo} onCancel={navigation.back} onDirtyChange={navigation.setDirty}
          onSaved={async id => { router.replace(productEditorUrl(id, navigation.returnTo)); }}
          onAddNext={() => { navigation.setDirty(false); setFormVersion(v => v + 1); }}
        />
        {navigation.confirmDialog}
      </Container>
    </Layout>
  );
}

export default function NewProductPage() {
  const { allowed, loading: permLoading } = useAuthGuard('product.manage');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

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
