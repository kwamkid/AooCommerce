'use client';

// แถบตัวกรองกลางของหน้า list ทุกหน้า — กล่อง + การจัดแถว + ช่องค้นหา + ปุ่มล้าง
//
// เดิมแต่ละหน้าเขียน `data-filter-card` + flex เอง จนได้ **7 หน้าตาที่ไม่เหมือนกัน**
// (บางหน้าไม่มีการ์ดเลย · ปุ่มล้างมี 4 แบบ · ความสูงช่อง 42px/40px/py-2 ปนกัน)
// และ debounce ของช่องค้นหามี 4 ค่า (300/400/ตอน blur/ไม่มีเลย)
//
// ⛔ ห้ามเขียนแถบตัวกรองเองในหน้าอีก — ช่องเฉพาะหน้าส่งเข้ามาทาง children
// คู่กับ `useListFilterParams` (lib/) ที่เก็บค่าทุกช่องไว้ใน URL
//
// การจัดแถว: ช่องค้นหายืดเต็มที่เหลือ · ช่องอื่นกว้างคงที่เรียงต่อกัน · จอแคบซ้อนลงมาเอง
// ⚠️ ทุกช่องที่ส่งมาควรสูง 42px (`FormSelect` · `DateRangePicker` · `FilterChips size="md"`)
//    ไม่งั้นแถวจะเป็นขั้นบันได

import { useState, type ReactNode } from 'react';
import { CloseIcon } from '@/lib/icons';
import Button from '@/components/ui/Button';
import SearchInput from '@/components/ui/SearchInput';
import Tooltip from '@/components/ui/Tooltip';
import { useDebouncedCallback } from '@/lib/useDebounce';

interface Props {
  /** ค่าค้นหาปัจจุบัน (จาก URL) — ไม่ส่ง = ไม่มีช่องค้นหา */
  search?: string;
  /** เรียกหลังหยุดพิมพ์ (debounce ในตัว) — ล้างช่องแล้วยิงทันทีไม่ต้องรอ */
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  /** หน่วงก่อนยิงค้นหา — ค่ากลางของทั้งระบบคือ 400ms ไม่ต้องส่งมาถ้าไม่มีเหตุผลเฉพาะ */
  searchDebounceMs?: number;
  /** ช่องกรองของหน้านั้น — เรียงต่อจากช่องค้นหา */
  children?: ReactNode;
  /** มีตัวกรองที่ผู้ใช้ตั้งเองอยู่ไหม (จาก `useListFilterParams`) */
  hasActiveFilters?: boolean;
  onClear?: () => void;
  /** ของที่ต้องอยู่ชิดขวาสุด เช่น ป้ายสรุปจำนวน */
  summary?: ReactNode;
  className?: string;
}

export default function ListFilters({
  search,
  onSearch,
  searchPlaceholder = 'ค้นหา...',
  searchDebounceMs = 400,
  children,
  hasActiveFilters = false,
  onClear,
  summary,
  className = '',
}: Props) {
  // พิมพ์เห็นทันที ยิงจริงหลังหยุดพิมพ์ — ไม่งั้นทุกตัวอักษรยิง API หนึ่งครั้ง
  const [input, setInput] = useState(search || '');
  // ค่าจากข้างนอกเปลี่ยน (กดล้างตัวกรอง · กดย้อนกลับ · เปิดลิงก์ที่มี ?q=) ต้องสะท้อนในช่อง
  // ปรับระหว่าง render ตาม pattern ของ React — ทำใน effect จะ render ซ้อนรอบโดยไม่จำเป็น
  const [lastSearch, setLastSearch] = useState(search);
  if (search !== lastSearch) {
    setLastSearch(search);
    setInput(search || '');
  }
  const debounced = useDebouncedCallback((value: string) => onSearch?.(value), searchDebounceMs);
  const handleChange = (value: string) => {
    setInput(value);
    // กดกากบาทล้างช่อง = อยากเห็นผลทันที ไม่ควรรอ debounce
    if (!value) { debounced.cancel(); onSearch?.(''); return; }
    debounced(value);
  };

  return (
    <div className={`data-filter-card ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-2">
        {onSearch && (
          <div className="w-full md:flex-1 md:min-w-[220px]">
            <SearchInput
              value={input}
              onChange={handleChange}
              onSubmit={() => { debounced.now?.(input); }}
              placeholder={searchPlaceholder}
            />
          </div>
        )}
        {children}
        {hasActiveFilters && onClear && (
          <Tooltip text="ล้างตัวกรอง">
            <Button
              variant="ghost"
              icon={<CloseIcon className="w-4 h-4" />}
              onClick={onClear}
              aria-label="ล้างตัวกรอง"
            >
              <span className="hidden md:inline">ล้างตัวกรอง</span>
            </Button>
          </Tooltip>
        )}
        {summary && <div className="ml-auto flex items-center gap-2">{summary}</div>}
      </div>
    </div>
  );
}
