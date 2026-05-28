/**
 * Single source of truth for the active/inactive status column used across
 * all bulk Excel templates (export/import). Use the LABEL constants when
 * generating templates and parseStatusValue() when reading them.
 *
 * Display vocabulary: "เปิด" / "ปิด" (matches the in-app product list toggle).
 * Parsers also accept legacy "ใช้งาน" / "ไม่ใช้งาน" + English aliases for
 * backward compatibility with files exported before this standardization.
 */

export const STATUS_LABEL_ACTIVE = 'เปิด';
export const STATUS_LABEL_INACTIVE = 'ปิด';
export const STATUS_COLUMN_HEADER = 'สถานะ';
export const STATUS_INSTRUCTION = `(${STATUS_LABEL_ACTIVE} / ${STATUS_LABEL_INACTIVE})`;

const ACTIVE_VALUES = new Set(['เปิด', 'ใช้งาน', 'active', 'true', '1', 'yes', 'y']);
const INACTIVE_VALUES = new Set(['ปิด', 'ไม่ใช้งาน', 'inactive', 'false', '0', 'no', 'n']);

/** Convert boolean → Thai label for Excel output. */
export function statusBoolToLabel(active: boolean): string {
  return active ? STATUS_LABEL_ACTIVE : STATUS_LABEL_INACTIVE;
}

/**
 * Convert a raw Excel cell value → boolean | null.
 * Returns null on empty / unrecognized — caller decides default behavior
 * (typically: null = "do not change" for edit / null = "active" for create).
 */
export function parseStatusValue(raw: string | undefined | null): boolean | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  if (ACTIVE_VALUES.has(v)) return true;
  if (INACTIVE_VALUES.has(v)) return false;
  return null;
}
