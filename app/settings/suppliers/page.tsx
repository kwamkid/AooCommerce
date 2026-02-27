'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Plus, X, Factory, Edit2, Trash2, Phone, Mail,
  Building2, CreditCard, Handshake, Banknote, RefreshCw, Copy, ExternalLink,
  ChevronDown,
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  supplier_type: 'cash' | 'credit' | 'consignment';
  payment_terms: number;
  bank_name: string | null;
  bank_account: string | null;
  notes: string | null;
  access_code: string | null;
  portal_enabled: boolean;
}

const SUPPLIER_TYPES = [
  { value: 'cash', label: 'Cash (เงินสด)', icon: Banknote, color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
  { value: 'credit', label: 'Credit (เครดิต)', icon: CreditCard, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
  { value: 'consignment', label: 'Consignment (ฝากขาย)', icon: Handshake, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
] as const;

const emptyForm: {
  name: string; contact_name: string; phone: string; email: string; address: string; tax_id: string;
  supplier_type: 'cash' | 'credit' | 'consignment'; payment_terms: number;
  bank_name: string; bank_account: string; notes: string;
} = {
  name: '', contact_name: '', phone: '', email: '', address: '', tax_id: '',
  supplier_type: 'cash', payment_terms: 0,
  bank_name: '', bank_account: '', notes: '',
};

export default function SuppliersPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const { features } = useFeatures();

  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal form
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Expanded card
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile?.roles?.includes('admin') || userProfile?.roles?.includes('owner')) {
      fetchSuppliers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);

  // Feature gate — redirect to /inventory/receives if supplier feature is off
  useEffect(() => {
    if (features && !features.supplier) {
      router.replace('/inventory/receives');
    }
  }, [features, router]);

  const fetchSuppliers = async () => {
    try {
      const res = await apiFetch('/api/suppliers');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSuppliers(data.data || []);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openAddForm = () => {
    setEditingSupplier(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setForm({
      name: supplier.name,
      contact_name: supplier.contact_name || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      tax_id: supplier.tax_id || '',
      supplier_type: supplier.supplier_type,
      payment_terms: supplier.payment_terms || 0,
      bank_name: supplier.bank_name || '',
      bank_account: supplier.bank_account || '',
      notes: supplier.notes || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('กรุณากรอกชื่อซัพพลายเออร์', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = editingSupplier ? { id: editingSupplier.id, ...form } : form;
      const res = await apiFetch('/api/suppliers', {
        method: editingSupplier ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      showToast(editingSupplier ? 'อัปเดตสำเร็จ' : 'เพิ่มซัพพลายเออร์สำเร็จ');
      setShowForm(false);
      await fetchSuppliers();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    if (!confirm(`ต้องการลบ "${supplier.name}"?`)) return;
    setDeletingId(supplier.id);
    try {
      const res = await apiFetch(`/api/suppliers?id=${supplier.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('ลบสำเร็จ');
      await fetchSuppliers();
    } catch {
      showToast('ลบไม่สำเร็จ', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRegenerateCode = async (supplier: Supplier) => {
    try {
      const res = await apiFetch(`/api/suppliers/${supplier.id}/regenerate-code`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      showToast('สร้างรหัสใหม่สำเร็จ');
      await fetchSuppliers();
    } catch {
      showToast('สร้างรหัสไม่สำเร็จ', 'error');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    showToast('คัดลอกรหัสแล้ว');
  };

  const getTypeConfig = (type: string) => SUPPLIER_TYPES.find(t => t.value === type) || SUPPLIER_TYPES[0];

  // Admin guard
  if (userProfile && !userProfile.roles?.includes('admin') && !userProfile.roles?.includes('owner')) {
    return (
      <Layout title="ซัพพลายเออร์">
        <div className="text-center py-16 text-gray-500 dark:text-slate-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Layout>
    );
  }

  if (!features.supplier) return null;

  return (
    <Layout
      title="ซัพพลายเออร์"
      breadcrumbs={[
        { label: 'ตั้งค่าระบบ', href: '/settings' },
        { label: 'ซัพพลายเออร์' },
      ]}
    >
      <div className="max-w-4xl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {suppliers.length} ซัพพลายเออร์
              </p>
              <button
                onClick={openAddForm}
                className="px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                เพิ่มซัพพลายเออร์
              </button>
            </div>

            {/* Supplier Cards */}
            {suppliers.map(supplier => {
              const typeConfig = getTypeConfig(supplier.supplier_type);
              const TypeIcon = typeConfig.icon;
              const isExpanded = expandedId === supplier.id;

              return (
                <div key={supplier.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : supplier.id)}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${typeConfig.color}`}>
                      <TypeIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-white">{supplier.name}</p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeConfig.color}`}>
                          {typeConfig.label}
                        </span>
                      </div>
                      {supplier.contact_name && (
                        <p className="text-sm text-gray-500 dark:text-slate-400 truncate">{supplier.contact_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditForm(supplier); }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                        title="แก้ไข"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(supplier); }}
                        disabled={deletingId === supplier.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="ลบ"
                      >
                        {deletingId === supplier.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-slate-700 px-4 py-3 space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        {supplier.phone && (
                          <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
                            <Phone className="w-3.5 h-3.5" /> {supplier.phone}
                          </div>
                        )}
                        {supplier.email && (
                          <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
                            <Mail className="w-3.5 h-3.5" /> {supplier.email}
                          </div>
                        )}
                        {supplier.tax_id && (
                          <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
                            <Building2 className="w-3.5 h-3.5" /> เลขผู้เสียภาษี: {supplier.tax_id}
                          </div>
                        )}
                        {supplier.supplier_type === 'credit' && (
                          <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
                            <CreditCard className="w-3.5 h-3.5" /> เครดิต {supplier.payment_terms} วัน
                          </div>
                        )}
                        {supplier.bank_name && (
                          <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
                            <Banknote className="w-3.5 h-3.5" /> {supplier.bank_name} {supplier.bank_account}
                          </div>
                        )}
                      </div>
                      {supplier.address && (
                        <p className="text-gray-500 dark:text-slate-400 text-xs">{supplier.address}</p>
                      )}
                      {supplier.notes && (
                        <p className="text-gray-400 dark:text-slate-500 text-xs italic">{supplier.notes}</p>
                      )}

                      {/* Portal section */}
                      <div className="pt-2 border-t border-gray-100 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500 dark:text-slate-400 flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> Supplier Portal
                          </span>
                          {supplier.access_code ? (
                            <div className="flex items-center gap-2">
                              <code className="text-xs font-mono bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded">{supplier.access_code}</code>
                              <button onClick={() => copyCode(supplier.access_code!)} className="p-1 text-gray-400 hover:text-gray-600" title="คัดลอก">
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleRegenerateCode(supplier)} className="p-1 text-gray-400 hover:text-amber-600" title="สร้างรหัสใหม่">
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleRegenerateCode(supplier)}
                              className="text-xs text-[#F4511E] hover:underline"
                            >
                              เปิด Portal
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {suppliers.length === 0 && (
              <div className="text-center py-12 text-gray-400 dark:text-slate-500">
                <Factory className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>ยังไม่มีซัพพลายเออร์</p>
                <button onClick={openAddForm} className="mt-3 text-sm text-[#F4511E] hover:underline">
                  เพิ่มซัพพลายเออร์ตัวแรก
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Factory className="w-5 h-5 text-[#F4511E]" />
                {editingSupplier ? 'แก้ไขซัพพลายเออร์' : 'เพิ่มซัพพลายเออร์'}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อ <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
                  placeholder="ชื่อบริษัท/ซัพพลายเออร์"
                  autoFocus
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ประเภท</label>
                <div className="grid grid-cols-3 gap-2">
                  {SUPPLIER_TYPES.map(type => {
                    const Icon = type.icon;
                    const isSelected = form.supplier_type === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, supplier_type: type.value }))}
                        className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-xs ${
                          isSelected
                            ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/20 text-[#F4511E]'
                            : 'border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Credit terms — show only for credit type */}
              {form.supplier_type === 'credit' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เครดิต (วัน)</label>
                  <input
                    type="number"
                    value={form.payment_terms}
                    onChange={e => setForm(prev => ({ ...prev, payment_terms: parseInt(e.target.value) || 0 }))}
                    className="w-32 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
                    placeholder="30"
                    min={0}
                  />
                </div>
              )}

              {/* Contact */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ชื่อผู้ติดต่อ</label>
                  <input
                    type="text"
                    value={form.contact_name}
                    onChange={e => setForm(prev => ({ ...prev, contact_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เบอร์โทร</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">อีเมล</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ที่อยู่</label>
                <textarea
                  value={form.address}
                  onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 resize-none"
                />
              </div>

              {/* Tax & Bank */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เลขผู้เสียภาษี</label>
                  <input
                    type="text"
                    value={form.tax_id}
                    onChange={e => setForm(prev => ({ ...prev, tax_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ธนาคาร</label>
                  <input
                    type="text"
                    value={form.bank_name}
                    onChange={e => setForm(prev => ({ ...prev, bank_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
                    placeholder="เช่น กสิกร, กรุงเทพ"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เลขบัญชีธนาคาร</label>
                <input
                  type="text"
                  value={form.bank_account}
                  onChange={e => setForm(prev => ({ ...prev, bank_account: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุ</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-slate-700">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingSupplier ? 'บันทึก' : 'เพิ่ม'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
