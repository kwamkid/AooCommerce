'use client';

// Superadmin API Monitor — สุขภาพ integration Shopee / TikTok / Lazada ข้ามทุกบริษัท
// ข้อมูลทั้งหมดมาจาก RPC get_api_monitor_stats ผ่าน /api/superadmin/api-monitor (call เดียว)

import { useState, useEffect, useCallback } from 'react';
import SuperAdminLayout from '../components/SuperAdminLayout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { LoadingCard } from '@/components/ui/StateCard';
import { formatThaiDateTime } from '@/lib/utils/format';
import {
  RefreshCw, ShieldAlert, ShieldCheck, Zap, Radio, AlertTriangle, Store,
} from 'lucide-react';

interface DailyRow { day: string; integration: string; success: number; error: number }
interface Heartbeat { integration: string; status: string; error_message: string | null; created_at: string }
interface WebhookLast { platform: string; last_at: string }
interface Webhook24h { platform: string; processing_status: string; n: number }
interface DeadLetter { id: string; platform: string; shop_id: number; push_label: string | null; processing_error: string | null; retry_count: number; created_at: string }
interface ProblemAccount { id: string; platform: string; shop_id: number; shop_name: string | null; is_active: boolean; refresh_token_expires_at: string | null; company_name: string | null }
interface WatchdogIssue {
  code: string;
  scope: 'system' | 'company';
  companyId: string | null;
  companyName: string | null;
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
  url: string;
}
interface MonitorData {
  daily: DailyRow[];
  heartbeats: Heartbeat[];
  webhook_last: WebhookLast[];
  webhook_24h: Webhook24h[];
  dead_letters: DeadLetter[];
  retry_queue: number;
  accounts: ProblemAccount[];
  breakers: Record<string, { until?: string }>;
  issues: WatchdogIssue[];
  /** ตัวเฝ้าตรวจรอบล่าสุดเมื่อไหร่ — ค่านี้ค้าง = ตัวเฝ้าตาย ให้ไปดู cron ที่ cron-job.org */
  watchdog_last_run: string | null;
  generated_at: string;
}

const PLATFORMS = ['shopee', 'tiktok', 'lazada'] as const;
type Platform = typeof PLATFORMS[number];

const PLATFORM_LABEL: Record<Platform, string> = { shopee: 'Shopee', tiktok: 'TikTok', lazada: 'Lazada' };

function bangkokDateKey(offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

function minutesAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

function agoLabel(iso: string): string {
  const m = minutesAgo(iso);
  if (m < 1) return 'เมื่อครู่';
  if (m < 60) return `${m} นาทีที่แล้ว`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} ชม. ${m % 60} นาทีที่แล้ว`;
  return formatThaiDateTime(iso);
}

const statCard = 'bg-slate-900 border border-slate-700/50 rounded-xl p-4';

export default function ApiMonitorPage() {
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [platform, setPlatform] = useState<Platform>('shopee');

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await apiFetch('/api/superadmin/api-monitor?days=14');
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('monitor fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchData(true);
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleResetBreaker = async (p: Platform) => {
    const ok = await confirm({
      title: `ปลด circuit breaker ${PLATFORM_LABEL[p]}?`,
      description: `ระบบจะกลับไปยิง ${PLATFORM_LABEL[p]} API ทันที — ทำเฉพาะเมื่อแน่ใจว่า quota/rate limit ฟื้นแล้ว ไม่งั้น success rate จะยิ่งตก`,
      variant: 'danger',
      confirmLabel: 'ปลด breaker',
    });
    if (!ok) return;
    setResetting(true);
    try {
      const res = await apiFetch('/api/superadmin/api-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_breaker', platform: p }),
      });
      if (res.ok) {
        showToast('ปลด circuit breaker แล้ว', 'success');
        fetchData();
      } else {
        showToast('ปลดไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setResetting(false);
    }
  };

  // ---------- derived ----------
  const todayKey = bangkokDateKey();
  const dailyFor = (p: Platform) => (data?.daily || []).filter(d => d.integration === p);
  const todayRow = dailyFor(platform).find(d => d.day === todayKey);
  const todayTotal = (todayRow?.success || 0) + (todayRow?.error || 0);
  const todayRate = todayTotal > 0 ? Math.round(((todayRow?.success || 0) / todayTotal) * 1000) / 10 : null;

  // scaffold 14 วันเต็ม (ใหม่ → เก่า) เพื่อให้เห็นวันที่เงียบด้วย
  const days14 = Array.from({ length: 14 }, (_, i) => bangkokDateKey(i));
  const series = days14.map(day => {
    const row = dailyFor(platform).find(d => d.day === day);
    const total = row ? row.success + row.error : 0;
    return { day, success: row?.success || 0, error: row?.error || 0, total, rate: total > 0 ? (row!.success / total) * 100 : null };
  });

  const wh24 = (data?.webhook_24h || []).filter(w => w.platform === platform);
  const whCount = (st: string) => wh24.find(w => w.processing_status === st)?.n || 0;
  const whLast = (data?.webhook_last || []).find(w => w.platform === platform);
  const heartbeat = (data?.heartbeats || []).find(h => h.integration === platform);
  // breaker ทุก platform ที่เปิดอยู่ (โชว์ banner เฉพาะที่ยังไม่หมดเวลา)
  const activeBreakers = Object.entries(data?.breakers || {})
    .filter(([, v]) => v?.until && new Date(v.until).getTime() > Date.now()) as [Platform, { until: string }][];
  const breakerActive = activeBreakers.some(([p]) => p === platform);
  const deadForPlatform = (data?.dead_letters || []).filter(d => d.platform === platform);

  const rateColor = (rate: number | null) =>
    rate === null ? 'text-slate-500' : rate >= 90 ? 'text-emerald-400' : rate >= 70 ? 'text-amber-400' : 'text-red-400';

  const heartbeatTone = (() => {
    if (!heartbeat) return { cls: 'text-slate-500', label: 'ไม่มีข้อมูล 7 วัน' };
    const m = minutesAgo(heartbeat.created_at);
    if (breakerActive) return { cls: 'text-amber-400', label: 'หยุดชั่วคราว (circuit breaker)' };
    if (m <= 30) return { cls: 'text-emerald-400', label: 'ปกติ' };
    if (m <= 60) return { cls: 'text-amber-400', label: 'ช้ากว่ารอบ' };
    return { cls: 'text-red-400', label: 'เงียบผิดปกติ' };
  })();

  return (
    <SuperAdminLayout title="API Monitor" subtitle="สุขภาพ integration Shopee / TikTok / Lazada ทุกบริษัท">
      {loading ? (
        <LoadingCard />
      ) : (
        <div className="space-y-5 max-w-6xl">
          {/* สิ่งที่ต้องดูตอนนี้ — ชุดเดียวกับที่ตัวเฝ้าใช้เด้งแจ้งเตือน (lib/marketplace/watchdog.ts)
              อยู่บนสุดเพราะเปิดหน้านี้มาต้องเห็นก่อนอย่างอื่น */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-700/50">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> สิ่งที่ต้องดูตอนนี้
              </h2>
              <span className="text-xs text-slate-500">
                {data?.watchdog_last_run
                  ? `ตัวเฝ้าตรวจล่าสุด ${agoLabel(data.watchdog_last_run)}`
                  : 'ตัวเฝ้ายังไม่เคยทำงาน — ตรวจ cron watchdog'}
              </span>
            </div>
            {(data?.issues || []).length === 0 ? (
              <p className="px-4 py-3 text-sm text-emerald-400/90 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> ไม่มีเรื่องค้าง — ทุกร้านซิงค์ตามปกติ
              </p>
            ) : (
              <ul className="divide-y divide-slate-700/50">
                {(data?.issues || []).map(issue => (
                  <li key={issue.code} className="px-4 py-3 flex items-start gap-3">
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        issue.severity === 'critical' ? 'bg-red-500' : 'bg-amber-400'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">{issue.title}</p>
                      <p className="text-sm text-slate-400">{issue.detail}</p>
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0 text-right">
                      {issue.companyName || 'ทั้งระบบ'}
                      <br />
                      {issue.scope === 'system' ? 'แจ้ง superadmin' : 'แจ้งเจ้าของร้าน'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Circuit breaker banners — หนึ่งแถวต่อ platform ที่โดนพัก */}
          {activeBreakers.length > 0 ? (
            activeBreakers.map(([p, v]) => (
              <div key={p} className="flex flex-wrap items-center gap-3 bg-red-950/40 border border-red-800/60 rounded-xl px-4 py-3">
                <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0 text-sm">
                  <span className="text-red-300 font-semibold">พักการยิง {PLATFORM_LABEL[p] || p} API ชั่วคราว</span>
                  <span className="text-red-400/80"> — quota/rate limit หมด หยุดยิงจนถึง {formatThaiDateTime(v.until)} (cron/retry เก็บตกเองหลังกลับมา)</span>
                </div>
                <button
                  onClick={() => handleResetBreaker(p)}
                  disabled={resetting}
                  className="px-3 py-1.5 text-sm font-medium text-red-300 border border-red-700 rounded-lg hover:bg-red-900/40 disabled:opacity-50"
                >
                  {resetting ? 'กำลังปลด...' : 'ปลดก่อนเวลา'}
                </button>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-400/90 bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-2.5">
              <ShieldCheck className="w-4 h-4" /> Circuit breaker ปิดทุก platform — ระบบยิง API ปกติ
            </div>
          )}

          {/* Platform tabs + refresh */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2">
              {PLATFORMS.map(p => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    platform === p
                      ? 'bg-violet-500/20 text-violet-300 border-violet-500/50'
                      : 'text-slate-400 border-slate-700/60 hover:bg-slate-800'
                  }`}
                >
                  {PLATFORM_LABEL[p]}
                </button>
              ))}
            </div>
            <button
              onClick={() => fetchData()}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 border border-slate-700/60 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> รีเฟรช
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={statCard}>
              <p className="text-xs text-slate-400 mb-1">Success rate วันนี้</p>
              <p className={`text-2xl font-bold ${rateColor(todayRate)}`}>{todayRate === null ? '—' : `${todayRate}%`}</p>
              <p className="text-xs text-slate-500 mt-1">{todayRow ? `${todayRow.success} สำเร็จ / ${todayRow.error} error` : 'ยังไม่มี call วันนี้'}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Radio className="w-3 h-3" /> Cron ล่าสุด (sync-all)</p>
              <p className={`text-lg font-bold ${heartbeatTone.cls}`}>{heartbeat ? agoLabel(heartbeat.created_at) : '—'}</p>
              <p className={`text-xs mt-1 ${heartbeatTone.cls}`}>{heartbeatTone.label}{heartbeat?.status === 'error' && !breakerActive ? ' · รอบล่าสุดมี error' : ''}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> Webhook 24 ชม.</p>
              <p className="text-lg font-bold text-white">
                <span className="text-emerald-400">{whCount('processed')}</span>
                <span className="text-slate-500 text-sm font-normal"> ok · </span>
                <span className={whCount('failed') > 0 ? 'text-amber-400' : 'text-slate-500'}>{whCount('failed')}</span>
                <span className="text-slate-500 text-sm font-normal"> fail</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">รับล่าสุด {whLast ? agoLabel(whLast.last_at) : '—'}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs text-slate-400 mb-1">คิว retry / dead letter</p>
              <p className="text-lg font-bold text-white">
                <span className={data!.retry_queue > 0 ? 'text-amber-400' : 'text-slate-400'}>{data!.retry_queue}</span>
                <span className="text-slate-500 text-sm font-normal"> รอ retry · </span>
                <span className={deadForPlatform.length > 0 ? 'text-red-400' : 'text-slate-400'}>{deadForPlatform.length}</span>
                <span className="text-slate-500 text-sm font-normal"> dead</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">7 วันล่าสุด (ทุก platform สำหรับคิว retry)</p>
            </div>
          </div>

          {/* Daily success rate — 14 days */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Success rate รายวัน — {PLATFORM_LABEL[platform]} (14 วัน · เขต Shopee ลงโทษเมื่อ 7 วันเฉลี่ย &lt;90%)</h3>
            <div className="space-y-1.5">
              {series.map(s => (
                <div key={s.day} className="flex items-center gap-3 text-xs">
                  <span className="w-20 text-slate-400 font-mono flex-shrink-0">{s.day.slice(5)}</span>
                  <div className="flex-1 h-4 bg-slate-800 rounded overflow-hidden flex">
                    {s.total > 0 && (
                      <>
                        <div className="h-full bg-emerald-500/70" style={{ width: `${(s.success / Math.max(...series.map(x => x.total), 1)) * 100}%` }} />
                        <div className="h-full bg-red-500/70" style={{ width: `${(s.error / Math.max(...series.map(x => x.total), 1)) * 100}%` }} />
                      </>
                    )}
                  </div>
                  <span className={`w-14 text-right font-mono ${rateColor(s.rate)}`}>{s.rate === null ? '—' : `${Math.round(s.rate * 10) / 10}%`}</span>
                  <span className="w-20 text-right text-slate-500 font-mono">{s.total > 0 ? `${s.total} calls` : ''}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Problem shops */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Store className="w-4 h-4 text-slate-400" /> ร้านที่มีปัญหา (ทุก platform ทุกบริษัท)
            </h3>
            {(data!.accounts || []).length === 0 ? (
              <p className="text-sm text-slate-500">ไม่มี — token ทุกร้านปกติ</p>
            ) : (
              <div className="space-y-2">
                {data!.accounts.map(a => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm border-b border-slate-800 pb-2 last:border-0 last:pb-0">
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 uppercase">{a.platform}</span>
                    <span className="text-white font-medium">{a.shop_name || `#${a.shop_id}`}</span>
                    <span className="text-slate-500 text-xs">{a.company_name || '—'}</span>
                    <span className={`ml-auto text-xs ${a.is_active ? 'text-amber-400' : 'text-red-400'}`}>
                      {a.is_active
                        ? `refresh token หมดใน ${a.refresh_token_expires_at ? Math.max(0, Math.floor((new Date(a.refresh_token_expires_at).getTime() - Date.now()) / 86400_000)) : '?'} วัน`
                        : 'ถูกปิดใช้งาน (ต้อง reconnect)'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dead letters */}
          {deadForPlatform.length > 0 && (
            <div className="bg-slate-900 border border-red-900/40 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-red-300 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Dead letters ล่าสุด — {PLATFORM_LABEL[platform]} (retry ครบแล้วยัง fail ต้อง sync มือ)
              </h3>
              <div className="space-y-2">
                {deadForPlatform.map(d => (
                  <div key={d.id} className="text-xs text-slate-400 border-b border-slate-800 pb-2 last:border-0 last:pb-0">
                    <span className="text-slate-300">{d.push_label || 'webhook'}</span>
                    <span className="text-slate-600"> · shop {d.shop_id} · {formatThaiDateTime(d.created_at)} · retry {d.retry_count} ครั้ง</span>
                    {d.processing_error && <p className="text-red-400/80 mt-0.5 truncate">{d.processing_error}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-600">
            อัพเดทอัตโนมัติทุก 60 วินาที (หยุดเมื่อแท็บไม่ active) · ข้อมูล ณ {formatThaiDateTime(data!.generated_at)}
          </p>
        </div>
      )}
      {confirmDialog}
    </SuperAdminLayout>
  );
}
