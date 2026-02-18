'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  Loader2, X, Upload, Search, Plus, Minus,
  ChevronRight, CheckCircle2, XCircle, ShoppingBag,
  AlertTriangle,
} from 'lucide-react';
import ShopeeCategoryPicker from './ShopeeCategoryPicker';

interface ProductItem {
  product_id: string;
  code: string;
  name: string;
  image?: string;
  main_image_url?: string;
  source?: string;
  product_type: string;
  simple_default_price?: number;
}

interface ExportResultItem {
  success: boolean;
  item_id?: number;
  error?: string;
  product_name?: string;
}

interface ShopeeBulkExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
}

type Step = 'select' | 'configure' | 'exporting' | 'done';

export default function ShopeeBulkExportModal({
  isOpen,
  onClose,
  accountId,
  accountName,
}: ShopeeBulkExportModalProps) {
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('select');

  // Step 1: Product selection
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Map<string, ProductItem>>(new Map());

  // Step 2: Per-product configuration
  // Map: product_id -> { categoryId, categoryName, weight }
  const [productConfigs, setProductConfigs] = useState<Record<string, {
    categoryId: number | null;
    categoryName: string;
    weight: string;
  }>>({});

  // Step 3: Export progress
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportTotal, setExportTotal] = useState<number>(0);
  const [exportLabel, setExportLabel] = useState('');
  const [exportResults, setExportResults] = useState<ExportResultItem[]>([]);
  const [exportDone, setExportDone] = useState(false);

  // Linked product IDs (already exported to this account)
  const [linkedProductIds, setLinkedProductIds] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    if (isOpen) {
      setStep('select');
      setSelectedProducts(new Map());
      setProductConfigs({});
      setExportProgress(0);
      setExportResults([]);
      setExportDone(false);
      setSearchTerm('');
      fetchProducts();
      fetchLinkedProducts();
    }
  }, [isOpen, fetchProducts, fetchLinkedProducts]);

  // Filter products
  const filteredProducts = products.filter(p => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!p.name.toLowerCase().includes(term) && !p.code.toLowerCase().includes(term)) {
        return false;
      }
    }
    return true;
  });

  const toggleProduct = (product: ProductItem) => {
    setSelectedProducts(prev => {
      const next = new Map(prev);
      if (next.has(product.product_id)) {
        next.delete(product.product_id);
      } else {
        next.set(product.product_id, product);
      }
      return next;
    });
  };

  const removeProduct = (id: string) => {
    setSelectedProducts(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  // Helper: read SSE stream
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
    // Validate all products have category selected
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

    // Build per-product options
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
          const current = event.current as number;
          const total = event.total as number;
          const label = event.label as string;
          setExportProgress(current);
          setExportTotal(total);
          setExportLabel(label);

          // Collect individual results
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

  if (!isOpen) return null;

  const selectedCount = selectedProducts.size;
  const progressPercent = exportTotal > 0 ? Math.round((exportProgress / exportTotal) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#EE4D2D]/10 flex items-center justify-center">
              <Upload className="w-4 h-4 text-[#EE4D2D]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">ส่งสินค้าไป Shopee</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">{accountName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-slate-700/30 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
          {['เลือกสินค้า', 'ตั้งค่า', 'กำลังส่ง'].map((label, idx) => {
            const stepIdx = idx;
            const isActive = (step === 'select' && stepIdx === 0) ||
              (step === 'configure' && stepIdx === 1) ||
              ((step === 'exporting' || step === 'done') && stepIdx === 2);
            const isPast = (step === 'configure' && stepIdx === 0) ||
              ((step === 'exporting' || step === 'done') && stepIdx <= 1);

            return (
              <div key={idx} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight className="w-3 h-3 text-gray-400" />}
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  isActive
                    ? 'bg-[#EE4D2D] text-white'
                    : isPast
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'text-gray-400 dark:text-slate-500'
                }`}>
                  {idx + 1}. {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {/* Step 1: Select Products (dual-pane) */}
          {step === 'select' && (
            <div className="flex flex-col md:flex-row h-full" style={{ minHeight: '400px' }}>
              {/* Left pane: Available products (not linked) */}
              <div className="md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-gray-200 dark:border-slate-700 min-h-0">
                <div className="p-3 space-y-2 flex-shrink-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                    สินค้าในระบบ
                  </p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="ค้นหาสินค้า..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#EE4D2D]/50"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 pb-3">
                  {loadingProducts ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                    </div>
                  ) : filteredProducts.filter(p => !linkedProductIds.has(p.product_id)).length === 0 ? (
                    <p className="text-center py-8 text-sm text-gray-400">ไม่พบสินค้า</p>
                  ) : (
                    <div className="space-y-1">
                      {filteredProducts.filter(p => !linkedProductIds.has(p.product_id)).map(product => {
                        const isSelected = selectedProducts.has(product.product_id);

                        return (
                          <div
                            key={product.product_id}
                            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#EE4D2D]/5 border border-[#EE4D2D]/30'
                                : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                            }`}
                            onClick={() => toggleProduct(product)}
                          >
                            {/* Product image */}
                            {(product.main_image_url || product.image) ? (
                              <img
                                src={product.main_image_url || product.image}
                                alt=""
                                className="w-8 h-8 rounded object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-gray-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                                <ShoppingBag className="w-4 h-4 text-gray-400" />
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 dark:text-white truncate">{product.name}</p>
                              <p className="text-xs text-gray-400 dark:text-slate-500">{product.code}</p>
                            </div>

                            {isSelected ? (
                              <Minus className="w-4 h-4 text-[#EE4D2D] flex-shrink-0" />
                            ) : (
                              <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right pane: Selected + Already linked */}
              <div className="md:w-1/2 flex flex-col min-h-0">
                {/* Selected products section */}
                <div className="p-3 flex-shrink-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                    สินค้าที่เลือก ({selectedCount})
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto px-3 pb-3">
                  {selectedCount === 0 ? (
                    <p className="text-center py-4 text-xs text-gray-400">เลือกสินค้าจากฝั่งซ้าย</p>
                  ) : (
                    <div className="space-y-1">
                      {[...selectedProducts.values()].map(product => (
                        <div
                          key={product.product_id}
                          className="flex items-center gap-2 p-2 bg-[#EE4D2D]/5 rounded-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900 dark:text-white truncate">{product.name}</p>
                          </div>
                          <button
                            onClick={() => removeProduct(product.product_id)}
                            className="p-0.5 text-gray-400 hover:text-red-500 flex-shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Already linked products */}
                  {linkedProductIds.size > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-slate-700">
                      <p className="text-xs font-medium text-gray-400 dark:text-slate-500 mb-2">
                        เชื่อมกับร้านนี้แล้ว ({linkedProductIds.size})
                      </p>
                      <div className="space-y-1">
                        {products.filter(p => linkedProductIds.has(p.product_id)).map(product => (
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
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Configure — per-product category + weight */}
          {step === 'configure' && (
            <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
              <div className="p-4 pb-2">
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  ตั้งค่าหมวดหมู่และน้ำหนักสำหรับแต่ละสินค้า ({selectedCount} รายการ)
                </p>
              </div>

              <div className="divide-y divide-gray-200 dark:divide-slate-700">
                {[...selectedProducts.values()].map(product => {
                  const cfg = productConfigs[product.product_id] || { categoryId: null, categoryName: '', weight: '0.5' };
                  return (
                    <div key={product.product_id} className="px-4 py-3 space-y-2">
                      {/* Product name */}
                      <div className="flex items-center gap-2">
                        {(product.main_image_url || product.image) ? (
                          <img
                            src={product.main_image_url || product.image}
                            alt=""
                            className="w-8 h-8 rounded object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                            <ShoppingBag className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{product.name}</p>
                          <p className="text-xs text-gray-400 dark:text-slate-500">{product.code}</p>
                        </div>
                        {cfg.categoryId && (
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        )}
                      </div>

                      {/* Category + Weight row */}
                      <div className="flex items-start gap-3 pl-10">
                        <div className="flex-1 min-w-0">
                          <label className="block text-xs text-gray-500 dark:text-slate-400 mb-0.5">หมวดหมู่ Shopee</label>
                          <ShopeeCategoryPicker
                            accountId={accountId}
                            value={cfg.categoryId}
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
                        <div className="w-24 flex-shrink-0">
                          <label className="block text-xs text-gray-500 dark:text-slate-400 mb-0.5">น้ำหนัก (kg)</label>
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
                            className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#EE4D2D]/50"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Exporting / Done */}
          {(step === 'exporting' || step === 'done') && (
            <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {/* Warning */}
              {step === 'exporting' && (
                <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2.5 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>กรุณาอย่าปิดหน้าต่างนี้ขณะกำลังส่งสินค้า</span>
                </div>
              )}

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                  <span>{exportLabel}</span>
                  <span>{exportProgress}/{exportTotal}</span>
                </div>
                <div className="w-full h-2.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#EE4D2D] rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Results list */}
              {exportResults.length > 0 && (
                <div className="space-y-1">
                  {exportResults.map((result, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
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
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-slate-700 flex-shrink-0">
          <div>
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
            {step !== 'exporting' && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                {step === 'done' ? 'ปิด' : 'ยกเลิก'}
              </button>
            )}

            {step === 'select' && (
              <button
                onClick={() => setStep('configure')}
                disabled={selectedCount === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-[#EE4D2D] hover:bg-[#D63B0E] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
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
                  className="px-4 py-2 text-sm font-medium text-white bg-[#EE4D2D] hover:bg-[#D63B0E] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <ShoppingBag className="w-4 h-4" />
                  ส่งไป Shopee ({selectedCount})
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
