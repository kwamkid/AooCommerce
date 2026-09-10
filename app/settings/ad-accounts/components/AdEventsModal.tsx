// Path: app/settings/ad-accounts/components/AdEventsModal.tsx
// event ที่ระบบยิงให้ Meta ใน 7 วันล่าสุด — หลักฐานว่า "ส่งจริงไหม" ของบัญชีนั้น
//
// ตัวเลขบนการ์ดบอกแค่ว่ามีกี่ใบ · ใบที่ล้มต้องดูได้ว่าออเดอร์ไหนและ Meta ตอบว่าอะไร
// ไม่งั้นเจ้าของร้านเห็นเลขแดงแล้วทำอะไรต่อไม่ได้
//
// ⚠️ หน้าแม่ mount ตัวนี้ใหม่ทุกครั้งที่เปิด (render แบบมีเงื่อนไข + key ต่อบัญชี)
// ตัวกรองกับสถานะโหลดจึงเริ่มต้นใหม่เองโดยไม่ต้องมี effect คอยรีเซ็ต
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE } from '@/components/ui/FilterChips';
import Modal from '@/components/ui/Modal';
import Tooltip from '@/components/ui/Tooltip';
import { LoadingCard } from '@/components/ui/StateCard';
import { apiFetch } from '@/lib/api-client';
import { formatThaiDateTime } from '@/lib/utils/format';
import type { AdAccountView, AdEventRow } from '@/lib/ads/meta-ui';

const STATUS_BADGE: Record<AdEventRow['status'], { tone: BadgeTone; label: string }> = {
  sent:    { tone: 'emerald', label: 'ส่งแล้ว' },
  failed:  { tone: 'red',     label: 'ส่งไม่สำเร็จ' },
  pending: { tone: 'gray',    label: 'รอส่ง' },
  skipped: { tone: 'gray',    label: 'ข้าม' },
};

const DESTINATION_LABEL: Record<AdEventRow['destination'], string> = {
  page_dataset: 'เพจ',
  ad_dataset: 'บัญชีโฆษณา',
};

type EventFilter = 'all' | 'failed';

interface Props {
  open: boolean;
  account: AdAccountView;
  onClose: () => void;
}

export default function AdEventsModal({ open, account, onClose }: Props) {
  const [rows, setRows] = useState<AdEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EventFilter>('all');

  const accountId = account.id;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ ad_account_id: accountId, limit: '50' });
        if (filter === 'failed') qs.set('status', 'failed');
        const res = await apiFetch(`/api/ads/events?${qs.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setRows(res.ok && Array.isArray(data.events) ? data.events : []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, accountId, filter]);

  // สลับตัวกรอง = ยิงใหม่ — ตั้งสถานะโหลดตรงนี้ (event handler) ไม่ใช่ใน effect
  const changeFilter = (next: EventFilter) => {
    if (next === filter) return;
    setLoading(true);
    setFilter(next);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title={`event ที่ส่งจาก ${account.name || `act_${account.external_id}`} · 7 วัน`}
    >
      <div className="p-4 space-y-3">
        <FilterChips<EventFilter>
          value={filter}
          onChange={changeFilter}
          chips={[
            { id: 'all', label: 'ทั้งหมด', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
            { id: 'failed', label: 'ล้มเหลว', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
          ]}
        />

        {loading ? (
          <LoadingCard />
        ) : rows.length === 0 ? (
          <p className="subtitle-text text-gray-500 dark:text-slate-400 text-center py-8">
            ยังไม่มี event ใน 7 วัน — ระบบส่ง Purchase อัตโนมัติเมื่อออเดอร์ชำระเงินแล้ว
          </p>
        ) : (
          <div className="data-table-wrap overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  <th className="data-th text-left">ออเดอร์</th>
                  <th className="data-th text-left">Event</th>
                  <th className="data-th text-left">ปลายทาง</th>
                  <th className="data-th text-left">สถานะ</th>
                  <th className="data-th text-left">เวลา</th>
                </tr>
              </thead>
              <tbody className="data-tbody">
                {rows.map(row => {
                  const badge = STATUS_BADGE[row.status];
                  return (
                    <tr key={row.id} className="data-tr">
                      <td className="data-td">
                        {row.order_id ? (
                          <Link href={`/orders/${row.order_id}`} className="text-primary hover:underline">
                            {row.order_number || 'เปิดออเดอร์'}
                          </Link>
                        ) : (
                          <span className="text-gray-400">&mdash;</span>
                        )}
                      </td>
                      <td className="data-td">{row.event_name}</td>
                      <td className="data-td">
                        <span className="block truncate max-w-[14rem]">{row.destination_name || row.destination_id}</span>
                        <span className="helper-text text-gray-400">{DESTINATION_LABEL[row.destination]}</span>
                      </td>
                      <td className="data-td">
                        {row.status === 'failed' && row.error ? (
                          <Tooltip text={row.error}>
                            <Badge tone={badge.tone} size="sm">{badge.label}</Badge>
                          </Tooltip>
                        ) : (
                          <Badge tone={badge.tone} size="sm">{badge.label}</Badge>
                        )}
                      </td>
                      <td className="data-td whitespace-nowrap">{formatThaiDateTime(row.sent_at || row.event_time)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
