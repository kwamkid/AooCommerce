'use client';

import Link from 'next/link';
import type { PurchaseOrderDetail, Supplier, WarehouseItem } from './types';
import { formatDate } from './types';
import type { DateValueType } from '@/components/ui/DateRangePicker';
import type { ProductSearchItem } from '@/components/ui/ProductSearchInput';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import FormSelect from '@/components/ui/FormSelect';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { Factory, Warehouse as WarehouseIcon, CalendarDays, Star, Tag, ExternalLink, AlertCircle } from 'lucide-react';

function supplierTypeLabel(type: string) {
  switch (type) {
    case 'manufacturer': return 'ผู้ผลิต';
    case 'distributor': return 'ผู้จัดจำหน่าย';
    case 'wholesaler': return 'ขายส่ง';
    default: return type;
  }
}

interface Props {
  po?: PurchaseOrderDetail | null;
  isEditable: boolean;
  // Edit state
  suppliers: Supplier[];
  warehouses: WarehouseItem[];
  editSupplierId: string;
  editWarehouseId: string;
  editExpectedDate: DateValueType;
  onSupplierChange: (id: string) => void;
  onSupplierClear: () => void;
  onWarehouseChange: (id: string) => void;
  onExpectedDateChange: (v: DateValueType) => void;
  // Supplier info (editable mode)
  selectedSupplier?: Supplier | null;
  allBrands: { id: string; name: string; supplier_id: string | null }[];
  supplierProducts: ProductSearchItem[];
  loadingProducts: boolean;
}

export default function POInfoCard({
  po, isEditable,
  suppliers, warehouses,
  editSupplierId, editWarehouseId, editExpectedDate,
  onSupplierChange, onSupplierClear, onWarehouseChange, onExpectedDateChange,
  selectedSupplier, allBrands, supplierProducts, loadingProducts,
}: Props) {
  const supplierBrands = allBrands.filter(b => b.supplier_id === editSupplierId);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:items-stretch">
        {/* ─── Left column: Supplier + Info box ─── */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              <Factory className="w-4 h-4 inline mr-1" /> Supplier
            </label>
            {isEditable ? (
              <EntitySearchInput
                value={editSupplierId}
                onChange={onSupplierChange}
                onClear={onSupplierClear}
                options={suppliers.map(s => ({ id: s.id, label: s.name }))}
                placeholder="ค้นหาชื่อ Supplier..."
                icon={<Factory className="w-4 h-4" />}
              />
            ) : (
              <div className="h-[42px] flex items-center px-3 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-700/50 text-base text-gray-900 dark:text-white">
                {po?.supplier?.name || '-'}
              </div>
            )}
          </div>

          {/* Supplier info box (editable + supplier selected) */}
          {isEditable && editSupplierId && selectedSupplier ? (
            <div className="border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5 flex-1 flex flex-col justify-center">
              <div className="flex items-center justify-between">
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400">
                  {supplierTypeLabel(selectedSupplier.supplier_type)}
                </span>
                <Link href={`/settings/suppliers/${editSupplierId}/edit`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 flex-shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1"><Tag className="w-3 h-3" /></span>
                {supplierBrands.length > 0 ? supplierBrands.map(b => (
                  <span key={b.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{b.name}</span>
                )) : (
                  <span className="text-xs text-gray-400 dark:text-slate-500">ยังไม่มีแบรนด์</span>
                )}
              </div>
              {!loadingProducts && supplierProducts.length === 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 mt-2 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="text-amber-800 dark:text-amber-200 font-medium">Supplier นี้ยังไม่มีสินค้า</p>
                    <p className="text-amber-600 dark:text-amber-400 mt-0.5">
                      {supplierBrands.length > 0
                        ? <>ผูกสินค้ากับ Brand → <Link href="/products" className="underline font-medium">ไปหน้าสินค้า</Link></>
                        : <>เพิ่ม Brand → <Link href={`/settings/suppliers/${editSupplierId}/edit`} className="underline font-medium">แก้ไข Supplier</Link></>}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Non-editable: supplier type */}
          {!isEditable && po?.supplier && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
              <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400">
                {supplierTypeLabel(po.supplier.supplier_type)}
              </span>
              {po.supplier.contact_name && <span>ติดต่อ: {po.supplier.contact_name}</span>}
              {po.supplier.phone && <span>โทร: {po.supplier.phone}</span>}
            </div>
          )}
        </div>

        {/* ─── Right column: Warehouse + Expected Date ─── */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              <WarehouseIcon className="w-4 h-4 inline mr-1" /> คลังสินค้า
            </label>
            {isEditable ? (
              <FormSelect
                value={editWarehouseId}
                onChange={onWarehouseChange}
                options={warehouses.map(w => ({ id: w.id, label: `${w.name}${w.code ? ` (${w.code})` : ''}`, icon: w.is_default ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : undefined }))}
                placeholder="-- เลือกคลัง --"
                searchPlaceholder="ค้นหาคลัง..."
                icon={<WarehouseIcon className="w-4 h-4" />}
              />
            ) : (
              <div className="h-[42px] flex items-center px-3 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-700/50 text-base text-gray-900 dark:text-white">
                {po?.warehouse?.name || '-'}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              <CalendarDays className="w-4 h-4 inline mr-1" /> คาดว่าจะได้รับ
            </label>
            {isEditable ? (
              <DateRangePicker value={editExpectedDate} onChange={onExpectedDateChange} asSingle useRange={false} showShortcuts={false} showFooter={false} placeholder="เลือกวันที่" />
            ) : (
              <div className="h-[42px] flex items-center px-3 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-700/50 text-base text-gray-900 dark:text-white">
                {po?.expected_date ? formatDate(po.expected_date) : '-'}
              </div>
            )}
          </div>

          {/* Non-editable: extra info */}
          {!isEditable && po && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
              <span>วันที่สั่ง: <span className="text-gray-900 dark:text-white">{formatDate(po.order_date)}</span></span>
              <span>ผู้สร้าง: <span className="text-gray-900 dark:text-white">{po.created_by_user?.name || '-'}</span></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
