'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import FormSelect from '@/components/ui/FormSelect';
import { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import ImageUploader, { type ProductImage } from '@/components/ui/ImageUploader';
import DiscountInput, { type DiscountType } from '@/components/ui/DiscountInput';
import DateRangePicker, { type DateValueType } from '@/components/ui/DateRangePicker';
import ItemsTable, { type TableItem, type ColumnKey } from '@/components/ui/ItemsTable';
import {
  ArrowLeft,
  Save,
  Plus,
  Package,
  Gift,
  Tag,
  Percent,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  Send,
} from 'lucide-react';
import PushDealModal from './PushDealModal';

// ─── Types ──────────────────────────────────────────

interface MarketplaceAccount {
  id: string;
  shop_name: string;
  platform: string;
  is_active: boolean;
}

interface PlatformPrice {
  account_id: string;
  bundle_price: string;
  is_enabled: boolean;
}

interface ShopeeDeal {
  id: string;
  account_id: string;
  deal_type: string;
  external_deal_id: number;
  status: string;
  start_time: string | null;
  end_time: string | null;
  updated_at: string;
}

interface PromotionItemForm {
  key: string;
  variation_id: string;
  product_id: string;
  role: 'main' | 'component' | 'gift' | 'discounted';
  quantity: number;
  special_price: number | null;
  sort_order: number;
  product_name: string;
  product_code: string;
  variation_label: string;
  sku: string;
  default_price: number;
  image: string;
  /** Number of variations (for product-level bundle items) */
  variation_count?: number;
}

interface TierForm {
  key: string;
  min_qty: number;
  discount_type: 'percent' | 'fixed_price' | 'fixed_discount';
  discount_value: number;
}

interface FormState {
  name: string;
  promotion_type: 'bundle_set' | 'buy_get_free' | 'buy_get_discount' | 'qty_discount';
  is_active: boolean;
  dateRange: DateValueType;
  description: string;
  bundle_price: string;
  discount_type: 'percent' | 'fixed_discount';
  discount_value: string;
  purchase_min_spend: string;
  per_gift_num: string;
  purchase_limit: string;
  items: PromotionItemForm[];
  tiers: TierForm[];
}

// ─── Constants ──────────────────────────────────────────

const TYPE_OPTIONS = [
  { id: 'bundle_set', label: 'เซ็ตรวม', icon: <Package className="w-7 h-7" />, desc: 'รวมหลายสินค้าเป็น 1 เซ็ต ตั้งส่วนลด % หรือ บาท เช่น ลด 10% หรือ ลด 50 บาท' },
  { id: 'buy_get_free', label: 'ซื้อ X แถม Y ฟรี', icon: <Gift className="w-7 h-7" />, desc: 'ซื้อสินค้าหลัก แถมของแถมฟรี เช่น ซื้อครีม แถมสบู่' },
  { id: 'buy_get_discount', label: 'ซื้อ X ได้ Y ราคาพิเศษ', icon: <Tag className="w-7 h-7" />, desc: 'ซื้อสินค้าหลัก ได้สินค้าเสริมราคาพิเศษ เช่น ซื้อมือถือ ได้เคสราคา 99 บาท' },
  { id: 'qty_discount', label: 'ซื้อเยอะลดเยอะ', icon: <Percent className="w-7 h-7" />, desc: 'ซื้อจำนวนมากยิ่งลดมาก เช่น 2 ชิ้นลด 10%, 3 ชิ้นลด 20%' },
];

const DISCOUNT_TYPE_OPTIONS = [
  { id: 'percent', label: 'ลด %' },
  { id: 'fixed_discount', label: 'ลดราคา (บาท)' },
  { id: 'fixed_price', label: 'ราคาเหลือ (บาท)' },
];

const ROLE_LABELS: Record<string, string> = {
  main: 'สินค้าหลัก',
  component: 'สินค้าในเซ็ต',
  gift: 'ของแถม (ฟรี)',
  discounted: 'ราคาพิเศษ',
};

const ROLE_COLORS: Record<string, string> = {
  main: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  component: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  gift: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  discounted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

let keyCounter = 0;
function nextKey() { return `k_${++keyCounter}`; }

// ─── Component ──────────────────────────────────────────

export default function PromotionForm({ promotionId }: { promotionId?: string }) {
  const router = useRouter();
  const isEdit = !!promotionId;

  const [form, setForm] = useState<FormState>(() => {
    // Default date range: today → +2 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const plus2 = new Date(today);
    plus2.setDate(plus2.getDate() + 2);
    const toISO = (d: Date) => d.toISOString().split('T')[0];
    return {
      name: '',
      promotion_type: 'bundle_set',
      is_active: true,
      dateRange: { startDate: toISO(today), endDate: toISO(plus2) },
      description: '',
      bundle_price: '',
      discount_type: 'percent',
      discount_value: '',
      purchase_min_spend: '',
      per_gift_num: '1',
      purchase_limit: '',
      items: [],
      tiers: [],
    };
  });

  const [promotionImages, setPromotionImages] = useState<ProductImage[]>([]);
  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingPromo, setLoadingPromo] = useState(isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [marketplaceAccounts, setMarketplaceAccounts] = useState<MarketplaceAccount[]>([]);
  const [platformPrices, setPlatformPrices] = useState<PlatformPrice[]>([]);
  const [activePlatformTab, setActivePlatformTab] = useState('');
  // showPlatformPricing removed — section always visible now
  const [shopeeDeals, setShopeeDeals] = useState<ShopeeDeal[]>([]);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const [syncingShopee, setSyncingShopee] = useState(false);
  const [syncResults, setSyncResults] = useState<{ shop_name: string; success: boolean; error?: string; details?: string[] }[] | null>(null);
  const [savedPromotionId, setSavedPromotionId] = useState<string | null>(null);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [initialFormSnapshot, setInitialFormSnapshot] = useState<string>('');
  const [showPushModal, setShowPushModal] = useState(false);
  const [showPushConfirm, setShowPushConfirm] = useState(false);

  // Fetch marketplace accounts (all platforms)
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await apiFetch('/api/promotions/marketplace-accounts');
        if (res.ok) {
          const data = await res.json();
          const accounts: MarketplaceAccount[] = (data.accounts || []);
          setMarketplaceAccounts(accounts);
          // Set first platform tab
          if (accounts.length > 0) {
            const platforms = [...new Set(accounts.map(a => a.platform))];
            setActivePlatformTab(platforms[0]);
          }
          // Initialize platform prices for accounts that don't have one yet (default: disabled)
          setPlatformPrices(prev => {
            const existing = new Set(prev.map(p => p.account_id));
            const newPrices = accounts
              .filter(a => !existing.has(a.id))
              .map(a => ({ account_id: a.id, bundle_price: '', is_enabled: false }));
            return [...prev, ...newPrices];
          });
        }
      } catch {
        // silent
      }
    };
    fetchAccounts();
  }, []);

  // Fetch products for search
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await apiFetch('/api/products?limit=9999');
        const data = await res.json();
        const flat: ProductSearchItem[] = [];
        for (const p of data.products || []) {
          for (const v of p.variations || []) {
            flat.push({
              id: v.variation_id,
              product_id: p.product_id,
              code: p.code,
              name: p.name,
              image: v.image_url || p.main_image_url || p.image || null,
              variation_label: v.variation_label,
              sku: v.sku,
              barcode: v.barcode,
              default_price: v.default_price || 0,
            });
          }
        }
        setProducts(flat);
      } catch {
        // ignore
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();
  }, []);

  // Fetch existing promotion for edit
  useEffect(() => {
    if (!promotionId) return;
    const fetchPromo = async () => {
      try {
        const res = await apiFetch(`/api/promotions/${promotionId}`);
        const data = await res.json();
        setForm({
          name: data.name || '',
          promotion_type: data.promotion_type || 'bundle_set',
          is_active: data.status === 'active',
          dateRange: (data.start_date || data.end_date) ? {
            startDate: data.start_date || null,
            endDate: data.end_date || null,
          } : null,
          description: data.description || '',
          bundle_price: data.bundle_price != null ? String(data.bundle_price) : '',
          discount_type: data.discount_type || 'percent',
          discount_value: data.discount_value != null ? String(data.discount_value) : '',
          purchase_min_spend: data.purchase_min_spend != null ? String(data.purchase_min_spend) : '',
          per_gift_num: data.per_gift_num != null ? String(data.per_gift_num) : '1',
          purchase_limit: data.purchase_limit != null ? String(data.purchase_limit) : '',
          items: (data.items || []).map((item: Record<string, unknown>, idx: number) => ({
            key: nextKey(),
            variation_id: item.variation_id as string,
            product_id: (item.product_id as string) || '',
            role: item.role as string,
            quantity: (item.quantity as number) || 1,
            special_price: item.special_price as number | null,
            sort_order: idx,
            product_name: item.product_name as string || '',
            product_code: item.product_code as string || '',
            variation_label: item.variation_label as string || '',
            sku: item.sku as string || '',
            default_price: (item.default_price as number) || 0,
            image: item.image as string || '',
          })),
          tiers: (data.tiers || []).map((tier: Record<string, unknown>) => ({
            key: nextKey(),
            min_qty: (tier.min_qty as number) || 2,
            discount_type: tier.discount_type as string || 'percent',
            discount_value: (tier.discount_value as number) || 0,
          })),
        });
        // Load images if available
        if (data.image) {
          setPromotionImages([{ image_url: data.image, sort_order: 0 }]);
        }
        // Load platform prices
        if (data.platforms && Array.isArray(data.platforms) && data.platforms.length > 0) {
          setPlatformPrices(data.platforms.map((p: { account_id: string; bundle_price: number | null; is_enabled: boolean }) => ({
            account_id: p.account_id,
            bundle_price: p.bundle_price != null ? String(p.bundle_price) : '',
            is_enabled: p.is_enabled !== false,
          })));
          // Platform section always visible now
        }
        // Load shopee deals
        if (data.shopee_deals && Array.isArray(data.shopee_deals)) {
          setShopeeDeals(data.shopee_deals);
        }
        // Snapshot for change detection
        const snapshot = JSON.stringify({
          name: data.name, bundle_price: data.bundle_price, discount_type: data.discount_type, discount_value: data.discount_value,
          items: (data.items || []).map((i: Record<string, unknown>) => ({ variation_id: i.variation_id, role: i.role, quantity: i.quantity, special_price: i.special_price })),
        });
        setInitialFormSnapshot(snapshot);
      } catch {
        alert('ไม่สามารถโหลดข้อมูลโปรโมชั่นได้');
        router.push('/promotions');
      } finally {
        setLoadingPromo(false);
      }
    };
    fetchPromo();
  }, [promotionId, router]);

  // Detect local changes (for out-of-sync badge)
  useEffect(() => {
    if (!isEdit || !initialFormSnapshot || shopeeDeals.length === 0) return;
    const currentSnapshot = JSON.stringify({
      name: form.name, bundle_price: parseFloat(form.bundle_price) || null, discount_type: form.discount_type, discount_value: parseFloat(form.discount_value) || null,
      items: form.items.map(i => ({ variation_id: i.variation_id, role: i.role, quantity: i.quantity, special_price: i.special_price })),
    });
    setHasLocalChanges(currentSnapshot !== initialFormSnapshot);
  }, [isEdit, initialFormSnapshot, shopeeDeals.length, form.name, form.bundle_price, form.discount_type, form.discount_value, form.items]);

  // Determine available roles based on promotion type
  const getAvailableRoles = useCallback(() => {
    switch (form.promotion_type) {
      case 'bundle_set': return ['component'];
      case 'buy_get_free': return ['main', 'gift'];
      case 'buy_get_discount': return ['main', 'discounted'];
      case 'qty_discount': return ['main'];
      default: return ['component'];
    }
  }, [form.promotion_type]);

  const getDefaultRole = useCallback(() => {
    switch (form.promotion_type) {
      case 'bundle_set': return 'component' as const;
      case 'buy_get_free': return 'main' as const;
      case 'buy_get_discount': return 'main' as const;
      case 'qty_discount': return 'main' as const;
      default: return 'component' as const;
    }
  }, [form.promotion_type]);

  // Add product to items
  const handleAddProduct = useCallback((product: ProductSearchItem) => {
    const isProductMode = form.promotion_type === 'bundle_set';
    const matchKey = isProductMode ? 'product_id' : 'variation_id';
    const matchValue = isProductMode ? product.product_id : product.id;

    if (form.items.some(i => i[matchKey] === matchValue)) {
      setForm(prev => ({
        ...prev,
        items: prev.items.map(i =>
          i[matchKey] === matchValue ? { ...i, quantity: i.quantity + 1 } : i
        ),
      }));
      return;
    }

    if (form.promotion_type === 'qty_discount' && form.items.length >= 1) {
      setErrors({ items: 'ซื้อเยอะลดเยอะ เลือกได้เพียง 1 สินค้า' });
      return;
    }

    const newItem: PromotionItemForm = {
      key: nextKey(),
      variation_id: isProductMode ? '' : product.id,
      product_id: product.product_id,
      role: getDefaultRole(),
      quantity: 1,
      special_price: null,
      sort_order: form.items.length,
      product_name: product.name,
      product_code: product.code,
      variation_label: isProductMode ? '' : (product.variation_label || ''),
      sku: isProductMode ? '' : (product.sku || ''),
      default_price: product.default_price || 0,
      image: product.image || '',
      variation_count: product.variation_count,
    };

    setForm(prev => ({ ...prev, items: [...prev.items, newItem] }));
    setErrors(prev => { const { items: _, ...rest } = prev; return rest; });
  }, [form.items, form.promotion_type, getDefaultRole]);

  const handleRemoveItem = (key: string) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter(i => i.key !== key),
    }));
  };

  const handleUpdateItem = (key: string, field: string, value: unknown) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map(i => i.key === key ? { ...i, [field]: value } : i),
    }));
  };

  // Tier management
  const handleAddTier = () => {
    const lastTier = form.tiers[form.tiers.length - 1];
    setForm(prev => ({
      ...prev,
      tiers: [...prev.tiers, {
        key: nextKey(),
        min_qty: lastTier ? lastTier.min_qty + 1 : 2,
        discount_type: 'percent' as const,
        discount_value: 0,
      }],
    }));
  };

  const handleRemoveTier = (key: string) => {
    setForm(prev => ({
      ...prev,
      tiers: prev.tiers.filter(t => t.key !== key),
    }));
  };

  const handleUpdateTier = (key: string, field: string, value: unknown) => {
    setForm(prev => ({
      ...prev,
      tiers: prev.tiers.map(t => t.key === key ? { ...t, [field]: value } : t),
    }));
  };

  // Calculate total default price
  const totalDefaultPrice = form.items.reduce((sum, i) => {
    if (i.role === 'gift') return sum;
    return sum + (i.default_price * i.quantity);
  }, 0);

  const bundlePrice = parseFloat(form.bundle_price) || 0;
  const discount = totalDefaultPrice - bundlePrice;
  const discountPercent = totalDefaultPrice > 0 ? (discount / totalDefaultPrice * 100) : 0;

  // Validate & Submit
  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) newErrors.name = 'กรุณาระบุชื่อ';
    if (form.items.length === 0) newErrors.items = 'กรุณาเพิ่มสินค้า';

    switch (form.promotion_type) {
      case 'bundle_set': {
        if (form.items.length < 2) newErrors.items = 'เซ็ตรวมต้องมีสินค้าอย่างน้อย 2 รายการ';
        const dv = parseFloat(form.discount_value) || 0;
        if (dv <= 0) newErrors.discount_value = 'กรุณาระบุส่วนลด';
        if (form.discount_type === 'percent' && dv > 100) newErrors.discount_value = 'ส่วนลดไม่เกิน 100%';
        break;
      }
      case 'buy_get_free':
        if (!form.items.some(i => i.role === 'main')) newErrors.items = 'ต้องมีสินค้าหลักอย่างน้อย 1 ตัว';
        if (!form.items.some(i => i.role === 'gift')) newErrors.items = 'ต้องมีของแถมอย่างน้อย 1 ตัว';
        break;
      case 'buy_get_discount':
        if (!form.items.some(i => i.role === 'main')) newErrors.items = 'ต้องมีสินค้าหลักอย่างน้อย 1 ตัว';
        if (!form.items.some(i => i.role === 'discounted')) newErrors.items = 'ต้องมีสินค้าราคาพิเศษอย่างน้อย 1 ตัว';
        if (form.items.some(i => i.role === 'discounted' && (i.special_price == null || i.special_price < 0))) {
          newErrors.items = 'สินค้าราคาพิเศษต้องระบุราคา';
        }
        break;
      case 'qty_discount':
        if (form.items.length !== 1) newErrors.items = 'เลือกสินค้า 1 ตัว';
        if (form.tiers.length === 0) newErrors.tiers = 'กรุณาเพิ่มขั้นส่วนลดอย่างน้อย 1 ขั้น';
        break;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        promotion_type: form.promotion_type,
        status: form.is_active ? 'active' : 'inactive',
        start_date: form.dateRange?.startDate || null,
        end_date: form.dateRange?.endDate || null,
        image: promotionImages[0]?.image_url || null,
        description: form.description || null,
        bundle_price: bundlePrice || null,
        discount_type: form.promotion_type === 'bundle_set' ? form.discount_type : null,
        discount_value: form.promotion_type === 'bundle_set' ? (parseFloat(form.discount_value) || null) : null,
        purchase_min_spend: parseFloat(form.purchase_min_spend) || null,
        per_gift_num: parseInt(form.per_gift_num) || null,
        purchase_limit: parseInt(form.purchase_limit) || null,
        items: form.items.map((item, idx) => ({
          variation_id: item.variation_id || null,
          product_id: item.product_id || null,
          role: item.role,
          quantity: item.quantity,
          special_price: item.special_price,
          sort_order: idx,
        })),
        tiers: form.tiers.map(t => ({
          min_qty: t.min_qty,
          discount_type: t.discount_type,
          discount_value: t.discount_value,
        })),
        platforms: platformPrices
          .filter(p => p.is_enabled)
          .map(p => {
            const account = marketplaceAccounts.find(a => a.id === p.account_id);
            return {
              platform: account?.platform || 'shopee',
              account_id: p.account_id,
              bundle_price: parseFloat(p.bundle_price) || null,
              is_enabled: true,
            };
          }),
      };

      const res = isEdit
        ? await apiFetch(`/api/promotions/${promotionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await apiFetch('/api/promotions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }

      const pid = promotionId || result.promotion?.id;
      const enabledPlatforms = platformPrices.filter(p => p.is_enabled);

      // If editing and has existing shopee deals → ask to sync (update existing deals)
      if (isEdit && shopeeDeals.length > 0) {
        setSavedPromotionId(pid);
        setShowSyncConfirm(true);
        return;
      }

      // If has enabled platforms → ask to push (create new deals)
      if (enabledPlatforms.length > 0 && pid) {
        setSavedPromotionId(pid);
        setShowPushConfirm(true);
        return;
      }

      router.push('/promotions');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  // Sync to Shopee
  const handleSyncShopee = async () => {
    const pid = savedPromotionId || promotionId;
    if (!pid) return;
    setSyncingShopee(true);
    setSyncResults(null);
    try {
      const res = await apiFetch('/api/shopee/deals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promotion_id: pid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');

      // Build results
      const results = (data.results || []).map((r: { account_id: string; success: boolean; error?: string; shop_name?: string; details?: string[] }) => ({
        shop_name: r.shop_name || marketplaceAccounts.find(a => a.id === r.account_id)?.shop_name || r.account_id,
        success: r.success,
        error: r.error,
        details: r.details,
      }));
      setSyncResults(results);

      // Update snapshot so it's no longer "out of sync"
      setInitialFormSnapshot(JSON.stringify({
        name: form.name, bundle_price: parseFloat(form.bundle_price) || null,
        items: form.items.map(i => ({ variation_id: i.variation_id, role: i.role, quantity: i.quantity, special_price: i.special_price })),
      }));
      setHasLocalChanges(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      setSyncResults([{ shop_name: 'ทั้งหมด', success: false, error: message }]);
    } finally {
      setSyncingShopee(false);
    }
  };

  if (loadingPromo) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F4511E]" />
      </div>
    );
  }

  const showBundlePrice = form.promotion_type === 'buy_get_free' || form.promotion_type === 'buy_get_discount';
  const showBundleDiscount = form.promotion_type === 'bundle_set';
  const showTiers = form.promotion_type === 'qty_discount';
  const availableRoles = getAvailableRoles();

  // Build columns and role options for ItemsTable
  const itemsTableColumns: ColumnKey[] = (() => {
    const cols: ColumnKey[] = [];
    if (availableRoles.length > 1) cols.push('role');
    cols.push('qty');
    if (form.promotion_type === 'buy_get_discount') cols.push('special_price');
    return cols;
  })();

  const roleOpts = availableRoles.map(r => ({ id: r, label: ROLE_LABELS[r] }));

  // Convert PromotionItemForm[] → TableItem[]
  const tableItems: TableItem[] = form.items.map(item => ({
    variation_id: item.variation_id,
    product_id: item.product_id,
    product_name: item.product_name,
    variation_label: form.promotion_type === 'bundle_set'
      ? (item.variation_count && item.variation_count > 1 ? `ทุก variation (${item.variation_count})` : null)
      : (item.variation_label || null),
    sku: form.promotion_type === 'bundle_set' ? null : (item.sku || null),
    product_code: item.product_code || null,
    image: item.image || null,
    quantity: item.quantity,
    unit_price: item.default_price,
    role: item.role,
    special_price: item.special_price,
  }));

  // ItemsTable callbacks
  const handleTableAdd = (product: ProductSearchItem) => {
    handleAddProduct(product);
  };

  const handleTableUpdateField = (idx: number, field: keyof TableItem, value: number | string) => {
    const item = form.items[idx];
    if (!item) return;
    if (field === 'quantity') {
      handleUpdateItem(item.key, 'quantity', Math.max(1, typeof value === 'number' ? value : parseInt(value as string) || 1));
    } else if (field === 'role') {
      handleUpdateItem(item.key, 'role', value);
    } else if (field === 'special_price') {
      handleUpdateItem(item.key, 'special_price', typeof value === 'number' ? value : parseFloat(value as string) || null);
    }
  };

  const handleTableRemove = (idx: number) => {
    const item = form.items[idx];
    if (item) handleRemoveItem(item.key);
  };

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header with back button + toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/promotions')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isEdit ? 'แก้ไขโปรโมชั่น' : 'สร้างโปรโมชั่น'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.is_active ? 'bg-[#F4511E]' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
              form.is_active ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
          <span className="text-base text-gray-500 dark:text-slate-400">
            {form.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
          </span>
        </div>
      </div>

      {/* Promotion Type */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-3">ประเภทโปรโมชั่น</h2>
        <div className="flex flex-wrap gap-3">
          {TYPE_OPTIONS.map(opt => (
            <div key={opt.id} className="relative group">
              <button
                onClick={() => {
                  if (isEdit) return;
                  setForm(prev => ({
                    ...prev,
                    promotion_type: opt.id as FormState['promotion_type'],
                    items: [],
                    tiers: [],
                    bundle_price: '',
                    purchase_min_spend: '',
                    per_gift_num: '1',
                    purchase_limit: '',
                  }));
                }}
                disabled={isEdit}
                className={`flex items-center gap-2.5 px-5 py-3 rounded-xl border-2 transition-all
                  ${form.promotion_type === opt.id
                    ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/20 text-[#F4511E]'
                    : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 text-gray-600 dark:text-slate-400'}
                  ${isEdit ? 'cursor-not-allowed opacity-60' : ''}
                `}
              >
                {opt.icon}
                <span className="font-semibold text-base whitespace-nowrap">{opt.label}</span>
              </button>
              {/* Tooltip */}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-800 dark:bg-slate-900 text-white text-sm rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none max-w-xs">
                <span className="whitespace-normal">{opt.desc}</span>
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-gray-800 dark:border-t-slate-900" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* General Info — 2-column: left=info, right=platform pricing */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className={`grid grid-cols-1 ${marketplaceAccounts.length > 0 ? 'lg:grid-cols-[1fr,340px]' : ''} gap-6`}>
          {/* Left column — General info */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300">ข้อมูลทั่วไป</h2>

            {/* Row 1: ชื่อ + ระยะเวลา */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">ชื่อโปรโมชั่น *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value.slice(0, 25) }))}
                    maxLength={25}
                    placeholder="ชื่อนี้จะแสดงบน Shopee/TikTok"
                    className="w-full h-[42px] px-3 pr-14 border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-800 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                  />
                  <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${form.name.length >= 25 ? 'text-red-400' : 'text-slate-400'}`}>
                    {form.name.length}/25
                  </span>
                </div>
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">ระยะเวลาโปร</label>
                <DateRangePicker
                  value={form.dateRange}
                  onChange={(v) => setForm(prev => ({ ...prev, dateRange: v }))}
                  placeholder="เลือกช่วงวันที่ (ไม่บังคับ)"
                  showShortcuts={false}
                />
              </div>
            </div>

            {/* Row 2: ส่วนลด/ราคาเซ็ต + จำกัดการซื้อ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {showBundleDiscount && (
                <div>
                  <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">ส่วนลดเซ็ต *</label>
                  <DiscountInput
                    value={form.discount_value}
                    discountType={form.discount_type}
                    onValueChange={v => setForm(prev => ({ ...prev, discount_value: v }))}
                    onTypeChange={t => setForm(prev => ({ ...prev, discount_type: t }))}
                    error={errors.discount_value}
                    helperText={form.discount_type === 'percent'
                      ? `ลด ${parseFloat(form.discount_value) || 0}% จากราคาปกติของแต่ละสินค้า`
                      : `ลด ${(parseFloat(form.discount_value) || 0).toLocaleString()} บาท จากราคาปกติของแต่ละสินค้า`}
                  />
                </div>
              )}
              {showBundlePrice && (
                <div>
                  <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">
                    {form.promotion_type === 'buy_get_discount' ? 'ราคารวม (บาท) *' : 'ราคาเซ็ต (บาท) *'}
                  </label>
                  <input
                    type="number"
                    value={form.bundle_price}
                    onChange={e => setForm(prev => ({ ...prev, bundle_price: e.target.value }))}
                    placeholder="0"
                    min={0}
                    className="w-full h-[42px] px-3 border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-800 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                  />
                  {errors.bundle_price && <p className="text-red-500 text-sm mt-1">{errors.bundle_price}</p>}
                  {bundlePrice > 0 && totalDefaultPrice > 0 && (
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                      ราคาปกติ {totalDefaultPrice.toLocaleString()} → ลด {discount.toLocaleString()} ({discountPercent.toFixed(0)}%)
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">จำกัดการซื้อต่อคน</label>
                <input
                  type="number"
                  value={form.purchase_limit}
                  onChange={e => setForm(prev => ({ ...prev, purchase_limit: e.target.value }))}
                  placeholder="ไม่จำกัด"
                  min={1}
                  max={100}
                  className="w-full h-[42px] px-3 border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-800 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                />
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">ลูกค้า 1 คนซื้อได้สูงสุดกี่ครั้ง (Shopee: 1-100)</p>
              </div>
            </div>

            {/* buy_get_free: ยอดขั้นต่ำ + จำนวนแถม */}
            {form.promotion_type === 'buy_get_free' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">ยอดซื้อขั้นต่ำ (บาท)</label>
                  <input
                    type="number"
                    value={form.purchase_min_spend}
                    onChange={e => setForm(prev => ({ ...prev, purchase_min_spend: e.target.value }))}
                    placeholder="0 = ไม่จำกัด"
                    min={0}
                    className="w-full h-[42px] px-3 border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-800 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">ลูกค้าต้องซื้อครบยอดนี้ถึงจะได้ของแถม</p>
                </div>
                <div>
                  <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">จำนวนแถมต่อครั้ง</label>
                  <input
                    type="number"
                    value={form.per_gift_num}
                    onChange={e => setForm(prev => ({ ...prev, per_gift_num: e.target.value }))}
                    placeholder="1"
                    min={1}
                    max={50}
                    className="w-full h-[42px] px-3 border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-800 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">เลือกของแถมได้กี่ชิ้นต่อครั้ง (Shopee: 1-50)</p>
                </div>
              </div>
            )}

            {/* Description + Images */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              <div className="flex flex-col">
                <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">คำอธิบาย</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="แสดงในหน้ารายละเอียด + ส่งไป Shopee/TikTok"
                  className="w-full flex-1 min-h-[120px] px-3 py-2 border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-800 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent resize-none"
                />
              </div>
              <div>
                <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">รูปภาพ</label>
                <ImageUploader
                  images={promotionImages}
                  onImagesChange={setPromotionImages}
                  maxImages={5}
                />
              </div>
            </div>
          </div>

          {/* Right column — เลือกร้านที่จะ Sync */}
          {marketplaceAccounts.length > 0 && (
            <div className="lg:border-l lg:border-gray-200 lg:dark:border-slate-700 lg:pl-6">
              <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-1">เลือกร้านที่จะ Sync</h2>
              <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">
                เปิดร้านที่ต้องการส่งโปรโมชั่น{showBundlePrice && bundlePrice ? ` · ราคาหลัก ฿${bundlePrice.toLocaleString()}` : ''}{showBundleDiscount && form.discount_value ? ` · ลด ${form.discount_type === 'percent' ? `${form.discount_value}%` : `฿${parseFloat(form.discount_value).toLocaleString()}`}` : ''}
              </p>

              {(() => {
                const platforms = [...new Set(marketplaceAccounts.map(a => a.platform))];
                const PLATFORM_META: Record<string, { label: string; icon: string }> = {
                  shopee: { label: 'Shopee', icon: '/marketplace/shopee.svg' },
                  tiktok: { label: 'TikTok', icon: '/marketplace/tiktok_shop.svg' },
                  lazada: { label: 'Lazada', icon: '/marketplace/lazada.svg' },
                  line_shopping: { label: 'LINE Shopping', icon: '/social/line_oa.svg' },
                };
                const currentTab = activePlatformTab || platforms[0];
                const tabAccounts = marketplaceAccounts.filter(a => a.platform === currentTab);

                return (
                  <>
                    {/* Platform tabs */}
                    {platforms.length > 1 && (
                      <div className="flex items-center gap-0.5 mb-3 border-b border-gray-200 dark:border-slate-700">
                        {platforms.map(p => {
                          const meta = PLATFORM_META[p] || { label: p, icon: '' };
                          const isActive = currentTab === p;
                          const enabledCount = marketplaceAccounts.filter(a => a.platform === p).filter(a => platformPrices.find(pp => pp.account_id === a.id)?.is_enabled).length;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setActivePlatformTab(p)}
                              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                                isActive
                                  ? 'border-[#F4511E] text-[#F4511E]'
                                  : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
                              }`}
                            >
                              {meta.icon && <img src={meta.icon} alt="" className="w-4 h-4" />}
                              <span>{meta.label}</span>
                              {enabledCount > 0 && (
                                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-[#F4511E] text-white text-[10px] font-bold leading-none">{enabledCount}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Single platform header */}
                    {platforms.length === 1 && (
                      <div className="flex items-center gap-1.5 mb-3">
                        {PLATFORM_META[platforms[0]]?.icon && (
                          <img src={PLATFORM_META[platforms[0]].icon} alt="" className="w-4 h-4" />
                        )}
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
                          {PLATFORM_META[platforms[0]]?.label || platforms[0]}
                        </span>
                      </div>
                    )}

                    {/* Shop list */}
                    <div className="space-y-2.5">
                      {tabAccounts.map((account) => {
                        const pp = platformPrices.find(p => p.account_id === account.id);
                        const isEnabled = pp?.is_enabled ?? false;
                        const meta = PLATFORM_META[account.platform];
                        const existingDeal = shopeeDeals.find(d => d.account_id === account.id);
                        const isOngoing = existingDeal?.status === 'ongoing';
                        return (
                          <div key={account.id}>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isOngoing}
                                onClick={() => {
                                  if (isOngoing) return;
                                  setPlatformPrices(prev => {
                                    const exists = prev.some(p => p.account_id === account.id);
                                    if (!exists) {
                                      // First toggle ON: prefill with default bundle_price
                                      return [...prev, { account_id: account.id, bundle_price: form.bundle_price || '', is_enabled: true }];
                                    }
                                    return prev.map(p =>
                                      p.account_id === account.id
                                        ? { ...p, is_enabled: !p.is_enabled, bundle_price: !p.is_enabled && !p.bundle_price ? (form.bundle_price || '') : p.bundle_price }
                                        : p
                                    );
                                  });
                                }}
                                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors flex-shrink-0 ${
                                  isOngoing ? 'bg-[#F4511E] opacity-50 cursor-not-allowed' : isEnabled ? 'bg-[#F4511E]' : 'bg-gray-300'
                                }`}
                              >
                                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform shadow-sm ${
                                  isEnabled || isOngoing ? 'translate-x-[13px]' : 'translate-x-[2px]'
                                }`} />
                              </button>
                              <div className="flex items-center gap-1 min-w-0 flex-1">
                                {meta?.icon && <img src={meta.icon} alt="" className="w-3.5 h-3.5 flex-shrink-0" />}
                                <span className={`text-sm truncate ${isEnabled || isOngoing ? 'text-gray-700 dark:text-slate-300' : 'text-gray-400 dark:text-slate-500'}`}>
                                  {account.shop_name}
                                </span>
                                {existingDeal && (
                                  <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    isOngoing
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                  }`}>
                                    {isOngoing ? 'ongoing' : 'synced'}
                                  </span>
                                )}
                              </div>
                              {showBundlePrice && !showBundleDiscount && (
                                <>
                                  <input
                                    type="number"
                                    value={pp?.bundle_price ?? ''}
                                    onChange={e => {
                                      setPlatformPrices(prev => prev.map(p =>
                                        p.account_id === account.id ? { ...p, bundle_price: e.target.value } : p
                                      ));
                                    }}
                                    disabled={!isEnabled || isOngoing}
                                    placeholder={bundlePrice ? String(bundlePrice) : '-'}
                                    min={0}
                                    className="w-24 h-[32px] px-2 text-sm border border-gray-300 dark:border-slate-500 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#F4511E] focus:border-transparent disabled:opacity-40 disabled:cursor-not-allowed text-right"
                                  />
                                  <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">฿</span>
                                </>
                              )}
                            </div>
                            {isOngoing && (
                              <p className="ml-9 text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">deal กำลัง run — แก้ราคาไม่ได้</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Items — buy_get types: split into 2 tables (X + Y) */}
      {(form.promotion_type === 'buy_get_discount' || form.promotion_type === 'buy_get_free') ? (
        <>
          {/* Table 1: สินค้าหลัก (X) */}
          <div>
            <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
              สินค้าหลัก (X) — สินค้าที่ต้องซื้อ
            </h2>
            {errors.items && !form.items.some(i => i.role === 'main') && (
              <p className="text-red-500 text-sm mb-2">{errors.items}</p>
            )}
            <ItemsTable
              items={tableItems.filter(i => i.role === 'main')}
              columns={['qty']}
              onAdd={(product) => {
                handleAddProduct(product);
                setForm(prev => {
                  const items = [...prev.items];
                  const last = items[items.length - 1];
                  if (last) last.role = 'main';
                  return { ...prev, items };
                });
              }}
              onUpdateField={(idx, field, value) => {
                const mainItems = form.items.filter(i => i.role === 'main');
                const item = mainItems[idx];
                if (!item) return;
                const realIdx = form.items.findIndex(i => i.key === item.key);
                if (realIdx >= 0) handleTableUpdateField(realIdx, field, value);
              }}
              onRemove={(idx) => {
                const mainItems = form.items.filter(i => i.role === 'main');
                const item = mainItems[idx];
                if (!item) return;
                const realIdx = form.items.findIndex(i => i.key === item.key);
                if (realIdx >= 0) handleTableRemove(realIdx);
              }}
              products={products}
              loadingProducts={loadingProducts}
              searchPlaceholder="+ เพิ่มสินค้าหลัก..."
              emptyMessage="เพิ่มสินค้าที่ลูกค้าต้องซื้อ"
              showSummary={false}
            />
          </div>

          {/* Table 2: Y items — different per type */}
          <div>
            <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
              {form.promotion_type === 'buy_get_free'
                ? 'ของแถม (Y) — ได้ฟรี'
                : 'สินค้าราคาพิเศษ (Y) — ได้ในราคาพิเศษ'}
            </h2>
            {errors.items && form.items.some(i => i.role === 'main') && (
              (() => {
                const yRole = form.promotion_type === 'buy_get_free' ? 'gift' : 'discounted';
                const hasY = form.items.some(i => i.role === yRole);
                return !hasY ? <p className="text-red-500 text-sm mb-2">{errors.items}</p> : null;
              })()
            )}
            <ItemsTable
              items={tableItems.filter(i => i.role === (form.promotion_type === 'buy_get_free' ? 'gift' : 'discounted'))}
              columns={form.promotion_type === 'buy_get_discount' ? ['qty', 'special_price'] : ['qty']}
              onAdd={(product) => {
                const yRole = form.promotion_type === 'buy_get_free' ? 'gift' : 'discounted';
                handleAddProduct(product);
                setForm(prev => {
                  const items = [...prev.items];
                  const last = items[items.length - 1];
                  if (last) last.role = yRole as 'gift' | 'discounted';
                  return { ...prev, items };
                });
              }}
              onUpdateField={(idx, field, value) => {
                const yRole = form.promotion_type === 'buy_get_free' ? 'gift' : 'discounted';
                const yItems = form.items.filter(i => i.role === yRole);
                const item = yItems[idx];
                if (!item) return;
                const realIdx = form.items.findIndex(i => i.key === item.key);
                if (realIdx >= 0) handleTableUpdateField(realIdx, field, value);
              }}
              onRemove={(idx) => {
                const yRole = form.promotion_type === 'buy_get_free' ? 'gift' : 'discounted';
                const yItems = form.items.filter(i => i.role === yRole);
                const item = yItems[idx];
                if (!item) return;
                const realIdx = form.items.findIndex(i => i.key === item.key);
                if (realIdx >= 0) handleTableRemove(realIdx);
              }}
              products={products}
              loadingProducts={loadingProducts}
              searchPlaceholder={form.promotion_type === 'buy_get_free' ? '+ เพิ่มของแถม...' : '+ เพิ่มสินค้าราคาพิเศษ...'}
              emptyMessage={form.promotion_type === 'buy_get_free' ? 'เพิ่มสินค้าที่แถมฟรี' : 'เพิ่มสินค้าที่ลูกค้าจะได้ในราคาพิเศษ'}
              showSummary={false}
            />
          </div>
        </>
      ) : (
        /* Other types: single table */
        <div>
          <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
            {form.promotion_type === 'qty_discount' ? 'สินค้าที่ลดราคา' : 'สินค้าในโปรโมชั่น'}
          </h2>
          {errors.items && <p className="text-red-500 text-sm mb-2">{errors.items}</p>}
          <ItemsTable
            items={tableItems}
            columns={itemsTableColumns}
            onAdd={handleTableAdd}
            onUpdateField={handleTableUpdateField}
            onRemove={handleTableRemove}
            products={products}
            loadingProducts={loadingProducts}
            searchPlaceholder={form.promotion_type === 'bundle_set' ? '+ เพิ่มสินค้า — พิมพ์ชื่อหรือรหัส...' : '+ เพิ่มสินค้า — พิมพ์ชื่อ, รหัส หรือ SKU...'}
            searchMode={form.promotion_type === 'bundle_set' ? 'product' : 'variation'}
            roleOptions={roleOpts}
            emptyMessage="เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน"
            showSummary={false}
          />
        </div>
      )}

      {/* Summary for bundle */}
      {(showBundlePrice || showBundleDiscount) && form.items.length > 0 && (
        <div className="flex justify-end">
          <div className="text-sm text-gray-600 dark:text-slate-400">
            รวมราคาปกติ: <span className="font-medium text-gray-900 dark:text-white">{totalDefaultPrice.toLocaleString()}</span> บาท
            {showBundleDiscount && parseFloat(form.discount_value) > 0 && (
              <span className="ml-2">
                → หลังลด: <span className="font-medium text-[#F4511E]">
                  {form.discount_type === 'percent'
                    ? `${(totalDefaultPrice * (1 - parseFloat(form.discount_value) / 100)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : `${(totalDefaultPrice - parseFloat(form.discount_value)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  }
                </span> บาท
              </span>
            )}
            {form.items.some(i => i.role === 'gift') && (
              <span className="text-xs text-gray-400 ml-1">(ไม่รวมของแถม)</span>
            )}
          </div>
        </div>
      )}

      {/* Tiers (qty_discount only) */}
      {showTiers && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300">ขั้นส่วนลด</h2>
            <button
              onClick={handleAddTier}
              className="flex items-center gap-1 px-3 py-1.5 text-base font-medium text-[#F4511E] hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              เพิ่มขั้น
            </button>
          </div>

          {errors.tiers && <p className="text-red-500 text-sm mb-2">{errors.tiers}</p>}

          {form.tiers.length > 0 && (
            <div className="space-y-2">
              {form.tiers.map((tier) => (
                <div key={tier.key} className="flex items-center gap-2 flex-wrap">
                  <span className="text-base text-gray-500 dark:text-slate-400 w-16 flex-shrink-0">ซื้อ ≥</span>
                  <input
                    type="number"
                    value={tier.min_qty}
                    onChange={e => handleUpdateTier(tier.key, 'min_qty', Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                    className="w-20 h-[34px] px-2 text-center border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  />
                  <span className="text-base text-gray-500 dark:text-slate-400">ชิ้น</span>
                  <div className="w-40">
                    <FormSelect
                      value={tier.discount_type}
                      onChange={(v: string) => handleUpdateTier(tier.key, 'discount_type', v)}
                      options={DISCOUNT_TYPE_OPTIONS}
                      searchThreshold={99}
                    />
                  </div>
                  <input
                    type="number"
                    value={tier.discount_value || ''}
                    onChange={e => handleUpdateTier(tier.key, 'discount_value', parseFloat(e.target.value) || 0)}
                    min={0}
                    placeholder="0"
                    className="w-24 h-[34px] px-2 text-right border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                  />
                  <button
                    onClick={() => handleRemoveTier(tier.key)}
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {form.tiers.length === 0 && (
            <div className="text-center py-6 text-gray-400 dark:text-slate-500 text-base">
              กดเพิ่มขั้นส่วนลด เช่น ซื้อ 2 ชิ้นลด 10%
            </div>
          )}
        </div>
      )}

      {/* Shopee Sync Status (edit mode only) */}
      {isEdit && shopeeDeals.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <img src="/marketplace/shopee.svg" alt="Shopee" className="w-5 h-5" />
              <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300">สถานะ Shopee Deal</h2>
              {hasLocalChanges && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3" />
                  มีการแก้ไขที่ยังไม่ sync
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setSavedPromotionId(promotionId || null); setShowSyncConfirm(true); }}
              disabled={syncingShopee}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#F4511E] hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncingShopee ? 'animate-spin' : ''}`} />
              Sync ตอนนี้
            </button>
          </div>
          <div className="space-y-2">
            {shopeeDeals.map((deal) => {
              const account = marketplaceAccounts.find(a => a.id === deal.account_id);
              const shopName = account?.shop_name || deal.account_id;
              const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
                ongoing: { label: 'กำลังดำเนินการ', color: 'text-green-600 dark:text-green-400', icon: CheckCircle2 },
                upcoming: { label: 'รอเริ่ม', color: 'text-blue-600 dark:text-blue-400', icon: Clock },
                expired: { label: 'หมดอายุ', color: 'text-gray-400 dark:text-slate-500', icon: Clock },
              };
              const sc = statusConfig[deal.status] || { label: deal.status, color: 'text-gray-500', icon: Clock };
              const StatusIcon = sc.icon;
              return (
                <div key={deal.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-slate-700/50">
                  <div className="flex items-center gap-2">
                    <img src="/marketplace/shopee.svg" alt="" className="w-4 h-4" />
                    <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{shopName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1 text-xs font-medium ${sc.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {sc.label}
                    </span>
                    {deal.updated_at && (
                      <span className="text-xs text-gray-400 dark:text-slate-500">
                        อัพเดต: {new Date(deal.updated_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save buttons */}
      <div className="flex items-center justify-end gap-3 pt-2 pb-6">
        <button
          onClick={() => router.push('/promotions')}
          className="px-5 py-2.5 text-base font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
        >
          ยกเลิก
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 text-base font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#E64A19] disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>

      {/* Push Deal Modal */}
      {showPushModal && (promotionId || savedPromotionId) && (
        <PushDealModal
          promotionId={(promotionId || savedPromotionId)!}
          promotionName={form.name}
          startDate={form.dateRange?.startDate ? String(form.dateRange.startDate) : null}
          endDate={form.dateRange?.endDate ? String(form.dateRange.endDate) : null}
          onClose={() => { setShowPushModal(false); if (showPushConfirm) { setShowPushConfirm(false); router.push('/promotions'); } }}
          onResults={(results) => {
            // Disable toggles for shops that failed
            const failedAccountIds = results.filter(r => !r.success).map(r => r.account_id);
            if (failedAccountIds.length > 0) {
              setPlatformPrices(prev => prev.map(p =>
                failedAccountIds.includes(p.account_id) ? { ...p, is_enabled: false } : p
              ));
            }
          }}
        />
      )}

      {/* Push Confirm Dialog (after save, if has enabled platforms) */}
      {showPushConfirm && !showPushModal && (
        <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4" onClick={() => { setShowPushConfirm(false); router.push('/promotions'); }}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <Send className="w-5 h-5 text-[#F4511E]" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">บันทึกสำเร็จ</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">
              จะส่งโปรโมชั่นไป Shopee เลยไหม?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowPushConfirm(false); router.push('/promotions'); }}
                className="px-4 py-2 text-base font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
              >
                ไว้ทีหลัง
              </button>
              <button
                onClick={() => setShowPushModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-base font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#E64A19] transition-colors"
              >
                <Send className="w-4 h-4" />
                Push เลย
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Confirm Dialog */}
      {showSyncConfirm && (
        <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4" onClick={() => { if (!syncingShopee) { setShowSyncConfirm(false); router.push('/promotions'); } }}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            {syncResults ? (
              <>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">ผลลัพธ์การ Sync</h3>
                <div className="space-y-3 mb-5 max-h-[60vh] overflow-y-auto">
                  {syncResults.map((r, idx) => (
                    <div key={idx} className={`rounded-lg ${r.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                      <div className="flex items-center gap-2 py-2 px-3">
                        {r.success
                          ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                          : <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                        }
                        <span className="text-sm font-medium text-gray-700 dark:text-slate-300 flex-1">{r.shop_name}</span>
                        {r.error && <span className="text-xs text-red-500">{r.error}</span>}
                      </div>
                      {r.details && r.details.length > 0 && (
                        <div className="px-3 pb-2 space-y-0.5">
                          {r.details.map((d, di) => (
                            <div key={di} className="text-xs text-gray-500 dark:text-slate-400 pl-6">
                              {d}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => { setShowSyncConfirm(false); setSyncResults(null); router.push('/promotions'); }}
                    className="px-5 py-2 text-base font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#E64A19] transition-colors"
                  >
                    ตกลง
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <img src="/marketplace/shopee.svg" alt="" className="w-6 h-6" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">อัพเดตไป Shopee ด้วยไหม?</h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">
                  โปรโมชั่นนี้เชื่อมต่อกับ Shopee {shopeeDeals.length} ร้าน:
                </p>
                <div className="space-y-1 mb-5">
                  {shopeeDeals.map((deal) => {
                    const account = marketplaceAccounts.find(a => a.id === deal.account_id);
                    return (
                      <div key={deal.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                        {account?.shop_name || deal.account_id}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => { setShowSyncConfirm(false); router.push('/promotions'); }}
                    disabled={syncingShopee}
                    className="px-4 py-2 text-base font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                  >
                    ข้าม
                  </button>
                  <button
                    onClick={handleSyncShopee}
                    disabled={syncingShopee}
                    className="flex items-center gap-2 px-4 py-2 text-base font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#E64A19] disabled:opacity-50 transition-colors"
                  >
                    {syncingShopee ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        กำลัง Sync...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        อัพเดต Shopee
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
