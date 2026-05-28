// Path: app/settings/suppliers/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { Loader2 } from 'lucide-react';
import SupplierForm, { type SupplierFormData } from '@/components/suppliers/SupplierForm';

export default function NewSupplierPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { features } = useFeatures();

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!userProfile) { router.push('/login'); return; }
    if (!userProfile.roles?.some((r: string) => ['owner', 'admin', 'manager'].includes(r))) {
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
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
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
