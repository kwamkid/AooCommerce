'use client';

import { ReactNode, useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  children: ReactNode;
  text: string;
  position?: 'top' | 'bottom';
}

export default function Tooltip({ children, text, position = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const isTop = position === 'top';

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: isTop ? rect.top - 8 : rect.bottom + 8,
      left: rect.left + rect.width / 2,
    });
  }, [isTop]);

  useEffect(() => {
    if (!visible) return;
    updatePosition();
  }, [visible, updatePosition]);

  return (
    <div
      ref={triggerRef}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && coords && createPortal(
        <div
          className="fixed pointer-events-none"
          style={{
            top: coords.top,
            left: coords.left,
            transform: isTop ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            zIndex: 10000,
          }}
        >
          <div className="relative bg-gray-900 dark:bg-slate-700 text-white text-sm rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
            {text.includes('\n') ? text.split('\n').map((line, i) => <div key={i}>{line}</div>) : text}
            <div
              className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-slate-700 rotate-45 ${
                isTop ? '-bottom-1' : '-top-1'
              }`}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
