// Path: app/marketing/broadcast/page.tsx
//
// รายการบรอดแคสต์ — **หน้านี้ต้องตอบว่า "ที่ส่งไปได้ผลไหม" ไม่ใช่แค่ "ส่งไปแล้ว"**
//
// จึงมี KPI 30 วันบนหัว (ส่งไปกี่ข้อความ · ตอบกลับกี่คน · สั่งซื้อกี่คน) และคอลัมน์
// "ตอบกลับ" รายใบ · ตัวเลขวัดผลตามได้เฉพาะช่องทางที่มีห้องแชทของเราเอง (LINE)
// ใบที่ตามไม่ได้ API ส่ง stats = null มา แล้วช่องนั้นขึ้นขีด — **ห้ามเดาเป็น 0**
// ไม่งั้นจะอ่านว่า "ส่งแล้วไม่มีใครตอบ" ทั้งที่ความจริงคือเราวัดไม่ได้
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import StatusBadge from '@/components/ui/StatusBadge';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import { Stat, ProgressBar } from '@/components/ui/Chart';
import { EmptyCard, LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { formatNumber, formatPrice, formatThaiDateTime } from '@/lib/utils/format';
import PlatformIcon from '@/components/ui/PlatformIcon';
import { BROADCAST_PLATFORMS, isBroadcastPlatform, type BroadcastContentKind } from '@/lib/broadcast/platforms';
import {
  audienceLabel,
  describeAudienceRefine,
  BROADCAST_ATTRIBUTION_DAYS,
  type StoredAudienceFilter,
} from '@/lib/broadcast/audience';
import {
  BarChart3, LayoutGrid, Megaphone, MessageSquare, Plus, Send, Tag, XCircle,
} from 'lucide-react';

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
  content_kind: BroadcastContentKind;
  preview: string | null;
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

interface BroadcastSummary {
  days: number;
  broadcasts: number;
  sent_messages: number;
  replied: number;
  awaiting: number;
  ordered: number;
  ordered_amount: number;
}

/** ไอคอนบอกชนิดเนื้อหา — อ่านจากหัวแถวได้ว่าใบนี้เป็นข้อความ โปรโมชัน หรือการ์ดสินค้า */
const KIND_ICON: Record<BroadcastContentKind, typeof MessageSquare> = {
  announce: MessageSquare,
  promo: Tag,
  products: LayoutGrid,
};

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

export default function BroadcastListPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const { allowed, loading: authLoading } = useAuthGuard('chat.broadcast', { noRedirect: true });

  const [rows, setRows] = useState<BroadcastRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<BroadcastSummary | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [busyId, setBusyId] = useState<string | null>(null);

  // อ่านค่าล่าสุดโดยไม่ผูก dep ของ interval — ไม่งั้น poll จะถูกตั้งใหม่ทุกครั้งที่ข้อมูลเปลี่ยน
  const pageRef = useRef(page);
  const perPageRef = useRef(recordsPerPage);
  pageRef.current = page;
  perPageRef.current = recordsPerPage;

  const fetchRows = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const offset = (pageRef.current - 1) * perPageRef.current;
      const res = await apiFetch(`/api/broadcasts?limit=${perPageRef.current}&offset=${offset}`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setRows(data.broadcasts || []);
      setTotal(data.total || 0);
      setSummary(data.summary || null);
      setSending(!!data.sending);
    } catch {
      if (!silent) showToast('โหลดรายการบรอดแคสต์ไม่สำเร็จ', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!allowed) return;
    fetchRows();
  }, [allowed, page, recordsPerPage, fetchRows]);

  // มีใบที่ยังส่งไม่จบเท่านั้นถึง poll — จบแล้วหยุดเอง ไม่ยิงถี่ทิ้งไว้ทั้งวัน
  useEffect(() => {
    if (!allowed || !sending) return;
    const timer = setInterval(() => fetchRows(true), 4000);
    return () => clearInterval(timer);
  }, [allowed, sending, fetchRows]);

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

  const columns: DataTableColumn<BroadcastRow>[] = [
    {
      key: 'message', label: 'ข้อความ', alwaysVisible: true, defaultWidth: 320,
      render: (r) => {
        const KindIcon = KIND_ICON[r.content_kind] || MessageSquare;
        return (
          <div className="flex items-start gap-2.5">
            <span className="w-9 h-9 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-500 flex items-center justify-center flex-shrink-0">
              <KindIcon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="data-text text-gray-900 dark:text-white line-clamp-2 break-words whitespace-pre-wrap">
                {r.preview || '-'}
              </p>
              <span className="flex flex-wrap items-center gap-1.5 mt-1">
                <StatusBadge domain="broadcast" status={r.status} size="sm" />
                <span className="data-muted text-gray-400 dark:text-slate-500">
                  {r.status === 'scheduled'
                    ? `ตั้งเวลา ${formatThaiDateTime(r.scheduled_at)}`
                    : formatThaiDateTime(r.started_at || r.created_at)}
                </span>
              </span>
              {r.error && (
                <p className="data-muted text-red-600 dark:text-red-400 mt-1 line-clamp-2 break-words">{r.error}</p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'account', label: 'ช่องทาง / กลุ่ม', defaultWidth: 190,
      render: (r) => {
        const refine = describeAudienceRefine(r.audience_filter);
        return (
          <div className="min-w-0">
            <span className="flex items-center gap-2">
              <PlatformIcon id={r.platform} size={16} />
              <span className="data-text text-gray-700 dark:text-slate-300 truncate">
                {r.account_name || (isBroadcastPlatform(r.platform) ? BROADCAST_PLATFORMS[r.platform].label : '-')}
              </span>
            </span>
            <p className="data-muted text-gray-400 dark:text-slate-500 mt-0.5 break-words">
              {audienceLabel(r.audience_type, r.audience_filter)}{refine ? ` · ${refine}` : ''}
            </p>
          </div>
        );
      },
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
        if (r.status === 'scheduled') {
          return <span className="data-muted text-gray-400 dark:text-slate-500">—</span>;
        }
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
        if (!r.stats) return <span className="data-muted text-gray-400 dark:text-slate-500">—</span>;
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
      key: 'created_by', label: 'ผู้ส่ง', defaultWidth: 130,
      render: (r) => <span className="data-text text-gray-700 dark:text-slate-300">{r.created_by_name || '-'}</span>,
    },
    {
      key: 'actions', label: '', stopPropagation: true, alwaysVisible: true, defaultWidth: 56,
      render: (r) => {
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
        return <ActionMenu items={items} />;
      },
    },
  ];

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

        {summary && total > 0 && (
          <div className="grid sm:grid-cols-3 gap-4">
            <Stat
              label={`ส่งไป ${summary.days} วัน`}
              value={formatNumber(summary.sent_messages)}
              subtitle={`${formatNumber(summary.broadcasts)} บรอดแคสต์`}
            />
            <Stat
              label="ตอบกลับ"
              value={formatNumber(summary.replied)}
              subtitle={`${pctText(summary.replied, summary.sent_messages)} ของข้อความที่ส่ง`}
            />
            <Stat
              label="สั่งซื้อหลังได้รับ"
              value={formatNumber(summary.ordered)}
              subtitle={`${formatPrice(summary.ordered_amount)} · ภายใน ${BROADCAST_ATTRIBUTION_DAYS} วัน`}
            />
          </div>
        )}

        {!loading && rows.length === 0 ? (
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
        <DataTable<BroadcastRow>
          storageKey="broadcasts"
          columns={columns}
          data={rows}
          loading={loading}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/marketing/broadcast/${r.id}`)}
          emptyMessage="ยังไม่เคยส่งบรอดแคสต์"
          emptyIcon={<Megaphone className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          currentPage={page}
          totalPages={Math.max(1, Math.ceil(total / recordsPerPage))}
          totalRecords={total}
          recordsPerPage={recordsPerPage}
          onPageChange={setPage}
          onRecordsPerPageChange={(limit) => { setRecordsPerPage(limit); setPage(1); }}
        />
        )}
      </Container>
    </Layout>
  );
}
