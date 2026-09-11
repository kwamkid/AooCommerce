// Path: components/products/form/ProductFormCard.tsx
//
// ฟอร์มสินค้าแบบ "การ์ดเดียวจบ" (เจ้าของเลือก 12 ก.ย. 2026) — เรียงตามลำดับที่กรอกจริง:
// สถานะ · ประเภท → รูป (แถบแนวนอน) → ชื่อ + รหัส → หมวด + แบรนด์ →
// ราคา · SKU · บาร์โค้ด · พร้อมขาย (แถวเดียว) หรือตารางตัวเลือก → คำอธิบาย
// สินค้า 98% เป็นสินค้าปกติ จึงออกแบบให้สินค้าปกติจบในจอเดียว
//
// กติกาเลย์เอาต์ (เจ้าของท้วง 12 ก.ย. 2026 สองรอบ):
//  • รูปเป็นแถบแนวนอนเต็มความกว้าง — วางเป็นคอลัมน์ซ้ายแล้วอัปหลายรูป กล่องจะสูงจนข้างขวาโล่ง
//  • **ทุกแถวกว้างเต็มฟอร์ม** — ช่องกว้างคงที่ทำให้เหลือที่ว่างข้างขวาเป็นแถบใหญ่
//  • แต่ละแถวใส่ช่องให้พอดีแล้วแบ่งสัดส่วนกัน (ชื่อ 2 : รหัส 1 · ตัวเลข 6 ช่องแถวเดียว)
//    ช่องที่ซ่อนตามสิทธิ์ (ต้นทุน) หรือตามโหมด (พร้อมขาย) หายไป ช่องที่เหลือยืดเติมเอง
//  • ชื่อสินค้ายึดเพดาน Shopee (120 ตัว · ขึ้น Shopee ได้ต้อง ≥ 20 ตัว)
//
// วาดอย่างเดียว — state/validate/บันทึกอยู่ที่ parent (ฟอร์มจริง หรือหน้าลอง /dev/design/product-form)
// สินค้ามีตัวเลือก: parent ส่ง VariantOptionsEditor มาทาง `variantsSlot`
'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { BoxSelect, Boxes, Layers, Plus } from 'lucide-react';
import Card from '@/components/ui/Card';
import FormInput from '@/components/ui/FormInput';
import FormSelect from '@/components/ui/FormSelect';
import FormTextarea from '@/components/ui/FormTextarea';
import NumberInput from '@/components/ui/NumberInput';
import Toggle from '@/components/ui/Toggle';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE } from '@/components/ui/FilterChips';
import ImageUploader, { type ProductImage } from '@/components/ui/ImageUploader';
import ProductCodesHelp from './ProductCodesHelp';
import { FieldError, PRODUCT_NAME_MAX, SHOPEE_NAME_MIN, StockText, numberInputClass } from './parts';
import type {
  BrandOption, CategoryOption, FieldErrors, ProductFormFeatures, ProductFormValues, ProductType,
} from './types';

const TYPE_META: Record<ProductType, { label: string; icon: ReactNode; tooltip: string }> = {
  simple: {
    label: 'สินค้าปกติ',
    icon: <BoxSelect className="w-4 h-4" />,
    tooltip: 'สินค้าแบบเดียว ราคาเดียว',
  },
  variation: {
    label: 'มีตัวเลือก',
    icon: <Layers className="w-4 h-4" />,
    tooltip: 'มีหลายแบบ เช่น สี ขนาด — แต่ละแบบตั้งราคาและ SKU ได้',
  },
  composite: {
    label: 'สินค้าชุด',
    icon: <Boxes className="w-4 h-4" />,
    tooltip: 'ขายหลายชิ้นเป็นชุด ลูกค้าเลือกตัวเลือกของแต่ละชิ้น ตัดสต็อกที่ชิ้นส่วน',
  },
};
const TYPES: ProductType[] = ['simple', 'variation', 'composite'];

/** แถว 3 ส่วน (ชื่อกิน 2) · แถวครึ่ง-ครึ่ง · แถวช่องเล็กที่ยืดแบ่งกันเต็มความกว้าง */
const ROW_3 = 'grid gap-4 grid-cols-1 md:grid-cols-3';
const ROW_2 = 'grid gap-4 grid-cols-1 sm:grid-cols-2';
const ROW_AUTO = 'grid gap-4 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]';

const Required = () => <span className="text-red-500"> *</span>;
const Divider = () => <div className="border-t border-gray-100 dark:border-slate-700" />;

/** Field label with an optional "?" that opens the รหัสสินค้า / SKU / บาร์โค้ด guide */
function FieldLabel({ children, required, help }: {
  children: ReactNode;
  required?: boolean;
  help?: 'code' | 'sku' | 'barcode';
}) {
  return (
    <div className="field-label flex items-center gap-1">
      <span>{children}{required && <Required />}</span>
      {help && <ProductCodesHelp focus={help} />}
    </div>
  );
}

function PriceField({ label, required, value, onChange, error, field, hint }: {
  label: string;
  required?: boolean;
  value: number;
  onChange: (n: number) => void;
  error?: string;
  field: string;
  hint?: string;
}) {
  return (
    <div data-field={field}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <NumberInput value={value} onChange={onChange} min={0} placeholder="0" aria-label={label} className={numberInputClass(!!error)} />
      {hint && !error && <p className="helper-text mt-1">{hint}</p>}
      <FieldError text={error} />
    </div>
  );
}

/** FormSelect + ปุ่ม + (เพิ่มค่าใหม่) — หมวดหมู่ / แบรนด์ */
function PickerField({ label, value, onChange, options, onAdd, addLabel, searchPlaceholder, helper }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string; level?: number; triggerLabel?: string }[];
  onAdd: () => void;
  addLabel: string;
  searchPlaceholder: string;
  helper?: ReactNode;
}) {
  // ปุ่มเพิ่มค่าใหม่อยู่บรรทัดป้ายชิดขวา — ปุ่มสี่เหลี่ยมข้างช่องเลือกดูไม่เข้าชุดกัน
  // และกินความกว้างของช่อง (เจ้าของท้วง 12 ก.ย. 2026)
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>{label}</FieldLabel>
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          className="field-label flex items-center gap-1 text-primary hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          เพิ่มใหม่
        </button>
      </div>
      <FormSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder="ไม่ระบุ"
        clearLabel="ไม่ระบุ"
        searchPlaceholder={searchPlaceholder}
      />
      {helper}
    </div>
  );
}

export interface ProductFormCardProps {
  values: ProductFormValues;
  onChange: (patch: Partial<ProductFormValues>) => void;
  mode: 'create' | 'edit';
  errors: FieldErrors;
  productImages: ProductImage[];
  onProductImagesChange: (imgs: ProductImage[]) => void;
  categories: CategoryOption[];
  brands: BrandOption[];
  onAddCategory: () => void;
  onAddBrand: () => void;
  /** parent decides (edit mode asks to confirm first) */
  onTypeChange: (type: ProductType) => void;
  /** type → reason it can't be picked (shown as the chip tooltip) */
  typeDisabled?: Partial<Record<ProductType, string>>;
  canViewCost: boolean;
  features: ProductFormFeatures;
  /** create mode: e.g. "เว้นว่าง = ตั้งให้ (P5192)" */
  codePlaceholder?: string;
  /** edit mode · simple product: Σ sellable stock (null/undefined = unknown → hidden) */
  simpleStock?: number | null;
  /** variation type: VariantOptionsEditor */
  variantsSlot?: ReactNode;
  /** composite type: note shown in place of prices (the editor itself sits below the card) */
  compositeNote?: ReactNode;
}

export default function ProductFormCard({
  values, onChange, mode, errors, productImages, onProductImagesChange, categories, brands,
  onAddCategory, onAddBrand, onTypeChange, typeDisabled, canViewCost, features, codePlaceholder,
  simpleStock, variantsSlot, compositeNote,
}: ProductFormCardProps) {
  // Flatten the category tree (child rows show "แม่ > ลูก" once picked) — same as the old form
  const categoryOptions = useMemo(() => categories.flatMap(parent =>
    parent.children && parent.children.length > 0
      ? [
          { id: parent.id, label: parent.name },
          ...parent.children.map(child => ({
            id: child.id,
            label: child.name,
            level: 1,
            triggerLabel: `${parent.name} > ${child.name}`,
          })),
        ]
      : [{ id: parent.id, label: parent.name }],
  ), [categories]);
  const brandOptions = useMemo(() => brands.map(b => ({ id: b.id, label: b.name })), [brands]);
  const selectedBrand = brands.find(b => b.id === values.brand_id);

  const nameLength = values.name.length;
  const nameTooShortForShopee = nameLength > 0 && nameLength < SHOPEE_NAME_MIN;
  const showStock = mode === 'edit' && features.stock && simpleStock != null;

  return (
    <Card>
      <div className="space-y-5">
        {/* ── header: title + status ── */}
        <div className="flex items-center justify-between gap-3">
          <h3 className="heading-3">ข้อมูลสินค้า</h3>
          <div className="flex items-center gap-2">
            <span className={`text-base ${values.is_active ? 'text-gray-700 dark:text-slate-200' : 'text-gray-400 dark:text-slate-500'}`}>
              {values.is_active ? 'ขายอยู่' : 'ปิดขาย'}
            </span>
            <Toggle
              checked={values.is_active}
              onChange={v => onChange({ is_active: v })}
              aria-label={values.is_active ? 'ปิดขายสินค้านี้' : 'เปิดขายสินค้านี้'}
            />
          </div>
        </div>

        {/* ── type ── */}
        <div>
          <div className="field-label">ประเภทสินค้า</div>
          <FilterChips
            variant="segmented"
            size="md"
            value={values.product_type}
            onChange={onTypeChange}
            chips={TYPES.map(t => ({
              id: t,
              label: TYPE_META[t].label,
              icon: TYPE_META[t].icon,
              activeClass: FILTER_CHIP_PRIMARY_ACTIVE,
              disabled: !!typeDisabled?.[t],
              tooltip: typeDisabled?.[t] || TYPE_META[t].tooltip,
            }))}
          />
        </div>

        {/* ── images: one horizontal strip (wraps) ── */}
        <div>
          <FieldLabel>รูปสินค้า</FieldLabel>
          <ImageUploader images={productImages} onImagesChange={onProductImagesChange} maxImages={10} />
        </div>

        {/* ── name + code ── */}
        <div className={ROW_3}>
          <div className="md:col-span-2" data-field="name">
            <FieldLabel required>ชื่อสินค้า</FieldLabel>
            <FormInput
              value={values.name}
              onChange={e => onChange({ name: e.target.value.slice(0, PRODUCT_NAME_MAX) })}
              maxLength={PRODUCT_NAME_MAX}
              error={errors.name}
              aria-label="ชื่อสินค้า"
              placeholder="เช่น กระเช้าผลไม้ Greeting"
              postfix={
                <span className={`text-sm tabular-nums ${nameTooShortForShopee ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-slate-500'}`}>
                  {nameLength}/{PRODUCT_NAME_MAX}
                </span>
              }
              hint={nameTooShortForShopee ? `ถ้าจะส่งขึ้น Shopee ต้องมีอย่างน้อย ${SHOPEE_NAME_MIN} ตัวอักษร` : undefined}
            />
          </div>
          <div data-field="code">
            <FieldLabel required={mode === 'edit'} help="code">รหัสสินค้า</FieldLabel>
            <FormInput
              value={values.code}
              onChange={e => onChange({ code: e.target.value })}
              error={errors.code}
              aria-label="รหัสสินค้า"
              placeholder={mode === 'create' ? (codePlaceholder || 'เว้นว่าง = ตั้งให้') : undefined}
            />
          </div>
        </div>

        {/* ── category + brand ── */}
        <div className={ROW_2}>
          <PickerField
            label="หมวดหมู่"
            value={values.category_id || ''}
            onChange={v => onChange({ category_id: v })}
            options={categoryOptions}
            onAdd={onAddCategory}
            addLabel="เพิ่มหมวดหมู่ใหม่"
            searchPlaceholder="ค้นหาหมวดหมู่..."
          />
          {features.product_brand && (
            <PickerField
              label="แบรนด์"
              value={values.brand_id || ''}
              onChange={v => onChange({ brand_id: v })}
              options={brandOptions}
              onAdd={onAddBrand}
              addLabel="เพิ่มแบรนด์ใหม่"
              searchPlaceholder="ค้นหาแบรนด์..."
              helper={features.supplier && selectedBrand?.supplier
                ? <p className="helper-text mt-1">Supplier: {selectedBrand.supplier.name}</p>
                : undefined}
            />
          )}
        </div>

        {/* ── price + codes + stock (แถวเดียว ยืดแบ่งกันเต็มความกว้าง) ── */}
        {values.product_type === 'simple' && (
          <>
            <Divider />
            <div className={ROW_AUTO}>
              <PriceField
                field="default_price"
                label="ราคาปกติ (฿)"
                required
                value={values.default_price}
                onChange={n => onChange({ default_price: n })}
                error={errors.default_price}
              />
              <PriceField
                field="discount_price"
                label="ราคาขาย (฿)"
                value={values.discount_price}
                onChange={n => onChange({ discount_price: n })}
                error={errors.discount_price}
                hint="ว่าง = ขายราคาปกติ"
              />
              {canViewCost && (
                <PriceField
                  field="cost_price"
                  label="ต้นทุน (฿)"
                  value={values.cost_price}
                  onChange={n => onChange({ cost_price: n })}
                />
              )}
              <div data-field="sku">
                <FieldLabel help="sku">SKU</FieldLabel>
                <FormInput value={values.sku} onChange={e => onChange({ sku: e.target.value })} error={errors.sku} aria-label="SKU" />
              </div>
              <div data-field="barcode">
                <FieldLabel help="barcode">บาร์โค้ด</FieldLabel>
                <FormInput value={values.barcode} onChange={e => onChange({ barcode: e.target.value })} error={errors.barcode} aria-label="บาร์โค้ด" />
              </div>
              {showStock && (
                <div>
                  <FieldLabel>พร้อมขาย</FieldLabel>
                  <div className="h-[42px] flex items-center gap-2 text-base">
                    <StockText available={simpleStock} />
                    {simpleStock! > 0 && <span className="text-gray-600 dark:text-slate-400">ชิ้น</span>}
                    <Link href="/inventory" className="ml-auto text-sm text-primary hover:underline">ปรับสต็อก</Link>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {values.product_type === 'variation' && (
          <>
            <Divider />
            <div>
              <h3 className="heading-3 mb-3">ตัวเลือกสินค้า</h3>
              {variantsSlot}
            </div>
          </>
        )}

        {values.product_type === 'composite' && compositeNote && (
          <>
            <Divider />
            {compositeNote}
          </>
        )}

        {/* ── description ── */}
        <Divider />
        <FormTextarea
          label="คำอธิบาย"
          rows={3}
          value={values.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="รายละเอียดสินค้า (ไม่บังคับ)"
        />
      </div>
    </Card>
  );
}
