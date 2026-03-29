// Path: app/settings/suppliers/[id]/edit/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SupplierForm, { type SupplierFormData } from '@/components/suppliers/SupplierForm';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function EditSupplierPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { features } = useFeatures();
  const supplierId = params.id as string;

  const [supplier, setSupplier] = useState<Record<string, unknown> | null>(null);
  const [linkedBrandIds, setLinkedBrandIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!userProfile) { router.push('/login'); return; }
    if (!userProfile.roles?.some((r: string) => ['owner', 'admin'].includes(r))) {
      router.push('/dashboard');
    }
  }, [userProfile, authLoading, router]);

  useEffect(() => {
    if (features && !features.supplier) {
      router.replace('/inventory/receives');
    }
  }, [features, router]);

  useEffect(() => {
    if (authLoading || !userProfile || !supplierId) return;

    const load = async () => {
      try {
        // Fetch suppliers list + brands in parallel
        const [suppRes, brandsRes] = await Promise.all([
          apiFetch('/api/suppliers'),
          apiFetch('/api/brands'),
        ]);

        if (!suppRes.ok) throw new Error('Failed to fetch supplier');
        const suppData = await suppRes.json();
        const found = (suppData.data || []).find((s: { id: string }) => s.id === supplierId);
        if (!found) { setError('ไม่พบซัพพลายเออร์'); return; }
        setSupplier(found);

        // Find brands linked to this supplier
        if (brandsRes.ok) {
          const brandsData = await brandsRes.json();
          const linked = (brandsData.data || [])
            .filter((b: { supplier_id?: string }) => b.supplier_id === supplierId)
            .map((b: { id: string }) => b.id);
          setLinkedBrandIds(linked);
        }
      } catch (err) {
        console.error('Error loading supplier:', err);
        setError('ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [authLoading, userProfile, supplierId]);

  const handleUpdate = async (data: SupplierFormData) => {
    if (!supplier) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/suppliers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: supplierId, ...data }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'ไม่สามารถบันทึกได้');
      }

      // Update brand links
      if (data.brand_ids) {
        // Unlink old brands not in new list
        for (const oldId of linkedBrandIds) {
          if (!data.brand_ids.includes(oldId)) {
            await apiFetch('/api/brands', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: oldId, supplier_id: null }),
            });
          }
        }
        // Link new brands
        for (const newId of data.brand_ids) {
          if (!linkedBrandIds.includes(newId)) {
            await apiFetch('/api/brands', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: newId, supplier_id: supplierId }),
            });
          }
        }
      }

      showToast('อัพเดทซัพพลายเออร์สำเร็จ');
      router.push('/settings/suppliers');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </Layout>
    );
  }

  if (error || !supplier) {
    return (
      <Layout>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.push('/settings/suppliers')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">แก้ไขซัพพลายเออร์</h1>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
            {error || 'ไม่พบซัพพลายเออร์'}
          </div>
        </div>
      </Layout>
    );
  }

  const s = supplier as Record<string, string | number | boolean | null>;

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.push('/settings/suppliers')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">แก้ไขซัพพลายเออร์</h1>
        </div>

        {/* Form */}
        <SupplierForm
          initialData={{
            name: (s.name as string) || '',
            contact_name: (s.contact_name as string) || '',
            phone: (s.phone as string) || '',
            email: (s.email as string) || '',
            address: (s.address as string) || '',
            tax_id: (s.tax_id as string) || '',
            branch: (s.branch as string) || '',
            is_vat_registered: (s.is_vat_registered as boolean) || false,
            supplier_type: ((s.supplier_type as string) || 'cash') as 'cash' | 'credit' | 'consignment',
            payment_terms: (s.payment_terms as number) || 0,
            bank_code: (s.bank_code as string) || '',
            bank_name: (s.bank_name as string) || '',
            bank_account: (s.bank_account as string) || '',
            bank_account_name: (s.bank_account_name as string) || '',
            notes: (s.notes as string) || '',
            brand_ids: linkedBrandIds,
          }}
          onSubmit={handleUpdate}
          onCancel={() => router.push('/settings/suppliers')}
          isEditing
          isLoading={saving}
        />
      </div>
    </Layout>
  );
}
