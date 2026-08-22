import { LineChatService } from './line';
import { FacebookChatService } from './facebook';
import { ShopeeChatService } from './shopee';
import { LazadaChatService } from './lazada';
import { TikTokChatService } from './tiktok';

const lineService = new LineChatService();
const facebookService = new FacebookChatService();
const shopeeService = new ShopeeChatService();
const lazadaService = new LazadaChatService();
const tiktokService = new TikTokChatService();

const services = {
  line: lineService,
  facebook: facebookService,
  shopee: shopeeService,
  lazada: lazadaService,
  tiktok: tiktokService,
} as const;

export type ChatServicePlatform = keyof typeof services;

export function getChatService(platform: ChatServicePlatform) {
  return services[platform];
}

export { LineChatService } from './line';
export { FacebookChatService } from './facebook';
export { ShopeeChatService, processShopeeWebchatPush } from './shopee';
export { LazadaChatService, processLazadaPush, syncLazadaRecentSessions } from './lazada';
export { TikTokChatService, processTikTokChatPush, syncTikTokRecentConversations } from './tiktok';
export type { FbMessagingEvent, FbWebhookEntry, FbWebhookBody } from './facebook';
export type { ShopeeWebchatPayload } from './shopee';
export type { LazadaPushPayload } from './lazada';
export type { TikTokChatPushData } from './tiktok';
