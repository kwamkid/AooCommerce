// Shared types for inventory components

export interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
}

export type TabKey = 'stock' | 'history';

// ===== Stock Types =====
export interface InventoryItem {
  id: string;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_code: string;
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  product_image: string | null;
  variation_label: string;
  sku: string;
  barcode: string;
  attributes: Record<string, string> | null;
  default_price: number;
  quantity: number;
  reserved_quantity: number;
  available: number;
  min_stock: number;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  updated_at: string;
}

export type StockColumnKey = 'image' | 'product' | 'sku' | 'quantity' | 'reserved' | 'available' | 'min' | 'status' | 'actions';

export interface ColumnConfig<T extends string> {
  key: T;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
}

export const STOCK_COLUMN_CONFIGS: ColumnConfig<StockColumnKey>[] = [
  { key: 'image', label: 'รูป', defaultVisible: true },
  { key: 'product', label: 'ชื่อสินค้า', defaultVisible: true, alwaysVisible: true },
  { key: 'sku', label: 'SKU', defaultVisible: false },
  { key: 'quantity', label: 'จำนวน', defaultVisible: true },
  { key: 'reserved', label: 'จอง', defaultVisible: true },
  { key: 'available', label: 'พร้อมขาย', defaultVisible: true },
  { key: 'min', label: 'Min', defaultVisible: false },
  { key: 'status', label: 'สถานะ', defaultVisible: true },
  { key: 'actions', label: 'ปรับ', defaultVisible: true, alwaysVisible: true },
];

export const STOCK_COLUMNS_STORAGE_KEY = 'inventory-stock-visible-columns';

// ===== History Types =====
export type HistoryColumnKey = 'date' | 'type' | 'product' | 'qty' | 'balance' | 'warehouse' | 'reference' | 'user';

export const HISTORY_COLUMN_CONFIGS: ColumnConfig<HistoryColumnKey>[] = [
  { key: 'date', label: 'วันที่', defaultVisible: true, alwaysVisible: true },
  { key: 'type', label: 'ประเภท', defaultVisible: true },
  { key: 'product', label: 'สินค้า', defaultVisible: true },
  { key: 'qty', label: 'จำนวน', defaultVisible: true },
  { key: 'balance', label: 'คงเหลือ', defaultVisible: true },
  { key: 'warehouse', label: 'คลัง', defaultVisible: true },
  { key: 'reference', label: 'อ้างอิง', defaultVisible: true },
  { key: 'user', label: 'ผู้ทำรายการ', defaultVisible: true },
];

export const HISTORY_COLUMNS_STORAGE_KEY = 'inventory-history-visible-columns';

export type TransactionType = 'in' | 'out' | 'transfer_in' | 'transfer_out' | 'reserve' | 'unreserve' | 'adjust' | 'return';

export interface Transaction {
  id: string;
  type: TransactionType;
  quantity: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  warehouse_name: string;
  warehouse_code: string;
  product_code: string;
  product_name: string;
  sku: string | null;
  variation_label: string | null;
  created_by_name: string | null;
}

export const TYPE_CONFIG: Record<TransactionType, { label: string; bgClass: string; textClass: string }> = {
  in: { label: 'รับเข้า', bgClass: 'bg-green-100 dark:bg-green-900/30', textClass: 'text-green-700 dark:text-green-400' },
  out: { label: 'เบิกออก', bgClass: 'bg-red-100 dark:bg-red-900/30', textClass: 'text-red-700 dark:text-red-400' },
  transfer_in: { label: 'โอนเข้า', bgClass: 'bg-blue-100 dark:bg-blue-900/30', textClass: 'text-blue-700 dark:text-blue-400' },
  transfer_out: { label: 'โอนออก', bgClass: 'bg-blue-100 dark:bg-blue-900/30', textClass: 'text-blue-700 dark:text-blue-400' },
  reserve: { label: 'จอง', bgClass: 'bg-yellow-100 dark:bg-yellow-900/30', textClass: 'text-yellow-700 dark:text-yellow-400' },
  unreserve: { label: 'ปล่อยจอง', bgClass: 'bg-gray-100 dark:bg-gray-700/30', textClass: 'text-gray-700 dark:text-gray-400' },
  adjust: { label: 'ปรับปรุง', bgClass: 'bg-purple-100 dark:bg-purple-900/30', textClass: 'text-purple-700 dark:text-purple-400' },
  return: { label: 'คืน', bgClass: 'bg-teal-100 dark:bg-teal-900/30', textClass: 'text-teal-700 dark:text-teal-400' },
};

export const POSITIVE_TYPES: TransactionType[] = ['in', 'transfer_in', 'return', 'unreserve'];
export const NEGATIVE_TYPES: TransactionType[] = ['out', 'transfer_out', 'reserve'];

// ===== Helpers =====
export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateValue(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ===== Generic product display helpers =====
// These work with any data shape — flat (StockTab, HistoryTab, create pages)
// or nested (detail pages like issues/[id], receives/[id], transfers/[id])

interface ProductDisplayFields {
  product_name?: string;
  product_code?: string;
  variation_label?: string | null;
  sku?: string | null;
  barcode?: string | null;
  attributes?: Record<string, string> | null;
}

/** Clean variation label — skip barcode, product code, pure digits */
export function cleanVariationLabel(f: ProductDisplayFields): string {
  if (f.attributes && Object.keys(f.attributes).length > 0) {
    const attrParts: string[] = [];
    Object.values(f.attributes).forEach(v => { if (v?.trim()) attrParts.push(v.trim()); });
    if (attrParts.length > 0) return attrParts.join(' / ');
  }
  const raw = f.variation_label || '';
  if (!raw || raw === f.product_code || raw === f.barcode || raw === f.sku || /^\d+$/.test(raw)) return '';
  return raw;
}

/** Product name + variation label (if meaningful) */
export function productDisplayName(f: ProductDisplayFields): string {
  const varLabel = cleanVariationLabel(f);
  const name = f.product_name || '-';
  if (varLabel) return `${name} - ${varLabel}`;
  return name;
}

/** Subtitle: product_code | SKU: xxx (de-duped) */
export function productSubtitle(f: ProductDisplayFields): string {
  const parts: string[] = [];
  if (f.product_code) parts.push(f.product_code);
  if (f.sku && f.sku !== f.product_code && f.sku !== f.barcode) parts.push(`SKU: ${f.sku}`);
  return parts.join(' | ');
}

/** Flatten nested variation item (detail pages) to ProductDisplayFields */
export function flattenVariationItem(item: {
  variation?: {
    variation_label?: string | null;
    sku?: string | null;
    barcode?: string | null;
    attributes?: Record<string, string> | null;
    product?: { code?: string; name?: string };
  } | null;
}): ProductDisplayFields {
  return {
    product_name: item.variation?.product?.name || '-',
    product_code: item.variation?.product?.code || '',
    variation_label: item.variation?.variation_label,
    sku: item.variation?.sku,
    barcode: item.variation?.barcode,
    attributes: item.variation?.attributes,
  };
}

// Legacy aliases for existing imports
export const getVariationLabel = (item: InventoryItem) => cleanVariationLabel(item);
export const getProductDisplayName = (item: InventoryItem) => productDisplayName(item);
export const getProductSubtitle = (item: { product_code: string; sku?: string | null; barcode?: string | null }) => productSubtitle(item);
