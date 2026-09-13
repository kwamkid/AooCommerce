// Shared types for inventory components

import {
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Bookmark, BookmarkX,
  RotateCcw, Settings2, type LucideIcon,
} from 'lucide-react';
import type { BadgeTone } from '@/components/ui/Badge';

export interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
  warehouse_type?: 'internal' | 'consignment';
}

export type TabKey = 'stock' | 'movements';

// ===== Stock Types =====
export interface ConsignBreakdownItem {
  customer_id: string;
  customer_name: string;
  qty: number;
}

export interface InTransitBreakdownItem {
  customer_id: string;
  customer_name: string;
  qty: number;
}

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
  // Consignment stock (optional — only present if consignment feature enabled)
  consign_qty?: number;
  consign_breakdown?: ConsignBreakdownItem[];
  // In-transit stock (optional — replenishments being shipped)
  in_transit_quantity?: number;
  in_transit_breakdown?: InTransitBreakdownItem[];
}

// ===== Stock list (RPC `get_inventory_list` ผ่าน `/api/inventory?view=list`) =====
// 1 แถว = 1 ตัวเลือกสินค้า รวมยอดของคลังที่กรองไว้ (สินค้าชุดถูกตัดออกที่ RPC แล้ว)

export type StockStatus = 'ok' | 'near_low' | 'low' | 'out' | 'negative' | 'none';

export interface StockStatusCounts {
  all: number;
  /** ทุกสถานะยกเว้น `none` — ค่าเริ่มต้นของหน้า */
  stocked: number;
  ok: number;
  near_low: number;
  low: number;
  out: number;
  negative: number;
  none: number;
}

/** ยอดของตัวเลือกนี้ในคลังหนึ่ง — มาครบทุกคลังที่มีของ ไม่ถูกหั่นตามตัวกรอง */
export interface StockWarehouseRow {
  warehouse_id: string;
  name: string;
  type: 'internal' | 'consignment';
  customer_id: string | null;
  customer_name: string | null;
  quantity: number;
  reserved: number;
  available: number;
  in_transit: number;
}

/** ของที่กำลังส่งไปตัวแทน แยกตามตัวแทน */
export interface StockTransitRow {
  customer_id: string;
  customer_name: string;
  qty: number;
}

export interface StockRow {
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variation_label: string;
  /** สินค้าปกติ (ตัวเลือกเดียว) — ป้ายตัวเลือกไม่ต้องแสดง */
  is_simple: boolean;
  sku: string;
  barcode: string;
  attributes: Record<string, string> | null;
  default_price: number;
  /** รูปของตัวเลือก → (เฉพาะสินค้าปกติ) รูปสินค้า → null — ห้าม fallback เพิ่มเอง */
  image_url: string | null;
  min_stock: number;
  quantity: number;
  reserved: number;
  available: number;
  in_transit: number;
  consign_qty: number;
  status: StockStatus;
  updated_at: string | null;
  by_warehouse: StockWarehouseRow[];
  in_transit_breakdown: StockTransitRow[];
}

// ===== Movements (แท็บ "ความเคลื่อนไหว" — RPC `get_inventory_transactions`) =====
// 1 แถว = 1 รายการใน `inventory_transactions` พร้อมชื่อสินค้า/รูป/คลัง/ผู้ทำ ที่ RPC join มาให้แล้ว

export type TransactionType = 'in' | 'out' | 'transfer_in' | 'transfer_out' | 'reserve' | 'unreserve' | 'adjust' | 'return';

export interface MovementRow {
  id: string;
  type: TransactionType;
  quantity: number;
  /** ยอดคงเหลือ **ของคลังนี้** หลังรายการ — ไม่ใช่ยอดรวมทุกคลัง */
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  warehouse_id: string | null;
  warehouse_name: string;
  warehouse_type: 'internal' | 'consignment' | null;
  variation_id: string | null;
  product_id: string | null;
  product_code: string;
  product_name: string;
  /** สินค้าปกติ (ตัวเลือกเดียว) — ป้ายตัวเลือกไม่ต้องแสดง */
  is_simple: boolean;
  variation_label: string;
  attributes: Record<string, string> | null;
  sku: string;
  /** รูปตัวเลือก → (เฉพาะสินค้าปกติ) รูปสินค้า → null — ห้าม fallback เพิ่มเอง */
  image_url: string | null;
}

/** ยอดรวมต่อประเภทในตัวกรองเดียวกัน (ยกเว้นตัวกรองประเภทเอง) — การ์ดสรุปด้านบนของแท็บ */
export interface MovementSummaryRow {
  type: TransactionType;
  count: number;
  total_qty: number;
}

export const TYPE_CONFIG: Record<TransactionType, { label: string; bgClass: string; textClass: string }> = {
  in: { label: 'รับเข้า', bgClass: 'bg-green-100 dark:bg-green-900/30', textClass: 'text-green-700 dark:text-green-400' },
  out: { label: 'เบิกออก', bgClass: 'bg-red-100 dark:bg-red-900/30', textClass: 'text-red-700 dark:text-red-400' },
  transfer_in: { label: 'โอนเข้า', bgClass: 'bg-blue-100 dark:bg-blue-900/30', textClass: 'text-blue-700 dark:text-blue-400' },
  transfer_out: { label: 'โอนออก', bgClass: 'bg-blue-100 dark:bg-blue-900/30', textClass: 'text-blue-700 dark:text-blue-400' },
  reserve: { label: 'จอง', bgClass: 'bg-yellow-100 dark:bg-yellow-900/30', textClass: 'text-yellow-700 dark:text-yellow-400' },
  unreserve: { label: 'ปล่อยจอง', bgClass: 'bg-gray-100 dark:bg-gray-700/30', textClass: 'text-gray-700 dark:text-gray-400' },
  adjust: { label: 'ปรับปรุง', bgClass: 'bg-purple-100 dark:bg-purple-900/30', textClass: 'text-purple-700 dark:text-purple-400' },
  return: { label: 'คืน', bgClass: 'bg-cyan-100 dark:bg-cyan-900/30', textClass: 'text-cyan-700 dark:text-cyan-400' },
};

export const POSITIVE_TYPES: TransactionType[] = ['in', 'transfer_in', 'return', 'unreserve'];
export const NEGATIVE_TYPES: TransactionType[] = ['out', 'transfer_out', 'reserve'];

/** ลำดับการ์ดสรุป — คงที่เสมอ ไม่เรียงตามข้อมูลที่มี (ตำแหน่งการ์ดต้องไม่ขยับ) */
export const MOVEMENT_TYPE_ORDER: TransactionType[] = [
  'in', 'out', 'transfer_in', 'transfer_out', 'reserve', 'unreserve', 'adjust', 'return',
];

/** ไอคอนประจำประเภท — เก็บเป็นตัว component (ไฟล์นี้เป็น .ts เขียน JSX ไม่ได้) */
export const TYPE_ICONS: Record<TransactionType, LucideIcon> = {
  in: ArrowDownToLine,
  out: ArrowUpFromLine,
  transfer_in: ArrowLeftRight,
  transfer_out: ArrowLeftRight,
  reserve: Bookmark,
  unreserve: BookmarkX,
  adjust: Settings2,
  return: RotateCcw,
};

/** สีการ์ดสรุปต่อประเภท */
export const CARD_STYLES: Record<TransactionType, { bgClass: string; textClass: string; borderClass: string }> = {
  in: { bgClass: 'bg-green-50 dark:bg-green-900/20', textClass: 'text-green-700 dark:text-green-400', borderClass: 'border-green-200 dark:border-green-800' },
  out: { bgClass: 'bg-red-50 dark:bg-red-900/20', textClass: 'text-red-700 dark:text-red-400', borderClass: 'border-red-200 dark:border-red-800' },
  transfer_in: { bgClass: 'bg-blue-50 dark:bg-blue-900/20', textClass: 'text-blue-700 dark:text-blue-400', borderClass: 'border-blue-200 dark:border-blue-800' },
  transfer_out: { bgClass: 'bg-blue-50 dark:bg-blue-900/20', textClass: 'text-blue-700 dark:text-blue-400', borderClass: 'border-blue-200 dark:border-blue-800' },
  reserve: { bgClass: 'bg-yellow-50 dark:bg-yellow-900/20', textClass: 'text-yellow-700 dark:text-yellow-400', borderClass: 'border-yellow-200 dark:border-yellow-800' },
  unreserve: { bgClass: 'bg-gray-50 dark:bg-gray-800/40', textClass: 'text-gray-600 dark:text-gray-400', borderClass: 'border-gray-200 dark:border-gray-700' },
  adjust: { bgClass: 'bg-purple-50 dark:bg-purple-900/20', textClass: 'text-purple-700 dark:text-purple-400', borderClass: 'border-purple-200 dark:border-purple-800' },
  return: { bgClass: 'bg-cyan-50 dark:bg-cyan-900/20', textClass: 'text-cyan-700 dark:text-cyan-400', borderClass: 'border-cyan-200 dark:border-cyan-800' },
};

/** สีป้ายในตาราง — `Badge tone` ตามประเภท */
export const TYPE_BADGE_TONE: Record<TransactionType, BadgeTone> = {
  in: 'emerald',
  out: 'red',
  transfer_in: 'blue',
  transfer_out: 'blue',
  reserve: 'amber',
  unreserve: 'gray',
  adjust: 'purple',
  return: 'emerald',
};

/** ที่มาของรายการ (`reference_type`) → คำเรียกภาษาไทย */
export const REFERENCE_TYPE_LABELS: Record<string, string> = {
  order: 'ออเดอร์',
  pos_order: 'ขายหน้าร้าน (POS)',
  replenishment: 'เติมสินค้าตัวแทน',
  transfer: 'โอนย้าย',
  receive: 'ใบรับเข้า',
  issue: 'ใบเบิกออก',
  manual: 'ปรับปรุงสต๊อก',
  credit_note: 'ใบลดหนี้',
  consignment_report: 'รายงานฝากขาย',
  shopee_sync: 'ดึงสต็อกจาก Shopee',
};

/** ลิงก์ไปเอกสารต้นทาง — ที่มาที่ไม่มีหน้าให้เปิดคืน null (แสดงเป็นข้อความเฉย ๆ) */
export function MOVEMENT_REFERENCE_LINK(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  switch (type) {
    case 'order': return `/orders/${id}`;
    case 'replenishment': return `/replenishments/${id}`;
    case 'transfer': return `/inventory/transfers/${id}`;
    case 'receive': return `/inventory/receives/${id}`;
    case 'issue': return `/inventory/issues/${id}`;
    default: return null;
  }
}

// ===== Helpers =====
export function formatDateValue(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ===== Generic product display helpers =====
// Re-exported from shared lib — used across the entire app
import { cleanVariationLabel as _cleanVarLabel, productDisplayName as _prodDisplayName, productSubtitle as _prodSubtitle } from '@/lib/product-display';
export { cleanVariationLabel, productDisplayName, productSubtitle } from '@/lib/product-display';
export type { ProductDisplayFields } from '@/lib/product-display';

/** Flatten nested variation item (detail pages) to ProductDisplayFields */
export function flattenVariationItem(item: {
  variation?: {
    variation_label?: string | null;
    sku?: string | null;
    barcode?: string | null;
    attributes?: Record<string, string> | null;
    product?: { code?: string; name?: string };
  } | null;
}): { product_name: string; product_code: string; variation_label?: string | null; sku?: string | null; barcode?: string | null; attributes?: Record<string, string> | null } {
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
export const getVariationLabel = (item: InventoryItem) => _cleanVarLabel(item);
export const getProductDisplayName = (item: InventoryItem) => _prodDisplayName(item);
export const getProductSubtitle = (item: { product_code: string; sku?: string | null; barcode?: string | null }) => _prodSubtitle(item);
