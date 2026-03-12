'use client';

import { Package, Gift, Tag, Percent } from 'lucide-react';
import type { PriceMode } from '@/components/ui/PriceDiscountCombo';
import type { DateValueType } from '@/components/ui/DateRangePicker';

// ─── Types ──────────────────────────────────────────

export interface MarketplaceAccount {
  id: string;
  shop_name: string;
  platform: string;
  is_active: boolean;
}

export interface PlatformPrice {
  account_id: string;
  bundle_price: string;
  is_enabled: boolean;
}

export interface ShopeeDeal {
  id: string;
  account_id: string;
  deal_type: string;
  external_deal_id: number;
  status: string;
  start_time: string | null;
  end_time: string | null;
  updated_at: string;
}

export interface PromotionItemForm {
  key: string;
  variation_id: string;
  product_id: string;
  role: 'main' | 'component' | 'gift' | 'discounted';
  quantity: number;
  special_price: number | null;
  sub_item_limit: number | null;
  sort_order: number;
  product_name: string;
  product_code: string;
  variation_label: string;
  sku: string;
  default_price: number;
  max_price?: number;
  image: string;
  /** Number of variations (for product-level bundle items) */
  variation_count?: number;
  /** UI-only: price mode for Y items (not saved to DB — special_price is always fix price) */
  price_mode?: PriceMode;
  /** UI-only: raw input value for the active price mode */
  discount_value?: string;
}

export interface TierForm {
  key: string;
  min_qty: number;
  discount_type: 'percent' | 'fixed_price' | 'fixed_discount';
  discount_value: number;
}

export interface FormState {
  name: string;
  promotion_type: 'bundle_set' | 'buy_get_free' | 'buy_get_discount' | 'qty_discount';
  is_active: boolean;
  dateRange: DateValueType;
  description: string;
  bundle_price: string;
  discount_type: 'percent' | 'fixed_discount' | 'fix_price';
  discount_value: string;
  purchase_min_spend: string;
  per_gift_num: string;
  purchase_limit: string;
  items: PromotionItemForm[];
  tiers: TierForm[];
}

export interface ConfirmDialogState {
  message: string;
  detail?: string;
  content?: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
}

export interface SyncResult {
  shop_name: string;
  success: boolean;
  error?: string;
  details?: string[];
}

// ─── Constants ──────────────────────────────────────────

export const TYPE_OPTIONS = [
  { id: 'bundle_set', label: 'เซ็ตรวม', icon: <Package className="w-7 h-7" />, desc: 'รวมหลายสินค้าเป็น 1 เซ็ต กำหนดราคาเซ็ต, ลด % หรือ ลดบาท' },
  { id: 'buy_get_free', label: 'ซื้อ X แถม Y ฟรี', icon: <Gift className="w-7 h-7" />, desc: 'ซื้อสินค้าหลัก แถมของแถมฟรี เช่น ซื้อครีม แถมสบู่' },
  { id: 'buy_get_discount', label: 'ซื้อ X ได้ Y ราคาพิเศษ', icon: <Tag className="w-7 h-7" />, desc: 'ซื้อสินค้าหลัก ได้สินค้าเสริมราคาพิเศษ เช่น ซื้อมือถือ ได้เคสราคา 99 บาท' },
  { id: 'qty_discount', label: 'ซื้อเยอะลดเยอะ', icon: <Percent className="w-7 h-7" />, desc: 'ซื้อจำนวนมากยิ่งลดมาก เช่น 2 ชิ้นลด 10%, 3 ชิ้นลด 20%' },
];

export const DISCOUNT_TYPE_OPTIONS = [
  { id: 'percent', label: 'ลด %' },
  { id: 'fixed_discount', label: 'ลดราคา (บาท)' },
  { id: 'fixed_price', label: 'ราคาเหลือ (บาท)' },
];

export const ROLE_LABELS: Record<string, string> = {
  main: 'สินค้าหลัก',
  component: 'สินค้าในเซ็ต',
  gift: 'ของแถม (ฟรี)',
  discounted: 'ราคาพิเศษ',
};

export const ROLE_COLORS: Record<string, string> = {
  main: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  component: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  gift: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  discounted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

let keyCounter = 0;
export function nextKey() { return `k_${++keyCounter}`; }

// Re-export PriceMode for convenience
export type { PriceMode } from '@/components/ui/PriceDiscountCombo';
export type { DateValueType } from '@/components/ui/DateRangePicker';
