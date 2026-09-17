'use client';

// เงื่อนไขฝากขายของสินค้าในตะกร้า — ใช้เตือน "ขายต่ำกว่าที่ต้องจ่าย supplier แล้วขาดทุน"
//
// ⛔ ใช้เตือนบนจอเท่านั้น **ห้ามบล็อกการขาย** (ลดหนัก/แถมของเป็นการตัดสินใจทางธุรกิจที่เกิดจริง)
//    ต้นทุนที่บันทึกลงบิลคิดฝั่ง server ตอนสร้างออเดอร์ (lib/cost-utils.ts) ไม่ได้มาจากค่านี้
//
// ถามเฉพาะตัวเลือกที่ยังไม่รู้ และจำผลไว้ต่อหน้า (สินค้าของเราเองก็จำว่า "ไม่ใช่ฝากขาย"
// เพื่อไม่ถามซ้ำทุกครั้งที่ตะกร้าขยับ)

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface ConsignmentTermInfo {
  supplierName: string;
  payableUnitCost: number | null;
}

interface ApiTerm {
  supplier_name: string;
  payable_unit_cost: number | null;
}

export function useConsignmentTerms(variationIds: string[]): Record<string, ConsignmentTermInfo> {
  const [terms, setTerms] = useState<Record<string, ConsignmentTermInfo>>({});
  /** id ที่ถามไปแล้ว (ไม่ว่าจะเป็นของฝากขายหรือไม่) — กันถามซ้ำ */
  const askedRef = useRef<Set<string>>(new Set());

  const key = [...new Set(variationIds.filter(Boolean))].sort().join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    const missing = ids.filter(id => !askedRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach(id => askedRef.current.add(id));

    let cancelled = false;
    apiFetch(`/api/consignment/terms?variation_ids=${missing.join(',')}`)
      .then(async res => {
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const incoming = (data.terms || {}) as Record<string, ApiTerm>;
        if (Object.keys(incoming).length === 0) return;
        setTerms(prev => {
          const next = { ...prev };
          for (const [id, term] of Object.entries(incoming)) {
            next[id] = { supplierName: term.supplier_name, payableUnitCost: term.payable_unit_cost };
          }
          return next;
        });
      })
      .catch(() => {
        // ถามไม่ได้ = ไม่เตือน (ยังขายได้ปกติ) · ปล่อยให้ลองใหม่รอบหน้าที่สินค้าเปลี่ยน
        missing.forEach(id => askedRef.current.delete(id));
      });
    return () => { cancelled = true; };
  }, [key]);

  return terms;
}
