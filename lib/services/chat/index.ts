import { LineChatService } from './line';
import { FacebookChatService } from './facebook';

const lineService = new LineChatService();
const facebookService = new FacebookChatService();

export function getChatService(platform: 'line' | 'facebook') {
  return platform === 'line' ? lineService : facebookService;
}

export { LineChatService } from './line';
export { FacebookChatService } from './facebook';
export type { FbMessagingEvent, FbWebhookEntry, FbWebhookBody } from './facebook';
