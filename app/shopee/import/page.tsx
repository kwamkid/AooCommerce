'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import ProductPicker from '@/components/shopee/ProductPicker';
import Image from 'next/image';
import {
  Loader2, Download, Search,
  ChevronLeft, ChevronRight, CheckCircle2, XCircle, ShoppingBag,
  AlertTriangle, ArrowLeft, Link2, Plus, Package, CheckSquare, Square, X,
} from 'lucide-react';

interface ShopeeModel {
  model_id: number;
  model_sku: string;
  model_name: string;
  current_price: number;
  original_price: number;
  stock: number;
  image_url?: string;
}

interface ShopeeItem {
  item_id: number;
  item_name: string;
  item_sku: string;
  item_status: string;
  images: string[];
  has_model: boolean;
  category_id?: number;
  weight?: number;
  models: ShopeeModel[];
  tier_variations: string[];
  is_linked: boolean;
  linked_product?: { product_id: string; product_name: string } | null;
}

interface ImportConfig {
  action: 'create' | 'link';
  link_to_product_id?: string;
  link_to_product_name?: string;
  link_to_product_image?: string | null;
  link_to_variation_mappings?: Array<{ model_id: number; variation_id: string }>;
}

interface ProgressItem {
  item_name: string;
  success: boolean;
  error?: string;
}

type Step = 'select' | 'configure' | 'importing' | 'done';

function ShopeeImportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  const accountId = searchParams.get('account_id') || '';
  const accountName = searchParams.get('account_name') || 'Shopee';

  // Step state
  const [step, setStep] = useState<Step>('select');

  // Step 1: Select
  const [shopeeItems, setShopeeItems] = useState<ShopeeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [totalItems, setTotalItems] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedItems, setSelectedItems] = useState<ShopeeItem[]>([]);

  // Step 2: Configure
  const [configs, setConfigs] = useState<Record<number, ImportConfig>>({});
  const [pickerForItemId, setPickerForItemId] = useState<number | null>(null);

  // Step 3: Progress
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const pageSize = 20;

  // Fetch items from Shopee
  const fetchItems = useCallback(async (newOffset: number = 0) => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/shopee/products/import?account_id=${accountId}&offset=${newOffset}&page_size=${pageSize}`);
      const data = await res.json();
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      setShopeeItems(data.items || []);
      setTotalItems(data.total || 0);
      setHasMore(data.hasMore || false);
      setOffset(newOffset);
    } catch {
      showToast('ไม่สามารถดึงสินค้าจาก Shopee ได้', 'error');
    } finally {
      setLoading(false);
    }
  }, [accountId, showToast]);

  useEffect(() => {
    if (accountId && user) {
      fetchItems(0);
    }
  }, [accountId, user, fetchItems]);

  // Toggle selection
  const toggleSelect = (item: ShopeeItem) => {
    setSelectedItems(prev => {
      const exists = prev.find(i => i.item_id === item.item_id);
      if (exists) {
        return prev.filter(i => i.item_id !== item.item_id);
      }
      return [...prev, item];
    });
  };

  const isSelected = (itemId: number) => selectedItems.some(i => i.item_id === itemId);

  // Select all non-linked items on current page
  const selectableItems = shopeeItems.filter(i => !i.is_linked);
  const allSelectableSelected = selectableItems.length > 0 && selectableItems.every(i => isSelected(i.item_id));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      // Deselect all items from current page
      const currentPageIds = new Set(selectableItems.map(i => i.item_id));
      setSelectedItems(prev => prev.filter(i => !currentPageIds.has(i.item_id)));
    } else {
      // Add all non-linked items from current page to selection
      setSelectedItems(prev => {
        const existingIds = new Set(prev.map(i => i.item_id));
        const toAdd = selectableItems.filter(i => !existingIds.has(i.item_id));
        return [...prev, ...toAdd];
      });
    }
  };

  // Filter items by search
  const filteredItems = shopeeItems.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.item_name.toLowerCase().includes(q) ||
      item.item_sku?.toLowerCase().includes(q) ||
      item.models.some(m => m.model_sku?.toLowerCase().includes(q))
    );
  });

  // Go to configure step
  const goToConfigure = () => {
    // Initialize configs with default 'create' for all selected items
    const newConfigs: Record<number, ImportConfig> = {};
    for (const item of selectedItems) {
      newConfigs[item.item_id] = configs[item.item_id] || { action: 'create' };
    }
    setConfigs(newConfigs);
    setStep('configure');
  };

  // Execute import
  const executeImport = async () => {
    setStep('importing');
    setIsImporting(true);
    setProgressItems([]);
    setSuccessCount(0);
    setErrorCount(0);

    const importItems = selectedItems.map(item => {
      const config = configs[item.item_id] || { action: 'create' };
      return {
        item_id: item.item_id,
        action: config.action,
        link_to_product_id: config.link_to_product_id,
        link_to_variation_mappings: config.link_to_variation_mappings,
      };
    });

    try {
      const res = await apiFetch('/api/shopee/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopee_account_id: accountId,
          items: importItems,
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      let sc = 0;
      let ec = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'progress') {
              setProgressItems(prev => [...prev, {
                item_name: event.item_name,
                success: event.success,
                error: event.error,
              }]);
              if (event.success) sc++;
              else ec++;
            } else if (event.type === 'done') {
              sc = event.success_count || sc;
              ec = event.error_count || ec;
            }
          } catch {
            // parse error
          }
        }
      }

      setSuccessCount(sc);
      setErrorCount(ec);
    } catch (e) {
      showToast('เกิดข้อผิดพลาดในการนำเข้า', 'error');
    } finally {
      setIsImporting(false);
      setImportDone(true);
      setStep('done');
    }
  };

  // Product picker callback
  const handleProductPicked = (product: { product_id: string; name: string; image: string | null; main_image_url: string | null; variations: Array<{ variation_id: string; variation_label: string }> }) => {
    if (pickerForItemId === null) return;
    setConfigs(prev => ({
      ...prev,
      [pickerForItemId]: {
        action: 'link',
        link_to_product_id: product.product_id,
        link_to_product_name: product.name,
        link_to_product_image: product.main_image_url || product.image,
      },
    }));
    setPickerForItemId(null);
  };

  // Step indicator
  const steps = [
    { key: 'select', label: '1. เลือกสินค้า' },
    { key: 'configure', label: '2. ตั้งค่า' },
    { key: 'importing', label: '3. กำลังนำเข้า' },
  ];

  const stepIndex = step === 'select' ? 0 : step === 'configure' ? 1 : 2;

  if (!accountId) {
    return (
      <Layout title="นำเข้าสินค้าจาก Shopee">
        <div className="text-center py-12 text-gray-500 dark:text-slate-400">
          <p>ไม่พบข้อมูลบัญชี Shopee</p>
          <button onClick={() => router.push('/settings/integrations')} className="mt-4 text-orange-600 hover:underline">
            กลับหน้าเชื่อมต่อ
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="นำเข้าสินค้าจาก Shopee" breadcrumbs={[
      { label: 'ตั้งค่าระบบ', href: '/settings' },
      { label: 'Marketplace', href: '/settings/integrations' },
      { label: 'นำเข้าสินค้าจาก Shopee' },
    ]}>
      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 flex-shrink-0" />}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
              i < stepIndex ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
              i === stepIndex ? 'bg-[#EE4D2D] text-white' :
              'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
            }`}>
              {i < stepIndex && <CheckCircle2 className="w-4 h-4" />}
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Step 1: Select */}
      {step === 'select' && (
        <div className="space-y-4">
          {/* Search + info + select all */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ, SKU..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                disabled={loading || selectableItems.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {allSelectableSelected ? (
                  <CheckSquare className="w-4 h-4 text-orange-500" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                )}
                {allSelectableSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
              </button>
              <div className="text-sm text-gray-500 dark:text-slate-400 flex items-center gap-2 whitespace-nowrap">
                <ShoppingBag className="w-4 h-4" />
                ทั้งหมด {totalItems} · เลือก {selectedItems.length}
              </div>
            </div>
          </div>

          {/* Item list */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              <p className="text-sm text-gray-500 dark:text-slate-400">กำลังดึงสินค้าจาก Shopee...</p>
              {/* Progress bar */}
              <div className="w-64 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full animate-[loading-bar_1.5s_ease-in-out_infinite]"
                  style={{ width: '40%', animation: 'loading-bar 1.5s ease-in-out infinite' }}
                />
              </div>
              <style jsx>{`
                @keyframes loading-bar {
                  0% { width: 10%; margin-left: 0; }
                  50% { width: 50%; margin-left: 25%; }
                  100% { width: 10%; margin-left: 90%; }
                }
              `}</style>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map(item => (
                <div
                  key={item.item_id}
                  className={`rounded-lg p-3 flex gap-3 cursor-pointer transition-colors ${
                    item.is_linked
                      ? 'bg-green-50 dark:bg-green-900/20 opacity-60 cursor-not-allowed'
                      : isSelected(item.item_id)
                        ? 'bg-orange-50 dark:bg-orange-400/25'
                        : 'bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                  }`}
                  onClick={() => !item.is_linked && toggleSelect(item)}
                >
                  {/* Checkbox */}
                  <div className="flex-shrink-0 pt-1">
                    {item.is_linked ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${isSelected(item.item_id) ? 'bg-[#F4511E]' : 'border-2 border-gray-300 dark:border-slate-500'}`}>
                        {isSelected(item.item_id) && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                    )}
                  </div>

                  {/* Image */}
                  <div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                    {item.images[0] ? (
                      <Image src={item.images[0]} alt={item.item_name} width={56} height={56} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-slate-500">
                        <Package className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{item.item_name}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                      {item.item_sku && `SKU: ${item.item_sku} · `}
                      {item.has_model ? `${item.models.length} ตัวเลือก` : 'สินค้าเดี่ยว'}
                    </p>
                    {item.models.length > 0 && (
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                        ราคา ฿{Math.min(...item.models.map(m => m.current_price)).toLocaleString()}
                        {item.models.length > 1 && ` - ฿${Math.max(...item.models.map(m => m.current_price)).toLocaleString()}`}
                        {' · '}สต็อก {item.models.reduce((sum, m) => sum + m.stock, 0)}
                      </p>
                    )}
                    {item.is_linked && item.linked_product && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-1">
                        <Link2 className="w-3 h-3" />
                        ผูกกับ: {item.linked_product.product_name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalItems > 0 && (
            <div className="flex items-center justify-center gap-4 pt-2">
              <button
                onClick={() => fetchItems(Math.max(0, offset - pageSize))}
                disabled={offset === 0 || loading}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                ก่อนหน้า
              </button>
              <span className="text-sm text-gray-500 dark:text-slate-400">
                หน้า {Math.floor(offset / pageSize) + 1} / {Math.ceil(totalItems / pageSize)}
                <span className="text-xs text-gray-400 dark:text-slate-500 ml-1">
                  ({offset + 1}-{Math.min(offset + pageSize, totalItems)} จาก {totalItems})
                </span>
              </span>
              <button
                onClick={() => fetchItems(offset + pageSize)}
                disabled={!hasMore || loading}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 transition-colors"
              >
                ถัดไป
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Configure */}
      {step === 'configure' && (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium">ตั้งค่าการนำเข้า</p>
            <p className="text-xs mt-1 text-blue-600 dark:text-blue-400">
              <strong>สร้างใหม่</strong> = สร้างสินค้าใหม่ในระบบ + ดึง stock จาก Shopee เข้า warehouse เริ่มต้น (ชื่อสินค้าในระบบ = ชื่อสินค้าบน Shopee)<br />
              <strong>ผูกกับสินค้าที่มี</strong> = ผูก link กับสินค้าที่มีอยู่แล้ว + ใช้ stock จากระบบเรา push ไป Shopee ทันที (ชื่อสินค้าในระบบไม่เปลี่ยน, ชื่อ Platform อัพเดทจาก Shopee)
            </p>
          </div>

          <div className="space-y-2">
            {selectedItems.map(item => {
              const config = configs[item.item_id] || { action: 'create' };

              return (
                <div key={item.item_id} className="border border-gray-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-800 space-y-2">
                  {/* Row 1: Product info + radio buttons */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                      {item.images[0] ? (
                        <Image src={item.images[0]} alt={item.item_name} width={40} height={40} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-slate-500">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{item.item_name}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        {item.has_model ? `${item.models.length} ตัวเลือก` : 'สินค้าเดี่ยว'}
                        {item.item_sku && ` · SKU: ${item.item_sku}`}
                      </p>
                    </div>

                    {/* Action radios (right-aligned) */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <label className="flex items-center gap-1.5 cursor-pointer" onClick={() => setConfigs(prev => ({
                        ...prev,
                        [item.item_id]: { action: 'create' },
                      }))}>
                        <div className={`w-5 h-5 rounded-full flex-shrink-0 transition-colors ${config.action === 'create' ? 'border-[5px] border-[#F4511E]' : 'border-2 border-gray-300 dark:border-slate-500'}`} />
                        <span className="text-sm flex items-center gap-1 text-gray-700 dark:text-slate-300 whitespace-nowrap">
                          <Plus className="w-3.5 h-3.5" />
                          สร้างใหม่
                        </span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer" onClick={() => {
                        setConfigs(prev => ({
                          ...prev,
                          [item.item_id]: { action: 'link' },
                        }));
                        if (!config.link_to_product_id) {
                          setPickerForItemId(item.item_id);
                        }
                      }}>
                        <div className={`w-5 h-5 rounded-full flex-shrink-0 transition-colors ${config.action === 'link' ? 'border-[5px] border-[#F4511E]' : 'border-2 border-gray-300 dark:border-slate-500'}`} />
                        <span className="text-sm flex items-center gap-1 text-gray-700 dark:text-slate-300 whitespace-nowrap">
                          <Link2 className="w-3.5 h-3.5" />
                          ผูกกับสินค้าที่มี
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Row 2: Linked product (only when action=link) */}
                  {config.action === 'link' && (
                    <div className="pl-13">
                      {config.link_to_product_name ? (
                        <div className="flex items-center gap-2.5 text-sm bg-green-50 dark:bg-green-900/20 rounded-lg p-2.5">
                          <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                            {config.link_to_product_image ? (
                              <Image src={config.link_to_product_image} alt="" width={32} height={32} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-slate-500">
                                <Package className="w-4 h-4" />
                              </div>
                            )}
                          </div>
                          <span className="truncate text-green-700 dark:text-green-300 flex-1 min-w-0">{config.link_to_product_name}</span>
                          <button
                            onClick={() => setPickerForItemId(item.item_id)}
                            className="text-xs text-orange-600 dark:text-orange-400 hover:underline flex-shrink-0"
                          >
                            เปลี่ยน
                          </button>
                          <button
                            onClick={() => setConfigs(prev => ({
                              ...prev,
                              [item.item_id]: { action: 'link' },
                            }))}
                            className="p-0.5 text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 rounded flex-shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPickerForItemId(item.item_id)}
                          className="text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 border border-dashed border-orange-300 dark:border-orange-700 rounded-lg p-2.5 w-full text-center hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                        >
                          เลือกสินค้าที่จะผูก...
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Importing / Done */}
      {(step === 'importing' || step === 'done') && (
        <div className="space-y-4">
          {isImporting && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 space-y-2 text-yellow-700 dark:text-yellow-300">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">กำลังนำเข้าสินค้า กรุณาอย่าปิดหน้านี้</p>
              </div>
              {/* Import progress bar */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-yellow-200 dark:bg-yellow-900/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-300"
                    style={{ width: `${selectedItems.length > 0 ? (progressItems.length / selectedItems.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs font-medium whitespace-nowrap">{progressItems.length}/{selectedItems.length}</span>
              </div>
            </div>
          )}

          {importDone && (
            <div className={`rounded-lg p-4 text-center ${errorCount === 0 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'}`}>
              <p className="font-semibold text-lg">
                {errorCount === 0 ? 'นำเข้าสำเร็จทั้งหมด!' : 'นำเข้าเสร็จสิ้น'}
              </p>
              <p className="text-sm mt-1">
                สำเร็จ {successCount} รายการ
                {errorCount > 0 && ` · ผิดพลาด ${errorCount} รายการ`}
              </p>
            </div>
          )}

          {/* Progress list */}
          <div className="space-y-1">
            {progressItems.map((item, idx) => (
              <div key={idx} className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                item.success ? 'bg-green-50 dark:bg-green-900/20 text-gray-900 dark:text-white' : 'bg-red-50 dark:bg-red-900/20 text-gray-900 dark:text-white'
              }`}>
                {item.success ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                )}
                <span className="truncate">{item.item_name}</span>
                {item.error && <span className="text-xs text-red-500 dark:text-red-400 ml-auto flex-shrink-0">{item.error}</span>}
              </div>
            ))}
            {isImporting && (
              <div className="flex items-center gap-2 p-2 text-sm text-gray-400 dark:text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังดำเนินการ... ({progressItems.length}/{selectedItems.length})
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer navigation */}
      <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 mt-6 -mx-4 px-4 py-3 flex items-center justify-between">
        <div>
          {step === 'select' && (
            <button
              onClick={() => router.push('/settings/integrations')}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับ
            </button>
          )}
          {step === 'configure' && (
            <button
              onClick={() => setStep('select')}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับ
            </button>
          )}
          {step === 'done' && (
            <button
              onClick={() => router.push('/settings/integrations')}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับหน้าเชื่อมต่อ
            </button>
          )}
        </div>

        <div>
          {step === 'select' && (
            <button
              onClick={goToConfigure}
              disabled={selectedItems.length === 0}
              className="flex items-center gap-2 px-5 py-2 bg-[#EE4D2D] text-white rounded-lg text-sm font-medium hover:bg-[#d4442a] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ถัดไป
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 'configure' && (
            <button
              onClick={executeImport}
              disabled={selectedItems.some(item => {
                const config = configs[item.item_id];
                return config?.action === 'link' && !config.link_to_product_id;
              })}
              className="flex items-center gap-2 px-5 py-2 bg-[#EE4D2D] text-white rounded-lg text-sm font-medium hover:bg-[#d4442a] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              นำเข้า {selectedItems.length} รายการ
            </button>
          )}
          {step === 'done' && (
            <button
              onClick={() => router.push('/products')}
              className="flex items-center gap-2 px-5 py-2 bg-[#EE4D2D] text-white rounded-lg text-sm font-medium hover:bg-[#d4442a]"
            >
              ดูสินค้าทั้งหมด
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Product picker modal */}
      {pickerForItemId !== null && (
        <ProductPicker
          onSelect={(product) => handleProductPicked(product as any)}
          onCancel={() => setPickerForItemId(null)}
        />
      )}
    </Layout>
  );
}

export default function ShopeeImportPage() {
  return (
    <Suspense fallback={
      <Layout title="นำเข้าสินค้าจาก Shopee">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      </Layout>
    }>
      <ShopeeImportContent />
    </Suspense>
  );
}
