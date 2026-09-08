export interface UnifiedContact {
  id: string;
  platform: 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok';
  source?: 'line' | 'facebook' | 'instagram' | 'shopee' | 'lazada' | 'tiktok';
  platform_user_id: string;
  display_name: string;
  /** ชื่อเล่นที่ร้านตั้งให้ห้องนี้ — ใช้ก่อนทุกชื่อตอนแทน {{ชื่อลูกค้า}} */
  nickname?: string | null;
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
      /** การ์ดสินค้าของ Facebook Shop — id ของสินค้าในแคตตาล็อก + รหัสที่ร้านตั้งเอง */
      id?: string;
      retailer_id?: string;
    }>;
    /** เทมเพลตที่แกะเนื้อไม่ได้ — เก็บ attachment ทั้งก้อนไว้ไล่จากข้อมูลจริง */
    raw_attachment?: Record<string, unknown>;
    /** ข้อความที่ไม่มีทั้ง text/attachment/sticker — เก็บ event ทั้งก้อน (เล็ก) */
    raw_event?: Record<string, unknown>;
    raw_keys?: string[];
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

    // Shopee / Lazada / TikTok
    thumbUrl?: string;
    item_id?: number | string;
    sku_id?: string;
    shop_id?: number;
    itemUrl?: string;
    order_sn?: string;
    sub_order_id?: string;
    /** uuid ออเดอร์ในระบบเรา (ไม่ใช่เลขของแพลตฟอร์ม — ตัวนั้นคือ order_sn) */
    order_id?: string;
    shopee_status?: string;
    shopee_source?: string;
    auto_reply?: boolean;
    recalled?: boolean;
    /** Lazada: template id ดิบ ไว้ไล่ดูตอนเจอชนิดใหม่ที่ยังไม่รองรับ */
    lazada_template_id?: number;
    /** Lazada: แชทบอทถามนำ (เลือกออเดอร์/หัวข้อ) */
    action_type?: number;
    /** ลิงก์ของการ์ดที่ไม่ใช่สินค้า (ชวนติดตามร้าน ฯลฯ) */
    link_url?: string;
    width?: number;
    height?: number;
    /** Lazada: ประกาศ/โปรโมชันที่แพลตฟอร์มยิงหาผู้ขาย ไม่ใช่ข้อความของลูกค้า */
    broadcast?: { topic?: string; summary?: string };
    /** ข้อความนี้มาจากบรอดแคสต์ LINE ใบไหน — พนักงานต้องแยกออกว่าไม่ใช่การตอบรายคน */
    broadcast_id?: string;
    /** LINE: reply token ของข้อความขาเข้า (ตอบฟรีภายใน ~1 นาที ครั้งเดียว) + เวลาที่ได้มา + ใช้ไปหรือยัง */
    reply_token?: string;
    reply_token_at?: string;
    reply_token_used?: boolean;
    /** ขาออก LINE: ส่งผ่าน reply token (ไม่นับโควตา) — ไม่มี = push */
    sent_via?: 'reply' | 'push';
    /** คูปองที่แนบมากับข้อความ — โครงต่างกันไปตามแพลตฟอร์ม เก็บเท่าที่ส่งมา */
    voucher?: Record<string, string | number | undefined>;

    // การ์ดสินค้า/ออเดอร์ของ marketplace ที่เติมเนื้อไว้ตอนบันทึกข้อความ
    // (lib/shopee/chat-enrich.ts · lib/lazada/chat-enrich.ts) — push ส่งมาแค่ id
    // เลยต้อง resolve ตั้งแต่ตอนเก็บ ไม่ใช่ให้หน้าจอไปยิงหาเอง
    item?: {
      item_id: string;
      sku_id?: string;
      shop_id?: number | null;
      name?: string | null;
      image_url?: string | null;
      price?: number | null;
      /** ราคาหลังคูปองของแพลตฟอร์ม (Lazada ส่งมาในการ์ด) */
      voucher_price?: number | null;
      /** uuid สินค้าในระบบเรา — ไม่มี = ยังไม่ได้ผูก (กด "เปิดในระบบ" ไม่ได้) */
      product_id?: string | null;
      variation_id?: string | null;
      /** ลิงก์ไปหน้าสินค้าบนแพลตฟอร์ม — `shopee_url` เป็นชื่อเดิมของข้อความ Shopee ยุคแรก */
      platform_url?: string;
      shopee_url?: string;
      /** Facebook Shop: รหัสที่ร้านตั้งไว้ในแคตตาล็อก (ตัวที่ใช้จับคู่กับสินค้าเรา) */
      retailer_id?: string;
      /** subtitle ของการ์ดที่อ่านแล้วไม่ใช่ราคา (ไซซ์/สี/คำโปรย) */
      subtitle?: string;
    };
    order?: {
      order_sn: string;
      /** uuid ออเดอร์ในระบบเรา — ไม่มี = ยังไม่ sync เข้ามา */
      order_id?: string;
      order_number?: string;
      order_status?: string;
      payment_status?: string;
      total_amount?: number;
      item_name?: string;
      image_url?: string;
      /** 'ReturnOrder' = คำขอคืนสินค้า (Lazada) */
      order_type?: string;
      platform_url?: string;
    };
    /** เหตุการณ์เชิงระบบ ไม่ใช่คำพูดของใคร (เช่น ลูกค้ากดขอคุยกับเจ้าหน้าที่ · เข้า/ออกกลุ่ม) */
    system_event?: string;

    // ─── ตอบกลับข้อความเดิม (quote reply) ────────────────────────────────
    /** id ของข้อความที่ถูกอ้างถึง (LINE quotedMessageId · FB reply_to.mid) */
    reply_to_id?: string;
    /** LINE บังคับใช้โทเคนนี้ตอนเรา "ตอบกลับ" กลับไป — เก็บไว้ใช้ทีหลัง */
    quote_token?: string;
    /** snapshot ของข้อความที่ถูกอ้างถึง — ไม่ต้อง join ตอนแสดง */
    quoted?: {
      message_id?: string | null;
      content?: string;
      message_type?: string | null;
      direction?: string;
      image_url?: string;
    };

    // ─── LINE เพิ่มเติม ──────────────────────────────────────────────────
    /** รูปชุดเดียวกันที่ส่งรวดเดียว — total > 1 ถึงจะแสดงเลขลำดับ */
    image_set?: { id?: string; index?: number; total?: number };
    /** รูปชุดเดียวกันที่ถูกรวมเป็นฟองเดียวตอนแสดงผล (message_type = 'image_album')
     *  — ประกอบขึ้นในเครื่องด้วย groupImageAlbums() ไม่ได้เก็บใน DB */
    album?: { url: string; messageId: string; pending?: boolean }[];
    /** อีโมจิของ LINE — ในข้อความเป็นตัวยึดตำแหน่ง ต้องวาดเป็นรูปทับตามช่วง index */
    emojis?: Array<{ index: number; length: number; productId: string; emojiId: string }>;
    mention?: { mentionees?: Array<Record<string, unknown>> };

    /** ลูกค้ากดปุ่ม (LINE postback / FB postback) */
    postback?: { data?: string; params?: Record<string, string>; title?: string; payload?: string };

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
  /** เหตุผลที่ส่งไม่สำเร็จ (ข้อความจากแพลตฟอร์ม เช่น Shopee 'Invalid to_id') — โชว์ใน tooltip ไม่ใช่แค่ 'ส่งไม่สำเร็จ' */
  _error?: string;
  _tempId?: string;
  /** ไฟล์ต้นฉบับของฟองรูปที่ยังส่งไม่สำเร็จ — ปุ่ม "ลองใหม่" ต้องอัปโหลดใหม่ทั้งรอบ
   *  (รอบที่ล้มก่อนอัปโหลดสำเร็จยังไม่มี URL สาธารณะให้ยิงซ้ำ) · client-only ไม่ลง DB */
  _file?: File;
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
  /** รูปประจำช่องทาง resolve มาจาก API แล้ว (โลโก้ร้าน marketplace / รูป bot LINE / รูปเพจ FB) */
  picture_url?: string | null;
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
