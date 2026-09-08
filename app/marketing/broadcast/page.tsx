'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import ActionMenu from '@/components/ui/ActionMenu';
import { EmptyCard, LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { formatThaiDateTime } from '@/lib/utils/format';
import PlatformIcon from '@/components/ui/PlatformIcon';
import { BROADCAST_PLATFORMS, isBroadcastPlatform } from '@/lib/broadcast/platforms';
import { Megaphone, Plus, Send } from 'lucide-react';

interface BroadcastRow {
  id: string;
  platform: string;
  chat_account_id: string;
  account_name: string | null;
  created_by_name: string | null;
  audience_type: string;
  preview: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: string;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'กำลังส่ง', tone: 'amber' },
  sending: { label: 'กำลังส่ง', tone: 'amber' },
  sent: { label: 'ส่งแล้ว', tone: 'emerald' },
  partial: { label: 'ส่งไม่ครบ', tone: 'orange' },
  failed: { label: 'ล้มเหลว', tone: 'red' },
};

const AUDIENCE_LABEL: Record<string, string> = {
  all: 'ผู้ติดตามทั้งหมด',
  contacts: 'ผู้ติดต่อทั้งหมด',
  customers: 'ที่ผูกลูกค้าแล้ว',
  tags: 'ตามแท็กลูกค้า',
};

/** ส่งค้างเกิน 10 นาทีโดยไม่จบ = ฟังก์ชันน่าจะตายกลางทาง ต้องมีปุ่มให้เดินต่อ */
function isStale(row: BroadcastRow): boolean {
  if (row.status !== 'sending' && row.status !== 'pending') return false;
  const started = row.started_at ? new Date(row.started_at).getTime() : new Date(row.created_at).getTime();
  return Date.now() - started > 10 * 60 * 1000;
}

export default function BroadcastListPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { allowed, loading: authLoading } = useAuthGuard('chat.broadcast', { noRedirect: true });

  const [rows, setRows] = useState<BroadcastRow[]>([]);
  const [total, setTotal] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [resumingId, setResumingId] = useState<string | null>(null);

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
    setResumingId(row.id);
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
      setResumingId(null);
    }
  };

  const columns: DataTableColumn<BroadcastRow>[] = [
    {
      key: 'created_at', label: 'วันที่', alwaysVisible: true, defaultWidth: 160,
      render: (r) => (
        <div>
          <p className="data-text text-gray-900 dark:text-white">{formatThaiDateTime(r.created_at)}</p>
          <p className="data-muted text-gray-400 dark:text-slate-500 mt-0.5">{AUDIENCE_LABEL[r.audience_type] || r.audience_type}</p>
        </div>
      ),
    },
    {
      key: 'account', label: 'ช่องทาง', defaultWidth: 170,
      render: (r) => (
        <span className="flex items-center gap-2">
          <PlatformIcon id={r.platform} size={16} />
          <span className="data-text text-gray-700 dark:text-slate-300">
            {r.account_name || (isBroadcastPlatform(r.platform) ? BROADCAST_PLATFORMS[r.platform].label : '-')}
          </span>
        </span>
      ),
    },
    {
      key: 'preview', label: 'ข้อความ', defaultWidth: 300,
      render: (r) => (
        <p className="data-text text-gray-700 dark:text-slate-300 line-clamp-2 break-words whitespace-pre-wrap">
          {r.preview || '-'}
        </p>
      ),
    },
    {
      key: 'recipients', label: 'ผู้รับ', defaultWidth: 110, headerClassName: 'text-right', cellClassName: 'text-right',
      render: (r) => (
        <span className="data-text text-gray-700 dark:text-slate-300 tabular-nums">
          {r.sent_count.toLocaleString()} / {r.recipient_count.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'status', label: 'สถานะ', defaultWidth: 160,
      render: (r) => {
        const cfg = STATUS_BADGE[r.status] || { label: r.status, tone: 'gray' as BadgeTone };
        return (
          <div>
            <Badge tone={cfg.tone}>{cfg.label}</Badge>
            {r.error && (
              <p className="subtitle-text text-red-600 dark:text-red-400 mt-1 line-clamp-2 break-words">{r.error}</p>
            )}
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
        const canResume = r.status === 'partial' || isStale(r);
        if (!canResume) return null;
        return (
          <ActionMenu items={[{
            key: 'resume',
            label: 'ส่งต่อ',
            icon: <Send className="w-4 h-4" />,
            primary: true,
            disabled: resumingId === r.id,
            onClick: () => handleResume(r),
          }]} />
        );
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
