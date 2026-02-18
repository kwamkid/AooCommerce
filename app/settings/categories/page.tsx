'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Plus, Check, X, Edit2, Trash2, Tag, ChevronRight
} from 'lucide-react';

interface CategoryItem {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  children?: CategoryItem[];
}

export default function CategoriesPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryItem[]>([]);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');

  // Add sub-category inline
  const [addingChildParentId, setAddingChildParentId] = useState<string | null>(null);
  const [childName, setChildName] = useState('');

  useFetchOnce(() => {
    fetchCategories();
  }, userProfile?.role === 'admin' || userProfile?.role === 'owner');

  const fetchCategories = async () => {
    try {
      const res = await apiFetch('/api/categories');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setCategories(data.data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetAddForm = () => {
    setShowAddForm(false);
    setAddParentId(null);
    setAddName('');
  };

  const resetChildForm = () => {
    setAddingChildParentId(null);
    setChildName('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const startEdit = (cat: CategoryItem) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
    resetAddForm();
    resetChildForm();
  };

  const handleSaveEdit = async () => {
    if (!editingName.trim()) {
      showToast('กรุณากรอกชื่อหมวดหมู่', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, name: editingName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }
      showToast('อัปเดตหมวดหมู่สำเร็จ');
      cancelEdit();
      await fetchCategories();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!addName.trim()) {
      showToast('กรุณากรอกชื่อหมวดหมู่', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), parent_id: addParentId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }
      showToast('เพิ่มหมวดหมู่สำเร็จ');
      resetAddForm();
      await fetchCategories();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'เพิ่มไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddChild = async (parentId: string) => {
    if (!childName.trim()) {
      showToast('กรุณากรอกชื่อหมวดย่อย', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: childName.trim(), parent_id: parentId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }
      showToast('เพิ่มหมวดย่อยสำเร็จ');
      resetChildForm();
      await fetchCategories();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'เพิ่มไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: CategoryItem) => {
    const childCount = cat.children?.length || 0;
    const msg = childCount > 0
      ? `หมวดหมู่ "${cat.name}" มีหมวดย่อย ${childCount} รายการ จะถูกลบด้วย ต้องการลบ?`
      : `ต้องการลบหมวดหมู่ "${cat.name}"?`;
    if (!confirm(msg)) return;

    setDeletingId(cat.id);
    try {
      // Delete children first if any
      if (childCount > 0) {
        for (const child of cat.children!) {
          await apiFetch(`/api/categories?id=${child.id}`, { method: 'DELETE' });
        }
      }
      const res = await apiFetch(`/api/categories?id=${cat.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('ลบหมวดหมู่สำเร็จ');
      await fetchCategories();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ลบไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteChild = async (child: CategoryItem) => {
    if (!confirm(`ต้องการลบหมวดย่อย "${child.name}"?`)) return;
    setDeletingId(child.id);
    try {
      const res = await apiFetch(`/api/categories?id=${child.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('ลบหมวดย่อยสำเร็จ');
      await fetchCategories();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ลบไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Admin guard
  if (userProfile && userProfile.role !== 'admin' && userProfile.role !== 'owner') {
    return (
      <Layout title="หมวดหมู่สินค้า">
        <div className="text-center py-16 text-gray-500 dark:text-slate-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Layout>
    );
  }

  return (
    <Layout
      title="หมวดหมู่สินค้า"
      breadcrumbs={[
        { label: 'ตั้งค่าระบบ', href: '/settings' },
        { label: 'หมวดหมู่สินค้า' },
      ]}
    >
      <div className="max-w-3xl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Category count */}
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {categories.length} หมวดหมู่
            </p>

            {/* Category Cards */}
            {categories.map(parent => (
              <div key={parent.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                {/* Parent row */}
                <div className="flex items-center gap-3 p-4">
                  <div className="w-8 h-8 rounded-lg bg-[#F4511E]/10 flex items-center justify-center flex-shrink-0">
                    <Tag className="w-4 h-4 text-[#F4511E]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === parent.id ? (
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
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-white">{parent.name}</p>
                        {parent.children && parent.children.length > 0 && (
                          <span className="text-xs text-gray-400 dark:text-slate-500">
                            ({parent.children.length} หมวดย่อย)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {editingId !== parent.id && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => { resetChildForm(); setAddingChildParentId(parent.id); cancelEdit(); }}
                        className="p-1.5 text-gray-400 hover:text-[#F4511E] transition-colors"
                        title="เพิ่มหมวดย่อย"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => startEdit(parent)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                        title="แก้ไข"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(parent)}
                        disabled={deletingId === parent.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="ลบ"
                      >
                        {deletingId === parent.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Children */}
                {parent.children && parent.children.length > 0 && (
                  <div className="border-t border-gray-100 dark:border-slate-700">
                    {parent.children.map(child => (
                      <div key={child.id} className="flex items-center gap-3 px-4 py-2.5 pl-12 border-b border-gray-50 dark:border-slate-700/50 last:border-b-0">
                        <ChevronRight className="w-3 h-3 text-gray-300 dark:text-slate-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          {editingId === child.id ? (
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
                            <p className="text-sm text-gray-700 dark:text-slate-300">{child.name}</p>
                          )}
                        </div>
                        {editingId !== child.id && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => startEdit(child)}
                              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                              title="แก้ไข"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteChild(child)}
                              disabled={deletingId === child.id}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                              title="ลบ"
                            >
                              {deletingId === child.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add child inline form */}
                {addingChildParentId === parent.id && (
                  <div className="border-t border-gray-100 dark:border-slate-700 px-4 py-3 pl-12 bg-gray-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="w-3 h-3 text-gray-300 dark:text-slate-600 flex-shrink-0" />
                      <input
                        type="text"
                        value={childName}
                        onChange={e => setChildName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddChild(parent.id); if (e.key === 'Escape') resetChildForm(); }}
                        placeholder="ชื่อหมวดย่อย"
                        className="flex-1 px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
                        autoFocus
                      />
                      <button onClick={() => handleAddChild(parent.id)} disabled={saving} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button onClick={resetChildForm} className="p-1 text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add parent category form */}
            {showAddForm ? (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 space-y-3">
                <div className="text-sm font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-[#F4511E]" />
                  เพิ่มหมวดหมู่
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">ชื่อหมวดหมู่ *</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') resetAddForm(); }}
                    placeholder="เช่น เครื่องดื่ม, อาหาร"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">หมวดหมู่หลัก (ไม่ระบุ = เป็นหมวดหลักเอง)</label>
                  <select
                    value={addParentId || ''}
                    onChange={e => setAddParentId(e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
                  >
                    <option value="">-- ไม่มี (เป็นหมวดหลัก) --</option>
                    {categories.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
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
                onClick={() => { cancelEdit(); resetChildForm(); setShowAddForm(true); }}
                className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-[#F4511E] hover:text-[#F4511E] transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                เพิ่มหมวดหมู่
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
