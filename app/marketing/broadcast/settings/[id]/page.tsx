// Path: app/marketing/broadcast/settings/[id]/page.tsx
//
// ตั้งค่าบรอดแคสต์ของ **เพจเดียว** — บัญชีโฆษณา · งบ · การ์ดชวนรับข่าวสาร 3 สถานการณ์
// (หน้ารายการอยู่ที่ ../page.tsx — ร้านที่มีหลายเพจจะได้ไม่ต้องอ่านทุกเพจพร้อมกัน)
'use client';

import { useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Info } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import FormSelect from '@/components/ui/FormSelect';
import FormInput from '@/components/ui/FormInput';
import Toggle from '@/components/ui/Toggle';
import NumberInput from '@/components/ui/NumberInput';
import ChannelBadge from '@/components/ui/ChannelBadge';
import HelpHint from '@/components/ui/HelpHint';
import ImageDropzone from '@/components/ui/ImageDropzone';
import StickyActionBar from '@/components/ui/StickyActionBar';
import { LoadingCard, NoPermissionCard, EmptyCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useToast } from '@/lib/toast-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch, invalidateApiCache } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { formatPrice, formatThaiDateTime } from '@/lib/utils/format';
import { BROADCAST_SETUP_KEYS } from '@/lib/broadcast/platforms';
import {
  readOptinConfig, validateOptinConfig, OPTIN_TRIGGERS, OPTIN_TITLE_MAX,
  type OptinConfig, type OptinScenario, type OptinTrigger,
} from '@/lib/broadcast/optin';

/** งบที่ Meta ยอมรับต่ำสุดเท่าที่ยิงจริงแล้วผ่าน — 1 บาทถูกปฏิเสธ */
const MIN_BUDGET_BAHT = 35;
const DEFAULT_BUDGET_BAHT = 100;
/** ราคาต่อข้อความยังไม่นิ่ง (วัดได้ 0.05 บาทจากใบเดียว) — ใช้ประมาณคร่าว ๆ เพื่อแนะนำงบ */
const ASSUMED_COST_PER_MESSAGE = 0.5;

/** ช่วง "เงียบแล้ว" ที่ให้เลือก — ทุกตัวมี**ขอบบน**เสมอ (กันวันเปิดสวิตช์แล้วยิงทั้งร้าน) */
const QUIET_WINDOWS = [
  { id: '15-45', label: '15–45 นาที', subtitle: 'ไวที่สุด — ลูกค้ายังจำบทสนทนาได้' },
  { id: '30-60', label: '30–60 นาที', subtitle: 'แนะนำ' },
  { id: '60-180', label: '1–3 ชั่วโมง', subtitle: 'ห่างขึ้น เหมาะกับร้านที่ลูกค้าคิดนาน' },
];

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

export default function BroadcastPageSettings() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { allowed, loading: permLoading } = useAuthGuard('chat.broadcast', { noRedirect: true });
  const { showToast } = useToast();

  const [page, setPage] = useState<PageAccount | null>(null);
  const [adAccounts, setAdAccounts] = useState<AdAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subs, setSubs] = useState<SubscriberInfo | 'loading' | 'error' | null>(null);

  const [adAccountId, setAdAccountId] = useState('');
  const [budgetBaht, setBudgetBaht] = useState(DEFAULT_BUDGET_BAHT);
  const [optin, setOptin] = useState<OptinConfig>(() => readOptinConfig(null));
  /** รูปที่เพิ่งเลือกแต่ยังไม่ได้อัป — ขึ้น storage ตอนกดบันทึกเท่านั้น */
  const [imageFiles, setImageFiles] = useState<Partial<Record<OptinTrigger, File | null>>>({});
  const [imageBusy, setImageBusy] = useState(false);
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [chatRes, adRes] = await Promise.all([
        apiFetch('/api/chat-accounts'),
        apiFetch('/api/ads/accounts?lite=1'),
      ]);
      const chatData = chatRes.ok ? await chatRes.json() : { accounts: [] };
      const found: PageAccount | undefined = (chatData.accounts || [])
        .find((a: PageAccount) => a.id === id && a.platform === 'facebook');
      setPage(found || null);

      if (found) {
        const c = found.credentials || {};
        const satang = Number(c[BROADCAST_SETUP_KEYS.dailyBudget] ?? 0);
        setAdAccountId(String(c[BROADCAST_SETUP_KEYS.adAccountId] ?? ''));
        setBudgetBaht(satang > 0 ? satang / 100 : DEFAULT_BUDGET_BAHT);
        setOptin(readOptinConfig(c, found.account_name));
      }

      const adData = adRes.ok ? await adRes.json() : null;
      setAdAccounts((adData?.accounts || adData || [])
        .filter((a: AdAccountOption) => a.external_id)
        .map((a: AdAccountOption) => ({ id: a.id, external_id: a.external_id, name: a.name, status: a.status })));
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useFetchOnce(load, allowed && !permLoading);

  const loadSubscribers = async () => {
    setSubs('loading');
    try {
      const res = await apiFetch(`/api/broadcasts/messenger-subscribers?account_id=${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubs('error');
        showToast(typeof data.error === 'string' ? data.error : 'ถามรายชื่อผู้สมัครไม่สำเร็จ', 'error');
        return;
      }
      setSubs(data as SubscriberInfo);
    } catch {
      setSubs('error');
    }
  };

  const updateScenario = (trigger: OptinTrigger, patch: Partial<OptinScenario>) => {
    dirtyRef.current = true;
    setOptin(s => ({ ...s, [trigger]: { ...s[trigger], ...patch } }));
  };
  const updateOptin = (patch: Partial<OptinConfig>) => {
    dirtyRef.current = true;
    setOptin(s => ({ ...s, ...patch }));
  };

  /** รูปขึ้น storage ตอนกดบันทึกเท่านั้น — เลือกแล้วเปลี่ยนใจไม่ทิ้งไฟล์ขยะไว้ */
  const uploadImage = async (file: File): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `broadcast-images/optin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('chat-media').upload(path, file, { contentType: file.type || 'image/jpeg' });
    if (error) throw new Error('อัปโหลดรูปไม่สำเร็จ');
    return supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
  };

  const save = async () => {
    if (!page) return;
    if (!adAccountId) { showToast('เลือกบัญชีโฆษณาก่อน', 'error'); return; }
    if (budgetBaht < MIN_BUDGET_BAHT) {
      showToast(`งบต่อวันต้องไม่ต่ำกว่า ${MIN_BUDGET_BAHT} บาท (Meta ปฏิเสธงบที่ต่ำกว่านี้)`, 'error');
      return;
    }
    setSaving(true);
    try {
      // อัปรูปที่เพิ่งเลือกก่อน แล้วค่อยเอา URL ไปตรวจ/บันทึก
      const next: OptinConfig = { ...optin };
      for (const trigger of Object.keys(OPTIN_TRIGGERS) as OptinTrigger[]) {
        const file = imageFiles[trigger];
        if (file) next[trigger] = { ...next[trigger], image_url: await uploadImage(file) };
      }

      const optinError = validateOptinConfig(next);
      if (optinError) { showToast(optinError, 'error'); return; }

      const res = await apiFetch('/api/chat-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: page.id,
          credentials: {
            [BROADCAST_SETUP_KEYS.adAccountId]: adAccountId,
            [BROADCAST_SETUP_KEYS.dailyBudget]: Math.round(budgetBaht * 100),
            // ⚠️ ส่ง**ก้อนเต็ม**เสมอ — PUT merge แบบ shallow ต่อ top-level key
            [BROADCAST_SETUP_KEYS.optin]: next,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(typeof data.error === 'string' ? data.error : 'บันทึกไม่สำเร็จ', 'error');
        return;
      }
      invalidateApiCache('/api/chat-accounts');
      setOptin(next);
      setImageFiles({});
      dirtyRef.current = false;
      showToast(`ตั้งค่า ${page.account_name} แล้ว`, 'success');
      router.push('/marketing/broadcast/settings');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (permLoading || loading) {
    return <Layout><Container size="2xl"><LoadingCard /></Container></Layout>;
  }
  if (!allowed) {
    return <Layout><Container size="2xl"><NoPermissionCard /></Container></Layout>;
  }
  if (!page) {
    return (
      <Layout><Container size="2xl">
        <PageHeader title="ตั้งค่าบรอดแคสต์" backHref="/marketing/broadcast/settings" />
        <EmptyCard title="ไม่พบเพจนี้" subtitle="อาจถูกปิดหรือถอดออกไปแล้ว" />
      </Container></Layout>
    );
  }

  const subInfo = typeof subs === 'object' && subs ? subs : null;
  const suggested = subInfo
    ? Math.max(MIN_BUDGET_BAHT, Math.ceil(subInfo.eligible_now * ASSUMED_COST_PER_MESSAGE * 1.5))
    : null;

  return (
    <Layout>
      <Container size="2xl">
        <PageHeader
          title={page.account_name}
          subtitle="ตั้งค่าบรอดแคสต์ของเพจนี้"
          backHref="/marketing/broadcast/settings"
        />

        <Card padding="md">
          <div className="flex items-center gap-3 mb-4">
            <ChannelBadge channel={{ platform: 'facebook', picture_url: page.picture_url }} size="md" />
            <div className="min-w-0">
              <p className="heading-4 truncate">{page.account_name}</p>
              <p className="subtitle-text">เพจ Facebook</p>
            </div>
            <div className="ml-auto">
              {page.broadcast_ready
                ? <Badge tone="emerald" size="sm">พร้อมบรอดแคสต์</Badge>
                : <Badge tone="amber" size="sm">ยังตั้งค่าไม่ครบ</Badge>}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label block mb-1">บัญชีโฆษณาที่ใช้ส่ง</label>
              <FormSelect
                value={adAccountId}
                onChange={v => { dirtyRef.current = true; setAdAccountId(v); }}
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
                  ตั้งสูงกว่าที่ใช้จริงไม่เสียเงินเพิ่ม แต่ต่ำกว่า {MIN_BUDGET_BAHT} บาท Meta จะปฏิเสธ
                </HelpHint>
              </label>
              <NumberInput
                value={budgetBaht}
                onChange={n => { dirtyRef.current = true; setBudgetBaht(n); }}
                min={String(MIN_BUDGET_BAHT)}
              />
              {suggested != null && (
                <button
                  type="button"
                  className="mt-1 subtitle-text text-primary hover:underline"
                  onClick={() => { dirtyRef.current = true; setBudgetBaht(suggested); }}
                >
                  ใช้ {formatPrice(suggested)} บาท (พอสำหรับ {subInfo?.eligible_now} คนที่ส่งได้ตอนนี้)
                </button>
              )}
            </div>
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
                  <span className="subtitle-text">(ส่งได้อีกครั้ง {formatThaiDateTime(subInfo.next_eligible_at)})</span>
                )}
                <Button variant="ghost" size="sm" onClick={loadSubscribers}>ดูใหม่</Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                icon={<Users className="w-4 h-4" />}
                loading={subs === 'loading'}
                onClick={loadSubscribers}
              >
                ดูจำนวนผู้สมัคร
              </Button>
            )}
          </div>
        </Card>

        {/* การ์ดชวนรับข่าวสาร — ตั้งข้อความแยกตามจังหวะที่ส่ง */}
        <Card padding="md">
          <p className="heading-3 flex items-center gap-1 mb-1">
            การ์ดชวนรับข่าวสาร
            <HelpHint>
              ลูกค้าที่กดรับข่าวสารคือกลุ่มเดียวที่ส่งบรอดแคสต์ถึงได้แม้พ้นกรอบ 24 ชั่วโมง ·
              Facebook ให้ส่งคำชวนเฉพาะตอนที่ลูกค้าทักมาภายใน 24 ชั่วโมง และขอซ้ำได้สัปดาห์ละครั้ง
            </HelpHint>
          </p>
          <p className="section-desc mb-3">ตั้งข้อความแยกได้ตามจังหวะที่ส่ง</p>

          <Alert tone="warning" title="ข้อความของแต่ละจังหวะต้องไม่เหมือนกัน">
            คนที่เพิ่งจ่ายเงินไปแล้วมาเจอ &quot;ลด 5%&quot; จะรู้สึกว่าเมื่อกี้ซื้อแพงไป —
            หลังปิดการขายให้ใช้แนว &quot;ติดตามของใหม่&quot; ส่วนคนที่ยังไม่ซื้อค่อยใช้ส่วนลดดึงกลับ
          </Alert>

          {(['manual', 'after_sale', 'quiet'] as OptinTrigger[]).map(trigger => {
            const sc = optin[trigger];
            const info = OPTIN_TRIGGERS[trigger];
            return (
              <div key={trigger} className="inner-panel mt-3">
                <div className="inner-panel-head flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="body-text font-medium">{info.label}</p>
                    <p className="subtitle-text">{info.description}</p>
                  </div>
                  {trigger === 'manual' ? (
                    <Badge tone="gray" size="sm">เปิดอยู่เสมอ</Badge>
                  ) : (
                    <Toggle
                      checked={sc.enabled}
                      onChange={v => updateScenario(trigger, { enabled: v })}
                      aria-label={`เปิดการชวน${info.label}`}
                    />
                  )}
                </div>
                <div className="inner-panel-body grid sm:grid-cols-[1fr_140px] gap-3 items-start">
                  <div className="grid gap-3">
                    <FormInput
                      label="หัวข้อบนการ์ด"
                      value={sc.title}
                      maxLength={OPTIN_TITLE_MAX}
                      onChange={e => updateScenario(trigger, { title: e.target.value })}
                      placeholder={info.defaultTitle(page.account_name)}
                      hint={`สูงสุด ${OPTIN_TITLE_MAX} ตัวอักษร — ใส่คูปองในการ์ดไม่ได้ ถ้าจะแจกให้เขียนชวนตรงนี้แล้วส่งคูปองตามไปในบรอดแคสต์`}
                    />
                    <div>
                      <label className="field-label block mb-1">ความถี่ที่ขอจากลูกค้า</label>
                      <FormSelect
                        value={sc.frequency}
                        onChange={v => updateScenario(trigger, { frequency: v as OptinScenario['frequency'] })}
                        options={[
                          { id: 'DAILY', label: 'ทุกวัน', subtitle: 'ถี่ที่สุด — ลูกค้าอาจรู้สึกถูกรบกวน' },
                          { id: 'WEEKLY', label: 'ทุกสัปดาห์', subtitle: 'แนะนำ' },
                          { id: 'MONTHLY', label: 'ทุกเดือน', subtitle: 'ห่างจนลูกค้าอาจลืมว่าสมัครไว้' },
                        ]}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="field-label block mb-1">รูปบนการ์ด</label>
                    <ImageDropzone
                      value={imageFiles[trigger] ?? null}
                      onChange={f => { dirtyRef.current = true; setImageFiles(s => ({ ...s, [trigger]: f })); }}
                      initialPreviewUrl={sc.image_url || null}
                      aspect="1:1"
                      changeOnClick
                      maxWidthOrHeight={600}
                      onBusyChange={setImageBusy}
                      label="อัปรูป"
                      hint="ไม่ใส่ = ใช้โลโก้เพจ"
                      alt={`รูปการ์ด${info.label}`}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {/* กติการ่วมของทั้ง 3 สถานการณ์ */}
          <div className="grid sm:grid-cols-3 gap-3 mt-4">
            <div>
              <label className="field-label flex items-center gap-1 mb-1">
                ถามซ้ำได้ทุก
                <HelpHint>Facebook ให้ขอซ้ำได้สัปดาห์ละครั้ง — ตั้งถี่กว่านี้ไม่ได้</HelpHint>
              </label>
              <FormSelect
                value={String(optin.reask_days)}
                onChange={v => updateOptin({ reask_days: Number(v) })}
                options={[7, 14, 30, 60, 90].map(n => ({ id: String(n), label: `${n} วัน` }))}
              />
            </div>
            <div>
              <label className="field-label block mb-1">ถามคนเดิมได้ไม่เกิน</label>
              <FormSelect
                value={String(optin.max_asks)}
                onChange={v => updateOptin({ max_asks: Number(v) })}
                options={[1, 2, 3, 5].map(n => ({ id: String(n), label: `${n} ครั้ง` }))}
              />
            </div>
            <div>
              <label className="field-label flex items-center gap-1 mb-1">
                ช่วงที่ถือว่าคุยจบ
                <HelpHint>
                  นับจากข้อความล่าสุดของลูกค้า และส่งเฉพาะห้องที่แอดมินตอบไปแล้ว —
                  ห้องที่ลูกค้ายังถามค้างอยู่จะไม่ถูกขัดจังหวะ
                </HelpHint>
              </label>
              <FormSelect
                value={`${optin.quiet_min_minutes}-${optin.quiet_max_minutes}`}
                onChange={v => {
                  const [min, max] = v.split('-').map(Number);
                  updateOptin({ quiet_min_minutes: min, quiet_max_minutes: max });
                }}
                options={QUIET_WINDOWS}
              />
            </div>
          </div>
        </Card>

        <p className="helper-text flex items-start gap-1.5">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            แคมเปญที่สร้างใหม่ต้องรอ Meta เตรียมก่อนส่งได้ (วัดจริงประมาณ 2 ชั่วโมง) ระบบจะลองส่งให้เองจนกว่าจะสำเร็จ
          </span>
        </p>

        <StickyActionBar
          onSave={save}
          saving={saving}
          disabled={!adAccountId || adAccounts.length === 0 || imageBusy}
          onCancel={() => router.push('/marketing/broadcast/settings')}
        />
      </Container>
    </Layout>
  );
}
