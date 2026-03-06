'use client';

import { ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  text: string;
  position?: 'top' | 'bottom';
}

export default function Tooltip({ children, text, position = 'top' }: TooltipProps) {
  const isTop = position === 'top';

  return (
    <div className="relative group">
      {children}
      <div
        className={`absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${
          isTop ? 'bottom-full mb-2' : 'top-full mt-2'
        }`}
      >
        <div className="relative bg-gray-900 dark:bg-slate-700 text-white text-sm rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
          {text.includes('\n') ? text.split('\n').map((line, i) => <div key={i}>{line}</div>) : text}
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-slate-700 rotate-45 ${
              isTop ? '-bottom-1' : '-top-1'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
