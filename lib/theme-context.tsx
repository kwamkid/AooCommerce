'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'aoo-theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * หน้าร้าน (/store/*) สว่างเสมอ — ธีมเป็นของร้าน ไม่ใช่ของเครื่องผู้เข้าชม
 *
 * CSS ของหน้าร้าน (sf-*) ไม่มีโทนมืดอยู่แล้ว แต่หน้า checkout ยืม component กลาง
 * มาใช้ (DateRangePicker, FormSelect) ซึ่งมี `dark:` ของ Tailwind ติดมาด้วย —
 * ถ้าปล่อยให้ class `dark` ติดที่ <html> ตามเครื่องลูกค้า ช่องวันที่กับ dropdown
 * จะกลายเป็นสีเข้มอยู่กลางหน้าร้านสีสว่าง
 */
function isStorefrontPath(pathname: string | null): boolean {
  return !!pathname && pathname.startsWith('/store/');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  const pathname = usePathname();
  const forceLightRef = useRef(false);
  forceLightRef.current = isStorefrontPath(pathname);

  const applyTheme = useCallback((t: Theme) => {
    const resolved = forceLightRef.current ? 'light' : (t === 'system' ? getSystemTheme() : t);
    setResolvedTheme(resolved);

    const root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  // Init from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial = stored || 'system';
    setThemeState(initial);
    applyTheme(initial);
  }, [applyTheme]);

  // เข้า/ออกหน้าร้านระหว่าง client-side nav — provider ไม่ remount ต้องทาธีมใหม่เอง
  useEffect(() => { applyTheme(theme); }, [pathname, theme, applyTheme]);

  // Listen for system theme changes
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme, applyTheme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(t);
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
