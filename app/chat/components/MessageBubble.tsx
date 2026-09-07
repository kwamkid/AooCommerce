'use client';

import { memo } from 'react';
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
  QuotedMessage,
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
const ProductCardBubble = dynamic(() => import('./renderers/ShopeeRenderers').then(m => m.ProductCardBubble), { ssr: false, loading: RENDERER_FALLBACK });
const OrderCardBubble = dynamic(() => import('./renderers/ShopeeRenderers').then(m => m.OrderCardBubble), { ssr: false, loading: RENDERER_FALLBACK });
const SystemEventChip = dynamic(() => import('./renderers/ShopeeRenderers').then(m => m.SystemEventChip), { ssr: false, loading: RENDERER_FALLBACK });
const VoucherCardBubble = dynamic(() => import('./renderers/ShopeeRenderers').then(m => m.VoucherCardBubble), { ssr: false, loading: RENDERER_FALLBACK });
const FollowInviteChip = dynamic(() => import('./renderers/ShopeeRenderers').then(m => m.FollowInviteChip), { ssr: false, loading: RENDERER_FALLBACK });

interface MessageBubbleProps {
  msg: ChatMessage;
  platform: 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok';
  direction: 'incoming' | 'outgoing';
  onOpenLightbox?: (url: string) => void;
  onImageLoad?: () => void;
}

function MessageBubble({
  msg,
  platform,
  direction,
  onOpenLightbox,
  onImageLoad,
}: MessageBubbleProps) {
  // ผู้ส่งเรียกข้อความคืนแล้ว — เนื้อความเดิมไม่มีสิทธิ์โผล่ ไม่ว่าจะเป็นชนิดไหน
  if (msg.raw_message?.recalled) {
    return <p className="italic opacity-70">ข้อความถูกเรียกคืน</p>;
  }

  const inner = renderBody({ msg, platform, direction, onOpenLightbox, onImageLoad });

  // ตอบกลับข้อความเดิม — บล็อกอ้างอิงอยู่เหนือเนื้อในฟองเดียวกัน (สีรับจากฟอง)
  const body = msg.raw_message?.quoted ? (
    <>
      <QuotedMessage quoted={msg.raw_message.quoted} />
      {inner}
    </>
  ) : inner;

  // บรอดแคสต์ — คนอ่านต้องรู้ทันทีว่านี่ไม่ใช่ข้อความที่ใครสักคนพิมพ์ตอบลูกค้ารายนี้
  if (msg.raw_message?.broadcast_id) {
    return (
      <>
        <p className="text-[11px] opacity-80 mb-0.5">📣 บรอดแคสต์</p>
        {body}
      </>
    );
  }

  return body;
}

/**
 * ห้องที่เปิดอยู่มีฟองข้อความหลายสิบใบ และหน้าแชท re-render ทุกครั้งที่มีข้อความเข้า —
 * ถ้าไม่ memo ฟองทุกใบจะ render ใหม่หมดทั้งที่มีใบเดียวที่เปลี่ยน
 *
 * ⚠️ ใช้ได้เพราะ props ทุกตัวเป็นค่าพื้นฐานหรือ identity คงที่: `msg` เปลี่ยน object
 * เฉพาะใบที่ถูกแก้จริง (`setMessages(prev => prev.map(...))` คืนตัวเดิมสำหรับใบอื่น) ·
 * `onOpenLightbox`/`onImageLoad` เป็น useCallback ฝั่งหน้าแชท — **ส่ง inline lambda
 * เข้ามาเมื่อไหร่ memo ไร้ผลทันที**
 */
export default memo(MessageBubble);

function renderBody({
  msg,
  platform,
  direction,
  onOpenLightbox,
  onImageLoad,
}: MessageBubbleProps) {
  const props = { msg, direction, onOpenLightbox, onImageLoad };
  // การ์ดสินค้า/ออเดอร์ใช้ renderer ชุดเดียวกันทุกช่องทาง — ต้องบอกไปว่าเป็นเจ้าไหน
  // ไม่งั้นการ์ดของ Lazada จะเขียนว่า "ดูบน Shopee" และการ์ดของ Facebook Shop
  // จะได้สีส้มของ Shopee
  const cardProps = { msg, direction, platform };

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

    // โพสต์/รีล/สตอรี่/ลิงก์ที่แชร์มาจาก Facebook & Instagram — ป้ายอย่างเดียวเปิดอะไร
    // ไม่ได้เลย (ของเดิมตกมาที่ TextBubble) ทั้งที่ webhook เก็บ linkUrl ไว้ให้แล้ว
    case 'ig_post':
    case 'ig_reel':
    case 'reel':
    case 'share':
    case 'post':
    case 'ig_story':
    case 'ephemeral':
    case 'unsupported_type':
      if (msg.raw_message?.linkUrl) return <FallbackBubble {...props} />;
      break;

    // Shopee: การ์ดสินค้า/ออเดอร์ — ฟองเดิมมีแต่ id ที่พนักงานอ่านไม่ออกว่าคือตัวไหน
    // (renderer จัดการเคส raw_message ยังไม่มีเนื้อเองแล้ว จึงไม่ต้อง fallback ที่นี่)
    case 'item':
      return <ProductCardBubble {...cardProps} />;

    case 'order':
      return <OrderCardBubble {...cardProps} />;

    case 'voucher':
      return <VoucherCardBubble {...cardProps} />;

    case 'follow_invite':
      return <FollowInviteChip {...cardProps} />;

    // ลูกค้ากดปุ่ม "คุยกับเจ้าหน้าที่" / ประกาศจากระบบของแพลตฟอร์ม — เหตุการณ์ ไม่ใช่
    // ข้อความของใคร (หน้าแชทจัดกลางจอให้ผ่าน isSystemEventMessage)
    case 'faq_liveagent':
    case 'system':
      return <SystemEventChip {...cardProps} />;
  }

  // Default: plain text
  return <TextBubble {...props} />;
}
