'use client';

import { type ReactNode } from 'react';
import { Loader2, Package } from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';
import { useColumnToggle, type ColumnConfig } from '@/lib/useColumnToggle';

// ── Types ──

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
}

export interface DataTableProps<T> {
  /** Unique key for localStorage column toggle */
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

  // ── Selection (optional) ──
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;

  // ── Mobile card custom render (optional — overrides auto card) ──
  mobileCardRender?: (row: T, index: number) => ReactNode;

  // ── Extra content in pagination footer ──
  paginationChildren?: ReactNode;
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
  selectedIds,
  onSelectionChange,
  mobileCardRender,
  paginationChildren,
}: DataTableProps<T>) {
  // Column toggle
  const colConfigs: ColumnConfig[] = columns.map(c => ({
    key: c.key,
    label: c.label,
    alwaysVisible: c.alwaysVisible,
    defaultVisible: c.defaultVisible,
  }));
  const { isCol, visibleColumns, toggleColumn, configs } = useColumnToggle(storageKey, colConfigs);

  const visibleCols = columns.filter(c => isCol(c.key));
  const startIdx = (currentPage - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + data.length, totalRecords);

  // Selection helpers
  const hasSelection = !!selectedIds && !!onSelectionChange;
  const allSelected = hasSelection && data.length > 0 && data.every(r => selectedIds!.has(getRowId(r)));
  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(r => getRowId(r))));
    }
  };
  const toggleRow = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  };

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block">
        <div className="data-table-wrap">
          <table className="w-full">
            <thead className="data-thead">
              <tr>
                {hasSelection && (
                  <th className="data-th w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-primary focus:ring-primary accent-primary" />
                  </th>
                )}
                {visibleCols.map(col => (
                  <th key={col.key} className={`data-th ${col.headerClassName || ''}`}>{col.label}</th>
                ))}
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
                    {visibleCols.map(col => (
                      <td
                        key={col.key}
                        className={`data-td ${col.cellClassName || ''}`}
                        onClick={col.stopPropagation ? (e) => e.stopPropagation() : undefined}
                      >
                        {col.render(row, idx)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage} totalPages={totalPages} totalRecords={totalRecords}
          startIdx={startIdx} endIdx={endIdx} recordsPerPage={recordsPerPage}
          setRecordsPerPage={onRecordsPerPageChange}
          setPage={onPageChange}
          onLimitChange={onLimitChange}
          loadTime={loadTime}
        >
          {paginationChildren}
          <ColumnSettingsDropdown configs={configs} visible={visibleColumns} toggle={toggleColumn} dropUp />
        </Pagination>
      </div>

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
                  /* Auto mobile card: render visible columns as label:value pairs */
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
      </div>
    </>
  );
}
