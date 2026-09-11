// Path: app/marketing/audiences/page.tsx
//
// รายการกลุ่มเป้าหมาย — **หน้านี้ต้องตอบว่า "กลุ่มนี้ใช้ได้จริงไหม" ไม่ใช่แค่ "มีกลุ่มนี้อยู่"**
//
// จึงมีคอลัมน์ Meta ที่บอกสถานะซิงก์รายบัญชีโฆษณา พร้อมขนาดที่ Meta ประเมิน — กลุ่มที่
// สร้างไว้แต่ซิงก์ไม่ผ่านคือกลุ่มที่ยิงโฆษณาไม่ได้ ซึ่งมองจากชื่อกลุ่มอย่างเดียวไม่มีทางรู้
//
// ยังไม่เชื่อมบัญชีโฆษณาก็ใช้หน้านี้ได้ (กลุ่มใช้ส่งบรอดแคสต์ได้อยู่แล้ว) — บอกไว้ด้วย Alert
// **ห้ามบล็อกทั้งหน้า**
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import Tooltip from '@/components/ui/Tooltip';
import PlatformIcon from '@/components/ui/PlatformIcon';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import TemplatePicker, { TemplatePickerModal } from './components/TemplatePicker';
import { loadChatSourceAccounts } from './components/sources';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useToast } from '@/lib/toast-context';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { apiFetch, invalidateApiCache } from '@/lib/api-client';
import { formatNumber, formatThaiDateTime } from '@/lib/utils/format';
import { audienceLabel, describeAudienceRefine } from '@/lib/broadcast/audience';
import type { AudienceTemplateKey } from '@/lib/audiences/templates';
import { Edit2, LayoutTemplate, Loader2, Plus, RefreshCw, Send, Target, Trash2, Users } from 'lucide-react';
import type { AudienceSyncView, AudienceView, ChatSourceAccount } from './components/types';

/** ถี่พอให้เห็นว่ากำลังเดิน แต่หยุดเองเมื่อไม่มีใบไหน sync อยู่ (เท่ากับหน้ารายการบรอดแคสต์) */
const POLL_MS = 4000;

type Tone = 'emerald' | 'amber' | 'red' | 'gray';

function syncBadge(sync: AudienceSyncView): { tone: Tone; label: string; spinning?: boolean } {
  switch (sync.status) {
    case 'synced':
      return { tone: 'emerald', label: `synced ${formatNumber(sync.last_counts?.uploaded ?? 0)}` };
    case 'syncing':
      return { tone: 'amber', label: 'กำลัง sync…', spinning: true };
    case 'error':
      return { tone: 'red', label: 'sync ไม่สำเร็จ' };
    case 'tos_required':
      return { tone: 'amber', label: 'ต้องยอมรับข้อกำหนด' };
    default:
      return { tone: 'gray', label: 'รอ sync' };
  }
}

/** บรรทัดรองของแถว Meta — ขนาดที่ Meta ประเมิน · ซิงก์ล่าสุด · อัตโนมัติหรือกดเอง */
function syncDetail(sync: AudienceSyncView): string {
  const parts: string[] = [];
  if (sync.approx_size_lower != null && sync.approx_size_upper != null) {
    parts.push(`~${formatNumber(sync.approx_size_lower)}–${formatNumber(sync.approx_size_upper)} ที่ Meta`);
  }
  if (sync.last_sync_at) parts.push(formatThaiDateTime(sync.last_sync_at));
  parts.push(sync.auto_sync ? 'อัตโนมัติทุกวัน' : 'manual');
  return parts.join(' · ');
}

export default function AudiencesPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { userProfile } = useAuth();
  const { confirmDialog, confirm } = useConfirmDialog();
  const { allowed, loading: authLoading } = useAuthGuard('marketing.audiences', { noRedirect: true });

  const [rows, setRows] = useState<AudienceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // แบ่งหน้าฝั่ง client — /api/audiences คืนทั้งหมด (กลุ่มต่อบริษัทมีหลักสิบ ไม่ใช่หลักพัน)
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  /** null = ยังไม่รู้ (กำลังโหลด / ไม่มีสิทธิ์ดู) — ห้ามขึ้น Alert ก่อนรู้จริง */
  const [adAccountCount, setAdAccountCount] = useState<number | null>(null);
  /** ช่องทางที่เชื่อมไว้ — ใช้บอกว่าแม่แบบไหนยังใช้ไม่ได้ (ไม่มีเพจ Facebook) */
  const [chatAccounts, setChatAccounts] = useState<ChatSourceAccount[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);

  const pickTemplate = useCallback((key: AudienceTemplateKey) => {
    router.push(`/marketing/audiences/new?template=${key}`);
  }, [router]);

  const canManageAdAccounts = can(userProfile, 'masterdata.ad_accounts');

  const fetchRows = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch('/api/audiences');
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setRows(data.audiences || []);
    } catch {
      if (!silent) showToast('โหลดรายการกลุ่มเป้าหมายไม่สำเร็จ', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!allowed) return;
    fetchRows();
  }, [allowed, fetchRows]);

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      try {
        const res = await apiFetch('/api/ads/accounts');
        // 403 = ไม่มีสิทธิ์ดู ไม่ใช่ "ไม่มีบัญชี" — คงค่า null ไว้ ไม่ต้องชวนไปเชื่อม
        if (!res.ok) return;
        setAdAccountCount(((await res.json()).accounts || []).length);
      } catch {
        // เงียบไว้ — บล็อกนี้เป็นแค่คำแนะนำ ไม่ใช่เนื้อหาหลักของหน้า
      }
    })();
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    loadChatSourceAccounts().then(setChatAccounts);
  }, [allowed]);

  // มีใบที่กำลัง sync เท่านั้นถึง poll — จบแล้วหยุดเอง ไม่ยิงถี่ทิ้งไว้ทั้งวัน
  const syncing = rows.some(r => r.syncs.some(s => s.status === 'syncing'));
  const fetchRef = useRef(fetchRows);
  fetchRef.current = fetchRows;
  useEffect(() => {
    if (!allowed || !syncing) return;
    const timer = setInterval(() => fetchRef.current(true), POLL_MS);
    return () => clearInterval(timer);
  }, [allowed, syncing]);

  const handleSyncNow = async (row: AudienceView) => {
    setBusyId(row.id);
    try {
      const res = await apiFetch(`/api/audiences/${row.id}/sync`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'failed');
      }
      showToast('เริ่ม sync แล้ว', 'success');
      fetchRows(true);
    } catch (e) {
      showToast(e instanceof Error && e.message !== 'failed' ? e.message : 'sync ไม่สำเร็จ', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (row: AudienceView) => {
    const ok = await confirm({
      title: `ลบกลุ่ม "${row.name}"?`,
      description: `บรอดแคสต์ที่เคยส่งไม่ได้รับผลกระทบ · Custom Audience ใน Meta (${row.syncs.length} บัญชี)`
        + ' จะถูกลบด้วย — โฆษณาที่ใช้กลุ่มนี้อยู่จะหยุดหาคนใหม่',
      variant: 'danger',
      confirmLabel: 'ลบกลุ่ม',
      confirmIcon: <Trash2 className="w-4 h-4" />,
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      const res = await apiFetch(`/api/audiences/${row.id}?delete_remote=1`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'failed');
      }
      const data = await res.json().catch(() => ({}));
      invalidateApiCache('/api/audiences');
      showToast(data.warning || 'ลบกลุ่มแล้ว', data.warning ? 'error' : 'success');
      fetchRows(true);
    } catch (e) {
      showToast(e instanceof Error && e.message !== 'failed' ? e.message : 'ลบกลุ่มไม่สำเร็จ', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const columns: DataTableColumn<AudienceView>[] = [
    {
      key: 'name', label: 'กลุ่ม', alwaysVisible: true, defaultWidth: 280,
      render: (r) => {
        const refine = describeAudienceRefine(r.definition?.audience_filter);
        return (
          <div className="min-w-0">
            <p className="data-text text-gray-900 dark:text-white break-words">{r.name}</p>
            <p className="data-muted text-gray-400 dark:text-slate-500 mt-0.5 break-words">
              {audienceLabel(r.definition?.audience_type || '', r.definition?.audience_filter)}
              {refine ? ` · ${refine}` : ''}
            </p>
          </div>
        );
      },
    },
    {
      key: 'sources', label: 'แหล่งที่มา', defaultWidth: 180,
      render: (r) => (
        <div className="space-y-0.5">
          {r.sources.length === 0
            ? <span className="data-muted text-gray-400 dark:text-slate-500">-</span>
            : r.sources.map((s, i) => (
              <span key={`${s.kind}-${s.chat_account_id || i}`} className="flex items-center gap-1.5">
                {s.kind === 'chat' && s.platform
                  ? <PlatformIcon id={s.platform} size={14} title={s.name} />
                  : <Users className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />}
                <span className="data-text text-gray-700 dark:text-slate-300 truncate">{s.name}</span>
              </span>
            ))}
        </div>
      ),
    },
    {
      key: 'members', label: 'เข้าเงื่อนไข', defaultWidth: 130,
      headerClassName: 'text-right', cellClassName: 'text-right',
      render: (r) => (
        <div>
          {/* ยังไม่เคยนับ = ขีด **ห้ามโชว์ 0** (อ่านว่ากลุ่มนี้ไม่มีใครเลย ซึ่งคนละความหมาย) */}
          <p className="data-number text-gray-700 dark:text-slate-300">
            {r.member_count == null ? '—' : formatNumber(r.member_count)}
          </p>
          {r.member_count_at && (
            <p className="data-muted text-gray-400 dark:text-slate-500 mt-0.5">
              นับเมื่อ {formatThaiDateTime(r.member_count_at)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'meta', label: 'Meta', defaultWidth: 250,
      render: (r) => {
        if (r.syncs.length === 0) {
          return <span className="data-muted text-gray-400 dark:text-slate-500">ยังไม่ sync</span>;
        }
        return (
          <div className="space-y-1.5">
            {r.syncs.map(s => {
              const look = syncBadge(s);
              const badge = (
                <Badge
                  tone={look.tone}
                  size="sm"
                  icon={look.spinning ? <Loader2 className="w-3 h-3 animate-spin" /> : undefined}
                >
                  {look.label}
                </Badge>
              );
              return (
                <div key={s.id} className="min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {s.status === 'error' && s.error
                      ? <Tooltip text={s.error}>{badge}</Tooltip>
                      : badge}
                    <span className="data-text text-gray-700 dark:text-slate-300 truncate">
                      {s.ad_account_name || '-'}
                    </span>
                  </span>
                  <p className="data-muted text-gray-400 dark:text-slate-500 mt-0.5 break-words">
                    {syncDetail(s)}
                  </p>
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      key: 'actions', label: '', stopPropagation: true, alwaysVisible: true, defaultWidth: 56,
      render: (r) => {
        const hasLine = r.sources.some(s => s.kind === 'chat' && s.platform === 'line');
        const anySyncing = r.syncs.some(s => s.status === 'syncing');
        const items: ActionItem[] = [
          {
            key: 'broadcast',
            label: 'ส่งบรอดแคสต์หากลุ่มนี้',
            icon: <Send className="w-4 h-4" />,
            primary: true,
            disabled: !hasLine,
            description: hasLine ? undefined : 'กลุ่มนี้ไม่มีช่องทาง LINE — บรอดแคสต์ส่งได้เฉพาะ LINE',
            onClick: () => router.push(`/marketing/broadcast/new?audience=${r.id}`),
          },
          {
            key: 'sync',
            label: 'sync ไป Meta ตอนนี้',
            icon: <RefreshCw className="w-4 h-4" />,
            disabled: r.syncs.length === 0 || anySyncing || busyId === r.id,
            description: r.syncs.length === 0 ? 'ยังไม่ได้ผูกกับบัญชีโฆษณาไหนเลย' : undefined,
            onClick: () => handleSyncNow(r),
          },
          {
            key: 'edit',
            label: 'แก้ไข',
            icon: <Edit2 className="w-4 h-4" />,
            onClick: () => router.push(`/marketing/audiences/${r.id}`),
          },
          {
            key: 'delete',
            label: 'ลบ',
            icon: <Trash2 className="w-4 h-4" />,
            danger: true,
            dividerBefore: true,
            disabled: busyId === r.id,
            onClick: () => handleDelete(r),
          },
        ];
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
          icon={<Target />}
          title="กลุ่มเป้าหมาย"
          subtitle="บันทึกกลุ่มลูกค้าไว้ใช้ซ้ำ — ส่งบรอดแคสต์ หรือ sync ไป Meta เพื่อยิงโฆษณา"
          actions={
            <>
              <Button
                variant="secondary"
                icon={<LayoutTemplate className="w-4 h-4" />}
                onClick={() => setTemplateOpen(true)}
              >
                สร้างจากแม่แบบ
              </Button>
              <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => router.push('/marketing/audiences/new')}>
                สร้างกลุ่ม
              </Button>
            </>
          }
        />

        <TemplatePickerModal
          open={templateOpen}
          onClose={() => setTemplateOpen(false)}
          accounts={chatAccounts}
          onPick={pickTemplate}
        />

        {adAccountCount === 0 && (
          <Alert tone="info">
            ยังไม่ได้เชื่อมบัญชีโฆษณา — สร้างกลุ่มและส่งบรอดแคสต์ได้ แต่ sync ไป Meta ยังไม่ได้
            {canManageAdAccounts && (
              <>
                {' · '}
                <a href="/settings/ad-accounts" className="underline font-medium">เชื่อมบัญชีโฆษณา</a>
              </>
            )}
          </Alert>
        )}

        {!loading && rows.length === 0 ? (
          // ยังไม่มีกลุ่มสักกลุ่ม = ช่วงที่ผู้ใช้ไม่รู้ว่า "ควรมีกลุ่มอะไรบ้าง" — เสนอแม่แบบ
          // ไปเลย ดีกว่าปุ่ม "สร้างกลุ่ม" เปล่า ๆ ที่พาไปฟอร์มว่างซึ่งต้องเดาเองทั้งหมด
          <div className="space-y-3">
            <div>
              <h2 className="heading-3">เริ่มจากแม่แบบ</h2>
              <p className="section-desc">
                กลุ่มที่ร้านค้าส่วนใหญ่ต้องมี — กดแล้วไปหน้าสร้างที่กรอกเงื่อนไขให้แล้ว แก้ได้ก่อนบันทึก
              </p>
            </div>
            <TemplatePicker accounts={chatAccounts} onPick={pickTemplate} />
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <span className="subtitle-text">อยากได้เงื่อนไขแบบอื่น?</span>
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => router.push('/marketing/audiences/new')}
              >
                สร้างเองตั้งแต่ต้น
              </Button>
            </div>
          </div>
        ) : (
          <DataTable<AudienceView>
            storageKey="audiences"
            columns={columns}
            data={rows.slice((page - 1) * recordsPerPage, page * recordsPerPage)}
            loading={loading}
            getRowId={(r) => r.id}
            onRowClick={(r) => router.push(`/marketing/audiences/${r.id}`)}
            emptyMessage="ยังไม่มีกลุ่มเป้าหมาย"
            emptyIcon={<Target className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            currentPage={page}
            totalPages={Math.max(1, Math.ceil(rows.length / recordsPerPage))}
            totalRecords={rows.length}
            recordsPerPage={recordsPerPage}
            onPageChange={setPage}
            onRecordsPerPageChange={(limit) => { setRecordsPerPage(limit); setPage(1); }}
          />
        )}
      </Container>
    </Layout>
  );
}
