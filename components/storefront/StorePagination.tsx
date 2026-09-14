// Path: components/storefront/StorePagination.tsx
// แถบแบ่งหน้าใต้ตารางสินค้าของหน้าร้าน — server component ล้วน (ไม่มี state)
//
// ทุกลิงก์ต้อง **คงตัวกรองเดิมไว้** (cat / q) ไม่งั้นกดหน้า 2 แล้วหลุดออกจากหมวด
// หน้า 1 ไม่ใส่ `page=` เพื่อให้ URL ของหน้าแรกมีรูปเดียว (canonical ไม่แตก)
import Link from 'next/link';
import { storefrontHref } from '@/lib/storefront';

interface Props {
  slug: string;
  page: number;
  totalPages: number;
  cat?: string;
  q?: string;
}

/** หน้าแรก/หน้าสุดท้าย + หน้าปัจจุบัน ±2 · `null` = จุดไข่ปลา */
function pageItems(page: number, totalPages: number): (number | null)[] {
  const wanted = new Set<number>([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) {
    if (p >= 1 && p <= totalPages) wanted.add(p);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}

export default function StorePagination({ slug, page, totalPages, cat, q }: Props) {
  if (totalPages <= 1) return null;

  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    if (cat) params.set('cat', cat);
    if (q) params.set('q', q);
    if (p > 1) params.set('page', String(p));
    const query = params.toString();
    return query ? `${storefrontHref(slug)}?${query}` : storefrontHref(slug);
  };

  return (
    <nav className="sf-pagination" aria-label="แบ่งหน้าสินค้า">
      {page > 1 ? (
        <Link className="sf-pagination-step" href={hrefFor(page - 1)} rel="prev">« ก่อนหน้า</Link>
      ) : (
        <span className="sf-pagination-step sf-pagination-disabled" aria-hidden="true">« ก่อนหน้า</span>
      )}

      <ul className="sf-pagination-list">
        {pageItems(page, totalPages).map((p, i) => (
          <li key={p ?? `gap-${i}`}>
            {p === null ? (
              <span className="sf-pagination-gap" aria-hidden="true">…</span>
            ) : p === page ? (
              <span className="sf-pagination-num sf-pagination-current" aria-current="page">{p}</span>
            ) : (
              <Link className="sf-pagination-num" href={hrefFor(p)}>{p}</Link>
            )}
          </li>
        ))}
      </ul>

      {page < totalPages ? (
        <Link className="sf-pagination-step" href={hrefFor(page + 1)} rel="next">ถัดไป »</Link>
      ) : (
        <span className="sf-pagination-step sf-pagination-disabled" aria-hidden="true">ถัดไป »</span>
      )}
    </nav>
  );
}
