// Path: app/marketing/broadcast/[id]/page.tsx
//
// รายงานบรอดแคสต์ใบเดียว — **ตอบว่าใบนี้ได้ผลอะไร แล้วต้องทำอะไรต่อ**
//
// ซ้าย = รายชื่อผู้รับพร้อมผลรายคน (ใครตอบ ใครสั่งซื้อ ใครส่งไม่ได้) กดแถวแล้วเข้า
// ห้องแชทคนนั้นได้ทันที · ขวา = สิ่งที่ส่งไป (วาดจาก BroadcastPreview ตัวเดียวกับหน้าสร้าง)
// + ปุ่มงานต่อ — คนเปิดหน้านี้มาเพื่อ "ตามต่อ" ไม่ใช่มาอ่านตัวเลขเฉย ๆ
//
// ⚠️ ตัวหารของ "ตอบกลับ/สั่งซื้อ" คือ `tracked_count` ไม่ใช่ `sent_count` — โหมด
// "ผู้ติดตามทั้งหมด" ยิงถึงคนที่เราไม่มีห้องแชท จึงตามผลไม่ได้ทั้งก้อน · หารด้วย
// sent_count จะได้เปอร์เซ็นต์ที่ต่ำกว่าความจริงโดยไม่มีใครรู้ว่าทำไม
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';
import StatusBadge from '@/components/ui/StatusBadge';
import UserAvatar from '@/components/ui/UserAvatar';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE, type FilterChip } from '@/components/ui/FilterChips';
import { Stat } from '@/components/ui/Chart';
import { EmptyCard, LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import BroadcastPreview from '@/components/broadcast/BroadcastPreview';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { formatNumber, formatPrice, formatThaiDateTime } from '@/lib/utils/format';
import { isBroadcastPlatform } from '@/lib/broadcast/platforms';
import type { BroadcastContentKind } from '@/lib/broadcast/platforms';
import type { BroadcastContent } from '@/lib/broadcast/content';
import {
  audienceLabel,
  BROADCAST_ATTRIBUTION_DAYS,
  type StoredAudienceFilter,
} from '@/lib/broadcast/audience';
import { Megaphone, MessageSquare, RefreshCw, XCircle } from 'lucide-react';

/** ต้องตรงกับ RECIPIENT_FILTERS ของ /api/broadcasts/[id] (server ปฏิเสธค่าที่ไม่รู้จัก) */
type RecipientFilter = 'all' | 'replied' | 'ordered' | 'failed' | 'awaiting';

interface BroadcastDetail {
  id: string;
  platform: string;
  status: string;
  audience_type: string;
  audience_filter: StoredAudienceFilter | null;
  preview: string | null;
  content: BroadcastContent | null;
  content_kind: BroadcastContentKind;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  error: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  chat_account_id: string | null;
  marketplace_account_id: string | null;
  account_name: string | null;
  account_picture_url: string | null;
}

interface BroadcastDetailStats {
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  /** ผู้รับที่ตามผลได้จริง = ตัวหารของ replied/ordered */
  tracked_count: number;
  replied_count: number;
  awaiting_count: number;
  ordered_count: number;
  ordered_amount: number;
}

interface RecipientRow {
  contact_id: string;
  display_name: string | null;
  picture_url: string | null;
  customer_id: string | null;
  sent: boolean;
  replied_at: string | null;
  reply_preview: string | null;
  awaiting: boolean;
  order_count: number;
  order_amount: number;
}

interface DetailResponse {
  broadcast: BroadcastDetail;
  /** null = ช่องทางนี้ตามผลรายคนไม่ได้ */
  stats: BroadcastDetailStats | null;
  recipients: { rows: RecipientRow[]; total: number; filter: RecipientFilter; limit: number; offset: number };
}

/** เปอร์เซ็นต์ที่ตัวหารเป็น 0 ได้ — คืนขีดแทน NaN/Infinity */
function pctText(part: number, total: number): string {
  if (!total) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

export default function BroadcastReportPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const { allowed, loading: authLoading } = useAuthGuard('chat.broadcast', { noRedirect: true });

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [filter, setFilter] = useState<RecipientFilter>('all');
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);

  // อ่านค่าล่าสุดโดยไม่ผูก dep ของ fetch/poll — ไม่งั้น interval ถูกตั้งใหม่ทุกครั้งที่ข้อมูลเปลี่ยน
  const filterRef = useRef(filter);
  const pageRef = useRef(page);
  const perPageRef = useRef(recordsPerPage);
  const hasDataRef = useRef(false);
  filterRef.current = filter;
  pageRef.current = page;
  perPageRef.current = recordsPerPage;

  const fetchDetail = useCallback(async (poll = false) => {
    // มีข้อมูลอยู่แล้ว = แค่เปลี่ยนตัวกรอง/หน้า → หมุนเฉพาะตาราง ไม่ล้างทั้งหน้าทิ้ง
    if (!poll) {
      if (hasDataRef.current) setTableLoading(true);
      else setLoading(true);
    }
    try {
      const qs = new URLSearchParams({
        filter: filterRef.current,
        limit: String(perPageRef.current),
        offset: String((pageRef.current - 1) * perPageRef.current),
      });
      const res = await apiFetch(`/api/broadcasts/${id}?${qs.toString()}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error('failed');
      const json = (await res.json()) as DetailResponse;
      setData(json);
      hasDataRef.current = true;
      setNotFound(false);
    } catch {
      if (!poll) showToast('โหลดรายงานบรอดแคสต์ไม่สำเร็จ', 'error');
    } finally {
      if (!poll) {
        setLoading(false);
        setTableLoading(false);
      }
    }
  }, [id, showToast]);

  useEffect(() => {
    if (!allowed) return;
    fetchDetail();
  }, [allowed, filter, page, recordsPerPage, fetchDetail]);

  // กำลังส่งอยู่เท่านั้นถึง poll — จบแล้วหยุดเอง
  const status = data?.broadcast.status;
  useEffect(() => {
    if (!allowed) return;
    if (status !== 'pending' && status !== 'sending') return;
    const timer = setInterval(() => fetchDetail(true), 4000);
    return () => clearInterval(timer);
  }, [allowed, status, fetchDetail]);

  const handleCancelSchedule = async () => {
    const ok = await confirm({
      title: 'ยกเลิกการตั้งเวลา?',
      description: 'บรอดแคสต์ใบนี้จะไม่ถูกส่งเมื่อถึงเวลา — สร้างใหม่ได้เสมอ',
      variant: 'danger',
      confirmLabel: 'ยกเลิกการตั้งเวลา',
      confirmIcon: <XCircle className="w-4 h-4" />,
    });
    if (!ok) return;
    setCancelling(true);
    try {
      const res = await apiFetch(`/api/broadcasts/${id}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'failed');
      }
      showToast('ยกเลิกการตั้งเวลาแล้ว', 'success');
      fetchDetail(true);
    } catch (e) {
      showToast(e instanceof Error && e.message !== 'failed' ? e.message : 'ยกเลิกไม่สำเร็จ', 'error');
    } finally {
      setCancelling(false);
    }
  };

  if (authLoading || (loading && !data)) {
    return <Layout><Container size="6xl"><LoadingCard /></Container></Layout>;
  }
  if (!allowed) {
    return <Layout><Container size="6xl"><NoPermissionCard /></Container></Layout>;
  }
  if (notFound || !data) {
    return (
      <Layout>
        <Container size="6xl">
          <EmptyCard
            icon={<Megaphone className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            title="ไม่พบบรอดแคสต์นี้"
            subtitle="อาจถูกลบไปแล้ว หรือเป็นของบริษัทอื่น"
            actions={
              <Button variant="secondary" onClick={() => router.push('/marketing/broadcast')}>
                กลับไปรายการบรอดแคสต์
              </Button>
            }
          />
        </Container>
      </Layout>
    );
  }

  const b = data.broadcast;
  const stats = data.stats;
  const chatAccountId = b.chat_account_id;
  const notSentYet = b.status === 'scheduled' || b.status === 'cancelled';
  const audience = audienceLabel(b.audience_type, b.audience_filter);
  const chatOaUrl = chatAccountId ? `/chat?platform=line&account=${chatAccountId}` : null;

  const timeLine = b.status === 'scheduled'
    ? `ตั้งเวลาส่ง ${formatThaiDateTime(b.scheduled_at)}`
    : `ส่ง ${formatThaiDateTime(b.started_at ?? b.created_at)}`;
  const subtitleText = [b.account_name, audience, `${timeLine}${b.created_by_name ? ` โดย ${b.created_by_name}` : ''}`]
    .filter(Boolean).join(' · ');

  const chips: FilterChip<RecipientFilter>[] = [
    { id: 'all', label: 'ทั้งหมด', count: stats?.recipient_count ?? b.recipient_count, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
    { id: 'replied', label: 'ตอบกลับ', count: stats?.replied_count ?? 0, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
    { id: 'awaiting', label: 'รอเราตอบ', count: stats?.awaiting_count ?? 0, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
    { id: 'ordered', label: 'สั่งซื้อ', count: stats?.ordered_count ?? 0, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
    { id: 'failed', label: 'ส่งไม่ได้', count: stats?.failed_count ?? b.failed_count, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
  ];

  const recipientColumns: DataTableColumn<RecipientRow>[] = [
    {
      key: 'contact', label: 'ผู้รับ', alwaysVisible: true, defaultWidth: 220,
      render: (r) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <UserAvatar name={r.display_name} src={r.picture_url} size="sm" />
          <div className="min-w-0">
            <p className="data-text text-gray-900 dark:text-white truncate">{r.display_name || 'ไม่ทราบชื่อ'}</p>
            <p className="data-muted text-gray-400 dark:text-slate-500 mt-0.5">
              {r.customer_id ? 'ผูกลูกค้าแล้ว' : 'ยังไม่ผูกลูกค้า'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'sent', label: 'สถานะส่ง', defaultWidth: 110,
      render: (r) => (
        <Badge tone={r.sent ? 'emerald' : 'red'} size="sm">{r.sent ? 'ส่งแล้ว' : 'ส่งไม่ได้'}</Badge>
      ),
    },
    {
      key: 'reply', label: 'ตอบกลับว่า', defaultWidth: 260,
      render: (r) => {
        if (!r.replied_at) return <span className="data-muted text-gray-400 dark:text-slate-500">—</span>;
        return (
          <div className="min-w-0">
            <p className="data-text text-gray-700 dark:text-slate-300 line-clamp-1 break-words">
              {r.reply_preview || 'ตอบกลับแล้ว'}
            </p>
            <span className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <span className="data-muted text-gray-400 dark:text-slate-500">{formatThaiDateTime(r.replied_at)}</span>
              {r.awaiting && <Badge tone="amber" size="sm">รอเราตอบ</Badge>}
            </span>
          </div>
        );
      },
    },
    {
      key: 'orders', label: 'สั่งซื้อ', defaultWidth: 130,
      headerClassName: 'text-right', cellClassName: 'text-right',
      render: (r) => {
        if (r.order_count <= 0) return <span className="data-muted text-gray-400 dark:text-slate-500">—</span>;
        return (
          <div>
            <p className="data-number text-gray-900 dark:text-white">{formatPrice(r.order_amount)}</p>
            <p className="data-muted text-gray-400 dark:text-slate-500 mt-0.5">{formatNumber(r.order_count)} ออเดอร์</p>
          </div>
        );
      },
    },
  ];

  const previewContent: BroadcastContent = b.content ?? { kind: b.content_kind, text: b.preview || '' };

  return (
    <Layout>
      {confirmDialog}
      <Container size="6xl">
        <PageHeader
          backHref="/marketing/broadcast"
          title={b.preview || 'บรอดแคสต์'}
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-2">
              <StatusBadge domain="broadcast" status={b.status} />
              <span>{subtitleText}</span>
            </span>
          }
          actions={
            <>
              <Button
                variant="secondary"
                icon={<RefreshCw className="w-4 h-4" />}
                onClick={() => router.push(`/marketing/broadcast/new?from=${b.id}`)}
              >
                ส่งซ้ำกลุ่มนี้
              </Button>
              {chatOaUrl && (stats?.replied_count ?? 0) > 0 && (
                <Button
                  variant="primary"
                  icon={<MessageSquare className="w-4 h-4" />}
                  onClick={() => router.push(chatOaUrl)}
                >
                  คุยกับคนที่ตอบ ({formatNumber(stats?.replied_count ?? 0)})
                </Button>
              )}
              {b.status === 'scheduled' && (
                <Button variant="danger" icon={<XCircle className="w-4 h-4" />} loading={cancelling} onClick={handleCancelSchedule}>
                  ยกเลิกการตั้งเวลา
                </Button>
              )}
            </>
          }
        />

        {stats && (
          <div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat label="ผู้รับ" value={formatNumber(stats.recipient_count)} subtitle={audience} />
              <Stat
                label="ส่งสำเร็จ"
                value={formatNumber(stats.sent_count)}
                subtitle={`${pctText(stats.sent_count, stats.recipient_count)}${stats.failed_count > 0 ? ` · ส่งไม่ได้ ${formatNumber(stats.failed_count)}` : ''}`}
              />
              <Stat
                label="ตอบกลับ"
                value={formatNumber(stats.replied_count)}
                subtitle={`${pctText(stats.replied_count, stats.tracked_count)}${stats.awaiting_count > 0 ? ` · รอเราตอบ ${formatNumber(stats.awaiting_count)}` : ''}`}
              />
              <Stat
                label={`สั่งซื้อภายใน ${BROADCAST_ATTRIBUTION_DAYS} วัน`}
                value={formatNumber(stats.ordered_count)}
                subtitle={formatPrice(stats.ordered_amount)}
              />
            </div>
            {/* ตามผลได้ไม่ครบต้องบอกตรง ๆ — ไม่งั้นเปอร์เซ็นต์ตอบกลับจะถูกอ่านว่าคนไม่สนใจ */}
            {stats.tracked_count < stats.sent_count && (
              <p className="subtitle-text mt-2">
                วัดผลได้ {formatNumber(stats.tracked_count)} จาก {formatNumber(stats.sent_count)} คน — ผู้ติดตามที่ไม่เคยทักมาไม่มีห้องแชทให้ตาม
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            {b.error && <Alert tone="danger" title="ส่งไม่สำเร็จ">{b.error}</Alert>}

            {/* ไม่มีรายชื่อให้ดู = แทนที่การ์ดทั้งใบ ไม่ใช่ยัด EmptyCard ไว้ในการ์ด (กล่องซ้อนกล่อง) */}
            {notSentYet ? (
              <EmptyCard
                icon={<Megaphone className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
                title="ยังไม่มีผู้รับให้ดู — ใบนี้ยังไม่ได้ส่ง"
                subtitle="พอถึงเวลาส่งแล้ว รายชื่อผู้รับกับผลรายคนจะขึ้นตรงนี้"
              />
            ) : !chatAccountId ? (
              <EmptyCard
                icon={<Megaphone className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
                title="ช่องทางนี้ตามผลรายคนไม่ได้"
                subtitle="ข้อความไปโผล่ในแชทฝั่งแพลตฟอร์ม ซึ่งเราไม่มีห้องนั้นในระบบ"
              />
            ) : (
              <Card>
                <h2 className="heading-4">ส่งถึงใครบ้าง</h2>
                <div className="mt-3 space-y-3">
                  <FilterChips<RecipientFilter>
                    chips={chips}
                    value={filter}
                    onChange={(next) => { setFilter(next); setPage(1); }}
                  />
                  <DataTable<RecipientRow>
                    storageKey="broadcast-recipients"
                    columns={recipientColumns}
                    data={data.recipients.rows}
                    loading={tableLoading}
                    getRowId={(r) => r.contact_id}
                    onRowClick={(r) => router.push(`/chat?platform=line&account=${chatAccountId}&contact_id=${r.contact_id}`)}
                    emptyMessage="ไม่มีผู้รับในตัวกรองนี้"
                    emptyIcon={<Megaphone className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
                    currentPage={page}
                    totalPages={Math.max(1, Math.ceil(data.recipients.total / recordsPerPage))}
                    totalRecords={data.recipients.total}
                    recordsPerPage={recordsPerPage}
                    onPageChange={setPage}
                    onRecordsPerPageChange={(limit) => { setRecordsPerPage(limit); setPage(1); }}
                  />
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-4 min-w-0">
            <Card>
              <h2 className="heading-4">สิ่งที่ส่งไป</h2>
              <div className="mt-3">
                <BroadcastPreview
                  content={previewContent}
                  platform={isBroadcastPlatform(b.platform) ? b.platform : null}
                />
              </div>
              {b.platform === 'line' && (
                <p className="subtitle-text mt-2">
                  ใช้โควตา {formatNumber(b.sent_count)} ข้อความ · การ์ดนับเท่าข้อความเปล่า
                </p>
              )}
            </Card>

            <Card>
              <h2 className="heading-4">ทำอะไรต่อ</h2>
              <div className="mt-3 space-y-2">
                {chatOaUrl && (stats?.awaiting_count ?? 0) > 0 && (
                  <Button
                    variant="secondary"
                    fullWidth
                    className="justify-start"
                    icon={<MessageSquare className="w-4 h-4" />}
                    onClick={() => router.push(chatOaUrl)}
                  >
                    ตอบ {formatNumber(stats?.awaiting_count ?? 0)} คนที่ยังค้าง
                  </Button>
                )}
                <Button
                  variant="secondary"
                  fullWidth
                  className="justify-start"
                  icon={<RefreshCw className="w-4 h-4" />}
                  onClick={() => router.push(`/marketing/broadcast/new?from=${b.id}`)}
                >
                  ส่งซ้ำกลุ่มนี้
                </Button>
                {chatOaUrl && (
                  <Button
                    variant="secondary"
                    fullWidth
                    className="justify-start"
                    icon={<MessageSquare className="w-4 h-4" />}
                    onClick={() => router.push(chatOaUrl)}
                  >
                    ดูห้องแชทของ OA นี้
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </div>
      </Container>
    </Layout>
  );
}
