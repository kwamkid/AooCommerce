'use client';

// นำเข้าสินค้าจากร้าน marketplace — **หน้าเดียวทุกแพลตฟอร์ม** (`?account=<id>`)
//
// ⛔ ห้ามเขียนเงื่อนไขแยกตาม platform ในหน้านี้ — ป้าย/ไอคอนมาจาก
//    `MARKETPLACE_PLATFORMS[platform].label` + `PlatformIcon` และงานจริงอยู่
//    `/api/marketplace/products/import` (หน้า `/shopee|/lazada|/tiktok/import` ลบแล้ว)

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
import SearchInput from '@/components/ui/SearchInput';
import PlatformIcon from '@/components/ui/PlatformIcon';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE } from '@/components/ui/FilterChips';
import { InfoChip } from '@/components/ui/StatusBadge';
import { ImportButton } from '@/components/ui/ExportImportButton';
import { ProgressBar } from '@/components/ui/Chart';
import { LoadingCard, EmptyCard, DoneCard } from '@/components/ui/StateCard';
import ProductPicker from '@/components/marketplace/ProductPicker';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session-manager';
import { useMarketplaceGuard } from '@/lib/useMarketplaceGuard';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { formatPrice } from '@/lib/utils/format';
import { MARKETPLACE_PLATFORMS } from '@/lib/marketplace/platforms';
import { ChevronLeft, ChevronRight, Link2, Package, Plus, Store } from 'lucide-react';

const PAGE_SIZE = 20;
const BACK_HREF = '/marketplace/sync';

interface PreviewModel {
  external_model_id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
}

interface PreviewItem {
  external_item_id: string;
  name: string;
  sku: string;
  image: string | null;
  price: number;
  status: string | null;
  has_variation: boolean;
  model_count: number;
  total_stock: number;
  models: PreviewModel[];
  linked_product: { product_id: string; name: string } | null;
  auto_match: { product_id: string; variation_id: string; name: string } | null;
}

interface RowConfig {
  action: 'create' | 'link';
  target_product_id?: string;
  target_name?: string;
  target_image?: string | null;
}

interface ImportSummary {
  created: number;
  updated: number;
  linked: number;
  skipped: number;
  errors: string[];
}

type LinkFilter = 'all' | 'unlinked' | 'linked';

function platformLabel(platform: string): string {
  return MARKETPLACE_PLATFORMS[platform as keyof typeof MARKETPLACE_PLATFORMS]?.label || 'Marketplace';
}

function MarketplaceImportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { allowed, checking } = useMarketplaceGuard();

  const accountId = searchParams.get('account') || searchParams.get('account_id') || '';

  const [platform, setPlatform] = useState('');
  const [shopName, setShopName] = useState('');

  const [items, setItems] = useState<PreviewItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // cursor เป็น opaque string (offset ของ Shopee/Lazada · page_token ของ TikTok)
  // → ย้อนกลับได้ด้วยการจำ cursor ของหน้าที่ผ่านมาเท่านั้น กระโดดหน้าไม่ได้
  const [cursor, setCursor] = useState<string | undefined>();
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [configs, setConfigs] = useState<Record<string, RowConfig>>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [copySkuToBarcode, setCopySkuToBarcode] = useState(false);

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total?: number; label: string } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  // ── ข้อมูลร้าน ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!accountId || !allowed) return;
    (async () => {
      try {
        const res = await apiFetch('/api/marketplace/accounts?platform=all');
        const data = await res.json();
        const account = (Array.isArray(data) ? data : []).find((a: { id: string }) => a.id === accountId);
        if (account) {
          setPlatform(account.platform || '');
          setShopName(account.shop_name || '');
        }
      } catch {
        // ไม่ใช่เรื่องคอขาดบาดตาย — หัวข้อหน้าจะขึ้นชื่อกลางแทน
      }
    })();
  }, [accountId, allowed]);

  // ── รายการสินค้าบนร้าน ──────────────────────────────────────────────────
  const loadPage = useCallback(async (target: string | undefined, q: string) => {
    if (!accountId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ account_id: accountId, page_size: String(PAGE_SIZE) });
      if (target) params.set('cursor', target);
      if (q) params.set('q', q);
      const res = await apiFetch(`/api/marketplace/products/import?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดรายการสินค้าไม่สำเร็จ');
      setItems(data.items || []);
      setTotal(typeof data.total === 'number' ? data.total : null);
      setNextCursor(data.next_cursor || undefined);
      if (data.platform) setPlatform(data.platform);
      if (data.shop_name) setShopName(data.shop_name);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'โหลดรายการสินค้าไม่สำเร็จ');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (allowed && accountId) loadPage(undefined, '');
  }, [allowed, accountId, loadPage]);

  const runSearch = useDebouncedCallback((value: string) => {
    setAppliedSearch(value);
    setCursor(undefined);
    setHistory([]);
    loadPage(undefined, value);
  }, 400);

  const goNext = () => {
    if (!nextCursor) return;
    setHistory(prev => [...prev, cursor]);
    setCursor(nextCursor);
    loadPage(nextCursor, appliedSearch);
  };

  const goPrev = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setCursor(prev);
    loadPage(prev, appliedSearch);
  };

  // ── เลือก / ตั้งค่าแต่ละแถว ─────────────────────────────────────────────
  const visibleItems = useMemo(() => items.filter(item => (
    linkFilter === 'all'
    || (linkFilter === 'linked' ? !!item.linked_product : !item.linked_product)
  )), [items, linkFilter]);

  const configOf = (id: string): RowConfig => configs[id] || { action: 'create' };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(i => selected.has(i.external_item_id));

  const toggleAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev);
      for (const item of visibleItems) {
        if (allVisibleSelected) next.delete(item.external_item_id);
        else next.add(item.external_item_id);
      }
      return next;
    });
  };

  const setAction = (id: string, action: 'create' | 'link') => {
    setConfigs(prev => ({ ...prev, [id]: { ...configOf(id), action } }));
    setSelected(prev => new Set(prev).add(id));
    if (action === 'link' && !configOf(id).target_product_id) setPickerFor(id);
  };

  const pickProduct = (product: { product_id: string; name: string; image: string | null; main_image_url: string | null }) => {
    if (!pickerFor) return;
    setConfigs(prev => ({
      ...prev,
      [pickerFor]: {
        action: 'link',
        target_product_id: product.product_id,
        target_name: product.name,
        target_image: product.main_image_url || product.image,
      },
    }));
    setPickerFor(null);
  };

  // ── นำเข้า ──────────────────────────────────────────────────────────────
  /** ยิงหนึ่งรอบ คืน cursor ที่ต้องไปต่อ (undefined = จบแล้ว) */
  const runPass = async (body: Record<string, unknown>, acc: ImportSummary): Promise<string | undefined> => {
    // SSE — apiFetch อ่าน body เป็น json ไม่ได้ ต้องยิง fetch ตรงพร้อมแนบ token เอง
    const token = await getAccessToken();
    // X-Company-Id ต้องแนบเอง (apiFetch แนบให้ แต่ fetch ตรงไม่มี) — ไม่งั้น API
    // ตกไปใช้บริษัทแรกของผู้ใช้ แล้วหาร้านไม่เจอ = 404 "ไม่พบร้านนี้"
    const currentCompanyId = typeof window !== 'undefined' ? localStorage.getItem('aoo-current-company-id') : null;
    const res = await fetch('/api/marketplace/products/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(currentCompanyId ? { 'X-Company-Id': currentCompanyId } : {}),
      },
      body: JSON.stringify({ account_id: accountId, copy_sku_to_barcode: copySkuToBarcode, ...body }),
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'เริ่มนำเข้าไม่สำเร็จ');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let next: string | undefined;

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
          setProgress({
            done: evt.done,
            total: evt.total,
            label: `${evt.success ? 'นำเข้าแล้ว' : 'ข้าม'}: ${evt.item_name}`,
          });
        } else if (evt.type === 'done') {
          acc.created += evt.created || 0;
          acc.updated += evt.updated || 0;
          acc.linked += evt.linked || 0;
          acc.skipped += evt.skipped || 0;
          acc.errors.push(...(evt.errors || []));
          next = evt.next_cursor || undefined;
        } else if (evt.type === 'error') {
          throw new Error(evt.message || 'นำเข้าไม่สำเร็จ');
        }
      }
    }
    return next;
  };

  const startImport = async (mode: 'selected' | 'all') => {
    if (!accountId) return;
    const acc: ImportSummary = { created: 0, updated: 0, linked: 0, skipped: 0, errors: [] };
    setImporting(true);
    setSummary(null);
    setProgress({ done: 0, label: 'กำลังเริ่ม...' });

    try {
      if (mode === 'selected') {
        const requests = [...selected].map(id => {
          const cfg = configOf(id);
          return {
            external_item_id: id,
            action: cfg.action,
            target_product_id: cfg.action === 'link' ? cfg.target_product_id : undefined,
          };
        });
        await runPass({ items: requests }, acc);
      } else {
        // ทั้งร้าน: server หยุดเองก่อนหมดเวลาแล้วบอก next_cursor มา — ยิงต่อจนครบ
        let next: string | undefined;
        let passes = 0;
        do {
          next = await runPass({ all: true, cursor: next }, acc);
          passes++;
        } while (next && passes < 40);
        if (next) acc.errors.push(`หยุดหลังทำไป ${passes} รอบ — กด "นำเข้าทั้งร้าน" อีกครั้งเพื่อทำต่อ`);
      }
      setSummary(acc);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'นำเข้าไม่สำเร็จ', 'error');
      // ทำไปได้บางส่วนก่อนพัง — ต้องรายงานของที่เข้าไปแล้ว ไม่ใช่หายไปเฉย ๆ
      if (acc.created + acc.updated + acc.linked > 0) setSummary(acc);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  const canImportSelected = selected.size > 0 && [...selected].every(id => {
    const cfg = configOf(id);
    return cfg.action !== 'link' || !!cfg.target_product_id;
  });

  // ── render ──────────────────────────────────────────────────────────────
  if (checking) return <LoadingCard />;
  if (!allowed) return null;

  const label = platform ? platformLabel(platform) : 'Marketplace';

  if (!accountId) {
    return (
      <Container size="5xl">
        <PageHeader title="นำเข้าสินค้าจากร้าน" backHref={BACK_HREF} />
        <Alert tone="danger" title="ไม่ได้ระบุร้าน">
          เปิดหน้านี้จากหน้า &quot;ซิงค์สินค้า &amp; สต็อก&quot; แล้วเลือกงาน &quot;นำเข้าสินค้าจากร้าน&quot; กับร้านที่ต้องการ
        </Alert>
      </Container>
    );
  }

  if (summary) {
    return (
      <Container size="5xl">
        <PageHeader
          icon={platform ? <PlatformIcon id={platform} /> : <Store />}
          title={`นำเข้าสินค้าจาก ${label}`}
          subtitle={shopName}
          backHref={BACK_HREF}
        />
        <DoneCard
          hasErrors={summary.errors.length > 0}
          title="นำเข้าสินค้าเสร็จแล้ว"
          summary={
            <div className="flex flex-wrap justify-center gap-2">
              <Badge tone="emerald">{summary.created} สร้างใหม่</Badge>
              <Badge tone="blue">{summary.updated} อัปเดต</Badge>
              <Badge tone="indigo">{summary.linked} ผูกกับสินค้าเดิม</Badge>
              {summary.skipped > 0 && <Badge tone="amber">{summary.skipped} ข้าม</Badge>}
            </div>
          }
          actions={
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={() => {
                setSummary(null);
                setSelected(new Set());
                setConfigs({});
                loadPage(cursor, appliedSearch);
              }}>
                นำเข้าต่อ
              </Button>
              <Button variant="primary" onClick={() => router.push('/products')}>ดูสินค้าในระบบ</Button>
            </div>
          }
        />
        {summary.errors.length > 0 && (
          <Card>
            <h2 className="heading-3 mb-2">รายการที่ไม่สำเร็จ</h2>
            <ul className="space-y-1">
              {summary.errors.map((err, i) => (
                <li key={i} className="body-text text-red-600 dark:text-red-400">{err}</li>
              ))}
            </ul>
          </Card>
        )}
      </Container>
    );
  }

  return (
    <Container size="5xl">
      <PageHeader
        icon={platform ? <PlatformIcon id={platform} /> : <Store />}
        title={`นำเข้าสินค้าจาก ${label}`}
        subtitle={shopName || undefined}
        backHref={BACK_HREF}
        actions={
          <ImportButton
            variant="secondary"
            loading={importing}
            disabled={importing}
            onClick={() => startImport('all')}
          >
            นำเข้าทั้งร้าน
          </ImportButton>
        }
      />

      <Alert tone="info" title="สินค้าที่ SKU ตรงกันจะผูกให้อัตโนมัติ">
        ระบบไม่สร้างสินค้าซ้ำ — ตัวที่ SKU ตรงกับของในระบบจะถูกผูกให้เอง · สินค้าที่คุณแก้เองในระบบ (ชื่อ/รายละเอียด) จะไม่ถูกเขียนทับ ·
        สต็อกจากร้านจะเติมให้เฉพาะช่องที่คลังเรายังเป็น 0 และการผูกกับสินค้าเดิมจะส่งสต็อกของเราขึ้นร้านทันที
      </Alert>

      <Card>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <SearchInput
              className="flex-1"
              value={search}
              onChange={(v) => { setSearch(v); runSearch(v); }}
              onSubmit={() => runSearch.now(search)}
              placeholder="ค้นหาชื่อสินค้า หรือ SKU..."
            />
            <FilterChips<LinkFilter>
              size="md"
              value={linkFilter}
              onChange={setLinkFilter}
              chips={[
                { id: 'all', label: 'ทั้งหมด', activeClass: FILTER_CHIP_PRIMARY_ACTIVE, count: items.length },
                { id: 'unlinked', label: 'ยังไม่ผูก', activeClass: FILTER_CHIP_PRIMARY_ACTIVE, count: items.filter(i => !i.linked_product).length },
                { id: 'linked', label: 'ผูกแล้ว', activeClass: FILTER_CHIP_PRIMARY_ACTIVE, count: items.filter(i => i.linked_product).length },
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Checkbox
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={visibleItems.length === 0 || importing}
              label={`เลือกทั้งหน้า (${visibleItems.length})`}
            />
            <Checkbox
              checked={copySkuToBarcode}
              onChange={setCopySkuToBarcode}
              disabled={importing}
              label="คัดลอก SKU เป็นบาร์โค้ด"
            />
          </div>

          {progress && (
            <ProgressBar
              value={progress.done}
              max={progress.total || Math.max(progress.done, 1)}
              label={`${progress.label} (${progress.done}${progress.total ? `/${progress.total}` : ''})`}
            />
          )}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" disabled={importing} onClick={() => router.push(BACK_HREF)}>ยกเลิก</Button>
            <ImportButton
              loading={importing}
              disabled={!canImportSelected || importing}
              onClick={() => startImport('selected')}
            >
              นำเข้าที่เลือก ({selected.size})
            </ImportButton>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="heading-3">สินค้าในร้าน</h2>
          {total !== null && <span className="subtitle-text text-gray-500">ทั้งหมด {total} รายการ</span>}
        </div>

        {loading ? (
          <LoadingCard />
        ) : loadError ? (
          <Alert tone="danger" title="โหลดรายการไม่สำเร็จ">
            {loadError}
            <div className="mt-3">
              <Button variant="secondary" onClick={() => loadPage(cursor, appliedSearch)}>ลองใหม่</Button>
            </div>
          </Alert>
        ) : visibleItems.length === 0 ? (
          <EmptyCard
            icon={<Package className="w-8 h-8" />}
            title="ไม่พบสินค้า"
            subtitle={appliedSearch ? 'ลองเปลี่ยนคำค้น — ระบบค้นเฉพาะสินค้าในหน้านี้' : `ร้าน ${label} นี้ยังไม่มีสินค้าที่เผยแพร่อยู่`}
          />
        ) : (
          <div className="space-y-2">
            {visibleItems.map(item => {
              const id = item.external_item_id;
              const cfg = configOf(id);
              const checked = selected.has(id);
              return (
                <div
                  key={id}
                  className={`rounded-lg border p-3 space-y-2 transition-colors ${
                    checked
                      ? 'border-primary bg-orange-50/60 dark:bg-orange-950/20'
                      : 'border-gray-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-1">
                      <Checkbox checked={checked} onChange={() => toggleOne(id)} disabled={importing} />
                    </div>
                    <ProductImageThumb src={item.image} alt={item.name} size="sm" fallbackIcon={<Package className="w-5 h-5" />} />
                    <div className="min-w-0 flex-1">
                      <div className="body-text truncate">{item.name}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                        <span className="helper-text text-gray-500">
                          {item.has_variation ? `${item.model_count} ตัวเลือก` : 'สินค้าเดี่ยว'}
                        </span>
                        {item.sku && <span className="helper-text text-gray-500">SKU: {item.sku}</span>}
                        {item.price > 0 && <span className="helper-text text-gray-500">{formatPrice(item.price)}</span>}
                        <span className="helper-text text-gray-500">สต็อกบนร้าน {item.total_stock}</span>
                        {item.status && (
                          <InfoChip colors="bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300">
                            {item.status}
                          </InfoChip>
                        )}
                      </div>
                      {item.linked_product ? (
                        <div className="helper-text text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                          <Link2 className="w-3.5 h-3.5" />
                          ผูกกับ {item.linked_product.name} แล้ว
                        </div>
                      ) : item.auto_match ? (
                        <div className="helper-text text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                          <Link2 className="w-3.5 h-3.5" />
                          จะผูกกับ {item.auto_match.name} อัตโนมัติ (SKU ตรงกัน)
                        </div>
                      ) : null}
                    </div>

                    <FilterChips<'create' | 'link'>
                      variant="segmented"
                      value={cfg.action}
                      onChange={(v) => setAction(id, v)}
                      disabled={importing}
                      chips={[
                        { id: 'create', label: 'สร้างใหม่', icon: <Plus className="w-3.5 h-3.5" />, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
                        { id: 'link', label: 'ผูกกับของเดิม', icon: <Link2 className="w-3.5 h-3.5" />, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
                      ]}
                    />
                  </div>

                  {cfg.action === 'link' && (
                    <div className="pl-11">
                      {cfg.target_product_id ? (
                        <div className="inner-panel inner-panel-body flex items-center gap-2.5">
                          <ProductImageThumb src={cfg.target_image || null} alt={cfg.target_name || ''} size="xs" fallbackIcon={<Package className="w-4 h-4" />} />
                          <span className="body-text truncate flex-1 min-w-0">{cfg.target_name}</span>
                          <Button size="sm" variant="ghost" onClick={() => setPickerFor(id)}>เปลี่ยน</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setPickerFor(id)}>
                          เลือกสินค้าที่จะผูก...
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {(history.length > 0 || nextCursor) && (
              <div className="flex items-center justify-center gap-4 pt-2">
                <Button size="sm" variant="secondary" disabled={history.length === 0 || loading} onClick={goPrev} icon={<ChevronLeft className="w-4 h-4" />}>
                  ก่อนหน้า
                </Button>
                <span className="subtitle-text text-gray-500">หน้า {history.length + 1}</span>
                <Button size="sm" variant="secondary" disabled={!nextCursor || loading} onClick={goNext} iconRight={<ChevronRight className="w-4 h-4" />}>
                  ถัดไป
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {pickerFor !== null && (
        <ProductPicker onSelect={pickProduct} onCancel={() => setPickerFor(null)} />
      )}
    </Container>
  );
}

export default function MarketplaceImportPage() {
  return (
    <Layout>
      <Suspense fallback={<LoadingCard />}>
        <MarketplaceImportContent />
      </Suspense>
    </Layout>
  );
}
