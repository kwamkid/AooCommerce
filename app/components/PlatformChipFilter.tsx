'use client';

const PLATFORMS = [
  { id: 'all', label: 'ทั้งหมด', icon: '' },
  { id: 'facebook', label: 'Facebook', icon: '/social/facebook.svg' },
  { id: 'line', label: 'LINE OA', icon: '/social/line_oa.svg' },
  { id: 'shopee', label: 'Shopee', icon: '/marketplace/shopee.svg' },
  { id: 'tiktok', label: 'TikTok', icon: '/marketplace/tiktok_shop.svg' },
  { id: 'lazada', label: 'Lazada', icon: '/marketplace/lazada.svg' },
  { id: 'instagram', label: 'Instagram', icon: '/social/instagram.svg' },
  { id: 'manual', label: 'เปิดบิลตรง', icon: '' },
];

interface PlatformChipFilterProps {
  value: string;          // 'all' | platform id
  onChange: (value: string) => void;
  className?: string;
}

export default function PlatformChipFilter({ value, onChange, className }: PlatformChipFilterProps) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className || ''}`}>
      {PLATFORMS.map((p) => {
        const isActive = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
              isActive
                ? 'border-gray-800 dark:border-white bg-gray-800 dark:bg-white text-white dark:text-gray-900'
                : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            {p.icon && <img src={p.icon} alt="" className="w-3.5 h-3.5" />}
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
