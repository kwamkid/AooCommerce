// Path: components/products/form/VariantOptionsEditor.tsx
//
// ตัวเลือกสินค้าแบบ Shopee — เลือกชื่อตัวเลือก (สี) + พิมพ์ค่า (แดง ↵ ดำ ↵) แล้วตารางแถวละตัวเลือก
// ขึ้นให้เอง · กรอกราคาเดียวกันทุกแถวด้วย "ใช้กับทุกแถว"
//
// State อยู่ที่ parent: เมื่อ groups เปลี่ยน parent เรียก `regenerateRows()` (lib/product-variants.ts)
// แล้วส่ง rows ใหม่กลับมา — component นี้วาดอย่างเดียว · ใช้ทั้งฟอร์มจริงและหน้าลอง
// /dev/design/product-form
'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import ChipsInput from '@/components/ui/ChipsInput';
import FormSelect from '@/components/ui/FormSelect';
import FormInput from '@/components/ui/FormInput';
import NumberInput from '@/components/ui/NumberInput';
import Toggle from '@/components/ui/Toggle';
import ImageUploader, { type ProductImage } from '@/components/ui/ImageUploader';
import { MAX_OPTION_GROUPS, MAX_OPTION_VALUES, activeGroupNames, applyToAll } from '@/lib/product-variants';
import ProductCodesHelp from './ProductCodesHelp';
import { FieldError, OPTION_VALUE_MAX, StockText, numberInputClass } from './parts';
import type { FieldErrors, OptionGroup, VariantRow, VariationTypeOption } from './types';

interface VariantOptionsEditorProps {
  groups: OptionGroup[];
  /** parent runs regenerateRows() (and confirms dropping saved rows) */
  onGroupsChange: (next: OptionGroup[]) => void;
  rows: VariantRow[];
  onRowsChange: (next: VariantRow[]) => void;
  variationTypes: VariationTypeOption[];
  /** quick-add a variation type (master data) */
  onAddVariationType: () => void;
  /** images per row, keyed by row._tempId */
  images: Record<string, ProductImage[]>;
  onImagesChange: (key: string, imgs: ProductImage[]) => void;
  errors: FieldErrors;
  canViewCost: boolean;
  /** edit mode + company uses stock → read-only พร้อมขาย column */
  showStock: boolean;
  /** regenerateRows refused the change (limits) */
  groupsError?: string | null;
}

type BulkState = { default_price: number; discount_price: number; cost_price: number };
const EMPTY_BULK: BulkState = { default_price: 0, discount_price: 0, cost_price: 0 };

export default function VariantOptionsEditor({
  groups, onGroupsChange, rows, onRowsChange, variationTypes, onAddVariationType,
  images, onImagesChange, errors, canViewCost, showStock, groupsError,
}: VariantOptionsEditorProps) {
  const [bulk, setBulk] = useState<BulkState>(EMPTY_BULK);
  const groupNames = activeGroupNames(groups);

  const setGroup = (i: number, patch: Partial<OptionGroup>) =>
    onGroupsChange(groups.map((g, k) => (k === i ? { ...g, ...patch } : g)));
  const pickType = (i: number, typeId: string) => {
    const t = variationTypes.find(x => x.id === typeId);
    setGroup(i, { typeId, name: t?.name ?? '' });
  };
  const addGroup = () => onGroupsChange([...groups, { typeId: '', name: '', values: [] }]);
  const removeGroup = (i: number) => onGroupsChange(groups.filter((_, k) => k !== i));
  /** Types not used by another group (a closed type stays listed while this group uses it) */
  const typeOptions = (i: number) =>
    variationTypes
      .filter(t => (t.is_active !== false || t.id === groups[i]?.typeId)
        && !groups.some((g, k) => k !== i && g.typeId === t.id))
      .map(t => ({ id: t.id, label: t.name }));

  const updateRow = (tempId: string, patch: Partial<VariantRow>) =>
    onRowsChange(rows.map(r => (r._tempId === tempId ? { ...r, ...patch } : r)));

  const bulkPatch = {
    ...(bulk.default_price > 0 ? { default_price: bulk.default_price } : {}),
    ...(bulk.discount_price > 0 ? { discount_price: bulk.discount_price } : {}),
    ...(canViewCost && bulk.cost_price > 0 ? { cost_price: bulk.cost_price } : {}),
  };
  const applyBulk = () => {
    onRowsChange(applyToAll(rows, bulkPatch));
    setBulk(EMPTY_BULK);
  };

  const err = (i: number, field: string) => errors[`variation.${i}.${field}`];
  /** attribute / duplicate-combo error of a row */
  const attrError = (i: number) => groupNames.map(n => err(i, n)).find(Boolean);

  return (
    <div className="space-y-4">
      {/* ── option groups ── */}
      {groups.map((g, i) => (
        <div key={i} className="inner-panel">
          <div className="inner-panel-head justify-between">
            <span className="font-medium text-gray-700 dark:text-slate-200 truncate">
              ตัวเลือกที่ {i + 1}{g.name ? ` · ${g.name}` : ''}
            </span>
            {groups.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => removeGroup(i)}
                aria-label={`ลบตัวเลือกที่ ${i + 1}`}
              >
                ลบ
              </Button>
            )}
          </div>
          <div className="inner-panel-body grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
            <div data-field={`group.${i}.name`}>
              {/* ปุ่มเพิ่มอยู่บรรทัดป้ายชิดขวา — ชุดเดียวกับหมวดหมู่/แบรนด์ในการ์ดข้อมูลสินค้า */}
              <div className="flex items-center justify-between gap-2">
                <label className="field-label">ชื่อตัวเลือก</label>
                <button
                  type="button"
                  onClick={onAddVariationType}
                  aria-label="เพิ่มชื่อตัวเลือกใหม่"
                  className="field-label flex items-center gap-1 text-primary hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  เพิ่มใหม่
                </button>
              </div>
              <FormSelect
                value={g.typeId}
                onChange={id => pickType(i, id)}
                options={typeOptions(i)}
                placeholder="เลือก เช่น สี, ขนาด"
                searchPlaceholder="ค้นหาชื่อตัวเลือก..."
              />
              <FieldError text={errors[`group.${i}.name`]} />
            </div>
            <div data-field={`group.${i}.values`}>
              <ChipsInput
                label="ค่า"
                value={g.values}
                onChange={values => setGroup(i, { values })}
                placeholder={g.typeId ? 'พิมพ์แล้วกด Enter เช่น แดง' : 'เลือกชื่อตัวเลือกก่อน'}
                max={MAX_OPTION_VALUES}
                maxLength={OPTION_VALUE_MAX}
                disabled={!g.typeId}
                removeLabel={v => `เอา "${v}" ออก`}
                error={errors[`group.${i}.values`]}
              />
            </div>
          </div>
        </div>
      ))}

      {groups.length < MAX_OPTION_GROUPS && (
        <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={addGroup}>
          {groups.length === 0 ? 'เพิ่มตัวเลือก' : `เพิ่มตัวเลือกที่ ${groups.length + 1}`}
        </Button>
      )}
      <FieldError text={groupsError} />

      {/* ── generated rows ── */}
      {rows.length === 0 ? (
        <div data-field="variations_empty" className="rounded-lg border border-dashed border-gray-300 dark:border-slate-600 py-6 text-center">
          <p className="text-base text-gray-500 dark:text-slate-400">ใส่ชื่อตัวเลือกและค่า แล้วตารางจะขึ้นให้เอง</p>
          <FieldError text={errors.variations_empty} />
        </div>
      ) : (
        <>
          {rows.length > 1 && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 dark:bg-slate-900/40 p-3">
              <span className="w-full text-base font-medium text-gray-700 dark:text-slate-200">กรอกทุกแถวพร้อมกัน</span>
              <div className="w-32">
                <label className="helper-text">ราคาปกติ</label>
                <NumberInput
                  value={bulk.default_price}
                  onChange={n => setBulk(b => ({ ...b, default_price: n }))}
                  min={0}
                  aria-label="ราคาปกติทุกแถว"
                  className={numberInputClass(false, 'right')}
                />
              </div>
              <div className="w-32">
                <label className="helper-text">ราคาขาย</label>
                <NumberInput
                  value={bulk.discount_price}
                  onChange={n => setBulk(b => ({ ...b, discount_price: n }))}
                  min={0}
                  aria-label="ราคาขายทุกแถว"
                  className={numberInputClass(false, 'right')}
                />
              </div>
              {canViewCost && (
                <div className="w-32">
                  <label className="helper-text">ต้นทุน</label>
                  <NumberInput
                    value={bulk.cost_price}
                    onChange={n => setBulk(b => ({ ...b, cost_price: n }))}
                    min={0}
                    aria-label="ต้นทุนทุกแถว"
                    className={numberInputClass(false, 'right')}
                  />
                </div>
              )}
              <Button variant="secondary" onClick={applyBulk} disabled={Object.keys(bulkPatch).length === 0}>
                ใช้กับทุกแถว
              </Button>
            </div>
          )}

          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
            <table className="w-full min-w-[760px]">
              <thead className="data-thead">
                <tr>
                  <th className="data-th w-[96px]">รูป</th>
                  <th className="data-th">ตัวเลือก</th>
                  <th className="data-th w-[130px] text-right">ราคาปกติ *</th>
                  <th className="data-th w-[130px] text-right">ราคาขาย</th>
                  {canViewCost && <th className="data-th w-[120px] text-right">ต้นทุน</th>}
                  <th className="data-th w-[160px]">
                    <span className="inline-flex items-center gap-1">SKU <ProductCodesHelp focus="sku" /></span>
                  </th>
                  <th className="data-th w-[170px]">
                    <span className="inline-flex items-center gap-1">บาร์โค้ด <ProductCodesHelp focus="barcode" /></span>
                  </th>
                  {showStock && <th className="data-th w-[96px] text-right">พร้อมขาย</th>}
                  <th className="data-th w-[84px] text-center">เปิดขาย</th>
                </tr>
              </thead>
              <tbody className="data-tbody">
                {rows.map((row, i) => (
                  <tr key={row._tempId} className="data-tr align-top">
                    <td className="px-3 py-3">
                      <div className="w-[72px]">
                        <ImageUploader
                          images={images[row._tempId] || []}
                          onImagesChange={imgs => onImagesChange(row._tempId, imgs)}
                          maxImages={1}
                          compact
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3" data-field={groupNames[0] ? `variation.${i}.${groupNames[0]}` : undefined}>
                      <div className={`min-h-[42px] flex items-center gap-1.5 text-base ${row.is_active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                        <span>{row.variation_label || '-'}</span>
                        {!row.is_active && <Badge tone="gray" shape="square" size="sm">ปิด</Badge>}
                      </div>
                      <FieldError text={attrError(i)} />
                    </td>
                    <td className="px-3 py-3" data-field={`variation.${i}.price`}>
                      <NumberInput
                        value={row.default_price}
                        onChange={n => updateRow(row._tempId, { default_price: n })}
                        min={0}
                        aria-label={`ราคาปกติ ${row.variation_label}`}
                        className={numberInputClass(!!err(i, 'price'), 'right')}
                      />
                      <FieldError text={err(i, 'price')} />
                    </td>
                    <td className="px-3 py-3" data-field={`variation.${i}.discount`}>
                      <NumberInput
                        value={row.discount_price}
                        onChange={n => updateRow(row._tempId, { discount_price: n })}
                        min={0}
                        aria-label={`ราคาขาย ${row.variation_label}`}
                        className={numberInputClass(!!err(i, 'discount'), 'right')}
                      />
                      <FieldError text={err(i, 'discount')} />
                    </td>
                    {canViewCost && (
                      <td className="px-3 py-3">
                        <NumberInput
                          value={row.cost_price}
                          onChange={n => updateRow(row._tempId, { cost_price: n })}
                          min={0}
                          aria-label={`ต้นทุน ${row.variation_label}`}
                          className={numberInputClass(false, 'right')}
                        />
                      </td>
                    )}
                    <td className="px-3 py-3" data-field={`variation.${i}.sku`}>
                      <FormInput
                        value={row.sku}
                        onChange={e => updateRow(row._tempId, { sku: e.target.value })}
                        error={err(i, 'sku')}
                        aria-label={`SKU ${row.variation_label}`}
                      />
                    </td>
                    <td className="px-3 py-3" data-field={`variation.${i}.barcode`}>
                      <FormInput
                        value={row.barcode}
                        onChange={e => updateRow(row._tempId, { barcode: e.target.value })}
                        error={err(i, 'barcode')}
                        aria-label={`บาร์โค้ด ${row.variation_label}`}
                      />
                    </td>
                    {showStock && (
                      <td className="px-3 py-3 text-right">
                        <div className="min-h-[42px] flex items-center justify-end text-base">
                          <StockText available={row.available} />
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <div className="h-[42px] flex items-center justify-center">
                        <Toggle
                          checked={row.is_active}
                          onChange={v => updateRow(row._tempId, { is_active: v })}
                          aria-label={`เปิดขาย ${row.variation_label}`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700 rounded-lg border border-gray-200 dark:border-slate-700">
            {rows.map((row, i) => (
              <div key={row._tempId} className="p-3 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-[72px] flex-shrink-0">
                    <ImageUploader
                      images={images[row._tempId] || []}
                      onImagesChange={imgs => onImagesChange(row._tempId, imgs)}
                      maxImages={1}
                      compact
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`flex items-center gap-1.5 text-base font-medium ${row.is_active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                      <span>{row.variation_label || '-'}</span>
                      {!row.is_active && <Badge tone="gray" shape="square" size="sm">ปิด</Badge>}
                    </div>
                    {showStock && (
                      <div className="text-sm text-gray-500 dark:text-slate-400">
                        พร้อมขาย <StockText available={row.available} />
                      </div>
                    )}
                    <FieldError text={attrError(i)} />
                  </div>
                  <Toggle
                    checked={row.is_active}
                    onChange={v => updateRow(row._tempId, { is_active: v })}
                    aria-label={`เปิดขาย ${row.variation_label}`}
                  />
                </div>
                <div className={`grid gap-3 ${canViewCost ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <div>
                    <label className="helper-text">ราคาปกติ *</label>
                    <NumberInput
                      value={row.default_price}
                      onChange={n => updateRow(row._tempId, { default_price: n })}
                      min={0}
                      className={numberInputClass(!!err(i, 'price'), 'right')}
                    />
                    <FieldError text={err(i, 'price')} />
                  </div>
                  <div>
                    <label className="helper-text">ราคาขาย</label>
                    <NumberInput
                      value={row.discount_price}
                      onChange={n => updateRow(row._tempId, { discount_price: n })}
                      min={0}
                      className={numberInputClass(!!err(i, 'discount'), 'right')}
                    />
                    <FieldError text={err(i, 'discount')} />
                  </div>
                  {canViewCost && (
                    <div>
                      <label className="helper-text">ต้นทุน</label>
                      <NumberInput
                        value={row.cost_price}
                        onChange={n => updateRow(row._tempId, { cost_price: n })}
                        min={0}
                        className={numberInputClass(false, 'right')}
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormInput
                    label="SKU"
                    value={row.sku}
                    onChange={e => updateRow(row._tempId, { sku: e.target.value })}
                    error={err(i, 'sku')}
                  />
                  <FormInput
                    label="บาร์โค้ด"
                    value={row.barcode}
                    onChange={e => updateRow(row._tempId, { barcode: e.target.value })}
                    error={err(i, 'barcode')}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
