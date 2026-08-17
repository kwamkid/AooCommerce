// Light/dark switch for the storefront.
//
// Uses its own key + attribute (`aoo-sf-theme` / data-sf-theme), NOT the admin
// theme (`aoo-theme` / .dark): a shopper's preference on the shop must not
// change the owner's back-office theme, and vice versa.
//
// Three states are supported by the CSS — no attribute = follow the device,
// data-sf-theme="light"/"dark" = explicit. Clicking always writes an explicit
// choice, which is what a visitor expects from a toggle.
'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

const KEY = 'aoo-sf-theme';

export default function ThemeToggle() {
  // null until mounted — the server can't know the device preference, so the
  // icon is only rendered after hydration to avoid a mismatch.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    if (stored === 'dark' || stored === 'light') {
      setDark(stored === 'dark');
    } else {
      setDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    try { localStorage.setItem(KEY, next ? 'dark' : 'light'); } catch { /* private mode */ }
    document.documentElement.setAttribute('data-sf-theme', next ? 'dark' : 'light');
  };

  return (
    <button
      type="button"
      className="sf-icon-btn"
      onClick={toggle}
      aria-label={dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
      title={dark ? 'โหมดสว่าง' : 'โหมดมืด'}
    >
      {dark === null
        ? <span className="sf-icon-placeholder" aria-hidden="true" />
        : dark
          ? <Sun strokeWidth={1.75} aria-hidden="true" />
          : <Moon strokeWidth={1.75} aria-hidden="true" />}
    </button>
  );
}
