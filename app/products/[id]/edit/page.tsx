// Path: app/products/[id]/edit/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import ProductForm, { type ProductItem, type FormOptions } from '@/components/products/ProductForm';
import { type ProductImage } from '@/components/ui/ImageUploader';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import imageCompression from 'browser-image-compression';
import { useToast } from '@/lib/toast-context';
import { ArrowLeft, Loader2, ArrowUpFromLine, ExternalLink, Unlink2, Package2, Camera, Merge, Search, X, ChevronRight, Upload } from 'lucide-react';
import ShopeeExportModal from '@/components/shopee/ShopeeExportModal';
import ShopeeCategoryPicker from '@/components/shopee/ShopeeCategoryPicker';

interface MarketplaceLink {
  id: string;
  platform: string;
  account_id: string;
  account_name: string;
  shop_id: string | null;
  product_id: string;
  variation_id: string | null;
  external_item_id: string;
  external_model_id: string;
  external_sku: string | null;
  external_item_status: string | null;
  platform_product_name: string | null;
  platform_price: number | null;
  platform_discount_price: number | null;
  platform_barcode: string | null;
  platform_primary_image: string | null;
  last_synced_at: string | null;
  last_price_pushed_at: string | null;
  last_stock_pushed_at: string | null;
  shopee_category_id: number | null;
  shopee_category_name: string | null;
  weight: number | null;
  sync_enabled: boolean;
  products: {
    id: string;
    code: string;
    name: string;
    image: string | null;
    source: string | null;
    is_active: boolean;
    variation_label: string | null;
  } | null;
  product_variations: {
    id: string;
    variation_label: string;
    sku: string | null;
    default_price: number;
    discount_price: number;
    stock: number;
    is_active: boolean;
  } | null;
}

function formatTimestamp(ts: string | null) {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function formatPriceValue(value: number | null | undefined) {
  if (value == null || value === 0) return '-';
  return `฿${value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { features } = useFeatures();
  const productId = params.id as string;

  const [product, setProduct] = useState<ProductItem | null>(null);
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [variationImages, setVariationImages] = useState<Record<string, ProductImage[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // undefined = loading, FormOptions = loaded
  const [formOptions, setFormOptions] = useState<FormOptions | undefined>(undefined);

  // Marketplace links state
  const [marketplaceLinks, setMarketplaceLinks] = useState<MarketplaceLink[]>([]);
  const [activeTab, setActiveTabState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      return hash || 'info';
    }
    return 'info';
  });
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    window.history.replaceState(null, '', `#${tab}`);
  };
  const [pushingAction, setPushingAction] = useState<string | null>(null);
  const { showToast } = useToast();

  // Platform fields local state — track edited values per link
  const [platformNameValues, setPlatformNameValues] = useState<Record<string, string>>({});
  const [priceValues, setPriceValues] = useState<Record<string, string>>({});
  const [discountValues, setDiscountValues] = useState<Record<string, string>>({});
  const [barcodeValues, setBarcodeValues] = useState<Record<string, string>>({});
  const [categoryIdValues, setCategoryIdValues] = useState<Record<string, number | null>>({});
  const [categoryNameValues, setCategoryNameValues] = useState<Record<string, string>>({});
  const [weightValues, setWeightValues] = useState<Record<string, string>>({});
  const [savingLink, setSavingLink] = useState<Record<string, boolean>>({});
  const [dirtyLinks, setDirtyLinks] = useState<Set<string>>(new Set());

  // Merge modal state
  const [mergeModal, setMergeModal] = useState(false);
  const [mergeStep, setMergeStep] = useState<1 | 2>(1);
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergeAllProducts, setMergeAllProducts] = useState<ProductItem[]>([]);
  const [mergeLoadingProducts, setMergeLoadingProducts] = useState(false);
  const [mergeSource, setMergeSource] = useState<ProductItem | null>(null);
  const [mergeMasterId, setMergeMasterId] = useState<'current' | 'source'>('current');
  const [mergeFieldChoices, setMergeFieldChoices] = useState<Record<string, 'current' | 'source'>>({});
  const [mergeVarMapping, setMergeVarMapping] = useState<{ source_id: string; target_id: string | null }[]>([]);
  const [merging, setMerging] = useState(false);

  // Shopee export
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [hasShopeeAccounts, setHasShopeeAccounts] = useState(false);

  // Image upload
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null); // link_id being uploaded

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (authLoading || !userProfile || !productId) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const loadProduct = async () => {
      try {
        const res = await apiFetch(`/api/products/${productId}`);
        if (!res.ok) {
          setError('ไม่พบสินค้า');
          setLoading(false);
          return;
        }
        const data = await res.json();

        if (!data.product) {
          setError('ไม่พบสินค้า');
          setLoading(false);
          return;
        }
        setProduct(data.product as ProductItem);
        setProductImages(data.images || []);
        setVariationImages(data.variation_images || {});

        // Marketplace links
        const links = data.marketplace_links || [];
        setMarketplaceLinks(links);
        if (links.length > 0) {
          const platNames: Record<string, string> = {};
          const prices: Record<string, string> = {};
          const discounts: Record<string, string> = {};
          const barcodes: Record<string, string> = {};
          const catIds: Record<string, number | null> = {};
          const catNames: Record<string, string> = {};
          const weights: Record<string, string> = {};
          links.forEach((l: MarketplaceLink) => {
            platNames[l.id] = l.platform_product_name || product?.name || '';
            prices[l.id] = l.platform_price?.toString() || '';
            discounts[l.id] = l.platform_discount_price?.toString() || '';
            barcodes[l.id] = l.platform_barcode || '';
            catIds[l.id] = l.shopee_category_id;
            catNames[l.id] = l.shopee_category_name || '';
            weights[l.id] = l.weight?.toString() || '';
          });
          setPlatformNameValues(platNames);
          setPriceValues(prices);
          setDiscountValues(discounts);
          setBarcodeValues(barcodes);
          setCategoryIdValues(catIds);
          setCategoryNameValues(catNames);
          setWeightValues(weights);

          // If any link has category_id but no category_name, refresh via API to trigger backfill
          const needsBackfill = links.some((l: MarketplaceLink) => l.shopee_category_id && !l.shopee_category_name);
          if (needsBackfill) {
            apiFetch(`/api/marketplace/links?product_id=${productId}`).then(async (r) => {
              if (!r.ok) return;
              const d = await r.json();
              const backfilledLinks = d.links || [];
              setMarketplaceLinks(backfilledLinks);
              const newCatNames: Record<string, string> = {};
              backfilledLinks.forEach((l: MarketplaceLink) => {
                newCatNames[l.id] = l.shopee_category_name || '';
              });
              setCategoryNameValues(prev => ({ ...prev, ...newCatNames }));
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error('Error loading product:', err);
        setError('ไม่สามารถโหลดข้อมูลสินค้าได้');
      } finally {
        setLoading(false);
      }
    };

    // Fetch product and form options in parallel
    const loadFormOptions = async () => {
      try {
        const res = await apiFetch('/api/products/form-options');
        if (res.ok) {
          const data = await res.json();
          setFormOptions(data);
        }
      } catch { /* ignore — ProductForm will fallback to fetching itself */ }
    };

    loadProduct();
    loadFormOptions();
  }, [authLoading, userProfile, productId]);

  // Check if Shopee accounts exist (for export button) — only when product has no marketplace links
  const shopeeCheckedRef = useRef(false);
  useEffect(() => {
    if (shopeeCheckedRef.current) return;
    if (loading) return; // wait until product loaded
    if (marketplaceLinks.length > 0) return; // already has links, no need to check
    if (!features?.marketplace_sync) return; // feature not enabled
    shopeeCheckedRef.current = true;
    const checkShopee = async () => {
      try {
        const res = await apiFetch('/api/shopee/accounts');
        if (res.ok) {
          const data = await res.json();
          setHasShopeeAccounts(Array.isArray(data) && data.some((a: { is_active: boolean }) => a.is_active));
        }
      } catch { /* ignore */ }
    };
    checkShopee();
  }, [loading, marketplaceLinks.length, features?.marketplace_sync]);

  // Refresh marketplace links
  const refreshLinks = async () => {
    try {
      const res = await apiFetch(`/api/marketplace/links?product_id=${productId}`);
      if (res.ok) {
        const data = await res.json();
        setMarketplaceLinks(data.links || []);
        const platNames: Record<string, string> = {};
        const prices: Record<string, string> = {};
        const discounts: Record<string, string> = {};
        const barcodes: Record<string, string> = {};
        const catIds: Record<string, number | null> = {};
        const catNames: Record<string, string> = {};
        const weights: Record<string, string> = {};
        (data.links || []).forEach((l: MarketplaceLink) => {
          platNames[l.id] = l.platform_product_name || product?.name || '';
          prices[l.id] = l.platform_price?.toString() || '';
          discounts[l.id] = l.platform_discount_price?.toString() || '';
          barcodes[l.id] = l.platform_barcode || '';
          catIds[l.id] = l.shopee_category_id;
          catNames[l.id] = l.shopee_category_name || '';
          weights[l.id] = l.weight?.toString() || '';
        });
        setPlatformNameValues(platNames);
        setPriceValues(prices);
        setDiscountValues(discounts);
        setBarcodeValues(barcodes);
        setCategoryIdValues(catIds);
        setCategoryNameValues(catNames);
        setWeightValues(weights);
      }
    } catch (err) {
      console.error('Failed to refresh links:', err);
    }
  };

  // Group links by account
  const accountsMap = new Map<string, { name: string; shopId: string | null; links: MarketplaceLink[] }>();
  marketplaceLinks.forEach(link => {
    const existing = accountsMap.get(link.account_id);
    if (existing) {
      existing.links.push(link);
    } else {
      accountsMap.set(link.account_id, {
        name: link.account_name || 'Shopee',
        shopId: link.shop_id || null,
        links: [link],
      });
    }
  });
  const shopAccounts = Array.from(accountsMap.entries());

  // Is this a simple product? (only 1 link with no variation)
  const isSimpleProduct = product?.product_type === 'simple';

  // Actions
  const handlePushPrice = async (accountId: string) => {
    setPushingAction(`price-${accountId}`);
    try {
      const res = await apiFetch('/api/shopee/products/push-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, shopee_account_id: accountId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Push ราคาสำเร็จ');
        await refreshLinks();
      } else {
        showToast(data.error || data.errors?.join('; ') || 'Push ราคาไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการ push ราคา', 'error');
    } finally {
      setPushingAction(null);
    }
  };

  const handlePushStock = async (accountId: string) => {
    setPushingAction(`stock-${accountId}`);
    try {
      const res = await apiFetch('/api/shopee/products/push-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, shopee_account_id: accountId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Push สต็อกสำเร็จ');
        await refreshLinks();
      } else {
        showToast(data.error || data.errors?.join('; ') || 'Push สต็อกไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการ push สต็อก', 'error');
    } finally {
      setPushingAction(null);
    }
  };

  const handleUnlink = async (linkId: string) => {
    if (!confirm('ต้องการยกเลิกการเชื่อมโยงสินค้านี้?')) return;
    setPushingAction(`unlink-${linkId}`);
    try {
      const res = await apiFetch(`/api/shopee/products/link?link_id=${linkId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('ยกเลิกการเชื่อมโยงสำเร็จ');
        await refreshLinks();
      } else {
        showToast('ไม่สามารถยกเลิกได้', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setPushingAction(null);
    }
  };

  // Mark a link as dirty when its field changes
  const markDirty = (linkId: string) => {
    setDirtyLinks(prev => new Set(prev).add(linkId));
  };

  // Cancel all changes — reset to original values from marketplaceLinks
  const handleCancelChanges = () => {
    router.push('/products');
  };

  // Save all dirty links
  const handleSaveAllLinks = async () => {
    const linkIds = Array.from(dirtyLinks);
    if (linkIds.length === 0) return;

    // Mark all as saving
    const saving: Record<string, boolean> = {};
    linkIds.forEach(id => { saving[id] = true; });
    setSavingLink(prev => ({ ...prev, ...saving }));

    try {
      const results = await Promise.all(
        linkIds.map(async (linkId) => {
          const platNameVal = platformNameValues[linkId];
          const priceVal = priceValues[linkId];
          const discountVal = discountValues[linkId];
          const barcodeVal = barcodeValues[linkId];
          const catIdVal = categoryIdValues[linkId];
          const catNameVal = categoryNameValues[linkId];
          const weightVal = weightValues[linkId];
          const platName = platNameVal?.trim() || null;
          const numPrice = priceVal?.trim() === '' ? null : parseFloat(priceVal);
          const numDiscount = discountVal?.trim() === '' ? null : parseFloat(discountVal);
          const barcode = barcodeVal?.trim() || null;
          const catName = catNameVal?.trim() || null;
          const numWeight = weightVal?.trim() === '' ? null : parseFloat(weightVal);

          const res = await apiFetch('/api/marketplace/links', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              link_id: linkId,
              platform_product_name: platName,
              platform_price: numPrice,
              platform_discount_price: numDiscount,
              platform_barcode: barcode,
              shopee_category_id: catIdVal ?? null,
              shopee_category_name: catName,
              weight: numWeight,
            }),
          });
          return res.ok;
        })
      );

      if (results.every(Boolean)) {
        showToast('บันทึกสำเร็จ');
      } else {
        showToast('บันทึกบางรายการไม่สำเร็จ', 'error');
      }
      setDirtyLinks(new Set());
      await refreshLinks();
    } catch (err) {
      console.error('Failed to save link fields:', err);
      showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
    } finally {
      const cleared: Record<string, boolean> = {};
      linkIds.forEach(id => { cleared[id] = false; });
      setSavingLink(prev => ({ ...prev, ...cleared }));
    }
  };

  // Upload platform primary image
  const handleImageUpload = async (linkId: string, file: File) => {
    setUploadingImage(linkId);
    try {
      // Compress image
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      });

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `marketplace/${linkId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(storagePath, compressed, { contentType: compressed.type || 'image/jpeg' });

      if (uploadError) {
        showToast('อัปโหลดรูปไม่สำเร็จ', 'error');
        return;
      }

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(storagePath);

      // Save to marketplace_product_links
      const res = await apiFetch('/api/marketplace/links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_id: linkId, platform_primary_image: urlData.publicUrl }),
      });

      if (res.ok) {
        showToast('เปลี่ยนรูปสำเร็จ');
        await refreshLinks();
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการอัปโหลดรูป', 'error');
    } finally {
      setUploadingImage(null);
    }
  };

  // --- Merge handlers ---
  const openMergeModal = async () => {
    setMergeModal(true);
    setMergeStep(1);
    setMergeSearch('');
    setMergeSource(null);
    setMergeMasterId('current');
    setMergeFieldChoices({});
    setMergeVarMapping([]);
    // Load all products for search
    if (mergeAllProducts.length === 0) {
      setMergeLoadingProducts(true);
      try {
        const res = await apiFetch('/api/products');
        if (res.ok) {
          const data = await res.json();
          setMergeAllProducts(data.products || []);
        }
      } catch { /* ignore */ }
      setMergeLoadingProducts(false);
    }
  };

  const closeMergeModal = () => {
    setMergeModal(false);
    setMergeStep(1);
    setMergeSource(null);
  };

  // Build auto-matched variation mapping (secondaryVars → masterVars)
  const buildVarMapping = (secondaryVars: ProductItem['variations'] | undefined, masterVars: ProductItem['variations'] | undefined) => {
    return (secondaryVars || []).map(sv => {
      const matched = (masterVars || []).find(mv => mv.sku && sv.sku && mv.sku === sv.sku);
      return { source_id: sv.variation_id!, target_id: matched?.variation_id || null };
    });
  };

  const selectMergeSource = (p: ProductItem) => {
    setMergeSource(p);
    setMergeMasterId('current');
    setMergeFieldChoices({ name: 'current', code: 'current', description: 'current', image: 'current', category_id: 'current', brand_id: 'current' });
    // Default: mergeSource is secondary, current product is master
    setMergeVarMapping(buildVarMapping(p.variations, product?.variations));
    setMergeStep(2);
  };

  // Rebuild mapping when master changes
  const handleMasterChange = (newMaster: 'current' | 'source') => {
    if (!mergeSource || !product) return;
    setMergeMasterId(newMaster);
    if (newMaster === 'current') {
      // source product is secondary
      setMergeVarMapping(buildVarMapping(mergeSource.variations, product.variations));
    } else {
      // current product is secondary
      setMergeVarMapping(buildVarMapping(product.variations, mergeSource.variations));
    }
  };

  const executeMerge = async () => {
    if (!mergeSource || !product) return;
    setMerging(true);
    try {
      const isMasterCurrent = mergeMasterId === 'current';
      const masterProd = isMasterCurrent ? product : mergeSource;
      const secondaryProd = isMasterCurrent ? mergeSource : product;

      // Build use_source_fields: fields where user chose the "secondary" product's data
      // API expects "source" = the product being merged into target
      const useSourceFields: string[] = [];
      for (const [field, choice] of Object.entries(mergeFieldChoices)) {
        // "source" choice means "use the source product that's being merged in"
        // If master=current: secondary=mergeSource, so choice='source' → use mergeSource's data → send to API as use_source_fields
        // If master=source: secondary=current, so choice='current' → use current's data → send to API as use_source_fields
        if (isMasterCurrent && choice === 'source') useSourceFields.push(field);
        if (!isMasterCurrent && choice === 'current') useSourceFields.push(field);
      }

      // mergeVarMapping is already in "secondary → master" direction
      const variationMapping = mergeVarMapping.map(m => ({
        source_variation_id: m.source_id,
        target_variation_id: m.target_id,
      }));

      const res = await apiFetch('/api/products/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_product_id: masterProd.product_id,
          source_product_id: secondaryProd.product_id,
          variation_mapping: variationMapping,
          use_source_fields: useSourceFields,
        }),
      });

      if (res.ok) {
        showToast('รวมสินค้าสำเร็จ');
        closeMergeModal();
        // Redirect to master product edit page
        if (masterProd.product_id !== product.product_id) {
          router.push(`/products/${masterProd.product_id}/edit`);
        } else {
          // Reload current page
          fetchedRef.current = false;
          window.location.reload();
        }
      } else {
        const errData = await res.json();
        showToast(errData.error || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการรวมสินค้า', 'error');
    } finally {
      setMerging(false);
    }
  };

  // Filter products for merge search
  const mergeSearchResults = mergeAllProducts.filter(p => {
    if (p.product_id === productId) return false; // exclude self
    if (!mergeSearch.trim()) return true;
    const term = mergeSearch.toLowerCase();
    const matchName = p.name.toLowerCase().includes(term);
    const matchCode = p.code.toLowerCase().includes(term);
    const matchSku = p.variations?.some(v => (v.sku || '').toLowerCase().includes(term));
    return matchName || matchCode || matchSku;
  }).slice(0, 20);

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">กำลังโหลดข้อมูล...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !product) {
    return (
      <Layout>
        <div className="max-w-4xl space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/products')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">แก้ไขสินค้า</h1>
          </div>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error || 'ไม่พบสินค้า'}
          </div>
        </div>
      </Layout>
    );
  }

  const hasTabs = shopAccounts.length > 0;

  // Helper: get system default price for a link
  const getSystemPrice = (link: MarketplaceLink) => {
    const variation = link.product_variations;
    if (variation) return variation.default_price;
    return product.simple_default_price;
  };

  // Helper: get system discount price for a link
  const getSystemDiscountPrice = (link: MarketplaceLink) => {
    const variation = link.product_variations;
    if (variation) return variation.discount_price > 0 ? variation.discount_price : null;
    return (product.simple_discount_price && product.simple_discount_price > 0)
      ? product.simple_discount_price
      : null;
  };

  // Render image with change button (for first link / primary image)
  const renderPrimaryImage = (link: MarketplaceLink) => {
    const image = link.platform_primary_image || product.image;
    const isUploading = uploadingImage === link.id;

    return (
      <div className="relative group flex-shrink-0">
        {image ? (
          <img
            src={image}
            alt={product.name}
            className="w-32 h-32 rounded-lg object-cover border border-gray-200 dark:border-slate-600"
          />
        ) : (
          <div className="w-32 h-32 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center border border-gray-200 dark:border-slate-600">
            <Package2 className="w-10 h-10 text-gray-400" />
          </div>
        )}
        {/* Overlay change button */}
        <button
          type="button"
          onClick={() => {
            imageInputRef.current?.setAttribute('data-link-id', link.id);
            imageInputRef.current?.click();
          }}
          disabled={isUploading}
          className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        >
          {isUploading ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <Camera className="w-5 h-5 text-white" />
          )}
        </button>
      </div>
    );
  };

  // Render simple product shop tab (card layout, no table)
  const renderSimpleShopTab = (link: MarketplaceLink, shopId: string | null) => {
    const systemPrice = getSystemPrice(link);
    const systemDiscountPrice = getSystemDiscountPrice(link);

    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-5">
        {/* Product info row */}
        <div className="flex items-start gap-4">
          {renderPrimaryImage(link)}
          <div className="flex-1 min-w-0">
            <div className="relative">
              <textarea
                value={platformNameValues[link.id] || ''}
                onChange={e => { if (e.target.value.length <= 120) { setPlatformNameValues(prev => ({ ...prev, [link.id]: e.target.value })); markDirty(link.id); } }}
                maxLength={120}
                rows={2}
                className={`w-full px-2 py-1.5 text-sm border rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#F4511E] focus:border-[#F4511E] resize-none ${
                  (platformNameValues[link.id] || '').length > 0 && (platformNameValues[link.id] || '').length < 20
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-gray-300 dark:border-slate-600'
                }`}
              />
              <span className={`absolute right-2 bottom-2.5 text-[11px] pointer-events-none ${
                (platformNameValues[link.id] || '').length < 20 ? 'text-red-500' : 'text-gray-400 dark:text-slate-500'
              }`}>
                {(platformNameValues[link.id] || '').length}/120
              </span>
            </div>
            {(platformNameValues[link.id] || '').length > 0 && (platformNameValues[link.id] || '').length < 20 && (
              <p className="text-[11px] text-red-500 mt-0.5">ชื่อสินค้าต้องมีอย่างน้อย 20 ตัวอักษร</p>
            )}
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 font-mono">
              Item ID: {link.external_item_id}
            </p>
            {link.external_sku && (
              <p className="text-xs text-gray-500 dark:text-slate-400 font-mono">
                SKU: {link.external_sku}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {shopId && (
              <a
                href={`https://shopee.co.th/product/${shopId}/${link.external_item_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-gray-500 hover:text-blue-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
                title="ดูบน Shopee"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={() => handleUnlink(link.id)}
              disabled={pushingAction !== null}
              className="p-2 text-gray-500 hover:text-red-500 transition-colors disabled:opacity-50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
              title="ยกเลิกเชื่อมโยง"
            >
              <Unlink2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Category + Weight (3-col aligned with row below) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              หมวดหมู่ Shopee
            </label>
            <ShopeeCategoryPicker
              accountId={link.account_id}
              value={categoryIdValues[link.id] ?? null}
              categoryName={categoryNameValues[link.id] || ''}
              onChange={(catId, catName) => {
                setCategoryIdValues(prev => ({ ...prev, [link.id]: catId }));
                setCategoryNameValues(prev => ({ ...prev, [link.id]: catName }));
                markDirty(link.id);
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              น้ำหนัก (kg)
            </label>
            <input
              type="number"
              value={weightValues[link.id] || ''}
              onChange={e => { setWeightValues(prev => ({ ...prev, [link.id]: e.target.value })); markDirty(link.id); }}
              step="0.1"
              min="0"
              placeholder="0.5"
              className="w-full px-3 h-[42px] text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#F4511E] focus:border-[#F4511E]"
            />
          </div>
        </div>
        {/* Barcode + Price + Discount — same row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Barcode
            </label>
            <input
              type="text"
              value={barcodeValues[link.id] || ''}
              onChange={e => { setBarcodeValues(prev => ({ ...prev, [link.id]: e.target.value })); markDirty(link.id); }}
              placeholder="-"
              className="w-full px-3 h-[42px] text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#F4511E] focus:border-[#F4511E]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              ราคา Platform (฿)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={priceValues[link.id] || ''}
                onChange={e => { setPriceValues(prev => ({ ...prev, [link.id]: e.target.value })); markDirty(link.id); }}
                min="0"
                step="0.01"
                placeholder="ไม่ได้ตั้ง"
                className="flex-1 px-3 h-[42px] text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#F4511E] focus:border-[#F4511E]"
              />
              {savingLink[link.id] && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            </div>
            <p className="text-[11px] text-blue-500 dark:text-blue-400 mt-1 font-medium">
              ราคาในระบบ: {formatPriceValue(systemPrice)}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              ราคาลด (฿)
            </label>
            <input
              type="number"
              value={discountValues[link.id] || ''}
              onChange={e => { setDiscountValues(prev => ({ ...prev, [link.id]: e.target.value })); markDirty(link.id); }}
              min="0"
              step="0.01"
              placeholder="0"
              className="w-full px-3 h-[42px] text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#F4511E] focus:border-[#F4511E]"
            />
            <p className="text-[11px] text-blue-500 dark:text-blue-400 mt-1 font-medium">
              ราคาลดในระบบ: {formatPriceValue(systemDiscountPrice)}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Render variation product shop tab (table layout)
  const renderVariationShopTab = (links: MarketplaceLink[], shopId: string | null) => {
    // Use the first link to get the primary image
    const firstLink = links[0];

    return (
      <div className="space-y-4">
        {/* Product header with image */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-5">
          <div className="flex items-start gap-4">
            {renderPrimaryImage(firstLink)}
            <div className="flex-1 min-w-0">
              <div className="relative">
                <textarea
                  value={platformNameValues[firstLink.id] || ''}
                  onChange={e => {
                    const val = e.target.value;
                    if (val.length <= 120) {
                      setPlatformNameValues(prev => {
                        const next = { ...prev };
                        links.forEach(l => { next[l.id] = val; });
                        return next;
                      });
                      links.forEach(l => markDirty(l.id));
                    }
                  }}
                  maxLength={120}
                  rows={2}
                  className={`w-full px-2 py-1.5 text-sm border rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#F4511E] focus:border-[#F4511E] resize-none ${
                    (platformNameValues[firstLink.id] || '').length > 0 && (platformNameValues[firstLink.id] || '').length < 20
                      ? 'border-red-400 dark:border-red-500'
                      : 'border-gray-300 dark:border-slate-600'
                  }`}
                />
                <span className={`absolute right-2 bottom-2.5 text-[11px] pointer-events-none ${
                  (platformNameValues[firstLink.id] || '').length < 20 ? 'text-red-500' : 'text-gray-400 dark:text-slate-500'
                }`}>
                  {(platformNameValues[firstLink.id] || '').length}/120
                </span>
              </div>
              {(platformNameValues[firstLink.id] || '').length > 0 && (platformNameValues[firstLink.id] || '').length < 20 && (
                <p className="text-[11px] text-red-500 mt-0.5">ชื่อสินค้าต้องมีอย่างน้อย 20 ตัวอักษร</p>
              )}
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 font-mono">
                Item ID: {firstLink.external_item_id}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {shopId && (
                <a
                  href={`https://shopee.co.th/product/${shopId}/${firstLink.external_item_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-500 hover:text-blue-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
                  title="ดูบน Shopee"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          {/* Category + Weight (same layout as simple product) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมวดหมู่ Shopee</label>
              <ShopeeCategoryPicker
                accountId={firstLink.account_id}
                value={categoryIdValues[firstLink.id] ?? null}
                categoryName={categoryNameValues[firstLink.id] || ''}
                onChange={(catId, catName) => {
                  setCategoryIdValues(prev => ({ ...prev, [firstLink.id]: catId }));
                  setCategoryNameValues(prev => ({ ...prev, [firstLink.id]: catName }));
                  markDirty(firstLink.id);
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">น้ำหนัก (kg)</label>
              <input
                type="number"
                value={weightValues[firstLink.id] || ''}
                onChange={e => { setWeightValues(prev => ({ ...prev, [firstLink.id]: e.target.value })); markDirty(firstLink.id); }}
                min="0"
                step="0.1"
                placeholder="0.5"
                className="w-full px-3 h-[42px] text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#F4511E] focus:border-[#F4511E]"
              />
            </div>
          </div>
        </div>

        {/* Variations table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table-fixed">
              <thead>
                <tr className="data-thead-tr">
                  <th className="data-th w-[72px]">รูป</th>
                  <th className="data-th">ตัวเลือก</th>
                  <th className="data-th">SKU (Shopee)</th>
                  <th className="data-th">Barcode</th>
                  <th className="data-th">ราคา Platform (฿)</th>
                  <th className="data-th">ราคาลด (฿)</th>
                  <th className="data-th text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="data-tbody">
                {links.map(link => {
                  const variation = link.product_variations;
                  const systemPrice = getSystemPrice(link);
                  const systemDiscountPrice = getSystemDiscountPrice(link);
                  const varImages = link.variation_id ? variationImages[link.variation_id] : null;
                  const varImage = varImages?.[0]?.image_url || product.image;

                  return (
                    <tr key={link.id} className="data-tr align-top">
                      <td className="px-3 py-3">
                        {varImage ? (
                          <img
                            src={varImage}
                            alt={variation?.variation_label || ''}
                            className="w-14 h-14 rounded-lg object-cover border border-gray-200 dark:border-slate-600"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center border border-gray-200 dark:border-slate-600">
                            <Package2 className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        <div className="pt-1.5">{variation?.variation_label || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-slate-300 font-mono">
                        <div className="pt-1.5">{link.external_sku || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={barcodeValues[link.id] || ''}
                          onChange={e => { setBarcodeValues(prev => ({ ...prev, [link.id]: e.target.value })); markDirty(link.id); }}
                          placeholder="-"
                          className="w-32 px-2 py-1.5 text-xs border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#F4511E] focus:border-[#F4511E]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={priceValues[link.id] || ''}
                            onChange={e => { setPriceValues(prev => ({ ...prev, [link.id]: e.target.value })); markDirty(link.id); }}
                            min="0"
                            step="0.01"
                            placeholder="ไม่ได้ตั้ง"
                            className="w-24 px-2 py-1.5 text-xs border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#F4511E] focus:border-[#F4511E]"
                          />
                          {savingLink[link.id] && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                        </div>
                        <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-0.5 font-medium">
                          ราคาในระบบ: {formatPriceValue(systemPrice)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={discountValues[link.id] || ''}
                          onChange={e => { setDiscountValues(prev => ({ ...prev, [link.id]: e.target.value })); markDirty(link.id); }}
                          min="0"
                          step="0.01"
                          placeholder="0"
                          className="w-24 px-2 py-1.5 text-xs border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#F4511E] focus:border-[#F4511E]"
                        />
                        <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-0.5 font-medium">
                          ราคาลดในระบบ: {formatPriceValue(systemDiscountPrice)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {shopId && (
                            <a
                              href={`https://shopee.co.th/product/${shopId}/${link.external_item_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-gray-500 hover:text-blue-500 transition-colors"
                              title="ดูบน Shopee"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => handleUnlink(link.id)}
                            disabled={pushingAction !== null}
                            className="p-1.5 text-gray-500 hover:text-red-500 transition-colors disabled:opacity-50"
                            title="ยกเลิกเชื่อมโยง"
                          >
                            <Unlink2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="space-y-4 max-w-4xl">
        {/* Hidden file input for image upload */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            const linkId = imageInputRef.current?.getAttribute('data-link-id');
            if (file && linkId) {
              handleImageUpload(linkId, file);
            }
            e.target.value = '';
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/products')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">แก้ไขสินค้า</h1>
            <span className="text-sm text-gray-400 font-mono">{product.code}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Shopee export — only when product has no marketplace link yet */}
            {!hasTabs && hasShopeeAccounts && (
              <button
                type="button"
                onClick={() => setExportModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#EE4D2D] border border-[#EE4D2D] rounded-lg hover:bg-[#EE4D2D]/10 transition-colors"
              >
                <Upload className="w-4 h-4" />
                ส่งไป Shopee
              </button>
            )}
            <button
              type="button"
              onClick={openMergeModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-slate-400 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Merge className="w-4 h-4" />
              รวมกับสินค้าอื่น
            </button>
          </div>
        </div>

        {/* Tab Bar — only show if product has marketplace links */}
        {hasTabs && (
          <div className="border-b border-gray-200 dark:border-slate-700">
            <nav className="flex gap-0 -mb-px">
              {/* Info tab */}
              <button
                onClick={() => setActiveTab('info')}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'info'
                    ? 'border-[#F4511E] text-[#F4511E]'
                    : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                }`}
              >
                ข้อมูลสินค้า
              </button>

              {/* Shop tabs — one per linked account */}
              {shopAccounts.map(([accountId, account]) => (
                <button
                  key={accountId}
                  onClick={() => setActiveTab(accountId)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === accountId
                      ? 'border-[#F4511E] text-[#F4511E]'
                      : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                  }`}
                >
                  <img src="/marketplace/shopee.svg" alt="" className="w-4 h-4" />
                  {account.name}
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'info' ? (
          /* Info Tab — ProductForm */
          <ProductForm
            editingProduct={product}
            initialImages={productImages}
            initialVariationImages={variationImages}
            formOptions={formOptions}
          />
        ) : (
          /* Shop Tab — Marketplace links for this account */
          (() => {
            const accountData = accountsMap.get(activeTab);
            if (!accountData) return null;
            const { name: accountName, shopId, links } = accountData;

            return (
              <div className="space-y-4">
                {/* Shop name + action buttons */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <img src="/marketplace/shopee.svg" alt="Shopee" className="w-5 h-5" />
                    <span className="font-medium text-gray-900 dark:text-white">{accountName}</span>
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                      {links.length} รายการ
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 dark:text-slate-500">
                      Sync: {formatTimestamp(links[0]?.last_synced_at)}
                    </span>
                    <button
                      onClick={() => handlePushPrice(activeTab)}
                      disabled={pushingAction !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#EE4D2D] text-[#EE4D2D] rounded-lg hover:bg-[#EE4D2D]/10 disabled:opacity-50 transition-colors"
                    >
                      {pushingAction === `price-${activeTab}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
                      Push ราคา
                    </button>
                    <button
                      onClick={() => handlePushStock(activeTab)}
                      disabled={pushingAction !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#EE4D2D] text-[#EE4D2D] rounded-lg hover:bg-[#EE4D2D]/10 disabled:opacity-50 transition-colors"
                    >
                      {pushingAction === `stock-${activeTab}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
                      Push สต็อก
                    </button>
                  </div>
                </div>

                {/* Content: simple vs variation */}
                {isSimpleProduct && links.length === 1 ? (
                  renderSimpleShopTab(links[0], shopId)
                ) : (
                  renderVariationShopTab(links, shopId)
                )}

                {/* Save / Cancel buttons — show when dirty */}
                {dirtyLinks.size > 0 && (
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleCancelChanges}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAllLinks}
                      disabled={Object.values(savingLink).some(Boolean)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#E64A19] disabled:opacity-50 transition-colors"
                    >
                      {Object.values(savingLink).some(Boolean) && <Loader2 className="w-4 h-4 animate-spin" />}
                      บันทึก
                    </button>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* ====== Merge Modal ====== */}
      {mergeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={closeMergeModal}>
          <div
            className="bg-white dark:bg-slate-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {mergeStep === 1 ? 'เลือกสินค้าที่จะรวม' : 'ตั้งค่าการรวมสินค้า'}
              </h3>
              <button onClick={closeMergeModal} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="px-6 py-4">
              {/* Step 1: Search & Select */}
              {mergeStep === 1 && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={mergeSearch}
                      onChange={e => setMergeSearch(e.target.value)}
                      placeholder="ค้นหาด้วย ชื่อ, รหัส, SKU..."
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                      autoFocus
                    />
                  </div>

                  {mergeLoadingProducts ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                      {mergeSearchResults.length === 0 ? (
                        <p className="text-center text-gray-500 dark:text-slate-400 text-sm py-6">ไม่พบสินค้า</p>
                      ) : (
                        mergeSearchResults.map(p => (
                          <button
                            key={p.product_id}
                            onClick={() => selectMergeSource(p)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-left"
                          >
                            {p.image || p.main_image_url ? (
                              <img src={p.image || p.main_image_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-slate-700 flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                <Package2 className="w-5 h-5 text-gray-400" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</div>
                              <div className="text-xs text-gray-500 dark:text-slate-400">
                                {p.code}
                                {(p as any).source === 'shopee' && <span className="ml-2 text-orange-500">Shopee</span>}
                                <span className="ml-2">{(p.variations || []).length} ตัวเลือก</span>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Configure merge */}
              {mergeStep === 2 && mergeSource && product && (
                <div className="space-y-5">
                  {/* Master selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">เลือกสินค้าหลัก (ตัวที่จะเก็บไว้)</label>
                    <div className="space-y-2">
                      <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${mergeMasterId === 'current' ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/10' : 'border-gray-200 dark:border-slate-700'}`}>
                        <input type="radio" checked={mergeMasterId === 'current'} onChange={() => handleMasterChange('current')} className="accent-[#F4511E]" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{product.name}</span>
                          <span className="ml-2 text-xs text-gray-500 font-mono">{product.code}</span>
                        </div>
                        <span className="text-xs text-gray-400">สินค้าปัจจุบัน</span>
                      </label>
                      <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${mergeMasterId === 'source' ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/10' : 'border-gray-200 dark:border-slate-700'}`}>
                        <input type="radio" checked={mergeMasterId === 'source'} onChange={() => handleMasterChange('source')} className="accent-[#F4511E]" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{mergeSource.name}</span>
                          <span className="ml-2 text-xs text-gray-500 font-mono">{mergeSource.code}</span>
                        </div>
                        <span className="text-xs text-gray-400">สินค้าที่เลือก</span>
                      </label>
                    </div>
                    <p className="mt-1.5 text-xs text-red-500">สินค้าที่ไม่ได้เป็นตัวหลักจะถูกปิดใช้งานหลังรวม</p>
                  </div>

                  {/* Field choices */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">เลือกข้อมูลที่จะใช้</label>
                    <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-slate-900">
                            <th className="text-left px-3 py-2 text-gray-600 dark:text-slate-400 font-medium">ฟิลด์</th>
                            <th className="text-left px-3 py-2 text-gray-600 dark:text-slate-400 font-medium">ปัจจุบัน</th>
                            <th className="text-left px-3 py-2 text-gray-600 dark:text-slate-400 font-medium">ที่เลือก</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                          {[
                            { key: 'name', label: 'ชื่อ', current: product.name, source: mergeSource.name },
                            { key: 'code', label: 'รหัส', current: product.code, source: mergeSource.code },
                            { key: 'image', label: 'รูป', current: product.image ? '(มี)' : '-', source: mergeSource.image ? '(มี)' : '-' },
                          ].map(f => (
                            <tr key={f.key}>
                              <td className="px-3 py-2 text-gray-700 dark:text-slate-300 font-medium">{f.label}</td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => setMergeFieldChoices(prev => ({ ...prev, [f.key]: 'current' }))}
                                  className={`text-xs px-2 py-1 rounded ${(mergeFieldChoices[f.key] || 'current') === 'current' ? 'bg-[#F4511E] text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400'}`}
                                >
                                  {f.current}
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => setMergeFieldChoices(prev => ({ ...prev, [f.key]: 'source' }))}
                                  className={`text-xs px-2 py-1 rounded ${mergeFieldChoices[f.key] === 'source' ? 'bg-[#F4511E] text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400'}`}
                                >
                                  {f.source}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Variation mapping */}
                  {(() => {
                    const masterProduct = mergeMasterId === 'current' ? product : mergeSource;
                    const secondaryProduct = mergeMasterId === 'current' ? mergeSource : product;
                    const secondaryVars = secondaryProduct.variations || [];
                    const masterVars = masterProduct.variations || [];

                    if (secondaryVars.length === 0 && masterVars.length === 0) return null;

                    return (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          จับคู่ตัวเลือกสินค้า
                        </label>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
                          ตัวเลือกของ &quot;{secondaryProduct.name}&quot; จะถูกรวมเข้ากับ &quot;{masterProduct.name}&quot;
                        </p>
                        <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 dark:bg-slate-900">
                                <th className="text-left px-3 py-2 text-gray-600 dark:text-slate-400 font-medium">ตัวเลือก (ตัวรอง)</th>
                                <th className="text-left px-3 py-2 text-gray-600 dark:text-slate-400 font-medium">จับคู่กับ (ตัวหลัก)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                              {secondaryVars.map(sv => {
                                const currentMapping = mergeVarMapping.find(m => m.source_id === sv.variation_id);
                                return (
                                  <tr key={sv.variation_id}>
                                    <td className="px-3 py-2">
                                      <div className="text-gray-900 dark:text-white">{sv.variation_label}</div>
                                      {sv.sku && <div className="text-xs text-gray-500">SKU: {sv.sku}</div>}
                                    </td>
                                    <td className="px-3 py-2">
                                      <select
                                        value={currentMapping?.target_id || ''}
                                        onChange={e => {
                                          const val = e.target.value || null;
                                          setMergeVarMapping(prev =>
                                            prev.map(m => m.source_id === sv.variation_id ? { ...m, target_id: val } : m)
                                          );
                                        }}
                                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-white"
                                      >
                                        <option value="">ย้ายมาเลย (ไม่จับคู่)</option>
                                        {masterVars.map(mv => (
                                          <option key={mv.variation_id} value={mv.variation_id}>
                                            {mv.variation_label}{mv.sku ? ` (SKU: ${mv.sku})` : ''}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-slate-700">
              {mergeStep === 2 ? (
                <>
                  <button
                    onClick={() => { setMergeStep(1); setMergeSource(null); }}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
                  >
                    ← ย้อนกลับ
                  </button>
                  <div className="flex gap-2">
                    <button onClick={closeMergeModal} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-400 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700">
                      ยกเลิก
                    </button>
                    <button
                      onClick={executeMerge}
                      disabled={merging}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#E64A19] disabled:opacity-50 transition-colors"
                    >
                      {merging && <Loader2 className="w-4 h-4 animate-spin" />}
                      ยืนยันการรวม
                    </button>
                  </div>
                </>
              ) : (
                <div className="ml-auto">
                  <button onClick={closeMergeModal} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-400 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700">
                    ยกเลิก
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Shopee Export Modal */}
      <ShopeeExportModal
        isOpen={exportModalOpen}
        onClose={() => {
          setExportModalOpen(false);
          refreshLinks();
        }}
        productId={productId}
        productName={product.name}
        productCode={product.code}
      />
    </Layout>
  );
}
