// อัปโหลดโลโก้รูปเดียว (ไม่ใช่แกลเลอรี)
//
// ต่างจาก <ImageUploader> ที่ผูกกับสินค้า/ตัวเลือกสินค้าและเก็บ metadata ลงตาราง
// รูปภาพ — อันนี้คือ "รูปเดียว 1 ช่อง" ที่ผลลัพธ์เป็น URL ตัวเดียวให้ caller
// เก็บเองว่าจะไปอยู่ที่ไหน (companies.logo_url หรือใน settings ก็ได้)
'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import Button from './Button';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';

interface LogoUploaderProps {
  /** URL ที่เลือกไว้ — ว่าง = ยังไม่ได้อัปโหลด */
  value: string | null;
  onChange: (url: string | null) => void;
  companyId: string;
  /** แยกไฟล์ในสตอเรจ + ตัดสินใจว่าจะเขียนทับ companies.logo_url ไหม */
  variant?: 'company' | 'storefront';
  label?: string;
  /** รูปที่จะถูกใช้จริงเมื่อ value ว่าง — แสดงจาง ๆ ให้เห็นว่าตกไปใช้อะไร */
  fallbackUrl?: string | null;
  fallbackNote?: string;
  disabled?: boolean;
}

const MAX_MB = 2;

export default function LogoUploader({
  value, onChange, companyId, variant = 'company',
  label, fallbackUrl, fallbackNote, disabled,
}: LogoUploaderProps) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const shown = value || fallbackUrl || null;
  const usingFallback = !value && !!fallbackUrl;

  const pick = async (file: File) => {
    if (!file.type.startsWith('image/')) { showToast('ต้องเป็นไฟล์รูปภาพ', 'error'); return; }
    if (file.size > MAX_MB * 1024 * 1024) { showToast(`ไฟล์ต้องไม่เกิน ${MAX_MB}MB`, 'error'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('companyId', companyId);
      fd.append('variant', variant);
      const res = await apiFetch('/api/companies/logo', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.logoUrl) { showToast(data.error || 'อัปโหลดไม่สำเร็จ', 'error'); return; }
      onChange(data.logoUrl);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shown}
              alt=""
              className="w-full h-full object-contain"
              style={usingFallback ? { opacity: 0.55 } : undefined}
            />
          ) : (
            <ImagePlus className="w-6 h-6 text-gray-300 dark:text-slate-500" />
          )}
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || busy}
              icon={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
              onClick={() => inputRef.current?.click()}
            >
              {value ? 'เปลี่ยนรูป' : 'อัปโหลด'}
            </Button>
            {value && (
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled || busy}
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => onChange(null)}
              >
                ลบ
              </Button>
            )}
          </div>
          {usingFallback && fallbackNote && (
            <p className="helper-text text-gray-500">{fallbackNote}</p>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }}
      />
    </div>
  );
}
