// Path: lib/useIsSuperAdmin.ts
// ถามว่าผู้ใช้เป็นผู้ดูแลระบบไหม **โดยไม่ redirect** — ใช้ซ่อน/แสดงเมนูทดลองในหน้าของร้าน
// (หน้าใต้ /superadmin ใช้ useSuperAdminGuard ที่เด้งออกเมื่อไม่มีสิทธิ์)
'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

/** @param enabled ถามเมื่อพร้อมเท่านั้น (เช่นหลังรู้ว่าผู้ใช้เข้าหน้านี้ได้) — false ระหว่างรอ/ถามไม่ได้ */
export function useIsSuperAdmin(enabled = true): boolean {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiFetch('/api/superadmin/me').then(
      (r) => { if (!cancelled) setIsSuperAdmin(r.ok); },
      () => {},
    );
    return () => { cancelled = true; };
  }, [enabled]);

  return isSuperAdmin;
}
