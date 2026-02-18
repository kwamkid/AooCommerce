// Path: app/pos/components/CategoryTabs.tsx
'use client';

interface Category {
  id: string;
  name: string;
}

interface CategoryTabsProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function CategoryTabs({ categories, selectedId, onSelect }: CategoryTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <button
        onClick={() => onSelect(null)}
        className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          selectedId === null
            ? 'bg-[#F4511E] text-white'
            : 'bg-white/10 text-gray-300 hover:bg-white/20'
        }`}
      >
        ทั้งหมด
      </button>
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            selectedId === cat.id
              ? 'bg-[#F4511E] text-white'
              : 'bg-white/10 text-gray-300 hover:bg-white/20'
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
