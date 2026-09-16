// Path: lib/useStorefrontLinks.ts
//
// "ร้านนี้เปิดหน้าร้านออนไลน์อยู่ไหม และลิงก์ของสินค้า/หมวด หน้าตาเป็นยังไง"
// — ตัวเดียวที่ทุกหน้าถาม ไม่ต้องไปยิง `/api/settings/storefront` เองแล้วประกอบ URL เอง
//
// ⛔ **ยังไม่เปิดหน้าร้าน = แทรกลิงก์ไม่ได้** (เจ้าของกำหนด 16 ก.ย. 2026 — "ถ้าไม่เปิด
// storefront มันก็เลือกไม่ได้นะ เพราะมันไม่มี link ไง") ⇒ ผู้เรียกต้องซ่อน/ปิดปุ่มเมื่อ
// `enabled` เป็น false ห้ามปล่อยให้กดแล้วได้ URL ที่เปิดไม่ขึ้น

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  parseStorefront, storefrontAbsoluteUrl, storefrontProductUrl, storefrontCategoryUrl,
  type StorefrontConfig,
} from '@/lib/storefront';

export interface StorefrontLinks {
  /** ยังไม่รู้ผล — ระหว่างนี้อย่าเพิ่งวาดปุ่ม (กันปุ่มกระพริบหายตอนโหลดเสร็จ) */
  loading: boolean;
  /** เปิดหน้าร้าน + ตั้งชื่อลิงก์แล้ว = สร้างลิงก์ได้จริง */
  enabled: boolean;
  home: string;
  product: (productSlug: string) => string;
  category: (categorySlug: string) => string;
}

const NO_LINK = () => '';

/**
 * ถามครั้งเดียวต่อหน้า — `apiFetch` รวบ GET ซ้ำให้อยู่แล้ว หลายที่ในหน้าเดียวกัน
 * เรียก hook นี้พร้อมกันได้ไม่เปลืองรอบ
 */
export function useStorefrontLinks(enabledWhen = true): StorefrontLinks {
  const [state, setState] = useState<{ loading: boolean; cfg: StorefrontConfig | null; slug: string }>(
    { loading: true, cfg: null, slug: '' },
  );

  useEffect(() => {
    if (!enabledWhen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/settings/storefront');
        const json = res.ok ? await res.json() : null;
        if (cancelled) return;
        setState({
          loading: false,
          cfg: json ? parseStorefront({ storefront: json.storefront }) : null,
          slug: String(json?.slug || ''),
        });
      } catch {
        // ถามไม่ได้ = ถือว่ายังไม่เปิด — ปุ่มหายดีกว่าแทรกลิงก์ที่เปิดไม่ขึ้นไปหาลูกค้า
        if (!cancelled) setState({ loading: false, cfg: null, slug: '' });
      }
    })();
    return () => { cancelled = true; };
  }, [enabledWhen]);

  const { loading, cfg, slug } = state;
  const ready = !!cfg?.enabled && !!slug;
  return {
    loading,
    enabled: ready,
    home: ready ? storefrontAbsoluteUrl(cfg, slug) : '',
    product: ready ? (s: string) => storefrontProductUrl(cfg, slug, s) : NO_LINK,
    category: ready ? (s: string) => storefrontCategoryUrl(cfg, slug, s) : NO_LINK,
  };
}
