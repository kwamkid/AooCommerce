// Product search in the storefront header.
// Submits to the catalog page as ?q= so the result page stays a real,
// server-rendered URL that can be shared and bookmarked.
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { storefrontHref } from '@/lib/storefront';

export default function SearchBox({ shop }: { shop: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') || '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `${storefrontHref(shop)}?q=${encodeURIComponent(q)}` : storefrontHref(shop));
  };

  const clear = () => {
    setValue('');
    router.push(storefrontHref(shop));
  };

  return (
    <form className="sf-search" onSubmit={submit} role="search">
      <Search className="sf-search-icon" strokeWidth={1.75} aria-hidden="true" />
      <input
        type="search"
        className="sf-search-input"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="ค้นหาสินค้า..."
        aria-label="ค้นหาสินค้า"
      />
      {value && (
        <button type="button" className="sf-search-clear" onClick={clear} aria-label="ล้างคำค้นหา">
          <X strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
