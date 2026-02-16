'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Plus, Check, X, Edit2, Trash2, Warehouse, Star, StarOff, AlertTriangle
} from 'lucide-react';

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

interface StockConfig {
  stockEnabled: boolean;
  maxWarehouses: number | null;
  allowOversell: boolean;
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

export default function WarehouseSettingsPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [stockConfig, setStockConfig] = useState<StockConfig>({ stockEnabled: false, maxWarehouses: 0, allowOversell: true });

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile?.role === 'admin' || userProfile?.role === 'owner') {
      fetchWarehouses();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);

  const fetchWarehouses = async () => {
    try {
      const response = await apiFetch('/api/warehouses?active=false');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setWarehouses(data.warehouses || []);
      setStockConfig(data.stockConfig || { stockEnabled: false, maxWarehouses: 0, allowOversell: true });
    } catch (error) {
      console.error('Error fetching warehouses:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormCode('');
    setFormAddress('');
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (wh: WarehouseItem) => {
    setEditingId(wh.id);
    setFormName(wh.name);
    setFormCode(wh.code || '');
    setFormAddress(wh.address || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      showToast('กรุณากรอกชื่อคลัง', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = editingId
        ? { id: editingId, name: formName, code: formCode, address: formAddress }
        : { name: formName, code: formCode, address: formAddress };

      const response = await apiFetch('/api/warehouses', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      showToast(editingId ? 'อัปเดตคลังสำเร็จ' : 'สร้างคลังสำเร็จ');
      resetForm();
      await fetchWarehouses();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (wh: WarehouseItem) => {
    try {
      const response = await apiFetch('/api/warehouses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wh.id, is_active: !wh.is_active }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle');
      }
      setWarehouses(prev => prev.map(w =>
        w.id === wh.id ? { ...w, is_active: !w.is_active } : w
      ));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'เปลี่ยนสถานะไม่สำเร็จ';
      showToast(msg, 'error');
    }
  };

  const handleSetDefault = async (wh: WarehouseItem) => {
    try {
      const response = await apiFetch('/api/warehouses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wh.id, is_default: true }),
      });
      if (!response.ok) throw new Error('Failed to set default');
      await fetchWarehouses();
      showToast(`ตั้ง "${wh.name}" เป็นคลังหลัก`);
    } catch {
      showToast('เปลี่ยนคลังหลักไม่สำเร็จ', 'error');
    }
  };

  const [savingOversell, setSavingOversell] = useState(false);

  const handleToggleOversell = async (value: boolean) => {
    setSavingOversell(true);
    try {
      const response = await apiFetch('/api/warehouses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow_oversell: value }),
      });
      if (!response.ok) throw new Error('Failed to save');
      setStockConfig(prev => ({ ...prev, allowOversell: value }));
      showToast(value ? 'เปิดอนุญาตขายเมื่อ stock หมด' : 'ปิดอนุญาตขายเมื่อ stock หมด');
    } catch {
      showToast('บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSavingOversell(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await apiFetch(`/api/warehouses?id=${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete');
      }
      showToast('ลบคลังสำเร็จ');
      await fetchWarehouses();
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
      <Layout title="คลังสินค้า">
        <div className="text-center py-16 text-gray-500 dark:text-slate-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Layout>
    );
  }

  const activeWarehouses = warehouses.filter(w => w.is_active);
  const limitText = stockConfig.maxWarehouses === null
    ? 'ไม่จำกัด'
    : `${activeWarehouses.length}/${stockConfig.maxWarehouses}`;

  return (
    <Layout
      title="คลังสินค้า"
      breadcrumbs={[
        { label: 'ตั้งค่าระบบ', href: '/settings' },
        { label: 'คลังสินค้า' },
      ]}
    >
      <div className="max-w-3xl">
        {/* Stock not enabled */}
        {!stockConfig.stockEnabled && !loading && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3 mb-6">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-medium text-amber-800 dark:text-amber-200">ระบบคลังสินค้ายังไม่เปิดใช้งาน</p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">แพ็กเกจปัจจุบันไม่รองรับระบบคลังสินค้า กรุณาอัปเกรดแพ็กเกจเพื่อใช้งาน</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
          </div>
        ) : stockConfig.stockEnabled ? (
          <div className="space-y-4">
            {/* Stock Settings */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">อนุญาตขายเมื่อ stock หมด</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    {stockConfig.allowOversell
                      ? 'เปิด — ขายได้แม้ stock เป็น 0 (stock ติดลบได้)'
                      : 'ปิด — ต้องมี stock จึงจะเพิ่มสินค้าในบิลได้'}
                  </p>
                </div>
                <Toggle
                  checked={stockConfig.allowOversell}
                  onChange={handleToggleOversell}
                  disabled={savingOversell}
                />
              </div>
            </div>

            {/* Header with count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                ใช้งาน {limitText} คลัง
              </p>
            </div>

            {/* Warehouse Cards */}
            {warehouses.map(wh => (
              <div key={wh.id} className="space-y-4">
                <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden ${!wh.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-10 h-10 rounded-lg bg-[#F4511E]/10 flex items-center justify-center flex-shrink-0">
                      <Warehouse className="w-5 h-5 text-[#F4511E]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{wh.name}</p>
                        {wh.code && <span className="text-xs text-gray-400 dark:text-slate-500">({wh.code})</span>}
                        {wh.is_default && (
                          <span className="px-1.5 py-0.5 text-xs bg-[#F4511E]/10 text-[#F4511E] rounded font-medium">หลัก</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                        {wh.is_active ? (
                          <span className="text-green-600 dark:text-green-400">เปิดใช้งาน</span>
                        ) : (
                          <span className="text-gray-400">ปิดใช้งาน</span>
                        )}
                        {wh.address && <span className="ml-1 truncate max-w-[200px]">• {wh.address}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!wh.is_default && wh.is_active && (
                        <button
                          onClick={() => handleSetDefault(wh)}
                          title="ตั้งเป็นคลังหลัก"
                          className="p-1.5 text-gray-400 hover:text-[#F4511E] transition-colors"
                        >
                          <StarOff className="w-4 h-4" />
                        </button>
                      )}
                      {wh.is_default && (
                        <Star className="w-4 h-4 text-[#F4511E] fill-current" />
                      )}
                      <Toggle checked={wh.is_active} onChange={() => handleToggleActive(wh)} />
                      <button
                        onClick={() => startEdit(wh)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('ลบคลังนี้?')) handleDelete(wh.id);
                        }}
                        disabled={deletingId === wh.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      >
                        {deletingId === wh.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline edit form */}
                {editingId === wh.id && showForm && renderForm()}
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
                เพิ่มคลังสินค้า
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
          <Warehouse className="w-4 h-4 text-[#F4511E]" />
          {editingId ? 'แก้ไขคลังสินค้า' : 'เพิ่มคลังสินค้า'}
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">ชื่อคลัง *</label>
          <input
            type="text"
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="เช่น คลังหลัก, คลังสาขา 2"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">รหัสคลัง</label>
          <input
            type="text"
            value={formCode}
            onChange={e => setFormCode(e.target.value)}
            placeholder="เช่น WH01"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">ที่อยู่</label>
          <input
            type="text"
            value={formAddress}
            onChange={e => setFormAddress(e.target.value)}
            placeholder="ที่อยู่คลังสินค้า"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
          />
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
