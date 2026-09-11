// Path: app/marketing/broadcast/page.tsx
//
// รายการบรอดแคสต์ — **หน้านี้ต้องตอบว่า "ที่ส่งไปได้ผลไหม" ไม่ใช่แค่ "ส่งไปแล้ว"**
//
// ผลวัดอยู่ในตารางรายใบ (ตอบกลับ · สั่งซื้อใน 7 วัน) ไม่มี KPI รวมบนหัว · ตัวเลขวัดผลตามได้
// เฉพาะช่องทางที่มีห้องแชทของเราเอง (LINE) ใบที่ตามไม่ได้ API ส่ง stats = null มา แล้วช่องนั้น
// ขึ้นขีด — **ห้ามเดาเป็น 0** ไม่งั้นจะอ่านว่า "ส่งแล้วไม่มีใครตอบ" ทั้งที่ความจริงคือเราวัดไม่ได้
//
// ลูกค้าตอบ/สั่งซื้อเข้ามาได้ตลอดช่วงวัดผล — หน้านี้ดึงใหม่เองเมื่อกลับมาที่แท็บ และทุก 30 วิ
// ระหว่างที่ยังมีใบอยู่ในช่วงนั้น (เปิดค้างไว้แล้วตัวเลขไม่ขยับ = เข้าใจผิดว่าระบบไม่นับ)
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import Layout from '@/components/layout/Layout';
import StatusBadge from '@/components/ui/StatusBadge';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import DateRangePicker, { type DateValueType } from '@/components/ui/DateRangePicker';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import PlatformIcon from '@/components/ui/PlatformIcon';
import { ProgressBar } from '@/components/ui/Chart';
import { EmptyCard, LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { thumbUrl } from '@/lib/image-thumb';
import { formatDateParts, formatNumber, formatPrice } from '@/lib/utils/format';
import { BROADCAST_PLATFORMS, isBroadcastPlatform } from '@/lib/broadcast/platforms';
import {
  audienceLabel,
  describeAudienceRefine,
  isBroadcastMeasuring,
  BROADCAST_ATTRIBUTION_DAYS,
  type StoredAudienceFilter,
} from '@/lib/broadcast/audience';
import { BarChart3, Megaphone, Plus, Send, XCircle } from 'lucide-react';

interface BroadcastStats {
  replied_count: number;
  awaiting_count: number;
  ordered_count: number;
  ordered_amount: number;
}

interface BroadcastRow {
  id: string;
  platform: string;
  /** ต้นทางอยู่คนละตารางตามช่องทาง — chat_accounts (LINE) หรือ marketplace_accounts (ร้าน) */
  chat_account_id: string | null;
  marketplace_account_id: string | null;
  account_name: string | null;
  created_by_name: string | null;
  audience_type: string;
  audience_filter: StoredAudienceFilter | null;
  preview: string | null;
  /** รูปแรกที่ลูกค้าเห็น (รูป · รูปเต็มจอ · การ์ดใบแรก) — null = ใบข้อความล้วน */
  preview_image: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: string;
  error: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  /** null = ช่องทางนี้ตามผลรายคนไม่ได้ หรือใบนี้ยังไม่ได้ส่ง */
  stats: BroadcastStats | null;
}

/** ช่วงวันที่ใช้กรอง (yyyy-MM-dd) — null ทั้งคู่ = ทุกวัน */
interface DateRange {
  from: string | null;
  to: string | null;
}

/** ระหว่างกำลังส่ง ตัวเลขล็อตขยับทุกไม่กี่วิ */
const SENDING_POLL_MS = 4000;
/** ส่งจบแล้วแต่ยังอยู่ในช่วงวัดผล — ลูกค้าตอบ/สั่งซื้อทีละคน ไม่ต้องถี่ */
const MEASURING_POLL_MS = 30_000;

const DASH = <span className="data-muted text-gray-400 dark:text-slate-500">—</span>;

/** เปอร์เซ็นต์ที่ตัวหารเป็น 0 ได้ — คืนขีดแทน NaN/Infinity */
function pctText(part: number, total: number): string {
  if (!total) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

/** ส่งค้างเกิน 10 นาทีโดยไม่จบ = ฟังก์ชันน่าจะตายกลางทาง ต้องมีปุ่มให้เดินต่อ */
function isStale(row: BroadcastRow): boolean {
  if (row.status !== 'sending' && row.status !== 'pending') return false;
  const started = row.started_at ? new Date(row.started_at).getTime() : new Date(row.created_at).getTime();
  return Date.now() - started > 10 * 60 * 1000;
}

/** ค่าจาก DateRangePicker (สตริง yyyy-MM-dd หรือ Date) → yyyy-MM-dd ตามเวลาเครื่อง */
function toDay(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : format(v, 'yyyy-MM-dd');
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

/** ตัวกรองเริ่มต้น = เดือนนี้ */
function thisMonth(): DateRange {
  const now = new Date();
  return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
}

/**
 * "วันที่ส่ง" ของใบ — เวลาเริ่มส่ง → ยังไม่เริ่ม (ตั้งเวลา/ยกเลิก) ใช้เวลาที่ตั้ง → เวลาสร้าง
 * ลำดับเดียวกับตัวกรองช่วงวันของ GET /api/broadcasts (เปลี่ยนข้างเดียว = ใบโผล่ผิดช่วง)
 */
function sendAt(row: BroadcastRow): string | null {
  return row.started_at || row.scheduled_at || row.created_at;
}

/** วันที่ส่งแบบกระดาษปฏิทิน — วันในสัปดาห์ต้องเห็นทันที (ดูว่ายิงวันไหนแล้วได้ผล) */
function SendDate({ row }: { row: BroadcastRow }) {
  const parts = formatDateParts(sendAt(row));
  if (!parts) return DASH;
  const scheduled = row.status === 'scheduled';
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 dark:border-slate-600 text-center">
        <p className="bg-orange-50 dark:bg-orange-500/15 text-[11px] font-bold leading-5 tracking-wider text-[#F4511E] dark:text-orange-300">
          {parts.weekday}
        </p>
        <p className="text-xl font-bold leading-8 text-gray-900 dark:text-white">{parts.day}</p>
      </div>
      <div className="min-w-0 whitespace-nowrap">
        <p className="data-text text-gray-900 dark:text-white">{parts.monthYear}</p>
        <p className={`data-muted mt-0.5 ${scheduled ? 'text-amber-700 dark:text-amber-500' : 'text-gray-500 dark:text-slate-400'}`}>
          {scheduled ? `ตั้งเวลา ${parts.time} น.` : `${parts.time} น.`}
        </p>
      </div>
    </div>
  );
}

/** ข้อความ + รูปตัวอย่าง 1 ใบ (ใบที่มีรูป) — ใบข้อความล้วนโชว์ข้อความเฉย ๆ */
function MessagePreview({ row }: { row: BroadcastRow }) {
  return (
    <div className="flex items-start gap-3">
      {row.preview_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl(row.preview_image, 96)}
          alt=""
          loading="lazy"
          className="w-12 h-12 flex-shrink-0 rounded-md object-cover bg-gray-100 dark:bg-slate-700"
        />
      )}
      <div className="min-w-0">
        <p className="data-text text-gray-900 dark:text-white line-clamp-2 break-words whitespace-pre-wrap">
          {row.preview || '-'}
        </p>
        <span className="flex flex-wrap items-center gap-1.5 mt-1">
          <StatusBadge domain="broadcast" status={row.status} size="sm" />
        </span>
        {row.error && (
          <p className="data-muted text-red-600 dark:text-red-400 mt-1 line-clamp-2 break-words">{row.error}</p>
        )}
      </div>
    </div>
  );
}

/** ช่องทาง/บัญชีที่ส่ง + กลุ่มผู้รับ */
function AudienceCell({ row }: { row: BroadcastRow }) {
  const refine = describeAudienceRefine(row.audience_filter);
  return (
    <div className="min-w-0">
      <span className="flex items-center gap-2">
        <PlatformIcon id={row.platform} size={16} />
        <span className="data-text text-gray-700 dark:text-slate-300 truncate">
          {row.account_name || (isBroadcastPlatform(row.platform) ? BROADCAST_PLATFORMS[row.platform].label : '-')}
        </span>
      </span>
      <p className="data-muted text-gray-400 dark:text-slate-500 mt-0.5 break-words">
        {audienceLabel(row.audience_type, row.audience_filter)}{refine ? ` · ${refine}` : ''}
      </p>
    </div>
  );
}

/** ตัวเลขช่องเล็กบนการ์ดมือถือ */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="data-muted text-gray-500 dark:text-slate-400 truncate">{label}</p>
      <p className="data-number text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

export default function BroadcastListPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const { allowed, loading: authLoading } = useAuthGuard('chat.broadcast', { noRedirect: true });

  const [rows, setRows] = useState<BroadcastRow[]>([]);
  const [total, setTotal] = useState(0);
  /** ร้านเคยส่งบรอดแคสต์เลยไหม — null = ยังไม่รู้ · ว่างเพราะช่วงวันที่เลือก ≠ ไม่เคยส่ง */
  const [hasAny, setHasAny] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [busyId, setBusyId] = useState<string | null>(null);
  // ช่วงที่ใช้กรองจริง แยกจากค่าที่โชว์ในตัวเลือก — เพิ่งกดวันแรกของช่วงยังไม่ต้องยิงถาม
  const [range, setRange] = useState<DateRange>(thisMonth);
  const [pickerValue, setPickerValue] = useState<DateValueType>(() => ({ startDate: range.from, endDate: range.to }));

  // อ่านค่าล่าสุดโดยไม่ผูก dep ของ fetch — ไม่งั้น poll ถูกตั้งใหม่ทุกครั้งที่ข้อมูลเปลี่ยน
  const pageRef = useRef(page);
  const perPageRef = useRef(recordsPerPage);
  const rangeRef = useRef(range);
  pageRef.current = page;
  perPageRef.current = recordsPerPage;
  rangeRef.current = range;
  // เลขรอบของการโหลดที่ผู้ใช้สั่ง (เปลี่ยนหน้า/ช่วงวัน) — ผลที่กลับมาช้ากว่ารอบใหม่ห้ามทับของใหม่
  const loadSeqRef = useRef(0);

  const fetchRows = useCallback(async (silent = false) => {
    // poll ไม่นับเป็นรอบใหม่ — แต่ถ้าผู้ใช้เปลี่ยนหน้า/ช่วงวันระหว่างทาง ผลของ poll ก็ทิ้ง
    const seq = silent ? loadSeqRef.current : ++loadSeqRef.current;
    if (!silent) setLoading(true);
    try {
      const qs = new URLSearchParams({
        limit: String(perPageRef.current),
        offset: String((pageRef.current - 1) * perPageRef.current),
      });
      if (rangeRef.current.from) qs.set('date_from', rangeRef.current.from);
      if (rangeRef.current.to) qs.set('date_to', rangeRef.current.to);
      const res = await apiFetch(`/api/broadcasts?${qs.toString()}`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      if (seq !== loadSeqRef.current) return;
      setRows(data.broadcasts || []);
      setTotal(data.total || 0);
      setHasAny(!!data.has_any);
      setSending(!!data.sending);
    } catch {
      if (!silent && seq === loadSeqRef.current) showToast('โหลดรายการบรอดแคสต์ไม่สำเร็จ', 'error');
    } finally {
      if (!silent && seq === loadSeqRef.current) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!allowed) return;
    fetchRows();
  }, [allowed, page, recordsPerPage, range, fetchRows]);

  // กำลังส่ง = poll ถี่ · ยังมีใบอยู่ในช่วงวัดผล = poll ห่าง ๆ · นอกนั้นดึงใหม่เฉพาะตอนกลับมาที่แท็บ
  const measuring = rows.some(r => r.stats && isBroadcastMeasuring(r.started_at));
  useLiveRefresh(() => fetchRows(true), {
    enabled: !!allowed,
    pollMs: sending ? SENDING_POLL_MS : measuring ? MEASURING_POLL_MS : null,
  });

  const handleRangeChange = (value: DateValueType) => {
    setPickerValue(value);
    const from = toDay(value?.startDate);
    const to = toDay(value?.endDate);
    // เพิ่งกดวันแรกของช่วง = ยังเลือกไม่เสร็จ รอวันสุดท้ายก่อน · ล้างทั้งคู่ = ดูทุกวัน
    if (!!from !== !!to) return;
    setRange({ from, to });
    setPage(1);
  };

  const handleResume = async (row: BroadcastRow) => {
    setBusyId(row.id);
    try {
      const res = await apiFetch(`/api/broadcasts/${row.id}/resume`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'failed');
      }
      showToast('เริ่มส่งต่อแล้ว', 'success');
      setSending(true);
      fetchRows(true);
    } catch (e) {
      showToast(e instanceof Error && e.message !== 'failed' ? e.message : 'ส่งต่อไม่สำเร็จ', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelSchedule = async (row: BroadcastRow) => {
    const ok = await confirm({
      title: 'ยกเลิกการตั้งเวลา?',
      description: 'บรอดแคสต์ใบนี้จะไม่ถูกส่งเมื่อถึงเวลา — สร้างใหม่ได้เสมอ',
      variant: 'danger',
      confirmLabel: 'ยกเลิกการตั้งเวลา',
      confirmIcon: <XCircle className="w-4 h-4" />,
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      const res = await apiFetch(`/api/broadcasts/${row.id}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'failed');
      }
      showToast('ยกเลิกการตั้งเวลาแล้ว', 'success');
      fetchRows(true);
    } catch (e) {
      showToast(e instanceof Error && e.message !== 'failed' ? e.message : 'ยกเลิกไม่สำเร็จ', 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** เมนูแถว — ดูรายงานเป็นหลัก (กดแถวก็ไปที่เดียวกัน) · ส่งต่อ/ยกเลิกตั้งเวลาตามสถานะ */
  const menuItems = (r: BroadcastRow): ActionItem[] => {
    const items: ActionItem[] = [{
      key: 'report',
      label: 'ดูรายงาน',
      icon: <BarChart3 className="w-4 h-4" />,
      primary: true,
      onClick: () => router.push(`/marketing/broadcast/${r.id}`),
    }];
    if (r.status === 'partial' || isStale(r)) {
      items.push({
        key: 'resume',
        label: 'ส่งต่อ',
        icon: <Send className="w-4 h-4" />,
        disabled: busyId === r.id,
        onClick: () => handleResume(r),
      });
    }
    if (r.status === 'scheduled') {
      items.push({
        key: 'cancel',
        label: 'ยกเลิกการตั้งเวลา',
        icon: <XCircle className="w-4 h-4" />,
        danger: true,
        dividerBefore: true,
        disabled: busyId === r.id,
        onClick: () => handleCancelSchedule(r),
      });
    }
    return items;
  };

  const columns: DataTableColumn<BroadcastRow>[] = [
    {
      key: 'send_at', label: 'วันที่ส่ง', alwaysVisible: true, defaultWidth: 160,
      render: (r) => <SendDate row={r} />,
    },
    {
      key: 'message', label: 'ข้อความ', alwaysVisible: true, defaultWidth: 320,
      render: (r) => <MessagePreview row={r} />,
    },
    {
      key: 'account', label: 'ช่องทาง / กลุ่ม', defaultWidth: 190,
      render: (r) => <AudienceCell row={r} />,
    },
    {
      key: 'recipients', label: 'ส่งถึง', defaultWidth: 100,
      headerClassName: 'text-right', cellClassName: 'text-right',
      render: (r) => (
        <span className="data-number text-gray-700 dark:text-slate-300">{formatNumber(r.recipient_count)}</span>
      ),
    },
    {
      key: 'sent', label: 'สำเร็จ', defaultWidth: 110,
      headerClassName: 'text-right', cellClassName: 'text-right',
      render: (r) => {
        if (r.status === 'scheduled') return DASH;
        // ส่งไม่ครบ = เรื่องที่ต้องเห็นทันที (มีปุ่ม "ส่งต่อ" ให้กดในเมนู)
        const short = r.sent_count < r.recipient_count;
        return (
          <div>
            <p className={`data-number ${short ? 'text-amber-700 dark:text-amber-500' : 'text-gray-700 dark:text-slate-300'}`}>
              {formatNumber(r.sent_count)}
            </p>
            <p className="data-muted text-gray-400 dark:text-slate-500 mt-0.5">
              {pctText(r.sent_count, r.recipient_count)}
            </p>
          </div>
        );
      },
    },
    {
      key: 'replied', label: 'ตอบกลับ', defaultWidth: 150,
      headerClassName: 'text-right', cellClassName: 'text-right',
      render: (r) => {
        if (!r.stats) return DASH;
        const { replied_count, awaiting_count } = r.stats;
        return (
          <div>
            <div className="flex items-center justify-end gap-2">
              <div className="w-16 flex-shrink-0">
                <ProgressBar value={replied_count} max={r.recipient_count} size="sm" toneClass="bg-emerald-500" />
              </div>
              <span className={`data-number ${replied_count > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-slate-300'}`}>
                {formatNumber(replied_count)}
              </span>
            </div>
            <p className="data-muted text-gray-400 dark:text-slate-500 mt-0.5">
              {pctText(replied_count, r.recipient_count)}
              {awaiting_count > 0 ? ` · รอตอบ ${formatNumber(awaiting_count)}` : ''}
            </p>
          </div>
        );
      },
    },
    {
      key: 'ordered', label: `สั่งซื้อใน ${BROADCAST_ATTRIBUTION_DAYS} วัน`, defaultWidth: 140,
      headerClassName: 'text-right', cellClassName: 'text-right',
      render: (r) => {
        if (!r.stats) return DASH;
        const { ordered_count, ordered_amount } = r.stats;
        return (
          <div>
            <p className={`data-number ${ordered_count > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-slate-300'}`}>
              {formatNumber(ordered_count)} คน
            </p>
            <p className="data-muted text-gray-400 dark:text-slate-500 mt-0.5">฿{formatPrice(ordered_amount)}</p>
          </div>
        );
      },
    },
    {
      key: 'created_by', label: 'ผู้ส่ง', defaultWidth: 130,
      render: (r) => <span className="data-text text-gray-700 dark:text-slate-300">{r.created_by_name || '-'}</span>,
    },
    {
      key: 'actions', label: '', stopPropagation: true, alwaysVisible: true, defaultWidth: 56,
      render: (r) => <ActionMenu items={menuItems(r)} />,
    },
  ];

  const renderMobileCard = (r: BroadcastRow) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <SendDate row={r} />
        {/* ทั้งการ์ดกดแล้วเปิดรายงาน — คลิกที่เมนูต้องไม่ไหลต่อไปถึงการ์ด */}
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu items={menuItems(r)} />
        </div>
      </div>
      <MessagePreview row={r} />
      <AudienceCell row={r} />
      <div className="inner-panel grid grid-cols-4 gap-2 px-3 py-2">
        <MiniStat label="ส่งถึง" value={formatNumber(r.recipient_count)} />
        <MiniStat label="สำเร็จ" value={r.status === 'scheduled' ? '—' : formatNumber(r.sent_count)} />
        <MiniStat label="ตอบกลับ" value={r.stats ? formatNumber(r.stats.replied_count) : '—'} />
        <MiniStat label="สั่งซื้อ" value={r.stats ? formatNumber(r.stats.ordered_count) : '—'} />
      </div>
    </div>
  );

  if (authLoading) {
    return <Layout><Container size="full"><LoadingCard /></Container></Layout>;
  }
  if (!allowed) {
    return <Layout><Container size="full"><NoPermissionCard /></Container></Layout>;
  }

  return (
    <Layout>
      {confirmDialog}
      <Container size="full">
        <PageHeader
          icon={<Megaphone />}
          title="บรอดแคสต์"
          subtitle="ส่งข้อความหาลูกค้าหลายคนพร้อมกัน — ทุกใบถูกบันทึกไว้ในห้องแชทของลูกค้าด้วย"
          actions={
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => router.push('/marketing/broadcast/new')}>
              สร้างบรอดแคสต์
            </Button>
          }
        />

        {hasAny === false ? (
          <EmptyCard
            icon={<Megaphone className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            title="ยังไม่เคยส่งบรอดแคสต์"
            subtitle="ส่งข้อความหาลูกค้าที่แอดเพื่อน LINE OA ของร้านได้จากที่นี่"
            actions={
              <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => router.push('/marketing/broadcast/new')}>
                สร้างบรอดแคสต์
              </Button>
            }
          />
        ) : (
          <>
            <div className="data-filter-card">
              <div className="w-full sm:w-72">
                <DateRangePicker
                  value={pickerValue}
                  onChange={handleRangeChange}
                  placeholder="ทุกวันที่"
                  showFooter={false}
                  displayFormat="short"
                />
              </div>
            </div>

            <DataTable<BroadcastRow>
              storageKey="broadcasts"
              columns={columns}
              data={rows}
              loading={loading}
              getRowId={(r) => r.id}
              onRowClick={(r) => router.push(`/marketing/broadcast/${r.id}`)}
              mobileCardRender={renderMobileCard}
              emptyMessage="ไม่มีบรอดแคสต์ในช่วงวันที่เลือก"
              emptyIcon={<Megaphone className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
              currentPage={page}
              totalPages={Math.max(1, Math.ceil(total / recordsPerPage))}
              totalRecords={total}
              recordsPerPage={recordsPerPage}
              onPageChange={setPage}
              onRecordsPerPageChange={(limit) => { setRecordsPerPage(limit); setPage(1); }}
            />
          </>
        )}
      </Container>
    </Layout>
  );
}
