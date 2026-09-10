// Path: components/ui/MessageComposer.tsx
//
// กล่องพิมพ์ "ฟองข้อความ 1 ฟอง" แบบเดียวกับช่องพิมพ์ในแชท — 1 กล่อง = 1 ฟองที่ลูกค้าจะได้รับ
// ใช้ได้ 3 ท่า: ข้อความล้วน · ข้อความ + รูปในฟองเดียว · **รูปอย่างเดียว** (ไม่ส่ง value/onChange)
// แถบล่างมีปุ่มแนบรูป · ของเพิ่มที่ผู้เรียกส่งมา (เช่นชิปเลือกแบบรูป) · ตัวนับอักขระ ·
// ลาก/วางรูปลงกล่องได้ทั้งใบ · วางรูปจากคลิปบอร์ดตอนพิมพ์ได้
//
// ⚠️ ของที่ส่งออกไปเป็น**หลายฟอง**ต้องวางเป็นหลายกล่อง — บรอดแคสต์ "ประกาศ" ส่งข้อความกับรูปเป็น
// 2 ฟองแยกกัน เคยรวมในกล่องเดียวแล้วเจ้าของบอก "สวยแต่ไม่ดี คนจะเข้าใจผิดว่าเป็นฟองเดียว" (10 ก.ย. 2026)
//
// รูปใช้ `ImageDropzone` ตัวเดิม (ย่อรูป/พรีวิว/กากบาท/เตือนไฟล์ผิดชนิด) — ซ่อนกล่องเส้นประของมัน
// แล้วให้ปุ่ม "แนบรูป" ในแถบล่างกับการลาก/วางบนกล่องนี้ป้อนไฟล์เข้าไปผ่าน ref แทน
// **ห้ามทำ dropzone ตัวที่สอง**
'use client';

import { useId, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react';
import { ImagePlus } from 'lucide-react';
import Button from './Button';
import ImageDropzone, { type ImageDropzoneHandle } from './ImageDropzone';

interface ComposerImage {
  file: File | null;
  onChange: (file: File | null) => void;
  /** รูปที่เห็นตอนนี้ (blob ของไฟล์ที่เพิ่งเลือก หรือรูปเดิมของใบที่คัดลอกมา) */
  previewUrl: string | null;
  maxWidthOrHeight?: number;
  maxSizeMB?: number;
  /** ข้อความบนปุ่มแนบ — ค่าเริ่มต้น "แนบรูป" */
  attachLabel?: string;
}

interface MessageComposerProps {
  /** ไม่ส่ง value/onChange = กล่องรูปอย่างเดียว (ไม่มีช่องพิมพ์) */
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  /** บรรทัดเล็กใน dropzone ของกล่องรูปอย่างเดียว (เช่น "ไม่แนบ = ส่งแค่ฟองข้อความ") */
  emptyHint?: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  /** รูปแนบ 1 ใบ — ไม่ส่ง = กล่องข้อความล้วน ไม่มีปุ่มแนบ */
  image?: ComposerImage;
  /** ของเพิ่มในแถบล่าง ถัดจากปุ่มแนบรูป (เช่นชิปเลือกว่ารูปแสดงแบบไหน) */
  toolbar?: ReactNode;
  error?: string | null;
}

/**
 * ImageDropzone ในกล่องที่มีช่องพิมพ์: กล่องเส้นประถูกซ่อน (ปุ่มแนบอยู่แถบล่างแทน) · พรีวิวเป็น
 * รูปจิ๋วสูง 80px ใต้ข้อความเหมือนไฟล์แนบในแชท · คำเตือนไฟล์ผิดชนิดยังขึ้นตรงแถวรูป
 */
const ATTACH_CLASSES = {
  root: 'hidden',
  preview: 'relative inline-block',
  previewImg: 'h-20 w-auto max-w-full rounded-lg object-cover',
  error: 'subtitle-text text-red-600 pb-2',
};

/**
 * กล่องรูปอย่างเดียว: ยังไม่แนบ = กล่องเส้นประของ ImageDropzone ตามปกติ (เห็นชัดว่าเพิ่มรูปได้
 * — เจ้าของขอ 10 ก.ย. 2026 หลังลองเป็นบรรทัดข้อความบาง ๆ แล้วดูไม่ออก) · แนบแล้ว = รูปจิ๋วสูง 96px
 */
const IMAGE_ONLY_CLASSES = {
  preview: 'relative inline-block',
  previewImg: 'h-24 w-auto max-w-full rounded-lg object-cover',
};

export default function MessageComposer({
  value, onChange, label, emptyHint, placeholder, rows = 5, maxLength, disabled, image, toolbar, error,
}: MessageComposerProps) {
  const hasText = onChange != null;
  // ปุ่มแนบในแถบล่างมีเฉพาะกล่องที่มีช่องพิมพ์และยังไม่มีรูป — กล่องรูปอย่างเดียวมี dropzone ใหญ่อยู่แล้ว
  // และพอมีรูปแล้ว "เปลี่ยนรูป" คือกดที่รูปนั้นเอง (changeOnClick) ไม่ต้องมีปุ่มซ้ำ
  const showAttachButton = !!image && hasText && !(image.file || image.previewUrl);
  const id = useId();
  const dropRef = useRef<ImageDropzoneHandle>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasImage = !!image && (!!image.file || !!image.previewUrl);

  // ลาก/วางลงตรงไหนของกล่องก็ได้ — ส่งต่อให้ ImageDropzone ย่อรูป/ทำพรีวิวเหมือนกดปุ่มเลือกเอง
  const onDrop = (e: DragEvent) => {
    // ตกลงบนกล่องเส้นประของ ImageDropzone เอง = มันรับไปแล้ว ไม่รับซ้ำ
    if (e.isDefaultPrevented()) return;
    e.preventDefault();
    setDragging(false);
    dropRef.current?.accept(e.dataTransfer.files?.[0]);
  };
  const onPaste = (e: ClipboardEvent) => {
    if (!image) return;
    const file = Array.from(e.clipboardData.files).find(f => f.type.startsWith('image/'));
    if (!file) return; // วางข้อความธรรมดา ปล่อยให้ textarea ทำงานตามปกติ
    e.preventDefault();
    dropRef.current?.accept(file);
  };

  const frame = error
    ? 'border-red-400 focus-within:ring-red-400/40 focus-within:border-red-500'
    : dragging
      ? 'border-primary bg-primary/5'
      : 'border-gray-300 dark:border-slate-600 focus-within:ring-primary/40 focus-within:border-primary';

  return (
    <div>
      {label && (
        hasText
          ? <label htmlFor={id} className="field-label">{label}</label>
          : <p className="field-label">{label}</p>
      )}
      <div
        className={`rounded-lg border bg-white dark:bg-slate-700 transition-colors focus-within:ring-2 ${frame} ${disabled ? 'opacity-60' : ''}`}
        onDragOver={image ? (e => { e.preventDefault(); setDragging(true); }) : undefined}
        onDragLeave={image ? (() => setDragging(false)) : undefined}
        onDrop={image ? onDrop : undefined}
      >
        {hasText && (
          <textarea
            id={id}
            value={value ?? ''}
            rows={rows}
            maxLength={maxLength}
            disabled={disabled}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            onPaste={onPaste}
            aria-invalid={!!error || undefined}
            className="block w-full px-3 pt-2.5 pb-1 bg-transparent text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 resize-none focus:outline-none"
          />
        )}

        {/* รูป — มีช่องพิมพ์: รูปจิ๋วโผล่ใต้ข้อความเหมือนไฟล์แนบในแชท (ยังไม่แนบ = แถวว่าง) ·
            รูปอย่างเดียว: กล่องเส้นประเต็มกล่องจนกว่าจะแนบ */}
        {image && (
          <div className={hasText ? (hasImage ? 'px-3 pb-2' : 'px-3') : 'p-3'}>
            <ImageDropzone
              ref={dropRef}
              value={image.file}
              onChange={image.onChange}
              initialPreviewUrl={image.previewUrl}
              disabled={disabled}
              onBusyChange={setBusy}
              label="ลากรูปมาวาง หรือกดเพื่อเลือก"
              hint={emptyHint}
              maxWidthOrHeight={image.maxWidthOrHeight}
              maxSizeMB={image.maxSizeMB}
              changeOnClick
              classNames={hasText ? ATTACH_CLASSES : IMAGE_ONLY_CLASSES}
            />
          </div>
        )}

        {/* แถบล่าง — มีเส้นคั่นเฉพาะตอนมีปุ่ม/ชิป · เหลือแค่ตัวนับไม่ต้องขีดคั่น (เจ้าของขอ 10 ก.ย.) */}
        <div className={`flex flex-wrap items-center gap-2 px-2 ${
          showAttachButton || toolbar ? 'py-1.5 border-t border-gray-200 dark:border-slate-600' : 'pb-1.5'
        }`}>
          {showAttachButton && image && (
            <Button
              variant="ghost"
              size="sm"
              icon={<ImagePlus className="w-4 h-4" strokeWidth={1.75} />}
              loading={busy}
              disabled={disabled}
              onClick={() => dropRef.current?.open()}
            >
              {image.attachLabel || 'แนบรูป'}
            </Button>
          )}
          {toolbar}
          {hasText && maxLength != null && (
            <span className={`ml-auto helper-text tabular-nums flex-shrink-0 ${(value ?? '').length > maxLength ? 'text-red-600 dark:text-red-400' : ''}`}>
              {(value ?? '').length.toLocaleString()}/{maxLength.toLocaleString()}
            </span>
          )}
        </div>
      </div>
      {error && <p className="helper-text text-red-600 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );
}
