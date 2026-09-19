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

/**
 * จำนวน id ต่อรอบของ `fetchAllRowsByIds`
 *
 * ไม่ได้ตั้งเพราะเพดานแถว (ตัวนั้น `fetchAllRows` จัดการให้แล้ว) แต่เพราะ `.in()` ที่ยาว
 * เกินไปทำให้ URL ของ PostgREST ยาวจนโดนตัด — id เป็น uuid 36 ตัวอักษร 300 ตัว ≈ 11KB
 */
export const ID_CHUNK_SIZE = 300;

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
/**
 * ⚠️ `.range()` = LIMIT/OFFSET — **ไม่มี ORDER BY ที่ชี้แถวได้ตัวเดียว = หน้าซ้อน/หลุดได้**
 *
 * Postgres ไม่รับประกันลำดับแถวระหว่าง query สองครั้งถ้าไม่ได้สั่ง ORDER BY (แผนเปลี่ยนตาม
 * OFFSET · parallel scan คืนลำดับต่างกันทุกครั้ง · แถวที่ถูก UPDATE ระหว่างหน้าย้ายที่)
 * และ ORDER BY คอลัมน์ที่ค่าซ้ำได้ (`sort_order` · `name` · `created_at`) ก็ยังสลับกันได้
 * ที่รอยต่อของหน้า ⇒ ได้แถวเดิมซ้ำและแถวอื่นหาย **ทั้งที่ยิงครบทุกหน้าแล้ว**
 *
 * กติกา: ทุก query ที่ส่งเข้ามาต้องปิดท้ายด้วย `.order('id')` (ตารางที่ไม่มี `id` ใช้คีย์
 * ที่ไม่ซ้ำของมัน) — ตัวนี้เตือนตอน dev เมื่อลืม (ดูจาก URL ของ PostgREST ไม่มี `order=`)
 */
function warnIfUnordered(query: unknown): void {
  if (process.env.NODE_ENV === 'production') return;
  const url = (query as { url?: URL } | null)?.url;
  if (!(url instanceof URL) || url.searchParams.has('order')) return;
  const table = url.pathname.split('/').pop() || '?';
  if (warnedTables.has(table)) return;
  warnedTables.add(table);
  console.warn(`[supabase-paging] ${table}: ไล่หน้าโดยไม่มี .order() — หน้าซ้อน/หลุดได้ ใส่ .order('id') ก่อน .range()`);
}
const warnedTables = new Set<string>();

/**
 * แบ่ง id เป็นชุด ๆ สำหรับ `.in()` — ใช้กับ **การเขียน** (update/delete) ที่ไม่ได้อ่านแถวกลับ
 * (การอ่านใช้ `fetchAllRowsByIds` ซึ่งแบ่งให้แล้วและไล่หน้าให้ด้วย)
 */
export function chunkIds<T>(ids: readonly T[], size = ID_CHUNK_SIZE): T[][] {
  const step = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += step) out.push(ids.slice(i, i + step) as T[]);
  return out;
}

/**
 * ดึงแถวของรายการ id ที่ยาวเกินกว่าจะใส่ `.in()` ทีเดียวได้
 *
 * ⚠️ **`.in()` ชนเพดานสองชั้น** และเป็นกับดักที่เจอบ่อยกว่า `fetchAllRows` ธรรมดา:
 * ส่ง id ไป 3,000 ตัวก็ยังได้แถวกลับมาแค่ 1,000 (ชั้นแรก) และถ้า id ชุดนั้นมาจาก query
 * ที่ไม่ได้แบ่งหน้าก็ขาดตั้งแต่ต้นทางอีกชั้น — ต้องแก้ทั้งสองชั้นถึงจะได้ครบจริง
 *
 * @param ids รายการ id ทั้งหมด (ซ้ำได้ ไม่ต้องตัดเอง)
 * @param run `(idChunk, from, to) => query.in('x', idChunk).range(from, to)`
 */
export async function fetchAllRowsByIds<T>(
  ids: readonly string[],
  run: (idChunk: string[], from: number, to: number) => PromiseLike<PageResponse<T>>,
  opts: { chunkSize?: number } = {},
): Promise<PagedResult<T>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return { rows: [], count: 0, error: null };

  const size = Math.max(1, opts.chunkSize ?? ID_CHUNK_SIZE);
  let rows: T[] = [];
  for (let i = 0; i < unique.length; i += size) {
    const part = unique.slice(i, i + size);
    const page = await fetchAllRows<T>((from, to) => run(part, from, to));
    if (page.error) return { rows, count: null, error: page.error };
    rows = rows.concat(page.rows);
  }
  return { rows, count: rows.length, error: null };
}

export async function fetchAllRows<T>(
  run: (from: number, to: number) => PromiseLike<PageResponse<T>>,
  opts: { from?: number; to?: number } = {},
): Promise<PagedResult<T>> {
  const from = opts.from ?? 0;
  const to = opts.to ?? Number.MAX_SAFE_INTEGER;
  if (to < from) return { rows: [], count: null, error: null };

  const firstEnd = Math.min(from + SUPABASE_PAGE_CAP - 1, to);
  const firstQuery = run(from, firstEnd);
  warnIfUnordered(firstQuery);
  const first = await firstQuery;
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
