import { LineChatService } from './line';
import { FacebookChatService } from './facebook';
import { ShopeeChatService } from './shopee';

const lineService = new LineChatService();
const facebookService = new FacebookChatService();
const shopeeService = new ShopeeChatService();

const services = {
  line: lineService,
  facebook: facebookService,
  shopee: shopeeService,
} as const;

export type ChatServicePlatform = keyof typeof services;

export function getChatService(platform: ChatServicePlatform) {
  return services[platform];
}

export { LineChatService } from './line';
export { FacebookChatService } from './facebook';
export { ShopeeChatService, processShopeeWebchatPush } from './shopee';
export type { FbMessagingEvent, FbWebhookEntry, FbWebhookBody } from './facebook';
export type { ShopeeWebchatPayload } from './shopee';
