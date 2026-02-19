// Path: app/pos/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { apiFetch } from '@/lib/api-client';
import { ArrowLeft, Clock, ListOrdered, Loader2, ShoppingCart, Package, AlertTriangle, CheckCircle, X } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

import SessionModal from './components/SessionModal';
import ProductGrid, { PosProduct } from './components/ProductGrid';
import CategoryTabs from './components/CategoryTabs';
import BarcodeInput from './components/BarcodeInput';
import CartPanel, { CartItem } from './components/CartPanel';
import PaymentModal from './components/PaymentModal';
import Receipt from './components/Receipt';
import VariationPicker from './components/VariationPicker';
import CustomerSearch from './components/CustomerSearch';

interface PosSession {
  id: string;
  warehouse_id: string | null;
  terminal_id: string | null;
  cashier_name: string;
  opening_float: number;
  total_sales: number;
  total_orders: number;
  total_voids: number;
  payment_summary: Record<string, number>;
  warehouse: { id: string; name: string; code: string | null } | null;
  terminal: { id: string; name: string; code: string | null } | null;
}

interface Category {
  id: string;
  name: string;
}

interface Customer {
  id: string;
  name: string;
  customer_code: string;
  phone?: string;
}

export default function PosPage() {
  const router = useRouter();
  const { loading: authLoading, userProfile } = useAuth();
  const { currentCompany } = useCompany();

  // Session state
  const [session, setSession] = useState<PosSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionModalMode, setSessionModalMode] = useState<'open' | 'close'>('open');
  const [sessionLoading, setSessionLoading] = useState(false);

  // Products
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // Cart
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState<'percent' | 'amount'>('amount');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  // Variation picker
  const [variationPickerProduct, setVariationPickerProduct] = useState<string | null>(null);
  const [variationOptions, setVariationOptions] = useState<PosProduct[]>([]);

  // Payment
  const [showPayment, setShowPayment] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Receipt
  const [receiptData, setReceiptData] = useState<any>(null);

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

  // Check for existing open session
  useEffect(() => {
    if (authLoading || !userProfile) return;

    (async () => {
      try {
        const res = await apiFetch('/api/pos/sessions?status=open');
        const data = await res.json();
        const sessions = data.sessions || [];
        if (sessions.length > 0) {
          setSession(sessions[0]);
        } else {
          setShowSessionModal(true);
          setSessionModalMode('open');
        }
      } catch {
        setShowSessionModal(true);
        setSessionModalMode('open');
      } finally {
        setLoadingSession(false);
      }
    })();
  }, [authLoading, userProfile]);

  // Fetch stock config
  useEffect(() => {
    if (!session) return;
    // No warehouse = no stock tracking, always allow
    if (!session.warehouse_id) {
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
  }, [session]);

  // Fetch categories
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/categories');
        const data = await res.json();
        setCategories((data.categories || []).filter((c: any) => c.is_active));
      } catch {}
    })();
  }, []);

  // Fetch products
  const fetchProducts = useCallback(async (search?: string) => {
    if (!session) return;
    setLoadingProducts(true);
    try {
      const params = new URLSearchParams();
      if (session.warehouse_id) params.set('warehouse_id', session.warehouse_id);
      const q = search ?? searchQuery;
      if (q) params.set('search', q);
      if (selectedCategory) params.set('category_id', selectedCategory);

      const res = await apiFetch(`/api/pos/products?${params}`);
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [session, searchQuery, selectedCategory]);

  // Fetch on session/category change (immediate)
  useEffect(() => {
    if (session) fetchProducts();
  }, [session, selectedCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search — only fetch after user stops typing for 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      if (session) fetchProducts();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle barcode scan
  const handleBarcodeScan = async (code: string) => {
    if (!session) return;
    try {
      // Check if input looks like a barcode (digits only, or digits with dashes)
      const looksLikeBarcode = /^[\d\-]+$/.test(code) && code.length >= 6;

      if (looksLikeBarcode) {
        // Try exact barcode match
        const params = new URLSearchParams({ barcode: code });
        if (session.warehouse_id) params.set('warehouse_id', session.warehouse_id);
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
      const searchParams = new URLSearchParams({ search: code });
      if (session.warehouse_id) searchParams.set('warehouse_id', session.warehouse_id);
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
    // Check if product has variations (same product_id, different variation_ids)
    const sameProductVariations = products.filter(p => p.product_id === product.product_id);
    if (sameProductVariations.length > 1 && !variationPickerProduct) {
      setVariationPickerProduct(product.product_id);
      setVariationOptions(sameProductVariations);
      return;
    }

    setCartItems(prev => {
      const existing = prev.find(i => i.variation_id === product.variation_id);
      const hasStockLimit = product.stock >= 0; // -1 = unlimited (no warehouse)
      if (existing) {
        if (!allowOversell && hasStockLimit && existing.quantity >= product.stock) return prev;
        return prev.map(i =>
          i.variation_id === product.variation_id
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

  const updateQuantity = (variationId: string, delta: number) => {
    setCartItems(prev =>
      prev
        .map(i => i.variation_id === variationId ? { ...i, quantity: i.quantity + delta } : i)
        .filter(i => i.quantity > 0)
    );
  };

  const removeItem = (variationId: string) => {
    setCartItems(prev => prev.filter(i => i.variation_id !== variationId));
  };

  const updateItemDiscount = (variationId: string, type: 'percent' | 'amount', value: number) => {
    setCartItems(prev =>
      prev.map(i => i.variation_id === variationId ? { ...i, discount_type: type, discount_value: value } : i)
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

  // Open/Close shift handlers
  const handleOpenShift = async (terminalId: string, openingFloat: number) => {
    setSessionLoading(true);
    try {
      const res = await apiFetch('/api/pos/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminal_id: terminalId, opening_float: openingFloat }),
      });
      const data = await res.json();
      if (res.ok && data.session) {
        setSession(data.session);
        setShowSessionModal(false);
      }
    } catch {}
    setSessionLoading(false);
  };

  const handleCloseShift = async (closingCash: number, notes: string) => {
    if (!session) return;
    setSessionLoading(true);
    try {
      const res = await apiFetch('/api/pos/sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id, closing_cash: closingCash, notes }),
      });
      if (res.ok) {
        setSession(null);
        setShowSessionModal(false);
        router.push('/dashboard');
      }
    } catch {}
    setSessionLoading(false);
  };

  // Payment handler
  const handlePayment = async (tenders: any[]) => {
    if (!session) return;
    setPaymentLoading(true);
    try {
      const res = await apiFetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pos_session_id: session.id,
          customer_id: selectedCustomer?.id || null,
          items: cartItems.map(i => ({
            variation_id: i.variation_id,
            product_id: i.product_id,
            product_code: i.product_code,
            product_name: i.product_name,
            variation_label: i.variation_label,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount_type: i.discount_type,
            discount_value: i.discount_value,
          })),
          payments: tenders,
          discount_amount: orderDiscountAmount,
        }),
      });

      const data = await res.json();
      if (res.ok && data.order) {
        setShowPayment(false);

        // Fetch receipt data
        const receiptRes = await apiFetch(`/api/pos/receipt?order_id=${data.order.id}`);
        const receiptJson = await receiptRes.json();
        if (receiptJson.receipt) {
          // Add change amount from cash tenders
          const changeAmount = tenders.reduce((s, t) => s + (t.change_amount || 0), 0);
          setReceiptData({ ...receiptJson.receipt, change_amount: changeAmount });
        }

        // Refresh session totals
        const sessRes = await apiFetch('/api/pos/sessions?status=open');
        const sessData = await sessRes.json();
        if (sessData.sessions?.[0]) setSession(sessData.sessions[0]);

        // Refresh products (stock changed)
        fetchProducts();
      }
    } catch {}
    setPaymentLoading(false);
  };

  // New sale (after receipt)
  const handleNewSale = () => {
    setReceiptData(null);
    setCartItems([]);
    setOrderDiscount(0);
    setOrderDiscountType('amount');
    setSelectedCustomer(null);
  };

  // Loading state
  if (authLoading || loadingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-[#0F172A]">
        <Loader2 className="w-8 h-8 animate-spin text-[#F4511E]" />
      </div>
    );
  }

  // No session — show session modal
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-[#0F172A]">
        <SessionModal
          mode="open"
          onOpenShift={handleOpenShift}
          onCloseShift={() => {}}
          onCancel={() => router.push('/dashboard')}
          loading={sessionLoading}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-[#0F172A] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-[#1E293B] border-b border-gray-200 dark:border-gray-700/50 flex-shrink-0 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {currentCompany?.logo_url && (
            <img
              src={currentCompany.logo_url}
              alt={currentCompany.name}
              className="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-gray-600"
            />
          )}
          <div>
            <p className="text-gray-900 dark:text-white font-bold text-lg leading-tight">
              {session.terminal?.name || session.warehouse?.name || 'POS'}
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-xs">
              {currentCompany?.name ? `${currentCompany.name} • ` : ''}{session.cashier_name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <ThemeToggle iconClassName="w-3.5 h-3.5" className="hidden sm:block" />
          <button
            onClick={() => router.push('/pos/orders')}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-white/10 rounded-lg text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
          >
            <ListOrdered className="w-4 h-4" />
            <span className="hidden sm:inline">รายการขาย</span>
          </button>
          <button
            onClick={() => { setSessionModalMode('close'); setShowSessionModal(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-600/20 rounded-lg text-red-400 text-sm hover:bg-red-600/30 transition-colors"
          >
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">ปิดกะ</span>
          </button>
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="flex md:hidden border-b border-gray-200 dark:border-gray-700/50 flex-shrink-0 bg-white dark:bg-transparent">
        <button
          onClick={() => setMobileTab('products')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            mobileTab === 'products'
              ? 'text-[#F4511E] border-b-2 border-[#F4511E]'
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
              ? 'text-[#F4511E] border-b-2 border-[#F4511E]'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          ตะกร้า
          {cartItems.length > 0 && (
            <span className="absolute top-2 right-[calc(50%-40px)] bg-[#F4511E] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
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
              selectedId={selectedCategory}
              onSelect={setSelectedCategory}
            />
          </div>

          <div className="flex-1 overflow-y-auto mt-3 -mr-2 pr-2">
            <ProductGrid
              products={products}
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
            customerName={selectedCustomer?.name || null}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            onUpdateItemDiscount={updateItemDiscount}
            onUpdateOrderDiscount={setOrderDiscount}
            onUpdateOrderDiscountType={setOrderDiscountType}
            onOpenCustomerSearch={() => setShowCustomerSearch(true)}
            onCheckout={() => setShowPayment(true)}
            allowOversell={allowOversell}
          />
        </div>
      </div>

      {/* Modals */}
      {showSessionModal && (
        <SessionModal
          mode={sessionModalMode}
          session={session}
          onOpenShift={handleOpenShift}
          onCloseShift={handleCloseShift}
          onCancel={() => {
            setShowSessionModal(false);
            if (!session) router.push('/dashboard');
          }}
          loading={sessionLoading}
        />
      )}

      {variationPickerProduct && (
        <VariationPicker
          productName={variationOptions[0]?.product_name || ''}
          variations={variationOptions}
          onSelect={(v) => {
            setVariationPickerProduct(null);
            addToCart(v);
          }}
          onClose={() => setVariationPickerProduct(null)}
        />
      )}

      {showCustomerSearch && (
        <CustomerSearch
          selectedCustomer={selectedCustomer}
          onSelect={setSelectedCustomer}
          onClose={() => setShowCustomerSearch(false)}
        />
      )}

      {showPayment && (
        <PaymentModal
          totalAmount={totalAmount}
          onConfirm={handlePayment}
          onClose={() => setShowPayment(false)}
          loading={paymentLoading}
        />
      )}

      {receiptData && (
        <Receipt
          data={receiptData}
          onClose={() => setReceiptData(null)}
          onNewSale={handleNewSale}
        />
      )}

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
    </div>
  );
}
