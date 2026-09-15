'use client';

// "รอบล่าสุดของร้านนี้" — ใต้รายการร้านเมื่อเลือกร้านแล้ว
//
// มีไว้เพื่อตอบคำถามเดียว: "เมื่อกี้ใครกดอะไรไป แล้วยอดเปลี่ยนเพราะรอบไหน"
// กดแถวแล้วเปิดหน้าผลลัพธ์ของรอบนั้น (ซึ่งเป็นที่เดียวที่มีปุ่มย้อน)

import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import StatusBadge, { InfoChip } from '@/components/ui/StatusBadge';
import { LoadingCard } from '@/components/ui/StateCard';
import { formatThaiDateTime } from '@/lib/utils/format';
import { fetchRuns } from '@/lib/marketplace/stock-actions';
import { SYNC_RUN_JOB_LABELS } from '@/lib/marketplace/sync-run-labels';
import type { SyncRun, SyncRunTrigger } from '@/lib/marketplace/sync-runs';

/** รอบที่แค่ "เปิดดูตาราง" แล้วปิดไป — เป็นขยะในประวัติหลังพรีวิวหมดอายุ */
const PREVIEW_TTL_MS = 15 * 60_000;

/** งานที่ไม่ได้เกิดจากคนกดในหน้านี้ — ต้องบอกที่มา ไม่งั้นเจ้าของงงว่าใครสั่ง */
const TRIGGER_LABELS: Partial<Record<SyncRunTrigger, string>> = {
  warehouse_change: 'จากการย้ายคลัง',
  onboarding: 'จากหน้าต้อนรับ',
};

/** สรุปตัวเลขสั้น ๆ พอให้รู้ว่ารอบนั้นแตะอะไรไปเท่าไร */
function countSummary(run: SyncRun): string {
  const parts: string[] = [];
  if (run.counts.checked != null) parts.push(`ตรวจ ${run.counts.checked}`);
  if (run.counts.selected != null) parts.push(`เลือก ${run.counts.selected}`);
  if (run.counts.changed != null) parts.push(`เปลี่ยนจริง ${run.counts.changed}`);
  if (run.counts.failed) parts.push(`ล้ม ${run.counts.failed}`);
  return parts.join(' · ');
}

interface Props {
  accountId: string;
  onOpenRun: (runId: string) => void;
}

export default function RunHistory({ accountId, onOpenRun }: Props) {
  const [runs, setRuns] = useState<SyncRun[] | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    (async () => {
      setRuns(null);
      const result = await fetchRuns(accountId, 10);
      if (!alive) return;
      const now = Date.now();
      // พรีวิวที่หมดอายุแล้วไม่ใช่ "รอบที่ทำอะไรไป" — ซ่อนไว้ไม่ให้บังของจริง
      setRuns(
        (result.data || []).filter(
          run => run.status !== 'previewed' || now - new Date(run.preview_at).getTime() < PREVIEW_TTL_MS,
        ),
      );
    })();
    return () => { alive = false; };
  }, [accountId]);

  if (runs === null) return <LoadingCard compact />;
  if (runs.length === 0) return null;

  return (
    <Card>
      <h2 className="heading-3 mb-3">รอบล่าสุดของร้านนี้</h2>
      <div className="space-y-2">
        {runs.map(run => (
          <button
            key={run.id}
            type="button"
            onClick={() => onOpenRun(run.id)}
            className="choice-card w-full p-3 text-left flex flex-wrap items-center gap-x-3 gap-y-1.5 hover:bg-gray-50 dark:hover:bg-slate-700/40"
          >
            <StatusBadge domain="syncRun" status={run.status} />
            <span className="body-text font-medium">{SYNC_RUN_JOB_LABELS[run.job] || run.job}</span>
            {run.mode && (
              <InfoChip colors="bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300">
                {run.mode === 'overwrite' ? 'ทับทั้งหมด' : 'เติมเฉพาะช่องว่าง'}
              </InfoChip>
            )}
            {TRIGGER_LABELS[run.trigger] && (
              <InfoChip colors="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {TRIGGER_LABELS[run.trigger]}
              </InfoChip>
            )}
            <span className="helper-text ml-auto">{formatThaiDateTime(run.started_at || run.preview_at)}</span>
            {countSummary(run) && <span className="helper-text w-full">{countSummary(run)}</span>}
          </button>
        ))}
      </div>
    </Card>
  );
}
