// Path: app/chat/components/SavedReplyPicker.tsx
//
// รายการข้อความสำเร็จรูปที่ลอยเหนือกล่องพิมพ์ — **เป็นตัววาดอย่างเดียว**
// คำค้นกับตัวที่กำลังเลือกอยู่ (activeIndex) ถือไว้ที่หน้าแชท เพราะเปิดได้ 2 ทาง:
//   1. กดปุ่มข้างกล่องพิมพ์ → ค้นในช่องของ picker เอง
//   2. พิมพ์ `/` ในกล่องพิมพ์ → ค้นจากสิ่งที่พิมพ์ต่อท้าย `/` และกด ↑↓ Enter จากกล่องพิมพ์
// ถ้าให้ picker ถือ state เอง ทางที่ 2 จะต้องยิง state ข้ามกันไปมา
//
// **แก้ไข/เพิ่มได้จากที่นี่เลย ไม่ต้องเด้งไปหน้า settings** — ดินสอท้ายแถวกับปุ่มท้ายกล่อง
// ส่งงานต่อให้ `SavedReplyModal` ตัวเดียวกับที่หน้าจัดการใช้ กติกาจึงไม่หลุดกันสองที่
'use client';

import { useEffect, useRef } from 'react';
import { Search, Plus, Settings2, MessageSquareText, Loader2, Pencil } from 'lucide-react';
import Link from 'next/link';
import Tooltip from '@/components/ui/Tooltip';
import { savedReplyPreview, type SavedReply } from '@/lib/chat/saved-replies';

interface Props {
  replies: SavedReply[];
  loading: boolean;
  /** ตัวที่ไฮไลต์อยู่ (คีย์บอร์ด) — -1 = ยังไม่เลือกอะไร */
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
  onSelect: (reply: SavedReply) => void;
  onClose: () => void;
  /** โหมดปุ่ม: โชว์ช่องค้นในตัว · โหมด `/`: คำค้นอยู่ในกล่องพิมพ์ ไม่ต้องมีช่องซ้ำ */
  showSearch: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  /** กด "บันทึกข้อความที่พิมพ์อยู่" — ไม่ส่งมา = ไม่มีอะไรให้บันทึก */
  onSaveCurrent?: () => void;
  /** กดเพิ่มข้อความใหม่ (เปล่า ๆ) — ใช้ตอนไม่มีอะไรพิมพ์ค้างไว้ */
  onCreate?: () => void;
  /** กดดินสอท้ายแถว — เปิดโมดัลแก้ไขใบนั้นในหน้าแชท */
  onEdit?: (reply: SavedReply) => void;
  canManage: boolean;
}

export default function SavedReplyPicker({
  replies, loading, activeIndex, onActiveIndexChange, onSelect, onClose,
  showSearch, search, onSearchChange, onSaveCurrent, onCreate, onEdit, canManage,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
  }, [showSearch]);

  // เลื่อนตัวที่ไฮไลต์ให้อยู่ในสายตาเสมอ — กด ↓ จากกล่องพิมพ์แล้วรายการต้องตามมาเอง
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div
      data-saved-reply-picker
      className="fixed inset-x-2 bottom-16 md:absolute md:inset-x-auto md:bottom-full md:left-0 md:w-[380px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-30 md:mb-2 flex flex-col"
      style={{ maxHeight: '340px' }}
    >
      {showSearch && (
        <div className="p-2 border-b border-gray-100 dark:border-slate-700 relative flex-shrink-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            ref={searchRef}
            value={search}
            onChange={e => { onSearchChange(e.target.value); onActiveIndexChange(0); }}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
              if (e.key === 'ArrowDown') { e.preventDefault(); onActiveIndexChange(Math.min(activeIndex + 1, replies.length - 1)); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); onActiveIndexChange(Math.max(activeIndex - 1, 0)); return; }
              if (e.key === 'Enter' && replies[activeIndex]) { e.preventDefault(); onSelect(replies[activeIndex]); }
            }}
            placeholder="ค้นหา... (หรือพิมพ์ / ในช่องแชท)"
            className="w-full h-8 pl-7 pr-2 text-sm border border-gray-200 dark:border-slate-600 dark:bg-slate-900 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="subtitle-text">กำลังโหลด...</span>
          </div>
        ) : replies.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <MessageSquareText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="subtitle-text text-gray-500">
              {search ? 'ไม่พบข้อความที่ค้น' : 'ยังไม่มีข้อความสำเร็จรูป'}
            </p>
          </div>
        ) : (
          replies.map((r, i) => (
            <div
              key={r.id}
              data-idx={i}
              onMouseEnter={() => onActiveIndexChange(i)}
              className={`group flex items-start transition-colors ${
                i === activeIndex ? 'bg-primary/10' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
              }`}
            >
              <button
                onClick={() => onSelect(r)}
                className="min-w-0 flex-1 flex items-start gap-2.5 pl-3 pr-1 py-2 text-left"
              >
                {r.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image_url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0 mt-0.5" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{r.title}</span>
                  {/* 2 บรรทัด — บรรทัดเดียวตัดจนแยกไม่ออกว่าใบไหนเป็นใบไหน */}
                  <span className="block helper-text text-gray-500 dark:text-slate-400 line-clamp-2">{savedReplyPreview(r, 160)}</span>
                </span>
              </button>
              {onEdit && (
                <Tooltip text="แก้ไขข้อความนี้">
                  {/* จอสัมผัสไม่มี hover — โชว์ตลอดบนมือถือ ซ่อนรอ hover เฉพาะจอใหญ่ */}
                  <button
                    onClick={() => onEdit(r)}
                    aria-label={`แก้ไข ${r.title}`}
                    className="flex-shrink-0 mt-1.5 mr-1.5 p-1.5 rounded-md text-gray-400 hover:text-primary hover:bg-white dark:hover:bg-slate-800 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-opacity"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-gray-100 dark:border-slate-700 flex-shrink-0">
        {/* มีข้อความพิมพ์ค้างอยู่ = เก็บอันนั้น · ไม่มี = เพิ่มใบใหม่เปล่า ๆ */}
        {onSaveCurrent ? (
          <button
            onClick={onSaveCurrent}
            className="flex items-center gap-1 helper-text text-primary hover:underline px-1 py-0.5"
          >
            <Plus className="w-3.5 h-3.5" />บันทึกข้อความที่พิมพ์อยู่
          </button>
        ) : onCreate ? (
          <button
            onClick={onCreate}
            className="flex items-center gap-1 helper-text text-primary hover:underline px-1 py-0.5"
          >
            <Plus className="w-3.5 h-3.5" />เพิ่มใหม่
          </button>
        ) : <span className="helper-text text-gray-400 px-1">พิมพ์ / ในช่องแชทเพื่อค้นได้เลย</span>}

        {canManage && (
          <Link
            href="/settings/saved-replies"
            className="flex items-center gap-1 helper-text text-gray-500 hover:text-primary px-1 py-0.5"
          >
            <Settings2 className="w-3.5 h-3.5" />จัดการ
          </Link>
        )}
      </div>
    </div>
  );
}
