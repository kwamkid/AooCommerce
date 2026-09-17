'use client';

// ช่องแก้ "ลิงก์หน้าร้าน" ของ master data (แบรนด์ · หมวดหมู่)
//
// ล็อกไว้ก่อนเสมอ ต้องกด "แก้ไข" ถึงพิมพ์ได้ — แบบเดียวกับชื่อลิงก์ร้านที่ /settings/storefront
// เพราะ slug ที่เปลี่ยนแล้ว = ลิงก์เก่าที่ส่งไปหาลูกค้าตาย ไม่ใช่ช่องที่ควรแก้โดยไม่ตั้งใจ
//
// ⛔ กติกาตัวอักษรอยู่ที่ lib/master-slug.ts ที่เดียว — ห้ามพิมพ์ regex ซ้ำที่นี่

import { useState } from 'react';
import FormInput from '@/components/ui/FormInput';
import {
  MASTER_SLUG_MAX,
  MASTER_SLUG_RULE,
  encodedSlugLength,
  hasThai,
  masterSlugErrorMessage,
  normalizeMasterSlug,
  validateMasterSlug,
} from '@/lib/master-slug';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** ค่าเดิมจาก DB — ใช้ตอนกดยกเลิก และเพื่อรู้ว่าแก้ไปจากเดิมหรือยัง */
  originalValue: string;
  /** slug ของรายการอื่นในร้านเดียวกัน (ไม่รวมตัวเอง) — เตือนซ้ำตั้งแต่ตอนพิมพ์ */
  takenSlugs?: string[];
  /** ตัวอย่างลิงก์ที่ลูกค้าจะเห็น เช่น `ร้านคุณ/?cat=` */
  previewPrefix: string;
  label?: string;
}

export default function SlugField({
  value,
  onChange,
  originalValue,
  takenSlugs = [],
  previewPrefix,
  label = 'ลิงก์หน้าร้าน',
}: Props) {
  const [editing, setEditing] = useState(false);

  const error = editing && value !== originalValue ? validateMasterSlug(value, takenSlugs) : null;
  const encodedLength = encodedSlugLength(value);
  const thai = hasThai(value);

  return (
    <div>
      <FormInput
        label={label}
        value={value}
        disabled={!editing}
        maxLength={MASTER_SLUG_MAX}
        onChange={event => onChange(normalizeMasterSlug(event.target.value))}
        autoComplete="off"
        spellCheck={false}
        error={error ? masterSlugErrorMessage(error) : undefined}
        hint={editing ? `${MASTER_SLUG_RULE} (${value.length}/${MASTER_SLUG_MAX})` : 'กด "แก้ไข" เพื่อเปลี่ยน — ลิงก์เก่าที่ส่งไปแล้วจะเปิดไม่ได้'}
        postfix={
          editing ? (
            <button
              type="button"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white"
              onClick={() => { onChange(originalValue); setEditing(false); }}
            >
              ยกเลิก
            </button>
          ) : (
            <button
              type="button"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
              onClick={() => setEditing(true)}
            >
              แก้ไข
            </button>
          )
        }
      />
      {editing && value && !error && (
        <div className="helper-text mt-1.5 space-y-1">
          <p className="break-all">{previewPrefix}{value}</p>
          {/* ไทยใช้ได้และดีต่อ SEO ไทย แต่ตอน copy ไปวางในแชทจะกลายเป็น %E0%B8… ยาวเป็นเท่าตัว
              บอกความยาวจริงไปเลย ร้านจะได้ชั่งเองว่าคุ้มไหม — ไม่ใช่ error ไม่บล็อกการบันทึก */}
          {thai && (
            <p className="text-amber-700 dark:text-amber-500">
              ลิงก์ภาษาไทยใช้ได้ปกติและ Google อ่านออก แต่เวลาคัดลอกไปวางในแชทจะกลายเป็นรหัสยาว {encodedLength} ตัวอักษร
              — อยากได้ลิงก์สั้นให้พิมพ์เป็นภาษาอังกฤษแทน
            </p>
          )}
        </div>
      )}
    </div>
  );
}
