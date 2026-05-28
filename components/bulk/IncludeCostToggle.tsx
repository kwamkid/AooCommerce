'use client';

import Card from '@/components/ui/Card';

interface IncludeCostToggleProps {
  /** Permission gate — typically `userProfile.canViewCost`. Renders nothing when false. */
  visible: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Custom label (default: "รวมคอลัมน์ ราคาทุน ใน Template") */
  label?: React.ReactNode;
}

/**
 * Checkbox to include / exclude the cost column in a bulk template.
 * Permission-gated: hidden entirely when the user cannot view cost.
 * Used across `/products/bulk/{create,price,...}` to keep the toggle UI uniform.
 */
export default function IncludeCostToggle({
  visible,
  checked,
  onChange,
  label,
}: IncludeCostToggleProps) {
  if (!visible) return null;
  return (
    <Card padding="sm">
      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-[#F4511E]"
        />
        {label ?? (
          <span>
            รวมคอลัมน์ <strong>ราคาทุน</strong> ใน Template
          </span>
        )}
      </label>
    </Card>
  );
}
