// Path: app/chat/follow-ups/page.tsx
//
// คิวติดตาม — "วันนี้ต้องทักใคร" รวมทุกช่องทางในหน้าเดียว
//
// เรียงตาม **วันนัด** ไม่ใช่เวลาข้อความล่าสุด (หน้ารายชื่อแชทตอบคำถามนั้นอยู่แล้ว) —
// เลยกำหนด → วันนี้ → ข้างหน้า · แตะการ์ดเปิดห้องแชทนั้นทันที
// ตั้งนัดใหม่/เลื่อนได้จากที่นี่เลย ไม่ต้องเข้าห้องก่อน
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE } from '@/components/ui/FilterChips';
import { EmptyCard, LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { can } from '@/lib/permissions';
import { apiFetch } from '@/lib/api-client';
import { TimeIcon, ChatIcon, LoadingIcon } from '@/lib/icons';
import { STAGE_CHIP_CLASS, DEFAULT_LEAD_STAGES, type LeadStage } from '@/lib/leads/stages';
import {
  quickFollowUpPresets, formatShortThaiDate, followUpLabel, waitingDays, FOLLOW_UP_HOUR,
} from '@/lib/leads/followup-presets';

interface QueueItem {
  lead_id: string;
  contact_id: string | null;
  platform: string | null;
  display_name: string;
  picture_url: string | null;
  stage: string;
  follow_up_at: string;
  follow_up_note: string | null;
  assigned_name: string | null;
  quote_sent_at: string | null;
  reminded_count: number;
}

type Groups = { overdue: QueueItem[]; today: QueueItem[]; upcoming: QueueItem[] };

interface LeadStats {
  days: number;
  byStage: { key: string; name: string; color: LeadStage['color']; is_open: boolean; count: number }[];
  openTotal: number;
  won: number;
  lost: number;
  closeRate: number | null;
  avgDaysToWin: number | null;
  resolvedCases: number;
}

const ASSIGNED_CHIPS = [
  { id: 'all', label: 'ทั้งหมด', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
  { id: 'me', label: 'ของฉัน', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
  { id: 'unassigned', label: 'ยังไม่มีคนรับ', activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
];

export default function FollowUpsPage() {
  const { loading: authLoading, allowed: canView } = useAuthGuard('chat.view', { noRedirect: true });
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [groups, setGroups] = useState<Groups>({ overdue: [], today: [], upcoming: [] });
  const [stages, setStages] = useState<LeadStage[]>(DEFAULT_LEAD_STAGES);
  const [assigned, setAssigned] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busyLead, setBusyLead] = useState<string | null>(null);
  const [stats, setStats] = useState<LeadStats | null>(null);

  const canEdit = can(userProfile, 'chat.reply');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, statsRes] = await Promise.all([
        apiFetch(`/api/leads/queue?assigned=${assigned}`),
        apiFetch('/api/leads/stats?days=30'),
      ]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดคิวติดตามไม่สำเร็จ');
      setGroups(data.groups);
      if (Array.isArray(data.stages) && data.stages.length > 0) setStages(data.stages);
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'โหลดคิวติดตามไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [assigned, showToast]);

  useEffect(() => { if (!authLoading && canView) load(); }, [authLoading, canView, load]);

  const patchLead = async (item: QueueItem, body: Record<string, unknown>, message: string) => {
    if (!item.contact_id || !item.platform) return;
    setBusyLead(item.lead_id);
    try {
      const res = await apiFetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: item.contact_id, platform: item.platform, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      showToast(message);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setBusyLead(null);
    }
  };

  if (authLoading) return <Layout><LoadingCard /></Layout>;
  if (!canView) return <Layout><Container size="5xl"><NoPermissionCard /></Container></Layout>;

  const total = groups.overdue.length + groups.today.length + groups.upcoming.length;

  const renderItem = (item: QueueItem) => {
    const stage = stages.find(s => s.key === item.stage);
    const due = followUpLabel(item.follow_up_at);
    const waiting = item.stage === 'quoted' ? waitingDays(item.quote_sent_at) : null;
    const busy = busyLead === item.lead_id;

    return (
      <div key={item.lead_id} className="border-t border-gray-100 dark:border-slate-700 px-4 py-3 first:border-t-0">
        <div className="flex items-start gap-3">
          <button
            onClick={() => item.contact_id && router.push(`/chat?contact=${item.contact_id}&platform=${item.platform}`)}
            className="flex-shrink-0"
            aria-label={`เปิดห้องแชทของ ${item.display_name}`}
          >
            {item.picture_url ? (
              <Image src={item.picture_url} alt="" width={40} height={40} unoptimized className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <span className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center text-gray-500">
                <ChatIcon className="w-5 h-5" />
              </span>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => item.contact_id && router.push(`/chat?contact=${item.contact_id}&platform=${item.platform}`)}
                className="font-medium text-gray-900 dark:text-white truncate hover:underline"
              >
                {item.display_name}
              </button>
              {stage && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STAGE_CHIP_CLASS[stage.color]}`}>{stage.name}</span>
              )}
              {waiting !== null && (
                <Badge tone={waiting >= 2 ? 'red' : 'amber'} size="sm">รอโอน {waiting} วัน</Badge>
              )}
              {item.assigned_name ? (
                <Badge tone="gray" size="sm">{item.assigned_name}</Badge>
              ) : (
                <Badge tone="gray" size="sm">ยังไม่มีคนรับ</Badge>
              )}
            </div>

            <div className="text-sm text-gray-500 dark:text-slate-400 mt-0.5 truncate">
              {item.follow_up_note || 'ไม่มีโน้ต'}
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-xs flex items-center gap-1 ${due?.overdue ? 'text-red-600' : 'text-amber-600'}`}>
                <TimeIcon className="w-3.5 h-3.5" />
                {due?.text} · {formatShortThaiDate(item.follow_up_at)} {FOLLOW_UP_HOUR}:00 น.
              </span>

              {canEdit && (
                <>
                  {quickFollowUpPresets().map(p => (
                    <button
                      key={p.key}
                      disabled={busy}
                      onClick={() => patchLead(item, { follow_up_at: p.date.toISOString() }, `เลื่อนไป ${formatShortThaiDate(p.date)}`)}
                      className="text-xs rounded-full border border-gray-200 dark:border-slate-600 px-2.5 py-1 hover:border-primary disabled:opacity-50 text-gray-600 dark:text-slate-300"
                    >
                      เลื่อน {p.label}
                    </button>
                  ))}
                  <button
                    disabled={busy}
                    onClick={() => patchLead(item, { follow_up_at: null }, 'ปิดนัดแล้ว')}
                    className="text-xs rounded-full border border-gray-200 dark:border-slate-600 px-2.5 py-1 hover:border-primary disabled:opacity-50 text-gray-600 dark:text-slate-300"
                  >
                    ทักแล้ว ปิดนัด
                  </button>
                  {busy && <LoadingIcon className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const section = (title: string, items: QueueItem[], tone: string) => {
    if (items.length === 0) return null;
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm mb-4 overflow-hidden">
        <div className={`px-4 py-2.5 text-sm font-semibold flex items-center gap-2 ${tone}`}>
          {title} · {items.length}
        </div>
        {items.map(renderItem)}
      </div>
    );
  };

  return (
    <Layout>
      <Container size="5xl">
        <PageHeader
          icon={<TimeIcon />}
          title="คิวติดตาม"
          subtitle="คนที่ถึงกำหนดต้องทักอีกครั้ง — เรียงตามวันนัด ข้ามทุกช่องทาง"
        />

        <div className="data-filter-card">
          <FilterChips
            chips={ASSIGNED_CHIPS}
            value={assigned}
            onChange={setAssigned}
          />
        </div>

        {/* สรุป 30 วัน — ตัวเลขที่บอกว่ากรวยขายเดินอยู่ไหม ไม่ใช่แค่ "วันนี้ต้องทักใคร" */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-4 py-3">
              <div className="text-xs text-gray-500 dark:text-slate-400">กำลังตามอยู่</div>
              <div className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{stats.openTotal}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-4 py-3">
              <div className="text-xs text-gray-500 dark:text-slate-400">ปิดการขาย 30 วัน</div>
              <div className="text-2xl font-bold tabular-nums text-green-600">{stats.won}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-4 py-3">
              <div className="text-xs text-gray-500 dark:text-slate-400">อัตราปิดการขาย</div>
              <div className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                {stats.closeRate === null ? '—' : `${stats.closeRate}%`}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-4 py-3">
              <div className="text-xs text-gray-500 dark:text-slate-400">ทักแรกถึงซื้อเฉลี่ย</div>
              <div className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                {stats.avgDaysToWin === null ? '—' : `${stats.avgDaysToWin} วัน`}
              </div>
            </div>
          </div>
        )}

        {/* คนค้างอยู่ขั้นไหนบ้างตอนนี้ */}
        {stats && stats.byStage.some(s => s.count > 0) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {stats.byStage.filter(s => s.count > 0).map(s => (
              <span key={s.key} className={`text-sm font-medium px-2.5 py-1 rounded ${STAGE_CHIP_CLASS[s.color]}`}>
                {s.name} · {s.count}
              </span>
            ))}
          </div>
        )}

        {loading ? (
          <LoadingCard />
        ) : total === 0 ? (
          <EmptyCard
            icon={<TimeIcon className="w-12 h-12" />}
            title="ยังไม่มีใครถึงกำหนดทัก"
            subtitle="ตั้งนัดได้จากแผ่นติดตามในห้องแชท (แตะรูปโปรไฟล์)"
          />
        ) : (
          <>
            {section('เลยกำหนด', groups.overdue, 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300')}
            {section('วันนี้', groups.today, 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300')}
            {section('30 วันข้างหน้า', groups.upcoming, 'bg-gray-50 text-gray-600 dark:bg-slate-700/50 dark:text-slate-300')}
          </>
        )}
      </Container>
    </Layout>
  );
}
