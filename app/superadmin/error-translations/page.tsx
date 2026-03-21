'use client';

import { useState, useEffect } from 'react';
import SuperAdminLayout from '../components/SuperAdminLayout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { Languages, Plus, Edit2, Trash2, Loader2, X, Download, Search, ToggleLeft, ToggleRight } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────

interface ErrorTranslation {
  id?: string;
  error_key: string;
  is_regex: boolean;
  thai_message: string;
  category: string;
  is_active: boolean;
  sort_order: number;
}

interface FormData {
  error_key: string;
  is_regex: boolean;
  thai_message: string;
  category: string;
  sort_order: string;
}

const emptyForm: FormData = {
  error_key: '',
  is_regex: false,
  thai_message: '',
  category: 'common',
  sort_order: '99',
};

const CATEGORIES = [
  { value: 'product', label: 'Product / Shop' },
  { value: 'bundle_deal', label: 'Bundle Deal' },
  { value: 'addon_deal', label: 'Add-on Deal' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'common', label: 'Common' },
];

const CATEGORY_COLORS: Record<string, string> = {
  product: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  bundle_deal: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  addon_deal: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  logistics: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  common: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export default function SuperAdminErrorTranslations() {
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [translations, setTranslations] = useState<ErrorTranslation[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const fetchTranslations = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/superadmin/error-translations');
      if (res.ok) {
        const data = await res.json();
        setTranslations(data.translations || []);
      }
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTranslations(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await apiFetch('/api/superadmin/error-translations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed' }),
      });
      if (res.ok) {
        showToast('Seed ค่าเริ่มต้นสำเร็จ');
        fetchTranslations();
      } else {
        const data = await res.json();
        showToast(data.error || 'Seed ไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (t: ErrorTranslation) => {
    setEditingId(t.id || null);
    setForm({
      error_key: t.error_key,
      is_regex: t.is_regex,
      thai_message: t.thai_message,
      category: t.category,
      sort_order: String(t.sort_order),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.error_key.trim() || !form.thai_message.trim()) {
      showToast('กรุณากรอก Error Key และ ข้อความภาษาไทย', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        error_key: form.error_key,
        is_regex: form.is_regex,
        thai_message: form.thai_message,
        category: form.category,
        sort_order: parseInt(form.sort_order) || 99,
      };
      const res = await apiFetch('/api/superadmin/error-translations', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast(editingId ? 'อัพเดทสำเร็จ' : 'เพิ่มสำเร็จ');
        setShowModal(false);
        fetchTranslations();
      } else {
        const data = await res.json();
        showToast(data.error || 'บันทึกไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: ErrorTranslation) => {
    if (!t.id) return;
    const ok = await confirm({ title: `ลบ "${t.error_key}" ?`, confirmLabel: 'ลบ' });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/superadmin/error-translations?id=${t.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('ลบสำเร็จ');
        fetchTranslations();
      }
    } catch {
      showToast('ลบไม่สำเร็จ', 'error');
    }
  };

  const handleToggle = async (t: ErrorTranslation) => {
    if (!t.id) return;
    try {
      const res = await apiFetch('/api/superadmin/error-translations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, is_active: !t.is_active }),
      });
      if (res.ok) {
        setTranslations(prev => prev.map(item =>
          item.id === t.id ? { ...item, is_active: !item.is_active } : item
        ));
      }
    } catch {
      showToast('อัพเดทไม่สำเร็จ', 'error');
    }
  };

  // Filter
  const filtered = translations.filter(t => {
    if (filterCategory && t.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.error_key.toLowerCase().includes(q) || t.thai_message.toLowerCase().includes(q);
    }
    return true;
  });

  const hasDbData = translations.some(t => t.id);

  return (
    <SuperAdminLayout title="จัดการคำแปลข้อผิดพลาด">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Languages className="w-7 h-7 text-violet-500" />
            <div>
              <h1 className="text-2xl font-bold text-white">Error Translations</h1>
              <p className="text-sm text-slate-400">จัดการแปล Error จาก Shopee API เป็นภาษาไทย</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!hasDbData && (
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {seeding ? 'กำลัง Seed...' : 'Seed ค่าเริ่มต้น'}
              </button>
            )}
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              เพิ่ม Error
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา error key หรือข้อความไทย..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterCategory('')}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                !filterCategory
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
            >
              ทั้งหมด
            </button>
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => setFilterCategory(filterCategory === c.value ? '' : c.value)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  filterCategory === c.value
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Languages className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">
              {translations.length === 0
                ? 'ยังไม่มีข้อมูล — กด "Seed ค่าเริ่มต้น" เพื่อเพิ่ม error translations พื้นฐาน'
                : 'ไม่พบรายการที่ค้นหา'
              }
            </p>
          </div>
        ) : (
          <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium w-10">#</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Error Key</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">ข้อความภาษาไทย</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium w-28">หมวด</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium w-16">Regex</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium w-16">สถานะ</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium w-24">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filtered.map((t, i) => (
                    <tr key={t.id || i} className={`hover:bg-slate-700/30 transition-colors ${!t.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-slate-500">{t.sort_order}</td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-slate-900 px-2 py-1 rounded text-amber-400 font-mono break-all">
                          {t.error_key}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-slate-200">{t.thai_message}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.common}`}>
                          {CATEGORIES.find(c => c.value === t.category)?.label || t.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {t.is_regex && (
                          <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-yellow-900/30 text-yellow-400 font-mono">
                            .*
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {t.id ? (
                          <button onClick={() => handleToggle(t)} className="transition-colors">
                            {t.is_active
                              ? <ToggleRight className="w-5 h-5 text-green-400" />
                              : <ToggleLeft className="w-5 h-5 text-slate-500" />
                            }
                          </button>
                        ) : (
                          <span className="text-green-400 text-xs">built-in</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {t.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-slate-600 rounded-lg transition-colors" title="แก้ไข">
                              <Edit2 className="w-4 h-4 text-slate-400" />
                            </button>
                            <button onClick={() => handleDelete(t)} className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors" title="ลบ">
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-500">
              แสดง {filtered.length} จาก {translations.length} รายการ
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((t, i) => (
              <div key={t.id || i} className={`bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 ${!t.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <code className="text-xs bg-slate-900 px-2 py-1 rounded text-amber-400 font-mono break-all">
                    {t.error_key}
                  </code>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {t.is_regex && (
                      <span className="px-1.5 py-0.5 text-xs rounded-full bg-yellow-900/30 text-yellow-400 font-mono">.*</span>
                    )}
                    {t.id ? (
                      <button onClick={() => handleToggle(t)} className="transition-colors">
                        {t.is_active
                          ? <ToggleRight className="w-5 h-5 text-green-400" />
                          : <ToggleLeft className="w-5 h-5 text-slate-500" />
                        }
                      </button>
                    ) : (
                      <span className="text-green-400 text-xs">built-in</span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-200 mb-2">{t.thai_message}</p>
                <div className="flex items-center justify-between">
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.common}`}>
                    {CATEGORIES.find(c => c.value === t.category)?.label || t.category}
                  </span>
                  {t.id && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-slate-600 rounded-lg transition-colors" title="แก้ไข">
                        <Edit2 className="w-4 h-4 text-slate-400" />
                      </button>
                      <button onClick={() => handleDelete(t)} className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors" title="ลบ">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div className="text-xs text-slate-500 pt-1">
              แสดง {filtered.length} จาก {translations.length} รายการ
            </div>
          </div>
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">
                {editingId ? 'แก้ไข Error Translation' : 'เพิ่ม Error Translation'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-700 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Error Key */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Error Key <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.error_key}
                  onChange={e => setForm(prev => ({ ...prev, error_key: e.target.value }))}
                  placeholder="e.g. The shop did not pass KYC"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent font-mono"
                />
                <p className="mt-1 text-xs text-slate-500">Error message หรือ error code จาก Shopee API</p>
              </div>

              {/* Is Regex */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_regex}
                  onChange={e => setForm(prev => ({ ...prev, is_regex: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-600 text-violet-500 focus:ring-violet-500 bg-slate-900"
                />
                <span className="text-sm text-slate-300">ใช้ Regex pattern</span>
                <span className="text-xs text-slate-500">(case-insensitive)</span>
              </label>

              {/* Thai Message */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  ข้อความภาษาไทย <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={form.thai_message}
                  onChange={e => setForm(prev => ({ ...prev, thai_message: e.target.value }))}
                  placeholder="ข้อความที่จะแสดงให้ผู้ใช้เห็นแทน error ภาษาอังกฤษ"
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>

              {/* Category + Sort Order */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">หมวด</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">ลำดับ</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={e => setForm(prev => ({ ...prev, sort_order: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editingId ? 'อัพเดท' : 'เพิ่ม'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog}
    </SuperAdminLayout>
  );
}
