'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { getImageUrl } from '@/lib/utils/image';
import ShopeeCategoryPicker from '@/components/shopee/ShopeeCategoryPicker';
import {
  Loader2, Upload, Search, Plus, Minus,
  ChevronLeft, ChevronRight, CheckCircle2, XCircle, ShoppingBag,
  AlertTriangle, ArrowLeft, Pencil,
} from 'lucide-react';

interface ProductItem {
  product_id: string;
  code: string;
  name: string;
  image?: string;
  main_image_url?: string;
  source?: string;
  product_type: string;
  simple_default_price?: number;
  category_id?: string;
  brand_id?: string;
}

interface ExportResultItem {
  success: boolean;
  item_id?: number;
  error?: string;
  product_name?: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface BrandOption {
  id: string;
  name: string;
}

type Step = 'select' | 'configure' | 'exporting' | 'done';

function ShopeeExportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile } = useAuth();
  const { showToast } = useToast();

  const accountId = searchParams.get('account_id') || '';
  const accountNameParam = decodeURIComponent(searchParams.get('account_name') || '');

  const [step, setStep] = useState<Step>('select');
  const [accountName, setAccountName] = useState(accountNameParam);
  const [accountLogo, setAccountLogo] = useState<string | null>(null);

  // Step 1: Product selection
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Map<string, ProductItem>>(new Map());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [leftPage, setLeftPage] = useState(1);
  const [rightPage, setRightPage] = useState(1);
  const PAGE_SIZE = 30;

  // Step 2: Per-product configuration
  const [productConfigs, setProductConfigs] = useState<Record<string, {
    categoryId: number | null;
    categoryName: string;
    weight: string;
  }>>({});
  const [bulkCategoryId, setBulkCategoryId] = useState<number | null>(null);
  const [bulkCategoryName, setBulkCategoryName] = useState('');
  const [bulkWeight, setBulkWeight] = useState('');
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  // Step 3: Export progress
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportTotal, setExportTotal] = useState<number>(0);
  const [exportLabel, setExportLabel] = useState('');
  const [exportResults, setExportResults] = useState<ExportResultItem[]>([]);
  const [exportDone, setExportDone] = useState(false);

  // Linked product IDs (already exported to this account)
  const [linkedProductIds, setLinkedProductIds] = useState<Set<string>>(new Set());

  const isAdmin = userProfile?.roles?.includes('admin') || userProfile?.roles?.includes('owner');

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const res = await apiFetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (e) {
      console.error('Failed to fetch products:', e);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const fetchLinkedProducts = useCallback(async () => {
    if (!accountId) return;
    try {
      const res = await apiFetch(`/api/shopee/products/link?account_id=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        const linked = new Set<string>((data.links || []).map((l: { product_id: string }) => l.product_id));
        setLinkedProductIds(linked);
      }
    } catch (e) {
      console.error('Failed to fetch linked products:', e);
    }
  }, [accountId]);

  const fetchAccountInfo = useCallback(async () => {
    if (!accountId) return;
    try {
      const res = await apiFetch('/api/shopee/accounts');
      if (res.ok) {
        const accounts = await res.json();
        const account = (accounts as { id: string; shop_name: string | null; metadata: Record<string, unknown> }[])
          .find(a => a.id === accountId);
        if (account) {
          if (account.shop_name) setAccountName(account.shop_name);
          if (account.metadata?.shop_logo) setAccountLogo(account.metadata.shop_logo as string);
        }
      }
    } catch { /* ignore */ }
  }, [accountId]);

  const fetchFormOptions = useCallback(async () => {
    try {
      const res = await apiFetch('/api/products/form-options');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        setBrands(data.brands || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!accountId) return;
    fetchProducts();
    fetchLinkedProducts();
    fetchAccountInfo();
    fetchFormOptions();
  }, [accountId, fetchProducts, fetchLinkedProducts, fetchAccountInfo, fetchFormOptions]);

  // When entering configure step, pre-fill configs from existing marketplace link data
  const prefillFromExistingLinks = useCallback(async () => {
    const productIds = [...selectedProducts.keys()];
    if (productIds.length === 0) return;
    try {
      const res = await apiFetch(`/api/marketplace/links?product_ids=${productIds.join(',')}&platform=shopee`);
      if (!res.ok) return;
      const data = await res.json();
      const links = data.links || [];
      if (links.length === 0) return;

      // Build a map: product_id → best link data (prefer links with most info)
      const linkMap: Record<string, { shopee_category_id?: string | number; shopee_category_name?: string; weight?: number }> = {};
      for (const link of links) {
        const pid = link.product_id;
        // Keep the link with the most data (category + weight)
        if (!linkMap[pid] || (link.shopee_category_id && !linkMap[pid].shopee_category_id)) {
          linkMap[pid] = link;
        }
      }

      setProductConfigs(prev => {
        const next = { ...prev };
        for (const pid of productIds) {
          const existing = linkMap[pid];
          if (existing) {
            next[pid] = {
              categoryId: existing.shopee_category_id ? Number(existing.shopee_category_id) : (next[pid]?.categoryId || null),
              categoryName: existing.shopee_category_name || next[pid]?.categoryName || '',
              weight: existing.weight ? String(existing.weight) : (next[pid]?.weight || '0.5'),
            };
          } else if (!next[pid]) {
            next[pid] = { categoryId: null, categoryName: '', weight: '0.5' };
          }
        }
        return next;
      });
    } catch (e) {
      console.error('Failed to prefill from existing links:', e);
    }
  }, [selectedProducts]);

  // Warn before leaving during export
  useEffect(() => {
    if (step === 'exporting') {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = '';
      };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }
  }, [step]);

  // Filter products
  const filteredProducts = products.filter(p => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!p.name.toLowerCase().includes(term) && !p.code.toLowerCase().includes(term)) {
        return false;
      }
    }
    if (categoryFilter !== 'all' && p.category_id !== categoryFilter) return false;
    if (brandFilter !== 'all' && p.brand_id !== brandFilter) return false;
    return true;
  });

  const availableProducts = filteredProducts.filter(p => !linkedProductIds.has(p.product_id) && !selectedProducts.has(p.product_id));

  // Pagination
  const leftTotalPages = Math.max(1, Math.ceil(availableProducts.length / PAGE_SIZE));
  const leftPageProducts = availableProducts.slice((leftPage - 1) * PAGE_SIZE, leftPage * PAGE_SIZE);

  const selectedList = [...selectedProducts.values()];
  const rightTotalPages = Math.max(1, Math.ceil(selectedList.length / PAGE_SIZE));
  const rightPageProducts = selectedList.slice((rightPage - 1) * PAGE_SIZE, rightPage * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setLeftPage(1); }, [searchTerm, categoryFilter, brandFilter]);
  useEffect(() => { if (rightPage > rightTotalPages) setRightPage(Math.max(1, rightTotalPages)); }, [selectedProducts.size, rightPage, rightTotalPages]);

  const toggleCheck = (productId: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const checkAllPage = () => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      leftPageProducts.forEach(p => next.add(p.product_id));
      return next;
    });
  };

  const uncheckAllPage = () => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      leftPageProducts.forEach(p => next.delete(p.product_id));
      return next;
    });
  };

  const addCheckedToSelected = () => {
    if (checkedIds.size === 0) return;
    setSelectedProducts(prev => {
      const next = new Map(prev);
      products.forEach(p => {
        if (checkedIds.has(p.product_id)) {
          next.set(p.product_id, p);
        }
      });
      return next;
    });
    setCheckedIds(new Set());
  };

  const removeProduct = (id: string) => {
    setSelectedProducts(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const clearAllSelected = () => {
    setSelectedProducts(new Map());
    setRightPage(1);
  };

  const applyBulkConfig = () => {
    setProductConfigs(prev => {
      const next = { ...prev };
      [...selectedProducts.keys()].forEach(pid => {
        const existing = next[pid] || { categoryId: null, categoryName: '', weight: '0.5' };
        next[pid] = {
          categoryId: bulkCategoryId !== null ? bulkCategoryId : existing.categoryId,
          categoryName: bulkCategoryId !== null ? bulkCategoryName : existing.categoryName,
          weight: bulkWeight ? bulkWeight : existing.weight,
        };
      });
      return next;
    });
    setShowBulkEdit(false);
    showToast('ตั้งค่าทั้งหมดเรียบร้อย', 'success');
  };

  const allPageChecked = leftPageProducts.length > 0 && leftPageProducts.every(p => checkedIds.has(p.product_id));
  const checkedCount = [...checkedIds].filter(id => !selectedProducts.has(id) && !linkedProductIds.has(id)).length;

  // SSE stream reader
  const readSSEStream = async (
    response: Response,
    onEvent: (event: Record<string, unknown>) => void
  ) => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            onEvent(JSON.parse(line.slice(6)));
          } catch { /* skip */ }
        }
      }
    }
  };

  const handleExport = async () => {
    const productIds = [...selectedProducts.keys()];
    const missingCategory = productIds.some(pid => !productConfigs[pid]?.categoryId);
    if (missingCategory) {
      showToast('กรุณาเลือกหมวดหมู่ Shopee ให้ครบทุกสินค้า', 'error');
      return;
    }

    setStep('exporting');
    setExportProgress(0);
    setExportTotal(productIds.length);
    setExportResults([]);
    setExportDone(false);
    setExportLabel('กำลังเริ่มต้น...');

    const perProductOptions: Record<string, { shopee_category_id: number; shopee_category_name: string; weight: number }> = {};
    productIds.forEach(pid => {
      const cfg = productConfigs[pid];
      perProductOptions[pid] = {
        shopee_category_id: cfg?.categoryId || 0,
        shopee_category_name: cfg?.categoryName || '',
        weight: parseFloat(cfg?.weight || '0.5') || 0.5,
      };
    });

    try {
      const res = await apiFetch('/api/shopee/products/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_ids: productIds,
          shopee_account_id: accountId,
          per_product_options: perProductOptions,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'ส่งสินค้าไม่สำเร็จ', 'error');
        setStep('configure');
        return;
      }

      const results: ExportResultItem[] = [];

      await readSSEStream(res, (event) => {
        if (event.type === 'progress') {
          setExportProgress(event.current as number);
          setExportTotal(event.total as number);
          setExportLabel(event.label as string);

          if (event.phase === 'done' || event.phase === 'error') {
            results.push({
              success: event.success as boolean,
              item_id: event.item_id as number | undefined,
              error: event.error as string | undefined,
              product_name: event.product_name as string | undefined,
            });
            setExportResults([...results]);
          }
        } else if (event.type === 'done') {
          setExportDone(true);
          setExportProgress(event.total as number);
          setExportLabel('เสร็จสิ้น');

          const successCount = event.success_count as number;
          const errorCount = event.error_count as number;
          if (successCount > 0) {
            showToast(`ส่งสินค้าสำเร็จ ${successCount} รายการ${errorCount > 0 ? `, ผิดพลาด ${errorCount} รายการ` : ''}`, 'success');
          } else {
            showToast('ส่งสินค้าไม่สำเร็จ', 'error');
          }
        } else if (event.type === 'error') {
          showToast((event.message as string) || 'เกิดข้อผิดพลาด', 'error');
          setStep('configure');
        }
      });

      setStep('done');
    } catch {
      showToast('เกิดข้อผิดพลาดในการส่งสินค้า', 'error');
      setStep('configure');
    }
  };

  const selectedCount = selectedProducts.size;
  const progressPercent = exportTotal > 0 ? Math.round((exportProgress / exportTotal) * 100) : 0;

  // No account_id in URL
  if (!accountId) {
    return (
      <Layout
        title="ส่งสินค้าไป Shopee"
        breadcrumbs={[
          { label: 'ตั้งค่าระบบ', href: '/settings' },
          { label: 'Marketplace', href: '/settings/integrations' },
          { label: 'ส่งสินค้าไป Shopee' },
        ]}
      >
        <div className="text-center py-20">
          <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-400 mb-4">ไม่พบข้อมูลร้าน Shopee</p>
          <button
            onClick={() => router.push('/settings/integrations')}
            className="text-sm text-[#EE4D2D] hover:underline"
          >
            กลับหน้า Marketplace
          </button>
        </div>
      </Layout>
    );
  }

  // Auth guard
  if (!isAdmin) {
    return (
      <Layout title="ส่งสินค้าไป Shopee">
        <div className="text-center py-20">
          <p className="text-gray-500">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="ส่งสินค้าไป Shopee"
      breadcrumbs={[
        { label: 'ตั้งค่าระบบ', href: '/settings' },
        { label: 'Marketplace', href: '/settings/integrations' },
        { label: 'ส่งสินค้าไป Shopee' },
      ]}
    >
      {/* Account + Step indicator */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {accountLogo ? (
              <img src={accountLogo} alt={accountName} className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-[#EE4D2D]/10 flex items-center justify-center">
                <Upload className="w-5 h-5 text-[#EE4D2D]" />
              </div>
            )}
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">{accountName}</h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">Shopee Export</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {['เลือกสินค้า', 'ตั้งค่า', 'กำลังส่ง'].map((label, idx) => {
              const isActive = (step === 'select' && idx === 0) ||
                (step === 'configure' && idx === 1) ||
                ((step === 'exporting' || step === 'done') && idx === 2);
              const isPast = (step === 'configure' && idx === 0) ||
                ((step === 'exporting' || step === 'done') && idx <= 1);

              return (
                <div key={idx} className="flex items-center gap-1">
                  {idx > 0 && <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <span className={`text-sm font-medium px-3 py-1.5 rounded-full ${
                    isActive
                      ? 'bg-[#EE4D2D] text-white'
                      : isPast
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700'
                  }`}>
                    {idx + 1}. {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step 1: Select Products */}
      {step === 'select' && (
        <div className="flex flex-col lg:flex-row gap-4 pb-16" style={{ height: 'calc(100vh - 310px)', minHeight: '400px' }}>
          {/* Left: Available products */}
          <div className="flex-1 min-w-0 bg-white dark:bg-slate-800 rounded-lg shadow-sm flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-200 dark:border-slate-700 flex-shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  สินค้าในระบบ
                </p>
                <span className="text-xs text-gray-400">{availableProducts.length} รายการ</span>
              </div>
              {/* Search + Filters in one row */}
              <div className="flex items-stretch gap-2">
                <div className="relative flex-[2] min-w-0">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                  <input
                    type="text"
                    placeholder="ค้นหา..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full h-full pl-8 pr-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]/50"
                  />
                </div>
                {categories.length > 0 && (
                  <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="flex-1 min-w-0 px-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]/50"
                  >
                    <option value="all">หมวดหมู่ทั้งหมด</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                {brands.length > 0 && (
                  <select
                    value={brandFilter}
                    onChange={e => setBrandFilter(e.target.value)}
                    className="flex-1 min-w-0 px-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]/50"
                  >
                    <option value="all">แบรนด์ทั้งหมด</option>
                    {brands.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={addCheckedToSelected}
                  disabled={checkedCount === 0}
                  className="px-4 text-sm font-medium text-white bg-[#EE4D2D] hover:bg-[#D63B0E] rounded-lg transition-colors disabled:opacity-30 flex items-center gap-1 flex-shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  เพิ่ม{checkedCount > 0 ? ` (${checkedCount})` : ''}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {loadingProducts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                </div>
              ) : availableProducts.length === 0 ? (
                <p className="text-center py-8 text-sm text-gray-400">ไม่พบสินค้า</p>
              ) : (
                <div className="space-y-1">
                  {leftPageProducts.map(product => {
                    const isChecked = checkedIds.has(product.product_id);
                    const imgUrl = getImageUrl(product.main_image_url || product.image);

                    return (
                      <div
                        key={product.product_id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-[#EE4D2D]/5'
                            : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                        }`}
                        onClick={() => toggleCheck(product.product_id)}
                      >
                        {/* Checkbox */}
                        <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-[#EE4D2D] border-[#EE4D2D]'
                            : 'border-gray-300 dark:border-slate-500'
                        }`}>
                          {isChecked && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>

                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt=""
                            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                            <ShoppingBag className="w-5 h-5 text-gray-400" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">{product.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-gray-400 dark:text-slate-500">{product.code}</p>
                            {product.product_type === 'variation' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                                variation
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Left Footer: Select all + Add button + Pagination */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 dark:border-slate-700 flex-shrink-0">
              <label
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={e => { e.preventDefault(); allPageChecked ? uncheckAllPage() : checkAllPage(); }}
              >
                <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-colors ${
                  allPageChecked
                    ? 'bg-[#EE4D2D] border-[#EE4D2D]'
                    : 'border-gray-300 dark:border-slate-500'
                }`}>
                  {allPageChecked && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-gray-500 dark:text-slate-400">เลือกทั้งหน้า</span>
              </label>
              {leftTotalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setLeftPage(p => Math.max(1, p - 1))}
                    disabled={leftPage <= 1}
                    className="p-1 rounded border border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs text-gray-400 min-w-[3rem] text-center">{leftPage}/{leftTotalPages}</span>
                  <button
                    onClick={() => setLeftPage(p => Math.min(leftTotalPages, p + 1))}
                    disabled={leftPage >= leftTotalPages}
                    className="p-1 rounded border border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Selected + Already linked */}
          <div className="flex-1 min-w-0 bg-white dark:bg-slate-800 rounded-lg shadow-sm flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-200 dark:border-slate-700 flex-shrink-0 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                สินค้าที่เลือก ({selectedCount})
              </p>
              {selectedCount > 0 && (
                <button
                  onClick={clearAllSelected}
                  className="text-xs text-red-500 hover:text-red-600 transition-colors"
                >
                  ล้างทั้งหมด
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {selectedCount === 0 ? (
                <p className="text-center py-4 text-xs text-gray-400">เลือกสินค้าจากฝั่งซ้าย</p>
              ) : (
                <div className="space-y-1">
                  {rightPageProducts.map(product => {
                    const imgUrl = getImageUrl(product.main_image_url || product.image);
                    return (
                      <div
                        key={product.product_id}
                        className="flex items-center gap-2.5 p-2.5 bg-[#EE4D2D]/5 rounded-lg"
                      >
                        {imgUrl ? (
                          <img src={imgUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                            <ShoppingBag className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-white line-clamp-2">{product.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{product.code}</p>
                        </div>
                        <button
                          onClick={() => removeProduct(product.product_id)}
                          className="p-1 text-gray-400 hover:text-red-500 flex-shrink-0"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Already linked products */}
              {linkedProductIds.size > 0 && selectedCount === 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-slate-700">
                  <p className="text-xs font-medium text-gray-400 dark:text-slate-500 mb-2">
                    เชื่อมกับร้านนี้แล้ว ({linkedProductIds.size})
                  </p>
                  <div className="space-y-1">
                    {products.filter(p => linkedProductIds.has(p.product_id)).slice(0, 20).map(product => (
                      <div
                        key={product.product_id}
                        className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-slate-700/30 rounded-lg opacity-60"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-500 dark:text-slate-400 truncate">{product.name}</p>
                        </div>
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      </div>
                    ))}
                    {products.filter(p => linkedProductIds.has(p.product_id)).length > 20 && (
                      <p className="text-center text-xs text-gray-400 py-1">
                        ...และอีก {products.filter(p => linkedProductIds.has(p.product_id)).length - 20} รายการ
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Pagination */}
            {rightTotalPages > 1 && (
              <div className="flex items-center justify-end px-3 py-2 border-t border-gray-200 dark:border-slate-700 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setRightPage(p => Math.max(1, p - 1))}
                    disabled={rightPage <= 1}
                    className="p-1 rounded border border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs text-gray-400 min-w-[3rem] text-center">{rightPage}/{rightTotalPages}</span>
                  <button
                    onClick={() => setRightPage(p => Math.min(rightTotalPages, p + 1))}
                    disabled={rightPage >= rightTotalPages}
                    className="p-1 rounded border border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Configure */}
      {step === 'configure' && (
        <div className="pb-16">
          {/* Header + Bulk edit */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
              ตั้งค่าสินค้า ({selectedCount} รายการ)
            </p>
            <button
              onClick={() => setShowBulkEdit(!showBulkEdit)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                showBulkEdit
                  ? 'bg-[#EE4D2D] text-white'
                  : 'border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
              แก้ไขทั้งหมด
            </button>
          </div>

          {/* Bulk edit panel */}
          {showBulkEdit && (
            <div className="bg-[#EE4D2D]/5 border border-[#EE4D2D]/20 rounded-lg p-4 mb-3">
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">ตั้งค่าสินค้าทั้งหมดพร้อมกัน</p>
              <div className="flex items-end gap-3">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">หมวดหมู่ Shopee</label>
                  <ShopeeCategoryPicker
                    accountId={accountId}
                    value={bulkCategoryId}
                    onChange={(id, name) => { setBulkCategoryId(id); setBulkCategoryName(name); }}
                  />
                </div>
                <div className="w-28 flex-shrink-0">
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">น้ำหนัก (kg)</label>
                  <input
                    type="number"
                    value={bulkWeight}
                    onChange={e => setBulkWeight(e.target.value)}
                    placeholder="0.5"
                    step="0.1"
                    min="0.01"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#EE4D2D]/50"
                  />
                </div>
                <button
                  onClick={applyBulkConfig}
                  disabled={bulkCategoryId === null && !bulkWeight}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#EE4D2D] hover:bg-[#D63B0E] rounded-lg transition-colors disabled:opacity-30 flex-shrink-0"
                >
                  ใช้กับทั้งหมด
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[56px_1fr_120px_100px_1fr_80px] items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50 text-xs font-medium text-gray-500 dark:text-slate-400">
              <span>รูป</span>
              <span>ชื่อสินค้า</span>
              <span>รหัส</span>
              <span>ราคา</span>
              <span>หมวดหมู่ Shopee *</span>
              <span>นน. (kg)</span>
            </div>

            {/* Table rows */}
            <div className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {[...selectedProducts.values()].map(product => {
                const cfg = productConfigs[product.product_id] || { categoryId: null, categoryName: '', weight: '0.5' };
                const imgUrl = getImageUrl(product.main_image_url || product.image);
                const hasCategory = !!cfg.categoryId;

                return (
                  <div
                    key={product.product_id}
                    className={`grid grid-cols-[56px_1fr_120px_100px_1fr_80px] items-center gap-2 px-3 py-2 ${
                      hasCategory ? 'bg-green-50/50 dark:bg-green-900/5' : ''
                    }`}
                  >
                    {/* Image */}
                    <div className="flex-shrink-0">
                      {imgUrl ? (
                        <img src={imgUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-slate-600 flex items-center justify-center">
                          <ShoppingBag className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Name */}
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white truncate">{product.name}</p>
                    </div>

                    {/* Code */}
                    <p className="text-xs text-gray-400 truncate">{product.code}</p>

                    {/* Price */}
                    <p className="text-sm text-gray-700 dark:text-slate-300">
                      {product.simple_default_price ? `฿${product.simple_default_price.toLocaleString()}` : '-'}
                    </p>

                    {/* Category */}
                    <div className="min-w-0">
                      <ShopeeCategoryPicker
                        accountId={accountId}
                        value={cfg.categoryId}
                        categoryName={cfg.categoryName}
                        onChange={(id, name) => {
                          setProductConfigs(prev => ({
                            ...prev,
                            [product.product_id]: {
                              ...prev[product.product_id] || { categoryId: null, categoryName: '', weight: '0.5' },
                              categoryId: id,
                              categoryName: name,
                            },
                          }));
                        }}
                      />
                    </div>

                    {/* Weight */}
                    <input
                      type="number"
                      value={cfg.weight}
                      onChange={e => {
                        setProductConfigs(prev => ({
                          ...prev,
                          [product.product_id]: {
                            ...prev[product.product_id] || { categoryId: null, categoryName: '', weight: '0.5' },
                            weight: e.target.value,
                          },
                        }));
                      }}
                      step="0.1"
                      min="0.01"
                      className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]/50"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Exporting / Done */}
      {(step === 'exporting' || step === 'done') && (
        <div className="max-w-3xl mx-auto space-y-4 pb-16">
          {step === 'exporting' && (
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>กรุณาอย่าปิดหน้านี้ขณะกำลังส่งสินค้า</span>
            </div>
          )}

          {/* Progress bar */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-slate-400">
              <span>{exportLabel}</span>
              <span>{exportProgress}/{exportTotal}</span>
            </div>
            <div className="w-full h-3 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#EE4D2D] rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Results list */}
          {exportResults.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">ผลลัพธ์</p>
              {exportResults.map((result, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                    result.success
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                  }`}
                >
                  {result.success ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span className="flex-1">{result.product_name || `สินค้า ${idx + 1}`}</span>
                  {result.success ? (
                    <span className="text-xs">ID: {result.item_id}</span>
                  ) : (
                    <span className="text-xs">{result.error}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Done actions */}
          {step === 'done' && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => router.push('/settings/integrations')}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับหน้า Marketplace
              </button>
              <button
                onClick={() => {
                  setStep('select');
                  setSelectedProducts(new Map());
                  setProductConfigs({});
                  setExportResults([]);
                  setExportDone(false);
                  fetchLinkedProducts();
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-[#EE4D2D] hover:bg-[#D63B0E] rounded-lg transition-colors flex items-center gap-2"
              >
                ส่งสินค้าเพิ่ม
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sticky Footer — only for select & configure steps */}
      {(step === 'select' || step === 'configure') && (
        <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 px-4 lg:px-6 py-3 -mx-4 lg:-mx-6 -mb-24 lg:-mb-6 z-30 flex items-center justify-between">
          <div>
            {step === 'select' && (
              <button
                onClick={() => router.push('/settings/integrations')}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับ
              </button>
            )}
            {step === 'configure' && (
              <button
                onClick={() => setStep('select')}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                ย้อนกลับ
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 'select' && (
              <button
                onClick={() => {
                  prefillFromExistingLinks();
                  setStep('configure');
                }}
                disabled={selectedCount === 0}
                className="px-5 py-2 text-sm font-medium text-white bg-[#EE4D2D] hover:bg-[#D63B0E] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                ถัดไป ({selectedCount})
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {step === 'configure' && (() => {
              const allConfigured = [...selectedProducts.keys()].every(pid => productConfigs[pid]?.categoryId);
              return (
                <button
                  onClick={handleExport}
                  disabled={!allConfigured}
                  className="px-5 py-2 text-sm font-medium text-white bg-[#EE4D2D] hover:bg-[#D63B0E] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <ShoppingBag className="w-4 h-4" />
                  ส่งไป Shopee ({selectedCount})
                </button>
              );
            })()}
          </div>
        </div>
      )}
    </Layout>
  );
}

export default function ShopeeExportPage() {
  return (
    <Suspense fallback={
      <Layout title="ส่งสินค้าไป Shopee">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      </Layout>
    }>
      <ShopeeExportContent />
    </Suspense>
  );
}
