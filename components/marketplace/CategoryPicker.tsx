'use client';

// เลือกหมวดหมู่ของร้าน marketplace — **ตัวเดียวทุกแพลตฟอร์ม**
// (ย้ายมาจาก `components/shopee/ShopeeCategoryPicker.tsx` แล้วตัดของที่ผูกกับ Shopee ออก)
//
// ข้อมูลมาจาก `GET /api/marketplace/products/export/categories?account_id=` ซึ่งคืน
// ต้นไม้ที่แบนแล้ว (`id` · `parent_id` · `name` · `is_leaf`) — **เลือกได้เฉพาะปลายกิ่ง**
//
// ⛔ ห้ามเขียนเงื่อนไขแยก platform ในไฟล์นี้ · ห้ามทำ picker ตัวที่สองต่อแพลตฟอร์ม

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Loader2, ChevronRight, ChevronDown, ChevronLeft, X, Check } from 'lucide-react';

export interface MarketplaceCategoryOption {
  id: string;
  parent_id: string | null;
  name: string;
  is_leaf: boolean;
}

interface CategoryPickerProps {
  accountId: string;
  value: string | null;
  /** ชื่อที่รู้อยู่แล้ว — โชว์ก่อนโหลดต้นไม้เสร็จ */
  categoryName?: string;
  onChange: (categoryId: string | null, categoryName: string) => void;
  /** ใช้ในข้อความ "เลือกหมวดหมู่ {X}..." — มาจาก `MARKETPLACE_PLATFORMS[platform].label` */
  platformLabel?: string;
  disabled?: boolean;
}

/**
 * หมวดหมู่ทั้งร้านเป็นก้อนใหญ่ (Shopee หลักหมื่นแถว) และหน้า wizard วาง picker
 * หนึ่งตัวต่อสินค้าหนึ่งรายการ — โหลดร่วมกันต่อร้าน ไม่ใช่ต่อ instance
 */
const treeCache = new Map<string, MarketplaceCategoryOption[]>();
const inFlight = new Map<string, Promise<MarketplaceCategoryOption[]>>();

async function loadCategories(accountId: string): Promise<MarketplaceCategoryOption[]> {
  const cached = treeCache.get(accountId);
  if (cached) return cached;

  const pending = inFlight.get(accountId);
  if (pending) return pending;

  const promise = (async () => {
    const res = await apiFetch(`/api/marketplace/products/export/categories?account_id=${accountId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'โหลดหมวดหมู่ไม่สำเร็จ');
    const categories: MarketplaceCategoryOption[] = data.categories || [];
    treeCache.set(accountId, categories);
    return categories;
  })();

  inFlight.set(accountId, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(accountId);
  }
}

export default function CategoryPicker({
  accountId,
  value,
  categoryName,
  onChange,
  platformLabel,
  disabled,
}: CategoryPickerProps) {
  const [categories, setCategories] = useState<MarketplaceCategoryOption[]>(() => treeCache.get(accountId) || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  /** เส้นทางที่กำลังเลือกอยู่ [ระดับ0, ระดับ1, ...] */
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  /** มือถือไล่ทีละชั้น — ชั้นที่เห็นอยู่ตอนนี้ */
  const [mobileLevel, setMobileLevel] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const label = platformLabel || 'ร้าน';

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target)
        && panelRef.current && !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const fetchCategories = useCallback(async () => {
    if (treeCache.has(accountId)) {
      setCategories(treeCache.get(accountId)!);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setCategories(await loadCategories(accountId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดหมวดหมู่ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const childrenOf = useCallback(
    (parentId: string | null) => categories
      .filter(c => c.parent_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const pathOf = useCallback((categoryId: string): string[] => {
    const path: string[] = [];
    let current = categories.find(c => c.id === categoryId);
    let guard = 0;
    while (current && guard++ < 20) {
      path.unshift(current.id);
      if (!current.parent_id) break;
      const parentId: string = current.parent_id;
      current = categories.find(c => c.id === parentId);
    }
    return path;
  }, [categories]);

  const fullNameOf = useCallback(
    (categoryId: string) => pathOf(categoryId)
      .map(id => categories.find(c => c.id === id)?.name || '')
      .filter(Boolean)
      .join(' > '),
    [pathOf, categories],
  );

  // ต้นไม้โหลดเสร็จแล้วและมีค่าที่เลือกไว้ → กางเส้นทางให้ตรง
  useEffect(() => {
    if (value && categories.length > 0 && selectedPath.length === 0) {
      setSelectedPath(pathOf(value));
    }
  }, [categories, value, selectedPath.length, pathOf]);

  const updatePanelPosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const panelH = 440;
    const panelW = Math.min(Math.max(rect.width, 780), viewportW - 16);
    const openBelow = viewportH - rect.bottom >= panelH || viewportH - rect.bottom >= rect.top;

    let left = rect.left;
    if (left + panelW > viewportW - 8) left = viewportW - panelW - 8;
    if (left < 8) left = 8;

    setPanelStyle({
      position: 'fixed',
      left,
      width: panelW,
      ...(openBelow ? { top: rect.bottom + 4 } : { bottom: viewportH - rect.top + 4 }),
      zIndex: 50,
    });
  };

  const handleOpen = () => {
    if (disabled) return;
    updatePanelPosition();
    setOpen(true);
    setSearch('');
    fetchCategories();
    const path = value ? pathOf(value) : [];
    setMobileLevel(path.length > 0 ? path.length - 1 : 0);
  };

  const handleSelect = (level: number, category: MarketplaceCategoryOption) => {
    setSelectedPath([...selectedPath.slice(0, level), category.id]);
    if (category.is_leaf) {
      onChange(category.id, fullNameOf(category.id));
      setOpen(false);
      return;
    }
    // หมวดกลางเลือกไม่ได้ — ล้างค่าแล้วไล่ลงชั้นถัดไป
    onChange(null, '');
    setMobileLevel(level + 1);
    requestAnimationFrame(() => {
      columnsRef.current?.scrollTo({ left: columnsRef.current.scrollWidth, behavior: 'smooth' });
    });
  };

  const selectedLabel = value
    ? (categories.length > 0 ? fullNameOf(value) : '') || categoryName || `หมวด #${value}`
    : '';

  const searchResults = search.trim().length >= 2
    ? categories.filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 30)
    : [];

  const columnLevels: { key: string; cats: MarketplaceCategoryOption[]; level: number }[] = [
    { key: 'root', cats: childrenOf(null), level: 0 },
  ];
  for (let i = 0; i < selectedPath.length; i++) {
    const children = childrenOf(selectedPath[i]);
    if (children.length > 0) columnLevels.push({ key: selectedPath[i], cats: children, level: i + 1 });
  }

  const mobileCats = mobileLevel === 0 ? childrenOf(null) : childrenOf(selectedPath[mobileLevel - 1] ?? null);
  const mobileBreadcrumb = mobileLevel === 0
    ? 'หมวดหมู่หลัก'
    : categories.find(c => c.id === selectedPath[mobileLevel - 1])?.name || '';

  const renderList = (cats: MarketplaceCategoryOption[], level: number, emptyText: string, big = false) => (
    cats.length === 0 ? (
      <p className="helper-text text-gray-400 dark:text-slate-500 text-center py-6">{emptyText}</p>
    ) : (
      cats.map(cat => {
        const inPath = selectedPath[level] === cat.id;
        const isSelected = value === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => handleSelect(level, cat)}
            className={`w-full text-left rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-1.5 ${
              big ? 'px-4 py-3' : 'px-3 py-2'
            } ${
              inPath
                ? 'bg-orange-50 dark:bg-orange-900/20 text-primary font-medium'
                : isSelected
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-medium'
                  : 'text-gray-700 dark:text-slate-300'
            }`}
          >
            <span className="truncate flex-1">{cat.name}</span>
            {!cat.is_leaf
              ? <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-40" />
              : isSelected && <Check className="w-4 h-4 flex-shrink-0 text-green-500" />}
          </button>
        );
      })
    )
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        onClick={handleOpen}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 h-[42px] border rounded-lg text-sm text-left transition-colors disabled:opacity-50 ${
          value
            ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-gray-900 dark:text-white'
            : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-500 dark:text-slate-400'
        } hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50`}
      >
        <span className="truncate">{value ? selectedLabel : `เลือกหมวดหมู่ ${label}...`}</span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {value && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange(null, ''); setSelectedPath([]); }}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-slate-600 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="fixed inset-x-0 bottom-0 top-auto z-50 max-h-[70vh] rounded-t-2xl sm:inset-auto sm:rounded-xl sm:max-h-[440px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-xl flex flex-col"
            style={panelStyle}
          >
            <div className="sm:hidden">
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
              </div>
              <div className="flex items-center justify-between px-3 pb-2 border-b border-gray-200 dark:border-slate-700">
                <h3 className="heading-4">เลือกหมวดหมู่ {label}</h3>
                <button type="button" onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-3 border-b border-gray-200 dark:border-slate-700">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาหมวดหมู่..."
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary placeholder-gray-400"
              />
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 body-text text-gray-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังโหลดหมวดหมู่...
              </div>
            )}

            {error && (
              <div className="p-4 body-text text-red-500 text-center">
                {error}
                <button onClick={() => { treeCache.delete(accountId); fetchCategories(); }} className="ml-2 text-blue-500 hover:underline">
                  ลองใหม่
                </button>
              </div>
            )}

            {!loading && !error && search.trim().length >= 2 && (
              <div className="overflow-y-auto flex-1 sm:max-h-[340px] p-1">
                {searchResults.length === 0 ? (
                  <p className="body-text text-gray-500 dark:text-slate-400 text-center py-6">ไม่พบหมวดหมู่</p>
                ) : (
                  searchResults.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedPath(pathOf(cat.id));
                        if (cat.is_leaf) {
                          onChange(cat.id, fullNameOf(cat.id));
                          setOpen(false);
                        }
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2 ${
                        cat.is_leaf ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'
                      }`}
                    >
                      <span className="truncate flex-1">{fullNameOf(cat.id)}</span>
                      {cat.is_leaf
                        ? <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            )}

            {!loading && !error && search.trim().length < 2 && (
              <>
                {/* จอใหญ่: คอลัมน์ไล่ชั้นเลื่อนแนวนอน */}
                <div ref={columnsRef} className="hidden sm:flex overflow-x-auto overflow-y-hidden flex-1 min-h-0">
                  {columnLevels.map((col, idx) => (
                    <div
                      key={`${col.key}-${col.level}`}
                      className={`flex-shrink-0 w-[260px] overflow-y-auto max-h-[340px] p-1.5 ${
                        idx > 0 ? 'border-l border-gray-200 dark:border-slate-700' : ''
                      }`}
                    >
                      {renderList(col.cats, col.level, col.level === 0 ? 'ไม่มีหมวดหมู่' : 'ไม่มีหมวดย่อย')}
                    </div>
                  ))}
                </div>

                {/* มือถือ: ไล่ทีละชั้น */}
                <div className="sm:hidden flex flex-col flex-1 min-h-0">
                  {mobileLevel > 0 && (
                    <button
                      type="button"
                      onClick={() => setMobileLevel(mobileLevel - 1)}
                      className="flex items-center gap-2 px-3 py-2.5 body-text text-primary font-medium border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>{mobileBreadcrumb}</span>
                    </button>
                  )}
                  <div className="overflow-y-auto flex-1 p-1.5">
                    {renderList(mobileCats, mobileLevel, mobileLevel === 0 ? 'ไม่มีหมวดหมู่' : 'ไม่มีหมวดย่อย', true)}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
