// Path: components/storefront/SlipDropzone.tsx
// ช่องแนบสลิปโอนเงินของหน้าร้าน — ตอนนี้เป็นแค่หน้ากากของ ImageDropzone
//
// ตรรกะทั้งหมด (ลากวาง / วางจากคลิปบอร์ด / ถ่ายรูป / ย่อรูป) ย้ายไปอยู่ที่
// components/ui/ImageDropzone.tsx แล้ว เพราะหลังบ้านต้องใช้เรื่องเดียวกันตอน
// อัปโหลดโลโก้ร้าน — ที่เหลือตรงนี้คือ "หน้าตาแบบหน้าร้าน" (คลาส sf-*) กับคำพูด
// ที่พูดถึงสลิปโดยเฉพาะ
'use client';

import { Camera } from 'lucide-react';
import ImageDropzone from '@/components/ui/ImageDropzone';

interface Props {
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}

export default function SlipDropzone({ value, onChange, disabled }: Props) {
  return (
    <ImageDropzone
      value={value}
      onChange={onChange}
      disabled={disabled}
      alt="สลิปที่แนบ"
      icon={<Camera strokeWidth={1.5} aria-hidden="true" />}
      label="ถ่ายรูปสลิป หรือเลือกรูปจากเครื่อง"
      hint="ลากรูปมาวางตรงนี้ก็ได้"
      classNames={{
        root: 'sf-drop',
        rootDragging: 'sf-drop-on',
        preview: 'sf-drop-preview',
        clear: 'sf-drop-clear',
        error: 'sf-error',
        spinner: 'sf-drop-spin',
        clearIcon: '',   // ขนาดคุมจาก sf-drop-clear ใน CSS หน้าร้าน
      }}
    />
  );
}
