'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Loader2, ChevronRight, ChevronDown, ChevronLeft, X, Check } from 'lucide-react';

interface ShopeeCategory {
  category_id: number;
  parent_category_id: number;
  original_category_name: string;
  display_category_name: string;
  has_children: boolean;
}

interface ShopeeCategoryPickerProps {
  accountId: string;
  value: number | null;
  categoryName?: string; // Pre-loaded name to display before categories are fetched
  onChange: (categoryId: number | null, categoryName: string) => void;
}

export default function ShopeeCategoryPicker({ accountId, value, categoryName, onChange }: ShopeeCategoryPickerProps) {
  const [categories, setCategories] = useState<ShopeeCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Cascading selection state: [level0_id, level1_id, level2_id, ...]
  const [selectedPath, setSelectedPath] = useState<number[]>([]);

  // Mobile drill-down: which level is currently visible
  const [mobileLevel, setMobileLevel] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const fetchCategories = async () => {
    if (fetched) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/shopee/categories?account_id=${accountId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch');
      }
      const data = await res.json();
      setCategories(data.categories || []);
      setFetched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const updatePanelPosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom;
    const panelH = 440;
    const panelW = Math.min(Math.max(rect.width, 780), viewportW - 16);
    const openBelow = spaceBelow >= panelH || spaceBelow >= rect.top;

    // Keep panel within viewport horizontally
    let left = rect.left;
    if (left + panelW > viewportW - 8) {
      left = viewportW - panelW - 8;
    }
    if (left < 8) left = 8;

    setPanelStyle({
      position: 'fixed',
      left,
      width: panelW,
      ...(openBelow
        ? { top: rect.bottom + 4 }
        : { bottom: viewportH - rect.top + 4 }),
      zIndex: 50,
    });
  };

  // When opening, fetch if not yet fetched + restore path from value
  const handleOpen = () => {
    updatePanelPosition();
    setOpen(true);
    setSearch('');
    if (!fetched) {
      fetchCategories();
    }
    // Restore selectedPath from current value
    if (value && categories.length > 0) {
      const path = restorePathFromValue(value);
      // Mobile: navigate to the deepest level that has the selected leaf
      setMobileLevel(path.length > 0 ? path.length - 1 : 0);
      // Desktop: scroll to rightmost column after render
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          columnsRef.current?.scrollTo({ left: columnsRef.current.scrollWidth, behavior: 'auto' });
        });
      });
    } else {
      setMobileLevel(0);
    }
  };

  const restorePathFromValue = (catId: number): number[] => {
    const path: number[] = [];
    let current = categories.find(c => c.category_id === catId);
    while (current) {
      path.unshift(current.category_id);
      if (current.parent_category_id === 0) break;
      current = categories.find(c => c.category_id === current!.parent_category_id);
    }
    setSelectedPath(path);
    return path;
  };

  // Restore path when categories load and value exists
  useEffect(() => {
    if (value && categories.length > 0 && selectedPath.length === 0) {
      const path = restorePathFromValue(value);
      // If picker is open, scroll to last level
      if (open) {
        setMobileLevel(path.length > 0 ? path.length - 1 : 0);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            columnsRef.current?.scrollTo({ left: columnsRef.current.scrollWidth, behavior: 'auto' });
          });
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, value]);

  const getChildren = (parentId: number): ShopeeCategory[] => {
    return categories.filter(c => c.parent_category_id === parentId)
      .sort((a, b) => a.display_category_name.localeCompare(b.display_category_name));
  };

  const rootCategories = categories.filter(c => c.parent_category_id === 0);

  const handleSelect = (level: number, cat: ShopeeCategory) => {
    const newPath = [...selectedPath.slice(0, level), cat.category_id];
    setSelectedPath(newPath);

    if (!cat.has_children) {
      // Leaf category — final selection
      const fullName = buildFullPath(cat.category_id);
      onChange(cat.category_id, fullName);
      setOpen(false);
    } else {
      // Non-leaf — clear value, keep panel open
      onChange(null, '');
      // On mobile, advance to next level
      setMobileLevel(level + 1);
      // Desktop: scroll to show new column
      requestAnimationFrame(() => {
        columnsRef.current?.scrollTo({ left: columnsRef.current.scrollWidth, behavior: 'smooth' });
      });
    }
  };

  const buildFullPath = (catId: number): string => {
    const path: string[] = [];
    let current = categories.find(c => c.category_id === catId);
    while (current) {
      path.unshift(current.display_category_name);
      if (current.parent_category_id === 0) break;
      current = categories.find(c => c.category_id === current!.parent_category_id);
    }
    return path.join(' > ');
  };

  const getSelectedName = (): string => {
    if (!value) return '';
    // If categories are loaded, build full path from tree
    if (categories.length > 0) {
      const path = buildFullPath(value);
      if (path) return path;
    }
    // Fallback: use pre-loaded categoryName prop, or show category ID
    return categoryName || `Category #${value}`;
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null, '');
    setSelectedPath([]);
  };

  // Search results — search across all categories, show leaf matches
  const searchResults = search.trim().length >= 2
    ? categories.filter(c =>
        c.display_category_name.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 30)
    : [];

  const handleSearchSelect = (cat: ShopeeCategory) => {
    // Build path to this category
    restorePathFromValue(cat.category_id);
    if (!cat.has_children) {
      const fullName = buildFullPath(cat.category_id);
      onChange(cat.category_id, fullName);
      setOpen(false);
    }
  };

  // Build dynamic column levels based on selectedPath
  // Always show: root + children of each selected node
  const columnLevels: { parentId: number; cats: ShopeeCategory[]; level: number }[] = [];
  // Level 0 = root
  columnLevels.push({ parentId: 0, cats: rootCategories, level: 0 });
  // Add child columns for each selected path node
  for (let i = 0; i < selectedPath.length; i++) {
    const children = getChildren(selectedPath[i]);
    if (children.length > 0) {
      columnLevels.push({ parentId: selectedPath[i], cats: children, level: i + 1 });
    }
  }

  // Get parent name for mobile breadcrumb
  const getMobileBreadcrumb = (level: number): string => {
    if (level === 0) return 'หมวดหมู่หลัก';
    const parentCat = categories.find(c => c.category_id === selectedPath[level - 1]);
    return parentCat?.display_category_name || '';
  };

  // Get categories for current mobile level
  const getMobileLevelData = (level: number): ShopeeCategory[] => {
    if (level === 0) return rootCategories;
    if (level <= selectedPath.length) {
      return getChildren(selectedPath[level - 1]);
    }
    return [];
  };

  // Scroll selected item into view within its column
  const scrollSelectedIntoView = (el: HTMLButtonElement | null) => {
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: 'center', behavior: 'auto' });
      });
    }
  };

  // Render a single column of categories (shared between desktop columns and mobile)
  const renderCategoryList = (cats: ShopeeCategory[], level: number, emptyText: string) => (
    cats.length === 0 ? (
      <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-6">
        {emptyText}
      </p>
    ) : (
      cats.map(cat => {
        const isInPath = selectedPath[level] === cat.category_id;
        const isSelected = value === cat.category_id;
        return (
          <button
            key={cat.category_id}
            type="button"
            ref={(isInPath || isSelected) ? scrollSelectedIntoView : undefined}
            onClick={() => handleSelect(level, cat)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-1.5 ${
              isInPath
                ? 'bg-orange-50 dark:bg-orange-900/20 text-[#EE4D2D] font-medium'
                : isSelected
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-medium'
                  : 'text-gray-700 dark:text-slate-300'
            }`}
          >
            <span className="truncate flex-1">{cat.display_category_name}</span>
            {cat.has_children ? (
              <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-40" />
            ) : (
              isSelected && <Check className="w-4 h-4 flex-shrink-0 text-green-500" />
            )}
          </button>
        );
      })
    )
  );

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger button */}
      <button
        type="button"
        ref={triggerRef}
        onClick={handleOpen}
        className={`w-full flex items-center justify-between gap-2 px-3 h-[42px] border rounded-lg text-sm text-left transition-colors ${
          value
            ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-gray-900 dark:text-white'
            : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-500 dark:text-slate-400'
        } hover:border-[#EE4D2D] focus:outline-none focus:ring-2 focus:ring-[#EE4D2D]/50`}
      >
        <span className="truncate">
          {value ? getSelectedName() : 'เลือกหมวดหมู่ Shopee...'}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {value && (
            <span
              onClick={handleClear}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-slate-600 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Floating panel */}
      {open && (
        <>
        {/* Mobile backdrop */}
        <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => setOpen(false)} />
        <div
          ref={panelRef}
          className="fixed inset-x-0 bottom-0 top-auto z-50 max-h-[70vh] rounded-t-2xl sm:inset-auto sm:rounded-xl sm:max-h-[440px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-xl flex flex-col"
          style={panelStyle}
        >
          {/* Mobile header with drag handle */}
          <div className="sm:hidden">
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
            </div>
            <div className="flex items-center justify-between px-3 pb-2 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">เลือกหมวดหมู่ Shopee</h3>
              <button type="button" onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="p-3 border-b border-gray-200 dark:border-slate-700">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาหมวดหมู่..."
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#EE4D2D] placeholder-gray-400"
            />
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              กำลังโหลดหมวดหมู่...
            </div>
          )}

          {error && (
            <div className="p-4 text-sm text-red-500 text-center">
              {error}
              <button onClick={() => { setFetched(false); fetchCategories(); }} className="ml-2 text-blue-500 hover:underline">ลองใหม่</button>
            </div>
          )}

          {!loading && !error && search.trim().length >= 2 && (
            /* Search results */
            <div className="overflow-y-auto flex-1 sm:max-h-[340px] p-1">
              {searchResults.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-6">ไม่พบหมวดหมู่</p>
              ) : (
                searchResults.map(cat => {
                  const fullPath = buildFullPath(cat.category_id);
                  const isLeaf = !cat.has_children;
                  return (
                    <button
                      key={cat.category_id}
                      type="button"
                      onClick={() => handleSearchSelect(cat)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2 ${
                        !isLeaf ? 'text-gray-400 dark:text-slate-500' : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      <span className="truncate flex-1">{fullPath}</span>
                      {isLeaf && <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                      {!isLeaf && <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {!loading && !error && search.trim().length < 2 && (
            <>
              {/* Desktop: dynamic columns with horizontal scroll */}
              <div
                ref={columnsRef}
                className="hidden sm:flex overflow-x-auto overflow-y-hidden flex-1 min-h-0"
              >
                {columnLevels.map((col, idx) => (
                  <div
                    key={`${col.parentId}-${col.level}`}
                    className={`flex-shrink-0 w-[260px] overflow-y-auto max-h-[340px] p-1.5 ${
                      idx > 0 ? 'border-l border-gray-200 dark:border-slate-700' : ''
                    }`}
                  >
                    {renderCategoryList(
                      col.cats,
                      col.level,
                      col.level === 0 ? 'ไม่มีหมวดหมู่' : 'ไม่มีหมวดย่อย'
                    )}
                  </div>
                ))}
              </div>

              {/* Mobile: single-column drill-down */}
              <div className="sm:hidden flex flex-col flex-1 min-h-0">
                {/* Back button + breadcrumb */}
                {mobileLevel > 0 && (
                  <button
                    type="button"
                    onClick={() => setMobileLevel(mobileLevel - 1)}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#EE4D2D] font-medium border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>{getMobileBreadcrumb(mobileLevel)}</span>
                  </button>
                )}

                {/* Category list for current level */}
                <div className="overflow-y-auto flex-1 p-1.5">
                  {getMobileLevelData(mobileLevel).length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-6">
                      {mobileLevel === 0 ? 'ไม่มีหมวดหมู่' : 'ไม่มีหมวดย่อย'}
                    </p>
                  ) : (
                    getMobileLevelData(mobileLevel).map(cat => (
                      <button
                        key={cat.category_id}
                        type="button"
                        onClick={() => handleSelect(mobileLevel, cat)}
                        className={`w-full text-left px-4 py-3 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2 ${
                          selectedPath[mobileLevel] === cat.category_id
                            ? 'bg-orange-50 dark:bg-orange-900/20 text-[#EE4D2D] font-medium'
                            : value === cat.category_id
                              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-medium'
                              : 'text-gray-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="truncate flex-1">{cat.display_category_name}</span>
                        {cat.has_children ? (
                          <ChevronRight className="w-5 h-5 flex-shrink-0 opacity-40" />
                        ) : (
                          value === cat.category_id && <Check className="w-5 h-5 flex-shrink-0 text-green-500" />
                        )}
                      </button>
                    ))
                  )}
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
