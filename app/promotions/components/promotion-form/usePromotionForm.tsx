'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import type { ProductSearchItem } from '@/components/ui/ProductSearchInput';
import type { ProductImage } from '@/components/ui/ImageUploader';
import type { TableItem, ColumnKey } from '@/components/ui/ItemsTable';
import type { PriceMode } from '@/components/ui/PriceDiscountCombo';
import { useToast } from '@/lib/toast-context';
import {
  type DealStatus,
  type EditableFields,
  getEditableFields,
  getTypeConfig,
  validateForShopee,
} from '@/lib/promotions/promotion-rules';
import type { PromotionTypeConfig } from '@/lib/promotions/promotion-rules';
import {
  type MarketplaceAccount,
  type PlatformPrice,
  type ShopeeDeal,
  type PromotionItemForm,
  type TierForm,
  type FormState,
  type ConfirmDialogState,
  type SyncResult,
  nextKey,
} from './types';

export function usePromotionForm(promotionId?: string) {
  const router = useRouter();
  const { showToast } = useToast();
  const isEdit = !!promotionId;

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  // Today in Bangkok timezone
  const bkkToday = useMemo(() => {
    const bkkNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    return new Date(bkkNow.getFullYear(), bkkNow.getMonth(), bkkNow.getDate());
  }, []);

  const [form, setForm] = useState<FormState>(() => {
    const bkkNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const tomorrow = new Date(bkkNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endOfMonth = new Date(bkkNow.getFullYear(), bkkNow.getMonth() + 1, 0);
    const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      name: '',
      promotion_type: 'bundle_set',
      is_active: true,
      dateRange: { startDate: toISO(tomorrow), endDate: toISO(endOfMonth) },
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
  const [itemErrorKeys, setItemErrorKeys] = useState<Set<string>>(new Set());
  const [marketplaceAccounts, setMarketplaceAccounts] = useState<MarketplaceAccount[]>([]);
  const [platformPrices, setPlatformPrices] = useState<PlatformPrice[]>([]);
  const [activePlatformTab, setActivePlatformTab] = useState('');
  const [shopeeDeals, setShopeeDeals] = useState<ShopeeDeal[]>([]);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const [syncingShopee, setSyncingShopee] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
  const [savedPromotionId, setSavedPromotionId] = useState<string | null>(null);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [initialFormSnapshot, setInitialFormSnapshot] = useState<string>('');
  const [showPushModal, setShowPushModal] = useState(false);
  const [togglingShop, setTogglingShop] = useState<string | null>(null);
  const [pushSingleAccountId, setPushSingleAccountId] = useState<string | undefined>(undefined);
  const togglePriceRef = useRef<HTMLInputElement>(null);
  const [expandedYProducts, setExpandedYProducts] = useState<Set<string>>(new Set());
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // ─── Effects ──────────────────────────────────────────

  // ESC to close lightbox
  useEffect(() => {
    if (!lightboxSrc) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxSrc(null); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [lightboxSrc]);

  // Fetch marketplace accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await apiFetch('/api/promotions/marketplace-accounts');
        if (res.ok) {
          const data = await res.json();
          const accounts: MarketplaceAccount[] = (data.accounts || []);
          setMarketplaceAccounts(accounts);
          if (accounts.length > 0) {
            const platforms = [...new Set(accounts.map(a => a.platform))];
            setActivePlatformTab(platforms[0]);
          }
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
          items: (data.items || []).map((item: Record<string, unknown>, idx: number) => {
            const sp = item.special_price as number | null;
            const dp = (item.default_price as number) || 0;
            const role = item.role as string;
            const dbDiscountType = item.discount_type as string | null;
            const dbDiscountInput = item.discount_input as number | null;
            let price_mode: PriceMode | undefined;
            let discount_value: string | undefined;
            if (dbDiscountType && dbDiscountInput != null) {
              price_mode = dbDiscountType as PriceMode;
              discount_value = String(dbDiscountInput);
            } else if ((role === 'discounted' || role === 'gift') && sp != null) {
              price_mode = 'fixed_price';
              discount_value = String(sp);
            }
            return {
              key: nextKey(),
              variation_id: item.variation_id as string,
              product_id: (item.product_id as string) || '',
              role,
              quantity: (item.quantity as number) || 1,
              special_price: sp,
              sub_item_limit: (item.sub_item_limit as number | null) ?? null,
              sort_order: idx,
              product_name: item.product_name as string || '',
              product_code: item.product_code as string || '',
              variation_label: item.variation_label as string || '',
              sku: item.sku as string || '',
              default_price: dp,
              max_price: (item.max_price as number) || 0,
              image: item.image as string || '',
              price_mode,
              discount_value,
            };
          }),
          tiers: (data.tiers || []).map((tier: Record<string, unknown>) => ({
            key: nextKey(),
            min_qty: (tier.min_qty as number) || 2,
            discount_type: tier.discount_type as string || 'percent',
            discount_value: (tier.discount_value as number) || 0,
          })),
        });
        if (data.image) {
          setPromotionImages([{ image_url: data.image, sort_order: 0 }]);
        }
        if (data.platforms && Array.isArray(data.platforms) && data.platforms.length > 0) {
          const dbPlatforms = data.platforms.map((p: { account_id: string; bundle_price: number | null; is_enabled: boolean }) => ({
            account_id: p.account_id,
            bundle_price: p.bundle_price != null ? String(p.bundle_price) : '',
            is_enabled: p.is_enabled !== false,
          }));
          const dbIds = new Set(dbPlatforms.map((p: { account_id: string }) => p.account_id));
          setPlatformPrices(prev => {
            const kept = prev.filter(p => !dbIds.has(p.account_id));
            return [...dbPlatforms, ...kept];
          });
        }
        if (data.marketplace_deals && Array.isArray(data.marketplace_deals)) {
          setShopeeDeals(data.marketplace_deals);
        }
        if (['buy_get_free', 'buy_get_discount'].includes(data.promotion_type)) {
          const yRole = data.promotion_type === 'buy_get_free' ? 'gift' : 'discounted';
          const yProductIds = new Set((data.items || []).filter((i: { role: string }) => i.role === yRole).map((i: { product_id: string }) => i.product_id).filter(Boolean));
          setExpandedYProducts(yProductIds as Set<string>);
        }
        const platformsForSnapshot = (data.platforms || [])
          .filter((p: { is_enabled: boolean }) => p.is_enabled !== false)
          .map((p: { account_id: string; bundle_price: number | null }) => ({
            account_id: p.account_id, bundle_price: p.bundle_price,
          }));
        const snapshot = JSON.stringify({
          name: data.name, bundle_price: data.bundle_price, discount_type: data.discount_type, discount_value: data.discount_value,
          items: (data.items || []).map((i: Record<string, unknown>) => ({ variation_id: i.variation_id, role: i.role, quantity: i.quantity, special_price: i.special_price, sub_item_limit: i.sub_item_limit })),
          platforms: platformsForSnapshot,
        });
        setInitialFormSnapshot(snapshot);
      } catch {
        showToast('ไม่สามารถโหลดข้อมูลโปรโมชั่นได้', 'error');
        router.push('/promotions');
      } finally {
        setLoadingPromo(false);
      }
    };
    fetchPromo();
  }, [promotionId, router]);

  // Detect local changes
  useEffect(() => {
    if (!isEdit || !initialFormSnapshot || shopeeDeals.length === 0) return;
    const platformsForSnapshot = platformPrices
      .filter(p => p.is_enabled)
      .map(p => ({ account_id: p.account_id, bundle_price: parseFloat(p.bundle_price) || null }));
    const currentSnapshot = JSON.stringify({
      name: form.name, bundle_price: parseFloat(form.bundle_price) || null, discount_type: form.discount_type, discount_value: parseFloat(form.discount_value) || null,
      items: form.items.map(i => ({ variation_id: i.variation_id, role: i.role, quantity: i.quantity, special_price: i.special_price, sub_item_limit: i.sub_item_limit })),
      platforms: platformsForSnapshot,
    });
    setHasLocalChanges(currentSnapshot !== initialFormSnapshot);
  }, [isEdit, initialFormSnapshot, shopeeDeals.length, form.name, form.bundle_price, form.discount_type, form.discount_value, form.items, platformPrices]);

  // ─── Role Helpers ──────────────────────────────────────────

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

  // ─── Item Handlers ──────────────────────────────────────────

  const handleAddProduct = useCallback((product: ProductSearchItem, productLevel?: boolean) => {
    const isProductMode = productLevel ?? form.promotion_type === 'bundle_set';
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
      sub_item_limit: null,
      sort_order: form.items.length,
      product_name: product.name,
      product_code: product.code,
      variation_label: isProductMode ? '' : (product.variation_label || ''),
      sku: isProductMode ? '' : (product.sku || ''),
      default_price: product.default_price || 0,
      max_price: product.max_price || 0,
      image: product.image || '',
      variation_count: product.variation_count,
    };

    setForm(prev => ({ ...prev, items: [...prev.items, newItem] }));
    setErrors(prev => { const { items: _, ...rest } = prev; return rest; });
  }, [form.items, form.promotion_type, getDefaultRole]);

  const handleAddProductWithVariations = useCallback((product: ProductSearchItem) => {
    const yRole: 'gift' | 'discounted' = form.promotion_type === 'buy_get_free' ? 'gift' : 'discounted';
    const variations = products.filter(p => p.product_id === product.product_id);
    if (variations.length === 0) return;

    if (form.items.some(i => i.product_id === product.product_id && i.role === yRole)) {
      return;
    }

    const newItems: PromotionItemForm[] = variations.map((v, idx) => ({
      key: nextKey(),
      variation_id: v.id,
      product_id: v.product_id,
      role: yRole,
      quantity: 1,
      special_price: null,
      sub_item_limit: null,
      sort_order: form.items.length + idx,
      product_name: v.name,
      product_code: v.code,
      variation_label: v.variation_label || '',
      sku: v.sku || '',
      default_price: v.default_price || 0,
      image: v.image || '',
      price_mode: 'fixed_price' as const,
      discount_value: '',
    }));

    setForm(prev => ({ ...prev, items: [...prev.items, ...newItems] }));
    setExpandedYProducts(prev => new Set([...prev, product.product_id]));
    setErrors(prev => { const { items: _, ...rest } = prev; return rest; });
  }, [form.items, form.promotion_type, products]);

  /** Add product as main item for X table (buy_get types) — sets role to 'main' */
  const handleAddMainProduct = useCallback((product: ProductSearchItem) => {
    handleAddProduct(product, true);
    setForm(prev => {
      const items = [...prev.items];
      const last = items[items.length - 1];
      if (last) last.role = 'main';
      return { ...prev, items };
    });
  }, [handleAddProduct]);

  const handleRemoveProductVariations = useCallback((productId: string) => {
    const yRole = form.promotion_type === 'buy_get_free' ? 'gift' : 'discounted';
    setForm(prev => ({
      ...prev,
      items: prev.items.filter(i => !(i.product_id === productId && i.role === yRole)),
    }));
  }, [form.promotion_type]);

  const handleRemoveItem = useCallback((key: string) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter(i => i.key !== key),
    }));
  }, []);

  const handleUpdateItem = useCallback((key: string, field: string, value: unknown) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map(i => i.key === key ? { ...i, [field]: value } : i),
    }));
    if (itemErrorKeys.has(key)) {
      setItemErrorKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [itemErrorKeys]);

  // ─── Tier Handlers ──────────────────────────────────────────

  const handleAddTier = useCallback(() => {
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
  }, [form.tiers]);

  const handleRemoveTier = useCallback((key: string) => {
    setForm(prev => ({
      ...prev,
      tiers: prev.tiers.filter(t => t.key !== key),
    }));
  }, []);

  const handleUpdateTier = useCallback((key: string, field: string, value: unknown) => {
    setForm(prev => ({
      ...prev,
      tiers: prev.tiers.map(t => t.key === key ? { ...t, [field]: value } : t),
    }));
  }, []);

  // ─── Computed Values ──────────────────────────────────────────

  const totalDefaultPrice = form.items.reduce((sum, i) => {
    if (i.role === 'gift') return sum;
    return sum + (i.default_price * i.quantity);
  }, 0);

  const bundlePrice = parseFloat(form.bundle_price) || 0;
  const discount = totalDefaultPrice - bundlePrice;
  const discountPercent = totalDefaultPrice > 0 ? (discount / totalDefaultPrice * 100) : 0;

  const isBundleSet = form.promotion_type === 'bundle_set';
  const isBundleFixPrice = isBundleSet && form.discount_type === 'fix_price';
  const showBundlePrice = isBundleFixPrice;
  const showBundleDiscount = isBundleSet && form.discount_type !== 'fix_price';
  const showTiers = form.promotion_type === 'qty_discount';

  const dealStatus: DealStatus = shopeeDeals.some(d => d.status === 'ongoing')
    ? 'ongoing'
    : shopeeDeals.some(d => d.status === 'upcoming')
      ? 'upcoming'
      : shopeeDeals.length > 0
        ? 'expired'
        : 'no_deal';
  const editRules: EditableFields = getEditableFields(dealStatus);
  const typeConfig: PromotionTypeConfig = getTypeConfig(form.promotion_type as 'bundle_set' | 'buy_get_free' | 'buy_get_discount' | 'qty_discount');
  const hasOngoingDeal = dealStatus === 'ongoing';
  const availableRoles = getAvailableRoles();

  // ─── Table Adapters ──────────────────────────────────────────

  const itemsTableColumns: ColumnKey[] = (() => {
    const cols: ColumnKey[] = [];
    if (availableRoles.length > 1) cols.push('role');
    cols.push('qty');
    if (form.promotion_type === 'buy_get_discount') cols.push('special_price');
    return cols;
  })();

  const roleOpts = availableRoles.map(r => ({ id: r, label: (({ main: 'สินค้าหลัก', component: 'สินค้าในเซ็ต', gift: 'ของแถม (ฟรี)', discounted: 'ราคาพิเศษ' }) as Record<string, string>)[r] || r }));

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
    max_price: item.max_price || null,
    role: item.role,
    special_price: item.special_price,
  }));

  const handleTableAdd = useCallback((product: ProductSearchItem) => {
    handleAddProduct(product);
  }, [handleAddProduct]);

  const handleTableUpdateField = useCallback((idx: number, field: keyof TableItem, value: number | string) => {
    const item = form.items[idx];
    if (!item) return;
    if (field === 'quantity') {
      handleUpdateItem(item.key, 'quantity', Math.max(1, typeof value === 'number' ? value : parseInt(value as string) || 1));
    } else if (field === 'role') {
      handleUpdateItem(item.key, 'role', value);
    } else if (field === 'special_price') {
      handleUpdateItem(item.key, 'special_price', typeof value === 'number' ? value : parseFloat(value as string) || null);
    }
  }, [form.items, handleUpdateItem]);

  const handleTableRemove = useCallback((idx: number) => {
    const item = form.items[idx];
    if (item) handleRemoveItem(item.key);
  }, [form.items, handleRemoveItem]);

  // ─── Validation & Submit ──────────────────────────────────────────

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    const newItemErrorKeys = new Set<string>();

    const validationErrors = validateForShopee(
      form.promotion_type as 'bundle_set' | 'buy_get_free' | 'buy_get_discount' | 'qty_discount',
      {
        name: form.name,
        startDate: form.dateRange?.startDate ? String(form.dateRange.startDate) : null,
        endDate: form.dateRange?.endDate ? String(form.dateRange.endDate) : null,
        discountType: form.discount_type as 'fix_price' | 'percent' | 'fixed_discount',
        discountValue: parseFloat(form.discount_value) || 0,
        bundlePrice: parseFloat(form.bundle_price) || 0,
        itemCount: form.items.length,
        purchaseLimit: form.purchase_limit ? parseInt(form.purchase_limit) : undefined,
        tiers: form.tiers.map(t => ({ min_qty: t.min_qty, discount_type: t.discount_type, discount_value: t.discount_value })),
        totalDefaultPrice,
      },
    );
    for (const err of validationErrors) {
      newErrors[err.field] = err.message;
    }

    if (form.promotion_type === 'buy_get_free') {
      if (!form.items.some(i => i.role === 'main')) newErrors.items = 'ต้องมีสินค้าหลักอย่างน้อย 1 ตัว';
      else if (!form.items.some(i => i.role === 'gift')) newErrors.items = 'ต้องมีของแถมอย่างน้อย 1 ตัว';
    } else if (form.promotion_type === 'buy_get_discount') {
      if (!form.items.some(i => i.role === 'main')) newErrors.items = 'ต้องมีสินค้าหลักอย่างน้อย 1 ตัว';
      else if (!form.items.some(i => i.role === 'discounted')) newErrors.items = 'ต้องมีสินค้าราคาพิเศษอย่างน้อย 1 ตัว';
      else {
        const badItems = form.items.filter(i => {
          if (i.role !== 'discounted') return false;
          const dv = i.discount_value ? parseFloat(i.discount_value) : 0;
          if (!dv || dv <= 0) return true;
          if (i.special_price == null || i.special_price <= 0) return true;
          if (i.special_price >= i.default_price) return true;
          return false;
        });
        if (badItems.length > 0) {
          for (const item of badItems) newItemErrorKeys.add(item.key);
          newErrors.items = `สินค้าราคาพิเศษ ${badItems.length} รายการยังไม่ได้ระบุส่วนลด หรือส่วนลดไม่ถูกต้อง`;
        }
      }
    }

    setItemErrorKeys(newItemErrorKeys);

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (newItemErrorKeys.size > 0) {
        const errorItems = form.items.filter(i => newItemErrorKeys.has(i.key));
        const productIdsToExpand = new Set(errorItems.map(i => i.product_id).filter(Boolean) as string[]);
        if (productIdsToExpand.size > 0) {
          setExpandedYProducts(prev => new Set([...prev, ...productIdsToExpand]));
        }
      }
      const messages = Object.values(newErrors);
      showToast(messages.length === 1 ? messages[0] : `กรุณาแก้ไข ${messages.length} รายการก่อนบันทึก`, 'error');
      setTimeout(() => {
        const el = document.querySelector('[data-error="true"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }

    const enabledShops = platformPrices.filter(p => p.is_enabled);
    if (!isEdit && enabledShops.length > 0) {
      const shopNames = enabledShops.map(p => {
        const acc = marketplaceAccounts.find(a => a.id === p.account_id);
        return acc?.shop_name || p.account_id;
      }).join(', ');
      setConfirmDialog({
        message: `สร้างโปรโมชั่นและ deal บน Shopee?`,
        content: (
          <div className="space-y-3 mt-2">
            <p className="text-sm text-gray-500 dark:text-slate-400">
              จะสร้าง deal ให้ร้าน: <span className="font-medium text-gray-700 dark:text-slate-200">{shopNames}</span>
            </p>
            <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-400 space-y-1">
              <p className="font-medium">สิ่งที่แก้ไม่ได้หลังสร้าง deal (ถ้า deal เริ่มแล้ว):</p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>ราคา / ส่วนลด</li>
                <li>วันเริ่มต้น</li>
                <li>จำนวนขั้นต่ำ</li>
              </ul>
              <p>ถ้าต้องการแก้ → ปิด deal แล้วสร้างใหม่</p>
            </div>
          </div>
        ),
        confirmLabel: 'สร้างโปรโมชั่น',
        onConfirm: () => {
          setConfirmDialog(null);
          doSubmit();
        },
      });
      return;
    }
    doSubmit();
  };

  const doSubmit = async () => {
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
        discount_type: isBundleSet ? form.discount_type : null,
        discount_value: isBundleSet && form.discount_type !== 'fix_price' ? (parseFloat(form.discount_value) || null) : null,
        purchase_min_spend: form.promotion_type === 'buy_get_free' ? 0 : (parseFloat(form.purchase_min_spend) || null),
        per_gift_num: form.promotion_type === 'buy_get_free'
          ? (form.items.filter(i => i.role === 'gift').length || 1)
          : (parseInt(form.per_gift_num) || null),
        purchase_limit: parseInt(form.purchase_limit) || null,
        items: form.items.map((item, idx) => {
          let finalPrice = item.special_price;
          if (item.price_mode === 'percent' && item.discount_value) {
            const pct = parseFloat(item.discount_value) || 0;
            finalPrice = Math.round(item.default_price * (1 - pct / 100));
          } else if (item.price_mode === 'fixed_discount' && item.discount_value) {
            const disc = parseFloat(item.discount_value) || 0;
            finalPrice = Math.max(0, item.default_price - disc);
          } else if (item.price_mode === 'fixed_price' && item.discount_value) {
            finalPrice = parseFloat(item.discount_value) || null;
          }
          return {
            variation_id: (item.variation_id && item.variation_id !== item.product_id) ? item.variation_id : null,
            product_id: item.product_id || null,
            role: item.role,
            quantity: item.quantity,
            special_price: finalPrice,
            sub_item_limit: item.sub_item_limit,
            discount_type: item.price_mode || null,
            discount_input: item.discount_value ? parseFloat(item.discount_value) : null,
            sort_order: idx,
          };
        }),
        tiers: form.tiers.map(t => ({
          min_qty: t.min_qty,
          discount_type: t.discount_type,
          discount_value: t.discount_value,
        })),
        platforms: platformPrices
          .map(p => {
            const account = marketplaceAccounts.find(a => a.id === p.account_id);
            return {
              platform: account?.platform || 'shopee',
              account_id: p.account_id,
              bundle_price: parseFloat(p.bundle_price) || null,
              is_enabled: p.is_enabled,
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

      if (isEdit) {
        if (shopeeDeals.length > 0 && hasLocalChanges) {
          setSavedPromotionId(pid);
          setShowSyncConfirm(true);
          return;
        }
        router.push('/promotions');
      } else {
        const enabledPlatforms = platformPrices.filter(p => p.is_enabled);
        if (enabledPlatforms.length > 0) {
          setSavedPromotionId(pid);
          setPushSingleAccountId(undefined);
          setShowPushModal(true);
          return;
        }
        router.push('/promotions');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Sync ──────────────────────────────────────────

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

      const results = (data.results || []).map((r: { account_id: string; success: boolean; error?: string; shop_name?: string; details?: string[] }) => ({
        shop_name: r.shop_name || marketplaceAccounts.find(a => a.id === r.account_id)?.shop_name || r.account_id,
        success: r.success,
        error: r.error,
        details: r.details,
      }));
      setSyncResults(results);

      try {
        const refreshRes = await apiFetch(`/api/promotions/${pid}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setShopeeDeals(refreshData.marketplace_deals || []);
        }
      } catch { /* silent */ }

      const platformsForSnapshot = platformPrices
        .filter(p => p.is_enabled)
        .map(p => ({ account_id: p.account_id, bundle_price: parseFloat(p.bundle_price) || null }));
      setInitialFormSnapshot(JSON.stringify({
        name: form.name, bundle_price: parseFloat(form.bundle_price) || null,
        discount_type: form.discount_type, discount_value: parseFloat(form.discount_value) || null,
        items: form.items.map(i => ({ variation_id: i.variation_id, role: i.role, quantity: i.quantity, special_price: i.special_price, sub_item_limit: i.sub_item_limit })),
        platforms: platformsForSnapshot,
      }));
      setHasLocalChanges(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      setSyncResults([{ shop_name: 'ทั้งหมด', success: false, error: message }]);
    } finally {
      setSyncingShopee(false);
    }
  };

  return {
    // Core
    router,
    promotionId,
    isEdit,
    bkkToday,
    loadingPromo,

    // Form state
    form, setForm,
    promotionImages, setPromotionImages,
    products, loadingProducts,
    saving,
    errors, setErrors,
    itemErrorKeys,

    // Marketplace
    marketplaceAccounts,
    platformPrices, setPlatformPrices,
    activePlatformTab, setActivePlatformTab,

    // Shopee deals
    shopeeDeals, setShopeeDeals,
    showSyncConfirm, setShowSyncConfirm,
    syncingShopee,
    syncResults, setSyncResults,

    // UI state
    confirmDialog, setConfirmDialog,
    savedPromotionId, setSavedPromotionId,
    hasLocalChanges,
    showPushModal, setShowPushModal,
    togglingShop, setTogglingShop,
    pushSingleAccountId, setPushSingleAccountId,
    togglePriceRef,
    expandedYProducts, setExpandedYProducts,
    lightboxSrc, setLightboxSrc,

    // Derived
    isBundleSet,
    isBundleFixPrice,
    showBundlePrice,
    showBundleDiscount,
    showTiers,
    dealStatus,
    editRules,
    typeConfig,
    hasOngoingDeal,
    availableRoles,
    totalDefaultPrice,
    bundlePrice,
    discount,
    discountPercent,

    // Table adapters
    tableItems,
    itemsTableColumns,
    roleOpts,

    // Handlers
    handleAddProduct,
    handleAddProductWithVariations,
    handleAddMainProduct,
    handleRemoveProductVariations,
    handleRemoveItem,
    handleUpdateItem,
    handleAddTier,
    handleRemoveTier,
    handleUpdateTier,
    handleTableAdd,
    handleTableUpdateField,
    handleTableRemove,
    handleSubmit,
    handleSyncShopee,
    showToast,
  };
}

export type UsePromotionFormReturn = ReturnType<typeof usePromotionForm>;
