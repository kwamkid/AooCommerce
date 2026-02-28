'use client';

import { useState, useEffect } from 'react';
import SuperAdminLayout from '../components/SuperAdminLayout';
import { apiFetch } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils/format';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { Package, Plus, Edit2, Trash2, Users, Loader2, X } from 'lucide-react';

interface PackageItem {
  id: string;
  name: string;
  slug: string;
  max_companies: number | null;
  max_members_per_company: number | null;
  price_monthly: number;
  price_yearly: number;
  features: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  subscriber_count: number;
}

interface FormData {
  name: string;
  slug: string;
  max_companies: string;
  max_members_per_company: string;
  price_monthly: string;
  price_yearly: string;
  features: string;
  sort_order: string;
}

const emptyForm: FormData = {
  name: '',
  slug: '',
  max_companies: '',
  max_members_per_company: '',
  price_monthly: '0',
  price_yearly: '0',
  features: '{}',
  sort_order: '0',
};

export default function SuperAdminPackages() {
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/superadmin/packages');
      if (res.ok) {
        const data = await res.json();
        setPackages(data.packages || []);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPackages(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (pkg: PackageItem) => {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name,
      slug: pkg.slug,
      max_companies: pkg.max_companies !== null ? String(pkg.max_companies) : '',
      max_members_per_company: pkg.max_members_per_company !== null ? String(pkg.max_members_per_company) : '',
      price_monthly: String(pkg.price_monthly || 0),
      price_yearly: String(pkg.price_yearly || 0),
      features: JSON.stringify(pkg.features || {}, null, 2),
      sort_order: String(pkg.sort_order || 0),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      showToast('กรุณากรอกชื่อและ slug', 'error');
      return;
    }

    let features: Record<string, unknown> = {};
    try {
      features = JSON.parse(form.features || '{}');
    } catch {
      showToast('Features JSON ไม่ถูกต้อง', 'error');
      return;
    }

    setSaving(true);
    try {
      const body = {
        ...(editingId ? { id: editingId } : {}),
        name: form.name.trim(),
        slug: form.slug.trim(),
        max_companies: form.max_companies ? parseInt(form.max_companies) : null,
        max_members_per_company: form.max_members_per_company ? parseInt(form.max_members_per_company) : null,
        price_monthly: parseFloat(form.price_monthly) || 0,
        price_yearly: parseFloat(form.price_yearly) || 0,
        features,
        sort_order: parseInt(form.sort_order) || 0,
      };

      const res = await apiFetch('/api/superadmin/packages', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }

      showToast(editingId ? 'อัปเดตสำเร็จ' : 'สร้าง package สำเร็จ', 'success');
      setShowModal(false);
      fetchPackages();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({ title: `ต้องการปิดการใช้งาน package "${name}"?`, variant: 'danger' }); if (!ok) return;
    try {
      const res = await apiFetch(`/api/superadmin/packages?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      showToast('ปิดการใช้งานแล้ว', 'success');
      fetchPackages();
    } catch {
      showToast('ลบไม่สำเร็จ', 'error');
    }
  };

  const handleNameChange = (val: string) => {
    setForm(prev => ({
      ...prev,
      name: val,
      slug: !editingId ? val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : prev.slug,
    }));
  };

  return (
    <SuperAdminLayout title="Packages" subtitle="จัดการแพ็กเกจทั้งหมด">
      <div className="space-y-4">
        {/* Add Button */}
        <div className="flex justify-end">
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors">
            <Plus className="w-4 h-4" /> เพิ่ม Package
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-violet-500 animate-spin" /></div>
        ) : packages.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">ยังไม่มี package</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages.map(pkg => (
              <div key={pkg.id} className={`rounded-lg p-5 ${pkg.is_active ? 'bg-slate-800' : 'bg-slate-800/30 opacity-60'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">{pkg.name}</h3>
                    <p className="text-xs text-slate-400 font-mono">{pkg.slug}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(pkg)} className="p-1.5 text-slate-400 hover:text-violet-400 transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {pkg.is_active && (
                      <button onClick={() => handleDelete(pkg.id, pkg.name)} className="p-1.5 text-slate-400 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mb-3">
                  <span className="text-2xl font-bold text-violet-400">฿{formatNumber(pkg.price_monthly)}</span>
                  <span className="text-slate-400">/เดือน</span>
                  {pkg.price_yearly > 0 && (
                    <p className="text-xs text-slate-400">หรือ ฿{formatNumber(pkg.price_yearly)}/ปี</p>
                  )}
                </div>

                <div className="space-y-1.5 mb-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Companies</span>
                    <span className="font-medium text-white">{pkg.max_companies !== null ? pkg.max_companies : 'ไม่จำกัด'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">สมาชิก/บริษัท</span>
                    <span className="font-medium text-white">{pkg.max_members_per_company !== null ? pkg.max_members_per_company : 'ไม่จำกัด'}</span>
                  </div>
                </div>

                {Object.keys(pkg.features || {}).length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-slate-400 mb-1">Features:</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(pkg.features).map(([key, val]) => (
                        <span key={key} className="px-2 py-0.5 text-xs bg-slate-700 text-slate-300 rounded-full">
                          {key}: {String(val)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-700/50 flex items-center gap-2 text-slate-400">
                  <Users className="w-4 h-4" />
                  <span>{pkg.subscriber_count} subscribers</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowModal(false)} />
          <div className="relative bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-700/50">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-white">
                {editingId ? 'แก้ไข Package' : 'สร้าง Package ใหม่'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block font-medium text-slate-300 mb-1">ชื่อ Package</label>
                <input type="text" value={form.name} onChange={e => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Slug</label>
                <input type="text" value={form.slug} onChange={e => setForm(prev => ({ ...prev, slug: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Max Companies</label>
                  <input type="number" value={form.max_companies} onChange={e => setForm(prev => ({ ...prev, max_companies: e.target.value }))} placeholder="ไม่จำกัด"
                    className="w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Max สมาชิก/บริษัท</label>
                  <input type="number" value={form.max_members_per_company} onChange={e => setForm(prev => ({ ...prev, max_members_per_company: e.target.value }))} placeholder="ไม่จำกัด"
                    className="w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">ราคา/เดือน (฿)</label>
                  <input type="number" value={form.price_monthly} onChange={e => setForm(prev => ({ ...prev, price_monthly: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">ราคา/ปี (฿)</label>
                  <input type="number" value={form.price_yearly} onChange={e => setForm(prev => ({ ...prev, price_yearly: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Features (JSON)</label>
                <textarea rows={4} value={form.features} onChange={e => setForm(prev => ({ ...prev, features: e.target.value }))}
                  placeholder='{"stock_enabled": true, "max_warehouses": 3}'
                  className="w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
                <p className="text-xs text-slate-500 mt-1">เช่น stock_enabled, max_warehouses</p>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">ลำดับ</label>
                <input type="number" value={form.sort_order} onChange={e => setForm(prev => ({ ...prev, sort_order: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-700/50">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </SuperAdminLayout>
  );
}
