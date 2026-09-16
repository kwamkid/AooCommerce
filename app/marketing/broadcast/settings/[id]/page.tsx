// Path: app/marketing/broadcast/settings/[id]/page.tsx
//
// ตั้งค่าบรอดแคสต์ของ **เพจเดียว** — บัญชีโฆษณา · งบ · การ์ดชวนรับข่าวสาร 3 จังหวะ
// (หน้ารายการอยู่ที่ ../page.tsx)
//
// ⛔ **ห้ามใส่ช่อง "ความถี่" กลับเข้ามา** — ยิงจริงแล้ว Meta ปฏิเสธ ความถี่เป็นสิ่งที่ลูกค้า
// เลือกเองตอนกดรับ แล้วส่งกลับมาทาง webhook (ดู lib/broadcast/optin.ts)
'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Info, ChevronDown, Image as ImageIcon } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import FormSelect from '@/components/ui/FormSelect';
import FormInput from '@/components/ui/FormInput';
import FormTextarea from '@/components/ui/FormTextarea';
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
  readOptinConfig, validateOptinConfig, OPTIN_TRIGGERS, OPTIN_TITLE_MAX, OPTIN_INTRO_MAX,
  type OptinConfig, type OptinScenario, type OptinTrigger,
} from '@/lib/broadcast/optin';

/** งบที่ Meta ยอมรับต่ำสุดเท่าที่ยิงจริงแล้วผ่าน — 1 บาทถูกปฏิเสธ */
const MIN_BUDGET_BAHT = 35;
/** ราคาต่อข้อความยังไม่นิ่ง (วัดได้ 0.05 บาทจากใบเดียว) — เผื่อไว้เพื่อคำนวณงบ */
const ASSUMED_COST_PER_MESSAGE = 0.5;
/** เผื่อให้งบไม่ตันกลางทาง */
const BUDGET_HEADROOM = 1.5;

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

/** งบที่ควรตั้งจากจำนวนคนที่ส่งถึงได้ — ยังไม่มีผู้สมัคร = ขั้นต่ำที่ Meta รับ */
function budgetFor(eligible: number): number {
  return Math.max(MIN_BUDGET_BAHT, Math.ceil(eligible * ASSUMED_COST_PER_MESSAGE * BUDGET_HEADROOM));
}

/**
 * ตัวอย่างการ์ดที่ลูกค้าจะเห็นใน Messenger
 * ⚠️ บรรทัดบนกับข้อความรองเป็นของ **Meta เขียนเอง** เราแก้ไม่ได้ — วาดไว้ให้ร้านเห็นว่า
 * ข้อความที่ตัวเองตั้งจะไปอยู่ตรงไหน จะได้ไม่เขียนซ้ำกับสิ่งที่ Meta พูดให้อยู่แล้ว
 */
function CardPreview({ pageName, title, imageUrl }: { pageName: string; title: string; imageUrl: string | null }) {
  return (
    <div>
      <p className="field-label mb-1">ตัวอย่างที่ลูกค้าเห็น</p>
      <div className="max-w-[260px] rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden bg-gray-50 dark:bg-slate-900/40">
        <p className="helper-text px-3 py-2 text-center">
          {pageName} would like to send you messages, which may be promotional.
        </p>
        <div className="bg-white dark:bg-slate-800">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="w-full aspect-square object-cover" />
          ) : (
            <div className="w-full aspect-square flex flex-col items-center justify-center gap-1 text-gray-400 bg-gray-100 dark:bg-slate-700">
              <ImageIcon className="w-6 h-6" strokeWidth={1.5} />
              <span className="helper-text">โลโก้เพจ</span>
            </div>
          )}
          <div className="p-3">
            <p className="body-text font-medium leading-snug">{title || 'หัวข้อบนการ์ด'}</p>
            <p className="helper-text mt-1">
              Don&apos;t want to miss out on the latest sales? You can stop these messages at any time.
            </p>
          </div>
          <div className="border-t border-gray-200 dark:border-slate-700 py-2 text-center">
            <span className="body-text font-medium text-gray-600 dark:text-slate-300">Get updates</span>
          </div>
        </div>
      </div>
      <p className="helper-text mt-1">ข้อความสีจางกับปุ่มเป็นของ Facebook — แก้ไม่ได้</p>
    </div>
  );
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
  const [subs, setSubs] = useState<SubscriberInfo | null>(null);
  const [subsError, setSubsError] = useState(false);

  const [adAccountId, setAdAccountId] = useState('');
  const [budgetBaht, setBudgetBaht] = useState(MIN_BUDGET_BAHT);
  /** ร้านพิมพ์งบเองแล้วหรือยัง — ถ้ายัง ระบบคำนวณให้เรื่อย ๆ ตามจำนวนผู้สมัคร */
  const [budgetTouched, setBudgetTouched] = useState(false);
  const [optin, setOptin] = useState<OptinConfig>(() => readOptinConfig(null));
  const [imageFiles, setImageFiles] = useState<Partial<Record<OptinTrigger, File | null>>>({});
  /** URL พรีวิวของไฟล์ที่เพิ่งเลือก — สร้างครั้งเดียวตอนเลือก ไม่ใช่ทุก render (ไม่งั้นรั่ว) */
  const [imagePreviews, setImagePreviews] = useState<Partial<Record<OptinTrigger, string>>>({});
  const [imageBusy, setImageBusy] = useState(false);
  /** จังหวะที่กางอยู่ — ทีละอันพอ ไม่งั้นหน้ายาวจนหาไม่เจอ */
  const [expanded, setExpanded] = useState<OptinTrigger | null>('manual');
  /** คูปองที่ร้านสร้างไว้แล้ว — ดึงจากโมดูลคูปอง ไม่ตั้งเงื่อนไขซ้ำที่นี่ */
  const [coupons, setCoupons] = useState<{ id: string; code: string; name: string | null }[]>([]);
  /** ผู้ใช้ไม่มีสิทธิ์ดูคูปอง (API ใช้ marketing.coupons คนละตัวกับหน้านี้) */
  const [couponsDenied, setCouponsDenied] = useState(false);

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
        if (satang > 0) { setBudgetBaht(satang / 100); setBudgetTouched(true); }
        setOptin(readOptinConfig(c, found.account_name));
      }

      const adData = adRes.ok ? await adRes.json() : null;
      const ads = ((adData?.accounts || adData || []) as AdAccountOption[]).filter(a => a.external_id);
      setAdAccounts(ads);
      // มีบัญชีโฆษณาที่ใช้ได้ใบเดียว = ไม่มีอะไรให้เลือก เลือกให้เลย
      const usable = ads.filter(a => a.status === 'active');
      if (usable.length === 1) setAdAccountId(prev => prev || usable[0].external_id);

      // คูปองที่เลือกได้ — หน้านี้ใช้สิทธิ์ chat.broadcast แต่ API คูปองใช้ marketing.coupons
      // คนที่ไม่มีสิทธิ์จึงเห็นคำอธิบายแทน dropdown (ไม่ใช่ error)
      const couponRes = await apiFetch('/api/coupons');
      if (couponRes.ok) {
        const data = await couponRes.json().catch(() => null);
        const list = (data?.coupons || data || []) as { id: string; code: string; name: string | null; is_active?: boolean }[];
        setCoupons(list.filter(c => c.id && c.is_active !== false).map(c => ({ id: c.id, code: c.code, name: c.name })));
      } else if (couponRes.status === 403) {
        setCouponsDenied(true);
      }

      // ถามจำนวนผู้สมัครเองตั้งแต่เปิดหน้า — ร้านจะได้ไม่ต้องกดปุ่มก่อนถึงจะรู้ว่าควรตั้งงบเท่าไหร่
      const subRes = await apiFetch(`/api/broadcasts/messenger-subscribers?account_id=${id}`);
      if (subRes.ok) {
        const data = await subRes.json().catch(() => null);
        if (data) {
          setSubs(data as SubscriberInfo);
          // ร้านยังไม่เคยตั้งงบเอง → คำนวณให้จากจำนวนคนที่ส่งถึงได้จริง
          setBudgetBaht(prev => (prev > MIN_BUDGET_BAHT ? prev : budgetFor(Number(data.eligible_now) || 0)));
        }
      } else {
        setSubsError(true);
      }
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useFetchOnce(load, allowed && !permLoading);

  const updateScenario = (trigger: OptinTrigger, patch: Partial<OptinScenario>) =>
    setOptin(s => ({ ...s, [trigger]: { ...s[trigger], ...patch } }));

  const setScenarioImage = (trigger: OptinTrigger, file: File | null) => {
    setImageFiles(s => ({ ...s, [trigger]: file }));
    setImagePreviews(s => {
      const old = s[trigger];
      if (old) URL.revokeObjectURL(old);
      const next = { ...s };
      if (file) next[trigger] = URL.createObjectURL(file);
      else delete next[trigger];
      return next;
    });
  };
  const updateOptin = (patch: Partial<OptinConfig>) => setOptin(s => ({ ...s, ...patch }));

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

  const suggested = subs ? budgetFor(subs.eligible_now) : null;

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
              <p className="subtitle-text">
                {subsError
                  ? 'ถามจำนวนผู้สมัครไม่ได้ตอนนี้'
                  : subs
                    ? `ผู้สมัครรับข่าวสาร ${subs.total} คน · ส่งได้ตอนนี้ ${subs.eligible_now} คน`
                    : 'กำลังถามจำนวนผู้สมัคร…'}
              </p>
            </div>
            <div className="ml-auto">
              {page.broadcast_ready
                ? <Badge tone="emerald" size="sm">พร้อมบรอดแคสต์</Badge>
                : <Badge tone="amber" size="sm">ยังตั้งค่าไม่ครบ</Badge>}
            </div>
          </div>

          {subs && subs.eligible_now === 0 && subs.next_eligible_at && (
            <p className="subtitle-text mb-3">
              <Users className="w-4 h-4 inline-block mr-1 -mt-0.5 text-gray-400" />
              ส่งได้อีกครั้ง {formatThaiDateTime(subs.next_eligible_at)} (Facebook จำกัด 1 ข้อความ ต่อคน ต่อ 12 ชั่วโมง)
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label block mb-1">บัญชีโฆษณาที่ใช้ส่ง</label>
              <FormSelect
                value={adAccountId}
                onChange={setAdAccountId}
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
                  ระบบ<strong>สร้างแคมเปญโฆษณาให้เอง</strong>ตอนส่งบรอดแคสต์ครั้งแรก — งบนี้คือเพดานของแคมเปญนั้น
                  ไม่ใช่ยอดที่ถูกหัก · Meta คิดเงินตามข้อความที่ส่งถึงจริงเท่านั้น ตั้งสูงกว่าที่ใช้จริงไม่เสียเงินเพิ่ม
                  แต่ต่ำกว่า {MIN_BUDGET_BAHT} บาท Meta จะปฏิเสธ
                </HelpHint>
              </label>
              <NumberInput
                value={budgetBaht}
                onChange={n => { setBudgetTouched(true); setBudgetBaht(n); }}
                min={String(MIN_BUDGET_BAHT)}
              />
              <p className="helper-text mt-1">
                {!budgetTouched && subs
                  ? subs.eligible_now > 0
                    ? `คำนวณให้จากผู้สมัคร ${subs.eligible_now} คนที่ส่งถึงได้ตอนนี้`
                    : `ยังไม่มีผู้สมัคร — ตั้งขั้นต่ำที่ Meta รับไว้ก่อน (${MIN_BUDGET_BAHT} บาท)`
                  : suggested != null && suggested !== budgetBaht
                    ? <button type="button" className="text-primary hover:underline" onClick={() => { setBudgetTouched(false); setBudgetBaht(suggested); }}>
                        ให้ระบบคำนวณให้ ({formatPrice(suggested)} บาท)
                      </button>
                    : 'ระบบจะสร้างแคมเปญโฆษณาให้เองตอนส่งครั้งแรก'}
              </p>
            </div>
          </div>
        </Card>

        {/* การ์ดชวนรับข่าวสาร — พับเก็บทีละจังหวะ */}
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

          <div className="mt-3 space-y-2">
            {(['manual', 'after_sale', 'quiet'] as OptinTrigger[]).map(trigger => {
              const sc = optin[trigger];
              const info = OPTIN_TRIGGERS[trigger];
              const open = expanded === trigger;
              const previewUrl = imagePreviews[trigger] || sc.image_url || null;
              return (
                <div key={trigger} className="inner-panel">
                  <div className="inner-panel-head flex items-center justify-between gap-3">
                    <button
                      type="button"
                      className="flex items-center gap-2 min-w-0 text-left flex-1"
                      onClick={() => setExpanded(open ? null : trigger)}
                      aria-expanded={open}
                    >
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                      <span className="min-w-0">
                        <span className="body-text font-medium block">{info.label}</span>
                        <span className="subtitle-text block">{open ? info.description : sc.title || info.description}</span>
                      </span>
                    </button>
                    {trigger === 'manual' ? (
                      <Badge tone="gray" size="sm">เปิดอยู่เสมอ</Badge>
                    ) : (
                      <Toggle
                        checked={sc.enabled}
                        onChange={v => { updateScenario(trigger, { enabled: v }); if (v) setExpanded(trigger); }}
                        aria-label={`เปิดการชวน${info.label}`}
                      />
                    )}
                  </div>

                  {open && (
                    <div className="inner-panel-body grid md:grid-cols-[170px_1fr_auto] gap-4 items-start">
                      {/* รูปมาก่อน — Facebook ไม่รับการ์ดที่ไม่มีรูป */}
                      <div>
                        <label className="field-label flex items-center gap-1 mb-1">
                          รูปบนการ์ด
                          <HelpHint>Facebook ไม่รับการ์ดที่ไม่มีรูป — ไม่อัปเอง ระบบจะใช้โลโก้เพจแทน</HelpHint>
                        </label>
                        <ImageDropzone
                          value={imageFiles[trigger] ?? null}
                          onChange={f => setScenarioImage(trigger, f)}
                          initialPreviewUrl={sc.image_url || null}
                          aspect="1:1"
                          // การ์ดของ Messenger บังคับจัตุรัส — ให้ผู้ใช้เลือกเองว่าจะเอาส่วนไหน
                          cropAspect={1}
                          changeOnClick
                          maxWidthOrHeight={600}
                          onBusyChange={setImageBusy}
                          label="อัปรูป"
                          hint="ไม่ใส่ = ใช้โลโก้เพจ"
                          alt={`รูปการ์ด${info.label}`}
                        />
                      </div>

                      <div className="grid gap-3">
                        <FormInput
                          label="หัวข้อบนการ์ด"
                          value={sc.title}
                          maxLength={OPTIN_TITLE_MAX}
                          onChange={e => updateScenario(trigger, { title: e.target.value })}
                          placeholder={info.defaultTitle(page.account_name)}
                          hint={`สูงสุด ${OPTIN_TITLE_MAX} ตัวอักษร · การ์ดของ Facebook มีแค่หัวข้อเดียว`}
                        />
                        <FormTextarea
                          label="ข้อความนำก่อนการ์ด (ไม่บังคับ)"
                          value={sc.intro}
                          maxLength={OPTIN_INTRO_MAX}
                          rows={3}
                          onChange={e => updateScenario(trigger, { intro: e.target.value })}
                          placeholder="เช่น ขอบคุณที่อุดหนุนนะคะ 💛 กดรับข่าวสารไว้ จะได้ไม่พลาดของใหม่และโปรพิเศษค่ะ"
                          hint="ส่งเป็นข้อความธรรมดาก่อนการ์ด — ฟรี ไม่คิดเงินเหมือนข้อความการตลาด"
                        />

                        {/* คูปองของจังหวะนี้ — คนซื้อแล้วกับคนยังไม่ซื้อควรได้คนละใบ (หรือไม่ได้เลย) */}
                        <div>
                          <label className="field-label flex items-center gap-1 mb-1">
                            คูปองที่ส่งให้เมื่อกดรับ
                            <HelpHint>
                              ใส่คูปองในการ์ดไม่ได้ (Facebook ให้แค่รูป หัวข้อ ปุ่ม) — ระบบจะส่งโค้ดตามเข้าแชท
                              ทันทีที่ลูกค้ากดรับ · เงื่อนไข/วันหมดอายุ/โควตา ตั้งที่ <strong>การตลาด › คูปอง</strong> ที่เดียว
                            </HelpHint>
                          </label>
                          {couponsDenied ? (
                            <p className="helper-text">ไม่มีสิทธิ์ดูรายการคูปอง — ให้ผู้ดูแลตั้งให้ที่ การตลาด › คูปอง</p>
                          ) : (
                            <FormSelect
                              value={sc.coupon_id || ''}
                              onChange={v => updateScenario(trigger, { coupon_id: v || null })}
                              options={[
                                { id: '', label: 'ไม่ส่งคูปอง' },
                                ...coupons.map(c => ({ id: c.id, label: c.code, subtitle: c.name || undefined })),
                              ]}
                              placeholder={coupons.length ? 'ไม่ส่งคูปอง' : 'ยังไม่มีคูปองในระบบ'}
                              disabled={coupons.length === 0}
                            />
                          )}
                        </div>

                        {sc.coupon_id && (
                          <FormTextarea
                            label="ข้อความที่ส่งพร้อมโค้ด"
                            value={sc.reward_message}
                            rows={2}
                            onChange={e => updateScenario(trigger, { reward_message: e.target.value })}
                            hint="ใส่ {code} ตรงที่อยากให้โค้ดไปอยู่ — ไม่ใส่ ระบบจะต่อโค้ดไว้ท้ายข้อความให้"
                          />
                        )}
                      </div>

                      <CardPreview pageName={page.account_name} title={sc.title} imageUrl={previewUrl} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* กติการ่วมของทั้ง 3 จังหวะ */}
          <div className="grid sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
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
