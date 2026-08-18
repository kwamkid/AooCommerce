// เลือกสี — ปุ่มแสดงสีปัจจุบัน กดแล้วเปิด modal จานสี
//
// ใช้แทนการวาง <input type="color"> ดิบ ๆ ในแต่ละหน้า เพื่อให้ทุกที่ที่ให้ผู้ใช้
// เลือกสีหน้าตาและพฤติกรรมเหมือนกัน (ตามกฎ code-simplicity.md)
//
// เป็น modal ไม่ใช่แถวสีแบบ inline เพราะจานสีพร้อมชื่อ + ช่องกรอกเอง + พรีวิว
// กินพื้นที่มาก ถ้าวางค้างไว้ในฟอร์มจะเบียดของอื่นและซ้ำกันเมื่อมีหลายช่องสี
'use client';

import { useEffect, useState } from 'react';
import { Check, Pipette } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import FormInput from './FormInput';
import { MODERN_COLOR_PRESETS, type ColorPreset } from '@/lib/color-presets';

interface ColorPickerProps {
  /** รหัสสี #RRGGBB — ค่าว่างได้เมื่อ allowEmpty */
  value: string;
  onChange: (hex: string) => void;
  /** ชุดสีที่ให้เลือก (ค่าเริ่มต้น = ชุดสี modern กลางของระบบ) */
  presets?: ColorPreset[];
  /** อนุญาตให้ "ไม่กำหนด" ได้ เช่น สีปุ่มที่ปล่อยให้ใช้สีแบรนด์ */
  allowEmpty?: boolean;
  /** ข้อความของตัวเลือก "ไม่กำหนด" */
  emptyLabel?: string;
  /** สีที่จะใช้จริงเมื่อค่าว่าง — ใช้แสดงพรีวิวให้ตรงผลลัพธ์ */
  fallbackValue?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** ขาว/ดำ ตัวไหนอ่านง่ายกว่าบนสีพื้นนี้ — ใช้วางเครื่องหมายถูกบนวงสี */
function contrastOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const int = parseInt(m[1], 16);
  const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#111827' : '#ffffff';
}

export default function ColorPicker({
  value, onChange, presets = MODERN_COLOR_PRESETS,
  allowEmpty = false, emptyLabel = 'ใช้ค่าเริ่มต้น', fallbackValue = '#000000',
  label, hint, disabled,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  // ค่าร่างระหว่างเปิด modal — ยังไม่ส่งออกจนกว่าจะกดยืนยัน
  const [draft, setDraft] = useState(value);
  const [text, setText] = useState(value);

  useEffect(() => {
    if (open) { setDraft(value); setText(value); }
  }, [open, value]);

  const effectiveDraft = draft || fallbackValue;

  const pick = (hex: string) => { setDraft(hex.toLowerCase()); setText(hex.toLowerCase()); };

  const typeHex = (raw: string) => {
    setText(raw);
    const next = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`;
    if (HEX.test(next)) setDraft(next.toLowerCase());
    else if (allowEmpty && raw.trim() === '') setDraft('');
  };

  const confirm = () => { onChange(draft); setOpen(false); };

  return (
    <div>
      {label && <label className="field-label">{label}</label>}

      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex items-center gap-3 w-full max-w-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span
          className="w-8 h-8 rounded-md border border-black/10 flex-shrink-0"
          style={{ background: value || fallbackValue }}
          aria-hidden="true"
        />
        <span className="body-text font-mono flex-1 text-left">
          {value || <span className="text-gray-500 font-sans">{emptyLabel}</span>}
        </span>
        <Pipette className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {hint && <p className="helper-text text-gray-500 mt-1.5">{hint}</p>}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={label ? `เลือก${label.replace(/\s*\(.*\)$/, '')}` : 'เลือกสี'}
        size="md"
        footer={
          <div className="px-6 py-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button variant="primary" onClick={confirm}>ใช้สีนี้</Button>
          </div>
        }
      >
        <div className="px-6 py-5">
          <p className="field-label">ชุดสีแนะนำ</p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 mb-6">
            {presets.map(p => {
              const active = draft.toLowerCase() === p.value.toLowerCase();
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => pick(p.value)}
                  aria-pressed={active}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <span
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
                      active ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white dark:ring-offset-slate-800' : ''
                    }`}
                    style={{ background: p.value }}
                  >
                    {active && <Check className="w-5 h-5" style={{ color: contrastOn(p.value) }} />}
                  </span>
                  <span className="helper-text text-gray-500 text-center leading-tight">{p.name}</span>
                </button>
              );
            })}
          </div>

          <p className="field-label">กำหนดเอง</p>
          <div className="flex items-center gap-3 mb-6">
            <input
              type="color"
              value={effectiveDraft}
              onChange={(e) => pick(e.target.value)}
              className="w-11 h-11 rounded-lg border border-gray-200 dark:border-slate-600 cursor-pointer bg-transparent flex-shrink-0"
              aria-label="เลือกสีจากจานสี"
            />
            <div className="w-40">
              <FormInput
                value={text}
                onChange={(e) => typeHex(e.target.value)}
                placeholder={allowEmpty ? 'ว่าง = ค่าเริ่มต้น' : '#000000'}
              />
            </div>
            {allowEmpty && draft && (
              <Button variant="ghost" size="sm" onClick={() => { setDraft(''); setText(''); }}>
                {emptyLabel}
              </Button>
            )}
          </div>

          {/* พรีวิว — ให้เห็นว่าสีนี้ใช้กับปุ่มแล้วตัวหนังสือยังอ่านออกไหม */}
          <p className="field-label">ตัวอย่าง</p>
          <div className="rounded-lg border border-gray-200 dark:border-slate-600 p-4 flex items-center gap-3 flex-wrap">
            <span
              className="inline-flex items-center px-5 py-2.5 rounded-lg font-semibold"
              style={{ background: effectiveDraft, color: contrastOn(effectiveDraft) }}
            >
              หยิบใส่ตะกร้า
            </span>
            <span className="body-text font-semibold" style={{ color: effectiveDraft }}>฿1,790</span>
            {allowEmpty && !draft && (
              <span className="subtitle-text text-gray-500">({emptyLabel})</span>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
