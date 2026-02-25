// Shared marketplace types and helpers
// Used by all platform integrations (Shopee, TikTok, Lazada, LINE Shopping)

export type MarketplacePlatform = 'shopee' | 'tiktok' | 'lazada' | 'line_shopping';

export const MARKETPLACE_PLATFORMS: readonly MarketplacePlatform[] = [
  'shopee',
  'tiktok',
  'lazada',
  'line_shopping',
] as const;

/** Check if an order source is a marketplace platform */
export function isMarketplaceSource(source?: string | null): boolean {
  return MARKETPLACE_PLATFORMS.includes(source as MarketplacePlatform);
}

/** Generic marketplace account row (matches marketplace_accounts table) */
export interface MarketplaceAccountRow {
  id: string;
  company_id: string;
  platform: MarketplacePlatform;
  shop_id: number;
  shop_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  last_product_sync_at: string | null;
  auto_sync_stock: boolean;
  auto_sync_product_info: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Platform-specific data stored in marketplace_product_links.platform_data */
export interface PlatformData {
  category_id?: number | string | null;
  category_name?: string | null;
  attributes?: unknown[] | null;
  brand_id?: number | string | null;
  brand_name?: string | null;
  [key: string]: unknown; // extensible per platform
}

/** Generic sync result */
export interface MarketplaceSyncResult {
  orders_created: number;
  orders_updated: number;
  orders_skipped: number;
  products_created: number;
  customers_created: number;
  errors: string[];
}
