import { LineChatService } from './line';
import { FacebookChatService } from './facebook';
import { ShopeeChatService } from './shopee';
import { LazadaChatService } from './lazada';

const lineService = new LineChatService();
const facebookService = new FacebookChatService();
const shopeeService = new ShopeeChatService();
const lazadaService = new LazadaChatService();

const services = {
  line: lineService,
  facebook: facebookService,
  shopee: shopeeService,
  lazada: lazadaService,
} as const;

export type ChatServicePlatform = keyof typeof services;

export function getChatService(platform: ChatServicePlatform) {
  return services[platform];
}

export { LineChatService } from './line';
export { FacebookChatService } from './facebook';
export { ShopeeChatService, processShopeeWebchatPush } from './shopee';
export { LazadaChatService, processLazadaPush, syncLazadaRecentSessions } from './lazada';
export type { FbMessagingEvent, FbWebhookEntry, FbWebhookBody } from './facebook';
export type { ShopeeWebchatPayload } from './shopee';
export type { LazadaPushPayload } from './lazada';
