'use client';

import { Play, FileText, Download, Music, Loader2 } from 'lucide-react';
import { ChatMessage } from '@/app/chat/lib/chatTypes';
import { hasHtmlMarkup, parseRichText } from '@/app/chat/lib/richText';
import { lineStickerUrl, lineSticonUrl } from '@/lib/chat/line-sticker';

interface RendererProps {
  msg: ChatMessage;
  direction: 'incoming' | 'outgoing';
  onOpenLightbox?: (url: string) => void;
  onImageLoad?: () => void;
}

// ─── Sticker ────────────────────────────────────────────────────────────────

export function StickerBubble({ msg }: RendererProps) {
  // LINE sticker: ประกอบที่อยู่รูปจาก stickerId (ผ่าน origin ของเรา ไม่ใช่ CDN ของ LINE)
  const lineStickerId = msg.raw_message?.stickerId;
  if (lineStickerId) {
    // ไล่หา iPhone@2x → iPhone → android ย้ายไปทำฝั่งเซิร์ฟเวอร์แล้ว (คำขอเดียวจบ)
    return (
      <img
        src={lineStickerUrl(lineStickerId)}
        alt="sticker"
        className="w-24 h-24 object-contain"
      />
    );
  }

  // Facebook sticker: use imageUrl directly (FB stickers are images with sticker_id)
  const fbImageUrl = msg.raw_message?.imageUrl;
  if (fbImageUrl) {
    return <img src={fbImageUrl} alt="sticker" className="w-24 h-24 object-contain" />;
  }

  return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;
}

// ─── Image ──────────────────────────────────────────────────────────────────

export function ImageBubble({ msg, onOpenLightbox, onImageLoad }: RendererProps) {
  const imageUrl = msg.raw_message?.imageUrl;
  if (!imageUrl) return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;

  // LINE ส่งรูปชุดเดียวกันมาทีละใบ — บอกลำดับไว้ พนักงานจะได้รู้ว่ายังมีอีกกี่ใบ
  const set = msg.raw_message?.image_set;
  const total = set?.total ?? 0;

  // ยังส่งไม่เสร็จ = รูปจาง + วงหมุนทับบนรูป · บอกได้ทีละใบว่าใบไหนถึงคิวแล้ว
  // (ดีกว่าแถบรวมในกล่องพิมพ์ที่บอกแค่ตัวเลข ไม่รู้ว่าเป็นรูปไหน)
  const sending = msg._status === 'sending';

  const img = (
    <div className="relative inline-block">
      <img
        src={imageUrl}
        alt="image"
        className={`max-w-full max-h-64 rounded-lg transition-opacity ${sending ? 'opacity-40' : 'cursor-pointer hover:opacity-90'}`}
        onClick={() => { if (!sending) onOpenLightbox?.(imageUrl); }}
        onLoad={onImageLoad}
      />
      {sending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-gray-600 dark:text-white drop-shadow" />
        </span>
      )}
    </div>
  );

  if (total <= 1) return img;

  return (
    <div className="relative inline-block">
      {img}
      <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[10px] leading-none">
        {set?.index ?? 1}/{total}
      </span>
    </div>
  );
}

// ─── Image album (หลายรูปในฟองเดียว) ────────────────────────────────────────

/**
 * รูปชุดเดียวกันวางติดกันเป็นตาราง — 2 รูปเรียงคู่ · 3 รูปขึ้นไปเป็นกริด 3 คอลัมน์
 * เกิน 6 รูปซ่อนที่เหลือไว้ใต้ป้าย "+N" (กดแล้วเปิด lightbox ที่ใบแรกที่ถูกซ่อน)
 */
export function ImageAlbumBubble({ msg, onOpenLightbox, onImageLoad }: RendererProps) {
  const album = msg.raw_message?.album || [];
  if (album.length === 0) return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;

  const MAX_TILES = 6;
  const tiles = album.slice(0, MAX_TILES);
  const hidden = album.length - tiles.length;
  const cols = album.length === 2 ? 'grid-cols-2' : album.length === 4 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className={`grid ${cols} gap-0.5 rounded-lg overflow-hidden w-[min(66vw,300px)]`}>
      {tiles.map((item, i) => {
        const isLast = i === tiles.length - 1 && hidden > 0;
        return (
          <button
            key={item.messageId}
            type="button"
            // ยังอัปไม่เสร็จ = ยังเป็น blob ในเครื่อง ไม่ใช่รูปจริงบนเซิร์ฟเวอร์ → ยังเปิดดูเต็มไม่ได้
            onClick={() => { if (!item.pending) onOpenLightbox?.(isLast ? album[MAX_TILES - 1].url : item.url); }}
            className="relative aspect-square overflow-hidden bg-black/5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt=""
              loading="lazy"
              onLoad={onImageLoad}
              className={`w-full h-full object-cover transition-opacity ${item.pending ? 'opacity-40' : 'hover:opacity-90'}`}
            />
            {/* วงหมุนอยู่ในช่องของตัวเอง — เห็นทีละใบว่าใบไหนอัปเสร็จแล้ว */}
            {item.pending && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-600 dark:text-white drop-shadow" />
              </span>
            )}
            {isLast && (
              <span className="absolute inset-0 bg-black/55 text-white flex items-center justify-center text-lg font-medium">
                +{hidden}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Video ──────────────────────────────────────────────────────────────────

export function VideoBubble({ msg, onOpenLightbox, onImageLoad }: RendererProps) {
  const videoUrl = msg.raw_message?.videoUrl;
  if (!videoUrl) return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;

  return (
    <div
      className="relative max-w-full max-h-64 rounded-lg cursor-pointer overflow-hidden group"
      onClick={() => onOpenLightbox?.(videoUrl)}
    >
      {msg.raw_message?.previewUrl ? (
        <img
          src={msg.raw_message.previewUrl}
          alt="video preview"
          className="max-w-full max-h-64 rounded-lg"
          onLoad={onImageLoad}
        />
      ) : (
        <div className="w-48 h-32 bg-gray-800 rounded-lg flex items-center justify-center">
          <Play className="w-10 h-10 text-white" />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
        <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
          <Play className="w-6 h-6 text-gray-800 ml-0.5" />
        </div>
      </div>
    </div>
  );
}

// ─── Location ───────────────────────────────────────────────────────────────

export function LocationBubble({ msg }: RendererProps) {
  const { latitude, longitude, address } = msg.raw_message || {};
  if (!latitude || !longitude) return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;

  return (
    <a
      href={`https://www.google.com/maps?q=${latitude},${longitude}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">📍</span>
        <span className="underline">{msg.content}</span>
      </div>
      {address && <p className="text-xs opacity-70 mt-1">{address as string}</p>}
    </a>
  );
}

// ─── Audio ───────────────────────────────────────────────────────────────────

export function AudioBubble({ msg, direction }: RendererProps) {
  const audioUrl = msg.raw_message?.audioUrl;
  if (!audioUrl) return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;

  const duration = msg.raw_message?.duration;
  const durationStr = duration ? formatDuration(duration) : null;

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <Music className={`w-5 h-5 flex-shrink-0 ${direction === 'incoming' ? 'text-gray-500' : 'text-white/80'}`} />
      <div className="flex-1">
        <audio controls className="w-full h-8" style={{ maxWidth: '250px' }}>
          <source src={audioUrl} />
        </audio>
        {durationStr && (
          <span className={`text-xs ${direction === 'incoming' ? 'text-gray-400' : 'text-white/60'}`}>
            {durationStr}
          </span>
        )}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ─── File ───────────────────────────────────────────────────────────────────

export function FileBubble({ msg, direction }: RendererProps) {
  const fileUrl = msg.raw_message?.fileUrl;
  const fileName = msg.raw_message?.fileName || 'ไฟล์';
  const fileSize = msg.raw_message?.fileSize;

  if (!fileUrl) return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;

  const sizeStr = fileSize ? formatFileSize(fileSize) : null;

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-3 p-2 rounded-lg border ${
        direction === 'incoming'
          ? 'border-gray-200 hover:bg-gray-50 dark:border-slate-600 dark:hover:bg-slate-600/50'
          : 'border-white/20 hover:bg-white/10'
      }`}
    >
      <FileText className={`w-8 h-8 flex-shrink-0 ${direction === 'incoming' ? 'text-blue-500' : 'text-white/80'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${direction === 'incoming' ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
          {fileName}
        </p>
        {sizeStr && (
          <p className={`text-xs ${direction === 'incoming' ? 'text-gray-400' : 'text-white/60'}`}>
            {sizeStr}
          </p>
        )}
      </div>
      <Download className={`w-4 h-4 flex-shrink-0 ${direction === 'incoming' ? 'text-gray-400' : 'text-white/60'}`} />
    </a>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Fallback (link) ────────────────────────────────────────────────────────

export function FallbackBubble({ msg }: RendererProps) {
  const linkUrl = msg.raw_message?.linkUrl || msg.raw_message?.templateUrl;
  if (!linkUrl) return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;

  return (
    <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="block">
      <div className="flex items-center gap-2">
        <span className="text-xl">🔗</span>
        <span className="underline break-all">{msg.content}</span>
      </div>
    </a>
  );
}

// ─── Text (default) ─────────────────────────────────────────────────────────

/** URL ในข้อความธรรมดา → ลิงก์กดได้ (ใช้ร่วมกับการ์ดของ marketplace ด้วย) */
export function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all hover:opacity-80">
        {part}
      </a>
    ) : part
  );
}

/**
 * อีโมจิของ LINE (ไม่ใช่ตัวอักษร Unicode) — ในตัวข้อความเป็นแค่ตัวยึดตำแหน่ง `$`
 * ต้องวาดรูปทับตามช่วง index/length ที่ LINE บอกมา ไม่งั้นลูกค้าส่งอะไรมาก็อ่านไม่ออก
 *
 * ช่วงต้องเรียงและห้ามซ้อนกัน — ตัวที่ย้อนหลังกว่าเคอร์เซอร์ให้ข้ามทิ้ง (ข้อมูลเพี้ยน)
 */
function renderLineEmojis(
  text: string,
  emojis: NonNullable<NonNullable<ChatMessage['raw_message']>['emojis']>
) {
  const ranges = emojis
    .filter(e => e && Number.isFinite(e.index) && e.index >= 0 && e.productId && e.emojiId)
    .sort((a, b) => a.index - b.index);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((emoji, i) => {
    if (emoji.index < cursor || emoji.index > text.length) return;
    if (emoji.index > cursor) nodes.push(<span key={`t${i}`}>{linkify(text.slice(cursor, emoji.index))}</span>);
    nodes.push(
      <img
        key={`e${i}`}
        src={lineSticonUrl(emoji.productId, emoji.emojiId)}
        alt=""
        className="inline-block h-5 w-5 align-text-bottom"
      />
    );
    cursor = emoji.index + (emoji.length > 0 ? emoji.length : 1);
  });

  if (cursor < text.length) nodes.push(<span key="tail">{linkify(text.slice(cursor))}</span>);
  return nodes;
}

/** ข้อความที่ถูกอ้างถึง (ตอบกลับ) — สีรับมาจากฟองที่ครอบอยู่ ใช้ได้ทั้งขาเข้า/ขาออก */
export function QuotedMessage({
  quoted,
}: {
  quoted: NonNullable<NonNullable<ChatMessage['raw_message']>['quoted']>;
}) {
  return (
    <div className="border-l-2 border-current/40 pl-2 mb-1 text-xs opacity-80 flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium">ตอบกลับ</p>
        <p className="line-clamp-2 break-words whitespace-pre-wrap">{quoted.content || ''}</p>
      </div>
      {quoted.image_url && (
        <img src={quoted.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
      )}
    </div>
  );
}

export function TextBubble({ msg, onOpenLightbox, onImageLoad }: RendererProps) {
  // อีโมจิของ LINE — ต้องวาดก่อน ไม่ต้องผ่านตัวถอด HTML (LINE ไม่เคยส่ง HTML มา)
  const emojis = msg.raw_message?.emojis;
  if (emojis && emojis.length > 0) {
    return <p className="whitespace-pre-wrap break-words">{renderLineEmojis(msg.content, emojis)}</p>;
  }

  // ข้อความบาง platform (Lazada เป็นหลัก) ฝัง HTML มาในช่อง text — วาดรูป/ลิงก์
  // จริงแทนการโชว์แท็กดิบ · parse เป็น token แล้วให้ React วาด ไม่ยัด HTML เข้า DOM
  if (hasHtmlMarkup(msg.content)) {
    const tokens = parseRichText(msg.content);
    if (tokens.length > 0) {
      return (
        <div className="space-y-1.5">
          <p className="whitespace-pre-wrap break-words">
            {tokens.map((token, i) => {
              if (token.kind === 'br') return <br key={i} />;
              if (token.kind === 'text') return <span key={i}>{token.value}</span>;
              if (token.kind === 'link') {
                return (
                  <a key={i} href={token.url} target="_blank" rel="noopener noreferrer"
                    className="underline break-all hover:opacity-80">
                    {token.label}
                  </a>
                );
              }
              return null;
            })}
          </p>
          {tokens.filter((t): t is { kind: 'image'; url: string } => t.kind === 'image').map((token, i) => (
            <img
              key={`img-${i}`}
              src={token.url}
              alt=""
              loading="lazy"
              className="max-w-full max-h-64 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => onOpenLightbox?.(token.url)}
              onLoad={onImageLoad}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          ))}
        </div>
      );
    }
  }
  return <p className="whitespace-pre-wrap break-words">{linkify(msg.content)}</p>;
}
