// Path: app/settings/suppliers/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import SupplierForm, { type SupplierFormData } from '@/components/suppliers/SupplierForm';
import { LoadingCard } from '@/components/ui/StateCard';

export default function NewSupplierPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { features } = useFeatures();

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!userProfile) { router.push('/login'); return; }
    if (!can(userProfile.roles, 'masterdata.suppliers')) {
      router.push('/dashboard');
    }
  }, [userProfile, authLoading, router]);

  useEffect(() => {
    if (features && !features.supplier) {
      router.replace('/inventory/receives');
    }
  }, [features, router]);

  const handleSubmit = async (data: SupplierFormData) => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'ไม่สามารถบันทึกได้');
      }

      const result = await res.json();
      const newSupplierId = result.data?.id;

      // Link brands to supplier
      if (newSupplierId && data.brand_ids && data.brand_ids.length > 0) {
        for (const brandId of data.brand_ids) {
          await apiFetch('/api/brands', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: brandId, supplier_id: newSupplierId }),
          });
        }
      }

      showToast('เพิ่มซัพพลายเออร์สำเร็จ');
      router.push('/settings/suppliers');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <Layout>
        <LoadingCard />
      </Layout>
    );
  }

  if (!userProfile) return null;

  return (
    <Layout>
      <Container size="full">
        <PageHeader
          title="เพิ่มซัพพลายเออร์ใหม่"
          backHref="/settings/suppliers"
        />

        {/* Form */}
        <SupplierForm
          onSubmit={handleSubmit}
          onCancel={() => router.push('/settings/suppliers')}
          isLoading={saving}
        />
      </Container>
    </Layout>
  );
}
