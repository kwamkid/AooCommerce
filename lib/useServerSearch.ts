'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ช่องค้นหาที่ค้นฝั่ง server — hook กลางที่ทำ 3 กลไกให้ครบ **ห้ามเขียนเองในหน้า**
 * (เดิม OrderForm เขียน seq guard เองต่อช่อง แล้วช่องอื่นก็ต้องเขียนซ้ำอีก)
 *
 * 1. **seq guard** — คำค้นที่ยิงทีหลังตอบก่อนได้ ผลของคำเก่าที่มาช้าต้องถูกทิ้ง
 *    ไม่งั้นผู้ใช้พิมพ์ "กระเช้าใหญ่" แล้วเห็นผลของ "กระเช้า" ทับ
 * 2. **cache ต่อคำค้น** (default 30 วิ) — ลบตัวอักษรกลับไปคำเดิม/กดเลือกแล้วพิมพ์ใหม่
 *    ไม่ต้องยิงซ้ำ แคชอยู่ใน ref ต่อ instance (ปิดฟอร์ม = หาย)
 * 3. **prefix narrowing** — พิมพ์ต่อจากคำที่เคยค้นแล้ว **และผลชุดนั้นครบ** (`complete`)
 *    → กรองต่อในเครื่องด้วย `narrow` ได้เลย ไม่ต้องยิง (พิมพ์ทีละตัวอักษรจึงยิงครั้งเดียว)
 *    ⚠️ ชุดที่ไม่ `complete` (โดน limit ตัด) กรองต่อไม่ได้ — ของที่ตรงอาจอยู่นอกชุด
 *
 * ```ts
 * // ProductSearchInput / EntitySearchInput โหมด API: ส่ง search เข้า onSearchChange
 * const productSearch = useServerSearch<Product>({ fetch: fetchProductSearchPage, narrow: narrowProducts });
 * <ItemsTable products={productSearch.results} loadingProducts={productSearch.loading}
 *             onProductSearchChange={productSearch.search} />
 * ```
 */
export interface ServerSearchPage<T> {
  rows: T[];
  /** true = ผลครบทุกตัวที่ตรง (ไม่โดน limit ตัด) — เงื่อนไขเดียวที่ยอมให้ `narrow` ทำงาน */
  complete: boolean;
}

interface ServerSearchOptions<T> {
  /** ยิงค้นจริง — ต้องคืน `complete: true` เมื่อผลไม่โดน limit ตัด */
  fetch: (q: string) => Promise<ServerSearchPage<T>>;
  /** กรองผลชุดเดิมในเครื่อง — ใช้เมื่อคำใหม่ "ต่อจาก" คำที่เคยค้นแล้วและชุดนั้น complete */
  narrow?: (rows: T[], q: string) => T[];
  /** ผลตอนคำค้นว่าง (เช่น ลูกค้าล่าสุด 30 คน) — default [] */
  emptyResults?: T[];
  /** สั้นกว่านี้ไม่ยิง คืน [] — default 2 */
  minLength?: number;
  /** อายุแคชต่อคำค้น — default 30_000 */
  cacheTtlMs?: number;
}

interface ServerSearchResult<T> {
  /** คำค้นล่าสุด (trim แล้ว) — ใช้กรองรายการในหน่วยความจำเพิ่มเองได้ เช่นโปรโมชั่น */
  query: string;
  results: T[];
  loading: boolean;
  search: (raw: string) => void;
}

type CacheEntry<T> = { rows: T[]; complete: boolean; at: number };

export function useServerSearch<T>(opts: ServerSearchOptions<T>): ServerSearchResult<T> {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>(opts.emptyResults ?? []);
  const [loading, setLoading] = useState(false);

  // เก็บ opts ใน ref เพื่อให้ `search` มี identity คงที่ (deps ว่าง) — ไม่งั้นทุก render
  // จะสร้าง callback ใหม่แล้ว debounce ของ input ที่ผูกกับมันจะถูกรีเซ็ตทิ้ง
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const seqRef = useRef(0);
  const cacheRef = useRef(new Map<string, CacheEntry<T>>());
  const queryRef = useRef('');

  const search = useCallback((raw: string) => {
    const { fetch: doFetch, narrow, emptyResults, minLength = 2, cacheTtlMs = 30_000 } = optsRef.current;
    const q = raw.trim();
    const seq = ++seqRef.current;
    setQuery(q);
    queryRef.current = q;

    if (!q) {
      setResults(emptyResults ?? []);
      setLoading(false);
      return;
    }
    if (q.length < minLength) {
      setResults([]);
      setLoading(false);
      return;
    }

    const now = Date.now();
    const cache = cacheRef.current;
    const fresh = (e: CacheEntry<T> | undefined): e is CacheEntry<T> => !!e && now - e.at < cacheTtlMs;

    // 2. คำนี้เคยค้นแล้วและยังไม่หมดอายุ
    const exact = cache.get(q);
    if (fresh(exact)) {
      setResults(exact.rows);
      setLoading(false);
      return;
    }
    if (exact) cache.delete(q);

    // 3. พิมพ์ต่อจากคำที่เคยค้นแล้วและชุดนั้นครบ → กรองต่อในเครื่อง (เลือก prefix ที่ยาวสุด)
    if (narrow) {
      let best: { key: string; entry: CacheEntry<T> } | null = null;
      for (const [key, entry] of cache) {
        if (now - entry.at >= cacheTtlMs) { cache.delete(key); continue; }
        if (!entry.complete) continue;
        if (!q.startsWith(key)) continue;
        if (!best || key.length > best.key.length) best = { key, entry };
      }
      if (best) {
        const rows = narrow(best.entry.rows, q);
        cache.set(q, { rows, complete: true, at: now });
        setResults(rows);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    void (async () => {
      try {
        const page = await doFetch(q);
        if (seq !== seqRef.current) return; // มีคำค้นใหม่กว่าแล้ว ทิ้งผลนี้
        cacheRef.current.set(q, { rows: page.rows, complete: page.complete, at: Date.now() });
        setResults(page.rows);
      } catch (error) {
        console.error('useServerSearch fetch failed:', error);
        if (seq === seqRef.current) setResults([]);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  }, []);

  // ผลตั้งต้นเพิ่งโหลดเสร็จ (เช่นลูกค้าล่าสุดจาก /init) ขณะช่องค้นหายังว่าง → สะท้อนให้เลย
  const emptyResults = opts.emptyResults;
  useEffect(() => {
    if (queryRef.current === '') setResults(emptyResults ?? []);
  }, [emptyResults]);

  return { query, results, loading, search };
}
