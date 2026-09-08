// Shared types for chat service layer

export interface SendMessageParams {
  contactId: string;
  companyId: string;
  userId?: string;
  type: 'text' | 'image' | 'sticker';
  text?: string;
  imageUrl?: string;
  previewUrl?: string;
  packageId?: string;
  stickerId?: string;
  /**
   * รูปชุดเดียวกันที่ส่งรวดเดียว — เก็บลง `raw_message.image_set` โครงเดียวกับที่ LINE
   * ส่งมาให้ตอนลูกค้าส่งหลายรูป เพื่อให้หน้าแชทของเรายุบเป็นฟองอัลบั้มใบเดียวได้
   * ⚠️ เป็นเรื่องของ "การแสดงผลฝั่งเรา" เท่านั้น — ไม่มีแพลตฟอร์มไหนรับ field นี้ตอนส่ง
   */
  imageSet?: { id: string; index: number; total: number };
}

export interface SendMessageResult {
  success: boolean;
  message?: SavedMessage;
  error?: string;
  errorCode?: string;
}

export interface SavedMessage {
  id: string;
  direction: 'outgoing';
  message_type: string;
  content: string;
  raw_message: Record<string, unknown> | null;
  sent_by?: string;
  sent_by_user?: { id: string; name: string } | null;
  created_at: string;
  [key: string]: unknown;
}

export interface ResolvedCredentials {
  accessToken: string;
  secret?: string;
  pageId?: string;
  accountId?: string;
}

export interface PlatformProfile {
  displayName: string;
  pictureUrl?: string;
}

export interface GetMessagesParams {
  contactId: string;
  companyId: string;
  limit: number;
  offset: number;
  /** false = แค่อ่าน (prefetch ตอนเมาส์ชี้) ไม่ทำเครื่องหมายว่าอ่านแล้ว — ค่าตั้งต้น true */
  markRead?: boolean;
}
