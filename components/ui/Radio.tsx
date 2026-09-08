'use client';

interface RadioProps {
  checked: boolean;
  onChange: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  /**
   * เนื้อหาของตัวเลือกที่ยาวกว่าข้อความบรรทัดเดียว (หัวข้อ + คำอธิบาย)
   *
   * ตัวนี้เองเป็น `<label>` อยู่แล้ว — ห่อมันด้วย `<button>`/`<label>` อีกชั้นเพื่อทำ
   * "การ์ดกดได้ทั้งใบ" จะได้ interactive ซ้อน interactive (HTML ไม่ถูกต้อง + React 19 ฟ้อง)
   * จึงส่งทั้งใบเข้ามาเป็น children แล้วแต่งกรอบผ่าน `className` แทน (เหมือน Checkbox)
   */
  children?: React.ReactNode;
}

export default function Radio({ checked, onChange, label, disabled, className, children }: RadioProps) {
  return (
    <label
      className={`flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className || ''}`}
      onClick={e => {
        e.preventDefault();
        if (!disabled) onChange();
      }}
    >
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? 'border-[5px] border-primary' : 'border-2 border-gray-300 dark:border-slate-500'
      }`} />
      {label && <span className="text-sm text-gray-700 dark:text-slate-300">{label}</span>}
      {children}
    </label>
  );
}
