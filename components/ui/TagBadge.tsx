'use client';

import { X } from 'lucide-react';

export interface Tag {
  id: string;
  name: string;
  color: string;
  count?: number;
}

// Preset 8 colors
export const TAG_COLORS = [
  '#EF4444', // แดง
  '#F97316', // ส้ม
  '#EAB308', // เหลือง
  '#22C55E', // เขียว
  '#3B82F6', // ฟ้า
  '#8B5CF6', // ม่วง
  '#EC4899', // ชมพู
  '#6B7280', // เทา
];

interface TagBadgeProps {
  tag: Tag;
  size?: 'sm' | 'md' | 'lg';
  onRemove?: () => void;
}

export default function TagBadge({ tag, size = 'md', onRemove }: TagBadgeProps) {
  const bgOpacity = '20'; // 12% opacity hex
  const bg = tag.color + bgOpacity;

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-medium rounded-full whitespace-nowrap ${
        size === 'sm' ? 'px-1.5 py-0 text-xs leading-5' : size === 'lg' ? 'px-3 py-1 text-base' : 'px-2 py-0.5 text-xs'
      }`}
      style={{ backgroundColor: bg, color: tag.color }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 hover:opacity-70 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
