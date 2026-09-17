'use client';

// ส่งสินค้าของเราขึ้นร้าน marketplace — **หน้าเดียวทุกแพลตฟอร์ม**
// (`?account=<id>` · `?product=<id>` = เปิดมาพร้อมเลือกสินค้าตัวนั้นไว้แล้ว)
//
// ⛔ ห้ามเขียนเงื่อนไขแยกตาม platform ในหน้านี้ — ป้าย/ไอคอนมาจาก
//    `MARKETPLACE_PLATFORMS[platform].label` + `PlatformIcon` · ฟอร์มคุณสมบัติสร้างจาก
//    `/api/marketplace/products/export/attributes` · งานจริงอยู่
//    `/api/marketplace/products/export` (หน้า `/shopee/export` ลบแล้ว)

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import Toggle from '@/components/ui/Toggle';
import Stepper from '@/components/ui/Stepper';
import SearchInput from '@/components/ui/SearchInput';
import FormSelect from '@/components/ui/FormSelect';
import FormInput from '@/components/ui/FormInput';
import PostfixInput from '@/components/ui/PostfixInput';
import PlatformIcon from '@/components/ui/PlatformIcon';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import MultiSelectSearch from '@/components/ui/MultiSelectSearch';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import { ExportButton } from '@/components/ui/ExportImportButton';
import { ProgressBar } from '@/components/ui/Chart';
import { LoadingCard, EmptyCard, DoneCard } from '@/components/ui/StateCard';
import CategoryPicker from '@/components/marketplace/CategoryPicker';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session-manager';
import { useMarketplaceGuard } from '@/lib/useMarketplaceGuard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { useServerSearch } from '@/lib/useServerSearch';
import { formatPrice } from '@/lib/utils/format';
import { MARKETPLACE_PLATFORMS } from '@/lib/marketplace/platforms';
import { ChevronLeft, ChevronRight, Package, Store, Unlink } from 'lucide-react';

const PAGE_SIZE = 30;
const BACK_HREF = '/marketplace/sync';

interface ProductRow {
  product_id: string;
  code: string;
  name: string;
  image: string | null;
  main_image_url: string | null;
  product_type: string;
  is_composite?: boolean;
  simple_default_price?: number;
}

interface MarketplaceAttributeOption { id: string; name: string }
interface MarketplaceAttribute {
  id: string;
  name: string;
  required: boolean;
  input_type: 'text' | 'select' | 'multi';
  options: MarketplaceAttributeOption[];
}

interface ProductConfig {
  /** ชื่อประกาศบนร้าน — ว่าง = ใช้ชื่อสินค้าในระบบ */
  title: string;
  categoryId: string | null;
  categoryName: string;
  brandId: string | null;
  brandName: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  attributes: Record<string, string | string[]>;
}

interface ExportResultRow {
  success: boolean;
  product_name: string;
  external_item_id?: string;
  already_linked?: boolean;
  errors: string[];
  warnings: string[];
}

type Step = 'select' | 'configure' | 'run';

const EMPTY_CONFIG: ProductConfig = {
  title: '', categoryId: null, categoryName: '', brandId: null, brandName: '',
  weight: '0.5', length: '', width: '', height: '', attributes: {},
};

function platformLabel(platform: string): string {
  return MARKETPLACE_PLATFORMS[platform as keyof typeof MARKETPLACE_PLATFORMS]?.label || 'Marketplace';
}

function MarketplaceExportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { allowed: marketplaceOn, checking: checkingMarketplace } = useMarketplaceGuard();
  const { allowed: canPush, loading: checkingPermission } = useAuthGuard('marketplace.push');

  const accountId = searchParams.get('account') || searchParams.get('account_id') || '';
  const presetProductId = searchParams.get('product') || '';

  const [platform, setPlatform] = useState('');
  const [shopName, setShopName] = useState('');
  const [step, setStep] = useState<Step>('select');

  // ── ขั้นที่ 1: เลือกสินค้า ────────────────────────────────────────────────
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Map<string, ProductRow>>(new Map());
  // ตัวกรองของรายการสินค้าในระบบ (ไม่เกี่ยวกับหมวดของร้าน)
  const [ourBrands, setOurBrands] = useState<{ id: string; name: string }[]>([]);
  const [ourCategories, setOurCategories] = useState<{ id: string; name: string }[]>([]);
  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [unlinking, setUnlinking] = useState<string | null>(null);

  // ── ขั้นที่ 2: ตั้งค่า ─────────────────────────────────────────────────────
  const [configs, setConfigs] = useState<Record<string, ProductConfig>>({});
  const [attributesByCategory, setAttributesByCategory] = useState<Record<string, MarketplaceAttribute[]>>({});
  const [bulkConfig, setBulkConfig] = useState<ProductConfig>(EMPTY_CONFIG);
  // รายการที่ผู้ใช้กดสลับเอง — ค่าเริ่มต้นคือ "ยังขาดของ = กางไว้" (ครบแล้ว = ย่อ)
  const [toggledCards, setToggledCards] = useState<Set<string>>(new Set());
  // ค่าเริ่มต้น = เปิดขายทันที (เจ้าของไม่อยากเข้าหลังบ้านไปกด publish ซ้ำ) · เปิดสวิตช์เมื่ออยากตรวจก่อน
  const [draft, setDraft] = useState(false);
  const [brandSupported, setBrandSupported] = useState(false);
  const [brandNeedsCategory, setBrandNeedsCategory] = useState(false);
  // ข้อจำกัดชื่อประกาศของร้านนี้ — มาจาก adapter ฝั่ง server (หน้าไม่รู้จัก platform เอง)
  const [titleRules, setTitleRules] = useState<{ min: number; max: number }>({ min: 0, max: 0 });

  // ── ขั้นที่ 3: ส่ง ────────────────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string; ok: number; failed: number } | null>(null);
  const [results, setResults] = useState<ExportResultRow[] | null>(null);

  const label = platform ? platformLabel(platform) : 'Marketplace';

  // ── โหลดข้อมูลร้าน + สินค้าที่ผูกแล้ว ─────────────────────────────────────
  useEffect(() => {
    if (!accountId || !marketplaceOn) return;
    (async () => {
      try {
        const res = await apiFetch('/api/marketplace/accounts?platform=all');
        const data = await res.json();
        const account = (Array.isArray(data) ? data : []).find((a: { id: string }) => a.id === accountId);
        if (account) {
          setPlatform(account.platform || '');
          setShopName(account.shop_name || '');
          // Shopee ลงประกาศเปิดขายได้เลยมาแต่ไหนแต่ไร · เจ้าอื่นเพิ่งเปิดใช้ ตั้งร่างไว้ก่อน
          setDraft(account.platform !== 'shopee');
        }
      } catch {
        // ไม่ใช่เรื่องคอขาดบาดตาย — หัวข้อหน้าจะขึ้นชื่อกลางแทน
      }
    })();
  }, [accountId, marketplaceOn]);

  useEffect(() => {
    if (!accountId || !marketplaceOn) return;
    (async () => {
      try {
        const res = await apiFetch(`/api/marketplace/links?account_id=${accountId}`);
        const data = await res.json();
        setLinkedIds(new Set<string>((data.links || []).map((l: { product_id: string }) => l.product_id)));
      } catch {
        // ผูกแล้วก็ยังกันซ้ำที่ฝั่ง server อีกชั้น — ที่นี่แค่ช่วยให้ไม่ต้องเลือกผิด
      }
    })();
  }, [accountId, marketplaceOn]);

  // ข้อจำกัดของร้านนี้ (ความยาวชื่อประกาศ) — ถามครั้งเดียวต่อร้าน
  useEffect(() => {
    if (!accountId || !marketplaceOn) return;
    (async () => {
      try {
        const res = await apiFetch(`/api/marketplace/products/export?account_id=${accountId}`);
        const data = await res.json();
        if (res.ok) setTitleRules({ min: Number(data.title_min) || 0, max: Number(data.title_max) || 0 });
      } catch {
        // ไม่ได้ก็แค่ไม่เตือนล่วงหน้า — ฝั่งร้านยังตีกลับให้อยู่ดี
      }
    })();
  }, [accountId, marketplaceOn]);

  // แบรนด์/หมวดหมู่ของเรา (ไว้กรองรายการสินค้า — คนละชุดกับหมวดของร้าน)
  useEffect(() => {
    if (!marketplaceOn) return;
    (async () => {
      try {
        const [brandRes, catRes] = await Promise.all([
          apiFetch('/api/brands'),
          apiFetch('/api/categories'),
        ]);
        const [brandData, catData] = await Promise.all([brandRes.json(), catRes.json()]);
        setOurBrands((brandData.data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })));
        setOurCategories((catData.data || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      } catch {
        // ไม่มีตัวกรองก็ยังค้นด้วยคำค้นได้
      }
    })();
  }, [marketplaceOn]);

  // แพลตฟอร์มไหนมีทะเบียนแบรนด์ให้ค้น — ถามครั้งเดียวแล้วซ่อน/แสดงช่องตามนั้น
  useEffect(() => {
    if (!accountId || !platform) return;
    (async () => {
      try {
        const res = await apiFetch(`/api/marketplace/products/export/brands?account_id=${accountId}&q=`);
        const data = await res.json();
        setBrandSupported(res.ok && data.supported === true);
        setBrandNeedsCategory(res.ok && data.needs_category === true);
      } catch {
        setBrandSupported(false);
      }
    })();
  }, [accountId, platform]);

  // ── รายการสินค้าในระบบ ───────────────────────────────────────────────────
  const loadProducts = useCallback(async (
    targetPage: number,
    q: string,
    filters?: { brandId?: string; categoryId?: string },
  ) => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        exclude_composite: 'true',
        status: 'active',
        page: String(targetPage),
        limit: String(PAGE_SIZE),
      });
      if (q) params.set('search', q);
      if (filters?.brandId) params.set('brand_id', filters.brandId);
      if (filters?.categoryId) params.set('category_id', filters.categoryId);
      const res = await apiFetch(`/api/products?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดรายการสินค้าไม่สำเร็จ');
      setProducts(data.products || []);
      // `/api/products` คืน `total` (จำนวนแถวทั้งหมด) ไม่ใช่จำนวนหน้า
      setTotalPages(Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'โหลดรายการสินค้าไม่สำเร็จ');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (marketplaceOn && accountId) loadProducts(1, '');
  }, [marketplaceOn, accountId, loadProducts]);

  // เปิดหน้ามาจากการ์ดสินค้า → ติ๊กตัวนั้นไว้ให้เลย
  useEffect(() => {
    if (!presetProductId || selected.size > 0) return;
    const hit = products.find(p => p.product_id === presetProductId);
    if (hit) setSelected(new Map([[hit.product_id, hit]]));
  }, [presetProductId, products, selected.size]);

  const runSearch = useDebouncedCallback((value: string) => {
    setAppliedSearch(value);
    setPage(1);
    loadProducts(1, value, { brandId: brandFilter, categoryId: categoryFilter });
  }, 400);

  const goPage = (target: number) => {
    setPage(target);
    loadProducts(target, appliedSearch, { brandId: brandFilter, categoryId: categoryFilter });
  };

  /** เปลี่ยนตัวกรอง = กลับไปหน้าแรกเสมอ (หน้าเดิมอาจไม่มีอยู่แล้วหลังกรอง) */
  const applyFilters = (patch: { brandId?: string; categoryId?: string }) => {
    const nextBrand = patch.brandId ?? brandFilter;
    const nextCategory = patch.categoryId ?? categoryFilter;
    setBrandFilter(nextBrand);
    setCategoryFilter(nextCategory);
    setPage(1);
    loadProducts(1, appliedSearch, { brandId: nextBrand, categoryId: nextCategory });
  };

  /**
   * ยกเลิกการผูกสินค้ากับร้านนี้ — ใช้ตอนประกาศบนร้านถูกลบไปแล้วแต่ฝั่งเรายังจำว่าผูกอยู่
   * (ลบแค่การผูกฝั่งเรา ไม่แตะประกาศบนร้าน)
   */
  const unlinkProduct = async (product: ProductRow) => {
    setUnlinking(product.product_id);
    try {
      const res = await apiFetch(
        `/api/marketplace/links?account_id=${accountId}&product_id=${product.product_id}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ยกเลิกการผูกไม่สำเร็จ');
      setLinkedIds(prev => {
        const next = new Set(prev);
        next.delete(product.product_id);
        return next;
      });
      showToast(`ยกเลิกการผูก "${product.name}" แล้ว — ส่งขึ้นร้านใหม่ได้`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ยกเลิกการผูกไม่สำเร็จ', 'error');
    } finally {
      setUnlinking(null);
    }
  };

  const selectable = useMemo(
    () => products.filter(p => !linkedIds.has(p.product_id) && !p.is_composite),
    [products, linkedIds],
  );
  const allPageSelected = selectable.length > 0 && selectable.every(p => selected.has(p.product_id));

  const toggleOne = (product: ProductRow) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(product.product_id)) next.delete(product.product_id);
      else next.set(product.product_id, product);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelected(prev => {
      const next = new Map(prev);
      for (const p of selectable) {
        if (allPageSelected) next.delete(p.product_id);
        else next.set(p.product_id, p);
      }
      return next;
    });
  };

  // ── คุณสมบัติของหมวด ─────────────────────────────────────────────────────
  const loadAttributes = useCallback(async (categoryId: string) => {
    if (!categoryId || attributesByCategory[categoryId]) return;
    try {
      const res = await apiFetch(
        `/api/marketplace/products/export/attributes?account_id=${accountId}&category_id=${encodeURIComponent(categoryId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดคุณสมบัติของหมวดไม่สำเร็จ');
      setAttributesByCategory(prev => ({ ...prev, [categoryId]: data.attributes || [] }));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'โหลดคุณสมบัติของหมวดไม่สำเร็จ', 'error');
      setAttributesByCategory(prev => ({ ...prev, [categoryId]: [] }));
    }
  }, [accountId, attributesByCategory, showToast]);

  const configOf = (productId: string): ProductConfig => configs[productId] || EMPTY_CONFIG;

  const patchConfig = (productId: string, patch: Partial<ProductConfig>) => {
    setConfigs(prev => ({ ...prev, [productId]: { ...(prev[productId] || EMPTY_CONFIG), ...patch } }));
  };

  const applyBulk = () => {
    setConfigs(prev => {
      const next = { ...prev };
      for (const productId of selected.keys()) {
        const current = next[productId] || EMPTY_CONFIG;
        next[productId] = {
          // ชื่อประกาศเป็นของเฉพาะตัว — ค่ากลางไม่ทับ
          title: current.title,
          categoryId: bulkConfig.categoryId ?? current.categoryId,
          categoryName: bulkConfig.categoryId ? bulkConfig.categoryName : current.categoryName,
          brandId: bulkConfig.brandId ?? current.brandId,
          brandName: bulkConfig.brandId ? bulkConfig.brandName : current.brandName,
          weight: bulkConfig.weight || current.weight,
          length: bulkConfig.length || current.length,
          width: bulkConfig.width || current.width,
          height: bulkConfig.height || current.height,
          attributes: bulkConfig.categoryId ? { ...bulkConfig.attributes } : current.attributes,
        };
      }
      return next;
    });
    showToast(`เติมค่าให้ ${selected.size} รายการแล้ว`, 'success');
  };

  // ── ค้นแบรนด์ ────────────────────────────────────────────────────────────
  const brandSearch = useServerSearch<{ id: string; name: string }>({
    minLength: 1,
    fetch: async (q) => {
      // คำค้นถูกนำหน้าด้วยหมวด (`<category>|<q>`) เพื่อให้ cache ของ hook แยกตามหมวด
      const sep = q.indexOf('|');
      const categoryId = sep >= 0 ? q.slice(0, sep) : '';
      const text = sep >= 0 ? q.slice(sep + 1) : q;
      const res = await apiFetch(
        `/api/marketplace/products/export/brands?account_id=${accountId}&q=${encodeURIComponent(text)}&category_id=${encodeURIComponent(categoryId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ค้นแบรนด์ไม่สำเร็จ');
      return { rows: data.brands || [], complete: false };
    },
  });

  // ── ตรวจก่อนส่ง ──────────────────────────────────────────────────────────

  /** ชื่อที่จะไปโผล่บนร้านจริง — ไม่ได้พิมพ์ทับ = ชื่อสินค้าในระบบ */
  const titleOf = (product: ProductRow): string => (configOf(product.product_id).title || '').trim() || product.name;

  /** ชื่อนี้ผิดกติกาความยาวของร้านไหม — คืนข้อความบอกเหตุ (null = ผ่าน) */
  const titleProblem = useCallback((title: string): string | null => {
    const len = [...title].length;
    if (titleRules.min && len < titleRules.min) return `ชื่อสั้นไป ${titleRules.min - len} ตัวอักษร (ร้านนี้ขอ ${titleRules.min}–${titleRules.max || '∞'} ตัวอักษร)`;
    if (titleRules.max && len > titleRules.max) return `ชื่อยาวเกิน ${len - titleRules.max} ตัวอักษร (ร้านนี้รับได้ ${titleRules.max} ตัวอักษร)`;
    return null;
  }, [titleRules]);

  const missingConfig = useMemo(() => {
    const out: string[] = [];
    for (const [productId, product] of selected) {
      const cfg = configOf(productId);
      const badTitle = titleProblem((cfg.title || '').trim() || product.name);
      if (badTitle) out.push(`${product.name}: ${badTitle}`);
      if (!cfg.categoryId) { out.push(`${product.name}: ยังไม่ได้เลือกหมวดหมู่`); continue; }
      for (const attr of attributesByCategory[cfg.categoryId] || []) {
        if (!attr.required) continue;
        const value = cfg.attributes[attr.id];
        const filled = Array.isArray(value) ? value.length > 0 : !!String(value ?? '').trim();
        if (!filled) out.push(`${product.name}: ยังไม่ได้กรอก "${attr.name}"`);
      }
    }
    return out;
  // configs/attributesByCategory เปลี่ยนแล้วต้องคิดใหม่ — configOf อ่านจาก configs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, configs, attributesByCategory, titleProblem]);

  // ── ส่งจริง (SSE) ────────────────────────────────────────────────────────
  const startExport = async () => {
    if (missingConfig.length > 0) {
      showToast(missingConfig[0], 'error');
      return;
    }

    const items = [...selected.keys()].map(productId => {
      const cfg = configOf(productId);
      const dims = cfg.length && cfg.width && cfg.height
        ? { length: parseFloat(cfg.length), width: parseFloat(cfg.width), height: parseFloat(cfg.height) }
        : undefined;
      return {
        product_id: productId,
        config: {
          title: (cfg.title || '').trim() || undefined,
          category_id: cfg.categoryId,
          category_name: cfg.categoryName,
          brand_id: cfg.brandId,
          brand_name: cfg.brandName,
          weight: parseFloat(cfg.weight) || 0.5,
          dimensions: dims,
          attributes: cfg.attributes,
        },
      };
    });

    setStep('run');
    setRunning(true);
    setResults(null);
    setProgress({ done: 0, total: items.length, label: 'กำลังเริ่ม...', ok: 0, failed: 0 });

    const collected: ExportResultRow[] = [];
    try {
      // SSE — apiFetch อ่าน body เป็น json ไม่ได้ ต้องยิง fetch ตรงพร้อมแนบ token เอง
      const token = await getAccessToken();
      // ต้องแนบ X-Company-Id เองด้วย (apiFetch แนบให้ แต่ fetch ตรงไม่มี) —
      // ไม่งั้น API ตกไปใช้บริษัทแรกของผู้ใช้ แล้วหาร้านไม่เจอ = 404 "ไม่พบร้านนี้"
      const currentCompanyId = typeof window !== 'undefined' ? localStorage.getItem('aoo-current-company-id') : null;
      const res = await fetch('/api/marketplace/products/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(currentCompanyId ? { 'X-Company-Id': currentCompanyId } : {}),
        },
        body: JSON.stringify({ account_id: accountId, items, draft }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'เริ่มส่งสินค้าไม่สำเร็จ');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith('data: ')) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'progress') {
            setProgress(prev => ({
              done: evt.done,
              total: evt.total,
              label: `${evt.success ? 'ส่งแล้ว' : 'ไม่สำเร็จ'}: ${evt.product_name}`,
              ok: (prev?.ok || 0) + (evt.success ? 1 : 0),
              failed: (prev?.failed || 0) + (evt.success ? 0 : 1),
            }));
          } else if (evt.type === 'done') {
            collected.push(...(evt.results || []));
            if (evt.next_cursor) {
              collected.push({
                success: false,
                product_name: 'ยังส่งไม่ครบ',
                errors: ['หมดเวลาของรอบนี้ — กด "ส่งต่อ" เพื่อทำรายการที่เหลือ'],
                warnings: [],
              });
            }
          } else if (evt.type === 'error') {
            throw new Error(evt.message || 'ส่งสินค้าไม่สำเร็จ');
          }
        }
      }
      setResults(collected);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ส่งสินค้าไม่สำเร็จ', 'error');
      setResults(collected.length > 0 ? collected : null);
      if (collected.length === 0) setStep('configure');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  // ── render ───────────────────────────────────────────────────────────────
  if (checkingMarketplace || checkingPermission) return <LoadingCard />;
  if (!marketplaceOn || !canPush) return null;

  if (!accountId) {
    return (
      <Container size="5xl">
        <PageHeader title="ส่งสินค้าขึ้นร้าน" backHref={BACK_HREF} />
        <Alert tone="danger" title="ไม่ได้ระบุร้าน">
          เปิดหน้านี้จาก ตั้งค่า &gt; ช่องทางการขาย &gt; เชื่อมต่อ Marketplace แล้วกดปุ่มส่งสินค้าที่การ์ดร้าน
        </Alert>
      </Container>
    );
  }

  const header = (
    <PageHeader
      icon={platform ? <PlatformIcon id={platform} /> : <Store />}
      title={`ส่งสินค้าขึ้น ${label}`}
      subtitle={shopName || undefined}
      backHref={BACK_HREF}
    />
  );

  const stepper = (
    <Stepper
      ariaLabel="ขั้นตอนส่งสินค้า"
      onSelect={(key) => { if (!running) setStep(key as Step); }}
      steps={[
        { key: 'select', label: 'เลือกสินค้า', state: step === 'select' ? 'current' : 'done' },
        {
          key: 'configure',
          label: 'ตั้งค่า',
          state: step === 'configure' ? 'current' : step === 'run' ? 'done' : 'todo',
        },
        { key: 'run', label: 'ส่งขึ้นร้าน', state: step === 'run' ? 'current' : 'todo' },
      ]}
    />
  );

  // ผลลัพธ์
  if (step === 'run' && results) {
    const ok = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    return (
      <Container size="5xl">
        {header}
        <DoneCard
          hasErrors={failed.length > 0}
          title="ส่งสินค้าขึ้นร้านเสร็จแล้ว"
          summary={
            <div className="flex flex-wrap justify-center gap-2">
              <Badge tone="emerald">{ok.length} สำเร็จ</Badge>
              {failed.length > 0 && <Badge tone="red">{failed.length} ไม่สำเร็จ</Badge>}
              {draft && <Badge tone="amber">ลงเป็นแบบร่าง / ปิดขายไว้</Badge>}
            </div>
          }
          actions={
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={() => {
                setResults(null);
                setSelected(new Map());
                setConfigs({});
                setStep('select');
                loadProducts(page, appliedSearch);
              }}>
                ส่งสินค้าเพิ่ม
              </Button>
              <Button variant="primary" onClick={() => router.push(BACK_HREF)}>กลับหน้าซิงค์</Button>
            </div>
          }
        />
        <Card>
          <h2 className="heading-3 mb-2">ผลลัพธ์รายรายการ</h2>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="inner-panel inner-panel-body">
                <div className="flex items-center gap-2">
                  <Badge tone={r.success ? 'emerald' : 'red'}>{r.success ? 'สำเร็จ' : 'ไม่สำเร็จ'}</Badge>
                  <span className="body-text flex-1 min-w-0 truncate">{r.product_name}</span>
                  {r.external_item_id && <span className="helper-text text-gray-500">#{r.external_item_id}</span>}
                </div>
                {r.errors.map((e, j) => (
                  <p key={`e${j}`} className="helper-text text-red-600 dark:text-red-400 mt-1">{e}</p>
                ))}
                {r.warnings.map((w, j) => (
                  <p key={`w${j}`} className="helper-text text-amber-600 dark:text-amber-400 mt-1">{w}</p>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </Container>
    );
  }

  if (step === 'run') {
    return (
      <Container size="5xl">
        {header}
        {stepper}
        <Alert tone="warning" title="อย่าปิดหน้านี้ระหว่างส่งสินค้า">
          ระบบกำลังอัปโหลดรูปและสร้างประกาศทีละรายการ — ปิดหน้าตอนนี้รายการที่เหลือจะไม่ถูกส่ง
        </Alert>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="body-text">
              ส่งแล้ว {progress?.done || 0} จาก {progress?.total || 0} รายการ
            </span>
            <div className="flex flex-wrap gap-2">
              <Badge tone="emerald">{progress?.ok || 0} สำเร็จ</Badge>
              {(progress?.failed || 0) > 0 && <Badge tone="red">{progress?.failed} ไม่สำเร็จ</Badge>}
            </div>
          </div>
          <ProgressBar
            value={progress?.done || 0}
            max={progress?.total || 1}
            label={progress?.label || 'กำลังส่ง...'}
          />
        </Card>
      </Container>
    );
  }

  // ── ขั้นที่ 2: ตั้งค่า ─────────────────────────────────────────────────────
  if (step === 'configure') {
    const renderAttributeForm = (categoryId: string | null, cfg: ProductConfig, onChange: (attrs: Record<string, string | string[]>) => void) => {
      if (!categoryId) return null;
      const attrs = attributesByCategory[categoryId];
      if (!attrs) return <p className="helper-text text-gray-500">กำลังโหลดคุณสมบัติของหมวด...</p>;
      if (attrs.length === 0) return <p className="helper-text text-gray-500">หมวดนี้ไม่มีคุณสมบัติเพิ่มเติมให้กรอก</p>;

      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {attrs.map(attr => {
            const value = cfg.attributes[attr.id];
            if (attr.input_type === 'multi') {
              return (
                <div key={attr.id}>
                  <label className="field-label">{attr.name}{attr.required && <span className="text-red-500"> *</span>}</label>
                  <MultiSelectSearch
                    value={Array.isArray(value) ? value : value ? [String(value)] : []}
                    onChange={(vals) => onChange({ ...cfg.attributes, [attr.id]: vals })}
                    options={attr.options.map(o => ({ id: o.id, label: o.name }))}
                    placeholder={`เลือก${attr.name}`}
                  />
                </div>
              );
            }
            if (attr.input_type === 'select') {
              return (
                <div key={attr.id}>
                  <label className="field-label">{attr.name}{attr.required && <span className="text-red-500"> *</span>}</label>
                  <FormSelect
                    value={typeof value === 'string' ? value : ''}
                    onChange={(v) => onChange({ ...cfg.attributes, [attr.id]: v })}
                    options={attr.options.map(o => ({ id: o.id, label: o.name }))}
                    clearLabel={`ไม่ระบุ${attr.name}`}
                    searchThreshold={8}
                  />
                </div>
              );
            }
            return (
              <FormInput
                key={attr.id}
                label={attr.name}
                required={attr.required}
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange({ ...cfg.attributes, [attr.id]: e.target.value })}
              />
            );
          })}
        </div>
      );
    };

    const brandField = (cfg: ProductConfig, onPick: (id: string | null, name: string) => void) => (
      brandSupported ? (
        <div>
          <label className="field-label">แบรนด์บนร้าน</label>
          <EntitySearchInput
            value={cfg.brandId || ''}
            options={brandSearch.results.map(b => ({ id: b.id, label: b.name }))}
            onSearchChange={(q) => brandSearch.search(`${cfg.categoryId || ''}|${q}`)}
            disabled={brandNeedsCategory && !cfg.categoryId}
            loading={brandSearch.loading}
            minSearchLength={1}
            placeholder="ค้นหาแบรนด์..."
            onChange={(id, option) => onPick(id, option.label)}
            onClear={() => onPick(null, '')}
            selectedDisplay={cfg.brandName ? <span className="body-text">{cfg.brandName}</span> : undefined}
          />
          {brandNeedsCategory && !cfg.categoryId && (
            <p className="helper-text text-gray-500 mt-1">เลือกหมวดหมู่ก่อน — รายชื่อแบรนด์ของร้านนี้แยกตามหมวด</p>
          )}
        </div>
      ) : null
    );

    const sizeFields = (cfg: ProductConfig, patch: (p: Partial<ProductConfig>) => void) => (
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28">
          <label className="field-label">น้ำหนัก</label>
          <PostfixInput postfix="kg" value={cfg.weight} onChange={(v) => patch({ weight: v })} placeholder="0.5" width="w-full" inputClassName="w-full px-3" />
        </div>
        <div className="w-24">
          <label className="field-label">ยาว</label>
          <PostfixInput postfix="ซม." value={cfg.length} onChange={(v) => patch({ length: v })} placeholder="10" width="w-full" inputClassName="w-full px-3" />
        </div>
        <div className="w-24">
          <label className="field-label">กว้าง</label>
          <PostfixInput postfix="ซม." value={cfg.width} onChange={(v) => patch({ width: v })} placeholder="10" width="w-full" inputClassName="w-full px-3" />
        </div>
        <div className="w-24">
          <label className="field-label">สูง</label>
          <PostfixInput postfix="ซม." value={cfg.height} onChange={(v) => patch({ height: v })} placeholder="10" width="w-full" inputClassName="w-full px-3" />
        </div>
      </div>
    );

    return (
      <Container size="5xl">
        {header}
        {stepper}

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Toggle checked={draft} onChange={setDraft} aria-label="บันทึกเป็นแบบร่าง" />
              <div>
                <p className="body-text">บันทึกเป็นแบบร่าง / ปิดขายไว้ก่อน</p>
                <p className="helper-text text-gray-500">
                  ปิดอยู่ = เปิดขายทันทีที่ส่งเสร็จ · เปิด = ประกาศจะยังไม่ขาย ต้องไปเปิดเองใน {MARKETPLACE_PLATFORMS[platform as keyof typeof MARKETPLACE_PLATFORMS]?.sellerCenter || 'หลังบ้านของร้าน'} (ใช้ตอนอยากตรวจก่อน)
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="heading-3">ตั้งค่าเริ่มต้นของทุกรายการ</h2>
          <p className="helper-text text-gray-500 mb-3">
            กรอกครั้งเดียวแล้วกด &ldquo;เติมให้ทุกรายการ&rdquo; — รายการที่ต่างจากนี้ค่อยไล่แก้ทีละตัวข้างล่าง
          </p>
          <div className="space-y-3">
            <div>
              <label className="field-label">หมวดหมู่ {label}</label>
              <CategoryPicker
                accountId={accountId}
                value={bulkConfig.categoryId}
                categoryName={bulkConfig.categoryName}
                platformLabel={label}
                onChange={(id, name) => {
                  setBulkConfig(prev => ({ ...prev, categoryId: id, categoryName: name, attributes: {} }));
                  if (id) loadAttributes(id);
                }}
              />
            </div>
            {brandField(bulkConfig, (id, name) => setBulkConfig(prev => ({ ...prev, brandId: id, brandName: name })))}
            {sizeFields(bulkConfig, (p) => setBulkConfig(prev => ({ ...prev, ...p })))}
            {renderAttributeForm(bulkConfig.categoryId, bulkConfig, (attributes) => setBulkConfig(prev => ({ ...prev, attributes })))}
            <div className="flex justify-end">
              <Button variant="primary" onClick={applyBulk} disabled={!bulkConfig.categoryId && !bulkConfig.weight}>
                เติมให้ทุกรายการ ({selected.size})
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="heading-3">ไล่แก้เฉพาะที่ต่าง ({selected.size})</h2>
          <p className="helper-text text-gray-500 mb-3">
            รายการที่ขึ้น &ldquo;ครบแล้ว&rdquo; ส่งได้เลย — เปิดดูเฉพาะตัวที่ยังขาด
          </p>
          <div className="space-y-2">
            {[...selected.values()].map(product => {
              const cfg = configOf(product.product_id);
              const badTitle = titleProblem(titleOf(product));
              // ขาดอะไรของรายการนี้บ้าง — ใช้ข้อความชุดเดียวกับตัวตรวจก่อนส่ง
              const problems = missingConfig.filter(m => m.startsWith(`${product.name}: `));
              // ยังขาด = กางให้เห็นเลย ไม่ต้องให้ไปกดหา · กดเองเมื่อไหร่ค่อยสลับเฉพาะใบนั้น
              const flipped = toggledCards.has(product.product_id);
              const open = problems.length > 0 ? !flipped : flipped;
              return (
                <div key={product.product_id} className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <ProductImageThumb src={product.main_image_url || product.image} alt={product.name} size="sm" fallbackIcon={<Package className="w-5 h-5" />} />
                    <div className="min-w-0 flex-1">
                      <div className="body-text truncate">{product.name}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                        <span className="helper-text text-gray-500">{product.code}</span>
                        {product.simple_default_price ? (
                          <span className="helper-text text-gray-500">{formatPrice(product.simple_default_price)}</span>
                        ) : null}
                        {problems.length === 0
                          ? <Badge tone="emerald" size="sm">ครบแล้ว</Badge>
                          : <Badge tone="amber" size="sm">ยังขาด {problems.length} อย่าง</Badge>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setToggledCards(prev => {
                        const next = new Set(prev);
                        if (next.has(product.product_id)) next.delete(product.product_id);
                        else next.add(product.product_id);
                        return next;
                      })}
                    >
                      {open ? 'ย่อ' : 'แก้'}
                    </Button>
                  </div>

                  <div>
                    <label className="field-label">หมวดหมู่ {label} <span className="text-red-500">*</span></label>
                    <CategoryPicker
                      accountId={accountId}
                      value={cfg.categoryId}
                      categoryName={cfg.categoryName}
                      platformLabel={label}
                      onChange={(id, name) => {
                        patchConfig(product.product_id, { categoryId: id, categoryName: name, attributes: {} });
                        if (id) loadAttributes(id);
                      }}
                    />
                  </div>

                  {/* ชื่อที่ร้านไม่รับ ต้องแก้ตรงนี้เลย ไม่ใช่ให้ไปแก้ชื่อสินค้าในระบบ */}
                  {(badTitle || cfg.title) && (
                    <div>
                      <FormInput
                        label={`ชื่อประกาศบน ${label}`}
                        required
                        value={cfg.title || product.name}
                        onChange={(e) => patchConfig(product.product_id, { title: e.target.value })}
                      />
                      <p className={`helper-text mt-1 ${badTitle ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>
                        {badTitle || `${[...titleOf(product)].length} ตัวอักษร — ใช้เฉพาะประกาศร้านนี้ ไม่กระทบชื่อสินค้าในระบบ`}
                      </p>
                    </div>
                  )}

                  {open && (
                    <div className="space-y-3 pt-1">
                      {brandField(cfg, (id, name) => patchConfig(product.product_id, { brandId: id, brandName: name }))}
                      {sizeFields(cfg, (p) => patchConfig(product.product_id, p))}
                      {renderAttributeForm(cfg.categoryId, cfg, (attributes) => patchConfig(product.product_id, { attributes }))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {missingConfig.length > 0 && (
          <Alert tone="warning" title="ยังตั้งค่าไม่ครบ">
            <ul className="space-y-1">
              {missingConfig.slice(0, 8).map((m, i) => <li key={i} className="body-text">{m}</li>)}
            </ul>
          </Alert>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setStep('select')}>ย้อนกลับ</Button>
          <ExportButton onClick={startExport} disabled={missingConfig.length > 0 || selected.size === 0}>
            ส่งขึ้น {label} ({selected.size})
          </ExportButton>
        </div>
      </Container>
    );
  }

  // ── ขั้นที่ 1: เลือกสินค้า ─────────────────────────────────────────────────
  return (
    <Container size="5xl">
      {header}
      {stepper}

      <Alert tone="info" title="สินค้าที่ผูกกับร้านนี้แล้วจะไม่แสดง">
        ระบบสร้างประกาศใหม่ให้เฉพาะสินค้าที่ยังไม่เคยผูกกับร้านนี้ · สินค้าชุด (ประกอบจากชิ้นส่วน) ส่งขึ้นร้านไม่ได้ ·
        หลังสร้างเสร็จ ระบบจะส่งสต็อกของเราขึ้นร้านให้ทันที ·
        ลบประกาศทิ้งที่หลังบ้านของร้านแล้วแต่ตรงนี้ยังขึ้นว่าผูกอยู่ กด &ldquo;ยกเลิกการผูก&rdquo; เพื่อส่งใหม่ได้
      </Alert>

      <Card>
        <div className="space-y-4">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); runSearch(v); }}
            onSubmit={() => runSearch.now(search)}
            placeholder="ค้นหาชื่อสินค้า หรือรหัสสินค้า..."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label">แบรนด์</label>
              <FormSelect
                value={brandFilter}
                onChange={(v) => applyFilters({ brandId: v })}
                options={ourBrands.map(b => ({ id: b.id, label: b.name }))}
                clearLabel="ทุกแบรนด์"
                searchThreshold={8}
              />
            </div>
            <div>
              <label className="field-label">หมวดหมู่</label>
              <FormSelect
                value={categoryFilter}
                onChange={(v) => applyFilters({ categoryId: v })}
                options={ourCategories.map(c => ({ id: c.id, label: c.name }))}
                clearLabel="ทุกหมวดหมู่"
                searchThreshold={8}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Checkbox
              checked={allPageSelected}
              onChange={toggleAllOnPage}
              disabled={selectable.length === 0}
              label={`เลือกทั้งหน้า (${selectable.length})`}
            />
            <span className="subtitle-text text-gray-500">เลือกไว้ {selected.size} รายการ</span>
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <LoadingCard />
        ) : loadError ? (
          <Alert tone="danger" title="โหลดรายการไม่สำเร็จ">
            {loadError}
            <div className="mt-3">
              <Button variant="secondary" onClick={() => loadProducts(page, appliedSearch)}>ลองใหม่</Button>
            </div>
          </Alert>
        ) : products.length === 0 ? (
          <EmptyCard
            icon={<Package className="w-8 h-8" />}
            title="ไม่พบสินค้า"
            subtitle={appliedSearch ? 'ลองเปลี่ยนคำค้น' : 'ยังไม่มีสินค้าในระบบที่ส่งขึ้นร้านได้'}
          />
        ) : (
          <div className="space-y-2">
            {products.map(product => {
              const linked = linkedIds.has(product.product_id);
              const composite = !!product.is_composite;
              const disabled = linked || composite;
              const checked = selected.has(product.product_id);
              return (
                <div
                  key={product.product_id}
                  className={`rounded-lg border p-3 transition-colors ${
                    checked
                      ? 'border-primary bg-orange-50/60 dark:bg-orange-950/20'
                      : 'border-gray-200 dark:border-slate-700'
                  } ${disabled ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-1">
                      <Checkbox checked={checked} onChange={() => toggleOne(product)} disabled={disabled} />
                    </div>
                    <ProductImageThumb src={product.main_image_url || product.image} alt={product.name} size="sm" fallbackIcon={<Package className="w-5 h-5" />} />
                    <div className="min-w-0 flex-1">
                      <div className="body-text truncate">{product.name}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                        <span className="helper-text text-gray-500">{product.code}</span>
                        {product.simple_default_price ? (
                          <span className="helper-text text-gray-500">{formatPrice(product.simple_default_price)}</span>
                        ) : null}
                        {product.product_type === 'variation' && <Badge tone="blue" size="sm">มีตัวเลือก</Badge>}
                        {linked && <Badge tone="emerald" size="sm">ผูกกับร้านนี้แล้ว</Badge>}
                        {composite && <Badge tone="gray" size="sm">สินค้าชุด — ส่งไม่ได้</Badge>}
                      </div>
                    </div>
                    {linked && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Unlink className="w-4 h-4" />}
                        loading={unlinking === product.product_id}
                        onClick={() => unlinkProduct(product)}
                      >
                        ยกเลิกการผูก
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-2">
                <Button size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => goPage(page - 1)} icon={<ChevronLeft className="w-4 h-4" />}>
                  ก่อนหน้า
                </Button>
                <span className="subtitle-text text-gray-500">หน้า {page}/{totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= totalPages || loading} onClick={() => goPage(page + 1)} iconRight={<ChevronRight className="w-4 h-4" />}>
                  ถัดไป
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.push(BACK_HREF)}>ยกเลิก</Button>
        <Button variant="primary" disabled={selected.size === 0} onClick={() => setStep('configure')} iconRight={<ChevronRight className="w-4 h-4" />}>
          ถัดไป ({selected.size})
        </Button>
      </div>
    </Container>
  );
}

export default function MarketplaceExportPage() {
  return (
    <Layout>
      <Suspense fallback={<LoadingCard />}>
        <MarketplaceExportContent />
      </Suspense>
    </Layout>
  );
}
