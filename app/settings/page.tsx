'use client';

import { useState, useEffect } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Tabs from '@/components/ui/Tabs';
import { NoPermissionCard } from '@/components/ui/StateCard';
import FormInput from '@/components/ui/FormInput';
import Toggle from '@/components/ui/Toggle';
import { useFormValidation } from '@/lib/useFormValidation';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { can } from '@/lib/permissions';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import { Gift, Plus, X, Loader2, Tag, Edit2, Check, Trash2, AlertTriangle, Clock, Building2 } from 'lucide-react';

export default function SettingsPage() {
  const { userProfile } = useAuth();
  const { currentCompany, companyRoles } = useCompany();
  const { confirmDialog, confirm } = useConfirmDialog();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // บริการการ์ดอวยพร — บันทึกทันทีที่เปลี่ยน ไม่มีปุ่มบันทึกรวมในการ์ดนี้
  const [giftCard, setGiftCard] = useState({ enabled: false, fee: 0 });
  useEffect(() => {
    apiFetch('/api/settings/gift-card')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setGiftCard({ enabled: !!d.enabled, fee: Number(d.fee) || 0 }); })
      .catch(() => { /* โหลดไม่ได้ก็ไม่ควรทำให้ทั้งหน้าพัง */ });
  }, []);

  const [savingGiftCard, setSavingGiftCard] = useState(false);
  const saveGiftCard = async () => {
    setSavingGiftCard(true);
    try {
      const res = await apiFetch('/api/settings/gift-card', { method: 'PUT', body: JSON.stringify(giftCard) });
      if (!res.ok) { setError('บันทึกการ์ดอวยพรไม่สำเร็จ'); return; }
      setSuccess('บันทึกการ์ดอวยพรแล้ว');
      setTimeout(() => setSuccess(''), 2500);
    } finally {
      setSavingGiftCard(false);
    }
  };

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

  // Fetch Variation Types + Bill Expiry (once)
  useFetchOnce(() => {
    fetchVariationTypes();
    fetchBillExpiry();
  }, can(userProfile?.roles, 'settings.access'));

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
  if (!can(userProfile?.roles, 'settings.access')) {
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
          <h1 className="heading-1">ตั้งค่า</h1>
          <p className="page-subtitle">ตั้งค่าประเภทตัวเลือกสินค้า และอายุของบิล</p>
        </div>
        <Tabs
          activeKey="general"
          tabs={[
            { key: 'company', label: 'ข้อมูลร้านค้า', href: '/settings/company' },
            { key: 'general', label: 'บิล และสินค้า', href: '/settings' },
          ]}
        />

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

        {/* Variation Types Settings */}
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-5 h-5 text-primary" />
            <h2 className="heading-3">ประเภทตัวเลือกสินค้า</h2>
            <span className="text-sm text-gray-500 dark:text-slate-400 ml-auto">สำหรับ Variation Products เช่น ความจุ, รูปทรง, สี</span>
          </div>

          {loadingVT ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {variationTypes.map((vt) => (
                editingVTId === vt.id ? (
                  <div key={vt.id} className="inline-flex items-center gap-2">
                    <FormInput
                      type="text"
                      value={editingVTName}
                      onChange={(e) => setEditingVTName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdateVariationType(vt.id);
                        if (e.key === 'Escape') { setEditingVTId(null); setEditingVTName(''); }
                      }}
                      containerClassName="w-44"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateVariationType(vt.id)}
                      aria-label="บันทึก"
                      className="text-green-600 hover:text-green-700 transition-colors"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingVTId(null); setEditingVTName(''); }}
                      aria-label="ยกเลิก"
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <span
                    key={vt.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-slate-700 text-sm text-gray-700 dark:text-slate-200"
                  >
                    <span>{vt.name}</span>
                    <button
                      type="button"
                      onClick={() => { setEditingVTId(vt.id); setEditingVTName(vt.name); }}
                      aria-label="แก้ไข"
                      className="text-gray-400 hover:text-primary transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteVariationType(vt.id, vt.name)}
                      aria-label="ลบ"
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )
              ))}

              {/* Add New — inline pill-style */}
              <div className="inline-flex items-center gap-2">
                <FormInput
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddVariationType(); }}
                  placeholder="เพิ่มประเภทใหม่"
                  containerClassName="w-44"
                />
                <Button
                  variant="primary"
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
        </Card>

        {/* Bill Expiry Settings */}
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="heading-3">บิลหมดอายุ</h2>
            <span className="text-sm text-gray-500 dark:text-slate-400 ml-auto">บิล manual order ที่ไม่ชำระจะถูกยกเลิกอัตโนมัติ</span>
          </div>

          {loadingBillExpiry ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <Toggle
                checked={billExpiryEnabled}
                onChange={setBillExpiryEnabled}
                aria-label="เปิดใช้งานบิลหมดอายุ"
              />

              {billExpiryEnabled ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">หมดอายุหลัง</span>
                  <FormInput
                    type="number"
                    min={1}
                    max={90}
                    value={billExpiryDays}
                    onChange={(e) => setBillExpiryDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                    postfix="วัน"
                    containerClassName="w-28"
                    className="text-center"
                  />
                </div>
              ) : (
                <span className="text-sm font-medium text-gray-500 dark:text-slate-400">ไม่มีวันหมดอายุ</span>
              )}

            </div>
          )}

          {!loadingBillExpiry && (
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="primary" loading={savingBillExpiry} onClick={handleSaveBillExpiry}>
                บันทึก
              </Button>
            </div>
          )}
        </Card>

        {/* บริการเสริมของร้าน — ใช้ได้ทุกช่องทางที่สร้างออเดอร์ (หน้าร้านออนไลน์
            และเปิดบิลเองจากแชท) จึงอยู่ตรงนี้ ไม่ใช่ในตั้งค่าหน้าร้านออนไลน์ */}
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="w-5 h-5 text-primary" />
            <h2 className="heading-3">การ์ดอวยพร</h2>
            <span className="text-sm text-gray-500 dark:text-slate-400 ml-auto">
              ลูกค้าขอแนบการ์ดพร้อมข้อความไปกับของได้
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="heading-4">เปิดบริการการ์ดอวยพร</p>
              <p className="section-desc">
                เปิดแล้วจะมีให้เลือกทั้งหน้าร้านออนไลน์และตอนเปิดบิลเอง —
                ไม่ใช่ทุกออเดอร์ที่ใช้ ลูกค้าหรือพนักงานต้องกดขอเป็นรายออเดอร์
              </p>
            </div>
            <Toggle
              checked={giftCard.enabled}
              onChange={(v) => setGiftCard(g => ({ ...g, enabled: v }))}
              aria-label="เปิดบริการการ์ดอวยพร"
            />
          </div>

          {giftCard.enabled && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 max-w-xs">
              <FormInput
                label="ค่าการ์ดต่อใบ"
                type="number"
                min={0}
                value={String(giftCard.fee)}
                onChange={(e) => setGiftCard(g => ({ ...g, fee: Math.max(0, Number(e.target.value) || 0) }))}
                postfix="บาท"
                hint="ใส่ 0 = แถมฟรี · ยอดนี้จะไปบวกในบิลเป็นรายการแยก"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="primary" loading={savingGiftCard} onClick={saveGiftCard}>
              บันทึก
            </Button>
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
              ลบข้อมูล <strong>คำสั่งซื้อ, ลูกค้า, สินค้า, สต็อก, แชท, รายการขายแคชเชียร์, Shopee links, หมวดหมู่, แบรนด์</strong> ทั้งหมดออก
            </p>
            <p className="text-sm text-gray-500 dark:text-slate-500 mb-4">
              สิ่งที่ยังคงอยู่: ตั้งค่าระบบ, ผู้ใช้, คลังสินค้า, ช่องทางชำระเงิน, การเชื่อมต่อ Shopee, แคชเชียร์
            </p>
            <Button
              variant="danger"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={() => setShowClearModal(true)}
            >
              ล้างข้อมูลทั้งหมด
            </Button>
          </div>
        </Card>

        {/* Danger Zone: Delete Company (owners only) */}
        {can(companyRoles, 'company.delete') && currentCompany && (
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
            <li>• คำสั่งซื้อทั้งหมด (Orders, แคชเชียร์, Shipments, Payments)</li>
            <li>• Session แคชเชียร์ทั้งหมด</li>
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
