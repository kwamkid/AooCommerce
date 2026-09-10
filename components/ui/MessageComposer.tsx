// Path: components/ui/MessageComposer.tsx
//
// กล่องพิมพ์ "ข้อความ 1 ใบ" แบบเดียวกับช่องพิมพ์ในแชท — ข้อความกับรูปที่แนบอยู่ในกรอบเดียว
// (= สิ่งเดียวที่จะส่ง) · แถบล่างมีปุ่มแนบรูป · ของเพิ่มที่ผู้เรียกส่งมา (เช่นชิปเลือกแบบรูป) ·
// ตัวนับอักขระ · ลาก/วางรูปลงกล่องได้ทั้งใบ · วางรูปจากคลิปบอร์ดตอนพิมพ์ได้
//
// ทำไมไม่ใช่ textarea + dropzone แยกสองกล่อง: บรอดแคสต์ "ประกาศ" คือข้อความ + รูปใบเดียว
// แยกกล่องแล้วช่องข้อความใหญ่โล่ง กล่องรูปยืดเต็มกว้าง ดูเป็นคนละเรื่องกัน (เจ้าของ 10 ก.ย. 2026)
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
  value: string;
  onChange: (value: string) => void;
  label?: string;
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
 * ImageDropzone ในกล่องนี้: กล่องเส้นประถูกซ่อน (ปุ่มแนบอยู่แถบล่างแทน) · พรีวิวเป็นรูปจิ๋วสูง 80px
 * ใต้ข้อความเหมือนไฟล์แนบในแชท · คำเตือนไฟล์ผิดชนิดยังขึ้นตรงแถวรูป
 */
const ATTACH_CLASSES = {
  root: 'hidden',
  preview: 'relative inline-block',
  previewImg: 'h-20 w-auto max-w-full rounded-lg object-cover',
  error: 'subtitle-text text-red-600 pb-2',
};

export default function MessageComposer({
  value, onChange, label, placeholder, rows = 5, maxLength, disabled, image, toolbar, error,
}: MessageComposerProps) {
  const id = useId();
  const dropRef = useRef<ImageDropzoneHandle>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasImage = !!image && (!!image.file || !!image.previewUrl);

  // ลาก/วางลงตรงไหนของกล่องก็ได้ — ส่งต่อให้ ImageDropzone ย่อรูป/ทำพรีวิวเหมือนกดปุ่มเลือกเอง
  const onDrop = (e: DragEvent) => {
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
      {label && <label htmlFor={id} className="field-label">{label}</label>}
      <div
        className={`rounded-lg border bg-white dark:bg-slate-700 transition-colors focus-within:ring-2 ${frame} ${disabled ? 'opacity-60' : ''}`}
        onDragOver={image ? (e => { e.preventDefault(); setDragging(true); }) : undefined}
        onDragLeave={image ? (() => setDragging(false)) : undefined}
        onDrop={image ? onDrop : undefined}
      >
        <textarea
          id={id}
          value={value}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onPaste={onPaste}
          aria-invalid={!!error || undefined}
          className="block w-full px-3 pt-2.5 pb-1 bg-transparent text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 resize-none focus:outline-none"
        />

        {/* รูปที่แนบ — โผล่ใต้ข้อความในกรอบเดียวกันเหมือนไฟล์แนบในแชท (ยังไม่แนบ = แถวนี้ว่าง) */}
        {image && (
          <div className={hasImage ? 'px-3 pb-2' : 'px-3'}>
            <ImageDropzone
              ref={dropRef}
              value={image.file}
              onChange={image.onChange}
              initialPreviewUrl={image.previewUrl}
              disabled={disabled}
              onBusyChange={setBusy}
              maxWidthOrHeight={image.maxWidthOrHeight}
              maxSizeMB={image.maxSizeMB}
              classNames={ATTACH_CLASSES}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 border-t border-gray-200 dark:border-slate-600">
          {image && (
            <Button
              variant="ghost"
              size="sm"
              icon={<ImagePlus className="w-4 h-4" strokeWidth={1.75} />}
              loading={busy}
              disabled={disabled}
              onClick={() => dropRef.current?.open()}
            >
              {hasImage ? 'เปลี่ยนรูป' : (image.attachLabel || 'แนบรูป')}
            </Button>
          )}
          {toolbar}
          {maxLength != null && (
            <span className={`ml-auto helper-text tabular-nums flex-shrink-0 ${value.length > maxLength ? 'text-red-600 dark:text-red-400' : ''}`}>
              {value.length.toLocaleString()}/{maxLength.toLocaleString()}
            </span>
          )}
        </div>
      </div>
      {error && <p className="helper-text text-red-600 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );
}
