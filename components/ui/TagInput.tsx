'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import TagBadge, { Tag, TAG_COLORS } from './TagBadge';
import { apiFetch } from '@/lib/api-client';

interface TagInputProps {
  value: Tag[];
  onChange: (tags: Tag[]) => void;
  allTags: Tag[]; // all available tags for the company
  onTagCreated?: (tag: Tag) => void; // callback when new tag is created inline
  placeholder?: string;
  size?: 'sm' | 'md';
}

export default function TagInput({
  value,
  onChange,
  allTags,
  onTagCreated,
  placeholder = 'เพิ่มแท็ก...',
  size = 'md',
}: TagInputProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedIds = new Set(value.map(t => t.id));
  const filtered = allTags.filter(
    t => !selectedIds.has(t.id) && t.name.toLowerCase().includes(search.toLowerCase())
  );
  const exactMatch = allTags.some(t => t.name.toLowerCase() === search.trim().toLowerCase());
  const canCreate = search.trim().length > 0 && !exactMatch;

  const handleSelect = (tag: Tag) => {
    onChange([...value, tag]);
    setSearch('');
    inputRef.current?.focus();
  };

  const handleRemove = (tagId: string) => {
    onChange(value.filter(t => t.id !== tagId));
  };

  const handleCreate = async () => {
    if (!search.trim() || creating) return;
    setCreating(true);
    try {
      // Pick a color not yet used, or cycle
      const usedColors = new Set(allTags.map(t => t.color));
      const nextColor = TAG_COLORS.find(c => !usedColors.has(c)) || TAG_COLORS[allTags.length % TAG_COLORS.length];

      const res = await apiFetch('/api/customers/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: search.trim(), color: nextColor }),
      });
      if (res.ok) {
        const { tag } = await res.json();
        onTagCreated?.(tag);
        onChange([...value, tag]);
        setSearch('');
        inputRef.current?.focus();
      }
    } catch {
      // silent fail
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0) {
        handleSelect(filtered[0]);
      } else if (canCreate) {
        handleCreate();
      }
    }
    if (e.key === 'Backspace' && !search && value.length > 0) {
      handleRemove(value[value.length - 1].id);
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Selected tags + input */}
      <div
        className={`flex flex-wrap items-center gap-1 min-h-[42px] px-2 py-1.5 border rounded-lg cursor-text transition-colors bg-white dark:bg-slate-700 ${
          open ? 'ring-2 ring-[#F4511E] border-transparent' : 'border-gray-300 dark:border-slate-600'
        }`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {value.map(tag => (
          <TagBadge key={tag.id} tag={tag} size={size} onRemove={() => handleRemove(tag.id)} />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 py-0.5"
        />
      </div>

      {/* Dropdown */}
      {open && (filtered.length > 0 || canCreate) && (
        <div className="absolute left-0 right-0 z-50 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(tag => (
            <button
              key={tag.id}
              type="button"
              onClick={() => handleSelect(tag)}
              className="w-full text-left px-3 py-2 text-base hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span className="text-gray-900 dark:text-white">{tag.name}</span>
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="w-full text-left px-3 py-2 text-base hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors text-[#F4511E] border-t border-gray-100 dark:border-slate-700"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>สร้างแท็ก &quot;{search.trim()}&quot;</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
