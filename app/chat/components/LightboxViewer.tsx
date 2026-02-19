'use client';

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Play, Images } from 'lucide-react';

interface MediaItem {
  url: string;
  type: 'image' | 'video';
  timestamp: string;
}

interface LightboxViewerProps {
  mediaList: MediaItem[];
  currentIndex: number;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}

export default function LightboxViewer({ mediaList, currentIndex, onClose, onChangeIndex }: LightboxViewerProps) {
  const [showGallery, setShowGallery] = useState(false);
  const currentMedia = mediaList[currentIndex];

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={() => { onClose(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          if (showGallery) setShowGallery(false);
          else onClose();
        }
        if (!showGallery) {
          if (e.key === 'ArrowLeft' && currentIndex > 0) onChangeIndex(currentIndex - 1);
          if (e.key === 'ArrowRight' && currentIndex < mediaList.length - 1) onChangeIndex(currentIndex + 1);
        }
      }}
      tabIndex={0} ref={(el) => el?.focus()}>
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
        <span className="text-white/70 text-sm">{showGallery ? `แกลเลอรี่ (${mediaList.length})` : `${currentIndex + 1} / ${mediaList.length}`}</span>
        <div className="flex items-center gap-2">
          {!showGallery && currentMedia && (
            <button onClick={async (e) => {
              e.stopPropagation();
              try {
                const res = await fetch(currentMedia.url);
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                const ext = currentMedia.type === 'video' ? 'mp4' : 'jpg';
                a.download = `chat-${Date.now()}.${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
              } catch {
                window.open(currentMedia.url, '_blank');
              }
            }}
              className="p-2.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors text-white" title="บันทึก">
              <Download className="w-5 h-5" />
            </button>
          )}
          {mediaList.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); setShowGallery(!showGallery); }}
              className={`p-2.5 rounded-full transition-colors text-white ${showGallery ? 'bg-white/40' : 'bg-white/20 hover:bg-white/30'}`} title="แกลเลอรี่">
              <Images className="w-5 h-5" />
            </button>
          )}
          <button onClick={() => onClose()} className="p-2.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors text-white" title="ปิด">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showGallery ? (
        <div className="max-w-lg w-full max-h-[80vh] overflow-y-auto p-4 mt-14" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-3 gap-2">
            {mediaList.map((media, idx) => (
              <button key={idx} onClick={() => { setShowGallery(false); onChangeIndex(idx); }}
                className={`relative aspect-square rounded-lg overflow-hidden bg-gray-800 hover:opacity-80 transition-opacity ${currentIndex === idx ? 'ring-2 ring-white' : ''}`}>
                {media.type === 'image' ? (
                  <img src={media.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                      <Play className="w-8 h-8 text-white/80" />
                    </div>
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">VDO</div>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : currentMedia ? (
        <>
          <button onClick={(e) => { e.stopPropagation(); onChangeIndex(currentIndex - 1); }} disabled={currentIndex <= 0}
            className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-2 md:p-3 bg-white/20 hover:bg-white/30 disabled:opacity-20 disabled:cursor-not-allowed rounded-full transition-colors text-white z-10" title="รูปก่อนหน้า">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onChangeIndex(currentIndex + 1); }} disabled={currentIndex >= mediaList.length - 1}
            className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-2 md:p-3 bg-white/20 hover:bg-white/30 disabled:opacity-20 disabled:cursor-not-allowed rounded-full transition-colors text-white z-10" title="รูปถัดไป">
            <ChevronRight className="w-6 h-6" />
          </button>
          <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {currentMedia.type === 'image' ? (
              <img src={currentMedia.url} alt="Full size" className="max-w-full max-h-[85vh] object-contain rounded-lg select-none" draggable={false} />
            ) : (
              <video key={currentMedia.url} src={currentMedia.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg">เบราว์เซอร์ไม่รองรับการเล่นวิดีโอ</video>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
