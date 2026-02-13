'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Settings as SettingsIcon, Users, Plus, X, Save, Loader2, Tag, Edit2, Check } from 'lucide-react';

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

  // Fetch CRM settings + Variation Types
  useEffect(() => {
    if (userProfile?.role === 'admin') {
      fetchCRMSettings();
      fetchVariationTypes();
    }
  }, [userProfile]);

  const fetchCRMSettings = async () => {
    try {
      setLoadingCRM(true);
      const { data: sessionData } = await supabase.auth.getSession();

      const response = await fetch('/api/settings/crm', {
        headers: {
          'Authorization': `Bearer ${sessionData?.session?.access_token || ''}`
        }
      });

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
      const { data: sessionData } = await supabase.auth.getSession();

      const response = await fetch('/api/settings/crm', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData?.session?.access_token || ''}`
        },
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
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch('/api/variation-types', {
        headers: { 'Authorization': `Bearer ${sessionData?.session?.access_token || ''}` }
      });
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
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch('/api/variation-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData?.session?.access_token || ''}`
        },
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
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch('/api/variation-types', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData?.session?.access_token || ''}`
        },
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
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`/api/variation-types?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${sessionData?.session?.access_token || ''}` }
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

  // Only allow admin to access this page
  if (userProfile?.role !== 'admin') {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
            <p className="text-gray-600">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-[#E9B308]" />
          <h1 className="text-2xl font-bold text-[#00231F]">ตั้งค่าระบบ</h1>
        </div>

        {/* Success Message */}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* CRM Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#E9B308]" />
              <h2 className="text-lg font-semibold text-gray-900">ช่วงวันติดตามลูกค้า</h2>
            </div>
            <button
              onClick={handleSaveCRMSettings}
              disabled={savingCRM}
              className="flex items-center gap-2 px-4 py-2 bg-[#E9B308] text-[#00231F] rounded-lg hover:bg-[#d4a307] transition-colors font-medium disabled:opacity-50"
            >
              {savingCRM ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              บันทึก
            </button>
          </div>

          <div className="p-4">
            <p className="text-sm text-gray-600 mb-4">
              ระบุจำนวนวันสูงสุดของแต่ละช่วง ระบบจะคำนวณช่วงวันให้อัตโนมัติ (เว้นว่างสำหรับไม่จำกัด)
            </p>

            {loadingCRM ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-[#E9B308] animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Header Row */}
                <div className="grid grid-cols-12 gap-3 px-3 text-xs font-medium text-gray-500 uppercase">
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
                    <div key={index} className="grid grid-cols-12 gap-3 items-center p-3 bg-gray-50 rounded-lg">
                      {/* Color Picker */}
                      <div className="col-span-1">
                        <div className="relative group">
                          <button className={`w-8 h-8 rounded-full ${preset.bg} cursor-pointer ring-2 ring-offset-2 ring-gray-200 hover:ring-[#E9B308] transition-all`} />
                          <div className="absolute left-0 top-10 hidden group-hover:block p-2 bg-white shadow-xl rounded-lg z-20 border border-gray-200">
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
                        <span className="text-sm font-medium text-gray-700">
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E9B308] focus:border-transparent"
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
                  className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-[#E9B308] hover:text-[#E9B308] transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  เพิ่มช่วงวัน
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Variation Types Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-[#E9B308]" />
              <h2 className="text-lg font-semibold text-gray-900">ประเภทตัวเลือกสินค้า</h2>
            </div>
          </div>

          <div className="p-4">
            <p className="text-sm text-gray-600 mb-4">
              จัดการประเภทตัวเลือกสำหรับ Variation Products เช่น ความจุ, รูปทรง, สี
            </p>

            {loadingVT ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-[#E9B308] animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {/* Existing Types */}
                {variationTypes.map((vt) => (
                  <div key={vt.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
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
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E9B308] focus:border-transparent"
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
                          className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"
                          title="ยกเลิก"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium text-gray-700">{vt.name}</span>
                        <button
                          onClick={() => { setEditingVTId(vt.id); setEditingVTName(vt.name); }}
                          className="p-2 text-gray-400 hover:text-[#E9B308] hover:bg-yellow-50 rounded-lg transition-colors"
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
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E9B308] focus:border-transparent"
                  />
                  <button
                    onClick={handleAddVariationType}
                    disabled={addingVT || !newTypeName.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-[#E9B308] text-[#00231F] rounded-lg hover:bg-[#d4a307] transition-colors font-medium disabled:opacity-50 text-sm"
                  >
                    {addingVT ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    เพิ่ม
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
