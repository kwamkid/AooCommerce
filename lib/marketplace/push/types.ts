// Shared types for marketplace deal push services

export type PushStep =
  | 'check_products'
  | 'create_deal'
  | 'add_items'
  | 'add_main_items'
  | 'add_sub_items'
  | 'save_db';

export type PushStatus = 'in_progress' | 'success' | 'error';

export interface PushProgress {
  step: PushStep;
  status: PushStatus;
  message?: string;
  detail?: string;
}

export interface PushTarget {
  account_id: string;
  shop_name: string;
  platform: string;
  bundle_price: number | null;
}

export interface PushResult {
  account_id: string;
  shop_name: string;
  success: boolean;
  external_deal_id?: number;
  error?: string;
  warning?: string; // partial success — some items failed
}
