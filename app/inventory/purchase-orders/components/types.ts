// ─── Data Types ───────────────────────────────────
export interface POItem {
  id: string;
  variation_id: string;
  quantity: number;
  received_quantity: number;
  unit_cost: number;
  notes: string | null;
  variation: {
    id: string;
    variation_label: string;
    sku: string | null;
    barcode: string | null;
    product: { id: string; code: string; name: string; image: string | null };
  };
}

export interface ReceiveItemRef {
  id: string;
  variation_id: string;
  quantity: number;
  variation: {
    id: string;
    variation_label: string;
    sku: string | null;
    product: { id: string; code: string; name: string; image: string | null };
  };
}

export interface ReceiveRef {
  id: string;
  receive_number: string;
  status: string;
  created_at: string;
  notes: string | null;
  items?: ReceiveItemRef[];
}

export interface PurchaseOrderDetail {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  notes: string | null;
  total_amount: number;
  created_at: string;
  share_token: string | null;
  supplier: { id: string; name: string; supplier_type: string; contact_name: string | null; phone: string | null; email: string | null } | null;
  warehouse: { id: string; name: string; code: string | null } | null;
  items: POItem[];
  receives: ReceiveRef[];
  created_by_user: { id: string; name: string } | null;
}

export interface EditItem {
  variation_id: string;
  product_id: string;
  code: string;
  name: string;
  image?: string | null;
  variation_label?: string;
  sku?: string;
  quantity: number;
  unit_cost: number;
}

export interface Supplier { id: string; name: string; supplier_type: string }
export interface WarehouseItem { id: string; name: string; code: string | null; is_default: boolean }

// ─── Helpers ─────────────────────────────────────
export function getStatusInfo(status: string) {
  switch (status) {
    case 'draft': return { label: 'ร่าง', color: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300', iconName: 'ClipboardList' as const };
    case 'sent': return { label: 'แจ้ง Sup แล้ว', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', iconName: 'Send' as const };
    case 'partial_received': return { label: 'รับบางส่วน', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', iconName: 'Clock' as const };
    case 'received': return { label: 'รับครบ', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', iconName: 'CheckCircle2' as const };
    case 'received_mismatch': return { label: 'รับไม่ตรง', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', iconName: 'AlertTriangle' as const };
    case 'closed': return { label: 'ปิด', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400', iconName: 'CheckCircle2' as const };
    case 'cancelled': return { label: 'ยกเลิก', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', iconName: 'XCircle' as const };
    default: return { label: status, color: 'bg-gray-100 text-gray-600', iconName: null };
  }
}

export function itemStatusBadge(qty: number, received: number) {
  if (received === qty) return { label: 'ครบ', color: 'text-green-600 dark:text-green-400' };
  if (received > qty) return { label: `เกิน +${received - qty}`, color: 'text-orange-600 dark:text-orange-400' };
  if (received > 0) return { label: `${received}/${qty}`, color: 'text-amber-600 dark:text-amber-400' };
  return { label: 'ยังไม่รับ', color: 'text-gray-400 dark:text-slate-500' };
}

export const formatDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
export const formatCurrency = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
