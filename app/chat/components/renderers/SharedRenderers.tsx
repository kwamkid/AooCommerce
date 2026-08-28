'use client';

import { Play, FileText, Download, Music } from 'lucide-react';
import { ChatMessage } from '@/app/chat/lib/chatTypes';
import { hasHtmlMarkup, parseRichText } from '@/app/chat/lib/richText';

interface RendererProps {
  msg: ChatMessage;
  direction: 'incoming' | 'outgoing';
  onOpenLightbox?: (url: string) => void;
  onImageLoad?: () => void;
}

// ─── Sticker ────────────────────────────────────────────────────────────────

export function StickerBubble({ msg }: RendererProps) {
  // LINE sticker: use stickerId to build CDN URL
  const lineStickerId = msg.raw_message?.stickerId;
  if (lineStickerId) {
    return (
      <img
        src={`https://stickershop.line-scdn.net/stickershop/v1/sticker/${lineStickerId}/iPhone/sticker@2x.png`}
        alt="sticker"
        className="w-24 h-24 object-contain"
        onError={(e) => {
          const img = e.target as HTMLImageElement;
          if (img.src.includes('sticker@2x.png'))
            img.src = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${lineStickerId}/iPhone/sticker.png`;
          else if (img.src.includes('iPhone/sticker.png'))
            img.src = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${lineStickerId}/android/sticker.png`;
        }}
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

  return (
    <img
      src={imageUrl}
      alt="image"
      className="max-w-full max-h-64 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
      onClick={() => onOpenLightbox?.(imageUrl)}
      onLoad={onImageLoad}
    />
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

function linkify(text: string) {
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

export function TextBubble({ msg, onOpenLightbox, onImageLoad }: RendererProps) {
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
