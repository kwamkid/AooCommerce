export interface UnifiedContact {
  id: string;
  platform: 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok';
  source?: 'line' | 'facebook' | 'instagram' | 'shopee' | 'lazada' | 'tiktok';
  platform_user_id: string;
  display_name: string;
  picture_url?: string;
  status: string;
  customer_id?: string;
  customer?: {
    id: string;
    name: string;
    customer_code: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    customer_type?: 'retail' | 'wholesale' | 'distributor';
    billing_address?: string;
    billing_district?: string;
    billing_amphoe?: string;
    billing_province?: string;
    billing_postal_code?: string;
    tax_id?: string;
    tax_company_name?: string;
    tax_branch?: string;
    credit_limit?: number;
    credit_days?: number;
    notes?: string;
    is_active?: boolean;
  };
  unread_count: number;
  last_message_at?: string;
  last_message?: string;
  last_order_date?: string;
  last_order_created_at?: string;
  /** API บอกว่ารอบนี้ enrich ข้อมูลออเดอร์จริงหรือไม่ (โหมดค้นหาไม่ enrich)
   *  false + ไม่มี last_order_date = "ไม่รู้" ห้ามแสดงว่า "ยังไม่เคยสั่ง" */
  order_stats_loaded?: boolean;
  avg_order_frequency?: number | null;
  account_name?: string;
  account_picture_url?: string;
  chat_account_id?: string;
  // Customer tags
  tags?: { id: string; name: string; color: string }[];
  // Referral/ad tracking
  referral_source?: string;
  referral_ad_id?: string;
  referral_ad_title?: string;
  referral_data?: {
    source?: string;
    ad_id?: string;
    ads_context_data?: {
      ad_title?: string;
      photo_url?: string;
      video_url?: string;
      post_id?: string;
      product_id?: string;
    };
  };
}

export interface ChatMessage {
  id: string;
  contact_id: string;
  direction: 'incoming' | 'outgoing';
  message_type: string;
  content: string;
  sent_by?: string;
  sent_by_user?: {
    id: string;
    name: string;
  };
  sender_user_id?: string;
  sender_name?: string;
  sender_picture_url?: string;
  raw_message?: {
    // Sticker
    stickerId?: string;
    packageId?: string;
    stickerResourceType?: string;
    sticker_id?: number; // Facebook sticker

    // Location
    latitude?: number;
    longitude?: number;
    address?: string;

    // Media URLs
    lineMessageId?: string;
    imageUrl?: string;
    videoUrl?: string;
    previewUrl?: string;
    audioUrl?: string;
    fileUrl?: string;

    // Audio/File metadata
    duration?: number;    // audio duration in ms
    fileName?: string;
    fileSize?: number;

    // Link/Fallback
    linkUrl?: string;
    linkTitle?: string;

    // Template (shared)
    templateUrl?: string;
    template_type?: string;

    // Facebook template data
    buttons?: Array<{ type: string; title: string; url?: string; payload?: string }>;
    elements?: Array<{
      title?: string;
      subtitle?: string;
      image_url?: string;
      quantity?: number;
      price?: number;
      currency?: string;
      buttons?: Array<{ type: string; title: string; url?: string }>;
    }>;
    // Facebook receipt template
    recipient_name?: string;
    order_number?: string;
    currency?: string;
    payment_method?: string;
    order_url?: string;
    timestamp?: string;
    summary?: { subtotal?: number; shipping_cost?: number; total_tax?: number; total_cost?: number };
    receipt_address?: { street_1?: string; street_2?: string; city?: string; postal_code?: string; state?: string; country?: string };
    adjustments?: Array<{ name?: string; amount?: number }>;
    // Facebook coupon
    coupon_url?: string;
    coupon_code?: string;

    // Instagram story
    storyUrl?: string;

    // Shopee / Lazada
    thumbUrl?: string;
    item_id?: number | string;
    shop_id?: number;
    itemUrl?: string;
    order_sn?: string;
    order_id?: string;
    shopee_status?: string;
    auto_reply?: boolean;
    recalled?: boolean;

    // LINE Flex Message
    flexContents?: Record<string, unknown>;

    // LINE Template
    template?: Record<string, unknown>;

    // LINE Imagemap
    baseUrl?: string;
    baseSize?: { width: number; height: number };

    // Content provider (LINE)
    contentProvider?: {
      originalContentUrl?: string;
      previewImageUrl?: string;
    };
  };
  created_at: string;
  _status?: 'sending' | 'sent' | 'failed';
  _tempId?: string;
  line_contact_id?: string;
  fb_contact_id?: string;
  shopee_contact_id?: string;
  lazada_contact_id?: string;
  tiktok_contact_id?: string;
}

export interface Customer {
  id: string;
  name: string;
  customer_code: string;
  phone?: string;
}

export interface DayRange {
  minDays: number;
  maxDays: number | null;
  label: string;
  color: string;
}

export interface ChatAccountInfo {
  id: string;
  platform: string;
  account_name: string;
  is_active: boolean;
  credentials?: Record<string, unknown>;
}

export interface LinkedContact {
  id: string;
  platform: 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok';
  display_name: string;
  picture_url?: string;
  last_message_at?: string;
  account_name?: string;
}

export type MobileView = 'contacts' | 'chat' | 'order' | 'history' | 'profile' | 'create-customer' | 'edit-customer' | 'order-detail';
export type RightPanelType = 'order' | 'history' | 'profile' | 'create-customer' | 'edit-customer' | 'order-detail' | null;
