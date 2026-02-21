'use client';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export default function Checkbox({ checked, onChange, label, disabled, className, children }: CheckboxProps) {
  return (
    <label
      className={`flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className || ''}`}
      onClick={e => {
        e.preventDefault();
        if (!disabled) onChange(!checked);
      }}
    >
      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? 'bg-[#F4511E]' : 'border-2 border-gray-300 dark:border-slate-500'
      }`}>
        {checked && (
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      {label && <span className="text-sm text-gray-700 dark:text-slate-300">{label}</span>}
      {children}
    </label>
  );
}
