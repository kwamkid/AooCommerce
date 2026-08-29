// ช่องเลือกรูป 1 ใบ — ลากวาง / กดเลือก / วางจากคลิปบอร์ด / ถ่ายรูป + ย่อรูปให้อัตโนมัติ
//
// คืน `File` ให้ผู้เรียกเอาไปอัปโหลดเอง — ตัวนี้ไม่รู้จัก storage หรือ API ใด ๆ
// จึงใช้ได้ทั้งหน้าร้านสาธารณะ (ไม่มี session) และหลังบ้าน
//
// หน้าตาปรับผ่าน `classNames` — หน้าร้านส่ง sf-* ของธีมตัวเองเข้ามา ส่วนหลังบ้าน
// ปล่อยว่างแล้วได้สไตล์ Tailwind มาตรฐาน · **ห้ามสร้าง dropzone ตัวที่สอง**
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  /** ข้อความหลักในกล่อง */
  label?: string;
  /** บรรทัดเล็กใต้ข้อความหลัก */
  hint?: string;
  /** ไอคอนกลางกล่อง (เช่น Camera สำหรับสลิป) */
  icon?: ReactNode;
  alt?: string;
  /** รูปที่มีอยู่แล้ว (URL) — แสดงเป็นพรีวิวจนกว่าจะเลือกไฟล์ใหม่ */
  initialPreviewUrl?: string | null;
  /** ด้านยาวสุดหลังย่อ (px) — โลโก้ที่โชว์ 40px ไม่ต้องเก็บ 1920 · ค่าเริ่มต้น 1920 สำหรับสลิป */
  maxWidthOrHeight?: number;
  /** ขนาดไฟล์เป้าหมายหลังย่อ (MB) */
  maxSizeMB?: number;
  classNames?: {
    root?: string;
    rootDragging?: string;
    preview?: string;
    clear?: string;
    error?: string;
    spinner?: string;
    /** ขนาดไอคอนกากบาท — หน้าร้านคุมขนาดจาก CSS ของตัวเอง ส่งค่าว่างมาได้ */
    clearIcon?: string;
  };
}

const TW = {
  root: 'w-full flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/40 px-4 py-6 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-60',
  rootDragging: 'border-primary text-primary bg-primary/5',
  preview: 'relative inline-block',
  clear: 'absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-900/80 text-white flex items-center justify-center hover:bg-gray-900',
  error: 'subtitle-text text-red-600 mt-1',
  spinner: 'w-6 h-6 animate-spin',
  clearIcon: 'w-3.5 h-3.5',
};

export default function ImageDropzone({
  value, onChange, disabled, label, hint, icon, alt, initialPreviewUrl, classNames,
  maxWidthOrHeight = 1920, maxSizeMB = 0.5,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [warn, setWarn] = useState('');
  const cn = { ...TW, ...(classNames || {}) };

  // ผู้เรียกล้างค่า (เช่นส่งสำเร็จ) → ล้างรูปพรีวิวตาม
  useEffect(() => {
    if (value) return;
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  }, [value]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const accept = useCallback(async (file: File | null | undefined) => {
    if (!file || disabled) return;
    if (!file.type.startsWith('image/')) { setWarn('แนบได้เฉพาะไฟล์รูป'); return; }
    setWarn('');
    setBusy(true);
    try {
      let out = file;
      try {
        out = await imageCompression(file, { maxSizeMB, maxWidthOrHeight, useWebWorker: true });
      } catch {
        // ย่อไม่สำเร็จ — ไฟล์เล็กพอก็ส่งของเดิมไป ใหญ่เกินค่อยบอกให้เลือกใหม่
        if (file.size > 5 * 1024 * 1024) { setWarn('ไฟล์ใหญ่เกินไป ลองเลือกรูปที่เล็กกว่านี้'); return; }
      }
      setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(out); });
      onChange(out);
    } finally {
      setBusy(false);
    }
  }, [disabled, onChange, maxSizeMB, maxWidthOrHeight]);

  const clear = () => {
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setWarn('');
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const shown = preview || initialPreviewUrl;
  if (shown) {
    return (
      <div className={cn.preview}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shown} alt={alt || 'รูปที่เลือก'} />
        <button
          type="button"
          className={cn.clear}
          onClick={clear}
          aria-label="เอารูปออก"
          disabled={disabled}
        >
          <X className={cn.clearIcon} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${cn.root}${dragging ? ` ${cn.rootDragging}` : ''}`}
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        // วางจากคลิปบอร์ดได้ด้วย — บนคอมคนแคปหน้าจอมาวางเลยเร็วกว่าเซฟไฟล์ก่อน
        onPaste={e => accept(Array.from(e.clipboardData.files)[0])}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files?.[0]); }}
      >
        {busy ? (
          <><Loader2 className={cn.spinner} strokeWidth={1.75} aria-hidden="true" /><span>กำลังย่อรูป…</span></>
        ) : (
          <>
            {icon || <ImagePlus className="w-6 h-6" strokeWidth={1.5} aria-hidden="true" />}
            <span>{label || 'เลือกรูปจากเครื่อง'}</span>
            <small>{hint || 'ลากรูปมาวางตรงนี้ก็ได้'}</small>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={e => { accept(e.target.files?.[0]); e.target.value = ''; }}
      />
      {warn && <p className={cn.error}>{warn}</p>}
    </>
  );
}
