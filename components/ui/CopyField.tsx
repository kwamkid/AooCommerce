// ช่องแสดงค่าที่ต้องเอาไปวางที่อื่น (Callback URL, Webhook URL, โค้ดเชิญ ฯลฯ)
//
// อ่านอย่างเดียว + ปุ่มคัดลอก — ทำเป็น input แทนการวางเป็น <code> เพราะค่าพวกนี้
// มักยาวเกินบรรทัด ผู้ใช้จะลากเลือกเองแล้วได้ไม่ครบ หรือติดช่องว่างหัวท้ายมาด้วย
'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyFieldProps {
  value: string;
  label?: string;
  hint?: string;
}

export default function CopyField({ value, label, hint }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // เบราว์เซอร์บล็อก clipboard (http หรือไม่ได้เกิดจากการกดของผู้ใช้)
      // — ช่องเป็น input อยู่แล้ว ผู้ใช้ลากเลือกเองได้
    }
  };

  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          value={value}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 h-10 px-3 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-slate-200 font-mono text-sm cursor-text"
        />
        <button
          type="button"
          onClick={copy}
          className={`h-10 px-3.5 rounded-lg border flex items-center gap-1.5 subtitle-text font-medium flex-shrink-0 transition-colors ${
            copied
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
              : 'border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:border-gray-300 dark:hover:border-slate-500'
          }`}
        >
          {copied
            ? <><Check className="w-4 h-4" strokeWidth={2.5} />คัดลอกแล้ว</>
            : <><Copy className="w-4 h-4" />คัดลอก</>}
        </button>
      </div>
      {hint && <p className="helper-text text-gray-500 mt-1.5">{hint}</p>}
    </div>
  );
}
