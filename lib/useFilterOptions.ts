'use client';

// ตัวเลือกของช่องกรองที่ผูกกับข้อมูลของร้าน (คลัง · แบรนด์ · หมวดหมู่ · Supplier)
//
// เดิมทุกหน้าที่มีช่องพวกนี้ต้องเขียน `useEffect` ไปดึงเอง แล้วแปลงเป็น options เอง
// (หน้าสินค้า · สต็อก · bulk 4 หน้า · เอกสารคลัง 5 หน้า …) — ตรรกะเดียวกันคนละก๊อป
// และแปลงไม่เหมือนกัน (หมวดหมู่บางหน้าแบนลูกมาด้วย บางหน้าเอาแต่แม่)
//
// `apiFetch` รวบ GET ซ้ำให้อยู่แล้ว หลายช่องในหน้าเดียวกันจึงยิงรอบเดียว
//
// ⛔ ห้าม fetch รายการพวกนี้เองในหน้าเพื่อเอามาทำช่องกรองอีก — หน้าที่ต้องใช้ข้อมูล
//    ไปทำอย่างอื่นด้วย (เช่นฟอร์ม) ค่อยดึงเอง แล้วส่งเข้าช่องผ่าน prop `options`

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { FormSelectOption } from '@/components/ui/FormSelect';

export type FilterOptionSource =
  | 'brands' | 'categories' | 'suppliers'
  /** คลังของบริษัท */
  | 'warehouses'
  /** คลังของบริษัท + คลังที่ฝากไว้กับตัวแทน (หน้าโอนย้ายต้องเลือกปลายทางที่เป็นตัวแทนได้) */
  | 'warehouses_with_consignment';

interface RawRow {
  id: string;
  name: string;
  warehouse_type?: string | null;
  supplier_type?: string | null;
  children?: { id: string; name: string }[];
}

const ENDPOINT: Record<FilterOptionSource, string> = {
  brands: '/api/brands',
  categories: '/api/categories',
  warehouses: '/api/warehouses',
  warehouses_with_consignment: '/api/warehouses?include_consignment=true',
  suppliers: '/api/suppliers',
};

/** คลังมี 2 แหล่งที่ต่างกันแค่ขอบเขต — แปลงผลด้วยกติกาเดียวกัน */
function isWarehouseSource(source: FilterOptionSource): boolean {
  return source === 'warehouses' || source === 'warehouses_with_consignment';
}

/** แปลงผลจาก API เป็นตัวเลือกของช่อง — กติกาการแสดงผลของแต่ละชนิดอยู่ที่นี่ที่เดียว */
function toOptions(source: FilterOptionSource, rows: RawRow[]): FormSelectOption[] {
  if (source === 'categories') {
    // หมวดย่อยแสดงเป็นบรรทัดย่อยใต้แม่ (level 1) — เลือกได้ทั้งแม่และลูก
    return rows.flatMap(parent => [
      { id: parent.id, label: parent.name },
      ...(parent.children || []).map(child => ({
        id: child.id,
        label: child.name,
        level: 1,
        triggerLabel: `${parent.name} > ${child.name}`,
      })),
    ]);
  }
  if (isWarehouseSource(source)) {
    // คลังของบริษัทก่อน แล้วค่อยคลังที่ฝากไว้กับตัวแทน (ติดป้ายให้รู้ว่าไม่ใช่ของเรา)
    return [
      ...rows.filter(w => w.warehouse_type !== 'consignment').map(w => ({ id: w.id, label: w.name })),
      ...rows.filter(w => w.warehouse_type === 'consignment').map(w => ({ id: w.id, label: `[ตัวแทน] ${w.name}` })),
    ];
  }
  if (source === 'suppliers') {
    return rows.map(s => ({ id: s.id, label: s.name, subtitle: s.supplier_type || undefined }));
  }
  return rows.map(r => ({ id: r.id, label: r.name }));
}

export interface FilterOptionsResult {
  options: FormSelectOption[];
  loading: boolean;
}

/**
 * โหลดตัวเลือกของช่องกรองหนึ่งชนิด
 * @param enabled ปิดได้เมื่อหน้านั้นไม่ได้เปิดฟีเจอร์ที่เกี่ยว (เช่นร้านที่ไม่ใช้แบรนด์)
 */
export function useFilterOptions(source: FilterOptionSource, enabled = true): FilterOptionsResult {
  const [options, setOptions] = useState<FormSelectOption[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) { setOptions([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(ENDPOINT[source]);
        if (!res.ok) throw new Error('load failed');
        const json = await res.json();
        // `/api/warehouses` คืน `{ warehouses }` ส่วนที่เหลือคืน `{ data }`
        const rows = (isWarehouseSource(source) ? json.warehouses : json.data) as RawRow[] | undefined;
        if (!cancelled) setOptions(toOptions(source, Array.isArray(rows) ? rows : []));
      } catch {
        // โหลดตัวเลือกไม่ได้ = ช่องนั้นไม่ขึ้น ไม่ใช่ทั้งหน้าพัง
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [source, enabled]);

  return { options, loading };
}
