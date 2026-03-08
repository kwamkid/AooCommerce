import { apiFetch } from '@/lib/api-client';
import type { Order } from '@/app/orders/components/types';

// ===== Entity type definitions =====
export type PrintEntityType = 'order' | 'replenishment' | 'consignment_report' | 'statement';

/** Valid print types per entity */
export const ENTITY_PRINT_TYPES: Record<PrintEntityType, readonly string[]> = {
  order: ['label', 'packing', 'invoice'],
  replenishment: ['packing', 'dn', 'label'],
  consignment_report: ['invoice', 'statement'],
  statement: ['statement'],
};

/** DB table name per entity */
export const ENTITY_TABLE: Record<PrintEntityType, string> = {
  order: 'orders',
  replenishment: 'replenishments',
  consignment_report: 'consignment_reports',
  statement: 'statements',
};

// ===== Generic mark-printed (fire-and-forget) =====

/**
 * Fire-and-forget: mark entities as printed in DB.
 * Never blocks the PDF preview — errors are silently logged.
 */
export function markPrinted(
  entityType: PrintEntityType,
  entityIds: string[],
  printType: string,
) {
  if (!entityIds.length) return;

  apiFetch('/api/mark-printed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_type: entityType, entity_ids: entityIds, print_type: printType }),
  }).catch((err) => {
    console.error('[print-tracking] Failed to mark as printed:', err);
  });
}

// ===== Generic optimistic local state update =====

/**
 * Optimistically update local state after printing.
 * Works with any entity that has `printed_<type>_at` fields.
 */
export function updateLocalPrintState<T extends { id: string }>(
  setState: React.Dispatch<React.SetStateAction<T[]>>,
  entityIds: string[],
  printType: string,
) {
  if (!entityIds.length) return;
  const col = `printed_${printType}_at`;
  const now = new Date().toISOString();
  const idSet = new Set(entityIds);

  setState((prev) =>
    prev.map((item) =>
      idSet.has(item.id) ? { ...item, [col]: now } : item,
    ),
  );
}

// ===== Legacy order-specific functions (backward compat) =====

/**
 * @deprecated Use markPrinted('order', ...) instead
 */
export function markOrdersPrinted(
  orderIds: string[],
  printType: 'label' | 'packing' | 'invoice',
) {
  markPrinted('order', orderIds, printType);
}

/** Column name for each print type */
const PRINT_COL = {
  label: 'printed_label_at',
  packing: 'printed_packing_at',
  invoice: 'printed_invoice_at',
} as const;

/**
 * @deprecated Use updateLocalPrintState() instead
 */
export function updateLocalPrintStatus(
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>,
  orderIds: string[],
  printType: 'label' | 'packing' | 'invoice',
) {
  if (!orderIds.length) return;
  const col = PRINT_COL[printType];
  const now = new Date().toISOString();
  const idSet = new Set(orderIds);

  setOrders((prev) =>
    prev.map((o) =>
      idSet.has(o.id) ? { ...o, [col]: now } : o,
    ),
  );
}
