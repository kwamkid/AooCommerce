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
import dynamic from 'next/dynamic';

// ตัวอ่าน Flex/Template/Imagemap ของ LINE กับ template/story ของ FB โผล่เฉพาะบางข้อความ
// แต่โค้ดหนัก — โหลดตอนเจอข้อความชนิดนั้นจริงพอ (SharedRenderers = text/image/sticker
// มีอยู่แทบทุกจอ จึง import ตรง ๆ ต่อไป)
const RENDERER_FALLBACK = () => <div className="min-h-[40px]" />;
const LineFlexRenderer = dynamic(() => import('./renderers/LineRenderers').then(m => m.LineFlexRenderer), { ssr: false, loading: RENDERER_FALLBACK });
const LineTemplateRenderer = dynamic(() => import('./renderers/LineRenderers').then(m => m.LineTemplateRenderer), { ssr: false, loading: RENDERER_FALLBACK });
const ImagemapBubble = dynamic(() => import('./renderers/LineRenderers').then(m => m.ImagemapBubble), { ssr: false, loading: RENDERER_FALLBACK });
const FbTemplateRenderer = dynamic(() => import('./renderers/FbRenderers').then(m => m.FbTemplateRenderer), { ssr: false, loading: RENDERER_FALLBACK });
const StoryMentionBubble = dynamic(() => import('./renderers/FbRenderers').then(m => m.StoryMentionBubble), { ssr: false, loading: RENDERER_FALLBACK });
const StoryReplyBubble = dynamic(() => import('./renderers/FbRenderers').then(m => m.StoryReplyBubble), { ssr: false, loading: RENDERER_FALLBACK });

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
