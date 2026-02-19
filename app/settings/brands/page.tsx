'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Plus, Check, X, Edit2, Trash2, Award
} from 'lucide-react';

interface BrandItem {
  id: string;
  name: string;
  sort_order: number;
}

export default function BrandsPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const { features } = useFeatures();

  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<BrandItem[]>([]);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');

  useEffect(() => {
    if (userProfile?.roles?.includes('admin') || userProfile?.roles?.includes('owner')) {
      fetchBrands();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);

  const fetchBrands = async () => {
    try {
      const res = await apiFetch('/api/brands');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setBrands(data.data || []);
    } catch (error) {
      console.error('Error fetching brands:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetAddForm = () => {
    setShowAddForm(false);
    setAddName('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const startEdit = (brand: BrandItem) => {
    setEditingId(brand.id);
    setEditingName(brand.name);
    resetAddForm();
  };

  const handleSaveEdit = async () => {
    if (!editingName.trim()) {
      showToast('กรุณากรอกชื่อแบรนด์', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/brands', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, name: editingName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }
      showToast('อัปเดตแบรนด์สำเร็จ');
      cancelEdit();
      await fetchBrands();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!addName.trim()) {
      showToast('กรุณากรอกชื่อแบรนด์', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }
      showToast('เพิ่มแบรนด์สำเร็จ');
      resetAddForm();
      await fetchBrands();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'เพิ่มไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (brand: BrandItem) => {
    if (!confirm(`ต้องการลบแบรนด์ "${brand.name}"?`)) return;
    setDeletingId(brand.id);
    try {
      const res = await apiFetch(`/api/brands?id=${brand.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('ลบแบรนด์สำเร็จ');
      await fetchBrands();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ลบไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Admin guard
  if (userProfile && !userProfile.roles?.includes('admin') && !userProfile.roles?.includes('owner')) {
    return (
      <Layout title="แบรนด์">
        <div className="text-center py-16 text-gray-500 dark:text-slate-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Layout>
    );
  }

  // Feature gate
  if (!features.product_brand) {
    return (
      <Layout
        title="แบรนด์"
        breadcrumbs={[
          { label: 'ตั้งค่าระบบ', href: '/settings' },
          { label: 'แบรนด์' },
        ]}
      >
        <div className="max-w-3xl">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
            <Award className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-medium text-amber-800 dark:text-amber-200">ฟีเจอร์แบรนด์ยังไม่ได้เปิดใช้งาน</p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">กรุณาเปิดฟีเจอร์แบรนด์ในการตั้งค่าเพื่อใช้งาน</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="แบรนด์"
      breadcrumbs={[
        { label: 'ตั้งค่าระบบ', href: '/settings' },
        { label: 'แบรนด์' },
      ]}
    >
      <div className="max-w-3xl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Brand count */}
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {brands.length} แบรนด์
            </p>

            {/* Brand Cards */}
            {brands.map(brand => (
              <div key={brand.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <div className="w-8 h-8 rounded-lg bg-[#F4511E]/10 flex items-center justify-center flex-shrink-0">
                    <Award className="w-4 h-4 text-[#F4511E]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === brand.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                          className="flex-1 px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
                          autoFocus
                        />
                        <button onClick={handleSaveEdit} disabled={saving} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50">
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button onClick={cancelEdit} className="p-1 text-gray-400 hover:text-gray-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <p className="font-medium text-gray-900 dark:text-white">{brand.name}</p>
                    )}
                  </div>
                  {editingId !== brand.id && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(brand)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                        title="แก้ไข"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(brand)}
                        disabled={deletingId === brand.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="ลบ"
                      >
                        {deletingId === brand.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Add brand form */}
            {showAddForm ? (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 space-y-3">
                <div className="text-sm font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
                  <Award className="w-4 h-4 text-[#F4511E]" />
                  เพิ่มแบรนด์
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">ชื่อแบรนด์ *</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') resetAddForm(); }}
                    placeholder="เช่น Nike, Samsung"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleAdd}
                    disabled={saving}
                    className="px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    บันทึก
                  </button>
                  <button
                    onClick={resetAddForm}
                    className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                  >
                    <X className="w-4 h-4" /> ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { cancelEdit(); setShowAddForm(true); }}
                className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-[#F4511E] hover:text-[#F4511E] transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                เพิ่มแบรนด์
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
