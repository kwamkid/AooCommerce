// Path: components/ThemeToggle.tsx
'use client';

import { useTheme } from '@/lib/theme-context';
import { Sun, Moon, Monitor } from 'lucide-react';

interface ThemeToggleProps {
  className?: string;
  iconClassName?: string;
}

const cycle = ['light', 'dark', 'system'] as const;

export default function ThemeToggle({ className = '', iconClassName = 'w-4 h-4' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  const next = () => {
    const idx = cycle.indexOf(theme);
    setTheme(cycle[(idx + 1) % cycle.length]);
  };

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const label = theme === 'light' ? 'สว่าง' : theme === 'dark' ? 'มืด' : 'ตามระบบ';

  return (
    <button
      onClick={next}
      className={`p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors ${className}`}
      title={`ธีม: ${label}`}
    >
      <Icon className={iconClassName} />
    </button>
  );
}
