'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import CustomerForm, { CustomerFormData } from '@/components/customers/CustomerForm';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface Customer {
  id: string;
  customer_code: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  district?: string;
  amphoe?: string;
  province?: string;
  postal_code?: string;
  tax_id?: string;
  tax_company_name?: string;
  tax_branch?: string;
  customer_type: 'retail' | 'wholesale' | 'distributor';
  customer_type_new?: 'retail' | 'wholesale' | 'distributor';
  credit_limit: number;
  credit_days: number;
  is_active: boolean;
  notes?: string;
}

export default function EditCustomerPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!userProfile) {
      router.push('/login');
      return;
    }
    if (!['owner', 'admin', 'manager', 'sales'].includes(userProfile.role)) {
      router.push('/dashboard');
    }
  }, [userProfile, authLoading, router]);

  useEffect(() => {
    if (authLoading || !userProfile || !customerId) return;

    const loadCustomer = async () => {
      try {
        const response = await apiFetch('/api/customers');
        const data = await response.json();

        const found = (data.customers || []).find((c: Customer) => c.id === customerId);
        if (!found) {
          setError('ไม่พบลูกค้า');
          setLoading(false);
          return;
        }

        setCustomer({
          ...found,
          customer_type: found.customer_type_new || found.customer_type || 'retail'
        });
      } catch (err) {
        console.error('Error loading customer:', err);
        setError('ไม่สามารถโหลดข้อมูลลูกค้าได้');
      } finally {
        setLoading(false);
      }
    };

    loadCustomer();
  }, [authLoading, userProfile, customerId]);

  const handleUpdateCustomer = async (data: CustomerFormData) => {
    if (!customer) return;

    setSaving(true);
    setFormError('');

    try {
      const billingAddress = data.billing_same_as_shipping ? data.shipping_address : data.billing_address;
      const billingDistrict = data.billing_same_as_shipping ? data.shipping_district : data.billing_district;
      const billingAmphoe = data.billing_same_as_shipping ? data.shipping_amphoe : data.billing_amphoe;
      const billingProvince = data.billing_same_as_shipping ? data.shipping_province : data.billing_province;
      const billingPostalCode = data.billing_same_as_shipping ? data.shipping_postal_code : data.billing_postal_code;

      const payload = {
        id: customer.id,
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

      const response = await apiFetch('/api/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }

      showToast('อัพเดทลูกค้าสำเร็จ');
      router.push(`/customers/${customer.id}`);
    } catch (error) {
      console.error('Error updating customer:', error);
      setFormError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  if (error || !customer) {
    return (
      <Layout>
        <div className="max-w-4xl space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/customers')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">แก้ไขลูกค้า</h1>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
            {error || 'ไม่พบลูกค้า'}
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
            onClick={() => router.push(`/customers/${customer.id}`)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">แก้ไขลูกค้า</h1>
          <span className="text-sm text-gray-400 dark:text-slate-500 font-mono">{customer.customer_code}</span>
        </div>

        {/* Form */}
        <CustomerForm
          initialData={{
            name: customer.name || '',
            contact_person: customer.contact_person || '',
            phone: customer.phone || '',
            email: customer.email || '',
            customer_type: customer.customer_type || 'retail',
            credit_limit: customer.credit_limit || 0,
            credit_days: customer.credit_days || 0,
            is_active: customer.is_active,
            notes: customer.notes || '',
            needs_tax_invoice: !!(customer.tax_id),
            tax_id: customer.tax_id || '',
            tax_company_name: customer.tax_company_name || '',
            tax_branch: customer.tax_branch || 'สำนักงานใหญ่',
            billing_address: customer.address || '',
            billing_district: customer.district || '',
            billing_amphoe: customer.amphoe || '',
            billing_province: customer.province || '',
            billing_postal_code: customer.postal_code || '',
            billing_same_as_shipping: false
          }}
          onSubmit={handleUpdateCustomer}
          onCancel={() => router.push(`/customers/${customer.id}`)}
          isEditing={true}
          isLoading={saving}
          error={formError}
        />
      </div>
    </Layout>
  );
}
