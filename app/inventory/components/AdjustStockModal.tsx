'use client';

import { useMemo, useState } from 'react';
import { ProductIcon, WarehouseIcon } from '@/lib/icons';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import FormSelect from '@/components/ui/FormSelect';
import FormInput from '@/components/ui/FormInput';
import NumberInput from '@/components/ui/NumberInput';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE } from '@/components/ui/FilterChips';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { formatNumber } from '@/lib/utils/format';
import { productDisplayName, productSubtitle } from '@/lib/product-display';
import type { StockRow, WarehouseItem } from './types';

interface AdjustStockModalProps {
  row: StockRow;
  warehouses: WarehouseItem[];
  initialWarehouseId: string;
  onClose: () => void;
  onSaved: () => void;
}

type ReasonKey = 'count' | 'damaged' | 'wrong_entry' | 'other';

const REASON_CHIPS: { id: ReasonKey; label: string; activeClass: string }[] = [
  { id: 'count', label: 'นับสต็อก', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
  { id: 'damaged', label: 'ของเสีย/ชำรุด', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
  { id: 'wrong_entry', label: 'แก้ที่บันทึกผิด', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
  { id: 'other', label: 'อื่น ๆ', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
];

const REASON_LABEL: Record<ReasonKey, string> = {
  count: 'นับสต็อก',
  damaged: 'ของเสีย/ชำรุด',
  wrong_entry: 'แก้ที่บันทึกผิด',
  other: 'อื่น ๆ',
};

/**
 * ปรับยอดสต็อกของ 1 ตัวเลือกในคลังเดียว
 *
 * ยอดปัจจุบันอ่านจาก `row.by_warehouse` ที่มากับรายการอยู่แล้ว — ไม่ยิง API ซ้ำ
 * (ของเดิมโหลดทั้งคลัง `?limit=9999` มาหาแถวเดียว)
 */
export default function AdjustStockModal({ row, warehouses, initialWarehouseId, onClose, onSaved }: AdjustStockModalProps) {
  const { showToast } = useToast();
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [newQty, setNewQty] = useState<number>(() => {
    const wh = row.by_warehouse.find(w => w.warehouse_id === initialWarehouseId);
    return wh?.quantity ?? 0;
  });
  const [reason, setReason] = useState<ReasonKey>('count');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const currentWh = row.by_warehouse.find(w => w.warehouse_id === warehouseId);
  const currentQty = currentWh?.quantity ?? 0;
  const currentReserved = currentWh?.reserved ?? 0;
  const currentAvailable = currentWh?.available ?? currentQty - currentReserved;
  const diff = newQty - currentQty;

  // คลังในบริษัทก่อน แล้วค่อยคลังฝากขายของตัวแทน — ชุดเดียวกับตัวกรองในหน้ารายการ
  const warehouseOptions = useMemo(() => [
    ...warehouses.filter(w => w.warehouse_type !== 'consignment').map(w => ({ id: w.id, label: w.name })),
    ...warehouses.filter(w => w.warehouse_type === 'consignment').map(w => ({ id: w.id, label: `[ตัวแทน] ${w.name}` })),
  ], [warehouses]);

  const handleWarehouseChange = (id: string) => {
    setWarehouseId(id);
    setNewQty(row.by_warehouse.find(w => w.warehouse_id === id)?.quantity ?? 0);
  };

  const handleSave = async () => {
    if (!warehouseId) return;
    if (newQty < 0) {
      showToast('จำนวนต้องไม่ติดลบ', 'error');
      return;
    }
    const trimmedNote = note.trim();
    const notes = trimmedNote ? `${REASON_LABEL[reason]} — ${trimmedNote}` : REASON_LABEL[reason];

    setSaving(true);
    try {
      const res = await apiFetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse_id: warehouseId,
          variation_id: row.variation_id,
          new_quantity: newQty,
          notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'ปรับสต็อกไม่สำเร็จ');
      }
      showToast('ปรับสต็อกสำเร็จ', 'success');
      onSaved();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'ปรับสต็อกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const displayFields = {
    product_name: row.product_name,
    product_code: row.product_code,
    variation_label: row.is_simple ? '' : row.variation_label,
    sku: row.sku,
    barcode: row.barcode,
    attributes: row.is_simple ? null : row.attributes,
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="ปรับสต็อก"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <SaveButton loading={saving} disabled={!warehouseId} onClick={handleSave} />
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 inner-panel inner-panel-body">
          <ProductImageThumb
            src={row.image_url}
            alt={row.product_name}
            size="sm"
            fallbackIcon={<ProductIcon className="w-4 h-4 text-gray-400" />}
          />
          <div className="min-w-0">
            <p className="body-text font-medium text-gray-900 dark:text-white truncate">
              {productDisplayName(displayFields)}
            </p>
            <p className="helper-text text-gray-500 dark:text-slate-400">{productSubtitle(displayFields)}</p>
          </div>
        </div>

        <div>
          <label className="field-label">คลังสินค้า</label>
          <FormSelect
            value={warehouseId}
            onChange={handleWarehouseChange}
            options={warehouseOptions}
            placeholder="เลือกคลัง"
            icon={<WarehouseIcon className="w-4 h-4" />}
            searchThreshold={7}
          />
        </div>

        {warehouseId && (
          <>
            {/* ช่องนี้ปรับ "ของที่มีอยู่จริง" (quantity) ไม่ใช่ "พร้อมขาย" —
                หน้ารายการโชว์พร้อมขาย (quantity − จอง) ซึ่งเป็นคนละเลข เคยทำให้งงว่า
                ข้างนอกขึ้น -1 แต่เปิดเข้ามาเห็น 16 · จึงต้องโชว์ทั้งสามเลขให้ครบตรงนี้ */}
            <div className="inner-panel inner-panel-body space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="body-text text-gray-600 dark:text-slate-300">ของที่มีอยู่จริงในคลังนี้</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                  {formatNumber(currentQty)}
                </span>
              </div>
              <div className="flex items-baseline justify-between subtitle-text">
                <span>จอง (ติดออเดอร์)</span>
                <span className="tabular-nums">{formatNumber(currentReserved)}</span>
              </div>
              <div className="flex items-baseline justify-between subtitle-text">
                <span>พร้อมขาย</span>
                <span className={`tabular-nums ${currentAvailable < 0 ? 'text-red-500 dark:text-red-400 font-medium' : ''}`}>
                  {formatNumber(currentAvailable)}
                </span>
              </div>
              {currentAvailable < 0 && (
                <p className="helper-text text-red-500 dark:text-red-400">
                  ยอดจองมากกว่าของที่มี — มักเกิดจากออเดอร์ที่ยกเลิกแล้วแต่ยังไม่คืนยอดจอง
                </p>
              )}
            </div>

            <div>
              <label className="field-label">จำนวนใหม่</label>
              <div className="flex items-center gap-3">
                <NumberInput min="0" value={newQty} onChange={setNewQty} className="flex-1 form-control-md px-3 text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg border border-gray-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary" />
                {diff !== 0 && (
                  <span className={`body-text font-medium whitespace-nowrap tabular-nums ${diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {diff > 0 ? `+${formatNumber(diff)}` : `−${formatNumber(Math.abs(diff))}`}
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="field-label">เหตุผล</label>
              <FilterChips chips={REASON_CHIPS} value={reason} onChange={setReason} disabled={saving} />
            </div>

            <FormInput
              label="หมายเหตุ (ไม่บังคับ)"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="รายละเอียดเพิ่มเติม"
              disabled={saving}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
