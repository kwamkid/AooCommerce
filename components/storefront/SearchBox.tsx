// Product search — an icon in the header actions that opens a full-width bar.
// Submits to the catalog page as ?q= so results stay a real, server-rendered
// URL that can be shared and bookmarked (not client-only filter state).
'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CloseIcon, LoadingIcon, SearchIcon } from '@/lib/icons';
import { storefrontHref } from '@/lib/storefront';

export default function SearchBox({ shop }: { shop: string }) {
  const router = useRouter();
  const params = useSearchParams();
  // หน้ารายการเป็น SSR — กด "ค้นหา" แล้วต้องรอ 200–600ms ก่อนหน้าจะเปลี่ยน
  // useTransition ทำให้รู้ว่ายังเดินทางอยู่ จะได้ขึ้นสถานะที่ปุ่มแทนที่จะนิ่งสนิท
  const [isPending, startTransition] = useTransition();
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
    startTransition(() => {
      router.push(q ? `${storefrontHref(shop)}?q=${encodeURIComponent(q)}` : storefrontHref(shop));
    });
  };

  const close = () => {
    setOpen(false);
    setValue('');
    if (activeQuery) startTransition(() => router.push(storefrontHref(shop)));
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
          ? <CloseIcon strokeWidth={1.75} aria-hidden="true" />
          : <SearchIcon strokeWidth={1.75} aria-hidden="true" />}
      </button>

      {open && (
        <div className="sf-search-panel">
          <form className="sf-search" onSubmit={submit} role="search">
            <SearchIcon className="sf-search-icon" strokeWidth={1.75} aria-hidden="true" />
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
            {value && (
              /* ล้างคำที่พิมพ์ทั้งหมด (ไม่ปิดกล่อง ไม่ยิงค้นหา) — คนละปุ่มกับ X บนหัวร้านที่ปิดกล่อง */
              <button
                type="button"
                className="sf-search-clear"
                onClick={() => { setValue(''); inputRef.current?.focus(); }}
                aria-label="ล้างคำค้นหา"
              >
                <CloseIcon strokeWidth={2} aria-hidden="true" />
              </button>
            )}
            <button
              type="submit"
              className="sf-search-go"
              disabled={isPending}
              aria-busy={isPending}
            >
              {isPending && <LoadingIcon className="sf-skel-spin" strokeWidth={2} aria-hidden="true" />}
              ค้นหา
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
