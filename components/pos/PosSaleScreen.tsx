// Path: components/pos/PosSaleScreen.tsx
// Shared sale screen (product grid + cart) used by /pos (terminal POS).
// Owns product/promotion/cart/scan state; checkout behavior is supplied by the caller
// via onCheckout — this component never creates orders or touches stock itself.
'use client';

import {
  forwardRef, useImperativeHandle, useState, useEffect, useCallback, useRef, useMemo,
  type ReactNode,
} from 'react';
import { ShoppingCart, Package, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { calculateQtyDiscount, type PromotionTier } from '@/lib/promotions';
import PromotionSelectModal, { type PromoData, type PromoItemData, type PromotionSelectResult } from '@/components/ui/PromotionSelectModal';
import ProductGrid, { PosProduct } from './ProductGrid';
import CategoryTabs from './CategoryTabs';
import BarcodeInput from './BarcodeInput';
import CartPanel, { CartItem, CartItemComponent } from './CartPanel';

interface FilterItem {
  id: string;
  name: string;
}

export interface CheckoutPayload {
  items: CartItem[];
  itemsSubtotal: number;
  orderDiscountAmount: number;
  totalAmount: number;
}

export interface PosSaleScreenHandle {
  /** Clear cart + order discount and return mobile view to the product tab */
  clearCart: () => void;
  /** Re-fetch the product grid (e.g. after checkout changed stock) */
  refreshProducts: () => void;
}

interface PosSaleScreenProps {
  /** Stock source; null = no stock tracking (unlimited) */
  warehouseId: string | null;
  /** Rendered above the sale screen (terminal info, shift actions, ...) */
  topBar: ReactNode;
  customerName: string | null;
  onOpenCustomerSearch: () => void;
  onCheckout: (payload: CheckoutPayload) => void;
  vatRegistered: boolean;
  /** Merge company promotions into the grid (default true; PC counter mode passes false) */
  enablePromotions?: boolean;
  /** Extra query params appended to /api/pos/products (e.g. counter_id for stock overlay) */
  extraProductParams?: Record<string, string>;
}

const PosSaleScreen = forwardRef<PosSaleScreenHandle, PosSaleScreenProps>(function PosSaleScreen(
  { warehouseId, topBar, customerName, onOpenCustomerSearch, onCheckout, vatRegistered, enablePromotions = true, extraProductParams },
  ref,
) {
  // Products & Promotions
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [categories, setCategories] = useState<FilterItem[]>([]);
  const [brands, setBrands] = useState<FilterItem[]>([]);

  // Cart
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [promoModal, setPromoModal] = useState<{ promo: PromoData } | null>(null);
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState<'percent' | 'amount'>('amount');

  // Stock config
  const [allowOversell, setAllowOversell] = useState(true);

  // Mobile tab
  const [mobileTab, setMobileTab] = useState<'products' | 'cart'>('products');

  // Scan feedback
  const [scanAlert, setScanAlert] = useState<{ type: 'success' | 'error'; message: string; code: string } | null>(null);
  const scanAlertTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const playScanSound = useCallback((type: 'success' | 'error') => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.value = 1200;
        gain.gain.value = 0.15;
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else {
        osc.type = 'square';
        osc.frequency.value = 400;
        gain.gain.value = 0.2;
        osc.start();
        osc.frequency.setValueAtTime(300, ctx.currentTime + 0.15);
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {}
  }, []);

  const showScanAlert = useCallback((type: 'success' | 'error', message: string, code: string) => {
    if (scanAlertTimer.current) clearTimeout(scanAlertTimer.current);
    setScanAlert({ type, message, code });
    playScanSound(type);
    const duration = type === 'success' ? 1500 : 4000;
    scanAlertTimer.current = setTimeout(() => setScanAlert(null), duration);
  }, [playScanSound]);

  // Fetch stock config
  useEffect(() => {
    // No warehouse = no stock tracking, always allow
    if (!warehouseId) {
      setAllowOversell(true);
      return;
    }
    (async () => {
      try {
        const res = await apiFetch('/api/warehouses');
        const data = await res.json();
        setAllowOversell(data.stockConfig?.allowOversell !== false);
      } catch {}
    })();
  }, [warehouseId]);

  // Fetch categories & brands
  useEffect(() => {
    (async () => {
      try {
        const [catRes, brandRes] = await Promise.all([
          apiFetch('/api/categories'),
          apiFetch('/api/brands'),
        ]);
        const catData = await catRes.json();
        const brandData = await brandRes.json();
        setCategories((catData.categories || []).filter((c: any) => c.is_active));
        setBrands((brandData.data || []).map((b: any) => ({ id: b.id, name: b.name })));
      } catch {}
    })();
  }, []);

  // Fetch products
  const fetchProducts = useCallback(async (search?: string) => {
    setLoadingProducts(true);
    try {
      const params = new URLSearchParams(extraProductParams || {});
      if (warehouseId) params.set('warehouse_id', warehouseId);
      const q = search ?? searchQuery;
      if (q) params.set('search', q);
      if (selectedCategory) params.set('category_id', selectedCategory);
      if (selectedBrand) params.set('brand_id', selectedBrand);

      const res = await apiFetch(`/api/pos/products?${params}`);
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [warehouseId, searchQuery, selectedCategory, selectedBrand]);

  // Fetch promotions once on mount
  useEffect(() => {
    if (!enablePromotions) return;
    (async () => {
      try {
        const res = await apiFetch('/api/promotions?status=active&limit=200');
        if (res.ok) {
          const data = await res.json();
          setPromotions(data.promotions || []);
        }
      } catch { /* silent */ }
    })();
  }, [enablePromotions]);

  // Merge promotions into product grid
  const allGridProducts: PosProduct[] = useMemo(() => {
    // Only show promotions when no category/brand filter active
    if (selectedCategory || selectedBrand) return products;
    const promoProducts: PosProduct[] = promotions.map(p => {
      const items = p.items || [];
      let displayPrice = 0;
      if (p.promotion_type === 'bundle_set' && p.bundle_price) {
        displayPrice = p.bundle_price;
      } else if (p.promotion_type === 'bundle_set' && p.discount_type === 'percent') {
        displayPrice = items.reduce((s: number, i: any) => s + (i.default_price || 0) * (i.quantity || 1), 0) * (1 - (p.discount_value || 0) / 100);
      } else if (p.promotion_type === 'bundle_set' && p.discount_type === 'fixed_discount') {
        displayPrice = items.reduce((s: number, i: any) => s + Math.max(0, (i.default_price || 0) - (p.discount_value || 0)) * (i.quantity || 1), 0);
      } else {
        displayPrice = items.reduce((s: number, i: any) => {
          if (i.role === 'gift') return s;
          return s + (i.special_price ?? i.default_price ?? 0) * (i.quantity || 1);
        }, 0);
      }
      const mainItem = items.find((i: any) => i.role === 'main' || i.role === 'component') || items[0];
      return {
        variation_id: `promo_${p.id}`,
        product_id: `promo_${p.id}`,
        product_code: 'โปรโมชั่น',
        product_name: `🎁 ${p.name}`,
        variation_label: '',
        barcode: null,
        price: Math.round(displayPrice * 100) / 100,
        original_price: displayPrice,
        stock: 999,
        category_id: null,
        image_url: p.image || mainItem?.image || null,
      };
    });
    return [...promoProducts, ...products];
  }, [products, promotions, selectedCategory, selectedBrand]);

  // Fetch on warehouse/category/brand change (immediate)
  useEffect(() => {
    fetchProducts();
  }, [warehouseId, selectedCategory, selectedBrand]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search — only fetch after user stops typing for 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle barcode scan
  const handleBarcodeScan = async (code: string) => {
    try {
      // Check if input looks like a barcode (digits only, or digits with dashes)
      const looksLikeBarcode = /^[\d\-]+$/.test(code) && code.length >= 6;

      if (looksLikeBarcode) {
        // Try exact barcode match
        const params = new URLSearchParams({ ...(extraProductParams || {}), barcode: code });
        if (warehouseId) params.set('warehouse_id', warehouseId);
        const res = await apiFetch(`/api/pos/products?${params}`);
        const data = await res.json();
        if (data.products && data.products.length > 0) {
          addToCart(data.products[0]);
          showScanAlert('success', data.products[0].product_name, code);
          setSearchQuery('');
          return;
        }
      }

      // Search by name/code/SKU — auto-add if exactly 1 result
      const searchParams = new URLSearchParams({ ...(extraProductParams || {}), search: code });
      if (warehouseId) searchParams.set('warehouse_id', warehouseId);
      const searchRes = await apiFetch(`/api/pos/products?${searchParams}`);
      const searchData = await searchRes.json();
      if (searchData.products && searchData.products.length === 1) {
        addToCart(searchData.products[0]);
        showScanAlert('success', searchData.products[0].product_name, code);
        setSearchQuery('');
      } else if (searchData.products && searchData.products.length === 0) {
        showScanAlert('error', 'ไม่พบสินค้าจากรหัสนี้', code);
      }
      // Multiple results — search query stays as-is, product grid already shows filtered results
    } catch {
      showScanAlert('error', 'เกิดข้อผิดพลาดในการค้นหา', code);
    }
  };

  // Cart management
  const addToCart = (product: PosProduct) => {
    // Promotion handling — open modal
    if (product.variation_id.startsWith('promo_')) {
      const promoId = product.variation_id.replace('promo_', '');
      const promo = promotions.find((p: any) => p.id === promoId);
      if (!promo) return;

      if (cartItems.some(i => i.promotion_id === promoId)) return;

      setPromoModal({ promo: promo as PromoData });
      return;
    }

    // Normal product
    setCartItems(prev => {
      const existing = prev.find(i => i.variation_id === product.variation_id && !i.promotion_id);
      const hasStockLimit = product.stock >= 0; // -1 = unlimited (no warehouse)
      if (existing) {
        if (!allowOversell && hasStockLimit && existing.quantity >= product.stock) return prev;
        return prev.map(i =>
          i.variation_id === product.variation_id && !i.promotion_id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, {
        variation_id: product.variation_id,
        product_id: product.product_id,
        product_code: product.product_code,
        product_name: product.product_name,
        variation_label: product.variation_label,
        quantity: 1,
        unit_price: product.price,
        discount_type: 'percent' as const,
        discount_value: 0,
        max_stock: product.stock,
        image_url: product.image_url,
      }];
    });
  };

  const handlePosPromoConfirm = (result: PromotionSelectResult) => {
    const promo = result.promotion;
    const promoId = promo.id;

    if (cartItems.some(i => i.promotion_id === promoId)) {
      setPromoModal(null);
      return;
    }

    const items = promo.items || [];
    const mainItem = items.find((i: any) => i.role === 'main' || i.role === 'component') || items[0];

    // Build components — for buy_get_discount, only include selected discounted items
    let displayItems = items;
    if (promo.promotion_type === 'buy_get_discount') {
      const mainAndComp = items.filter((i: any) => i.role !== 'discounted');
      const selectedDisc = result.selectedDiscounted.map(sel => {
        const orig = items.find((i: any) => i.variation_id === sel.variation_id);
        return orig ? { ...orig, quantity: sel.quantity } : null;
      }).filter((x): x is PromoItemData => x !== null);
      displayItems = [...mainAndComp, ...selectedDisc];
    }

    const components: CartItemComponent[] = displayItems.map((item: any) => ({
      variation_id: item.variation_id || '',
      product_name: item.product_name || '',
      product_code: item.product_code || '',
      role: item.role || 'main',
      quantity: item.quantity || 1,
      default_price: item.default_price || 0,
      special_price: item.special_price || null,
    }));

    // Calculate price based on type
    let unitPrice = 0;
    let discountValue = 0;
    const qty = result.quantity;
    const fullPrice = displayItems.reduce((s: number, i: any) => s + (i.default_price || 0) * (i.quantity || 1), 0);

    if (promo.promotion_type === 'bundle_set') {
      unitPrice = fullPrice;
      let promoPrice = fullPrice;
      if (promo.bundle_price) {
        promoPrice = promo.bundle_price;
      } else {
        if (promo.discount_type === 'percent') promoPrice = fullPrice * (1 - (promo.discount_value || 0) / 100);
        else if (promo.discount_type === 'fixed_discount') promoPrice = items.reduce((s: number, i: any) => s + Math.max(0, (i.default_price || 0) - (promo.discount_value || 0)) * (i.quantity || 1), 0);
      }
      discountValue = Math.round((fullPrice - promoPrice) * 100) / 100;
    } else if (promo.promotion_type === 'buy_get_free') {
      unitPrice = fullPrice;
      const giftValue = items.filter((i: any) => i.role === 'gift').reduce((s: number, i: any) => s + (i.default_price || 0) * (i.quantity || 1), 0);
      discountValue = Math.round(giftValue * 100) / 100;
    } else if (promo.promotion_type === 'buy_get_discount') {
      unitPrice = fullPrice;
      const discSavings = result.selectedDiscounted.reduce((s, sel) => {
        const orig = items.find((i: any) => i.variation_id === sel.variation_id);
        if (!orig) return s;
        return s + ((orig.default_price || 0) - (orig.special_price ?? orig.default_price ?? 0)) * sel.quantity;
      }, 0);
      discountValue = Math.round(discSavings * 100) / 100;
    } else if (promo.promotion_type === 'qty_discount') {
      const basePrice = items[0]?.default_price || 0;
      unitPrice = basePrice;
      const tiers = promo.tiers || [];
      if (tiers.length > 0) {
        const discountedPerUnit = calculateQtyDiscount(tiers as PromotionTier[], qty, basePrice);
        discountValue = Math.round((basePrice - discountedPerUnit) * 100) / 100;
      }
    }

    setCartItems(prev => [...prev, {
      variation_id: mainItem?.variation_id || promoId,
      product_id: mainItem?.product_id || promoId,
      product_code: 'โปรโมชั่น',
      product_name: promo.name,
      variation_label: undefined,
      quantity: promo.promotion_type === 'qty_discount' ? qty : 1,
      unit_price: unitPrice,
      discount_type: 'amount' as const,
      discount_value: discountValue,
      max_stock: 999,
      image_url: promo.image || mainItem?.image || null,
      promotion_id: promoId,
      promotion_name: promo.name,
      promotion_type: promo.promotion_type,
      promotion_components: components,
      promotion_tiers: promo.tiers || [],
    }]);
    setPromoModal(null);
  };

  const updateQuantity = (variationId: string, delta: number) => {
    setCartItems(prev =>
      prev
        .map(i => {
          if (i.variation_id !== variationId) return i;
          const newQty = i.quantity + delta;
          if (newQty <= 0) return { ...i, quantity: 0 };
          // Recalculate qty_discount: keep unit_price, update discount_value
          if (i.promotion_type === 'qty_discount' && i.promotion_tiers && i.promotion_tiers.length > 0) {
            const originalPrice = i.promotion_components?.[0]?.default_price || i.unit_price;
            const discountedPerUnit = calculateQtyDiscount(i.promotion_tiers as PromotionTier[], newQty, originalPrice);
            const discVal = Math.round((originalPrice - discountedPerUnit) * newQty * 100) / 100;
            return { ...i, quantity: newQty, discount_type: 'amount' as const, discount_value: discVal };
          }
          return { ...i, quantity: newQty };
        })
        .filter(i => i.quantity > 0)
    );
  };

  const removeItem = (variationId: string) => {
    setCartItems(prev => prev.filter(i => i.variation_id !== variationId));
  };

  const updateItemDiscount = (variationId: string, type: 'percent' | 'amount', value: number) => {
    setCartItems(prev =>
      prev.map(i => {
        if (i.variation_id !== variationId || i.promotion_id) return i;
        return { ...i, discount_type: type, discount_value: value };
      })
    );
  };

  // Calculate totals
  const getLineTotal = (item: CartItem) => {
    const sub = item.quantity * item.unit_price;
    if (item.discount_type === 'amount') return sub - (item.discount_value || 0);
    return sub - sub * ((item.discount_value || 0) / 100);
  };
  const itemsSubtotal = cartItems.reduce((s, i) => s + getLineTotal(i), 0);
  const orderDiscountAmount = orderDiscountType === 'percent'
    ? Math.round(itemsSubtotal * (orderDiscount / 100) * 100) / 100
    : orderDiscount;
  const totalAmount = itemsSubtotal - orderDiscountAmount;

  const clearCart = useCallback(() => {
    setCartItems([]);
    setOrderDiscount(0);
    setOrderDiscountType('amount');
    setMobileTab('products');
  }, []);

  useImperativeHandle(ref, () => ({
    clearCart,
    refreshProducts: () => { fetchProducts(); },
  }), [clearCart, fetchProducts]);

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-[#0F172A] overflow-hidden">
      {topBar}

      {/* Mobile tab bar */}
      <div className="flex md:hidden border-b border-gray-200 dark:border-gray-700/50 flex-shrink-0 bg-white dark:bg-transparent">
        <button
          onClick={() => setMobileTab('products')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            mobileTab === 'products'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <Package className="w-4 h-4" />
          สินค้า
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors relative ${
            mobileTab === 'cart'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          ตะกร้า
          {cartItems.length > 0 && (
            <span className="absolute top-2 right-[calc(50%-40px)] bg-primary text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {cartItems.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — Products */}
        <div className={`flex-1 flex flex-col p-4 overflow-hidden ${mobileTab !== 'products' ? 'hidden md:flex' : ''}`}>
          <BarcodeInput
            onBarcodeScan={handleBarcodeScan}
            onSearchChange={setSearchQuery}
            searchValue={searchQuery}
          />

          <div className="mt-3">
            <CategoryTabs
              categories={categories}
              brands={brands}
              selectedCategoryId={selectedCategory}
              selectedBrandId={selectedBrand}
              onSelectCategory={setSelectedCategory}
              onSelectBrand={setSelectedBrand}
            />
          </div>

          <div className="flex-1 overflow-y-auto mt-3 -mr-2 pr-2">
            <ProductGrid
              products={allGridProducts}
              onAddToCart={addToCart}
              loading={loadingProducts}
              allowOversell={allowOversell}
            />
          </div>
        </div>

        {/* Right — Cart */}
        <div className={`md:w-[32%] md:min-w-[320px] md:max-w-[420px] md:border-l border-gray-200 dark:border-gray-700/50 p-4 flex flex-col overflow-hidden bg-gray-50 dark:bg-[#1E293B]/50 ${mobileTab !== 'cart' ? 'hidden md:flex' : 'flex-1'}`}>
          <CartPanel
            items={cartItems}
            orderDiscount={orderDiscount}
            orderDiscountType={orderDiscountType}
            customerName={customerName}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            onUpdateItemDiscount={updateItemDiscount}
            onUpdateOrderDiscount={setOrderDiscount}
            onUpdateOrderDiscountType={setOrderDiscountType}
            onOpenCustomerSearch={onOpenCustomerSearch}
            onCheckout={() => onCheckout({ items: cartItems, itemsSubtotal, orderDiscountAmount, totalAmount })}
            allowOversell={allowOversell}
            vatRegistered={vatRegistered}
          />
        </div>
      </div>

      {/* Scan Alert */}
      {scanAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setScanAlert(null)}>
          <div
            className={`relative mx-4 w-full max-w-sm rounded-2xl p-6 shadow-2xl ${
              scanAlert.type === 'success' ? 'bg-white dark:bg-[#1E293B] border border-green-500/30' : 'bg-white dark:bg-[#1E293B] border border-red-500/30'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setScanAlert(null)}
              className="absolute top-3 right-3 p-1 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center gap-3">
              {scanAlert.type === 'success' ? (
                <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>
              )}
              <p className={`text-lg font-semibold ${scanAlert.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {scanAlert.type === 'success' ? 'เพิ่มสินค้าแล้ว' : 'ไม่พบสินค้า'}
              </p>
              <p className="text-gray-600 dark:text-gray-300 text-sm">{scanAlert.message}</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs font-mono">{scanAlert.code}</p>
              {scanAlert.type === 'error' && (
                <button
                  onClick={() => setScanAlert(null)}
                  className="mt-2 px-6 py-2 bg-gray-100 dark:bg-white/10 rounded-lg text-gray-700 dark:text-white text-sm hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                >
                  ตกลง
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Promotion Select Modal */}
      {promoModal && (
        <PromotionSelectModal
          promotion={promoModal.promo}
          onConfirm={handlePosPromoConfirm}
          onClose={() => setPromoModal(null)}
        />
      )}
    </div>
  );
});

export default PosSaleScreen;
