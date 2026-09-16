'use client';

// ตาราง "ถ้ากดแล้วจะเกิดอะไร" ของงานสต็อก — หัวใจของหน้า /marketplace/sync
//
// ทำไมต้องมีตารางก่อนลงมือ: ปุ่มดึง/ส่งสต็อกเปลี่ยนยอดทีเป็นร้อยตัวเลือกในคลิกเดียว
// เจ้าของเคยกดแล้วไม่รู้ว่าจะเกิดอะไรจนกว่าจะเกิดไปแล้ว ⇒ อ่านยอดสองฝั่งมาโชว์ก่อน
// ให้ติ๊กเลือกได้ แล้วค่อยลงมือกับ "เฉพาะแถวที่เห็นบนจอรอบนี้" (ผูกกันด้วย run_id)
//
// ⛔ ห้ามเขียนเงื่อนไขแยกตาม platform — ป้ายชื่อมาจาก MARKETPLACE_PLATFORMS เท่านั้น

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Package, RefreshCw } from 'lucide-react';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Radio from '@/components/ui/Radio';
import Tooltip from '@/components/ui/Tooltip';
import HelpHint from '@/components/ui/HelpHint';
import PlatformIcon from '@/components/ui/PlatformIcon';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE } from '@/components/ui/FilterChips';
import DataTable, { type DataTableColumn, type SortDir } from '@/components/ui/DataTable';
import { InfoChip } from '@/components/ui/StatusBadge';
import { Stat } from '@/components/ui/Chart';
import { LoadingCard } from '@/components/ui/StateCard';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { formatNumber, formatThaiDateTime } from '@/lib/utils/format';
import {
  applyPullRequest,
  applyPushRequest,
  previewStockRequest,
  type PullMode,
  type StockDirection,
  type StockPreviewData,
  type StockPreviewRow,
} from '@/lib/marketplace/stock-actions';
import { ACTIONABLE_STOCK_PLANS, STOCK_PLAN_HINTS, STOCK_PLAN_LABELS } from '@/lib/marketplace/sync-run-labels';
import type { StockPlan } from '@/lib/marketplace/sync-runs';
import type { MarketplaceAccount } from '@/app/settings/sales-channels/useMarketplaceAccounts';
import { platformLabelOf, shopNameOf } from './ShopPicker';

/** ตารางยาวกว่านี้ค่อยแบ่งหน้า — ต่ำกว่านี้ให้เห็นทั้งชุด (เป็นเครื่องมือตรวจ ไม่ใช่หน้า list) */
const PAGINATE_OVER = 500;
const PAGE_SIZE = 100;

type RowFilter = 'all' | 'changing' | 'up' | 'down' | 'skip';

const isActionable = (plan: StockPlan) => ACTIONABLE_STOCK_PLANS.includes(plan);
const isUp = (plan: StockPlan) => plan === 'increase';
const isDown = (plan: StockPlan) => plan === 'decrease' || plan === 'to_zero';

/** สีของชิปแผน — บอกทิศด้วยสี ไม่ใช่ให้ไล่อ่านคำทีละแถว */
function planChipColors(plan: StockPlan): string {
  if (isUp(plan)) return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  if (isDown(plan)) return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  if (isActionable(plan)) return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
  return 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300';
}

/** ยอดต้นทางของคอลัมน์ "จะกลายเป็น" — pull เปลี่ยนคลังเรา · push เปลี่ยนยอดบนร้าน */
function fromValue(row: StockPreviewRow, direction: StockDirection): number | null {
  return direction === 'pull' ? row.ours_available : row.shop;
}

/** ผลของการอ่านยอดหนึ่งชุด — `key` บอกว่าเป็นของ (ร้าน · ทิศ · โหมด · รอบโหลด) ไหน */
interface LoadState {
  key: string;
  data: StockPreviewData | null;
  error: string | null;
  quotaUntil: string | null;
}

interface Props {
  account: MarketplaceAccount;
  direction: StockDirection;
  /** ลงมือเสร็จแล้ว (หรือรอบถูกใช้ไปแล้ว) → เปิดหน้าผลลัพธ์ */
  onApplied: (runId: string) => void;
  /** กลับไปขั้นเลือกร้าน */
  onBack: () => void;
  /** บอกหน้าแม่ว่ากำลังลงมืออยู่ไหม (แถบขั้นตอนขยับตาม) */
  onApplyingChange: (applying: boolean) => void;
}

export default function StockPreview({ account, direction, onApplied, onBack, onApplyingChange }: Props) {
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  // โหมดทับทั้งหมดต้องเลือกเองทุกครั้ง — ไม่จำค่าไว้ข้ามรอบ (ทับผิดครั้งเดียวเสียทั้งคลัง)
  const [mode, setMode] = useState<PullMode>('fill_blank');
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);
  /** โควตาเต็มตอน "ลงมือ" (คนละเคสกับตอนอ่านยอด — ตารางยังอยู่ ไม่ต้องทิ้งทั้งจอ) */
  const [applyQuotaUntil, setApplyQuotaUntil] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<RowFilter>('all');
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<SortDir | undefined>();
  const [page, setPage] = useState(1);

  const [applying, setApplying] = useState<{ title: string; message: string; progress?: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const accountId = account.id;
  const shopLabel = platformLabelOf(account);
  const platform = account.platform || 'shopee';
  const shopName = shopNameOf(account);

  // ── โหลดตาราง ─────────────────────────────────────────────────────────────
  // "กำลังโหลด" เป็นค่า **คำนวณได้** (ผลที่เก็บไว้ยังไม่ใช่ของชุดนี้) ไม่ใช่ state แยก —
  // เขียนแบบ setLoading(true) ตอนต้น effect คือ setState แบบซิงค์ในเอฟเฟกต์ ซึ่งทำให้
  // เรนเดอร์ซ้อน (กฎ react-hooks/set-state-in-effect ของโปรเจกต์ห้ามไว้)
  const loadKey = `${accountId}|${direction}|${mode}|${reload}`;
  const fresh = loaded?.key === loadKey ? loaded : null;
  const loading = fresh === null;
  const preview = fresh?.data ?? null;
  const loadError = fresh?.error ?? null;
  const quotaUntil = fresh?.quotaUntil ?? null;

  /** โหลดใหม่หลังพรีวิวหมดอายุ — เก็บที่ติ๊กไว้เท่าที่ variation ยังอยู่ */
  const keepSelectionRef = useRef(false);
  const reloadPreview = useCallback((keepSelection: boolean) => {
    keepSelectionRef.current = keepSelection;
    setBusyRunId(null);
    setApplyQuotaUntil(null);
    setReload(n => n + 1);
  }, []);

  // โหลดครั้งแรก + ทุกครั้งที่เปลี่ยนโหมด (โหมดเปลี่ยนแผนทุกแถว ตารางเก่าใช้ต่อไม่ได้)
  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    (async () => {
      const keep = keepSelectionRef.current;
      keepSelectionRef.current = false;
      const result = await previewStockRequest(accountId, direction, mode);
      if (!alive) return;
      if (!result.ok || !result.data) {
        const isQuota = result.code === 'quota' && !!result.until;
        setLoaded({
          key: loadKey,
          data: null,
          error: isQuota ? null : result.message,
          quotaUntil: isQuota ? result.until! : null,
        });
        return;
      }
      const data = result.data;
      setSelected(prev => {
        if (!keep) return new Set(data.rows.filter(r => r.selected).map(r => r.variation_id));
        const stillThere = new Set(data.rows.filter(r => isActionable(r.plan)).map(r => r.variation_id));
        return new Set([...prev].filter(id => stillThere.has(id)));
      });
      setPage(1);
      setLoaded({ key: loadKey, data, error: null, quotaUntil: null });
    })();
    return () => { alive = false; };
  }, [loadKey, accountId, direction, mode]);

  // นับถอยหลังอายุพรีวิว — เดินทุก 30 วิพอ (โชว์เป็นนาที)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { onApplyingChange(applying !== null); }, [applying, onApplyingChange]);

  // ── แถว ───────────────────────────────────────────────────────────────────
  const rows = useMemo(() => preview?.rows || [], [preview]);
  const selectedRows = useMemo(
    () => rows.filter(r => selected.has(r.variation_id)),
    [rows, selected],
  );

  const filtered = useMemo(() => {
    const base = rows.filter(row => {
      if (filter === 'all') return true;
      if (filter === 'changing') return isActionable(row.plan);
      if (filter === 'up') return isUp(row.plan);
      if (filter === 'down') return isDown(row.plan);
      return !isActionable(row.plan);
    });
    if (!sortBy || !sortDir) return base;
    const value = (row: StockPreviewRow): number | string => {
      if (sortBy === 'shop') return row.shop ?? -1;
      if (sortBy === 'ours') return row.ours_available;
      if (sortBy === 'change') return row.target;
      return (row.name || row.sku || '').toLowerCase();
    };
    return [...base].sort((a, b) => {
      const va = value(a); const vb = value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'th');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, filter, sortBy, sortDir]);

  const paginated = filtered.length > PAGINATE_OVER;
  const pageRows = paginated ? filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : filtered;

  // ── ตัวเลขสรุป ────────────────────────────────────────────────────────────
  const upCount = selectedRows.filter(r => isUp(r.plan)).length;
  const downCount = selectedRows.filter(r => isDown(r.plan)).length;
  const toZeroCount = selectedRows.filter(r => r.plan === 'to_zero').length;
  const fillCount = selectedRows.filter(r => r.plan === 'fill').length;
  const overwriteCount = selectedRows.filter(r => r.plan !== 'fill').length;
  const riskyPicked = selectedRows.filter(r => r.risky).length;
  const riskyTotal = rows.filter(r => r.risky).length;
  // ขา push เสียโควตา 1 ครั้งต่อ "สินค้า" (ตัวเลือกไปด้วยกันในใบเดียว)
  const applyCalls = direction === 'push'
    ? new Set(selectedRows.map(r => r.product_id).filter(Boolean)).size
    : 0;

  const expiresAt = preview ? new Date(preview.expires_at).getTime() : 0;
  const minutesLeft = Math.max(0, Math.ceil((expiresAt - now) / 60_000));
  const expired = preview !== null && expiresAt <= now;

  // ── ลงมือ ─────────────────────────────────────────────────────────────────
  const applyingRef = useRef(false);

  const runApply = async () => {
    if (!preview || applyingRef.current) return;
    const ids = [...selected];
    applyingRef.current = true;

    if (direction === 'pull') {
      setApplying({ title: 'กำลังเขียนคลัง…', message: `${shopName} — ${ids.length} ตัวเลือก` });
      const result = await applyPullRequest(accountId, preview.run_id, ids);
      setApplying(null);
      applyingRef.current = false;
      await handleApplyResult(result.ok, result.message, result.code, result.until, result.runId || preview.run_id);
      return;
    }

    setApplying({ title: `กำลังส่งยอดขึ้น ${shopLabel}…`, message: `${shopName} — ${applyCalls} สินค้า`, progress: 0 });
    const result = await applyPushRequest(accountId, preview.run_id, ids, p => {
      setApplying({
        title: `กำลังส่งยอดขึ้น ${shopLabel}…`,
        message: p.message,
        progress: p.total > 0 ? Math.round((p.done / p.total) * 100) : undefined,
      });
    });
    setApplying(null);
    applyingRef.current = false;
    await handleApplyResult(result.ok, result.message, result.code, result.until, result.runId || preview.run_id);
  };

  /** ทางแยกหลังลงมือ — ตัดสินจาก **โค้ด** ของ API ไม่ใช่จากข้อความ */
  const handleApplyResult = async (
    ok: boolean, message: string, code?: string, until?: string, runId?: string,
  ) => {
    if (ok) { showToast(message, 'success'); if (runId) onApplied(runId); return; }

    if (code === 'preview_expired') {
      showToast('ตารางหมดอายุแล้ว — กำลังอ่านยอดใหม่ให้', 'error');
      reloadPreview(true);
      return;
    }
    if (code === 'run_in_progress' && runId) { setBusyRunId(runId); return; }
    if (code === 'run_already_used' && runId) { showToast('รอบนี้ลงมือไปแล้ว', 'error'); onApplied(runId); return; }
    if (code === 'quota' && until) { setApplyQuotaUntil(until); return; }
    showToast(message, 'error');
  };

  const confirmAndApply = async () => {
    if (!preview) return;
    const skipped = rows.length - selected.size;
    const description = direction === 'pull'
      ? `• เติม ${fillCount} ตัว · ทับ ${overwriteCount} ตัว · ข้าม ${skipped} ตัว\n`
        + `• เขียนลงคลังของร้านนี้เท่านั้น ไม่ส่งอะไรขึ้นร้าน — ไม่ใช้โควตา ${shopLabel}\n`
        + '• ย้อนได้จากหน้าผลลัพธ์ตราบที่ยังไม่มีออเดอร์/การแก้สต็อกแทรก'
      : `• ส่งขึ้น ${shopLabel} ${applyCalls} สินค้า (เพิ่ม ${upCount} · ลด ${downCount})\n`
        + `• ใช้โควตา ${shopLabel} ${applyCalls} ครั้ง\n`
        + '• ย้อนได้จากหน้าผลลัพธ์ตราบที่ยังไม่มีออเดอร์/การแก้สต็อกแทรก';

    const ok = await confirm({
      title: direction === 'pull'
        ? `ดึงยอดจาก ${shopName} ลงคลัง ${selected.size} ตัวเลือก?`
        : `ส่งยอดขึ้น ${shopName} ${applyCalls} สินค้า?`,
      description,
      // แดงเฉพาะสองทิศที่ "ผิดแล้วเจ็บ": เพิ่มยอด (ขายเกิน) กับทำให้เป็น 0 (ปิดการขาย)
      variant: upCount > 0 || toZeroCount > 0 ? 'danger' : 'primary',
      confirmLabel: direction === 'pull' ? 'ดึงลงคลัง' : 'ส่งขึ้นร้าน',
    });
    if (ok) runApply();
  };

  // ── ปุ่มยืนยันเป็นประโยค ──────────────────────────────────────────────────
  const applyLabel = direction === 'pull'
    ? `เติม ${fillCount} ตัว · ทับ ${overwriteCount} ตัว · ข้าม ${rows.length - selected.size} ตัว · ไม่ใช้โควตา`
    : `ส่งขึ้น ${shopLabel} ${applyCalls} สินค้า (เพิ่ม ${upCount} · ลด ${downCount}) · ใช้โควตา ${shopLabel} ${applyCalls} ครั้ง`;

  const columns: DataTableColumn<StockPreviewRow>[] = [
    {
      key: 'product',
      resizable: true,
      reorderable: true,
      label: 'สินค้า',
      alwaysVisible: true,
      // ไม่ใส่ grow — คอลัมน์ที่กินที่เหลือของ DataTable จะ resize ไม่ได้ (เจ้าของขอลากช่องนี้ได้)
      // ที่เหลือจึงไปตกที่คอลัมน์สุดท้าย (สถานะ) แทน
      defaultWidth: 300,
      sortable: true,
      render: (row) => (
        <div className="min-w-0">
          <div className="body-text truncate" title={row.name || undefined}>{row.name || 'ไม่มีชื่อ'}</div>
          {row.sku && <div className="helper-text text-gray-500 truncate">SKU: {row.sku}</div>}
        </div>
      ),
    },
    {
      key: 'shop',
      resizable: true,
      reorderable: true,
      label: 'ยอดบนร้าน',
      align: 'right',
      sortable: true,
      defaultWidth: 100,
      // โลโก้แพลตฟอร์มกำกับตัวเลข — อ่านปราดเดียวรู้ว่าเลขไหนคือ "ของร้าน" เลขไหน "ของเรา"
      render: (row) => (
        <span className="inline-flex items-center justify-end gap-1.5 body-text">
          <PlatformIcon id={platform} size={14} />
          <span>{row.shop === null ? '—' : formatNumber(row.shop)}</span>
        </span>
      ),
    },
    {
      key: 'ours',
      resizable: true,
      reorderable: true,
      label: 'ยอดในระบบ',
      align: 'right',
      sortable: true,
      defaultWidth: 110,
      render: (row) => (
        <span className="inline-flex items-center justify-end gap-1">
          <span className="body-text">{formatNumber(row.ours_available)}</span>
          {/* เจ้าของงงทุกครั้งว่าทำไมเลขไม่ตรงหน้าคลัง — อธิบายตรงช่อง ไม่ใช่เชิงอรรถท้ายหน้า */}
          <HelpHint portal align="right">
            ยอดที่ขายได้จริง = คงคลัง {formatNumber(row.ours_qty)} − จอง {formatNumber(row.ours_reserved)} ={' '}
            {formatNumber(row.ours_available)}
          </HelpHint>
        </span>
      ),
    },
    {
      key: 'change',
      resizable: true,
      reorderable: true,
      label: 'จะกลายเป็น',
      align: 'right',
      sortable: true,
      defaultWidth: 120,
      // เลขปลายทางเสมอ + ส่วนต่างในวงเล็บเมื่อเปลี่ยน — เจ้าของขอให้เห็นเลขจริง ไม่ใช่คำว่า "เท่าเดิม"
      render: (row) => {
        const from = fromValue(row, direction);
        const changed = isActionable(row.plan) && from !== null && row.target !== from;
        if (!changed) {
          return <span className="body-text text-gray-400">{from === null ? '—' : formatNumber(row.target)}</span>;
        }
        const delta = row.target - (from ?? 0);
        return (
          <span className="inline-flex items-baseline justify-end gap-1 body-text text-red-600 dark:text-red-400">
            <span className="font-medium">{formatNumber(row.target)}</span>
            <span className="text-xs">({delta > 0 ? '+' : '−'}{formatNumber(Math.abs(delta))})</span>
          </span>
        );
      },
    },
    {
      key: 'plan',
      resizable: true,
      reorderable: true,
      label: 'สถานะ',
      defaultWidth: 140,
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <Tooltip text={STOCK_PLAN_HINTS[row.plan]} box="inline-flex">
            <InfoChip colors={planChipColors(row.plan)}>{STOCK_PLAN_LABELS[row.plan]}</InfoChip>
          </Tooltip>
          {row.risky && (
            <Tooltip text="ระบบยังไม่เคยตั้งยอดของตัวนี้ — ส่ง 0 ขึ้นไปคือปิดการขายทั้งที่ของอาจยังอยู่" box="inline-flex">
              <InfoChip colors="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">เสี่ยง</InfoChip>
            </Tooltip>
          )}
        </span>
      ),
    },
  ];

  // ── render ────────────────────────────────────────────────────────────────
  if (quotaUntil) {
    return (
      <Alert tone="danger" title={`โควตา ${shopLabel} เต็มชั่วคราว`}>
        <p>อ่านยอดจากร้านไม่ได้จนถึง {formatThaiDateTime(quotaUntil)} — กลับมาใหม่หลังจากนั้น</p>
        <div className="flex justify-end gap-3 mt-3">
          <Button variant="secondary" onClick={onBack}>เลือกร้านอื่น</Button>
          <Button variant="primary" onClick={() => reloadPreview(false)}>ลองใหม่</Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <LoadingOverlay
        isOpen={applying !== null}
        title={applying?.title || ''}
        message={applying?.message}
        progress={applying?.progress}
      />

      {direction === 'pull' && (
        <Card>
          <h2 className="heading-3 mb-3">ยอดในคลังที่มีอยู่แล้วจะถูกทำยังไง</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <Radio
              checked={mode === 'fill_blank'}
              onChange={() => setMode('fill_blank')}
              className={`choice-card p-3 ${mode === 'fill_blank' ? 'choice-card-active' : ''}`}
            >
              <span className="min-w-0">
                <span className="block body-text font-medium">เติมเฉพาะช่องว่าง</span>
                <span className="block helper-text mt-0.5">ตัวที่คลังเรายังเป็น 0 เท่านั้น — ยอดที่นับไว้แล้วไม่ถูกแตะ</span>
              </span>
            </Radio>
            <Radio
              checked={mode === 'overwrite'}
              onChange={() => setMode('overwrite')}
              className={`choice-card p-3 ${mode === 'overwrite' ? 'choice-card-active' : ''}`}
            >
              <span className="min-w-0">
                <span className="block body-text font-medium">ทับทั้งหมด</span>
                <span className="block helper-text mt-0.5">ยึดยอดบนร้านเป็นหลัก ทับยอดที่นับไว้ในคลังด้วย</span>
              </span>
            </Radio>
          </div>
        </Card>
      )}

      {loading ? (
        <LoadingCard
          title="กำลังอ่านยอดจากร้าน…"
          subtitle="ร้านที่มีสินค้าเยอะใช้เวลาเป็นนาที — เปิดหน้านี้ค้างไว้ได้"
        />
      ) : loadError ? (
        <Alert tone="danger" title="อ่านยอดจากร้านไม่สำเร็จ">
          {loadError}
          <div className="flex justify-end gap-3 mt-3">
            <Button variant="secondary" onClick={onBack}>เลือกร้านอื่น</Button>
            <Button variant="primary" icon={<RefreshCw className="w-4 h-4" />} onClick={() => reloadPreview(false)}>ลองใหม่</Button>
          </div>
        </Alert>
      ) : preview ? (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Stat label="ตรวจแล้ว" value={formatNumber(preview.counts.checked ?? rows.length)} subtitle="ตัวเลือก" />
            <Stat label="จะเปลี่ยน" value={formatNumber(selected.size)} subtitle="ตามที่ติ๊กไว้" />
            <Stat
              label="เพิ่มขึ้น"
              value={<span className={upCount > 0 ? 'text-red-600 dark:text-red-400' : undefined}>{formatNumber(upCount)}</span>}
              subtitle="ทิศที่ทำให้ขายเกินได้"
            />
            <Stat
              label="ลดลง / เป็น 0"
              value={<span className={downCount > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}>{formatNumber(downCount)}</span>}
              subtitle="ขายไม่ได้ชั่วคราว"
            />
          </div>

          <p className="helper-text">
            โควตา {shopLabel}: อ่านไปแล้ว {preview.quota.preview_used} ครั้ง · จะใช้อีก {applyCalls} ครั้ง ·{' '}
            {expired ? 'ตารางนี้หมดอายุแล้ว — โหลดใหม่ก่อนกด' : `ตารางนี้ใช้ได้อีก ${minutesLeft} นาที`}
          </p>

          {preview.errors.length > 0 && (
            <Alert tone="warning" title="อ่านยอดบางส่วนไม่ได้">
              {preview.errors.slice(0, 3).join(' · ')}
            </Alert>
          )}

          {applyQuotaUntil && (
            <Alert tone="danger" title={`โควตา ${shopLabel} เต็มชั่วคราว`}>
              ลงมือต่อไม่ได้จนถึง {formatThaiDateTime(applyQuotaUntil)} — กลับมากดใหม่หลังจากนั้น
            </Alert>
          )}

          {busyRunId && (
            <Alert tone="warning" title="ร้านนี้มีงานซิงค์กำลังทำอยู่">
              <p>รอให้รอบนั้นจบก่อนแล้วค่อยกดใหม่</p>
              <div className="flex justify-end mt-3">
                <Button variant="secondary" onClick={() => onApplied(busyRunId)}>เปิดรอบที่กำลังทำ</Button>
              </div>
            </Alert>
          )}

          {upCount > 0 && (
            <Alert tone="danger" title={`จะเพิ่มยอด ${upCount} ตัว`}>
              ถ้าของจริงไม่มี ทุกร้านที่ผูกไว้จะขายเกินตาม
              {direction === 'pull' && ' — ขา ดึงลงคลัง: เติมแล้วครั้งหน้าที่สต็อกขยับ ระบบจะส่งเลขนี้ขึ้นทุกร้าน'}
            </Alert>
          )}
          {downCount > 0 && (
            <Alert tone="warning" title={`จะลด / ทำให้เป็น 0 อีก ${downCount} ตัว`}>
              ตัวที่เป็น 0 จะขายไม่ได้ชั่วคราว — แก้คืนได้ด้วยปุ่มย้อนที่หน้าผลลัพธ์
            </Alert>
          )}
          {riskyTotal > 0 && (
            <Alert tone="warning" title={`${riskyTotal} ตัวจะส่ง 0 ทับร้านทั้งที่ระบบยังไม่เคยตั้งยอด`}>
              ไม่ได้ติ๊กให้ (ติ๊กอยู่ {riskyPicked} ตัว) — ถ้ามั่นใจว่าของหมดจริงค่อยติ๊กเอง
            </Alert>
          )}

          <FilterChips<RowFilter>
            value={filter}
            onChange={(v) => { setFilter(v); setPage(1); }}
            chips={[
              { id: 'all', label: 'ทั้งหมด', activeClass: FILTER_CHIP_PRIMARY_ACTIVE, count: rows.length },
              { id: 'changing', label: 'จะเปลี่ยน', activeClass: FILTER_CHIP_PRIMARY_ACTIVE, count: rows.filter(r => isActionable(r.plan)).length },
              { id: 'up', label: 'เพิ่ม', activeClass: FILTER_CHIP_PRIMARY_ACTIVE, count: rows.filter(r => isUp(r.plan)).length },
              { id: 'down', label: 'ลด · เป็น 0', activeClass: FILTER_CHIP_PRIMARY_ACTIVE, count: rows.filter(r => isDown(r.plan)).length },
              { id: 'skip', label: 'ข้าม · ไม่เปลี่ยน', activeClass: FILTER_CHIP_PRIMARY_ACTIVE, count: rows.filter(r => !isActionable(r.plan)).length },
            ]}
          />

          <DataTable<StockPreviewRow>
            storageKey="mp-stock-preview-v2" /* v2: โครงคอลัมน์เปลี่ยน (สินค้าไม่ใช่ grow แล้ว) — ล้างความกว้างที่จำไว้ชุดเก่า */
            columns={columns}
            fitWidth
            data={pageRows}
            getRowId={(row) => row.variation_id}
            selectedIds={selected}
            onSelectionChange={setSelected}
            isRowSelectable={(row) => isActionable(row.plan)}
            emptyMessage="ไม่มีรายการในตัวกรองนี้"
            emptyIcon={<Package className="w-10 h-10 text-gray-300 dark:text-slate-600" />}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={(key, dir) => { setSortBy(dir ? key : undefined); setSortDir(dir ?? undefined); }}
            hidePagination={!paginated}
            currentPage={page}
            totalPages={paginated ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1}
            totalRecords={filtered.length}
            recordsPerPage={paginated ? PAGE_SIZE : Math.max(1, filtered.length)}
            onPageChange={setPage}
            onRecordsPerPageChange={() => {}}
            mobileCardRender={(row) => {
              const from = fromValue(row, direction);
              return (
                <div className="space-y-1.5">
                  <div className="body-text">{row.name || 'ไม่มีชื่อ'}</div>
                  {row.sku && <div className="helper-text text-gray-500">SKU: {row.sku}</div>}
                  <div className="helper-text text-gray-500">
                    ยอดบนร้าน {row.shop === null ? '—' : formatNumber(row.shop)} · ยอดในระบบ {formatNumber(row.ours_available)}
                  </div>
                  <div className="flex items-center gap-2">
                    <InfoChip colors={planChipColors(row.plan)}>{STOCK_PLAN_LABELS[row.plan]}</InfoChip>
                    {isActionable(row.plan) && (
                      <span className="helper-text">
                        {from === null ? '—' : formatNumber(from)} → {formatNumber(row.target)}
                      </span>
                    )}
                  </div>
                </div>
              );
            }}
          />

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={onBack}>เลือกร้านอื่น</Button>
            {expired ? (
              <Button variant="primary" icon={<RefreshCw className="w-4 h-4" />} onClick={() => reloadPreview(true)}>
                โหลดตารางใหม่
              </Button>
            ) : selected.size === 0 ? (
              <Tooltip text="ยังไม่ได้เลือกรายการ" box="inline-flex">
                <Button variant="primary" disabled>{applyLabel}</Button>
              </Tooltip>
            ) : (
              <Button variant="primary" onClick={confirmAndApply}>{applyLabel}</Button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
