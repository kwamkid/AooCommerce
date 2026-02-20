export interface UnifiedContact {
  id: string;
  platform: 'line' | 'facebook';
  source?: 'line' | 'facebook' | 'instagram';
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
    address?: string;
    district?: string;
    amphoe?: string;
    province?: string;
    postal_code?: string;
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
  avg_order_frequency?: number | null;
  account_name?: string;
  account_picture_url?: string;
  chat_account_id?: string;
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
    stickerId?: string;
    packageId?: string;
    stickerResourceType?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
    lineMessageId?: string;
    imageUrl?: string;
    videoUrl?: string;
    previewUrl?: string;
    audioUrl?: string;
    fileUrl?: string;
    linkUrl?: string;
    linkTitle?: string;
    templateUrl?: string;
    template_type?: string;
    buttons?: Array<{ type: string; title: string; url?: string; payload?: string }>;
    elements?: Array<{ title?: string; subtitle?: string; image_url?: string; buttons?: Array<{ type: string; title: string; url?: string }> }>;
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
  platform: 'line' | 'facebook';
  display_name: string;
  picture_url?: string;
  last_message_at?: string;
  account_name?: string;
}

export type MobileView = 'contacts' | 'chat' | 'order' | 'history' | 'profile' | 'create-customer' | 'edit-customer' | 'order-detail';
export type RightPanelType = 'order' | 'history' | 'profile' | 'create-customer' | 'edit-customer' | 'order-detail' | null;
