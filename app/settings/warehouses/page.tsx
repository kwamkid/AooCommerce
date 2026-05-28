'use client';

import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Plus, Check, X, Edit2, Trash2, Warehouse, Star, StarOff, AlertTriangle, Info, Users
} from 'lucide-react';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import Toggle from '@/components/ui/Toggle';

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  warehouse_type?: 'internal' | 'consignment';
  customer_id?: string | null;
  customer?: { id: string; name: string; customer_type: string } | null;
}

interface StockConfig {
  stockEnabled: boolean;
  maxWarehouses: number | null;
  allowOversell: boolean;
}


export default function WarehouseSettingsPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

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

  useFetchOnce(() => {
    fetchWarehouses();
  }, can(userProfile?.roles, 'masterdata.warehouses'));

  const fetchWarehouses = async () => {
    try {
      const response = await apiFetch('/api/warehouses?active=false&include_consignment=true');
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
  if (userProfile && !can(userProfile.roles, 'masterdata.warehouses')) {
    return (
      <Layout>
        <NoPermissionCard />
      </Layout>
    );
  }

  const internalWarehouses = warehouses.filter(w => (w.warehouse_type || 'internal') === 'internal');
  const consignmentWarehouses = warehouses.filter(w => w.warehouse_type === 'consignment');
  const activeInternal = internalWarehouses.filter(w => w.is_active);
  const limitText = stockConfig.maxWarehouses === null
    ? 'ไม่จำกัด'
    : `${activeInternal.length}/${stockConfig.maxWarehouses}`;

  return (
    <Layout>
      <Container size="full">
        <div>
          <h1 className="heading-1">คลังสินค้า</h1>
          <p className="page-subtitle">จัดการคลังสินค้าและคลังฝากขาย ({limitText})</p>
        </div>
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
          <LoadingCard />
        ) : stockConfig.stockEnabled ? (
          <div className="space-y-4">
            {/* Stock Settings */}
            <Card padding="md">
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
            </Card>

            {/* Info banner — explain auto-create consignment warehouses */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <p className="font-medium">สร้างเฉพาะคลังภายในของร้านเท่านั้น</p>
                <p className="text-blue-700 dark:text-blue-300">
                  เช่น คลังหลัก, คลังสาขา, หน้าร้าน ไม่ต้องสร้างคลังสำหรับตัวแทน/ห้างฝากขาย
                  — ระบบจะสร้างคลังให้อัตโนมัติเมื่อคุณเพิ่มลูกค้าแบบ <strong>ตัวแทนฝากขาย</strong> หรือ <strong>ห้างฝากขาย</strong>
                </p>
              </div>
            </div>

            {/* Internal Warehouses Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="heading-4 flex items-center gap-2">
                  <Warehouse className="w-4 h-4 text-primary" />
                  คลังภายใน
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  ใช้งาน {limitText} คลัง
                </p>
              </div>

              {internalWarehouses.length === 0 && !showForm && (
                <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-4 text-center text-sm text-gray-500 dark:text-slate-400 mb-3">
                  ยังไม่มีคลังภายใน — กดปุ่มด้านล่างเพื่อสร้างคลังแรก
                </div>
              )}

              <div className="space-y-4">
                {internalWarehouses.map(wh => renderWarehouseCard(wh))}

                {showForm && !editingId ? (
                  renderForm()
                ) : !showForm ? (
                  <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    เพิ่ม<span className="hidden md:inline">คลังภายใน</span>
                  </button>
                ) : null}
              </div>
            </div>

            {/* Consignment Warehouses Section (read-only) */}
            {consignmentWarehouses.length > 0 && (
              <div className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="heading-4 flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-600" />
                    คลังฝากขาย
                    <span className="text-xs text-gray-400 dark:text-slate-500 font-normal">(สร้างอัตโนมัติจากลูกค้า)</span>
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-slate-400">{consignmentWarehouses.length} คลัง</p>
                </div>
                <div className="space-y-2">
                  {consignmentWarehouses.map(wh => renderConsignmentCard(wh))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Container>
      {confirmDialog}
    </Layout>
  );

  function renderWarehouseCard(wh: WarehouseItem) {
    return (
      <div key={wh.id} className="space-y-4">
        <Card padding="none" className={`overflow-hidden ${!wh.is_active ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Warehouse className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900 dark:text-white truncate">{wh.name}</p>
                {wh.code && <span className="text-xs text-gray-400 dark:text-slate-500">({wh.code})</span>}
                {wh.is_default && (
                  <span className="px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded font-medium">หลัก</span>
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
                  className="p-1.5 text-gray-400 hover:text-primary transition-colors"
                >
                  <StarOff className="w-4 h-4" />
                </button>
              )}
              {wh.is_default && (
                <Star className="w-4 h-4 text-primary fill-current" />
              )}
              <Toggle checked={wh.is_active} onChange={() => handleToggleActive(wh)} />
              <button
                onClick={() => startEdit(wh)}
                className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={async () => { const ok = await confirm({ title: 'ต้องการลบคลังนี้?', variant: 'danger' }); if (ok) handleDelete(wh.id); }}
                disabled={deletingId === wh.id}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
              >
                {deletingId === wh.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </Card>

        {editingId === wh.id && showForm && renderForm()}
      </div>
    );
  }

  function renderConsignmentCard(wh: WarehouseItem) {
    const customerLabel = wh.customer?.customer_type === 'department_store' ? 'ห้างฝากขาย' : 'ตัวแทนฝากขาย';
    return (
      <Card key={wh.id} padding="none" className={`overflow-hidden ${!wh.is_active ? 'opacity-60' : ''}`}>
        <div className="flex items-center gap-3 p-4">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-gray-900 dark:text-white truncate">{wh.name}</p>
              <span className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded font-medium">
                {customerLabel}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400">
              สร้างอัตโนมัติ — แก้ไขได้ที่หน้าลูกค้า
            </div>
          </div>
        </div>
      </Card>
    );
  }

  function renderForm() {
    return (
      <Card padding="md" className="space-y-3">
        <div className="text-sm font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
          <Warehouse className="w-4 h-4 text-primary" />
          {editingId ? 'แก้ไขคลังสินค้า' : 'เพิ่มคลังภายใน'}
        </div>

        {!editingId && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              สร้างคลังภายในของร้านเท่านั้น (คลังหลัก, สาขา ฯลฯ)
              <strong> ไม่ต้องสร้างคลังสำหรับตัวแทน/ห้างฝากขาย</strong> — ระบบจะสร้างให้อัตโนมัติเมื่อเพิ่มลูกค้าประเภทดังกล่าว
            </span>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">ชื่อคลัง *</label>
          <input
            type="text"
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="เช่น คลังหลัก, คลังสาขา 2"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">ที่อยู่</label>
          <input
            type="text"
            value={formAddress}
            onChange={e => setFormAddress(e.target.value)}
            placeholder="ที่อยู่คลังสินค้า"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            loading={saving}
            icon={<Check className="w-4 h-4" />}
          >
            บันทึก
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={resetForm}
            icon={<X className="w-4 h-4" />}
          >
            ยกเลิก
          </Button>
        </div>
      </Card>
    );
  }
}
