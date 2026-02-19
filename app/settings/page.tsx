'use client';

import { useState, useEffect } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { Users, Plus, X, Save, Loader2, Tag, Edit2, Check, Trash2, AlertTriangle } from 'lucide-react';

interface DayRange {
  minDays: number;
  maxDays: number | null; // null = unlimited (e.g., 30+)
  label: string;
  color: string;
}

// 8 preset colors
const colorPresets = [
  { value: 'green', bg: 'bg-green-500', bgLight: 'bg-green-100', textLight: 'text-green-800', label: 'เขียว' },
  { value: 'emerald', bg: 'bg-emerald-500', bgLight: 'bg-emerald-100', textLight: 'text-emerald-800', label: 'เขียวเข้ม' },
  { value: 'yellow', bg: 'bg-yellow-500', bgLight: 'bg-yellow-100', textLight: 'text-yellow-800', label: 'เหลือง' },
  { value: 'orange', bg: 'bg-orange-500', bgLight: 'bg-orange-100', textLight: 'text-orange-800', label: 'ส้ม' },
  { value: 'red', bg: 'bg-red-500', bgLight: 'bg-red-100', textLight: 'text-red-800', label: 'แดง' },
  { value: 'pink', bg: 'bg-pink-500', bgLight: 'bg-pink-100', textLight: 'text-pink-800', label: 'ชมพู' },
  { value: 'purple', bg: 'bg-purple-500', bgLight: 'bg-purple-100', textLight: 'text-purple-800', label: 'ม่วง' },
  { value: 'blue', bg: 'bg-blue-500', bgLight: 'bg-blue-100', textLight: 'text-blue-800', label: 'น้ำเงิน' },
];

export default function SettingsPage() {
  const { userProfile } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // CRM Settings
  const [dayRanges, setDayRanges] = useState<DayRange[]>([]);
  const [loadingCRM, setLoadingCRM] = useState(true);
  const [savingCRM, setSavingCRM] = useState(false);

  // Variation Types Settings
  const [variationTypes, setVariationTypes] = useState<{ id: string; name: string; sort_order: number; is_active: boolean }[]>([]);
  const [loadingVT, setLoadingVT] = useState(true);
  const [newTypeName, setNewTypeName] = useState('');
  const [addingVT, setAddingVT] = useState(false);
  const [editingVTId, setEditingVTId] = useState<string | null>(null);
  const [editingVTName, setEditingVTName] = useState('');

  // Clear All Data
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  // Fetch CRM settings + Variation Types (once)
  useFetchOnce(() => {
    fetchCRMSettings();
    fetchVariationTypes();
  }, !!(userProfile?.roles?.includes('admin') || userProfile?.roles?.includes('owner')));

  const fetchCRMSettings = async () => {
    try {
      setLoadingCRM(true);

      const response = await apiFetch('/api/settings/crm');

      const result = await response.json();
      if (result.dayRanges) {
        setDayRanges(result.dayRanges);
      }
    } catch (err) {
      console.error('Error fetching CRM settings:', err);
    } finally {
      setLoadingCRM(false);
    }
  };

  const handleSaveCRMSettings = async () => {
    if (dayRanges.length === 0) {
      setError('กรุณาเพิ่มอย่างน้อย 1 ช่วงวัน');
      return;
    }

    setSavingCRM(true);
    setError('');
    setSuccess('');

    try {
      const response = await apiFetch('/api/settings/crm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayRanges })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }

      setSuccess('บันทึกการตั้งค่าสำเร็จ');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error saving CRM settings:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } finally {
      setSavingCRM(false);
    }
  };

  // Recalculate minDays to ensure no overlap
  const recalculateRanges = (ranges: DayRange[]): DayRange[] => {
    // Sort by maxDays (null = infinity at the end)
    const sorted = [...ranges].sort((a, b) => {
      if (a.maxDays === null) return 1;
      if (b.maxDays === null) return -1;
      return a.maxDays - b.maxDays;
    });

    // Recalculate minDays
    let nextMin = 0;
    return sorted.map((range, index) => {
      const newMinDays = nextMin;
      nextMin = range.maxDays !== null ? range.maxDays + 1 : newMinDays + 100;

      // Auto-generate label
      const label = range.maxDays !== null
        ? `${newMinDays}-${range.maxDays} วัน`
        : `${newMinDays}+ วัน`;

      return {
        ...range,
        minDays: newMinDays,
        label
      };
    });
  };

  const handleAddRange = () => {
    const lastRange = dayRanges[dayRanges.length - 1];
    const newMaxDays = lastRange
      ? (lastRange.maxDays !== null ? lastRange.maxDays + 7 : null)
      : 3;

    const newRange: DayRange = {
      minDays: 0, // Will be recalculated
      maxDays: newMaxDays,
      label: '',
      color: colorPresets[dayRanges.length % colorPresets.length].value
    };

    const updated = recalculateRanges([...dayRanges, newRange]);
    setDayRanges(updated);
  };

  const handleRemoveRange = (index: number) => {
    const updated = dayRanges.filter((_, i) => i !== index);
    setDayRanges(recalculateRanges(updated));
  };

  const handleUpdateMaxDays = (index: number, value: string) => {
    const updated = [...dayRanges];
    updated[index].maxDays = value === '' ? null : Number(value);
    setDayRanges(recalculateRanges(updated));
  };

  const handleUpdateColor = (index: number, color: string) => {
    const updated = [...dayRanges];
    updated[index].color = color;
    setDayRanges(updated);
  };

  const getColorPreset = (color: string) => {
    return colorPresets.find(c => c.value === color) || colorPresets[0];
  };

  // --- Variation Types Functions ---
  const fetchVariationTypes = async () => {
    try {
      setLoadingVT(true);
      const response = await apiFetch('/api/variation-types');
      const result = await response.json();
      setVariationTypes(result.data || []);
    } catch (err) {
      console.error('Error fetching variation types:', err);
    } finally {
      setLoadingVT(false);
    }
  };

  const handleAddVariationType = async () => {
    if (!newTypeName.trim()) return;
    setAddingVT(true);
    setError('');
    try {
      const response = await apiFetch('/api/variation-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTypeName.trim() })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setNewTypeName('');
      setSuccess('เพิ่มประเภทตัวเลือกสำเร็จ');
      setTimeout(() => setSuccess(''), 3000);
      fetchVariationTypes();
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('ไม่สามารถเพิ่มได้');
    } finally {
      setAddingVT(false);
    }
  };

  const handleUpdateVariationType = async (id: string) => {
    if (!editingVTName.trim()) return;
    setError('');
    try {
      const response = await apiFetch('/api/variation-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editingVTName.trim() })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setEditingVTId(null);
      setEditingVTName('');
      setSuccess('แก้ไขประเภทตัวเลือกสำเร็จ');
      setTimeout(() => setSuccess(''), 3000);
      fetchVariationTypes();
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('ไม่สามารถแก้ไขได้');
    }
  };

  const handleDeleteVariationType = async (id: string, name: string) => {
    if (!confirm(`ลบ "${name}" หรือไม่?`)) return;
    setError('');
    try {
      const response = await apiFetch(`/api/variation-types?id=${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSuccess('ลบประเภทตัวเลือกสำเร็จ');
      setTimeout(() => setSuccess(''), 3000);
      fetchVariationTypes();
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('ไม่สามารถลบได้');
    }
  };

  // --- Clear All Data ---
  const handleClearAllData = async () => {
    if (clearConfirmText !== 'ลบทั้งหมด') return;
    setClearing(true);
    setError('');
    setSuccess('');
    try {
      const response = await apiFetch('/api/settings/delete-all-data', {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSuccess(result.message || 'ลบข้อมูลทั้งหมดสำเร็จ');
      setShowClearModal(false);
      setClearConfirmText('');
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('ไม่สามารถลบข้อมูลได้');
    } finally {
      setClearing(false);
    }
  };

  // Only allow admin to access this page
  if (!userProfile?.roles?.includes('admin') && !userProfile?.roles?.includes('owner')) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
            <p className="text-gray-600 dark:text-slate-400">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="ทั่วไป"
      breadcrumbs={[
        { label: 'ตั้งค่าระบบ', href: '/settings' },
        { label: 'ทั่วไป' },
      ]}
    >
      <div className="space-y-6">
        {/* Success Message */}
        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* CRM Settings */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#F4511E]" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ช่วงวันติดตามลูกค้า</h2>
            </div>
            <button
              onClick={handleSaveCRMSettings}
              disabled={savingCRM}
              className="flex items-center gap-2 px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors font-medium disabled:opacity-50"
            >
              {savingCRM ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              บันทึก
            </button>
          </div>

          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              ระบุจำนวนวันสูงสุดของแต่ละช่วง ระบบจะคำนวณช่วงวันให้อัตโนมัติ (เว้นว่างสำหรับไม่จำกัด)
            </p>

            {loadingCRM ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Header Row */}
                <div className="grid grid-cols-12 gap-3 px-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                  <div className="col-span-1">สี</div>
                  <div className="col-span-2">ช่วงวัน</div>
                  <div className="col-span-2">ถึงวันที่</div>
                  <div className="col-span-6">ตัวอย่าง</div>
                  <div className="col-span-1"></div>
                </div>

                {/* Day Ranges */}
                {dayRanges.map((range, index) => {
                  const preset = getColorPreset(range.color);
                  return (
                    <div key={index} className="grid grid-cols-12 gap-3 items-center p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                      {/* Color Picker */}
                      <div className="col-span-1">
                        <div className="relative group">
                          <button className={`w-8 h-8 rounded-full ${preset.bg} cursor-pointer ring-2 ring-offset-2 ring-gray-200 dark:ring-slate-600 dark:ring-offset-slate-800 hover:ring-[#F4511E] transition-all`} />
                          <div className="absolute left-0 top-10 hidden group-hover:block p-2 bg-white dark:bg-slate-700 shadow-xl rounded-lg z-20">
                            <div className="grid grid-cols-4 gap-1.5 w-[130px]">
                              {colorPresets.map((c) => (
                                <button
                                  key={c.value}
                                  onClick={() => handleUpdateColor(index, c.value)}
                                  className={`w-7 h-7 rounded-full ${c.bg} hover:scale-110 transition-transform ${range.color === c.value ? 'ring-2 ring-offset-1 ring-gray-500' : ''}`}
                                  title={c.label}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Calculated Range Display */}
                      <div className="col-span-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                          {range.minDays} - {range.maxDays ?? '∞'}
                        </span>
                      </div>

                      {/* Max Days Input */}
                      <div className="col-span-2">
                        <input
                          type="number"
                          min={range.minDays}
                          value={range.maxDays ?? ''}
                          placeholder="∞"
                          onChange={(e) => handleUpdateMaxDays(index, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                        />
                      </div>

                      {/* Preview Badge */}
                      <div className="col-span-6">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${preset.bgLight} ${preset.textLight}`}>
                          {range.label}
                        </span>
                      </div>

                      {/* Remove Button */}
                      <div className="col-span-1 text-right">
                        <button
                          onClick={() => handleRemoveRange(index)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="ลบ"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Add Button */}
                <button
                  onClick={handleAddRange}
                  className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-gray-500 dark:text-slate-400 hover:border-[#F4511E] hover:text-[#F4511E] transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  เพิ่มช่วงวัน
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Variation Types Settings */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-[#F4511E]" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ประเภทตัวเลือกสินค้า</h2>
            </div>
          </div>

          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              จัดการประเภทตัวเลือกสำหรับ Variation Products เช่น ความจุ, รูปทรง, สี
            </p>

            {loadingVT ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {/* Existing Types */}
                {variationTypes.map((vt) => (
                  <div key={vt.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                    {editingVTId === vt.id ? (
                      <>
                        <input
                          type="text"
                          value={editingVTName}
                          onChange={(e) => setEditingVTName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateVariationType(vt.id);
                            if (e.key === 'Escape') { setEditingVTId(null); setEditingVTName(''); }
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                          autoFocus
                        />
                        <button
                          onClick={() => handleUpdateVariationType(vt.id)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                          title="บันทึก"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setEditingVTId(null); setEditingVTName(''); }}
                          className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                          title="ยกเลิก"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium text-gray-700 dark:text-slate-300">{vt.name}</span>
                        <button
                          onClick={() => { setEditingVTId(vt.id); setEditingVTName(vt.name); }}
                          className="p-2 text-gray-400 hover:text-[#F4511E] hover:bg-yellow-50 rounded-lg transition-colors"
                          title="แก้ไข"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteVariationType(vt.id, vt.name)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="ลบ"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}

                {/* Add New */}
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="text"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddVariationType(); }}
                    placeholder="ชื่อประเภทตัวเลือกใหม่"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                  />
                  <button
                    onClick={handleAddVariationType}
                    disabled={addingVT || !newTypeName.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors font-medium disabled:opacity-50 text-sm"
                  >
                    {addingVT ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    เพิ่ม
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Danger Zone: Clear All Data */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border-2 border-red-200 dark:border-red-900/50">
          <div className="flex items-center justify-between p-4 border-b border-red-100 dark:border-red-900/30">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">ล้างข้อมูลทั้งหมด</h2>
            </div>
          </div>

          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">
              ลบข้อมูล <strong>คำสั่งซื้อ, ลูกค้า, สินค้า, สต็อก, แชท, การชำระเงิน</strong> ทั้งหมดออก
            </p>
            <p className="text-sm text-gray-500 dark:text-slate-500 mb-4">
              การตั้งค่าระบบ, Shopee integration, คลังสินค้า และข้อมูลผู้ใช้จะยังคงอยู่
            </p>
            <button
              onClick={() => setShowClearModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
            >
              <Trash2 className="w-4 h-4" />
              ล้างข้อมูลทั้งหมด
            </button>
          </div>
        </div>

        {/* Clear All Data Confirmation Modal */}
        {showClearModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">ยืนยันการล้างข้อมูล</h3>
              </div>

              <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                การดำเนินการนี้จะลบข้อมูลต่อไปนี้ <strong className="text-red-600">อย่างถาวร</strong>:
              </p>
              <ul className="text-sm text-gray-600 dark:text-slate-400 mb-4 space-y-1 ml-4">
                <li>• คำสั่งซื้อทั้งหมด (Orders, Shipments, Payments)</li>
                <li>• ลูกค้าทั้งหมด (Customers, Addresses)</li>
                <li>• สินค้าทั้งหมด (Products, Variations, Images)</li>
                <li>• สต็อกทั้งหมด (Inventory, Transfers, Receives)</li>
                <li>• แชททั้งหมด (LINE, Facebook messages)</li>
                <li>• Shopee sync logs</li>
              </ul>

              <p className="text-sm text-gray-700 dark:text-slate-300 mb-2 font-medium">
                พิมพ์ &quot;ลบทั้งหมด&quot; เพื่อยืนยัน:
              </p>
              <input
                type="text"
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                placeholder="ลบทั้งหมด"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                autoFocus
              />

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowClearModal(false); setClearConfirmText(''); }}
                  disabled={clearing}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors font-medium text-sm disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleClearAllData}
                  disabled={clearing || clearConfirmText !== 'ลบทั้งหมด'}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {clearing ? 'กำลังลบ...' : 'ลบทั้งหมด'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
