import { apiFetch } from '@/lib/api-client';
import type { Order } from '@/app/orders/components/types';

/**
 * Fire-and-forget: mark orders as printed.
 * Never blocks the PDF preview — errors are silently logged.
 */
export function markOrdersPrinted(
  orderIds: string[],
  printType: 'label' | 'packing' | 'invoice',
) {
  if (!orderIds.length) return;

  apiFetch('/api/orders/mark-printed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_ids: orderIds, print_type: printType }),
  }).catch((err) => {
    console.error('[print-tracking] Failed to mark as printed:', err);
  });
}

/** Column name for each print type */
const PRINT_COL = {
  label: 'printed_label_at',
  packing: 'printed_packing_at',
  invoice: 'printed_invoice_at',
} as const;

/**
 * Optimistically update local orders state after printing.
 * Call this right after markOrdersPrinted to reflect the change instantly.
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
