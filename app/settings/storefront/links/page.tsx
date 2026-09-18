'use client';

// ลิงก์สินค้าในหน้าร้าน — ตารางแก้สดบนเว็บ (เหมือนแก้ Excel แต่เห็นผลทันที)
//
// ทำไมไม่ใช่ Excel เหมือน /products/bulk: ราคา/สต็อกต้องให้คนพิมพ์ค่าเอง แต่ลิงก์ระบบ
// คิดให้ได้ (`shortenSlug`) — ร้านที่มีสินค้าชื่อไทย 594 ตัวจะได้กด "ย่อทั้งหมด" ทีเดียว
// แล้วดูผลก่อนบันทึก แทนที่จะพิมพ์เองทีละแถวในไฟล์
//
// ⛔ แก้แล้ว **ยังไม่บันทึกจนกว่าจะกดปุ่ม** (เจ้าของกำหนด) — ค่าที่แก้อยู่ใน `drafts`
//    เท่านั้น ปิดหน้าไปคือหาย เหมือนไฟล์ที่ยังไม่ได้เซฟ

import { useCallback, useMemo, useState } from 'react';
import { Scissors } from 'lucide-react';
import { ExternalLinkIcon, LinkIcon, ResetIcon } from '@/lib/icons';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Container from '@/components/ui/Container';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import FormInput from '@/components/ui/FormInput';
import ListFilterBar from '@/components/ui/ListFilterBar';
import PageHeader from '@/components/ui/PageHeader';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import StickyActionBar from '@/components/ui/StickyActionBar';
import Badge from '@/components/ui/Badge';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import {
  MASTER_SLUG_LONG,
  MASTER_SLUG_MAX,
  encodedSlugLength,
  hasThai,
  masterSlugErrorMessage,
  normalizeMasterSlug,
  shortenSlug,
  validateMasterSlug,
} from '@/lib/master-slug';
import { can } from '@/lib/permissions';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useInlineEditTable } from '@/lib/use-inline-edit-table';
import { useStorefrontLinks } from '@/lib/useStorefrontLinks';
import { useToast } from '@/lib/toast-context';

interface ProductSlugRow {
  id: string;
  name: string;
  code?: string | null;
  slug: string | null;
  image?: string | null;
}

export default function StorefrontLinksPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const storefront = useStorefrontLinks();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ProductSlugRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const fetchRows = useCallback(async () => {
    try {
      const res = await apiFetch('/api/products/slugs');
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      const data = await res.json();
      // กันรูปร่างผิดจาก API — ตารางทั้งหน้าพังถ้าไม่ใช่ array (เคยพังมาแล้วเพราะ
      // `fetchAllRows` คืน `{rows, count, error}` แล้ว route ส่งทั้งก้อนออกมา)
      setRows(Array.isArray(data?.data) ? (data.data as ProductSlugRow[]) : []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useFetchOnce(fetchRows, can(userProfile, 'product.view'));

  // draft ที่ยังไม่บันทึก + ตรวจค่า + ปุ่มคืนค่า อยู่ที่ hook กลาง (lib/use-inline-edit-table)
  const table = useInlineEditTable<ProductSlugRow>({
    rows,
    getId: row => row.id,
    validateRow: (merged, { others }) => {
      const error = validateMasterSlug(
        merged.slug || '',
        others.map(other => other.slug || '').filter(Boolean),
      );
      return error ? { slug: masterSlugErrorMessage(error) } : null;
    },
  });

  /** ค่าที่แสดงในช่อง = ค่าที่แก้ไว้ ถ้ายังไม่แตะก็เป็นค่าจาก DB */
  const valueOf = useCallback((row: ProductSlugRow) => table.field(row, 'slug') || '', [table]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(row => row.name.toLowerCase().includes(query)
      || (row.slug || '').toLowerCase().includes(query)
      || (row.code || '').toLowerCase().includes(query));
  }, [rows, search]);

  /** แถวที่แก้แล้ว — ส่งขึ้น API ตรง ๆ */
  const dirtyItems = useMemo(
    () => table.dirtyRows.map(entry => ({ id: entry.id, slug: entry.changes.slug || '' })),
    [table.dirtyRows],
  );
  const invalidCount = table.invalidCount;

  /** กด "ย่อทั้งหมด" = เติมข้อเสนอลงทุกแถวที่ยาวเกิน (ยังไม่บันทึก) */
  const shortenAll = () => {
    const count = table.applyToRows(filtered, row => {
      const current = row.slug || '';
      if (current.length <= MASTER_SLUG_LONG) return null;
      const shorter = shortenSlug(current);
      return shorter && shorter !== current ? { slug: shorter } : null;
    });
    showToast(
      count ? `ย่อให้ ${count} รายการแล้ว — กดบันทึกเพื่อยืนยัน` : 'ไม่มีลิงก์ที่ยาวเกินเกณฑ์',
      count ? 'success' : 'error',
    );
  };

  const handleSave = async () => {
    if (!dirtyItems.length) return;
    if (invalidCount) return showToast(`มี ${invalidCount} รายการที่ลิงก์ยังไม่ถูกต้อง`, 'error');
    setSaving(true);
    try {
      const res = await apiFetch('/api/products/slugs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: dirtyItems }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'บันทึกไม่สำเร็จ');
      showToast(`บันทึกลิงก์ ${result.updated} รายการแล้ว`);
      table.revertAll();
      await fetchRows();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const longCount = useMemo(
    () => rows.filter(row => valueOf(row).length > MASTER_SLUG_LONG).length,
    [rows, valueOf],
  );

  const columns: DataTableColumn<ProductSlugRow>[] = [
    {
      key: 'product', label: 'สินค้า', alwaysVisible: true, grow: true, defaultWidth: 280,
      render: row => (
        <div className="flex min-w-0 items-center gap-3">
          <ProductImageThumb src={row.image || undefined} alt={row.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate" title={row.name}>{row.name}</p>
            {row.code && <p className="page-subtitle truncate">{row.code}</p>}
          </div>
          {/* เปิดหน้าจริงในแท็บใหม่ — ใช้ slug **จาก DB** ไม่ใช่ค่าที่แก้ค้างไว้
              (ค่าที่ยังไม่บันทึกยังไม่มีหน้าอยู่จริง กดไปก็ 404) */}
          {storefront.enabled && row.slug && (
            <a
              href={storefront.product(row.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-gray-400 hover:text-primary"
              title="เปิดหน้าสินค้าในแท็บใหม่"
              aria-label="เปิดหน้าสินค้าในแท็บใหม่"
              onClick={event => event.stopPropagation()}
            ><ExternalLinkIcon className="w-4 h-4" /></a>
          )}
        </div>
      ),
    },
    {
      key: 'slug', label: 'ลิงก์หน้าร้าน', alwaysVisible: true, defaultWidth: 380, stopPropagation: true,
      render: row => {
        const value = valueOf(row);
        const error = table.errorsOf(row).slug;
        const shorter = value.length > MASTER_SLUG_LONG ? shortenSlug(value) : '';
        return (
          <div className="space-y-1">
            <FormInput
              value={value}
              maxLength={MASTER_SLUG_MAX}
              onChange={event => table.setField(row, 'slug', normalizeMasterSlug(event.target.value))}
              error={error}
              // สีของช่องมาจากคลาสกลาง (globals.css) — เหลือง = แก้แล้วยังไม่บันทึก · แดง = ผิดกติกา
              // `className` ของ FormInput ต่อท้ายคลาสของ input เอง จึงทับสีขอบ/พื้นได้
              className={error ? 'cell-invalid' : table.isDirty(row) ? 'cell-dirty' : ''}
              autoComplete="off"
              spellCheck={false}
              postfix={table.isDirty(row) ? (
                <button
                  type="button"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-slate-300"
                  onClick={() => table.revertRow(row)}
                  title="คืนค่าเดิม"
                  aria-label="คืนค่าเดิม"
                ><ResetIcon className="w-4 h-4" /></button>
              ) : undefined}
            />
            {shorter && shorter !== value && (
              <button
                type="button"
                className="helper-text font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                onClick={() => table.setField(row, 'slug', shorter)}
              >
                ย่อเป็น {shorter}
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: 'length', label: 'ความยาวลิงก์', align: 'right', defaultWidth: 130,
      // ความยาว **หลังเข้ารหัส** คือสิ่งที่ลูกค้าเห็นตอน copy ไปวาง — อักษรไทย 1 ตัว = 9 ตัว
      render: row => {
        const value = valueOf(row);
        const encoded = encodedSlugLength(value);
        return (
          <span className="flex items-center justify-end gap-2">
            {hasThai(value) && <Badge tone="amber" size="sm">ไทย</Badge>}
            <span className={value.length > MASTER_SLUG_LONG ? 'text-amber-700 dark:text-amber-500' : undefined}>
              {encoded}
            </span>
          </span>
        );
      },
    },
  ];

  if (userProfile && !can(userProfile, 'product.view')) return <Layout><NoPermissionCard /></Layout>;

  return (
    <Layout>
      <Container size="full">
        <PageHeader
          icon={<LinkIcon />}
          title="ลิงก์สินค้าในหน้าร้าน"
          subtitle={`ลิงก์ที่ลูกค้าเห็นและ Google เก็บไป — สินค้าที่ขึ้นหน้าร้าน ${rows.length} รายการ`}
          backHref="/settings/storefront"
          actions={
            <Button variant="secondary" icon={<Scissors />} onClick={shortenAll} disabled={loading || !longCount}>
              ย่อทั้งหมดที่ยาวเกิน{longCount ? ` (${longCount})` : ''}
            </Button>
          }
        />
        <ListFilterBar
          value={search}
          onChange={value => { setSearch(value); setPage(1); }}
          placeholder="ค้นหาสินค้าหรือลิงก์..."
          summary={
            <>
              <Badge tone={longCount ? 'amber' : 'emerald'}>{longCount} ลิงก์ยาวเกิน {MASTER_SLUG_LONG} ตัว</Badge>
              {dirtyItems.length > 0 && <Badge tone="blue">แก้ไว้ {dirtyItems.length} รายการ</Badge>}
            </>
          }
        />

        {loading ? <LoadingCard /> : (
          <DataTable
            storageKey="storefront-product-links"
            columns={columns}
            data={paginated}
            getRowId={row => row.id}
            fitWidth
            emptyMessage={search ? 'ไม่พบสินค้าที่ค้นหา' : 'ยังไม่มีสินค้าที่ขึ้นหน้าร้าน'}
            emptyIcon={<LinkIcon className="data-empty-icon" />}
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={filtered.length}
            recordsPerPage={perPage}
            onPageChange={setPage}
            onRecordsPerPageChange={limit => { setPerPage(limit); setPage(1); }}
          />
        )}

        {/* ที่ว่างท้ายหน้าไม่ให้แถบบันทึกทับแถวสุดท้าย */}
        <div className="h-16" />
      </Container>

      <StickyActionBar
        onSave={handleSave}
        saving={saving}
        dirty={dirtyItems.length > 0}
        disabled={invalidCount > 0}
        onCancel={dirtyItems.length ? table.revertAll : undefined}
        saveLabel={dirtyItems.length ? `บันทึก ${dirtyItems.length} รายการ` : 'บันทึก'}
      />
    </Layout>
  );
}
