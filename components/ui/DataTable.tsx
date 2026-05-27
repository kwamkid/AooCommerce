'use client';

import { type ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Package, ArrowUp, ArrowDown, ArrowUpDown, Check, X, GripVertical, RotateCcw } from 'lucide-react';
import {
  DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent,
  closestCenter, MeasuringStrategy,
} from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';
import { useColumnToggle, type ColumnConfig } from '@/lib/useColumnToggle';

// ── Types ──

export type SortDir = 'asc' | 'desc';

/** Inline edit input type — controls how the cell becomes editable. */
export type EditInputType = 'text' | 'number' | 'select';

export interface EditConfig<T> {
  /** Input control to render in edit mode. */
  type: EditInputType;
  /** Current value from the row (string/number → input value). */
  getValue: (row: T) => string | number | null | undefined;
  /** Called when user commits the edit (Enter / blur outside / Save). */
  onSave: (row: T, value: string) => void | Promise<void>;
  /** For type='select' — options list. */
  options?: { value: string; label: string }[];
  /** Optional client-side validation. Return error message or null. */
  validate?: (value: string) => string | null;
}

export interface DataTableColumn<T> {
  key: string;
  label: string;
  /** Always visible — can't be toggled off */
  alwaysVisible?: boolean;
  /** Default visible (default: true) */
  defaultVisible?: boolean;
  /** Header className (e.g. 'text-right', 'text-center', 'min-w-[200px]') */
  headerClassName?: string;
  /** Cell className */
  cellClassName?: string;
  /** Render cell content */
  render: (row: T, index: number) => ReactNode;
  /** Render mobile card content (if different from table cell) */
  mobileRender?: (row: T, index: number) => ReactNode;
  /** Hide in mobile card view */
  hideMobile?: boolean;
  /** Stop click propagation on this cell (e.g. for action buttons) */
  stopPropagation?: boolean;
  /** Enable sort on this column. Pair with `sortBy`/`onSort` on DataTable. */
  sortable?: boolean;
  /** Default column width in pixels — only effective when `resizable` is on
   *  somewhere in the table. Otherwise auto. */
  defaultWidth?: number;
  /** Allow user to drag-resize this column. Persists to localStorage. */
  resizable?: boolean;
  /** Allow user to drag the header to reorder this column. Persists to localStorage.
   *  Note: alwaysVisible columns (first column / actions) are typically not reorderable. */
  reorderable?: boolean;
  /** Inline cell editing config — click to edit. */
  edit?: EditConfig<T>;
}

export interface DataTableProps<T> {
  /** Unique key for localStorage column toggle / widths */
  storageKey: string;
  /** Column definitions */
  columns: DataTableColumn<T>[];
  /** Data rows */
  data: T[];
  /** Loading state */
  loading?: boolean;
  /** Get unique row ID */
  getRowId: (row: T) => string;
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** Row className (e.g. for cancelled/opacity) */
  rowClassName?: (row: T) => string;
  /** Empty state message */
  emptyMessage?: string;
  /** Empty state icon */
  emptyIcon?: ReactNode;

  // ── Pagination ──
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  recordsPerPage: number;
  onPageChange: (page: number) => void;
  onRecordsPerPageChange: (limit: number) => void;
  /** Preferred: combined handler for limit + page reset in one call (avoids
   *  stale closure issues when state is URL-based). When provided, used
   *  instead of onRecordsPerPageChange + onPageChange(1). */
  onLimitChange?: (limit: number, page: number) => void;
  loadTime?: number | null;
  /** Hide pagination entirely (e.g. small embedded tables). */
  hidePagination?: boolean;

  // ── Selection (optional) ──
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;

  // ── Mobile card custom render (optional — overrides auto card) ──
  mobileCardRender?: (row: T, index: number) => ReactNode;

  // ── Extra content in pagination footer ──
  paginationChildren?: ReactNode;

  // ── Sort (external/controlled) ──
  /** Active sort column key. */
  sortBy?: string;
  /** Active sort direction. */
  sortDir?: SortDir;
  /** Called when user clicks a sortable header. Toggles asc → desc → unsort. */
  onSort?: (key: string, dir: SortDir | null) => void;
}

// ── Component ──

export default function DataTable<T>({
  storageKey,
  columns,
  data,
  loading = false,
  getRowId,
  onRowClick,
  rowClassName,
  emptyMessage = 'ไม่พบข้อมูล',
  emptyIcon,
  currentPage,
  totalPages,
  totalRecords,
  recordsPerPage,
  onPageChange,
  onRecordsPerPageChange,
  onLimitChange,
  loadTime,
  hidePagination = false,
  selectedIds,
  onSelectionChange,
  mobileCardRender,
  paginationChildren,
  sortBy,
  sortDir,
  onSort,
}: DataTableProps<T>) {
  // ── Column toggle ──
  const colConfigs: ColumnConfig[] = columns.map(c => ({
    key: c.key,
    label: c.label,
    alwaysVisible: c.alwaysVisible,
    defaultVisible: c.defaultVisible,
  }));
  const { isCol, visibleColumns, toggleColumn, configs } = useColumnToggle(storageKey, colConfigs);

  // ── Column reorder (localStorage persist) ──
  // Same as widths: don't seed from localStorage during initial render —
  // server can't read it, and the order needs to match between SSR and client.
  const orderStorageKey = `dt-order:${storageKey}`;
  // Fingerprint = declared column keys in declared order. If the schema
  // changes (column added / removed / reordered in code), the fingerprint
  // changes → we reset user-saved order to the declared array order.
  // Within the same schema, user reorder is honored.
  const schemaFingerprint = columns.map(c => c.key).join(',');
  const [colOrder, setColOrder] = useState<string[]>(columns.map(c => c.key));
  const [orderHydrated, setOrderHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(orderStorageKey);
      const parsed = saved ? JSON.parse(saved) : null;
      // New format: { fp: string, order: string[] }. Legacy: bare array.
      if (parsed && !Array.isArray(parsed) && parsed.fp === schemaFingerprint && Array.isArray(parsed.order)) {
        const validSaved = (parsed.order as string[]).filter(k => columns.some(c => c.key === k));
        if (validSaved.length === columns.length) setColOrder(validSaved);
      }
      // Otherwise (legacy format OR fingerprint mismatch) → keep declared array order
    } catch { /* noop */ }
    setOrderHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderStorageKey, schemaFingerprint]);
  useEffect(() => {
    if (!orderHydrated) return;
    localStorage.setItem(orderStorageKey, JSON.stringify({ fp: schemaFingerprint, order: colOrder }));
  }, [colOrder, orderStorageKey, orderHydrated, schemaFingerprint]);

  // Apply saved order to incoming columns
  const orderedColumns = colOrder
    .map(k => columns.find(c => c.key === k))
    .filter((c): c is DataTableColumn<T> => !!c);

  // @dnd-kit setup — gives us the "FLIP" animation where adjacent columns
  // slide out of the way live while dragging, instead of a final snap.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setColOrder(prev => {
      const oldIdx = prev.indexOf(String(active.id));
      const newIdx = prev.indexOf(String(over.id));
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const visibleCols = orderedColumns.filter(c => isCol(c.key));
  const startIdx = (currentPage - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + data.length, totalRecords);

  // ── Column widths (localStorage persist) ──
  // IMPORTANT: do NOT seed from localStorage during initial render — server
  // doesn't have access to localStorage so it would mismatch on hydration.
  // We load in useEffect after mount instead.
  const widthStorageKey = `dt-widths:${storageKey}`;
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [widthsHydrated, setWidthsHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(widthStorageKey);
      if (saved) setColWidths(JSON.parse(saved));
    } catch { /* noop */ }
    setWidthsHydrated(true);
  }, [widthStorageKey]);
  useEffect(() => {
    if (!widthsHydrated) return; // skip the first render so we don't overwrite
    localStorage.setItem(widthStorageKey, JSON.stringify(colWidths));
  }, [colWidths, widthStorageKey, widthsHydrated]);

  // ── Resize drag state ──
  // Ref to the <thead><tr> so we can snapshot every <th>'s actual rendered
  // width when the user starts dragging.
  // @dnd-kit generates internal IDs (DndDescribedBy-N) that drift between SSR
  // and CSR. Render the DndContext + sortable headers only after mount so the
  // IDs are consistent — first paint shows plain <th>s without drag/resize,
  // then upgrades after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const headerRowRef = useRef<HTMLTableRowElement | null>(null);

  // (Removed) the post-mount snapshot useEffect. It captured offsetWidth at
  // mount, which was the BROWSER-STRETCHED width (due to old minWidth: 100%)
  // — leading to ridiculous defaults like 459px for a 110px column and
  // persisting them to localStorage. With explicit `width: totalWidth`, the
  // table now renders at the sum of declared widths exactly; no snapshot needed.
  /** Reset all column widths + order back to defaults (one-click recovery). */
  const resetLayout = () => {
    setColWidths({});
    setColOrder(columns.map(c => c.key));
    try {
      localStorage.removeItem(widthStorageKey);
      localStorage.removeItem(orderStorageKey);
    } catch { /* noop */ }
  };

  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const startResize = (key: string, startX: number, startWidth: number) => {
    // Guard against double-fire (mousedown + pointerdown both bubble to React
    // for the same physical click).
    if (dragRef.current) return;
    dragRef.current = { key, startX, startWidth };
    setDragKey(key);

    // First user resize: snapshot the current rendered px widths so subsequent
    // renders use fixed px (no more % distribution) and other columns don't
    // re-flow.
    if (Object.keys(colWidths).length === 0 && headerRowRef.current) {
      const ths = Array.from(headerRowRef.current.querySelectorAll('th[data-col-key]')) as HTMLElement[];
      const snapshot: Record<string, number> = {};
      for (const th of ths) {
        snapshot[th.dataset.colKey!] = th.offsetWidth;
      }
      // Make sure the dragged column's startWidth matches what we just captured.
      if (snapshot[key] != null) {
        dragRef.current = { key, startX, startWidth: snapshot[key] };
      }
      setColWidths(snapshot);
    }

    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // Capture key locally — setColWidths' updater may run later by which time
      // mouseup could have cleared dragRef.current → null deref crash.
      const { key: dragKey, startX, startWidth } = drag;
      const delta = e.clientX - startX;
      // Min 80px to keep the header text + sort/grip icons readable.
      const next = Math.max(80, startWidth + delta);
      setColWidths(w => ({ ...w, [dragKey]: next }));
    };
    const onUp = () => {
      dragRef.current = null;
      setDragKey(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  /**
   * Column width strategy:
   *   - No user resize yet → return PERCENTAGE (defaultWidth share of total).
   *     With width: 100% on table, percentages sum to 100% = container exactly.
   *     Columns proportionally fill the container, no empty spacer.
   *   - After user resizes any column → ALL columns switch to fixed px widths
   *     (snapshotted in startResize) so subsequent resizes only affect one
   *     column without cascading.
   */
  const totalDefaultWidth = visibleCols.reduce(
    (sum, col) => sum + (col.defaultWidth ?? 100),
    0,
  );
  const hasUserResized = Object.keys(colWidths).length > 0;
  const getColWidth = (col: DataTableColumn<T>): number | string | undefined => {
    if (colWidths[col.key] != null) return colWidths[col.key];
    if (hasUserResized) return col.defaultWidth; // unlikely; snapshot covers it
    if (col.defaultWidth == null) return undefined;
    return `${((col.defaultWidth ?? 100) / totalDefaultWidth) * 100}%`;
  };

  // ── Sort handlers ──
  const handleSortClick = (key: string) => {
    if (!onSort) return;
    if (sortBy !== key) onSort(key, 'asc');
    else if (sortDir === 'asc') onSort(key, 'desc');
    else onSort(key, null);
  };

  // ── Inline edit state ──
  const [editing, setEditing] = useState<{ rowId: string; key: string } | null>(null);
  const isEditing = (rowId: string, key: string) =>
    editing?.rowId === rowId && editing?.key === key;
  const startEdit = (rowId: string, key: string) => setEditing({ rowId, key });
  const stopEdit = useCallback(() => setEditing(null), []);

  // ── Selection helpers ──
  const hasSelection = !!selectedIds && !!onSelectionChange;
  const allSelected = hasSelection && data.length > 0 && data.every(r => selectedIds!.has(getRowId(r)));
  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) onSelectionChange(new Set());
    else onSelectionChange(new Set(data.map(r => getRowId(r))));
  };
  const toggleRow = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  };

  return (
    <>
      {/* Desktop Table — DndContext mounted on client only (see `mounted` above)
          to avoid hydration mismatch on @dnd-kit's accessibility IDs. */}
      {mounted ? (
      <DndContext
        sensors={dndSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      >
      {/*
       * Layout strategy for resizable tables:
       *   - table-layout: fixed                   → widths are honoured exactly
       *   - width: max-content (NOT w-full)       → table = sum of column widths
       *   - outer div: overflow-x-auto            → scrolls horizontally if sum > container
       * With w-full the browser auto-stretches columns to fill 100% of the
       * container, breaking single-column resize (every drag triggers a global
       * re-flow that appears to move neighbouring columns).
       */}
      {(() => {
        // minWidth = sum of declared/resized widths. When container is wider
        // than sum → table stretches to 100% (last col absorbs slack). When
        // container is narrower → table holds at sum px and overflow-x-auto
        // on the outer div produces a horizontal scrollbar.
        const minTableWidth = visibleCols.reduce((sum, col) => {
          const w = colWidths[col.key];
          return sum + (typeof w === 'number' ? w : (col.defaultWidth ?? 100));
        }, 0) + (hasSelection ? 40 : 0);
        return (
      <div className="hidden md:block overflow-x-auto">
        <div className="data-table-wrap">
          <table
            /*
             * Width strategy:
             *   - Table is always width: 100% (fills container).
             *   - minWidth = sum of column widths → enables horizontal scroll
             *     when container is narrower than declared total.
             *   - The LAST visible column has NO declared width → it absorbs
             *     remaining space and stays pinned to the right edge when
             *     container > sum.
             */
            className="w-full"
            style={{ minWidth: minTableWidth }}
          >
            <thead className="data-thead">
              <tr ref={headerRowRef}>
                <SortableContext items={visibleCols.map(c => c.key)} strategy={horizontalListSortingStrategy}>
                  {hasSelection && (
                    <th className="data-th w-10">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll}
                        className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-primary focus:ring-primary accent-primary" />
                    </th>
                  )}
                  {visibleCols.map((col, idx) => {
                    const isLast = idx === visibleCols.length - 1;
                    return (
                      <SortableHeader
                        key={col.key}
                        col={col}
                        // Last column: no declared width → absorbs remaining
                        // space, stays pinned to the right edge. Resizing it
                        // would conflict with that behaviour, so disable resize
                        // on the last column entirely.
                        width={isLast ? undefined : getColWidth(col)}
                        resizable={col.resizable && !isLast}
                        isSorted={sortBy === col.key}
                        sortDir={sortDir}
                        onSortClick={onSort ? () => handleSortClick(col.key) : undefined}
                        onResize={(startX, startWidth) => startResize(col.key, startX, startWidth)}
                        isResizeActive={dragKey === col.key}
                      />
                    );
                  })}
                  {/* No spacer needed — initial render uses % widths that sum
                      to exactly 100% of the container. After user resizes,
                      columns use snapshotted px widths and the table can be
                      narrower/wider than container (overflow-x handles it). */}
                </SortableContext>
              </tr>
            </thead>
            <tbody className="data-tbody">
              {loading ? (
                <tr><td colSpan={visibleCols.length + (hasSelection ? 1 : 0)} className="py-16 text-center">
                  <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
                </td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={visibleCols.length + (hasSelection ? 1 : 0)} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    {emptyIcon || <Package className="w-10 h-10 text-gray-300 dark:text-slate-600" />}
                    <p className="text-gray-500 dark:text-slate-400 data-text">{emptyMessage}</p>
                  </div>
                </td></tr>
              ) : data.map((row, idx) => {
                const rowId = getRowId(row);
                return (
                  <tr
                    key={rowId}
                    className={`data-tr ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row) || ''}`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {hasSelection && (
                      <td className="data-td w-10" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds!.has(rowId)} onChange={() => toggleRow(rowId)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-primary focus:ring-primary accent-primary" />
                      </td>
                    )}
                    {visibleCols.map(col => {
                      const editable = !!col.edit;
                      const inEdit = editable && isEditing(rowId, col.key);
                      return (
                        <td
                          key={col.key}
                          className={`data-td ${col.cellClassName || ''} ${editable && !inEdit ? 'cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/10' : ''}`}
                          onClick={
                            col.stopPropagation
                              ? (e) => e.stopPropagation()
                              : editable
                                ? (e) => { e.stopPropagation(); if (!inEdit) startEdit(rowId, col.key); }
                                : undefined
                          }
                        >
                          {inEdit && col.edit
                            ? <EditCell row={row} config={col.edit} onDone={stopEdit} />
                            : col.render(row, idx)}
                        </td>
                      );
                    })}
                    {/* No spacer cell — % header widths handle distribution */}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!hidePagination && (
          <Pagination
            currentPage={currentPage} totalPages={totalPages} totalRecords={totalRecords}
            startIdx={startIdx} endIdx={endIdx} recordsPerPage={recordsPerPage}
            setRecordsPerPage={onRecordsPerPageChange}
            setPage={onPageChange}
            onLimitChange={onLimitChange}
            loadTime={loadTime}
          >
            {paginationChildren}
            <button
              type="button"
              onClick={resetLayout}
              title="Reset column widths + order to defaults"
              aria-label="Reset columns"
              className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <ColumnSettingsDropdown configs={configs} visible={visibleColumns} toggle={toggleColumn} dropUp />
          </Pagination>
        )}
      </div>
      );
      })()}
      </DndContext>
      ) : (
        /* SSR / pre-mount fallback — plain table without DndContext.
           Hydration matches because no @dnd-kit-generated IDs exist yet.
           User briefly sees a non-interactive header (~1 paint) then it upgrades. */
        <div className="hidden md:block">
          <div className="data-table-wrap">
            <table className="w-full"><thead className="data-thead"><tr>
              {visibleCols.map(col => (
                <th key={col.key} className={`data-th ${col.headerClassName || ''}`}>{col.label}</th>
              ))}
            </tr></thead></table>
          </div>
        </div>
      )}

      {/* Mobile Cards */}
      <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16">
            {emptyIcon || <Package className="w-10 h-10 text-gray-300 dark:text-slate-600" />}
            <p className="text-gray-500 dark:text-slate-400">{emptyMessage}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {data.map((row, idx) => (
              <div
                key={getRowId(row)}
                className={`p-4 ${onRowClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50' : ''} ${rowClassName?.(row) || ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {mobileCardRender ? mobileCardRender(row, idx) : (
                  <div className="space-y-1">
                    {visibleCols.filter(c => !c.hideMobile).map(col => (
                      <div key={col.key} className="flex items-start justify-between gap-2">
                        <span className="text-xs text-gray-500 dark:text-slate-400 flex-shrink-0">{col.label}</span>
                        <span className="text-sm text-right">{col.mobileRender ? col.mobileRender(row, idx) : col.render(row, idx)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {!hidePagination && (
          <Pagination
            currentPage={currentPage} totalPages={totalPages} totalRecords={totalRecords}
            startIdx={startIdx} endIdx={endIdx} recordsPerPage={recordsPerPage}
            setRecordsPerPage={onRecordsPerPageChange}
            setPage={onPageChange}
            onLimitChange={onLimitChange}
            loadTime={loadTime}
          >
            <ColumnSettingsDropdown configs={configs} visible={visibleColumns} toggle={toggleColumn} dropUp />
          </Pagination>
        )}
      </div>
    </>
  );
}

/* ============================================================
 * SortableHeader — one <th> wrapped with @dnd-kit/sortable.
 * Renders: grip handle (if reorderable) + label + sort arrow (right side)
 *          + resize handle (if resizable).
 *
 * Only the GRIP triggers a drag; clicking the rest of the cell still works
 * for sort (we apply listeners to the grip only).
 * ============================================================ */
function SortableHeader<T>({
  col, width, isSorted, sortDir, onSortClick, onResize, isResizeActive, resizable: resizableOverride,
}: {
  col: DataTableColumn<T>;
  /** number = px (after user resize); string = '%' (initial proportional layout). */
  width?: number | string;
  isSorted: boolean;
  sortDir?: SortDir;
  onSortClick?: () => void;
  onResize: (startX: number, startWidth: number) => void;
  isResizeActive: boolean;
  /** Override col.resizable from the parent (e.g. last column disables resize). */
  resizable?: boolean;
}) {
  const resizable = resizableOverride ?? col.resizable;
  const sortable = useSortable({ id: col.key, disabled: !col.reorderable });
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = sortable;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    width,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <th
      ref={setNodeRef}
      data-col-key={col.key}
      style={style}
      className={`data-th relative ${col.headerClassName || ''} ${col.sortable && onSortClick ? 'cursor-pointer select-none' : ''}`}
      onClick={col.sortable && onSortClick ? onSortClick : undefined}
      {...attributes}
    >
      <div className="flex items-center gap-1">
        {col.reorderable && (
          // Grip is the ONLY drag activator — keeps the rest of the cell clickable for sort.
          <button
            type="button"
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 -ml-1 p-0.5 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing"
            title="ลากเพื่อสลับ column"
            aria-label={`Reorder ${col.label}`}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        {/* No `truncate` — we want the label to stay intact and force the cell
            to be at least as wide as its content (see .data-th min-width). */}
        <span className="whitespace-nowrap">{col.label}</span>
        {col.sortable && onSortClick && (
          // Sort indicator pushed to the right edge of the cell.
          <span className="ml-auto flex-shrink-0 pl-2">
            {isSorted
              ? sortDir === 'asc'
                ? <ArrowUp className="w-3 h-3 text-primary" />
                : <ArrowDown className="w-3 h-3 text-primary" />
              : <ArrowUpDown className="w-3 h-3 text-gray-300 dark:text-slate-600" />}
          </span>
        )}
      </div>
      {resizable && (
        <span
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const th = e.currentTarget.parentElement as HTMLElement;
            onResize(e.clientX, th.offsetWidth);
          }}
          onClick={(e) => e.stopPropagation()}
          className={`dt-resize-handle ${isResizeActive ? 'dt-resize-handle--active' : ''}`}
          aria-label={`Resize ${col.label}`}
          title="ลากเพื่อปรับความกว้าง"
        >
          <span className="dt-resize-handle-line" />
        </span>
      )}
    </th>
  );
}

/* ============================================================
 * EditCell — inline editor inside a <td>. Renders the appropriate input
 * based on edit.type, handles Enter/Esc, validates, calls onSave.
 * ============================================================ */
function EditCell<T>({ row, config, onDone }: { row: T; config: EditConfig<T>; onDone: () => void }) {
  const initial = config.getValue(row);
  const [value, setValue] = useState<string>(initial == null ? '' : String(initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (inputRef.current && 'select' in inputRef.current) inputRef.current.select();
  }, []);

  const commit = async () => {
    if (saving) return;
    const err = config.validate?.(value) || null;
    if (err) { setError(err); return; }
    if (value === (initial == null ? '' : String(initial))) {
      onDone();
      return;
    }
    setSaving(true);
    try {
      await config.onSave(row, value);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  };

  const cancel = () => onDone();

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };

  const inputClass = `w-full px-2 py-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
    error ? 'border-red-400' : 'border-gray-300 dark:border-slate-600'
  } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`;

  return (
    <div className="flex items-center gap-1">
      {config.type === 'select' ? (
        <select
          ref={el => { inputRef.current = el; }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          disabled={saving}
          className={inputClass}
        >
          {(config.options || []).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          ref={el => { inputRef.current = el; }}
          type={config.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          disabled={saving}
          className={inputClass}
        />
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); void commit(); }}
        disabled={saving}
        className="flex-shrink-0 p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded"
        aria-label="บันทึก"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); cancel(); }}
        disabled={saving}
        className="flex-shrink-0 p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
        aria-label="ยกเลิก"
      >
        <X className="w-4 h-4" />
      </button>
      {error && (
        <span className="absolute mt-8 text-xs text-red-600 dark:text-red-400 bg-white dark:bg-slate-800 px-2 py-1 rounded shadow-sm border border-red-200">
          {error}
        </span>
      )}
    </div>
  );
}
