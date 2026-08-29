'use client';

import ProductImageThumb from '@/components/ui/ProductImageThumb';
import { useState } from 'react';
import { Loader2, Warehouse } from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';
import Modal from '@/components/ui/Modal';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { InventoryItem, WarehouseItem, getVariationLabel } from './types';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';

interface AdjustStockModalProps {
  item: InventoryItem;
  warehouses: WarehouseItem[];
  initialWarehouseId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function AdjustStockModal({ item, warehouses, initialWarehouseId, onClose, onSaved }: AdjustStockModalProps) {
  const { showToast } = useToast();
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [currentQty, setCurrentQty] = useState(0);
  const [newQty, setNewQty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingQty, setLoadingQty] = useState(false);

  // Fetch warehouse qty on mount if warehouse is pre-selected
  useState(() => {
    if (warehouseId) {
      fetchWarehouseQty(warehouseId);
    }
  });

  async function fetchWarehouseQty(whId: string) {
    setLoadingQty(true);
    try {
      const res = await apiFetch(`/api/inventory?warehouse_id=${whId}&limit=9999`);
      if (res.ok) {
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const found = (data.items || []).find((i: any) => i.variation_id === item.variation_id);
        const qty = found?.quantity || 0;
        setCurrentQty(qty);
        setNewQty(String(qty));
      }
    } catch { /* silent */ } finally {
      setLoadingQty(false);
    }
  }

  function handleWarehouseChange(whId: string) {
    setWarehouseId(whId);
    if (whId) {
      fetchWarehouseQty(whId);
    } else {
      setCurrentQty(0);
      setNewQty('');
    }
  }

  async function handleSave() {
    if (!warehouseId || newQty === '') return;
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty < 0) {
      showToast('จำนวนต้องเป็นตัวเลขที่ไม่ติดลบ', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse_id: warehouseId,
          variation_id: item.variation_id,
          new_quantity: qty,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }

      showToast('ปรับ stock สำเร็จ', 'success');
      onSaved();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'ปรับ stock ไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  }

  const diff = newQty !== '' ? parseInt(newQty, 10) - currentQty : 0;
  const varLabel = getVariationLabel(item);

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="ปรับ Stock"
      size="md"
      footer={
        <div className="flex justify-end gap-2 px-6 py-4">
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <SaveButton
            loading={saving}
            disabled={!warehouseId || newQty === '' || loadingQty}
            onClick={handleSave}
          />
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3">
          <ProductImageThumb src={item.product_image} alt="" size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate">{item.product_name}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              {item.product_code}
              {varLabel && <span> • {varLabel}</span>}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">คลังสินค้า</label>
          <FormSelect
            value={warehouseId}
            onChange={v => handleWarehouseChange(v)}
            options={warehouses.map(wh => ({ id: wh.id, label: wh.name }))}
            placeholder="เลือกคลัง"
            icon={<Warehouse className="w-4 h-4" />}
            searchThreshold={99}
          />
        </div>

        {warehouseId && (
          <>
            <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3">
              <span className="text-sm text-gray-600 dark:text-slate-300">stock ปัจจุบัน (คลังนี้)</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                {loadingQty ? <Loader2 className="w-4 h-4 animate-spin" /> : currentQty.toLocaleString()}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">จำนวนใหม่</label>
              <input
                type="number"
                min="0"
                value={newQty}
                onChange={e => setNewQty(e.target.value)}
                placeholder="กรอกจำนวนใหม่"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {newQty !== '' && !isNaN(diff) && diff !== 0 && (
                <p className={`mt-1 text-sm font-medium ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {diff > 0 ? `+${diff}` : diff} ({diff > 0 ? 'เพิ่ม' : 'ลด'})
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">เหตุผล (ไม่บังคับ)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="เช่น นับ stock จริง, ของเสีย..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
