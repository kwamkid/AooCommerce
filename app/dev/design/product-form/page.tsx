// Path: app/dev/design/product-form/page.tsx
//
// ต้นแบบฟอร์มเพิ่ม/แก้ไขสินค้า — `ProductFormCard` + `VariantOptionsEditor` + `MarketplaceListingCard`
// ตัวเดียวกับที่จะใช้ในฟอร์มจริง (components/products/form/) · หมวด/แบรนด์/ชื่อตัวเลือก อ่านของบริษัทที่
// ล็อกอินอยู่จริง · รหัสถัดไปจาก /api/products/next-code · ตัวสินค้าและร้าน marketplace เป็นข้อมูลตัวอย่าง
// — **ไม่อัปรูป ไม่บันทึก ไม่ซิงค์** · เจ้าของขอลองก่อนเคาะ (12 ก.ย. 2026)
// เคาะแล้วฟอร์มจริงใช้ component ชุดนี้ — หน้านี้ห้ามมีโค้ดฟอร์มของตัวเอง
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import Tabs from '@/components/ui/Tabs';
import FormSelect from '@/components/ui/FormSelect';
import PlatformIcon from '@/components/ui/PlatformIcon';
import StickyActionBar from '@/components/ui/StickyActionBar';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE } from '@/components/ui/FilterChips';
import { type ProductImage } from '@/components/ui/ImageUploader';
import ProductFormCard from '@/components/products/form/ProductFormCard';
import VariantOptionsEditor from '@/components/products/form/VariantOptionsEditor';
import MarketplaceListingCard, {
  type ListingAttribute, type ListingModel,
} from '@/components/products/form/MarketplaceListingCard';
import type {
  BrandOption, CategoryOption, FieldErrors, OptionGroup, ProductFormValues, ProductType,
  VariantRow, VariationTypeOption,
} from '@/components/products/form/types';
import {
  activeGroupNames, regenerateRows, validateOptionGroups, validateVariantRows,
} from '@/lib/product-variants';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';

type Scenario = 'create' | 'simple' | 'variation';

const EMPTY: ProductFormValues = {
  code: '', name: '', description: '', image: '', category_id: '', brand_id: '',
  product_type: 'simple', is_active: true, selected_variation_types: [],
  variation_label: '-', sku: '', barcode: '', default_price: 0, discount_price: 0, cost_price: 0,
  variations: [],
};

/** Used only when the company has no variation type yet */
const MOCK_TYPES: VariationTypeOption[] = [
  { id: 'mock-color', name: 'สี', sort_order: 1, is_active: true },
  { id: 'mock-size', name: 'ขนาด', sort_order: 2, is_active: true },
];

const MOCK_VARIANTS = [
  { value: 'แดง', price: 199, available: 5 },
  { value: 'ดำ', price: 199, available: 0 },
  { value: 'ขาว', price: 219, available: 3 },
];

/** Shopee categories of the mock shop (the real tab uses ShopeeCategoryPicker) */
const MOCK_SHOPEE_CATEGORIES = [
  { id: 'food-fruit', label: 'อาหารและเครื่องดื่ม > ผลไม้สด' },
  { id: 'food-gift', label: 'อาหารและเครื่องดื่ม > กระเช้าของขวัญ' },
  { id: 'men-tshirt', label: 'เสื้อผ้าแฟชั่นผู้ชาย > เสื้อยืด' },
  { id: 'women-tshirt', label: 'เสื้อผ้าแฟชั่นผู้หญิง > เสื้อยืด' },
];

interface MockListing {
  name: string;
  description: string;
  category: string;
  weight: string;
  price: string;
  systemPrice: number;
  models?: ListingModel[];
  /** meta ที่ซิงค์มาจากร้าน (อ่านอย่างเดียว) — รูปแบบเดียวกับ shopee_attributes ของจริง */
  brandName?: string;
  attributes?: ListingAttribute[];
}

const SHOP = { name: 'ABC the Baby', itemId: '23456789012', url: 'https://shopee.co.th/product/123456/23456789012' };

function mockListing(s: Scenario): MockListing | null {
  if (s === 'simple') {
    return {
      name: 'กระเช้าผลไม้ a Greeting ของขวัญปีใหม่ ผลไม้สดคัดพิเศษ ส่งฟรีในกรุงเทพ',
      description: 'กระเช้าผลไม้สดคัดพิเศษ จัดใหม่ทุกวัน พร้อมการ์ดอวยพร เหมาะเป็นของขวัญปีใหม่และเยี่ยมไข้',
      category: 'food-gift',
      weight: '2.5',
      price: '1290',
      systemPrice: 1290,
      brandName: 'No Brand',
      attributes: [
        { id: 100073, name: 'ประเภทสินค้า', value: 'กระเช้าของขวัญ', mandatory: true },
        { id: 100135, name: 'วันหมดอายุ', value: '7 วันหลังจัดส่ง' },
        { id: 101350, name: 'TIS license website', value: 'https://appdb.tisi.go.th/Q/i.php?d=2095240074' },
      ],
    };
  }
  if (s === 'variation') {
    return {
      name: 'เสื้อยืดคอกลม cotton 100% ใส่สบาย ไม่ย้วย มี 3 สี',
      description: 'ผ้าคอตตอน 100% นุ่ม ระบายอากาศดี ซักแล้วไม่ย้วย',
      category: 'men-tshirt',
      weight: '0.3',
      price: '',
      systemPrice: 0,
      brandName: 'Hape',
      attributes: [
        { id: 100134, name: 'Material', value: 'Cotton', mandatory: true },
        { id: 100140, name: 'รูปแบบคอเสื้อ', value: 'คอกลม' },
        { id: 100141, name: 'ฤดูกาล', value: 'ทุกฤดู' },
        { id: 100099, name: 'Weight', value: '0.3 kg' },
      ],
      models: MOCK_VARIANTS.map((m, i) => ({
        id: `mock-${i + 1}`,
        label: m.value,
        sku: `TS-001-${i + 1}`,
        platformPrice: String(m.price + 20),
        systemPrice: m.price,
      })),
    };
  }
  return null;
}

/** New generated row — copies the sibling's prices (same values in the other groups) */
const newRow = (attributes: Record<string, string>, template?: VariantRow): VariantRow => ({
  _tempId: crypto.randomUUID(),
  variation_label: '',
  sku: '',
  barcode: '',
  attributes,
  default_price: template?.default_price ?? 0,
  discount_price: template?.discount_price ?? 0,
  cost_price: template?.cost_price ?? 0,
  is_active: true,
});

const PROTOTYPE_TOAST = 'หน้าลอง — ยังไม่บันทึกจริง';

export default function ProductFormPlaygroundPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const canViewCost = userProfile?.canViewCost === true;
  const { features } = useFeatures();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  const [scenario, setScenario] = useState<Scenario>('create');
  const [tab, setTab] = useState<'info' | 'shop'>('info');
  const [values, setValues] = useState<ProductFormValues>(EMPTY);
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [variantImages, setVariantImages] = useState<Record<string, ProductImage[]>>({});
  const [simpleStock, setSimpleStock] = useState<number | null>(null);
  const [listing, setListing] = useState<MockListing | null>(null);
  const [listingDirty, setListingDirty] = useState(false);

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [variationTypes, setVariationTypes] = useState<VariationTypeOption[]>(MOCK_TYPES);
  const [nextCode, setNextCode] = useState<string | null>(null);

  // Real master data of the logged-in company (read only)
  useEffect(() => {
    if (!userProfile) return;
    let cancelled = false;
    (async () => {
      const [options, code] = await Promise.allSettled([
        apiFetch('/api/products/form-options').then(r => (r.ok ? r.json() : null)),
        apiFetch('/api/products/next-code').then(r => (r.ok ? r.json() : null)),
      ]);
      if (cancelled) return;
      if (options.status === 'fulfilled' && options.value) {
        setCategories(options.value.categories || []);
        setBrands(options.value.brands || []);
        const types: VariationTypeOption[] = options.value.variation_types || [];
        if (types.length > 0) setVariationTypes(types);
      }
      if (code.status === 'fulfilled' && code.value?.code) setNextCode(code.value.code);
    })();
    return () => { cancelled = true; };
  }, [userProfile]);

  const loadScenario = (s: Scenario) => {
    setScenario(s);
    setTab('info');
    setErrors({});
    setGroupsError(null);
    setProductImages([]);
    setVariantImages({});
    setListing(mockListing(s));
    setListingDirty(false);
    if (s === 'create') {
      setValues(EMPTY);
      setGroups([]);
      setRows([]);
      setSimpleStock(null);
      return;
    }
    if (s === 'simple') {
      setValues({
        ...EMPTY, name: 'a Greeting', code: 'AF-006', sku: 'AF-006',
        default_price: 1590, discount_price: 1290, cost_price: 800,
      });
      setGroups([]);
      setRows([]);
      setSimpleStock(12);
      return;
    }
    const color = variationTypes.find(t => t.name === 'สี') ?? variationTypes[0] ?? MOCK_TYPES[0];
    setValues({
      ...EMPTY, name: 'เสื้อยืดคอกลม', code: 'TS-001', product_type: 'variation',
      variation_label: '', selected_variation_types: [color.id],
    });
    setGroups([{ typeId: color.id, name: color.name, values: MOCK_VARIANTS.map(m => m.value) }]);
    setRows(MOCK_VARIANTS.map((m, i) => ({
      id: `mock-${i + 1}`,
      _tempId: `mock-${i + 1}`,
      variation_label: m.value,
      sku: `TS-001-${i + 1}`,
      barcode: '',
      attributes: { [color.name]: m.value },
      default_price: m.price,
      discount_price: 0,
      cost_price: 0,
      is_active: true,
      available: m.available,
    })));
    setSimpleStock(null);
  };

  /** Patch values + clear the errors of the fields that changed */
  const patchValues = (patch: Partial<ProductFormValues>) => {
    setValues(v => ({ ...v, ...patch }));
    setErrors(prev => {
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k];
      if ('default_price' in patch) delete next.discount_price;
      return next;
    });
  };

  const patchListing = (patch: Partial<MockListing>) => {
    setListing(l => (l ? { ...l, ...patch } : l));
    setListingDirty(true);
  };

  const changeType = async (type: ProductType) => {
    if (type === values.product_type) return;
    if (scenario !== 'create') {
      const ok = await confirm({
        title: 'เปลี่ยนประเภทสินค้า?',
        description: type === 'simple'
          ? 'ตัวเลือกทั้งหมดจะถูกลบเมื่อกดบันทึก — ประวัติออเดอร์และสต็อกเดิมยังอยู่ครบ'
          : 'ราคาแบบสินค้าปกติจะถูกแทนด้วยตารางตัวเลือกเมื่อกดบันทึก — ประวัติออเดอร์และสต็อกเดิมยังอยู่ครบ',
        variant: 'danger',
        confirmLabel: 'เปลี่ยนประเภท',
        cancelLabel: 'ยกเลิก',
      });
      if (!ok) return;
    }
    setValues(v => ({ ...v, product_type: type }));
    if (type === 'variation' && groups.length === 0) setGroups([{ typeId: '', name: '', values: [] }]);
    setErrors({});
  };

  const changeGroups = async (next: OptionGroup[]) => {
    const result = regenerateRows(groups, next, rows, newRow);
    if (result.error) {
      setGroupsError(result.error);
      return;
    }
    const savedDropped = result.dropped.filter(r => r.id);
    if (savedDropped.length > 0) {
      const ok = await confirm({
        title: `ลบตัวเลือก ${savedDropped.length} แบบ?`,
        description: `${savedDropped.map(r => r.variation_label).join(', ')} จะถูกลบเมื่อกดบันทึก — ถ้าแค่หยุดขายชั่วคราว ให้ปิด "เปิดขาย" ของแถวนั้นแทน`,
        variant: 'danger',
        confirmLabel: 'ลบ',
        cancelLabel: 'ยกเลิก',
      });
      if (!ok) return;
    }
    setGroupsError(null);
    setGroups(next);
    setRows(result.rows);
    setValues(v => ({ ...v, selected_variation_types: next.map(g => g.typeId).filter(Boolean) }));
    setErrors(prev => Object.fromEntries(
      Object.entries(prev).filter(([k]) => !k.startsWith('group.') && !k.startsWith('variation')),
    ));
  };

  const changeRows = (next: VariantRow[]) => {
    setRows(next);
    setErrors(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith('variation.'))));
  };

  const validate = (requireCode: boolean): boolean => {
    const e: FieldErrors = {};
    if (!values.name.trim()) e.name = 'กรุณากรอกชื่อสินค้า';
    if (requireCode && !values.code.trim()) e.code = 'กรุณากรอกรหัสสินค้า';
    if (values.product_type === 'simple') {
      if (!(values.default_price > 0)) e.default_price = 'ราคาต้องมากกว่า 0';
      if (values.discount_price > 0 && values.discount_price >= values.default_price) {
        e.discount_price = 'ราคาลดเหลือต้องน้อยกว่าราคาปกติ';
      }
    } else if (values.product_type === 'variation') {
      Object.assign(e, validateOptionGroups(groups), validateVariantRows(rows, activeGroupNames(groups)));
    }
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      // desktop table and mobile cards both carry data-field — scroll to the one that is visible
      const target = [...document.querySelectorAll<HTMLElement>(`[data-field="${first}"]`)]
        .find(el => el.offsetParent !== null);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return !first;
  };

  const save = () => {
    if (!validate(scenario !== 'create')) return;
    showToast(PROTOTYPE_TOAST);
  };

  const saveAndAddAnother = () => {
    if (!validate(false)) return;
    showToast(`${PROTOTYPE_TOAST} · เริ่มสินค้าใหม่ได้เลย`);
    loadScenario('create');
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('[data-field="name"] input')?.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
  };

  const quickAdd = () => showToast('หน้าลอง — ปุ่ม + ใช้ได้จริงในฟอร์มจริง');

  const mode = scenario === 'create' ? 'create' : 'edit';
  const showShopTab = mode === 'edit' && !!listing;

  return (
    <Layout>
      <Container size="4xl" gap="sm">
        <PageHeader title="ต้นแบบฟอร์มสินค้า" subtitle="ลองหน้าตาได้ ไม่บันทึกจริง" backHref="/dev/design" />

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-base text-gray-600 dark:text-slate-400">ลองเป็น</span>
          <FilterChips<Scenario>
            variant="segmented"
            value={scenario}
            onChange={loadScenario}
            chips={[
              { id: 'create', label: 'เพิ่มใหม่', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
              { id: 'simple', label: 'แก้ไข: สินค้าปกติ', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
              { id: 'variation', label: 'แก้ไข: มีตัวเลือก', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
            ]}
          />
        </div>

        {showShopTab && (
          <Tabs
            className="mb-0"
            activeKey={tab}
            onSelect={key => setTab(key as 'info' | 'shop')}
            tabs={[
              { key: 'info', label: 'ข้อมูลสินค้า', icon: <Package2 className="w-4 h-4" /> },
              { key: 'shop', label: SHOP.name, icon: <PlatformIcon id="shopee" size={16} /> },
            ]}
          />
        )}

        {tab === 'shop' && listing ? (
          <MarketplaceListingCard
            platform="shopee"
            shopName={SHOP.name}
            itemId={SHOP.itemId}
            productUrl={SHOP.url}
            lastSyncedText="วันนี้ 09:42"
            onChangeImage={() => showToast('หน้าลอง — เปลี่ยนรูปหลักของร้านได้จริงในหน้าจริง')}
            name={listing.name}
            onNameChange={v => patchListing({ name: v })}
            description={listing.description}
            onDescriptionChange={v => patchListing({ description: v })}
            categorySlot={
              // ของจริงคือ ShopeeCategoryPicker (ไล่ทีละชั้น + ค้นข้ามทุกชั้นเมื่อพิมพ์ ≥ 2 ตัว)
              // ตัวอย่างนี้บังคับให้มีช่องค้นหาเสมอ (searchThreshold=0) ไม่งั้นตัวเลือก 4 อันจะไม่ขึ้นช่องค้น
              <FormSelect
                value={listing.category}
                onChange={v => patchListing({ category: v })}
                options={MOCK_SHOPEE_CATEGORIES}
                placeholder="เลือกหมวดหมู่ Shopee"
                searchPlaceholder="ค้นหาหมวดหมู่ Shopee..."
                searchThreshold={0}
              />
            }
            weight={listing.weight}
            onWeightChange={v => patchListing({ weight: v })}
            price={listing.price}
            onPriceChange={v => patchListing({ price: v })}
            systemPrice={listing.systemPrice}
            brandName={listing.brandName}
            attributes={listing.attributes}
            models={listing.models}
            onModelPriceChange={(id, v) => patchListing({
              models: listing.models?.map(m => (m.id === id ? { ...m, platformPrice: v } : m)),
            })}
            onSync={() => showToast('หน้าลอง — ซิงค์ได้จริงในหน้าจริง')}
            onUnlink={() => showToast('หน้าลอง — ยกเลิกการเชื่อมได้จริงในหน้าจริง')}
            dirty={listingDirty}
            onSave={() => { setListingDirty(false); showToast(PROTOTYPE_TOAST); }}
            onCancel={() => { setListing(mockListing(scenario)); setListingDirty(false); }}
          />
        ) : (
          <>
            <ProductFormCard
              values={values}
              onChange={patchValues}
              mode={mode}
              errors={errors}
              productImages={productImages}
              onProductImagesChange={setProductImages}
              categories={categories}
              brands={brands}
              onAddCategory={quickAdd}
              onAddBrand={quickAdd}
              onTypeChange={changeType}
              typeDisabled={mode === 'edit' ? { composite: 'สินค้าที่บันทึกแล้วเปลี่ยนเป็นสินค้าชุดไม่ได้' } : undefined}
              canViewCost={canViewCost}
              features={{ product_brand: !!features.product_brand, supplier: !!features.supplier, stock: !!features.stock }}
              codePlaceholder={nextCode ? `เว้นว่าง = ตั้งให้ (${nextCode})` : undefined}
              simpleStock={simpleStock}
              variantsSlot={
                <VariantOptionsEditor
                  groups={groups}
                  onGroupsChange={changeGroups}
                  rows={rows}
                  onRowsChange={changeRows}
                  variationTypes={variationTypes}
                  onAddVariationType={quickAdd}
                  images={variantImages}
                  onImagesChange={(key, imgs) => setVariantImages(prev => ({ ...prev, [key]: imgs }))}
                  errors={errors}
                  canViewCost={canViewCost}
                  showStock={mode === 'edit' && !!features.stock}
                  groupsError={groupsError}
                />
              }
              compositeNote={
                <Alert tone="info">
                  สินค้าชุด: ตั้งส่วนประกอบในกล่องถัดลงไปของฟอร์มจริง (ใช้ตัวแก้ไขสินค้าชุดเดิม — ไม่ได้อยู่ในหน้าลองนี้)
                </Alert>
              }
            />

            <StickyActionBar
              onSave={save}
              onCancel={() => router.push('/dev/design')}
              extraActions={mode === 'create'
                ? <Button variant="secondary" onClick={saveAndAddAnother}>บันทึกแล้วเพิ่มต่อ</Button>
                : undefined}
            />
          </>
        )}
      </Container>
      {confirmDialog}
    </Layout>
  );
}
