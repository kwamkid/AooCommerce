// ช่องเลือกรูป 1 ใบ — ลากวาง / กดเลือก / วางจากคลิปบอร์ด / ถ่ายรูป + ย่อรูปให้อัตโนมัติ
//
// คืน `File` ให้ผู้เรียกเอาไปอัปโหลดเอง — ตัวนี้ไม่รู้จัก storage หรือ API ใด ๆ
// จึงใช้ได้ทั้งหน้าร้านสาธารณะ (ไม่มี session) และหลังบ้าน
//
// หน้าตาปรับผ่าน `classNames` — หน้าร้านส่ง sf-* ของธีมตัวเองเข้ามา ส่วนหลังบ้าน
// ปล่อยว่างแล้วได้สไตล์ Tailwind มาตรฐาน · **ห้ามสร้าง dropzone ตัวที่สอง**
'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
  /**
   * เปิดกล้องตรง ๆ บนมือถือแทนการเลือกจากคลังรูป (`environment` = กล้องหลัง)
   * ใช้กับงานที่ต้อง "ถ่ายตอนนั้น" เช่นรูปตอนรับสินค้า — งานที่รูปมีอยู่แล้ว (สลิป โลโก้) ห้ามใส่
   */
  capture?: 'user' | 'environment';
  /**
   * บอกผู้เรียกว่ากำลังย่อรูปอยู่ — ฟอร์มที่มีปุ่มบันทึกต้องปิดปุ่มระหว่างนี้
   * ไม่งั้นกดส่งตอนย่อยังไม่เสร็จ = ได้บิลที่ไม่มีรูปแนบโดยไม่มีใครรู้
   */
  onBusyChange?: (busy: boolean) => void;
  /** ด้านยาวสุดหลังย่อ (px) — โลโก้ที่โชว์ 40px ไม่ต้องเก็บ 1920 · ค่าเริ่มต้น 1920 สำหรับสลิป */
  maxWidthOrHeight?: number;
  /** ขนาดไฟล์เป้าหมายหลังย่อ (MB) */
  maxSizeMB?: number;
  /**
   * กรอบเป็นจัตุรัสจริง (ทั้งตอนว่างและตอนมีรูป — รูปถูกครอบด้วย object-cover)
   * ใช้กับที่ที่ปลายทางเป็นรูป 1:1 เช่นการ์ดสินค้า · บอกว่า 1:1 แต่กรอบเป็นสี่เหลี่ยมผืนผ้า
   * ผู้ใช้จะเข้าใจสัดส่วนผิดตั้งแต่ตอนเลือกรูป (เจ้าของท้วง 10 ก.ย. 2026)
   */
  square?: boolean;
  /**
   * กดที่รูปพรีวิวแล้วเปิดเลือกรูปใหม่ได้เลย + ทาบไอคอน "เปลี่ยนรูป" ตอน hover (ทรงเดียวกับแว่นขยาย
   * บนรูปสินค้า) — ไม่ต้องกดกากบาทแล้วเลือกใหม่สองจังหวะ (เจ้าของขอ 10 ก.ย. 2026)
   */
  changeOnClick?: boolean;
  classNames?: {
    root?: string;
    rootDragging?: string;
    preview?: string;
    /** ตัวรูปพรีวิวเอง — ค่าปกติพอดีกับกล่องเล็ก · หน้าที่อยากได้รูปเต็มกว้างส่งคลาสเข้ามา */
    previewImg?: string;
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
  previewImg: 'max-w-full rounded-lg',
  clear: 'absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-900/80 text-white flex items-center justify-center hover:bg-gray-900',
  error: 'subtitle-text text-red-600 mt-1',
  spinner: 'w-6 h-6 animate-spin',
  clearIcon: 'w-3.5 h-3.5',
};

/**
 * ให้ผู้เรียกป้อนไฟล์เข้ามาจากข้างนอกได้ — กล่องพิมพ์ที่รับลาก/วางทั้งกล่อง (MessageComposer)
 * ส่งไฟล์ที่ตกลงมานอกปุ่มเล็ก ๆ นี้เข้ามาผ่าน `accept()` แล้วได้การย่อรูป/พรีวิว/กากบาทชุดเดียวกัน
 * โดยไม่ต้องมี dropzone ตัวที่สอง
 */
export interface ImageDropzoneHandle {
  accept: (file: File | null | undefined) => void;
  open: () => void;
}

const ImageDropzone = forwardRef<ImageDropzoneHandle, Props>(function ImageDropzone({
  value, onChange, disabled, label, hint, icon, alt, initialPreviewUrl, classNames,
  capture, onBusyChange, maxWidthOrHeight = 1920, maxSizeMB = 0.5, changeOnClick, square,
}, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const [dragging, setDragging] = useState(false);
  const [warn, setWarn] = useState('');
  // ผู้ใช้กดกากบาททิ้งรูปเดิมแล้วหรือยัง — ถ้าไม่จำ ปุ่มกากบาทจะกดแล้วไม่มีอะไรเกิดขึ้น
  // เพราะ initialPreviewUrl ยังค้างอยู่ทำให้พรีวิวไม่หายไปไหน (บั๊กจริง 2026-08-30)
  const [dismissedInitial, setDismissedInitial] = useState(false);
  const cn = {
    ...TW,
    ...(square ? { previewImg: 'w-full aspect-square object-cover rounded-lg' } : {}),
    ...(classNames || {}),
  };
  const rootClass = `${cn.root}${square ? ' aspect-square' : ''}`;

  // ผู้เรียกเปลี่ยนรูปตั้งต้น (เช่นเพิ่งดึงจากแพลตฟอร์มมาใหม่) → กลับมาแสดงอีกครั้ง
  useEffect(() => { setDismissedInitial(false); }, [initialPreviewUrl]);

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

  useImperativeHandle(ref, () => ({ accept, open: () => inputRef.current?.click() }), [accept]);

  const clear = () => {
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setDismissedInitial(true);
    setWarn('');
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  // input ซ่อนต้องอยู่ทั้งสองสถานะ — ตอนมีรูปแล้ว `open()`/กดที่รูปก็ต้องเปิดเลือกรูปใหม่ได้
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture={capture}
      hidden
      onChange={e => { accept(e.target.files?.[0]); e.target.value = ''; }}
    />
  );

  const shown = preview || (dismissedInitial ? null : initialPreviewUrl);
  if (shown) {
    // eslint-disable-next-line @next/next/no-img-element
    const img = <img src={shown} alt={alt || 'รูปที่เลือก'} className={cn.previewImg} />;
    return (
      <div className={cn.preview}>
        {changeOnClick ? (
          <button
            type="button"
            className="group relative block"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            aria-label="เปลี่ยนรูป"
          >
            {img}
            <span className="absolute inset-0 rounded-lg bg-black/40 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5 pointer-events-none">
              {busy
                ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                : <ImagePlus className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />}
              <span className="helper-text text-white">เปลี่ยนรูป</span>
            </span>
          </button>
        ) : img}
        <button
          type="button"
          className={cn.clear}
          onClick={clear}
          aria-label="เอารูปออก"
          disabled={disabled}
        >
          <X className={cn.clearIcon} strokeWidth={2} aria-hidden="true" />
        </button>
        {fileInput}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${rootClass}${dragging ? ` ${cn.rootDragging}` : ''}`}
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
      {fileInput}
      {warn && <p className={cn.error}>{warn}</p>}
    </>
  );
});

export default ImageDropzone;
