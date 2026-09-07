// ตัวเลือก service แชทแบบโหลดเฉพาะแพลตฟอร์มที่ใช้ (dynamic import)
//
// `lib/services/chat/index.ts` import ทุกแพลตฟอร์มตั้งแต่ต้น — route ที่แค่อ่านข้อความห้องหนึ่ง
// จึงต้องประเมินโมดูลของ Shopee/Lazada/TikTok (+ sharp ของ LINE) ทั้งหมดตอน cold start
// ทั้งที่ไม่ได้ใช้ · route ที่อยู่ในสายที่ผู้ใช้รอ (เปิดห้องแชท/ส่งข้อความ) ให้ใช้ตัวนี้แทน
// webhook/cron ที่รู้จักแพลตฟอร์มตัวเองอยู่แล้ว import service ตรง ๆ ได้เหมือนเดิม
import type { ChatServicePlatform } from './index';
import type { GetMessagesParams, SendMessageParams, SendMessageResult } from './types';

export interface ChatMessageService {
  getMessages(params: GetMessagesParams): Promise<{ messages: unknown[] | null; error: string | null }>;
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
}

const instances = new Map<ChatServicePlatform, Promise<ChatMessageService>>();

export function getChatServiceLazy(platform: ChatServicePlatform): Promise<ChatMessageService> {
  let pending = instances.get(platform);
  if (!pending) {
    pending = (async (): Promise<ChatMessageService> => {
      switch (platform) {
        case 'line': return new (await import('./line')).LineChatService();
        case 'facebook': return new (await import('./facebook')).FacebookChatService();
        case 'shopee': return new (await import('./shopee')).ShopeeChatService();
        case 'lazada': return new (await import('./lazada')).LazadaChatService();
        case 'tiktok': return new (await import('./tiktok')).TikTokChatService();
        default: throw new Error(`Unknown chat platform: ${platform as string}`);
      }
    })();
    instances.set(platform, pending);
  }
  return pending;
}
