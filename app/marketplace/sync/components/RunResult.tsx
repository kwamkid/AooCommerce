'use client';

// หน้าผลลัพธ์ของรอบหนึ่งรอบ (`/marketplace/sync?run=<id>`) — และเป็น **ที่เดียวที่มีปุ่มย้อน**
//
// เปิดถึงได้ 3 ทาง: กดลงมือเสร็จ · กดจากประวัติรอบ · กดจากหน้าความเคลื่อนไหวสต็อก
// (`inventory_transactions.reference_id` ของงานซิงค์ = id ของรอบ)
//
// ⛔ ป้ายไทยทุกตัวมาจาก `sync-run-labels.ts` / ทะเบียนสถานะ — ห้าม hardcode ข้อความสถานะที่นี่

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Package, PlayCircle, Undo2 } from 'lucide-react';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import StatusBadge, { InfoChip } from '@/components/ui/StatusBadge';
import { Stat } from '@/components/ui/Chart';
import { EmptyCard, LoadingCard } from '@/components/ui/StateCard';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import { formatNumber, formatThaiDateTime } from '@/lib/utils/format';
import {
  applyPushRequest,
  fetchRun,
  revertRunRequest,
  type RevertRunData,
  type SyncRunDetail,
} from '@/lib/marketplace/stock-actions';
import {
  REVERT_REASON_LABELS,
  REVERT_STATUS_LABELS,
  REVERT_WARNING_LABELS,
  STOCK_PLAN_LABELS,
  SYNC_RUN_JOB_LABELS,
  type RevertItemStatus,
} from '@/lib/marketplace/sync-run-labels';
import { MARKETPLACE_PLATFORMS } from '@/lib/marketplace/platforms';
import type { SyncRunItem } from '@/lib/marketplace/sync-runs';

function platformLabel(platform: string): string {
  return MARKETPLACE_PLATFORMS[platform as keyof typeof MARKETPLACE_PLATFORMS]?.label || 'Marketplace';
}

/** ยอดก่อนหน้าของฝั่งที่รอบนั้นไปเปลี่ยน — pull เปลี่ยนคลังเรา · push เปลี่ยนยอดบนร้าน */
function beforeValue(item: SyncRunItem, job: string): number | null {
  return job === 'pull_stock' ? item.ours_qty_before : item.shop_before;
}

interface Props {
  runId: string;
  /** กลับไปขั้นเลือกร้าน (ล้าง ?run=) */
  onBack: () => void;
  /** เปิดรอบอื่น (รอบที่ใหม่กว่า / รอบย้อน) */
  onOpenRun: (runId: string) => void;
  /** กลับไปตรวจตารางใหม่ของร้าน+งานนี้ */
  onRecheck: (job: 'pull_stock' | 'push_stock', accountId: string) => void;
}

export default function RunResult({ runId, onBack, onOpenRun, onRecheck }: Props) {
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  const [detail, setDetail] = useState<SyncRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [revertResult, setRevertResult] = useState<RevertRunData | null>(null);
  const [savingAutoSync, setSavingAutoSync] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchRun(runId);
    if (!result.ok || !result.data) {
      setDetail(null);
      setNotFound(true);
    } else {
      setDetail(result.data);
      setNotFound(false);
    }
    setLoading(false);
  }, [runId]);

  useEffect(() => { setRevertResult(null); load(); }, [load]);

  if (loading) return <LoadingCard />;

  if (notFound || !detail) {
    return (
      <EmptyCard
        icon={<Package className="w-10 h-10 text-gray-300 dark:text-slate-600" />}
        title="ไม่พบรอบนี้"
        subtitle="รายการก่อน 16 ก.ย. 2569 ไม่ได้บันทึกเป็นรอบ จึงเปิดดูย้อนหลังไม่ได้"
        actions={<Button variant="primary" onClick={onBack}>กลับไปเลือกงาน</Button>}
      />
    );
  }

  const { run, items, revertability } = detail;
  const label = platformLabel(run.platform);
  const isStockJob = run.job === 'pull_stock' || run.job === 'push_stock';
  const revertStateOf = (variationId: string) =>
    revertability.items.find(i => i.variation_id === variationId);

  // แถวที่น่าสนใจ = ลงมือไปแล้ว หรือ ล้ม — ที่เหลือเป็นแถวที่ไม่ได้แตะ ไม่ต้องกรอกหน้าจอ
  const shownItems = items.filter(i => i.applied || i.error);

  // ── ย้อนรอบ ───────────────────────────────────────────────────────────────
  const doRevert = async () => {
    const restorable = items.filter(i => i.applied).length;
    const ok = await confirm({
      title: `ย้อนรอบนี้ — คืนยอด ${restorable} ตัวเลือก?`,
      description:
        run.job === 'pull_stock'
          ? '• คืนยอดในคลังด้วยส่วนต่าง — ของที่ขายไประหว่างนี้จะไม่ถูกกลืนทิ้ง\n'
            + '• ตัวที่คืนไม่ครบเพราะขายไปแล้ว จะขึ้นรายการ "ขายเกิน" ให้ตรวจ'
          : `• ส่งเลขเดิมกลับขึ้น ${label} เฉพาะตัวที่ยอดบนร้านยังเป็นเลขที่เราส่งไป\n`
            + '• ตัวที่มีคนแก้บนร้านทีหลังจะไม่ถูกแตะ พร้อมบอกเหตุผลรายตัว',
      variant: 'danger',
      confirmLabel: 'ย้อนรอบนี้',
    });
    if (!ok) return;

    setWorking('กำลังย้อนรอบ…');
    const result = await revertRunRequest(runId);
    setWorking(null);
    if (!result.ok || !result.data) {
      if (result.code === 'run_in_progress' && result.runId) {
        showToast('ร้านนี้มีงานซิงค์กำลังทำอยู่ — รอให้จบก่อน', 'error');
      } else {
        showToast(REVERT_REASON_LABELS[result.code as keyof typeof REVERT_REASON_LABELS] || result.message, 'error');
      }
      await load();
      return;
    }
    setRevertResult(result.data);
    showToast(result.message, result.data.status === 'reverted' ? 'success' : 'error');
    await load();
  };

  /** ปิดซิงค์อัตโนมัติก่อนย้อน — ไม่งั้นครั้งหน้าที่สต็อกขยับ ระบบส่งเลขในระบบขึ้นไปอีก */
  const turnOffAutoSync = async () => {
    setSavingAutoSync(true);
    try {
      const res = await apiFetch('/api/marketplace/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: run.account_id, auto_sync_stock: false }),
      });
      if (!res.ok) { showToast('ปิดซิงค์อัตโนมัติไม่สำเร็จ', 'error'); return; }
      showToast('ปิดซิงค์สต็อกอัตโนมัติของร้านนี้แล้ว', 'success');
      await load();
    } catch {
      showToast('ปิดซิงค์อัตโนมัติไม่สำเร็จ', 'error');
    } finally {
      setSavingAutoSync(false);
    }
  };

  /** รอบ push ที่หยุดกลางทาง — ทำต่อจาก cursor ที่จดไว้ (ไม่ต้องติ๊กใหม่) */
  const resumePush = async () => {
    setWorking(`กำลังส่งยอดขึ้น ${label} ต่อจากที่ค้าง…`);
    const result = await applyPushRequest(
      run.account_id, run.id, [],
      p => setWorking(p.message),
      run.cursor ?? 0,
    );
    setWorking(null);
    showToast(result.message, result.ok ? 'success' : 'error');
    await load();
  };

  const columns: DataTableColumn<SyncRunItem>[] = [
    {
      key: 'product',
      resizable: true,
      reorderable: true,
      label: 'สินค้า',
      alwaysVisible: true,
      grow: true,
      render: (item) => (
        <div className="min-w-0">
          <div className="body-text truncate">{item.name || 'ไม่มีชื่อ'}</div>
          {item.sku && <div className="helper-text text-gray-500">SKU: {item.sku}</div>}
        </div>
      ),
    },
    {
      key: 'change',
      resizable: true,
      reorderable: true,
      label: 'ก่อน → หลัง',
      align: 'right',
      defaultWidth: 150,
      render: (item) => {
        const before = beforeValue(item, run.job);
        return (
          <span className="inline-flex items-center justify-end gap-1.5 body-text">
            <span>{before === null ? '—' : formatNumber(before)}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            <span className="font-medium">{item.after === null ? '—' : formatNumber(item.after)}</span>
          </span>
        );
      },
    },
    {
      key: 'status',
      resizable: true,
      reorderable: true,
      label: 'ผล',
      defaultWidth: 230,
      render: (item) => {
        const state = revertStateOf(item.variation_id);
        return (
          <div className="space-y-1">
            {item.error ? (
              <span className="body-text text-red-600 dark:text-red-400">{item.error}</span>
            ) : (
              <InfoChip colors="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {STOCK_PLAN_LABELS[item.plan]}
              </InfoChip>
            )}
            {item.revert_status && (
              <div className="helper-text">
                {REVERT_STATUS_LABELS[item.revert_status as RevertItemStatus] || item.revert_status}
                {item.revert_note ? ` — ${item.revert_note}` : ''}
              </div>
            )}
            {!item.revert_status && state?.state === 'activity' && (
              <div className="helper-text text-amber-600 dark:text-amber-400">
                มีความเคลื่อนไหว {state.activity_count || 0} รายการหลังรอบนี้
              </div>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {confirmDialog}
      <LoadingOverlay isOpen={working !== null} title={working || ''} />

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge domain="syncRun" status={run.status} size="md" />
          <h2 className="heading-3">{SYNC_RUN_JOB_LABELS[run.job] || run.job}</h2>
          <InfoChip colors="bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300">{label}</InfoChip>
          {run.mode && (
            <InfoChip colors="bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300">
              {run.mode === 'overwrite' ? 'ทับทั้งหมด' : 'เติมเฉพาะช่องว่าง'}
            </InfoChip>
          )}
        </div>
        <p className="helper-text mt-2">
          เริ่ม {formatThaiDateTime(run.started_at || run.preview_at)}
          {run.finished_at ? ` · จบ ${formatThaiDateTime(run.finished_at)}` : ''}
          {run.quota_used ? ` · ใช้โควตา ${label} ${run.quota_used} ครั้ง` : ''}
        </p>

      </Card>

      {/* Stat เป็นการ์ดในตัวอยู่แล้ว — วางนอกการ์ดหัวเรื่อง ไม่ให้เป็นการ์ดซ้อนการ์ด */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="ตรวจแล้ว" value={formatNumber(run.counts.checked ?? items.length)} subtitle="ตัวเลือก" />
        <Stat label="เลือกไว้" value={formatNumber(run.counts.selected ?? 0)} subtitle="ตามที่ติ๊ก" />
        <Stat label="เปลี่ยนจริง" value={formatNumber(run.counts.changed ?? items.filter(i => i.applied).length)} />
        <Stat
          label="ไม่สำเร็จ"
          value={<span className={run.counts.failed ? 'text-red-600 dark:text-red-400' : undefined}>{formatNumber(run.counts.failed ?? 0)}</span>}
        />
      </div>

      {run.errors.length > 0 && (
        <Alert tone="warning" title="ข้อผิดพลาดที่เจอในรอบนี้">
          {run.errors.slice(0, 5).join(' · ')}
        </Alert>
      )}

      {/* รอบที่แค่เปิดดูตารางแล้วไม่ได้กด — ยอดตอนนี้เปลี่ยนไปแล้ว ของเก่าเชื่อไม่ได้ */}
      {run.status === 'previewed' && isStockJob && (
        <Alert tone="info" title="รอบนี้ยังไม่ได้ลงมือ">
          <p>เป็นตารางที่เปิดดูไว้เฉย ๆ — ยอดสองฝั่งขยับไปแล้ว ต้องอ่านใหม่ก่อนกด</p>
          <div className="flex justify-end mt-3">
            <Button variant="primary" onClick={() => onRecheck(run.job as 'pull_stock' | 'push_stock', run.account_id)}>
              ตรวจตารางใหม่
            </Button>
          </div>
        </Alert>
      )}

      {/* หยุดกลางทางเพราะหมดเวลา — cursor จดไว้แล้ว ทำต่อได้เลยไม่ต้องเริ่มใหม่ */}
      {run.status === 'partial' && run.cursor !== null && run.job === 'push_stock' && (
        <Alert tone="warning" title={`ส่งไปแล้ว ${run.cursor} สินค้า แล้วหมดเวลาในรอบนั้น`}>
          <div className="flex justify-end mt-3">
            <Button variant="primary" icon={<PlayCircle className="w-4 h-4" />} onClick={resumePush}>
              ทำต่อจากที่ค้าง
            </Button>
          </div>
        </Alert>
      )}

      {/* กล่องปุ่มย้อน */}
      {isStockJob && run.status !== 'previewed' && (
        <Card>
          <h2 className="heading-3 mb-2">ย้อนรอบนี้</h2>
          {revertability.can_revert ? (
            <>
              <p className="body-text">
                คืนยอดกลับเป็นค่าก่อนรอบนี้ — ระบบจะสร้าง &quot;รอบย้อน&quot; ใหม่ ไม่ได้ลบประวัติรอบเดิม
              </p>
              {revertability.warnings.map(w => (
                <div className="mt-3" key={w}>
                  <Alert tone="warning">
                    <p>{REVERT_WARNING_LABELS[w]}</p>
                    {w === 'auto_sync_on' && (
                      <div className="flex justify-end mt-3">
                        <Button variant="secondary" size="sm" loading={savingAutoSync} onClick={turnOffAutoSync}>
                          ปิดซิงค์อัตโนมัติของร้านนี้ก่อน
                        </Button>
                      </div>
                    )}
                  </Alert>
                </div>
              ))}
              <div className="flex justify-end gap-3 mt-4">
                <Button variant="danger" icon={<Undo2 className="w-4 h-4" />} onClick={doRevert}>
                  ย้อนรอบนี้
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="body-text">
                {revertability.reason ? REVERT_REASON_LABELS[revertability.reason] : 'ย้อนรอบนี้ไม่ได้'}
              </p>
              <div className="flex flex-wrap justify-end gap-3 mt-4">
                {revertability.newer_run_id && (
                  <Button variant="secondary" onClick={() => onOpenRun(revertability.newer_run_id!)}>
                    เปิดรอบที่ใหม่กว่า
                  </Button>
                )}
                <Button variant="danger" disabled icon={<Undo2 className="w-4 h-4" />}>ย้อนรอบนี้</Button>
              </div>
            </>
          )}
        </Card>
      )}

      {/* ผลของการย้อนที่เพิ่งกดไป */}
      {revertResult && (
        <Card>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <StatusBadge domain="syncRun" status={revertResult.status} size="md" />
            <h2 className="heading-3">ผลการย้อน</h2>
            <Button variant="secondary" size="sm" className="ml-auto" onClick={() => onOpenRun(revertResult.revert_run_id)}>
              เปิดรอบย้อน
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(revertResult.counts) as [RevertItemStatus, number][])
              .filter(([, n]) => n > 0)
              .map(([status, n]) => (
                <InfoChip key={status} colors="bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300">
                  {REVERT_STATUS_LABELS[status]} {n}
                </InfoChip>
              ))}
          </div>

          {revertResult.oversold.length > 0 && (
            <div className="mt-4">
              <Alert tone="danger" title={`คืนไม่ครบ ${revertResult.oversold.length} ตัวเลือก — ของถูกขายไปแล้ว`}>
                <ul className="space-y-1 mt-1">
                  {revertResult.oversold.map(o => (
                    <li key={o.variation_id} className="body-text">
                      ขายเกิน {o.missing} ชิ้น
                      {o.orders.length > 0 && ' — '}
                      {o.orders.map((order, i) => (
                        <span key={order.id}>
                          {i > 0 && ', '}
                          <Link href={`/orders/${order.id}`} className="underline">
                            {order.order_number || order.id.slice(0, 8)}
                          </Link>
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </Alert>
            </div>
          )}
        </Card>
      )}

      {shownItems.length > 0 && (
        <Card padding="none">
          <DataTable<SyncRunItem>
            storageKey="mp-sync-run-items"
            columns={columns}
            fitWidth
            data={shownItems}
            getRowId={(item) => item.variation_id}
            emptyMessage="รอบนี้ไม่ได้เปลี่ยนอะไร"
            hidePagination
            currentPage={1}
            totalPages={1}
            totalRecords={shownItems.length}
            recordsPerPage={Math.max(1, shownItems.length)}
            onPageChange={() => {}}
            onRecordsPerPageChange={() => {}}
            mobileCardRender={(item) => {
              const before = beforeValue(item, run.job);
              return (
                <div className="space-y-1.5">
                  <div className="body-text">{item.name || 'ไม่มีชื่อ'}</div>
                  {item.sku && <div className="helper-text text-gray-500">SKU: {item.sku}</div>}
                  <div className="helper-text">
                    {before === null ? '—' : formatNumber(before)} → {item.after === null ? '—' : formatNumber(item.after)}
                  </div>
                  {item.error && <div className="helper-text text-red-600 dark:text-red-400">{item.error}</div>}
                  {item.revert_status && (
                    <div className="helper-text">
                      {REVERT_STATUS_LABELS[item.revert_status as RevertItemStatus] || item.revert_status}
                    </div>
                  )}
                </div>
              );
            }}
          />
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onBack}>กลับไปเลือกงาน</Button>
      </div>
    </div>
  );
}
