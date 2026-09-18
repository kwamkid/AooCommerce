// Path: components/storefront/StorefrontLinkModal.tsx
//
// "เลือกของในร้าน แล้วได้ลิงก์" — ตัวเดียวของทุกที่ที่พิมพ์ข้อความถึงลูกค้า
// ใช้ที่: กล่องพิมพ์หน้าแชท · ข้อความสำเร็จรูป · ข้อความคูปองของการ์ดชวนรับข่าวสาร
//
// ⛔ **ผู้เรียกต้องเช็ค `useStorefrontLinks().enabled` ก่อนวาดปุ่มเปิดโมดัลนี้** — ยังไม่เปิด
// หน้าร้าน = ไม่มีหน้าให้ลิงก์ไป (เจ้าของกำหนด 16 ก.ย. 2026) · โมดัลกันซ้ำให้อีกชั้นแต่ไม่ควรถึงตรงนั้น
//
// รายการมาจาก `/api/storefront/link-targets` ซึ่งกรองด้วยเงื่อนไขเดียวกับหน้าร้านจริง
// (active + storefront_visible + มี slug) ⇒ ของที่เลือกได้ในนี้ เปิดแล้วเจอหน้าจริงเสมอ

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { CategoryIcon, DashboardIcon, ProductIcon } from '@/lib/icons';
import Modal from '@/components/ui/Modal';
import SearchInput from '@/components/ui/SearchInput';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE, type FilterChip } from '@/components/ui/FilterChips';
import { LoadingCard, EmptyCard } from '@/components/ui/StateCard';
import { apiFetch } from '@/lib/api-client';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { useStorefrontLinks } from '@/lib/useStorefrontLinks';
import ProductImageThumb from '@/components/ui/ProductImageThumb';

type Kind = 'home' | 'product' | 'category' | 'brand';

interface TargetRow {
  id: string;
  name: string;
  slug: string;
  image?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** ได้ URL เต็มกลับไปแทรกในข้อความ */
  onPick: (url: string) => void;
}

const KIND_CHIPS: FilterChip<Kind>[] = [
  { id: 'product', label: 'สินค้า', icon: <ProductIcon className="w-4 h-4" />, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
  { id: 'category', label: 'หมวดหมู่', icon: <CategoryIcon className="w-4 h-4" />, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
  { id: 'brand', label: 'แบรนด์', icon: <Bookmark className="w-4 h-4" />, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
  { id: 'home', label: 'หน้าร้าน', icon: <DashboardIcon className="w-4 h-4" />, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
];

export default function StorefrontLinkModal({ open, onClose, onPick }: Props) {
  const links = useStorefrontLinks(open);
  const [kind, setKind] = useState<Kind>('product');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async (type: Kind, q: string) => {
    if (type === 'home') return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/storefront/link-targets?type=${type}&q=${encodeURIComponent(q)}`);
      const json = res.ok ? await res.json() : null;
      setRows((json?.items || []) as TargetRow[]);
      setTruncated(json?.complete === false);
    } catch {
      setRows([]);
      setTruncated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // หมวดโหลดครบรอบเดียวแล้วกรองในเครื่อง · สินค้าค้นที่ server (ร้านมีได้เป็นพัน)
  const searchOnServer = useDebouncedCallback((q: string) => { void load('product', q); }, 350);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setTruncated(false);
    if (kind !== 'home') void load(kind, '');
  }, [open, kind, load]);

  const visible = useMemo(() => {
    // สินค้าค้นที่ server แล้ว — หมวด/แบรนด์โหลดครบรอบเดียว กรองในเครื่องพอ
    if (kind === 'product') return rows;
    const q = search.trim().toLowerCase();
    return q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, kind, search]);

  const pick = (url: string) => {
    if (!url) return;
    onPick(url);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="แทรกลิงก์หน้าร้าน" size="lg">
      <div className="space-y-4">
        {!links.loading && !links.enabled ? (
          <EmptyCard
            title="ยังไม่ได้เปิดหน้าร้านออนไลน์"
            subtitle="เปิดหน้าร้านและตั้งชื่อลิงก์ที่ ตั้งค่า › หน้าร้านออนไลน์ ก่อน ถึงจะมีหน้าให้ลิงก์ไป"
          />
        ) : (
          <>
            <FilterChips
              chips={KIND_CHIPS}
              value={kind}
              onChange={v => { setKind(v); setSearch(''); }}
            />

            {kind === 'home' ? (
              <button
                type="button"
                onClick={() => pick(links.home)}
                className="choice-card choice-card-active w-full text-left p-4"
              >
                <span className="body-text font-medium block">หน้าแรกของร้าน</span>
                <span className="subtitle-text block break-all">{links.home}</span>
              </button>
            ) : (
              <>
                <SearchInput
                  value={search}
                  onChange={v => {
                    setSearch(v);
                    if (kind === 'product') searchOnServer(v);
                  }}
                  placeholder={
                    kind === 'product' ? 'ค้นหาสินค้า...'
                    : kind === 'brand' ? 'ค้นหาแบรนด์...'
                    : 'ค้นหาหมวดหมู่...'
                  }
                />

                {loading ? (
                  <LoadingCard />
                ) : visible.length === 0 ? (
                  <EmptyCard
                    title={
                      kind === 'product' ? 'ไม่พบสินค้าที่ขึ้นหน้าร้าน'
                      : kind === 'brand' ? 'ไม่พบแบรนด์ที่มีสินค้าขึ้นหน้าร้าน'
                      : 'ไม่พบหมวดหมู่'
                    }
                    subtitle={
                      kind === 'product'
                        ? 'สินค้าจะลิงก์ได้ก็ต่อเมื่อเปิดขายอยู่และตั้งให้แสดงบนหน้าร้าน'
                        : undefined
                    }
                  />
                ) : (
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700">
                    {visible.map(row => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => pick(
                          kind === 'product' ? links.product(row.slug)
                          : kind === 'brand' ? links.brand(row.slug)
                          : links.category(row.slug),
                        )}
                        className="w-full flex items-center gap-3 py-2.5 px-1 text-left hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        {(kind === 'product' || kind === 'brand') && (
                          <ProductImageThumb src={row.image} alt={row.name} size="sm" disabled />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="body-text block truncate">{row.name}</span>
                          <span className="subtitle-text block truncate">/{row.slug}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {truncated && (
                  <p className="helper-text">แสดงเท่าที่พบก่อน — พิมพ์ค้นหาเพื่อจำกัดให้แคบลง</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
