import { useState, useCallback } from 'react';

export interface ColumnConfig<T extends string = string> {
  key: T;
  label: string;
  defaultVisible?: boolean;
  alwaysVisible?: boolean;
}

/**
 * Hook for column toggle (show/hide columns in list pages).
 * Persists to localStorage with a unique storage key per page.
 *
 * Usage:
 * ```tsx
 * const COLUMNS = [
 *   { key: 'name', label: 'ชื่อ', alwaysVisible: true },
 *   { key: 'phone', label: 'เบอร์โทร', defaultVisible: true },
 *   { key: 'address', label: 'ที่อยู่', defaultVisible: false },
 * ];
 * const { isCol, visibleColumns, toggleColumn, configs } = useColumnToggle('my-page', COLUMNS);
 *
 * // In table header:
 * {isCol('phone') && <th>เบอร์โทร</th>}
 *
 * // In Pagination children:
 * <ColumnSettingsDropdown configs={configs} visible={visibleColumns} toggle={toggleColumn} dropUp />
 * ```
 */
export function useColumnToggle<T extends string>(
  storageKey: string,
  columns: ColumnConfig<T>[],
) {
  const [visibleColumns, setVisibleColumns] = useState<Set<T>>(() => {
    if (typeof window === 'undefined') {
      return new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key));
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as T[];
        // Always include alwaysVisible columns
        const always = columns.filter(c => c.alwaysVisible).map(c => c.key);
        return new Set([...parsed, ...always]);
      }
    } catch { /* ignore */ }
    return new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key));
  });

  const toggleColumn = useCallback((key: T) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  }, [storageKey]);

  const isCol = useCallback((key: T) => visibleColumns.has(key), [visibleColumns]);

  return {
    visibleColumns,
    toggleColumn,
    isCol,
    configs: columns,
  };
}
