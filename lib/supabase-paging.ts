/**
 * ดึงแถวข้ามเพดาน 1,000 แถวของ Supabase Cloud
 *
 * PostgREST ของ Supabase Cloud ตัด response ไว้ที่ 1,000 แถวเสมอ ไม่ว่าจะ `.range()`
 * กว้างแค่ไหน และ **ไม่มี error ให้จับ** — query ที่ไม่แบ่งหน้าจึงได้ข้อมูลไม่ครบเงียบ ๆ
 * (ร้านที่มีสินค้า 5,826 รายการเคยได้แค่ 1,000 ตัวแรก สินค้าตัวที่ 5,043 หาไม่เจอทั้งที่มีอยู่จริง
 * — ดู fix-bug.md 2026-09-07)
 *
 * ใช้กับ query ที่ "ต้องได้ครบ" เท่านั้น — ถ้าหน้าจอไหนไม่จำเป็นต้องได้ทั้งตาราง
 * ให้ค้นฝั่ง server แทน (ส่งทั้งตารางมาให้ client กรองเองยังชนเพดาน 4.5MB ของ Vercel อยู่ดี)
 */

/** เพดานแถวต่อ response ที่ Supabase Cloud บังคับ */
export const SUPABASE_PAGE_CAP = 1000;

export interface PagedResult<T> {
  rows: T[];
  /** จำนวนแถวทั้งหมด — ได้ค่าเมื่อ query ใส่ `{ count: 'exact' }` เท่านั้น */
  count: number | null;
  error: { message: string } | null;
}

interface PageResponse<T> {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
}

/**
 * @param run  `(from, to) => query.range(from, to)` — **ต้องสร้าง query ใหม่ทุกครั้ง**
 *             (query builder ของ supabase-js ใช้ซ้ำไม่ได้ ยิงสองรอบจะพัง)
 * @param opts ช่วงแถวที่ต้องการ (default = ทั้งหมดตั้งแต่แถว 0)
 *
 * ถ้า query ใส่ `{ count: 'exact' }` มาด้วย จะรู้จำนวนหน้าที่เหลือตั้งแต่หน้าแรก
 * แล้วยิงหน้าที่เหลือ**ขนานกัน** · ถ้าไม่มี count จะไล่ทีละหน้าจนกว่าจะได้ไม่เต็มหน้า
 */
export async function fetchAllRows<T>(
  run: (from: number, to: number) => PromiseLike<PageResponse<T>>,
  opts: { from?: number; to?: number } = {},
): Promise<PagedResult<T>> {
  const from = opts.from ?? 0;
  const to = opts.to ?? Number.MAX_SAFE_INTEGER;
  if (to < from) return { rows: [], count: null, error: null };

  const firstEnd = Math.min(from + SUPABASE_PAGE_CAP - 1, to);
  const first = await run(from, firstEnd);
  if (first.error) return { rows: [], count: first.count ?? null, error: first.error };

  let rows = first.data || [];
  const count = first.count ?? null;

  // หน้าแรกไม่เต็ม = หมดแล้ว · หรือช่วงที่ขอจบในหน้าแรกอยู่แล้ว
  const firstPageSize = firstEnd - from + 1;
  if (rows.length < firstPageSize || firstEnd >= to) {
    return { rows, count, error: null };
  }

  if (count != null) {
    const effectiveEnd = Math.min(to, count - 1);
    const starts: number[] = [];
    for (let start = firstEnd + 1; start <= effectiveEnd; start += SUPABASE_PAGE_CAP) {
      starts.push(start);
    }
    const pages = await Promise.all(
      starts.map(start => run(start, Math.min(start + SUPABASE_PAGE_CAP - 1, effectiveEnd))),
    );
    for (const page of pages) {
      if (page.error) return { rows, count, error: page.error };
      if (page.data) rows = rows.concat(page.data);
    }
    return { rows, count, error: null };
  }

  // ไม่รู้ยอดรวม — ไล่ทีละหน้าจนกว่าจะได้ไม่เต็มหน้า
  let start = firstEnd + 1;
  while (start <= to) {
    const end = Math.min(start + SUPABASE_PAGE_CAP - 1, to);
    const pageSize = end - start + 1;
    const page = await run(start, end);
    if (page.error) return { rows, count, error: page.error };
    const data = page.data || [];
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    start = end + 1;
  }

  return { rows, count, error: null };
}
