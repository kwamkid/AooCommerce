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
}

export interface SendMessageResult {
  success: boolean;
  message?: SavedMessage;
  error?: string;
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
}
