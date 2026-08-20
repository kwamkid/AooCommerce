// Path: components/storefront/SlipDropzone.tsx
// ช่องแนบสลิปโอนเงินของหน้าร้าน — ลากวาง / กดเลือก / วางจากคลิปบอร์ด / ถ่ายรูป
//
// ทำไมไม่ใช้ ImageUploader ของหลังบ้าน: ตัวนั้นอัปขึ้น bucket `product-images`
// ผ่าน Supabase client ที่ต้อง login (RLS = authenticated) + ใช้ toast/confirm
// context ของแอป — หน้าร้านเป็นหน้าสาธารณะ ลูกค้าไม่มี session อะไรทั้งนั้น
// ที่นี่จึงแค่ "เลือกไฟล์แล้วคืน File ให้ผู้เรียก" ส่วนการอัปทำผ่าน /api/bills
//
// ย่อรูปก่อนเสมอ (ค่าเดียวกับหน้าบิลออนไลน์) — สลิปจากมือถือรุ่นใหม่ 4-8MB
// ลูกค้าเน็ตช้าจะรอนาน หรือหลุด timeout ไปเลย
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { Camera, X, Loader2 } from 'lucide-react';

interface Props {
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}

export default function SlipDropzone({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [warn, setWarn] = useState('');

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
        out = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1920, useWebWorker: true });
      } catch {
        // ย่อไม่สำเร็จ — ไฟล์เล็กพอก็ส่งของเดิมไป ใหญ่เกินค่อยบอกให้เลือกใหม่
        if (file.size > 5 * 1024 * 1024) { setWarn('ไฟล์ใหญ่เกินไป ลองถ่ายใหม่หรือเลือกรูปที่เล็กกว่านี้'); return; }
      }
      setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(out); });
      onChange(out);
    } finally {
      setBusy(false);
    }
  }, [disabled, onChange]);

  const clear = () => {
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setWarn('');
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (preview) {
    return (
      <div className="sf-drop-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="สลิปที่แนบ" />
        <button type="button" className="sf-drop-clear" onClick={clear} aria-label="เอาสลิปออก" disabled={disabled}>
          <X strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`sf-drop${dragging ? ' sf-drop-on' : ''}`}
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        // วางจากคลิปบอร์ดได้ด้วย — บนคอมคนแคปหน้าจอสลิปมาวางเลยเร็วกว่าเซฟไฟล์ก่อน
        onPaste={e => accept(Array.from(e.clipboardData.files)[0])}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files?.[0]); }}
      >
        {busy ? (
          <><Loader2 className="sf-drop-spin" strokeWidth={1.75} aria-hidden="true" /><span>กำลังย่อรูป…</span></>
        ) : (
          <>
            <Camera strokeWidth={1.5} aria-hidden="true" />
            <span>ถ่ายรูปสลิป หรือเลือกรูปจากเครื่อง</span>
            <small>ลากรูปมาวางตรงนี้ก็ได้</small>
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
      {warn && <p className="sf-error">{warn}</p>}
    </>
  );
}
