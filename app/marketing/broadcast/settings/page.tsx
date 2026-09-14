// Path: app/marketing/broadcast/settings/page.tsx
//
// ตั้งค่าบรอดแคสต์ราย **เพจ Facebook** — ตั้งเสร็จเพจถึงจะโผล่ให้เลือกในหน้าสร้างบรอดแคสต์
//
// ทำไมต้องตั้งค่าก่อน: ข้อความการตลาดบน Messenger **ส่งผ่านบัญชีโฆษณาและคิดเงินต่อข้อความ**
// (คนละท่อกับแชทปกติที่ฟรีในกรอบ 24 ชม.) เพจที่ยังไม่ผูกบัญชีโฆษณา/ยังไม่ตั้งงบจึงส่งไม่ได้
// — กติกาความพร้อมอยู่ที่ `isBroadcastReadyFromCredentials()` ที่เดียว ทั้งหน้านี้ หน้าเลือก
// ช่องทาง และ API ตอนส่งจริงอ่านตัวเดียวกัน
'use client';

import { useState, useCallback } from 'react';
import { Megaphone, Users, Info } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import FormSelect from '@/components/ui/FormSelect';
import NumberInput from '@/components/ui/NumberInput';
import ChannelBadge from '@/components/ui/ChannelBadge';
import HelpHint from '@/components/ui/HelpHint';
import { LoadingCard, NoPermissionCard, EmptyCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useToast } from '@/lib/toast-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch, invalidateApiCache } from '@/lib/api-client';
import { formatPrice, formatThaiDateTime } from '@/lib/utils/format';
import { BROADCAST_PLATFORMS, BROADCAST_SETUP_KEYS } from '@/lib/broadcast/platforms';

/** งบที่ Meta ยอมรับต่ำสุดเท่าที่ยิงจริงแล้วผ่าน — 1 บาทถูกปฏิเสธ (Invalid parameter) */
const MIN_BUDGET_BAHT = 35;
const DEFAULT_BUDGET_BAHT = 100;
/** ราคาต่อข้อความยังไม่รู้ค่าจริง (ยังไม่มี spend กลับมาจาก Meta) — ใช้ประมาณไว้คำนวณงบก่อน */
const ASSUMED_COST_PER_MESSAGE = 2;

/** ค่าที่ผู้ใช้กำลังแก้ของเพจหนึ่ง (ยังไม่บันทึก) */
interface PageDraft {
  adAccountId: string;
  budgetBaht: number;
  /** การ์ดชวนรับข่าวสาร — แอดมินกดส่งเองจากห้องแชท (ได้เฉพาะในกรอบ 24 ชม.) */
  optinTitle: string;
  optinImage: string;
  optinFrequency: string;
}

const EMPTY_DRAFT: PageDraft = {
  adAccountId: '',
  budgetBaht: DEFAULT_BUDGET_BAHT,
  optinTitle: '',
  optinImage: '',
  optinFrequency: 'WEEKLY',
};

interface PageAccount {
  id: string;
  account_name: string;
  picture_url: string | null;
  platform: string;
  is_active: boolean;
  broadcast_ready?: boolean;
  credentials?: Record<string, unknown>;
}

interface AdAccountOption {
  id: string;
  external_id: string;
  name: string | null;
  status: string;
}

interface SubscriberInfo {
  total: number;
  eligible_now: number;
  next_eligible_at: string | null;
}

export default function BroadcastSettingsPage() {
  const { allowed, loading: permLoading } = useAuthGuard('chat.broadcast', { noRedirect: true });
  const { showToast } = useToast();

  const [pages, setPages] = useState<PageAccount[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  /** ค่าที่ผู้ใช้กำลังแก้ต่อเพจ (ยังไม่บันทึก) */
  const [draft, setDraft] = useState<Record<string, PageDraft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [subs, setSubs] = useState<Record<string, SubscriberInfo | 'loading' | 'error'>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [chatRes, adRes] = await Promise.all([
        apiFetch('/api/chat-accounts'),
        apiFetch('/api/ads/accounts?lite=1'),
      ]);
      const chatData = chatRes.ok ? await chatRes.json() : { accounts: [] };
      const fbPages: PageAccount[] = (chatData.accounts || []).filter(
        (a: PageAccount) => a.platform === 'facebook' && a.is_active,
      );
      setPages(fbPages);

      const adData = adRes.ok ? await adRes.json() : null;
      const list: AdAccountOption[] = (adData?.accounts || adData || [])
        .filter((a: AdAccountOption) => a.external_id)
        .map((a: AdAccountOption) => ({ id: a.id, external_id: a.external_id, name: a.name, status: a.status }));
      setAdAccounts(list);

      // ตั้งค่าเดิมของแต่ละเพจเป็นค่าเริ่มต้นของฟอร์ม
      const next: Record<string, PageDraft> = {};
      for (const p of fbPages) {
        const c = p.credentials || {};
        const satang = Number(c[BROADCAST_SETUP_KEYS.dailyBudget] ?? 0);
        next[p.id] = {
          adAccountId: String(c[BROADCAST_SETUP_KEYS.adAccountId] ?? ''),
          budgetBaht: satang > 0 ? satang / 100 : DEFAULT_BUDGET_BAHT,
          optinTitle: String(c[BROADCAST_SETUP_KEYS.optinTitle] ?? ''),
          optinImage: String(c[BROADCAST_SETUP_KEYS.optinImage] ?? ''),
          optinFrequency: String(c[BROADCAST_SETUP_KEYS.optinFrequency] ?? 'WEEKLY'),
        };
      }
      setDraft(next);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useFetchOnce(load, allowed && !permLoading);

  /** ถาม Meta สดว่าเพจนี้มีผู้สมัครกี่คน — ไม่โหลดล่วงหน้าทุกเพจ เพราะยิง Graph ทีละใบ */
  const loadSubscribers = async (pageId: string) => {
    setSubs(s => ({ ...s, [pageId]: 'loading' }));
    try {
      const res = await apiFetch(`/api/broadcasts/messenger-subscribers?account_id=${pageId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubs(s => ({ ...s, [pageId]: 'error' }));
        showToast(typeof data.error === 'string' ? data.error : 'ถามรายชื่อผู้สมัครไม่สำเร็จ', 'error');
        return;
      }
      setSubs(s => ({ ...s, [pageId]: data as SubscriberInfo }));
    } catch {
      setSubs(s => ({ ...s, [pageId]: 'error' }));
    }
  };

  const save = async (page: PageAccount) => {
    const d = draft[page.id];
    if (!d?.adAccountId) { showToast('เลือกบัญชีโฆษณาก่อน', 'error'); return; }
    if (d.budgetBaht < MIN_BUDGET_BAHT) {
      showToast(`งบต่อวันต้องไม่ต่ำกว่า ${MIN_BUDGET_BAHT} บาท (Meta ปฏิเสธงบที่ต่ำกว่านี้)`, 'error');
      return;
    }
    setSaving(page.id);
    try {
      const res = await apiFetch('/api/chat-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: page.id,
          // PUT merge กับ credentials เดิมให้อยู่แล้ว — ส่งเฉพาะคีย์ที่เปลี่ยน token ของเพจไม่หาย
          credentials: {
            [BROADCAST_SETUP_KEYS.adAccountId]: d.adAccountId,
            [BROADCAST_SETUP_KEYS.dailyBudget]: Math.round(d.budgetBaht * 100),
            [BROADCAST_SETUP_KEYS.optinTitle]: d.optinTitle.trim().slice(0, 65),
            [BROADCAST_SETUP_KEYS.optinImage]: d.optinImage.trim(),
            [BROADCAST_SETUP_KEYS.optinFrequency]: d.optinFrequency,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(typeof data.error === 'string' ? data.error : 'บันทึกไม่สำเร็จ', 'error');
        return;
      }
      invalidateApiCache('/api/chat-accounts');
      showToast(`ตั้งค่า ${page.account_name} แล้ว — เลือกเพจนี้ในหน้าสร้างบรอดแคสต์ได้เลย`, 'success');
      await load();
    } catch {
      showToast('บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(null);
    }
  };

  if (permLoading || loading) {
    return <Layout><Container size="4xl"><LoadingCard /></Container></Layout>;
  }
  if (!allowed) {
    return <Layout><Container size="4xl"><NoPermissionCard /></Container></Layout>;
  }

  const info = BROADCAST_PLATFORMS.facebook;

  return (
    <Layout>
      <Container size="4xl">
        <PageHeader
          icon={<Megaphone />}
          title="ตั้งค่าบรอดแคสต์"
          subtitle="เพจ Facebook ต้องผูกบัญชีโฆษณาและตั้งงบก่อน จึงจะเลือกเป็นช่องทางบรอดแคสต์ได้"
          backHref="/marketing/broadcast"
        />

        <Alert tone="info" title="ข้อความการตลาดบน Messenger คิดเงินต่อข้อความ">
          ส่งถึง<strong>คนที่กดรับข่าวสาร</strong>ได้ตลอด ไม่ติดกรอบ 24 ชั่วโมงเหมือนแชทปกติ
          — แต่ส่งผ่านบัญชีโฆษณาและ Meta หักเงินตามจำนวนข้อความที่ถึงเครื่องลูกค้าจริง
          จึงต้องตั้งงบเป็นเพดานไว้ก่อน · ส่งได้ 1 ข้อความ ต่อคน ต่อ 12 ชั่วโมง
        </Alert>

        {adAccounts.length === 0 && (
          <Alert tone="warning" title="ยังไม่มีบัญชีโฆษณา">
            ต้องเชื่อมบัญชีโฆษณาที่ผูกบัตรแล้วก่อน — ไปที่ ตั้งค่า › บัญชีโฆษณา
          </Alert>
        )}

        {pages.length === 0 ? (
          <EmptyCard
            title="ยังไม่มีเพจ Facebook"
            subtitle="เชื่อมเพจที่ ตั้งค่า › ช่องทาง Chat ก่อน แล้วกลับมาตั้งค่าบรอดแคสต์ที่นี่"
          />
        ) : (
          <div className="space-y-4">
            {pages.map(page => {
              const d = draft[page.id] || EMPTY_DRAFT;
              const sub = subs[page.id];
              const subInfo = typeof sub === 'object' ? sub : null;
              // งบที่ "ควรตั้ง" คิดจากคนที่ส่งถึงได้จริง — ร้านคิดเป็นจำนวนคน ไม่ใช่ยอดเงิน
              const suggested = subInfo
                ? Math.max(MIN_BUDGET_BAHT, Math.ceil(subInfo.eligible_now * ASSUMED_COST_PER_MESSAGE * 1.5))
                : null;

              return (
                <Card key={page.id} padding="md">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <ChannelBadge channel={{ platform: 'facebook', picture_url: page.picture_url }} size="md" />
                      <div className="min-w-0">
                        <p className="heading-4 truncate">{page.account_name}</p>
                        <p className="subtitle-text">เพจ Facebook</p>
                      </div>
                    </div>
                    {page.broadcast_ready
                      ? <Badge tone="emerald" size="sm">พร้อมบรอดแคสต์</Badge>
                      : <Badge tone="amber" size="sm">ยังตั้งค่าไม่ครบ</Badge>}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="field-label block mb-1">บัญชีโฆษณาที่ใช้ส่ง</label>
                      <FormSelect
                        value={d.adAccountId}
                        onChange={v => setDraft(s => ({ ...s, [page.id]: { ...d, adAccountId: v } }))}
                        options={adAccounts.map(a => ({
                          id: a.external_id,
                          label: a.name || a.external_id,
                          subtitle: a.status === 'active' ? undefined : 'บัญชีมีปัญหา',
                          disabled: a.status !== 'active',
                        }))}
                        placeholder={adAccounts.length ? '-- เลือกบัญชีโฆษณา --' : 'ยังไม่มีบัญชีโฆษณา'}
                        disabled={adAccounts.length === 0}
                      />
                    </div>

                    <div>
                      <label className="field-label flex items-center gap-1 mb-1">
                        งบต่อวัน (บาท)
                        <HelpHint>
                          เป็น<strong>เพดาน</strong> ไม่ใช่ยอดที่ถูกหัก — Meta คิดเงินตามข้อความที่ส่งถึงจริงเท่านั้น
                          ตั้งสูงกว่าที่ใช้จริงไม่ได้เสียเงินเพิ่ม แต่ตั้งต่ำกว่า {MIN_BUDGET_BAHT} บาท Meta จะปฏิเสธ
                        </HelpHint>
                      </label>
                      <NumberInput
                        value={d.budgetBaht}
                        onChange={n => setDraft(s => ({ ...s, [page.id]: { ...d, budgetBaht: n } }))}
                        min={String(MIN_BUDGET_BAHT)}
                      />
                      {suggested != null && (
                        <button
                          type="button"
                          className="mt-1 subtitle-text text-primary hover:underline"
                          onClick={() => setDraft(s => ({ ...s, [page.id]: { ...d, budgetBaht: suggested } }))}
                        >
                          ใช้ {formatPrice(suggested)} บาท (พอสำหรับ {subInfo?.eligible_now} คนที่ส่งได้ตอนนี้)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* การ์ดชวนรับข่าวสาร — แอดมินกดส่งเองจากห้องแชท (ปุ่มในกล่องพิมพ์)
                      ⚠️ Meta ให้ส่งได้เฉพาะในกรอบ 24 ชม. นับจากลูกค้าทักล่าสุด · 1 ครั้ง/สัปดาห์/คน */}
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                    <p className="field-label flex items-center gap-1 mb-2">
                      การ์ดชวนรับข่าวสาร
                      <HelpHint>
                        แอดมินกดส่งการ์ดนี้จากห้องแชทเพื่อชวนลูกค้ากดรับข่าวสาร — กดแล้วลูกค้าจะอยู่ใน
                        รายชื่อที่ส่งบรอดแคสต์ถึงได้ · Facebook ให้ส่งคำชวนเฉพาะตอนที่ลูกค้าทักมาภายใน
                        24 ชั่วโมง และส่งซ้ำได้สัปดาห์ละครั้ง
                      </HelpHint>
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input
                        className="w-full px-3 form-control-md bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 rounded-lg border border-gray-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        value={d.optinTitle}
                        maxLength={65}
                        onChange={e => setDraft(s => ({ ...s, [page.id]: { ...d, optinTitle: e.target.value } }))}
                        placeholder={`รับข่าวสารและโปรโมชันจาก ${page.account_name}`.slice(0, 65)}
                        aria-label="หัวข้อบนการ์ดชวนรับข่าวสาร"
                      />
                      <FormSelect
                        value={d.optinFrequency}
                        onChange={v => setDraft(s => ({ ...s, [page.id]: { ...d, optinFrequency: v } }))}
                        options={[
                          { id: 'DAILY', label: 'ทุกวัน', subtitle: 'ถี่ที่สุด — ลูกค้าอาจรู้สึกถูกรบกวน' },
                          { id: 'WEEKLY', label: 'ทุกสัปดาห์', subtitle: 'แนะนำ' },
                          { id: 'MONTHLY', label: 'ทุกเดือน', subtitle: 'ห่างจนลูกค้าอาจลืมว่าสมัครไว้' },
                        ]}
                      />
                    </div>
                    <input
                      className="mt-3 w-full px-3 form-control-md bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 rounded-lg border border-gray-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/40"
                      value={d.optinImage}
                      onChange={e => setDraft(s => ({ ...s, [page.id]: { ...d, optinImage: e.target.value } }))}
                      placeholder="ลิงก์รูปจัตุรัสบนการ์ด (ไม่ใส่ = การ์ดข้อความล้วน)"
                      aria-label="รูปบนการ์ดชวนรับข่าวสาร"
                    />
                  </div>

                  {/* ผู้สมัคร — ถามสดจาก Meta เพราะรายชื่ออยู่ที่เขา ไม่ใช่ของเรา */}
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                    {subInfo ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="body-text">
                          ผู้สมัครรับข่าวสาร <strong>{subInfo.total}</strong> คน ·
                          ส่งได้ตอนนี้ <strong>{subInfo.eligible_now}</strong> คน
                        </span>
                        {subInfo.eligible_now === 0 && subInfo.next_eligible_at && (
                          <span className="subtitle-text">
                            (ส่งได้อีกครั้ง {formatThaiDateTime(subInfo.next_eligible_at)})
                          </span>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => loadSubscribers(page.id)}>ดูใหม่</Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Users className="w-4 h-4" />}
                        loading={sub === 'loading'}
                        onClick={() => loadSubscribers(page.id)}
                      >
                        ดูจำนวนผู้สมัคร
                      </Button>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 mt-4">
                    <Button
                      variant="primary"
                      loading={saving === page.id}
                      disabled={!d.adAccountId || adAccounts.length === 0}
                      onClick={() => save(page)}
                    >
                      บันทึก
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <p className="helper-text flex items-start gap-1.5 mt-4">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            {info.setupHint} · แคมเปญที่สร้างใหม่ต้องรอ Meta เตรียมก่อนส่งได้
            (วัดจริงประมาณ 2 ชั่วโมง) ระบบจะลองส่งให้เองจนกว่าจะสำเร็จ
          </span>
        </p>
      </Container>
    </Layout>
  );
}
