'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import CustomerForm, { CustomerFormData } from '@/components/customers/CustomerForm';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function NewCustomerPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!userProfile) {
      router.push('/login');
      return;
    }
    if (!userProfile.roles?.some((r: string) => ['owner', 'admin', 'manager', 'sales'].includes(r))) {
      router.push('/dashboard');
    }
  }, [userProfile, authLoading, router]);

  const handleCreateCustomer = async (data: CustomerFormData) => {
    setSaving(true);
    setFormError('');

    try {
      const billingAddress = data.billing_same_as_shipping ? data.shipping_address : data.billing_address;
      const billingDistrict = data.billing_same_as_shipping ? data.shipping_district : data.billing_district;
      const billingAmphoe = data.billing_same_as_shipping ? data.shipping_amphoe : data.billing_amphoe;
      const billingProvince = data.billing_same_as_shipping ? data.shipping_province : data.billing_province;
      const billingPostalCode = data.billing_same_as_shipping ? data.shipping_postal_code : data.billing_postal_code;

      const customerPayload = {
        name: data.name,
        contact_person: data.contact_person,
        phone: data.phone,
        email: data.email,
        customer_type: data.customer_type,
        credit_limit: data.credit_limit,
        credit_days: data.credit_days,
        is_active: data.is_active,
        notes: data.notes,
        tax_id: data.needs_tax_invoice ? data.tax_id : '',
        tax_company_name: data.needs_tax_invoice ? data.tax_company_name : '',
        tax_branch: data.needs_tax_invoice ? data.tax_branch : '',
        address: billingAddress,
        district: billingDistrict,
        amphoe: billingAmphoe,
        province: billingProvince,
        postal_code: billingPostalCode
      };

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

      // Create shipping address if provided
      if (data.shipping_address || data.shipping_province) {
        const shippingPayload = {
          customer_id: newCustomer.id,
          address_name: data.shipping_address_name || 'สาขาหลัก',
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
        };

        await apiFetch('/api/shipping-addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shippingPayload)
        });
      }

      showToast('สร้างลูกค้าสำเร็จ');
      router.push('/customers');
    } catch (error) {
      console.error('Error creating customer:', error);
      setFormError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
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
      <div className="space-y-4 max-w-4xl">
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
          error={formError}
        />
      </div>
    </Layout>
  );
}
