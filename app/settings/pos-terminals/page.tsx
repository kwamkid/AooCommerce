// Path: app/settings/pos-terminals/page.tsx
'use client';

import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Plus, Check, X, Edit2, Trash2, Monitor, AlertTriangle, Warehouse,
} from 'lucide-react';

interface TerminalItem {
  id: string;
  name: string;
  code: string | null;
  warehouse_id: string | null;
  is_active: boolean;
  created_at: string;
  warehouse: { id: string; name: string; code: string | null } | null;
}

interface WarehouseOption {
  id: string;
  name: string;
  code: string | null;
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? 'bg-[#F4511E]' : 'bg-gray-300 dark:bg-slate-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

export default function PosTerminalsPage() {
  const { userProfile } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [terminals, setTerminals] = useState<TerminalItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formWarehouseId, setFormWarehouseId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useFetchOnce(() => {
    fetchTerminals();
    fetchWarehouses();
  }, userProfile?.role === 'admin' || userProfile?.role === 'owner');

  const fetchTerminals = async () => {
    try {
      const response = await apiFetch('/api/pos/terminals');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setTerminals(data.terminals || []);
    } catch (error) {
      console.error('Error fetching terminals:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const response = await apiFetch('/api/warehouses');
      if (!response.ok) return;
      const data = await response.json();
      setWarehouses((data.warehouses || []).filter((w: any) => w.is_active));
    } catch {
      // Silent — warehouses are optional
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormCode('');
    setFormWarehouseId('');
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (t: TerminalItem) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormCode(t.code || '');
    setFormWarehouseId(t.warehouse_id || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      showToast('กรุณากรอกชื่อจุดขาย', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = editingId
        ? { id: editingId, name: formName, code: formCode, warehouse_id: formWarehouseId || null }
        : { name: formName, code: formCode, warehouse_id: formWarehouseId || null };

      const response = await apiFetch('/api/pos/terminals', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      showToast(editingId ? 'อัปเดตจุดขายสำเร็จ' : 'สร้างจุดขายสำเร็จ');
      resetForm();
      await fetchTerminals();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (t: TerminalItem) => {
    try {
      const response = await apiFetch('/api/pos/terminals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, is_active: !t.is_active }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle');
      }
      setTerminals(prev => prev.map(item =>
        item.id === t.id ? { ...item, is_active: !item.is_active } : item
      ));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'เปลี่ยนสถานะไม่สำเร็จ';
      showToast(msg, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await apiFetch(`/api/pos/terminals?id=${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete');
      }
      showToast('ลบจุดขายสำเร็จ');
      await fetchTerminals();
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
      <Layout title="จุดขาย POS">
        <div className="text-center py-16 text-gray-500 dark:text-slate-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Layout>
    );
  }

  return (
    <Layout
      title="จุดขาย POS"
      breadcrumbs={[
        { label: 'ตั้งค่าระบบ', href: '/settings' },
        { label: 'จุดขาย POS' },
      ]}
    >
      <div className="max-w-3xl">
        {/* POS not enabled */}
        {!features.pos && !loading && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3 mb-6">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-medium text-amber-800 dark:text-amber-200">ฟีเจอร์ POS ยังไม่เปิดใช้งาน</p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">กรุณาเปิดใช้งาน POS ในหน้าข้อมูลบริษัท &gt; ปรับแต่ง Features</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
          </div>
        ) : features.pos ? (
          <div className="space-y-4">
            {/* Info */}
            <p className="text-sm text-gray-500 dark:text-slate-400">
              จุดขาย POS ใช้แยกสาขา/Event — แต่ละจุดขายเลือกผูกคลังสินค้าเพื่อตัดสต็อกได้
            </p>

            {/* Terminal Cards */}
            {terminals.map(t => (
              <div key={t.id} className="space-y-4">
                <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden ${!t.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-10 h-10 rounded-lg bg-[#F4511E]/10 flex items-center justify-center flex-shrink-0">
                      <Monitor className="w-5 h-5 text-[#F4511E]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{t.name}</p>
                        {t.code && <span className="text-xs text-gray-400 dark:text-slate-500">({t.code})</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                        {t.is_active ? (
                          <span className="text-green-600 dark:text-green-400">เปิดใช้งาน</span>
                        ) : (
                          <span className="text-gray-400">ปิดใช้งาน</span>
                        )}
                        <span className="ml-1">
                          {t.warehouse ? (
                            <span className="inline-flex items-center gap-1">
                              <Warehouse className="w-3 h-3" />
                              {t.warehouse.name}
                            </span>
                          ) : (
                            <span className="text-gray-400">ไม่ตัดสต็อก</span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Toggle checked={t.is_active} onChange={() => handleToggleActive(t)} />
                      <button
                        onClick={() => startEdit(t)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('ลบจุดขายนี้?')) handleDelete(t.id);
                        }}
                        disabled={deletingId === t.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      >
                        {deletingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline edit form */}
                {editingId === t.id && showForm && renderForm()}
              </div>
            ))}

            {/* Add button or form */}
            {showForm && !editingId ? (
              renderForm()
            ) : !showForm ? (
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-[#F4511E] hover:text-[#F4511E] transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                เพิ่มจุดขาย POS
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Layout>
  );

  function renderForm() {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 space-y-3">
        <div className="text-sm font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
          <Monitor className="w-4 h-4 text-[#F4511E]" />
          {editingId ? 'แก้ไขจุดขาย' : 'เพิ่มจุดขาย'}
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">ชื่อจุดขาย *</label>
          <input
            type="text"
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="เช่น สาขาสยาม, Event ตลาดนัด JJ"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">รหัสจุดขาย</label>
          <input
            type="text"
            value={formCode}
            onChange={e => setFormCode(e.target.value)}
            placeholder="เช่น POS01"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">คลังสินค้า (ตัดสต็อก)</label>
          <select
            value={formWarehouseId}
            onChange={e => setFormWarehouseId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
          >
            <option value="">ไม่ตัดสต็อก</option>
            {warehouses.map(wh => (
              <option key={wh.id} value={wh.id}>{wh.name}{wh.code ? ` (${wh.code})` : ''}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            บันทึก
          </button>
          <button
            onClick={resetForm}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" /> ยกเลิก
          </button>
        </div>
      </div>
    );
  }
}
