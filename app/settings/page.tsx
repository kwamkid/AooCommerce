'use client';

import { useState, useEffect } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { NoPermissionCard } from '@/components/ui/StateCard';
import FormInput from '@/components/ui/FormInput';
import { useFormValidation } from '@/lib/useFormValidation';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import { Users, Plus, X, Save, Loader2, Tag, Edit2, Check, Trash2, AlertTriangle, Clock, Building2 } from 'lucide-react';

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
  const { currentCompany, companyRoles } = useCompany();
  const { confirmDialog, confirm } = useConfirmDialog();
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

  // Delete Company
  const [showDeleteCompanyModal, setShowDeleteCompanyModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingCompany, setDeletingCompany] = useState(false);

  // Bill Expiry Settings
  const [billExpiryEnabled, setBillExpiryEnabled] = useState(false);
  const [billExpiryDays, setBillExpiryDays] = useState(7);
  const [loadingBillExpiry, setLoadingBillExpiry] = useState(true);
  const [savingBillExpiry, setSavingBillExpiry] = useState(false);

  // Fetch CRM settings + Variation Types + Bill Expiry (once)
  useFetchOnce(() => {
    fetchCRMSettings();
    fetchVariationTypes();
    fetchBillExpiry();
  }, !!(userProfile?.roles?.includes('admin') || userProfile?.roles?.includes('owner') || userProfile?.roles?.includes('manager')));

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
    const ok = await confirm({ title: `ลบ "${name}" หรือไม่?`, variant: 'danger' }); if (!ok) return;
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

  // Form refs for confirm-text modals (Clear All, Delete Company)
  const clearForm = useFormValidation();
  const deleteCompanyForm = useFormValidation();

  // --- Clear All Data ---
  const handleClearAllData = async () => {
    if (!clearForm.validateAll()) return;
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

  // --- Delete Company ---
  // Hard-deletes the entire company. After success we wipe the locally-cached
  // current-company pointer + auth cache and bounce to /onboarding so the user
  // can pick a remaining company or create a new one.
  const handleDeleteCompany = async () => {
    if (!currentCompany) return;
    if (!deleteCompanyForm.validateAll()) return;
    setDeletingCompany(true);
    setError('');
    setSuccess('');
    try {
      const response = await apiFetch(`/api/companies/${currentCompany.id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ลบบริษัทไม่สำเร็จ');

      try {
        localStorage.removeItem('aoo-current-company-id');
        sessionStorage.removeItem('aoo-auth-cache');
      } catch { /* ignore */ }
      // Full reload so every context (auth/company/features) re-initializes.
      window.location.href = '/onboarding';
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('ลบบริษัทไม่สำเร็จ');
      setDeletingCompany(false);
    }
  };

  // --- Bill Expiry Functions ---
  const fetchBillExpiry = async () => {
    try {
      setLoadingBillExpiry(true);
      const res = await apiFetch('/api/settings/features');
      const data = await res.json();
      const days = data.bill_expiry_days;
      if (days === 0) {
        // Explicitly disabled
        setBillExpiryEnabled(false);
      } else {
        // null (not configured) = default 7 days, or user-set value
        setBillExpiryEnabled(true);
        setBillExpiryDays(days && days > 0 ? days : 7);
      }
    } catch {
      // default to enabled 7 days
      setBillExpiryEnabled(true);
      setBillExpiryDays(7);
    } finally {
      setLoadingBillExpiry(false);
    }
  };

  const handleSaveBillExpiry = async () => {
    setSavingBillExpiry(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch('/api/settings/bill-expiry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill_expiry_days: billExpiryEnabled ? billExpiryDays : 0 }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'ไม่สามารถบันทึกได้');
      }
      setSuccess('บันทึกการตั้งค่าบิลหมดอายุสำเร็จ');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('ไม่สามารถบันทึกได้');
    } finally {
      setSavingBillExpiry(false);
    }
  };

  // Only allow admin to access this page
  if (!userProfile?.roles?.includes('admin') && !userProfile?.roles?.includes('owner') && !userProfile?.roles?.includes('manager')) {
    return (
      <Layout>
        <NoPermissionCard />
      </Layout>
    );
  }

  return (
    <Layout>
      <Container size="full">
        <div>
          <h1 className="heading-1">ตั้งค่าทั่วไป</h1>
          <p className="page-subtitle">จัดการช่วงวันติดตามลูกค้า ประเภทตัวเลือกสินค้า และการตั้งค่าระบบอื่นๆ</p>
        </div>

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
        <Card padding="none">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="heading-3">ช่วงวันติดตามลูกค้า</h2>
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={savingCRM}
              icon={!savingCRM ? <Save className="w-4 h-4" /> : undefined}
              onClick={handleSaveCRMSettings}
            >
              บันทึก
            </Button>
          </div>

          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              ระบุจำนวนวันสูงสุดของแต่ละช่วง ระบบจะคำนวณช่วงวันให้อัตโนมัติ (เว้นว่างสำหรับไม่จำกัด)
            </p>

            {loadingCRM ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
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
                          <button className={`w-8 h-8 rounded-full ${preset.bg} cursor-pointer ring-2 ring-offset-2 ring-gray-200 dark:ring-slate-600 dark:ring-offset-slate-800 hover:ring-primary transition-all`} />
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
                        <FormInput
                          type="number"
                          min={range.minDays}
                          value={range.maxDays ?? ''}
                          placeholder="∞"
                          onChange={(e) => handleUpdateMaxDays(index, e.target.value)}
                          size="sm"
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

                {/* Add Button — dashed border (intentional custom) */}
                <button
                  onClick={handleAddRange}
                  className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-gray-500 dark:text-slate-400 hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  เพิ่มช่วงวัน
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* Variation Types Settings */}
        <Card padding="none">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              <h2 className="heading-3">ประเภทตัวเลือกสินค้า</h2>
            </div>
          </div>

          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              จัดการประเภทตัวเลือกสำหรับ Variation Products เช่น ความจุ, รูปทรง, สี
            </p>

            {loadingVT ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {/* Existing Types */}
                {variationTypes.map((vt) => (
                  <div key={vt.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                    {editingVTId === vt.id ? (
                      <>
                        <FormInput
                          type="text"
                          value={editingVTName}
                          onChange={(e) => setEditingVTName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateVariationType(vt.id);
                            if (e.key === 'Escape') { setEditingVTId(null); setEditingVTName(''); }
                          }}
                          containerClassName="flex-1"
                          size="sm"
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
                          className="p-2 text-gray-400 hover:text-primary hover:bg-yellow-50 rounded-lg transition-colors"
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
                  <FormInput
                    type="text"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddVariationType(); }}
                    placeholder="ชื่อประเภทตัวเลือกใหม่"
                    containerClassName="flex-1"
                    size="sm"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    loading={addingVT}
                    icon={!addingVT ? <Plus className="w-4 h-4" /> : undefined}
                    disabled={!newTypeName.trim()}
                    onClick={handleAddVariationType}
                  >
                    เพิ่ม
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Bill Expiry Settings */}
        <Card padding="none">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <h2 className="heading-3">บิลหมดอายุ</h2>
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={savingBillExpiry}
              icon={!savingBillExpiry ? <Save className="w-4 h-4" /> : undefined}
              onClick={handleSaveBillExpiry}
            >
              บันทึก
            </Button>
          </div>

          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              กำหนดวันหมดอายุบิลสำหรับ manual order ที่ยังไม่ชำระ เมื่อหมดอายุบิลจะถูกยกเลิกอัตโนมัติ
            </p>

            {loadingBillExpiry ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={billExpiryEnabled}
                    onChange={(e) => setBillExpiryEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">เปิดใช้งานบิลหมดอายุ</span>
                </label>

                {billExpiryEnabled && (
                  <div className="flex items-center gap-2 ml-7">
                    <span className="text-sm text-gray-600 dark:text-slate-400">หมดอายุหลัง</span>
                    <FormInput
                      type="number"
                      min={1}
                      max={90}
                      value={billExpiryDays}
                      onChange={(e) => setBillExpiryDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                      postfix="วัน"
                      size="sm"
                      containerClassName="w-28"
                      className="text-center"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Danger Zone: Clear All Data */}
        <Card padding="none" className="border-2 border-red-200 dark:border-red-900/50">
          <div className="flex items-center justify-between p-4 border-b border-red-100 dark:border-red-900/30">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h2 className="heading-3 !text-red-600 dark:!text-red-400">ล้างข้อมูลทั้งหมด</h2>
            </div>
          </div>

          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">
              ลบข้อมูล <strong>คำสั่งซื้อ, ลูกค้า, สินค้า, สต็อก, แชท, POS, Shopee links, หมวดหมู่, แบรนด์</strong> ทั้งหมดออก
            </p>
            <p className="text-sm text-gray-500 dark:text-slate-500 mb-4">
              สิ่งที่ยังคงอยู่: ตั้งค่าระบบ, ผู้ใช้, คลังสินค้า, ช่องทางชำระเงิน, การเชื่อมต่อ Shopee, POS terminals
            </p>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={() => setShowClearModal(true)}
            >
              ล้างข้อมูลทั้งหมด
            </Button>
          </div>
        </Card>

        {/* Danger Zone: Delete Company (owners only) */}
        {companyRoles.includes('owner') && currentCompany && (
          <Card padding="none" className="border-2 border-red-300 dark:border-red-900/60">
            <div className="flex items-center justify-between p-4 border-b border-red-100 dark:border-red-900/30">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-red-600" />
                <h2 className="heading-3 !text-red-700 dark:!text-red-400">ลบบริษัทนี้</h2>
              </div>
            </div>

            <div className="p-4">
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">
                ลบบริษัท <strong className="text-gray-900 dark:text-white">{currentCompany.name}</strong> ออกจากระบบ <strong className="text-red-600">อย่างถาวร</strong> พร้อมข้อมูลทั้งหมด (รวมคลังสินค้า, ช่องทางชำระเงิน, การเชื่อมต่อ Shopee, สมาชิก ฯลฯ)
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-500 mb-4">
                เฉพาะเจ้าของบริษัทเท่านั้นที่ลบได้ — ไม่สามารถกู้คืนได้
              </p>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => setShowDeleteCompanyModal(true)}
                className="!bg-red-700 hover:!bg-red-800"
              >
                ลบบริษัทนี้
              </Button>
            </div>
          </Card>
        )}

      </Container>

      {/* Clear All Data Confirmation Modal */}
      <Modal
        open={showClearModal}
        onClose={() => { setShowClearModal(false); setClearConfirmText(''); }}
        title={
          <span className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </span>
            ยืนยันการล้างข้อมูล
          </span>
        }
        size="md"
        footer={
          <div className="flex gap-3 p-4">
            <Button
              variant="secondary"
              fullWidth
              disabled={clearing}
              onClick={() => { setShowClearModal(false); setClearConfirmText(''); }}
            >
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={clearing}
              icon={!clearing ? <Trash2 className="w-4 h-4" /> : undefined}
              disabled={clearConfirmText !== 'ลบทั้งหมด'}
              onClick={handleClearAllData}
            >
              {clearing ? 'กำลังลบ...' : 'ลบทั้งหมด'}
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
            การดำเนินการนี้จะลบข้อมูลต่อไปนี้ <strong className="text-red-600">อย่างถาวร</strong>:
          </p>
          <ul className="text-sm text-gray-600 dark:text-slate-400 mb-4 space-y-1 ml-4">
            <li>• คำสั่งซื้อทั้งหมด (Orders, POS, Shipments, Payments)</li>
            <li>• POS Sessions ทั้งหมด</li>
            <li>• ลูกค้าทั้งหมด (Customers, Addresses)</li>
            <li>• สินค้าทั้งหมด (Products, Variations, Images)</li>
            <li>• หมวดหมู่, แบรนด์, ตัวเลือกสินค้า</li>
            <li>• สต็อกทั้งหมด (Inventory, Transfers, Receives, Issues)</li>
            <li>• แชททั้งหมด (LINE, Facebook messages)</li>
            <li>• Shopee product links, category cache, logs</li>
          </ul>

          <FormInput
            ref={clearForm.register('confirm')}
            label='พิมพ์ "ลบทั้งหมด" เพื่อยืนยัน:'
            type="text"
            value={clearConfirmText}
            onChange={(e) => setClearConfirmText(e.target.value)}
            placeholder="ลบทั้งหมด"
            size="sm"
            required
            validate={(v) => v === 'ลบทั้งหมด' ? null : 'ต้องพิมพ์ตรงกัน'}
            autoFocus
          />
        </div>
      </Modal>

      {/* Delete Company Confirmation Modal */}
      <Modal
        open={showDeleteCompanyModal && !!currentCompany}
        onClose={() => { setShowDeleteCompanyModal(false); setDeleteConfirmText(''); }}
        title={
          <span className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-red-600 dark:text-red-400" />
            </span>
            ยืนยันการลบบริษัท
          </span>
        }
        size="md"
        footer={
          currentCompany && (
            <div className="flex gap-3 p-4">
              <Button
                variant="secondary"
                fullWidth
                disabled={deletingCompany}
                onClick={() => { setShowDeleteCompanyModal(false); setDeleteConfirmText(''); }}
              >
                ยกเลิก
              </Button>
              <Button
                variant="danger"
                fullWidth
                loading={deletingCompany}
                icon={!deletingCompany ? <Trash2 className="w-4 h-4" /> : undefined}
                disabled={deleteConfirmText !== currentCompany.name}
                onClick={handleDeleteCompany}
                className="!bg-red-700 hover:!bg-red-800"
              >
                {deletingCompany ? 'กำลังลบ...' : 'ลบบริษัทถาวร'}
              </Button>
            </div>
          )
        }
      >
        {currentCompany && (
          <div className="p-6">
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
              คุณกำลังจะลบบริษัท <strong className="text-gray-900 dark:text-white">{currentCompany.name}</strong> <strong className="text-red-600">อย่างถาวร</strong> รวมถึง:
            </p>
            <ul className="text-sm text-gray-600 dark:text-slate-400 mb-4 space-y-1 ml-4">
              <li>• คำสั่งซื้อ, ลูกค้า, สินค้า, สต็อก, เอกสารทั้งหมด</li>
              <li>• คลังสินค้า, ขนส่ง, ช่องทางชำระเงิน</li>
              <li>• การเชื่อมต่อ Shopee/TikTok/LINE/Facebook</li>
              <li>• สมาชิกทีม + คำเชิญที่ยังไม่ตอบรับ</li>
              <li>• ทั้งบริษัทจะหายไปจากรายการของทุกคน</li>
            </ul>

            <FormInput
              ref={deleteCompanyForm.register('confirm')}
              label={<>พิมพ์ชื่อบริษัท <span className="font-bold">&quot;{currentCompany.name}&quot;</span> เพื่อยืนยัน:</>}
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={currentCompany.name}
              autoComplete="off"
              size="sm"
              required
              validate={(v) => v === currentCompany.name ? null : 'ชื่อบริษัทไม่ตรง'}
              autoFocus
            />
          </div>
        )}
      </Modal>

      {confirmDialog}
    </Layout>
  );
}
