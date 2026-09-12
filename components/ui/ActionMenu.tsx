'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { useDropUp } from '@/lib/useDropUp';

export interface ActionItem {
  key: string;
  label: React.ReactNode;
  description?: string;
  icon: React.ReactNode;
  /** Optional node rendered at the far right of the menu item (e.g. a print status dot) */
  suffix?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  /** เมนูที่สำคัญที่สุดของ dropdown นี้ — สีแบรนด์ + ตัวหนา · ปกติ 1 รายการต่อเมนู
   *  (ได้มากสุด 2 เมื่อเป็นชุดที่ต้องทำคู่กัน เช่น ใบจัดของ + ใบปะหน้า)
   *  เกณฑ์คือ **งานของสถานะนี้** ไม่ใช่ "เมนูที่ดูสำคัญ": แท็บที่ต้องจัดส่ง = เอกสารแพ็คของ ·
   *  แท็บอื่น = พิมพ์ทั้งหมด / ออกใบกำกับแบบเต็ม · ที่เหลือ (แก้ไข · สั่งซ้ำ · พักไว้) = ปกติ */
  primary?: boolean;
  /** หนีจากสไตล์กลาง — ปกติไม่ต้องใช้ ใช้ `primary` / `danger` แทน
   *  ห้ามส่งคลาสปุ่มไอคอน (p-1.5 text-gray-400 …) มาที่นี่ ตัวหนังสือจะจางเหมือนกดไม่ได้ */
  className?: string;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
}

interface ActionMenuProps {
  items: ActionItem[];
  /** Custom trigger content (replaces the default three-dot icon) */
  trigger?: React.ReactNode;
  /** ClassName for the trigger button — required look when using a custom trigger (e.g. "btn btn-md btn-primary") */
  triggerClassName?: string;
  /**
   * Menu opens above (default — table rows) or below the trigger (header buttons)
   * · `auto` = วัดความสูงเมนูจริง เปิดด้านล่าง เว้นแต่ที่ว่างข้างล่างไม่พอและข้างบนเหลือมากกว่า
   *   (ปุ่มกลางเนื้อหาที่เลื่อนไปอยู่ตรงไหนของจอก็ได้ เช่น "+ เพิ่มบล็อก" — เมนูปิดเมื่อเลื่อนหน้า
   *   จึงเลื่อนไปดูส่วนที่ล้นจอไม่ได้)
   */
  placement?: 'top' | 'bottom' | 'auto';
  /**
   * ขอบเมนูเทียบกับปุ่ม — `end` (ค่าเริ่มต้น) ขอบขวาตรงกัน · `start` ขอบซ้ายตรงกัน
   * ปุ่มที่อยู่ชิดซ้ายของเนื้อหาต้องใช้ `start` ไม่งั้นเมนูล้นขอบซ้ายจอบนมือถือ
   */
  align?: 'start' | 'end';
}

export default function ActionMenu({ items, trigger, triggerClassName, placement = 'top', align = 'end' }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** ตำแหน่งปุ่มตอนกดเปิด — เมนูปิดเองเมื่อเลื่อนหน้า จึงไม่ต้องตามตำแหน่งระหว่างเปิด */
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  // auto: วัดความสูงจริงของเมนูก่อน paint (useDropUp แบบ layout) — ไม่เห็นเมนูแวบข้างล่างก่อนพลิกขึ้น
  const { dropUp: autoUp } = useDropUp(buttonRef, {
    open: open && placement === 'auto',
    estimatedHeight: items.length * 40 + 8,
    dropdownRef: menuRef,
    margin: 8,
    requireMoreSpaceAbove: true,
    layout: true,
  });

  useEffect(() => {
    if (!open) return;

    const handleClose = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleScroll = () => setOpen(false);

    document.addEventListener('mousedown', handleClose);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClose);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  if (items.length === 0) return null;

  const up = placement === 'auto' ? autoUp : placement === 'top';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!open && buttonRef.current) setAnchor(buttonRef.current.getBoundingClientRect());
          setOpen(!open);
        }}
        className={triggerClassName ?? 'p-1.5 text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-100 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700'}
      >
        {trigger ?? <MoreVertical className="w-4 h-4" />}
      </button>

      {open && anchor && createPortal(
        <div
          ref={menuRef}
          className="fixed w-max min-w-[11rem] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1"
          style={{
            top: up ? anchor.top - 4 : anchor.bottom + 4,
            left: align === 'start' ? anchor.left : anchor.right,
            transform: `translate(${align === 'start' ? '0' : '-100%'}, ${up ? '-100%' : '0'})`,
            zIndex: 9999,
          }}
        >
          {items.map((item, idx) => (
            <div key={item.key}>
              {idx > 0 && item.dividerBefore && <div className="border-t border-gray-200 dark:border-slate-700 my-1" />}
              <button
                onClick={(e) => { e.stopPropagation(); if (item.disabled) return; setOpen(false); item.onClick?.(e); }}
                // หน้าตาทั้งหมดอยู่ที่ `.action-menu-item` ใน globals.css ที่เดียว
                // (เขียนคลาสเต็มเป็น literal เพื่อให้ Tailwind มองเห็น ไม่ถูก purge)
                className={[
                  item.disabled ? 'action-menu-item disabled'
                    : item.danger ? 'action-menu-item danger'
                    : item.primary ? 'action-menu-item primary'
                    : 'action-menu-item',
                  item.className || '',
                ].filter(Boolean).join(' ')}
              >
                {item.icon}
                <span className="flex flex-col flex-1">
                  <span>{item.label}</span>
                  {item.description && <span className="action-menu-item-desc">{item.description}</span>}
                </span>
                {item.suffix}
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
