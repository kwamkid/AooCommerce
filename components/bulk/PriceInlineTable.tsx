'use client';

// ตารางแก้ราคาแบบสดบนเว็บ — ทางที่ ① ของ objective "ราคา" (ทางที่ ② คือไฟล์ Excel ในหน้าเดียวกัน)
//
// ใช้ API ชุดเดียวกับฝั่ง Excel: GET `/bulk/price/export` (รายการ+ราคาปัจจุบัน) และ
// POST `/bulk/price/apply` (`dry_run: false`) — ⛔ ห้ามสร้าง endpoint ใหม่ให้ตารางนี้
// กติกา draft/บันทึก/คืนค่า อยู่ที่ `useInlineEditTable` — ห้ามเขียน state เอง

import { useCallback, useMemo, useState } from 'react';
import Badge from '@/components/ui/Badge';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import ListFilterBar from '@/components/ui/ListFilterBar';
import NumberInput from '@/components/ui/NumberInput';
import StickyActionBar from '@/components/ui/StickyActionBar';
import Tooltip from '@/components/ui/Tooltip';
import { EmptyCard, LoadingCard } from '@/components/ui/StateCard';
import { ResetIcon } from '@/lib/icons';
import { apiFetch } from '@/lib/api-client';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useInlineEditTable } from '@/lib/use-inline-edit-table';
import { useToast } from '@/lib/toast-context';
import { COMPOSITE_TYPE_LABEL } from '@/lib/bulk/composite-ref';

interface PriceRow {
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variation_label: string;
  sku: string;
  default_price: number;
  discount_price: number;
  cost_price: number | null;
  /** ชุดย่อยของสินค้าชุด — แก้ราคาแล้วจะเลิกตามราคาชิ้นส่วน */
  is_combo?: boolean;
  price_locked?: boolean;
}

interface Props {
  /** เห็น/แก้ต้นทุนได้ไหม — คอลัมน์ต้นทุนขึ้นเฉพาะคนที่มีสิทธิ์ */
  canEditCost: boolean;
}

export default function PriceInlineTable({ canEditCost }: Props) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const fetchRows = useCallback(async () => {
    try {
      const res = await apiFetch('/api/products/bulk/price/export?status=active');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ');
      setRows(Array.isArray(data?.items) ? (data.items as PriceRow[]) : []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useFetchOnce(fetchRows, true);

  const table = useInlineEditTable<PriceRow>({
    rows,
    getId: row => row.variation_id,
    // กฎธุรกิจทั้งระบบ: ราคาลดต้องน้อยกว่าราคาปกติ · 0 = ไม่มีส่วนลด (อนุญาตเสมอ)
    validateRow: merged => {
      const errors: Record<string, string> = {};
      if (merged.default_price < 0) errors.default_price = 'ราคาต้องไม่ติดลบ';
      if (merged.discount_price < 0) errors.discount_price = 'ราคาต้องไม่ติดลบ';
      if (merged.discount_price > 0 && merged.discount_price >= merged.default_price) {
        errors.discount_price = 'ราคาลดเหลือต้องน้อยกว่าราคาปกติ';
      }
      if (canEditCost && (merged.cost_price ?? 0) < 0) errors.cost_price = 'ต้นทุนต้องไม่ติดลบ';
      return errors;
    },
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(row => row.product_name.toLowerCase().includes(query)
      || (row.product_code || '').toLowerCase().includes(query)
      || (row.sku || '').toLowerCase().includes(query)
      || (row.variation_label || '').toLowerCase().includes(query));
  }, [rows, search]);

  const handleSave = async () => {
    if (!table.dirtyRows.length) return;
    if (table.invalidCount) return showToast(`มี ${table.invalidCount} รายการที่ราคายังไม่ถูกต้อง`, 'error');
    setSaving(true);
    try {
      // ส่งเฉพาะช่องที่แก้จริง — ช่องที่ไม่ได้ส่ง API จะไม่แตะของเดิม
      const items = table.dirtyRows.map(entry => ({
        variation_id: entry.id,
        product_id: entry.row.product_id,
        ...entry.changes,
      }));
      const res = await apiFetch('/api/products/bulk/price/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, dry_run: false }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'บันทึกไม่สำเร็จ');
      const { updated = 0, errors = 0 } = result.summary || {};
      showToast(
        errors > 0 ? `บันทึก ${updated} รายการ · ล้มเหลว ${errors}` : `บันทึกราคา ${updated} รายการแล้ว`,
        errors > 0 ? 'error' : 'success',
      );
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

  /** ช่องตัวเลขหนึ่งช่อง — ⛔ NumberInput เท่านั้น ห้าม `<input type="number">` (ล้อเมาส์เปลี่ยนค่าเงียบ ๆ) */
  const priceCell = (row: PriceRow, key: 'default_price' | 'discount_price' | 'cost_price') => {
    const error = table.errorsOf(row)[key];
    return (
      <div>
        <NumberInput
          value={(table.field(row, key) as number) ?? 0}
          onChange={value => table.setField(row, key, value as PriceRow[typeof key])}
          min={0}
          className={error ? 'border-red-400' : undefined}
          aria-label={key}
        />
        {error && <p className="helper-text mt-1 text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  };

  const columns: DataTableColumn<PriceRow>[] = [
    {
      key: 'product', label: 'สินค้า', alwaysVisible: true, grow: true, defaultWidth: 260,
      render: row => (
        <div className="min-w-0">
          <p className="truncate" title={row.product_name}>{row.product_name}</p>
          <p className="page-subtitle truncate">
            {[row.product_code, row.variation_label, row.sku].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    {
      key: 'default_price', label: 'ราคาปกติ', defaultWidth: 130, align: 'right', stopPropagation: true,
      render: row => priceCell(row, 'default_price'),
    },
    {
      key: 'discount_price', label: 'ราคาขาย', defaultWidth: 130, align: 'right', stopPropagation: true,
      render: row => priceCell(row, 'discount_price'),
    },
    ...(canEditCost ? [{
      key: 'cost_price', label: 'ต้นทุน', defaultWidth: 130, align: 'right' as const, stopPropagation: true,
      // สินค้าชุดไม่มีต้นทุนของตัวเอง — ต้นทุนมาจากชิ้นส่วน
      render: (row: PriceRow) => row.is_combo
        ? <span className="table-muted">มาจากชิ้นส่วน</span>
        : priceCell(row, 'cost_price'),
    }] : []),
    {
      key: 'state', label: '', defaultWidth: 110, align: 'right', stopPropagation: true,
      render: row => (
        <div className="flex items-center justify-end gap-2">
          {row.is_combo && !row.price_locked && (
            <Tooltip text={`${COMPOSITE_TYPE_LABEL}: แก้ราคาแล้วจะเลิกคิดตามราคาชิ้นส่วน`}>
              <Badge tone="purple" size="sm">ชุด</Badge>
            </Tooltip>
          )}
          {table.isDirty(row) && (
            <button
              type="button"
              className="text-gray-500 hover:text-gray-900 dark:hover:text-white"
              onClick={() => table.revertRow(row)}
              title="คืนค่าเดิม"
              aria-label="คืนค่าเดิม"
            ><ResetIcon className="w-4 h-4" /></button>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <LoadingCard />;

  return (
    <>
      <ListFilterBar
        value={search}
        onChange={value => { setSearch(value); setPage(1); }}
        placeholder="ค้นหาสินค้า · รหัส · SKU..."
        summary={
          <>
            <Badge tone="gray">{rows.length} ตัวเลือก</Badge>
            {table.dirtyRows.length > 0 && <Badge tone="blue">แก้ไว้ {table.dirtyRows.length} รายการ</Badge>}
          </>
        }
      />

      {filtered.length === 0 ? (
        <EmptyCard
          title={search ? 'ไม่พบสินค้าที่ค้นหา' : 'ยังไม่มีสินค้าที่เปิดขาย'}
          subtitle={search ? 'ลองเปลี่ยนคำค้น' : undefined}
        />
      ) : (
        <DataTable
          storageKey="bulk-price-inline"
          columns={columns}
          data={paginated}
          getRowId={row => row.variation_id}
          fitWidth
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

      <StickyActionBar
        onSave={handleSave}
        saving={saving}
        dirty={table.dirtyRows.length > 0}
        disabled={table.invalidCount > 0}
        onCancel={table.dirtyRows.length ? table.revertAll : undefined}
        saveLabel={table.dirtyRows.length ? `บันทึก ${table.dirtyRows.length} รายการ` : 'บันทึก'}
      />
    </>
  );
}
