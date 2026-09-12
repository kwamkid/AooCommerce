'use client';

/**
 * Composite-product editor (สินค้าชุด) — mounted by ProductForm when the type is composite.
 * Section 1 "ส่วนประกอบของชุด" = slots · Section 2 "ชุดย่อย" = one row per combo.
 * All state lives in useCompositeEditor (the form owns it so it can validate + build the payload).
 */
import { useMemo } from 'react';
import { Plus, Trash2, RefreshCw, Loader2, ImagePlus } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Checkbox from '@/components/ui/Checkbox';
import ImageUploader, { type ProductImage } from '@/components/ui/ImageUploader';
import { thumbUrl } from '@/lib/image-thumb';
import Toggle from '@/components/ui/Toggle';
import FormInput from '@/components/ui/FormInput';
import NumberInput from '@/components/ui/NumberInput';
import PriceReduceInput from '@/components/products/form/PriceReduceInput';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import { apiFetch } from '@/lib/api-client';
import { useServerSearch } from '@/lib/useServerSearch';
import { formatNumber, formatPrice } from '@/lib/utils/format';
import type { CompositeSlot } from '@/lib/composite-shared';
import type { ComboRow, CompositeEditorState } from './useCompositeEditor';

const SECTION = 'bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5';
const PRICE_INPUT = 'w-full px-3 text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors';
const ERROR_TEXT = 'text-red-600 dark:text-red-400';

// ── product search (server-side, same RPC as the order form) ──

interface SearchRow {
  variation_id: string;
  product_id: string;
  code: string | null;
  name: string;
  variation_label: string | null;
  sku: string | null;
  barcode: string | null;
  default_price: number | null;
  discount_price: number | null;
  image_url: string | null;
}

async function fetchProductSearch(q: string) {
  const res = await apiFetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=80`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'search failed');
  const rows: ProductSearchItem[] = ((data.items || []) as SearchRow[]).map(r => ({
    id: r.variation_id,
    product_id: r.product_id,
    code: r.code || '',
    name: r.name,
    image: r.image_url,
    variation_label: r.variation_label ?? undefined,
    sku: r.sku ?? undefined,
    barcode: r.barcode ?? undefined,
    default_price: Number(r.default_price) || 0,
    discount_price: r.discount_price != null ? Number(r.discount_price) : undefined,
  }));
  return { rows, complete: !!data.complete };
}

function narrowProducts(rows: ProductSearchItem[], q: string) {
  const term = q.toLowerCase();
  return rows.filter(r => [r.name, r.code, r.sku, r.barcode].some(v => !!v && v.toLowerCase().includes(term)));
}

function SlotProductPicker({ editor, slotKey }: { editor: CompositeEditorState; slotKey: string }) {
  const search = useServerSearch<ProductSearchItem>({ fetch: fetchProductSearch, narrow: narrowProducts });
  const { selfProductId, compositeIds } = editor;
  // Stable array identity — ProductSearchInput treats a new array as "new results arrived"
  const items = useMemo(
    () => search.results.filter(p => p.product_id !== selfProductId && !compositeIds.has(p.product_id)),
    [search.results, selfProductId, compositeIds],
  );
  return (
    <ProductSearchInput
      products={items}
      mode="product"
      loading={search.loading}
      onSearchChange={search.search}
      onSelect={p => editor.pickProduct(slotKey, p.product_id)}
      placeholder="ค้นหาสินค้า (ชื่อ, รหัส หรือ SKU)"
    />
  );
}

// ── section 1: slots ──

function SlotCard({ editor, slot, index }: { editor: CompositeEditorState; slot: CompositeSlot; index: number }) {
  const product = slot.product_id ? editor.products[slot.product_id] : undefined;
  const loading = !!editor.loadingSlots[slot.key];
  const pickError = editor.pickErrors[slot.key];
  const selected = new Set(slot.variation_ids);
  const activeOptions = product ? product.options.filter(o => o.is_active) : [];
  // closed options stay visible only while still ticked, so they can be unticked
  const visibleOptions = product ? product.options.filter(o => o.is_active || selected.has(o.variation_id)) : [];
  const allSelected = activeOptions.length > 0 && activeOptions.every(o => selected.has(o.variation_id));

  return (
    <div className="inner-panel">
      <div className="inner-panel-head justify-between">
        <span className="font-medium text-gray-700 dark:text-slate-200 truncate">
          ส่วนที่ {index + 1}{slot.name.trim() ? ` · ${slot.name.trim()}` : ''}
        </span>
        {editor.slots.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-4 h-4" />}
            onClick={() => editor.removeSlot(slot.key)}
            aria-label="ลบส่วนประกอบนี้"
          >
            ลบ
          </Button>
        )}
      </div>

      <div className="inner-panel-body space-y-4">
        {product ? (
          <div className="flex items-center gap-3">
            <ProductImageThumb src={product.image_url} alt={product.name} size="md" />
            <div className="flex-1 min-w-0">
              <div className="text-base font-medium text-gray-900 dark:text-white truncate">{product.name}</div>
              {product.code && <div className="helper-text truncate">{product.code}</div>}
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={() => editor.clearProduct(slot.key)}
            >
              เปลี่ยนสินค้า
            </Button>
          </div>
        ) : (
          <div>
            <label className="field-label">สินค้า</label>
            <SlotProductPicker editor={editor} slotKey={slot.key} />
            {loading && (
              <p className="mt-2 flex items-center gap-2 text-base text-gray-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังโหลดตัวเลือก...
              </p>
            )}
            {pickError && <p className={`mt-2 text-base ${ERROR_TEXT}`}>{pickError}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-4">
          <FormInput
            label="ชื่อส่วนประกอบ"
            value={slot.name}
            onChange={e => editor.updateSlot(slot.key, { name: e.target.value })}
            placeholder="เช่น โครงรถเข็น"
          />
          <div>
            <label className="field-label">จำนวนต่อชุด</label>
            <NumberInput
              value={slot.quantity}
              min={1}
              onChange={n => editor.updateSlot(slot.key, { quantity: Math.floor(n) })}
            />
          </div>
        </div>

        {product && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="field-label !mb-0">ตัวเลือกที่ขายในชุด</span>
              {!product.is_simple && activeOptions.length > 1 && (
                <button
                  type="button"
                  onClick={() => editor.setAllOptions(slot.key, !allSelected)}
                  className="text-base font-medium text-[#C0400E] hover:underline"
                >
                  {allSelected ? 'ไม่เลือกทั้งหมด' : 'เลือกทั้งหมด'}
                </button>
              )}
            </div>
            {visibleOptions.length === 0 ? (
              <p className={`text-base ${ERROR_TEXT}`}>สินค้านี้ไม่มีตัวเลือกที่เปิดขาย</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {visibleOptions.map(o => {
                  const on = selected.has(o.variation_id);
                  const price = o.discount_price && o.discount_price > 0 ? o.discount_price : o.default_price;
                  const content = (
                    <>
                      <span className="text-base text-gray-800 dark:text-slate-200">{o.label}</span>
                      <span className="helper-text">฿{formatPrice(price)}</span>
                      {!o.is_active && <Badge tone="gray" shape="square" size="sm">ปิด</Badge>}
                    </>
                  );
                  // a simple product has exactly one option — it is the product, not a choice
                  return product.is_simple ? (
                    <div key={o.variation_id} className="choice-card choice-card-active px-3 py-2 flex items-center gap-2">
                      {content}
                    </div>
                  ) : (
                    <div key={o.variation_id} className={`choice-card px-3 py-2 ${on ? 'choice-card-active' : ''}`}>
                      <Checkbox checked={on} onChange={() => editor.toggleOption(slot.key, o.variation_id)}>
                        {content}
                      </Checkbox>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── section 2: combos ──

function RowBadges({ row, isEditing }: { row: ComboRow; isEditing: boolean }) {
  if (!row.hasInactivePart && (row.exists || !isEditing)) return null;
  return (
    <span className="inline-flex flex-wrap gap-1 mt-1">
      {row.hasInactivePart && <Badge tone="amber" size="sm">ชิ้นส่วนถูกปิด</Badge>}
      {isEditing && !row.exists && <Badge tone="blue" size="sm">ใหม่</Badge>}
    </span>
  );
}

function PriceCell({ row, field, editor }: { row: ComboRow; field: 'default_price' | 'discount_price'; editor: CompositeEditorState }) {
  if (row.setting.price_locked) {
    if (field === 'discount_price') {
      return (
        <PriceReduceInput
          value={row.setting.discount_price}
          basePrice={row.setting.default_price}
          onChange={n => editor.setRow(row.key, { discount_price: n })}
          error={!!row.errors.price}
          showHint={!row.errors.price}
          emptyHint=""
          align="right"
          aria-label="ลดเหลือ"
        />
      );
    }
    return (
      <NumberInput
        value={row.setting[field]}
        min={0}
        onChange={n => editor.setRow(row.key, { [field]: n })}
        aria-label="ราคาปกติ"
        className={`${PRICE_INPUT} ${row.errors.price ? 'border-red-400' : 'border-gray-300 dark:border-slate-600'}`}
      />
    );
  }
  const value = row.price[field];
  if (field === 'discount_price' && !value) return <span className="text-gray-400 dark:text-slate-500">—</span>;
  return <span className="text-gray-900 dark:text-white">฿{formatPrice(value)}</span>;
}

/** Per-combo picture — same staged uploader as variation rows; empty = faded preview of the automatic one */
function ComboImageCell({ row, images, onChange }: {
  row: ComboRow;
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
}) {
  const fallback = images.length === 0 ? thumbUrl(row.fallbackImage, 160) : undefined;
  return (
    <div className="relative w-16 flex-shrink-0">
      <ImageUploader images={images} onImagesChange={onChange} maxImages={1} compact />
      {fallback && (
        <div className="pointer-events-none absolute inset-[2px] overflow-hidden rounded-[10px] bg-white dark:bg-slate-800">
          <img src={fallback} alt="" className="w-full h-full object-cover opacity-45" />
          <span className="absolute inset-0 flex items-center justify-center">
            <ImagePlus className="w-5 h-5 text-gray-600 dark:text-slate-200" />
          </span>
        </div>
      )}
    </div>
  );
}

function availableText(row: ComboRow) {
  return row.exists && row.saved?.available != null ? formatNumber(row.saved.available) : '—';
}

interface ComboImagesProps {
  /** the form's variation-image state (keyed by ComboRow.imageKey) */
  images: Record<string, ProductImage[]>;
  onImagesChange: (key: string, images: ProductImage[]) => void;
}

function CombosSection({ editor, images, onImagesChange }: { editor: CompositeEditorState } & ComboImagesProps) {
  const { rows, advanced, isEditing } = editor;
  const imageCell = (row: ComboRow) => (
    <ComboImageCell row={row} images={images[row.imageKey] || []} onChange={imgs => onImagesChange(row.imageKey, imgs)} />
  );
  const allActive = rows.length > 0 && rows.every(r => r.setting.is_active);

  return (
    <div className={SECTION}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="heading-3">ชุดย่อย ({rows.length} แบบ)</h3>
        <div className="flex items-center gap-2">
          <Toggle checked={advanced} onChange={editor.setAdvanced} aria-label="ตั้งราคาเองรายชุด (ขั้นสูง)" />
          <span className="text-base text-gray-700 dark:text-slate-300">ตั้งราคาเองรายชุด (ขั้นสูง)</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-base text-gray-500 dark:text-slate-400 py-6 text-center">
          {editor.allPicked ? 'เลือกตัวเลือกของทุกส่วนประกอบก่อน' : 'เลือกสินค้าให้ครบทุกส่วนประกอบก่อน'}
        </p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
            <table className="w-full">
              {/* เรียงคอลัมน์ชุดเดียวกับตารางตัวเลือกสินค้า: รูปหน้าสุด · เปิดขายหลังสุด (12 ก.ย. 2026) */}
              <thead className="data-thead">
                <tr>
                  <th className="data-th w-[96px]">รูป</th>
                  <th className="data-th">ชื่อชุดย่อย</th>
                  <th className="data-th w-[220px]">SKU</th>
                  {advanced && <th className="data-th w-[100px]">ตั้งราคาเอง</th>}
                  <th className="data-th w-[150px] text-right">ราคาปกติ</th>
                  <th className="data-th w-[190px] text-right">ลดเหลือ</th>
                  <th className="data-th w-[100px] text-right">พร้อมขาย</th>
                  <th className="data-th w-[110px]">
                    <Checkbox checked={allActive} onChange={() => editor.setAllActive(!allActive)} label="เปิดขาย" />
                  </th>
                </tr>
              </thead>
              <tbody className="data-tbody">
                {rows.map(row => (
                  <tr key={row.key} className="data-tr align-top">
                    <td className="px-4 py-3">{imageCell(row)}</td>
                    <td className="px-4 py-3">
                      <div className={`text-base ${row.setting.is_active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                        {row.label}
                      </div>
                      <RowBadges row={row} isEditing={isEditing} />
                    </td>
                    <td className="px-4 py-3">
                      <FormInput
                        value={row.setting.sku}
                        onChange={e => editor.setRow(row.key, { sku: e.target.value })}
                        placeholder={row.exists ? '' : row.autoSku}
                        error={row.errors.sku}
                        aria-label="SKU"
                      />
                    </td>
                    {advanced && (
                      <td className="px-4 py-3">
                        <div className="h-[42px] flex items-center">
                          <Checkbox checked={row.setting.price_locked} onChange={v => editor.lockRow(row, v)} />
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <div className="min-h-[42px] flex items-center justify-end">
                        <PriceCell row={row} field="default_price" editor={editor} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="min-h-[42px] flex items-center justify-end">
                        <PriceCell row={row} field="discount_price" editor={editor} />
                      </div>
                      {row.errors.price && <p className={`mt-1 text-base ${ERROR_TEXT}`}>{row.errors.price}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="min-h-[42px] flex items-center justify-end text-gray-900 dark:text-white">
                        {availableText(row)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-h-[42px] flex items-center">
                        <Toggle
                          checked={row.setting.is_active}
                          onChange={v => editor.setRow(row.key, { is_active: v })}
                          aria-label={`เปิดขาย ${row.label}`}
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
            {rows.map(row => (
              <div key={row.key} className="p-3 space-y-3">
                <div className="flex items-start gap-3">
                  {imageCell(row)}
                  <div className="min-w-0 flex-1">
                    <div className={`text-base font-medium ${row.setting.is_active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                      {row.label}
                    </div>
                    <RowBadges row={row} isEditing={isEditing} />
                  </div>
                  <Toggle
                    checked={row.setting.is_active}
                    onChange={v => editor.setRow(row.key, { is_active: v })}
                    aria-label={`เปิดขาย ${row.label}`}
                  />
                </div>
                <FormInput
                  label="SKU"
                  value={row.setting.sku}
                  onChange={e => editor.setRow(row.key, { sku: e.target.value })}
                  placeholder={row.exists ? '' : row.autoSku}
                  error={row.errors.sku}
                />
                {advanced && (
                  <Checkbox checked={row.setting.price_locked} onChange={v => editor.lockRow(row, v)} label="ตั้งราคาเอง" />
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="helper-text mb-1">ราคาปกติ</div>
                    <PriceCell row={row} field="default_price" editor={editor} />
                  </div>
                  <div>
                    <div className="helper-text mb-1">ลดเหลือ</div>
                    <PriceCell row={row} field="discount_price" editor={editor} />
                  </div>
                  <div className="text-right">
                    <div className="helper-text mb-1">พร้อมขาย</div>
                    <span className="text-gray-900 dark:text-white">{availableText(row)}</span>
                  </div>
                </div>
                {row.errors.price && <p className={`text-base ${ERROR_TEXT}`}>{row.errors.price}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function CompositeEditor({ editor, images, onImagesChange }: { editor: CompositeEditorState } & ComboImagesProps) {
  return (
    <div className="space-y-5" data-field="composite">
      <div className={SECTION}>
        <h3 className="heading-3">ส่วนประกอบของชุด</h3>
        <p className="section-desc mb-4">เลือกสินค้าของแต่ละส่วน และตัวเลือกที่ลูกค้าเลือกได้</p>
        <div className="space-y-4">
          {editor.slots.map((slot, i) => (
            <SlotCard key={slot.key} editor={editor} slot={slot} index={i} />
          ))}
        </div>
        <div className="mt-4">
          <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={editor.addSlot}>
            เพิ่มส่วนประกอบ
          </Button>
        </div>
        {editor.visibleGeneralError && (
          <p className={`mt-3 text-base ${ERROR_TEXT}`}>{editor.visibleGeneralError}</p>
        )}
      </div>

      <CombosSection editor={editor} images={images} onImagesChange={onImagesChange} />
    </div>
  );
}
