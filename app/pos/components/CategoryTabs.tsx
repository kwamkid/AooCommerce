// Path: app/pos/components/CategoryTabs.tsx
'use client';

interface FilterItem {
  id: string;
  name: string;
}

interface CategoryTabsProps {
  categories: FilterItem[];
  brands: FilterItem[];
  selectedCategoryId: string | null;
  selectedBrandId: string | null;
  onSelectCategory: (id: string | null) => void;
  onSelectBrand: (id: string | null) => void;
}

export default function CategoryTabs({ categories, brands, selectedCategoryId, selectedBrandId, onSelectCategory, onSelectBrand }: CategoryTabsProps) {
  const hasFilter = selectedCategoryId || selectedBrandId;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <button
        onClick={() => { onSelectCategory(null); onSelectBrand(null); }}
        className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          !hasFilter
            ? 'bg-primary text-white'
            : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-white/20'
        }`}
      >
        ทั้งหมด
      </button>
      {categories.map(cat => (
        <button
          key={`cat-${cat.id}`}
          onClick={() => { onSelectCategory(selectedCategoryId === cat.id ? null : cat.id); onSelectBrand(null); }}
          className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            selectedCategoryId === cat.id
              ? 'bg-primary text-white'
              : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-white/20'
          }`}
        >
          {cat.name}
        </button>
      ))}
      {brands.length > 0 && categories.length > 0 && (
        <div className="flex-shrink-0 w-px bg-gray-300 dark:bg-gray-600 my-1" />
      )}
      {brands.map(brand => (
        <button
          key={`brand-${brand.id}`}
          onClick={() => { onSelectBrand(selectedBrandId === brand.id ? null : brand.id); onSelectCategory(null); }}
          className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            selectedBrandId === brand.id
              ? 'bg-blue-600 text-white'
              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30'
          }`}
        >
          {brand.name}
        </button>
      ))}
    </div>
  );
}
