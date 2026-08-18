// Product search — an icon in the header actions that opens a full-width bar.
// Submits to the catalog page as ?q= so results stay a real, server-rendered
// URL that can be shared and bookmarked (not client-only filter state).
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { storefrontHref } from '@/lib/storefront';

export default function SearchBox({ shop }: { shop: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const activeQuery = params.get('q') || '';

  // เปิดค้างไว้ถ้ากำลังดูผลค้นหาอยู่ — ผู้ใช้จะได้เห็นว่าค้นด้วยคำอะไร
  const [open, setOpen] = useState(!!activeQuery);
  const [value, setValue] = useState(activeQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // popover ต้องปิดเมื่อคลิกที่อื่น ไม่งั้นมันค้างทับเนื้อหาอยู่อย่างนั้น
  // (แถบเต็มความกว้างแบบเดิมไม่มีปัญหานี้เพราะมันดันเนื้อหาลงไม่ได้ทับ)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `${storefrontHref(shop)}?q=${encodeURIComponent(q)}` : storefrontHref(shop));
  };

  const close = () => {
    setOpen(false);
    setValue('');
    if (activeQuery) router.push(storefrontHref(shop));
  };

  return (
    <div className="sf-search-pop" ref={popRef}>
      <button
        type="button"
        className="sf-icon-btn"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? 'ปิดการค้นหา' : 'ค้นหาสินค้า'}
        aria-expanded={open}
        title="ค้นหาสินค้า"
      >
        {open
          ? <X strokeWidth={1.75} aria-hidden="true" />
          : <Search strokeWidth={1.75} aria-hidden="true" />}
      </button>

      {open && (
        <div className="sf-search-panel">
          <form className="sf-search" onSubmit={submit} role="search">
            <Search className="sf-search-icon" strokeWidth={1.75} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              className="sf-search-input"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') close(); }}
              placeholder="ค้นหาสินค้า..."
              aria-label="ค้นหาสินค้า"
            />
            <button type="submit" className="sf-search-go">ค้นหา</button>
          </form>
        </div>
      )}
    </div>
  );
}
