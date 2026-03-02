'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import CustomerForm, { CustomerFormData, buildCustomerPayload } from '@/components/customers/CustomerForm';
import { Tag } from '@/components/ui/TagBadge';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function NewCustomerPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [saving, setSaving] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

  // Fetch tags
  useEffect(() => {
    if (authLoading || !userProfile) return;
    apiFetch('/api/customers/tags').then(r => r.json()).then(d => {
      if (d.tags) setAllTags(d.tags);
    }).catch(() => {});
  }, [authLoading, userProfile]);

  useEffect(() => {
    if (authLoading) return;
    if (!userProfile) {
      router.push('/login');
      return;
    }
    if (!userProfile.roles?.some((r: string) => ['owner', 'admin', 'sales', 'account'].includes(r))) {
      router.push('/dashboard');
    }
  }, [userProfile, authLoading, router]);

  const handleCreateCustomer = async (data: CustomerFormData) => {
    setSaving(true);

    try {
      const customerPayload = buildCustomerPayload(data);

      const createResponse = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerPayload)
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.error || 'Failed to create customer');
      }

      const newCustomer = await createResponse.json();

      const customerId = newCustomer.customer?.id || newCustomer.id;

      // Create primary shipping address if provided
      if (data.shipping_address || data.shipping_province) {
        await apiFetch('/api/shipping-addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: customerId,
            address_name: data.shipping_address_name || 'ที่อยู่หลัก',
            contact_person: data.shipping_contact_person || data.contact_person,
            phone: data.shipping_phone || data.phone,
            address_line1: data.shipping_address,
            district: data.shipping_district,
            amphoe: data.shipping_amphoe,
            province: data.shipping_province,
            postal_code: data.shipping_postal_code,
            google_maps_link: data.shipping_google_maps_link,
            delivery_notes: data.shipping_delivery_notes,
            is_default: true
          })
        });
      }

      // Create additional shipping addresses
      if (data.additional_addresses?.length) {
        for (const addr of data.additional_addresses) {
          if (!addr.address_line1 && !addr.province) continue;
          await apiFetch('/api/shipping-addresses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: customerId,
              address_name: addr.address_name || 'ที่อยู่เพิ่มเติม',
              contact_person: addr.contact_person || data.contact_person,
              phone: addr.phone || data.phone,
              address_line1: addr.address_line1,
              district: addr.district,
              amphoe: addr.amphoe,
              province: addr.province,
              postal_code: addr.postal_code,
              google_maps_link: addr.google_maps_link,
              delivery_notes: addr.delivery_notes,
              is_default: false,
            })
          });
        }
      }

      // Save tags
      if (selectedTags.length > 0) {
        await apiFetch(`/api/customers/${customerId}/tags`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_ids: selectedTags.map(t => t.id) }),
        });
      }

      showToast('สร้างลูกค้าสำเร็จ');
      router.push('/customers');
    } catch (error) {
      console.error('Error creating customer:', error);
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!userProfile) return null;

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/customers')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">เพิ่มลูกค้าใหม่</h1>
        </div>

        {/* Form */}
        <CustomerForm
          onSubmit={handleCreateCustomer}
          onCancel={() => router.push('/customers')}
          isLoading={saving}
          allTags={allTags}
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
          onTagCreated={(tag) => setAllTags(prev => [...prev, tag])}
        />
      </div>
    </Layout>
  );
}
