// เลือกช่องทาง/บัญชีแบบติ๊กได้หลายอัน — ปุ่ม + ป๊อปอัปที่มีช่องค้นหา
//
// ทำไมเป็นป๊อปอัปไม่ใช่รายการติ๊กเรียงลงมา: ร้านเดียวมีได้หลายสิบบัญชี
// (ABC the Baby มี FB 7 เพจ · Shopee 6 ร้าน · Lazada 5 ร้าน) เรียงลงมาทั้งหมด
// จะดันเนื้อหาที่เหลือตกจอตั้งแต่ยังไม่เริ่มกรอก
//
// รูปโปรไฟล์ใช้ `ChannelBadge` ตัวเดียวกับหน้าแชท/หน้าตั้งค่าช่องทาง (มี fallback
// เป็นไอคอนแพลตฟอร์มเมื่อรูปโหลดไม่ขึ้นให้แล้ว — URL ของ FB/marketplace หมดอายุกันได้)
//
// ใช้ 2 ที่: หน้าแชท (เลือกอันเดียว + แถว "ทุกช่องทาง") และหน้าสร้างบรอดแคสต์
// (เลือกหลายอัน + ช่องทางที่ยังส่งไม่ได้โชว์แบบกดไม่ได้พร้อมเหตุผล)
'use client';

import { useEffect, useRef, useState } from 'react';
import ChannelBadge from './ChannelBadge';
import { Check, ChevronDown, Layers, Search } from 'lucide-react';

export interface PickerAccount {
  id: string;
  platform: string;
  name: string;
  picture_url?: string | null;
  /** ป้ายท้ายแถว เช่นชื่อแพลตฟอร์ม */
  badge?: string;
  /**
   * กดเลือกไม่ได้ — **ยังต้องโชว์ในรายการ** พร้อมเหตุผล
   * ซ่อนทิ้งไปเลยผู้ใช้จะถามซ้ำว่า "ทำไมไม่มี Shopee"
   */
  disabled?: boolean;
  disabledReason?: string;
}

interface AccountPickerProps {
  accounts: PickerAccount[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** false = เลือกได้อันเดียว แล้วปิดป๊อปอัปทันที (หน้าแชทใช้แบบนี้) */
  multiple?: boolean;
  /** แถวบนสุดที่แปลว่า "ไม่กรอง" — ไม่ส่ง = ไม่มีแถวนี้ */
  allOption?: string;
  placeholder?: string;
  disabled?: boolean;
  /** ข้อความเมื่อไม่มีบัญชีให้เลือกเลย */
  emptyMessage?: string;
  /** ปรับความสูง/กรอบของปุ่มให้เข้ากับแถวเครื่องมือของหน้านั้น */
  triggerClassName?: string;
}

export default function AccountPicker({
  accounts,
  value,
  onChange,
  multiple = true,
  allOption,
  placeholder = 'เลือกช่องทาง',
  disabled,
  emptyMessage = 'ยังไม่มีช่องทางที่ใช้ได้',
  triggerClassName = '',
}: AccountPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // ปิดเมื่อคลิกนอกกล่องหรือกด Esc — ป๊อปอัปที่ปิดไม่ได้คือกับดัก
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = accounts.filter(a => value.includes(a.id));
  const shown = search
    ? accounts.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : accounts;

  const toggle = (id: string) => {
    if (!multiple) {
      onChange(value.includes(id) ? [] : [id]);
      setOpen(false);
      setSearch('');
      return;
    }
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled || accounts.length === 0}
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        className={`w-full min-h-[42px] flex items-center gap-2 px-2.5 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${triggerClassName}`}
      >
        {selected.length === 0 ? (
          <span className="flex-1 text-left text-gray-400 dark:text-slate-400 text-sm">
            {accounts.length === 0 ? emptyMessage : placeholder}
          </span>
        ) : (
          <span className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
            {selected.map(a => (
              <span
                key={a.id}
                className="flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-600 max-w-full"
              >
                <ChannelBadge channel={{ platform: a.platform, picture_url: a.picture_url }} size="sm" />
                <span className="text-sm text-gray-900 dark:text-white truncate">{a.name}</span>
              </span>
            ))}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
          {accounts.length > 5 && (
            <div className="p-2 border-b border-gray-100 dark:border-slate-700 relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาบัญชี..."
                autoFocus
                className="w-full pl-8 pr-2.5 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
          <div className="overflow-y-auto py-1">
            {allOption && !search && (
              <button
                type="button"
                onClick={() => { onChange([]); if (!multiple) { setOpen(false); setSearch(''); } }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${value.length === 0 ? 'bg-orange-50/60 dark:bg-orange-950/20' : ''}`}
              >
                <span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-3.5 h-3.5 text-gray-400" />
                </span>
                <span className="flex-1 text-gray-900 dark:text-white">{allOption}</span>
                {value.length === 0 && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
            )}
            {shown.length === 0 ? (
              <p className="px-3 py-4 text-sm text-center text-gray-400 dark:text-slate-400">ไม่พบบัญชีที่ตรงกับคำค้น</p>
            ) : shown.map(a => {
              const active = value.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={a.disabled}
                  onClick={() => toggle(a.id)}
                  className={`w-full flex items-start gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                    a.disabled
                      ? 'opacity-55 cursor-not-allowed'
                      : `hover:bg-gray-50 dark:hover:bg-slate-700 ${active ? 'bg-orange-50/60 dark:bg-orange-950/20' : ''}`
                  }`}
                >
                  <span className="mt-0.5 flex-shrink-0">
                    <ChannelBadge channel={{ platform: a.platform, picture_url: a.picture_url }} size="sm" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-gray-900 dark:text-white">{a.name}</span>
                    {a.disabled && a.disabledReason && (
                      <span className="block helper-text text-gray-500 dark:text-slate-400">{a.disabledReason}</span>
                    )}
                  </span>
                  {a.badge && <span className="helper-text text-gray-400 dark:text-slate-500 flex-shrink-0 mt-0.5">{a.badge}</span>}
                  {active && <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
