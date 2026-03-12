// ─── Promotion Action × Status Rules ─────────────────────
// Shared rules for all promotion types.
// Used by: PromotionForm (UI lock), Shopee deals API, delete flow.

import type { PromotionType } from './types';

// ─── Types ───────────────────────────────────────────────

export type DealStatus = 'no_deal' | 'upcoming' | 'ongoing' | 'expired';

export type PromotionAction =
  | 'create'
  | 'edit'
  | 'push'
  | 'sync'
  | 'unsync'
  | 'resync'
  | 'delete';

export type DiscountType = 'fix_price' | 'percent' | 'fixed_discount';

/** Shopee Bundle Deal rule_type */
export type ShopeeRuleType = 1 | 2 | 3;

// ─── Shopee Mapping ──────────────────────────────────────

/** Map our discount_type → Shopee rule_type */
export function toShopeeRuleType(discountType: DiscountType): ShopeeRuleType {
  switch (discountType) {
    case 'fix_price': return 1;
    case 'percent': return 2;
    case 'fixed_discount': return 3;
  }
}

/** Map Shopee time_status → our DealStatus */
export function fromShopeeTimeStatus(timeStatus: number): DealStatus {
  switch (timeStatus) {
    case 2: return 'upcoming';
    case 3: return 'ongoing';
    case 4: return 'expired';
    default: return 'no_deal';
  }
}

/**
 * Derive deal status from Shopee deal detail response.
 * Uses time_status if available, otherwise derives from start_time/end_time.
 * (get_bundle_deal may not return time_status)
 */
export function deriveDealStatus(detail: { time_status?: number; start_time?: number; end_time?: number } | null): DealStatus {
  if (!detail) return 'no_deal';
  if (detail.time_status) return fromShopeeTimeStatus(detail.time_status);
  if (detail.start_time && detail.end_time) {
    const now = Math.floor(Date.now() / 1000);
    if (now < detail.start_time) return 'upcoming';
    if (now < detail.end_time) return 'ongoing';
    return 'expired';
  }
  return 'no_deal';
}

/**
 * Convert a date string (YYYY-MM-DD or ISO) to Bangkok-timezone unix timestamp.
 * - startOfDay: true → 00:00:00 Bangkok (default)
 * - startOfDay: false → 23:59:59 Bangkok
 */
export function toBangkokTimestamp(dateStr: string, startOfDay = true): number {
  // Parse date parts from the string (take only YYYY-MM-DD)
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return Math.floor(new Date(dateStr).getTime() / 1000);
  const [, y, m, d] = match;
  // Bangkok is UTC+7 — construct the timestamp manually
  const timeStr = startOfDay ? '00:00:00' : '23:59:59';
  const bkkDate = new Date(`${y}-${m}-${d}T${timeStr}+07:00`);
  return Math.floor(bkkDate.getTime() / 1000);
}

/** Map our promotion_type → Shopee deal_type */
export function toShopeeDealType(promotionType: PromotionType): 'bundle_deal' | 'add_on_deal' {
  switch (promotionType) {
    case 'bundle_set':
    case 'qty_discount':
      return 'bundle_deal';
    case 'buy_get_free':
    case 'buy_get_discount':
      return 'add_on_deal';
  }
}

// ─── Action Rules ────────────────────────────────────────

/** Can this action be performed given the deal status? */
export function canPerformAction(action: PromotionAction, status: DealStatus): boolean {
  switch (action) {
    case 'create':
      return status === 'no_deal';
    case 'edit':
      return true; // always editable, but fields may be locked
    case 'push':
      return status === 'no_deal' || status === 'expired';
    case 'sync':
      return status === 'upcoming' || status === 'ongoing';
    case 'unsync':
      return status === 'upcoming' || status === 'ongoing';
    case 'resync':
      return status === 'upcoming' || status === 'ongoing' || status === 'expired';
    case 'delete':
      return true; // always deletable (will unsync first if needed)
  }
}

// ─── Field Edit Rules ────────────────────────────────────

export interface EditableFields {
  name: boolean;
  start_date: boolean;
  end_date: boolean;
  discount_type: boolean;
  discount_value: boolean;
  bundle_price: boolean;
  items_add: boolean;
  items_remove: boolean;
  tiers: boolean;
  purchase_limit: boolean;
  per_shop_toggle_on: boolean;
  per_shop_toggle_off: boolean;
  per_shop_override: boolean;
}

/** Which fields can be edited given the deal status? */
export function getEditableFields(status: DealStatus): EditableFields {
  if (status === 'ongoing') {
    return {
      name: true,
      start_date: false,
      end_date: true,
      discount_type: false,
      discount_value: false,
      bundle_price: false,
      items_add: true,
      items_remove: true,
      tiers: false,
      purchase_limit: false,
      per_shop_toggle_on: false,
      per_shop_toggle_off: true,  // can turn off (end deal)
      per_shop_override: false,
    };
  }

  // no_deal, upcoming, expired → all editable
  return {
    name: true,
    start_date: true,
    end_date: true,
    discount_type: true,
    discount_value: true,
    bundle_price: true,
    items_add: true,
    items_remove: true,
    tiers: true,
    purchase_limit: true,
    per_shop_toggle_on: true,
    per_shop_toggle_off: true,
    per_shop_override: true,
  };
}

// ─── Unsync Strategy ─────────────────────────────────────

export type UnsyncStrategy = 'delete' | 'end' | 'skip';

/** How to unsync a deal based on its status */
export function getUnsyncStrategy(status: DealStatus): UnsyncStrategy {
  switch (status) {
    case 'upcoming': return 'delete';
    case 'ongoing': return 'end';
    default: return 'skip'; // no_deal, expired
  }
}

// ─── Per-Type Config ─────────────────────────────────────

export interface PromotionTypeConfig {
  shopeeDealType: 'bundle_deal' | 'add_on_deal';
  itemLevel: 'product' | 'variation';
  minItems: number;
  maxItems: number;
  hasDiscount: boolean;
  hasTiers: boolean;
  hasPerShopOverride: boolean;
  hasPurchaseLimit: boolean;
  hasRoles: boolean;
  roles: string[];
}

export function getTypeConfig(promotionType: PromotionType): PromotionTypeConfig {
  switch (promotionType) {
    case 'bundle_set':
      return {
        shopeeDealType: 'bundle_deal',
        itemLevel: 'product',
        minItems: 2,
        maxItems: 3000,
        hasDiscount: true,
        hasTiers: false,
        hasPerShopOverride: true,
        hasPurchaseLimit: true,
        hasRoles: false,
        roles: ['component'],
      };
    case 'qty_discount':
      return {
        shopeeDealType: 'bundle_deal',
        itemLevel: 'variation',
        minItems: 1,
        maxItems: 1,
        hasDiscount: false,
        hasTiers: true,
        hasPerShopOverride: false,
        hasPurchaseLimit: false,
        hasRoles: false,
        roles: ['main'],
      };
    case 'buy_get_free':
      return {
        shopeeDealType: 'add_on_deal',
        itemLevel: 'variation',
        minItems: 2,
        maxItems: 50,
        hasDiscount: false,
        hasTiers: false,
        hasPerShopOverride: false,
        hasPurchaseLimit: true,
        hasRoles: true,
        roles: ['main', 'gift'],
      };
    case 'buy_get_discount':
      return {
        shopeeDealType: 'add_on_deal',
        itemLevel: 'variation',
        minItems: 2,
        maxItems: 50,
        hasDiscount: false,
        hasTiers: false,
        hasPerShopOverride: false,
        hasPurchaseLimit: true,
        hasRoles: true,
        roles: ['main', 'discounted'],
      };
  }
}

// ─── Validation ──────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

/** Shopee-specific validation constraints */
export function validateForShopee(
  promotionType: PromotionType,
  data: {
    name: string;
    startDate: string | null;
    endDate: string | null;
    discountType?: DiscountType;
    discountValue?: number;
    bundlePrice?: number;
    itemCount: number;
    purchaseLimit?: number;
    tiers?: { min_qty: number; discount_type: string; discount_value: number }[];
    totalDefaultPrice?: number;
  },
): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = getTypeConfig(promotionType);

  // Name: required, max 25 chars (Shopee)
  if (!data.name.trim()) {
    errors.push({ field: 'name', message: 'กรุณาระบุชื่อ' });
  } else if (data.name.trim().length > 25) {
    errors.push({ field: 'name', message: 'ชื่อต้องไม่เกิน 25 ตัวอักษร (Shopee)' });
  }

  // Date range
  if (!data.startDate || !data.endDate) {
    errors.push({ field: 'dateRange', message: 'กรุณาระบุวันเริ่มต้นและสิ้นสุด' });
  } else if (new Date(data.endDate) <= new Date(data.startDate)) {
    errors.push({ field: 'dateRange', message: 'วันสิ้นสุดต้องมากกว่าวันเริ่มต้น' });
  }

  // Items
  if (data.itemCount === 0) {
    errors.push({ field: 'items', message: 'กรุณาเพิ่มสินค้า' });
  } else if (data.itemCount < config.minItems) {
    errors.push({ field: 'items', message: `ต้องมีสินค้าอย่างน้อย ${config.minItems} รายการ` });
  } else if (data.itemCount > config.maxItems) {
    errors.push({ field: 'items', message: `สินค้าต้องไม่เกิน ${config.maxItems} รายการ` });
  }

  // Purchase limit (Shopee: 1-100)
  if (config.hasPurchaseLimit && data.purchaseLimit != null) {
    if (data.purchaseLimit < 1 || data.purchaseLimit > 100) {
      errors.push({ field: 'purchase_limit', message: 'จำกัดการซื้อ 1-100 ครั้ง (Shopee)' });
    }
  }

  // Bundle set discount
  if (promotionType === 'bundle_set' && config.hasDiscount) {
    if (data.discountType === 'fix_price') {
      const bp = data.bundlePrice || 0;
      if (bp <= 0) {
        errors.push({ field: 'bundle_price', message: 'กรุณาระบุราคาเซ็ต' });
      } else if (data.totalDefaultPrice && bp >= data.totalDefaultPrice) {
        errors.push({ field: 'bundle_price', message: 'ราคาเซ็ตต้องน้อยกว่าราคาปกติรวม' });
      }
    } else {
      const dv = data.discountValue || 0;
      if (dv <= 0) {
        errors.push({ field: 'discount_value', message: 'กรุณาระบุส่วนลด' });
      }
      if (data.discountType === 'percent' && dv >= 90) {
        errors.push({ field: 'discount_value', message: 'ส่วนลดต้องน้อยกว่า 90% (Shopee)' });
      }
    }
  }

  // Qty discount tiers
  if (promotionType === 'qty_discount' && config.hasTiers) {
    if (!data.tiers || data.tiers.length === 0) {
      errors.push({ field: 'tiers', message: 'กรุณาเพิ่มขั้นส่วนลดอย่างน้อย 1 ขั้น' });
    } else {
      const t1 = data.tiers[0];
      if (t1.discount_type === 'percent' && t1.discount_value >= 90) {
        errors.push({ field: 'tiers', message: 'ขั้นที่ 1 ส่วนลดต้องน้อยกว่า 90% (Shopee)' });
      }
      for (let i = 1; i < data.tiers.length; i++) {
        if (data.tiers[i].min_qty <= data.tiers[i - 1].min_qty) {
          errors.push({ field: 'tiers', message: 'จำนวนขั้นต่ำต้องเรียงจากน้อยไปมาก' });
          break;
        }
      }
    }
  }

  return errors;
}
