'use client';

// ตารางแก้สดบนเว็บ — "เหมือนแก้ Excel แต่เห็นผลทันที" (เจ้าของกำหนด 17 ก.ย. 2569)
//
// กติกาที่ทุกหน้าต้องเหมือนกัน:
//  • แก้แล้ว **ยังไม่บันทึกจนกว่าจะกดปุ่ม** — ค่าที่แก้อยู่ใน draft เท่านั้น ปิดหน้าไปคือหาย
//  • แก้กลับไปเท่าค่าเดิม = ถือว่าไม่ได้แก้ (ปุ่มบันทึกต้องไม่ค้างสว่างทั้งที่ไม่มีอะไรเปลี่ยน)
//  • คืนค่าเดิมได้รายแถว และล้างทั้งหมดได้
//  • แถวที่ค่ายังผิดกติกา = บันทึกไม่ได้ทั้งชุด (ไม่ปล่อยให้บันทึกครึ่ง ๆ)
//
// ⛔ ห้ามเขียน state draft เองในหน้าอีก — ใช้ hook นี้
// คู่กับ `useBulkApply` (lib/bulk/use-bulk-apply.ts) ที่เป็นทางฝั่งไฟล์ Excel:
// **ทุก objective ควรมีทั้งสองทาง** — ตารางสดสำหรับแก้เร็ว ๆ ทีละไม่กี่ตัว
// กับ Excel สำหรับงานหนักที่ต้องพิมพ์ค่าเองเยอะ ๆ

import { useCallback, useMemo, useState } from 'react';

/** ค่าที่แก้ได้ในตาราง — string สำหรับช่องข้อความ · number สำหรับช่องตัวเลข */
export type EditableValue = string | number | boolean | null;

export interface InlineEditOptions<TRow> {
  rows: TRow[];
  getId: (row: TRow) => string;
  /**
   * ตรวจค่าที่แก้ของทั้งแถว — คืนข้อความ error ต่อ field (`{}` = ผ่าน)
   * `others` = ค่าปัจจุบัน (รวม draft) ของแถวอื่น ไว้ตรวจค่าซ้ำ เช่น slug/SKU
   */
  validateRow?: (
    merged: TRow,
    ctx: { row: TRow; others: TRow[] },
  ) => Record<string, string> | null;
}

export interface InlineEditTable<TRow> {
  /** ค่าปัจจุบันของแถว = ค่าเดิมทับด้วยสิ่งที่แก้ไว้ */
  merged: (row: TRow) => TRow;
  /** อ่านค่าช่องเดียว (ผ่าน draft ให้แล้ว) */
  field: <K extends keyof TRow>(row: TRow, key: K) => TRow[K];
  /** แก้ค่าช่องเดียว — เท่าค่าเดิมเมื่อไหร่ ถอดออกจาก draft ให้เอง */
  setField: <K extends keyof TRow>(row: TRow, key: K, value: TRow[K]) => void;
  /** แถวนี้มีของค้างไหม */
  isDirty: (row: TRow) => boolean;
  /** คืนค่าเดิมเฉพาะแถวนี้ */
  revertRow: (row: TRow) => void;
  /** ล้างทุกอย่างที่ยังไม่บันทึก */
  revertAll: () => void;
  /** เขียนทับหลายแถวรวดเดียว (ปุ่มช่วยคิดทั้งคอลัมน์ เช่น "ย่อทั้งหมด") — คืนจำนวนแถวที่เปลี่ยนจริง */
  applyToRows: (rows: TRow[], compute: (row: TRow) => Partial<TRow> | null) => number;
  /** แถวที่แก้ไว้ พร้อมเฉพาะช่องที่เปลี่ยน — ส่งขึ้น API ได้ตรง ๆ */
  dirtyRows: { id: string; row: TRow; changes: Partial<TRow> }[];
  /** error ของแถว (จาก `validateRow`) — ว่าง = ผ่าน */
  errorsOf: (row: TRow) => Record<string, string>;
  /** จำนวนแถวที่แก้แล้วยังผิดกติกา — บันทึกไม่ได้จนกว่าจะเป็น 0 */
  invalidCount: number;
}

export function useInlineEditTable<TRow extends object>(
  options: InlineEditOptions<TRow>,
): InlineEditTable<TRow> {
  const { rows, getId, validateRow } = options;
  const [drafts, setDrafts] = useState<Record<string, Partial<TRow>>>({});

  const merged = useCallback((row: TRow): TRow => {
    const draft = drafts[getId(row)];
    return draft ? { ...row, ...draft } : row;
  }, [drafts, getId]);

  const field = useCallback(<K extends keyof TRow>(row: TRow, key: K): TRow[K] => {
    const draft = drafts[getId(row)];
    return draft && key in draft ? (draft[key] as TRow[K]) : row[key];
  }, [drafts, getId]);

  const setField = useCallback(<K extends keyof TRow>(row: TRow, key: K, value: TRow[K]) => {
    const id = getId(row);
    setDrafts(prev => {
      const next = { ...prev };
      const draft = { ...(next[id] || {}) };
      // ค่าเท่าเดิม = ถอดออกจาก draft · ไม่เหลือช่องไหนเลย = ถอดทั้งแถว
      if (value === row[key]) delete draft[key];
      else draft[key] = value;
      if (Object.keys(draft).length === 0) delete next[id];
      else next[id] = draft;
      return next;
    });
  }, [getId]);

  const isDirty = useCallback((row: TRow) => getId(row) in drafts, [drafts, getId]);

  const revertRow = useCallback((row: TRow) => {
    setDrafts(prev => {
      const next = { ...prev };
      delete next[getId(row)];
      return next;
    });
  }, [getId]);

  const revertAll = useCallback(() => setDrafts({}), []);

  const applyToRows = useCallback((targets: TRow[], compute: (row: TRow) => Partial<TRow> | null) => {
    let changed = 0;
    setDrafts(prev => {
      const next = { ...prev };
      for (const row of targets) {
        const id = getId(row);
        const current = { ...row, ...(next[id] || {}) } as TRow;
        const patch = compute(current);
        if (!patch) continue;

        const draft = { ...(next[id] || {}) };
        let touched = false;
        for (const [key, value] of Object.entries(patch) as [keyof TRow, TRow[keyof TRow]][]) {
          if (value === current[key]) continue;   // คำนวณแล้วได้ค่าเดิม = ไม่นับ
          if (value === row[key]) delete draft[key];
          else draft[key] = value;
          touched = true;
        }
        if (!touched) continue;
        if (Object.keys(draft).length === 0) delete next[id];
        else next[id] = draft;
        changed += 1;
      }
      return next;
    });
    return changed;
  }, [getId]);

  const dirtyRows = useMemo(() => {
    const byId = new Map(rows.map(row => [getId(row), row]));
    return Object.entries(drafts).flatMap(([id, changes]) => {
      const row = byId.get(id);
      return row ? [{ id, row, changes }] : [];
    });
  }, [drafts, rows, getId]);

  /** คิดครั้งเดียวต่อรอบ render — เรียก `validateRow` ต่อแถวที่แก้เท่านั้น */
  const errorMap = useMemo(() => {
    if (!validateRow) return new Map<string, Record<string, string>>();
    const mergedAll = rows.map(row => ({ ...row, ...(drafts[getId(row)] || {}) } as TRow));
    const map = new Map<string, Record<string, string>>();
    for (const entry of dirtyRows) {
      const id = entry.id;
      const others = mergedAll.filter((_, index) => getId(rows[index]) !== id);
      const errors = validateRow({ ...entry.row, ...entry.changes } as TRow, { row: entry.row, others });
      if (errors && Object.keys(errors).length > 0) map.set(id, errors);
    }
    return map;
  }, [dirtyRows, drafts, rows, getId, validateRow]);

  const errorsOf = useCallback(
    (row: TRow) => errorMap.get(getId(row)) || {},
    [errorMap, getId],
  );

  return {
    merged, field, setField, isDirty, revertRow, revertAll, applyToRows,
    dirtyRows, errorsOf, invalidCount: errorMap.size,
  };
}
