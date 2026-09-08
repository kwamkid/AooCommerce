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
 * เก็บเป็น `{ fp, visible }` โดย fp = ชื่อคอลัมน์ทั้งหมดตามลำดับที่ประกาศ (เหมือน dt-order ของ
 * DataTable) — schema เปลี่ยน (เพิ่ม/ลบคอลัมน์ในโค้ด) = fp ไม่ตรง → กลับไปค่าเริ่มต้น
 * ไม่งั้นคอลัมน์ใหม่จะ **ซ่อนอยู่เงียบ ๆ** สำหรับทุกคนที่เคยกดเปิด/ปิดคอลัมน์บนหน้านั้น
 * (เจอตอนเพิ่มคอลัมน์ "สำเร็จ/ตอบกลับ" ในหน้าบรอดแคสต์ 2026-09-09) · ค่าเก่าแบบ array เปล่า
 * ถือว่า fp ไม่ตรง (รีเซ็ตครั้งเดียว)
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
  const fingerprint = columns.map(c => c.key).join(',');

  const [visibleColumns, setVisibleColumns] = useState<Set<T>>(() => {
    const defaults = () => new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key));
    if (typeof window === 'undefined') return defaults();
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as { fp?: string; visible?: T[] } | T[];
        if (!Array.isArray(parsed) && parsed.fp === fingerprint && Array.isArray(parsed.visible)) {
          // Always include alwaysVisible columns
          const always = columns.filter(c => c.alwaysVisible).map(c => c.key);
          return new Set([...parsed.visible, ...always]);
        }
      }
    } catch { /* ignore */ }
    return defaults();
  });

  const toggleColumn = useCallback((key: T) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(storageKey, JSON.stringify({ fp: fingerprint, visible: [...next] }));
      return next;
    });
  }, [storageKey, fingerprint]);

  const isCol = useCallback((key: T) => visibleColumns.has(key), [visibleColumns]);

  return {
    visibleColumns,
    toggleColumn,
    isCol,
    configs: columns,
  };
}
