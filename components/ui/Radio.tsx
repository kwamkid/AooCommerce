'use client';

interface RadioProps {
  checked: boolean;
  onChange: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export default function Radio({ checked, onChange, label, disabled, className }: RadioProps) {
  return (
    <label
      className={`flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className || ''}`}
      onClick={e => {
        e.preventDefault();
        if (!disabled) onChange();
      }}
    >
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? 'border-[5px] border-[#F4511E]' : 'border-2 border-gray-300 dark:border-slate-500'
      }`} />
      {label && <span className="text-sm text-gray-700 dark:text-slate-300">{label}</span>}
    </label>
  );
}
