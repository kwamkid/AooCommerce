'use client';

import type { ReactNode } from 'react';
import SearchInput from './SearchInput';

interface ListFilterBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  summary?: ReactNode;
}

/** Standard search + summary row for list pages. */
export default function ListFilterBar({ value, onChange, placeholder, summary }: ListFilterBarProps) {
  return (
    <div className="data-filter-card">
      <div className="list-filter-row">
        <div className="list-filter-search">
          <SearchInput value={value} onChange={onChange} placeholder={placeholder} />
        </div>
        {summary && <div className="list-filter-summary">{summary}</div>}
      </div>
    </div>
  );
}
