// Path: app/marketing/audiences/components/MetaSyncRows.tsx
//
// บล็อก "Meta" ในแผงขวา — กลุ่มนี้ขึ้นไปอยู่ในบัญชีโฆษณาไหนแล้วบ้าง และสั่ง sync ได้จากที่นี่
//
// หนึ่งแถว = หนึ่งบัญชีโฆษณาที่เชื่อมไว้ (ไม่ใช่หนึ่ง sync) — บัญชีที่ยังไม่เคยผูกกับกลุ่มนี้
// ก็ต้องเห็น พร้อมปุ่มที่กดแล้วผูกให้เลย ไม่ต้องไปหาเมนู "เพิ่ม" ที่อื่น
//
// โหมดสร้าง (ยังไม่มีกลุ่ม) = บอกว่ากลุ่มจะขึ้นบัญชีไหนทันทีที่สร้าง — ฟอร์มผูก+sync ให้ทุกบัญชีที่พร้อม
// เสมอ ไม่มีตัวเลือกปิด (เจ้าของ 11 ก.ย. 2026 · เดิมขึ้น "บันทึกกลุ่มก่อน แล้วเปิด sync ได้ที่นี่" ซึ่งอ่านไม่รู้เรื่อง)
//
// ⚠️ **token ที่ยิง Purchase ได้ ไม่ได้แปลว่าจัดการกลุ่มเป้าหมายได้** — บัญชีที่ยังไม่มี
// `audiences_ok_at` ต้องขึ้นเป็นแถวที่กดไม่ได้พร้อมบอกว่าต้องทำอะไร ไม่ใช่ปล่อยให้กดแล้ว
// ไปเจอ error ดิบของ Meta
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Toggle from '@/components/ui/Toggle';
import Tooltip from '@/components/ui/Tooltip';
import ChannelBadge from '@/components/ui/ChannelBadge';
import { EmptyCard } from '@/components/ui/StateCard';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { formatNumber, formatThaiDateTime } from '@/lib/utils/format';
import { customAudienceTosUrl, type AdAccountView } from '@/lib/ads/meta-ui';
import { ExternalLink, Loader2, Megaphone, RefreshCw, Settings } from 'lucide-react';
import type { AudienceSyncView, AudienceView } from './types';

/** ถี่พอให้รู้สึกว่าเดินอยู่ แต่ไม่ถี่จนยิงทิ้งทั้งวัน (เท่ากับหน้ารายการบรอดแคสต์) */
const POLL_MS = 4000;
/** เผื่อกลุ่มใหญ่ — เกินนี้ถือว่าเลิกเฝ้า (สถานะจริงยังอ่านได้จากการกดรีเฟรชหน้า) */
const POLL_MAX = 90;

type Tone = 'emerald' | 'amber' | 'red' | 'gray';

interface StatusLook { tone: Tone; label: string; spinning?: boolean }

function statusLook(sync: AudienceSyncView): StatusLook {
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

/** บัญชีนี้จัดการกลุ่มเป้าหมายได้ไหม — ไม่ได้ต้องบอกเหตุผลที่ลงมือแก้ได้ */
function notReadyReason(account: AdAccountView): string | null {
  if (account.status === 'token_expired') return 'การเชื่อมต่อหมดอายุ — เชื่อมบัญชีใหม่ก่อน';
  if (account.status === 'error') {
    return account.last_error || 'บัญชีนี้มีปัญหา — ตรวจที่หน้าบัญชีโฆษณาก่อน';
  }
  if (account.metadata?.tos_required) return 'ยังไม่ได้ยอมรับข้อกำหนด Custom Audience ของบัญชีนี้';
  if (!account.audiences_ok_at) {
    return account.metadata?.audiences_error
      || 'token นี้ยิงได้แค่ Purchase — ต้องใช้ token ที่มีสิทธิ์ ads_management';
  }
  return null;
}

interface Props {
  /** null = โหมดสร้าง (ยังไม่มีกลุ่มให้ผูก) */
  audienceId: string | null;
  syncs: AudienceSyncView[];
  adAccounts: AdAccountView[];
  adAccountsLoading: boolean;
  /** เห็นเมนู "บัญชีโฆษณา" ในตั้งค่าไหม — ไม่เห็นก็ไม่ต้องชี้ไปหน้าที่เข้าไม่ได้ */
  canManageAdAccounts: boolean;
  /** โหลดกลุ่มใหม่แล้วส่งขึ้นไปให้หน้าแม่ (สถานะ sync เปลี่ยน) */
  onAudienceChange: (a: AudienceView) => void;
  disabled?: boolean;
}

export default function MetaSyncRows({
  audienceId, syncs, adAccounts, adAccountsLoading, canManageAdAccounts, onAudienceChange, disabled,
}: Props) {
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  /** เฝ้าผลอยู่ไหม — ตั้งหลังสั่ง sync แล้วปิดเองเมื่อทุกใบนิ่ง (ไม่ poll ทิ้งไว้ตลอด) */
  // เปิดหน้ามาตอนยังวิ่งอยู่ (เพิ่งสร้างกลุ่ม) = เฝ้าต่อเลย ไม่งั้นป้าย "กำลัง sync…" ค้างจนกดรีเฟรช
  const [watching, setWatching] = useState(
    () => syncs.some(s => s.status === 'syncing' || s.status === 'pending'),
  );

  const reload = useCallback(async (): Promise<AudienceView | null> => {
    if (!audienceId) return null;
    try {
      const res = await apiFetch(`/api/audiences/${audienceId}`);
      if (!res.ok) return null;
      const a = (await res.json())?.audience as AudienceView | undefined;
      if (!a) return null;
      onAudienceChange(a);
      return a;
    } catch {
      return null;
    }
  }, [audienceId, onAudienceChange]);

  // เฝ้าจนกว่าทุกใบจะนิ่ง แล้วสรุปผลครั้งเดียว — ระหว่างนั้นแถวอัปเดตตามของจริงทุกรอบ
  const ticksRef = useRef(0);
  useEffect(() => {
    if (!watching || !audienceId) return;
    ticksRef.current = 0;
    const timer = setInterval(async () => {
      ticksRef.current += 1;
      const a = await reload();
      const rows = a?.syncs || [];
      const running = rows.some(s => s.status === 'syncing' || s.status === 'pending');
      if (!running || ticksRef.current >= POLL_MAX) {
        setWatching(false);
        if (!running) {
          const failed = rows.find(s => s.status === 'error');
          if (failed) {
            showToast(failed.error || 'sync ไม่สำเร็จ', 'error');
          } else {
            const uploaded = rows.reduce((n, s) => n + (s.last_counts?.uploaded ?? 0), 0);
            const removed = rows.reduce((n, s) => n + (s.last_counts?.removed ?? 0), 0);
            showToast(`sync เสร็จ: อัปโหลด ${formatNumber(uploaded)} · เอาออก ${formatNumber(removed)}`, 'success');
          }
        }
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [watching, audienceId, reload, showToast]);

  /** ปุ่ม "sync ตอนนี้" — ยังไม่ผูก = ผูกให้ก่อน (ผูกแล้วเซิร์ฟเวอร์เริ่ม sync ให้เอง) */
  const handleSync = async (account: AdAccountView, sync: AudienceSyncView | undefined) => {
    if (!audienceId) return;
    setBusyId(account.id);
    try {
      const res = sync
        ? await apiFetch(`/api/audiences/${audienceId}/sync`, { method: 'POST' })
        : await apiFetch(`/api/audiences/${audienceId}/syncs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ad_account_id: account.id, auto_sync: true }),
          });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // กำลังทำอยู่แล้วไม่ใช่ความผิดพลาด — เฝ้าผลต่อได้เลย
        if (err.code === 'already_syncing') {
          setWatching(true);
          showToast('กำลัง sync อยู่แล้ว — รอรอบนี้จบก่อน', 'success');
          return;
        }
        throw new Error(err.error || 'failed');
      }
      showToast('เริ่ม sync แล้ว', 'success');
      await reload();
      setWatching(true);
    } catch (e) {
      showToast(e instanceof Error && e.message !== 'failed' ? e.message : 'sync ไม่สำเร็จ', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleAutoSync = async (sync: AudienceSyncView, value: boolean) => {
    if (!audienceId) return;
    setBusyId(sync.ad_account_id);
    try {
      const res = await apiFetch(`/api/audiences/${audienceId}/syncs/${sync.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_sync: value }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'failed');
      }
      await reload();
    } catch (e) {
      showToast(e instanceof Error && e.message !== 'failed' ? e.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="heading-4">Meta</h2>
        {canManageAdAccounts && adAccounts.length > 0 && (
          <Link href="/settings/ad-accounts" className="subtitle-text text-primary hover:underline">
            บัญชีโฆษณา
          </Link>
        )}
      </div>

      {adAccountsLoading ? (
        <p className="subtitle-text">กำลังโหลดบัญชีโฆษณา...</p>
      ) : adAccounts.length === 0 ? (
        <EmptyCard
          icon={<Megaphone className="w-8 h-8 text-gray-300 dark:text-slate-600" />}
          title="ยังไม่ได้เชื่อมบัญชีโฆษณา"
          subtitle={audienceId
            ? 'กลุ่มเป้าหมายใช้ยิงโฆษณาผ่าน Meta · เชื่อมบัญชีโฆษณาแล้วกด sync ที่นี่'
            : 'กลุ่มเป้าหมายใช้ยิงโฆษณาผ่าน Meta · เชื่อมบัญชีก่อน แล้วกลุ่มจะขึ้น Meta ทันทีที่สร้าง'}
          actions={canManageAdAccounts ? (
            <Link href="/settings/ad-accounts">
              <Button variant="secondary" size="sm">เชื่อมบัญชีโฆษณา</Button>
            </Link>
          ) : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {adAccounts.map(account => {
            const sync = syncs.find(s => s.ad_account_id === account.id);
            const reason = notReadyReason(account);
            const look = sync ? statusLook(sync) : null;
            const busy = busyId === account.id;
            const approx = sync && sync.approx_size_lower != null && sync.approx_size_upper != null
              ? `~${formatNumber(sync.approx_size_lower)}–${formatNumber(sync.approx_size_upper)} ที่ Meta`
              : null;

            return (
              <li key={account.id} className={`space-y-1.5 ${reason ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <ChannelBadge channel={{ platform: 'facebook' }} size="sm" />
                  <span className="body-text truncate min-w-0 flex-1">
                    {account.name || account.external_id}
                  </span>
                  {look && (
                    <Badge
                      tone={look.tone}
                      size="sm"
                      icon={look.spinning ? <Loader2 className="w-3 h-3 animate-spin" /> : undefined}
                    >
                      {look.label}
                    </Badge>
                  )}
                </div>

                {sync?.status === 'error' && sync.error && (
                  <p className="subtitle-text text-red-600 dark:text-red-400 break-words">{sync.error}</p>
                )}

                {sync && (approx || sync.last_sync_at) && (
                  <p className="section-desc">
                    {[approx, sync.last_sync_at ? `sync ล่าสุด ${formatThaiDateTime(sync.last_sync_at)}` : null]
                      .filter(Boolean).join(' · ')}
                  </p>
                )}

                {reason ? (
                  <div className="space-y-1">
                    <p className="subtitle-text">{reason}</p>
                    {account.metadata?.tos_required ? (
                      <a
                        href={customAudienceTosUrl(account.external_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="subtitle-text text-primary hover:underline inline-flex items-center gap-1"
                      >
                        ยอมรับข้อกำหนดที่ Meta
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : canManageAdAccounts ? (
                      <Link
                        href="/settings/ad-accounts"
                        className="subtitle-text text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        ตั้งค่า &gt; บัญชีโฆษณา
                      </Link>
                    ) : null}
                  </div>
                ) : !audienceId ? (
                  <p className="subtitle-text">sync ทันทีที่สร้างกลุ่ม แล้วอัปเดตให้เองทุกวัน</p>
                ) : (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {sync ? (
                      <span className="flex items-center gap-2">
                        <Toggle
                          checked={sync.auto_sync}
                          onChange={v => handleAutoSync(sync, v)}
                          disabled={disabled || busy}
                          aria-label="sync อัตโนมัติทุกวัน"
                        />
                        <span className="subtitle-text">sync อัตโนมัติทุกวัน</span>
                      </span>
                    ) : (
                      <span className="subtitle-text">ยังไม่ได้ผูกกับกลุ่มนี้</span>
                    )}
                    <Tooltip
                      text={sync ? 'อัปรายชื่อรอบใหม่ขึ้น Meta ทันที' : 'ผูกกลุ่มนี้กับบัญชีโฆษณาแล้วเริ่ม sync'}
                      box="inline-flex"
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />}
                        disabled={disabled || busy || sync?.status === 'syncing'}
                        onClick={() => handleSync(account, sync)}
                      >
                        sync ตอนนี้
                      </Button>
                    </Tooltip>
                  </div>
                )}
              </li>
            );
          })}
          {/* ขึ้นไปแล้วต้องบอกด้วยว่าไปหยิบใช้ตรงไหน — ไม่งั้น sync สำเร็จแล้วจบตรงนั้น */}
          {syncs.some(s => s.status === 'synced') && (
            <li className="section-desc pt-1">
              กลุ่มนี้อยู่ใน Ads Manager › Audiences ชื่อเดียวกับกลุ่ม — เลือกเป็นกลุ่มเป้าหมาย
              กันออก หรือทำ Lookalike ได้ตอนตั้งค่า Ad set
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
