'use client';

import { ChatMessage } from '@/app/chat/lib/chatTypes';
import {
  StickerBubble,
  ImageBubble,
  VideoBubble,
  LocationBubble,
  AudioBubble,
  FileBubble,
  FallbackBubble,
  TextBubble,
} from './renderers/SharedRenderers';
import {
  LineFlexRenderer,
  LineTemplateRenderer,
  ImagemapBubble,
} from './renderers/LineRenderers';
import { FbTemplateRenderer, StoryMentionBubble, StoryReplyBubble } from './renderers/FbRenderers';

interface MessageBubbleProps {
  msg: ChatMessage;
  platform: 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok';
  direction: 'incoming' | 'outgoing';
  onOpenLightbox?: (url: string) => void;
  onImageLoad?: () => void;
}

export default function MessageBubble({
  msg,
  platform,
  direction,
  onOpenLightbox,
  onImageLoad,
}: MessageBubbleProps) {
  const props = { msg, direction, onOpenLightbox, onImageLoad };

  switch (msg.message_type) {
    case 'sticker':
      return <StickerBubble {...props} />;

    case 'image':
      if (msg.raw_message?.imageUrl) return <ImageBubble {...props} />;
      break;

    case 'video':
      if (msg.raw_message?.videoUrl) return <VideoBubble {...props} />;
      break;

    case 'location':
      if (msg.raw_message?.latitude && msg.raw_message?.longitude) return <LocationBubble {...props} />;
      break;

    case 'audio':
      if (msg.raw_message?.audioUrl) return <AudioBubble {...props} />;
      break;

    case 'file':
      if (msg.raw_message?.fileUrl) return <FileBubble {...props} />;
      break;

    case 'flex':
      if (msg.raw_message?.flexContents) return <LineFlexRenderer {...props} />;
      break;

    case 'imagemap':
      if (msg.raw_message?.baseUrl) return <ImagemapBubble {...props} />;
      break;

    case 'template':
      // LINE templates have `template` field
      if (platform === 'line' && msg.raw_message?.template) {
        return <LineTemplateRenderer {...props} />;
      }
      // Facebook templates — delegate to FB renderer which handles all subtypes
      return <FbTemplateRenderer {...props} />;

    case 'story_mention':
      return <StoryMentionBubble {...props} />;

    case 'story_reply':
      return <StoryReplyBubble {...props} />;

    case 'fallback':
      if (msg.raw_message?.linkUrl || msg.raw_message?.templateUrl) return <FallbackBubble {...props} />;
      break;

    // Shopee: product / order reference messages — link bubble when we have a URL
    case 'item':
    case 'order':
      if (msg.raw_message?.linkUrl) return <FallbackBubble {...props} />;
      break;
  }

  // Default: plain text
  return <TextBubble {...props} />;
}
