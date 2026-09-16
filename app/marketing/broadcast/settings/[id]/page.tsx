// Path: app/marketing/broadcast/settings/[id]/page.tsx
//
// ตั้งค่าบรอดแคสต์ของ **เพจเดียว** — บัญชีโฆษณา · งบ · การ์ดชวนรับข่าวสาร 3 จังหวะ
// (หน้ารายการอยู่ที่ ../page.tsx)
//
// ⛔ **ห้ามใส่ช่อง "ความถี่" กลับเข้ามา** — ยิงจริงแล้ว Meta ปฏิเสธ ความถี่เป็นสิ่งที่ลูกค้า
// เลือกเองตอนกดรับ แล้วส่งกลับมาทาง webhook (ดู lib/broadcast/optin.ts)
// ⛔ **คูปองต้องมาจากโมดูลคูปอง** — ที่นี่แค่ "เลือกใบไหน" ไม่ตั้งเงื่อนไขซ้ำ
'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, Info, ChevronDown, Image as ImageIcon, Ticket, Search } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import Modal from '@/components/ui/Modal';
import FormSelect from '@/components/ui/FormSelect';
import FormInput from '@/components/ui/FormInput';
import FormTextarea from '@/components/ui/FormTextarea';
import SearchInput from '@/components/ui/SearchInput';
import Toggle from '@/components/ui/Toggle';
import NumberInput from '@/components/ui/NumberInput';
import ChannelBadge from '@/components/ui/ChannelBadge';
import HelpHint from '@/components/ui/HelpHint';
import ImageDropzone from '@/components/ui/ImageDropzone';
import StickyActionBar from '@/components/ui/StickyActionBar';
import VarChips from '@/components/ui/VarChips';
import PhonePreview, { type PhoneChatMessage } from '@/components/broadcast/PhonePreview';
import { LoadingCard, NoPermissionCard, EmptyCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useToast } from '@/lib/toast-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch, invalidateApiCache } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { formatPrice, formatThaiDateTime } from '@/lib/utils/format';
import { BROADCAST_SETUP_KEYS } from '@/lib/broadcast/platforms';
import {
  readOptinConfig, validateOptinConfig, applyCouponCode, OPTIN_TRIGGERS, OPTIN_TITLE_MAX,
  OPTIN_INTRO_MAX, OPTIN_COUPON_TOKEN,
  type OptinConfig, type OptinScenario, type OptinTrigger,
} from '@/lib/broadcast/optin';

/** งบที่ Meta ยอมรับต่ำสุดเท่าที่ยิงจริงแล้วผ่าน — 1 บาทถูกปฏิเสธ */
const MIN_BUDGET_BAHT = 35;
/** ราคาต่อข้อความยังไม่นิ่ง (วัดได้ 0.05 บาทจากใบเดียว) — เผื่อไว้เพื่อคำนวณงบ */
const ASSUMED_COST_PER_MESSAGE = 0.5;
const BUDGET_HEADROOM = 1.5;

const QUIET_WINDOWS = [
  { id: '15-45', label: '15–45 นาที', subtitle: 'ไวที่สุด — ลูกค้ายังจำบทสนทนาได้' },
  { id: '30-60', label: '30–60 นาที', subtitle: 'แนะนำ' },
  { id: '60-180', label: '1–3 ชั่วโมง', subtitle: 'ห่างขึ้น เหมาะกับร้านที่ลูกค้าคิดนาน' },
];

const TRIGGER_ORDER: OptinTrigger[] = ['manual', 'after_sale', 'quiet'];

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

interface CouponOption {
  id: string;
  code: string;
  name: string | null;
  discount_type: string;
  discount_value: number;
  min_spend: number | null;
  valid_until: string | null;
}

function budgetFor(eligible: number): number {
  return Math.max(MIN_BUDGET_BAHT, Math.ceil(eligible * ASSUMED_COST_PER_MESSAGE * BUDGET_HEADROOM));
}

function couponSummary(c: CouponOption): string {
  const off = c.discount_type === 'percent' ? `ลด ${c.discount_value}%` : `ลด ${formatPrice(c.discount_value)} บาท`;
  const min = c.min_spend ? ` · ซื้อขั้นต่ำ ${formatPrice(c.min_spend)}` : '';
  const until = c.valid_until ? ` · ถึง ${formatThaiDateTime(c.valid_until).split(' ')[0]}` : '';
  return `${off}${min}${until}`;
}

/**
 * ฟองข้อความธรรมดาใน Messenger — พื้นเทาบนห้องสีขาว (ขาวบนขาวจะมองไม่เห็น)
 * ⚠️ ห้ามมี `dark:` — สิ่งที่ลูกค้าเห็นไม่ขึ้นกับธีมของแอดมิน (กติกาเดียวกับ `.phone-mock*`)
 * กว้างสุด 85% เท่าการ์ด — Messenger ไม่ให้ฟองของอีกฝ่ายชนขอบขวา
 */
function TextBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[85%] w-fit rounded-2xl rounded-bl-sm bg-[#F0F0F0] text-gray-900 px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap">
      {children}
    </div>
  );
}

/**
 * การ์ดชวนสมัครอย่างที่ลูกค้าเห็นจริงใน Messenger
 * ⚠️ บรรทัดบนกับข้อความรองเป็นของ **Meta เขียนเอง** เราแก้ไม่ได้ — วาดไว้ให้ร้านเห็นว่า
 * ข้อความที่ตัวเองตั้งจะไปอยู่ตรงไหน จะได้ไม่เขียนซ้ำกับสิ่งที่ Meta พูดให้อยู่แล้ว
 */
/** บรรทัดคำขอของ Meta — อยู่**นอกการ์ด เต็มความกว้าง จัดกลาง** ไม่มีรูปโปรไฟล์ */
function OptinNotice({ pageName }: { pageName: string }) {
  return (
    <p className="text-[11px] leading-[1.45] text-gray-500 text-center px-2">
      {pageName} would like to send you messages, which may be promotional.{' '}
      <span className="text-[#0084FF] font-semibold">Learn More</span>
    </p>
  );
}

function OptinCardBubble({ title, imageUrl }: { title: string; imageUrl: string | null }) {
  return (
    // วางตามหน้าจอจริงที่เจ้าของแคปมา (16 ก.ย. 2026): การ์ดอยู่**ข้างขวาของรูปโปรไฟล์**
    // (ตัวแม่จัดให้) · พื้นการ์ดเทา ปุ่มขาว (ไม่ใช่กลับกัน)
    // ⚠️ ห้ามเป็น `w-full` — Messenger ไม่ให้ฟอง/การ์ดของอีกฝ่ายชนขอบขวา ต้องเหลือที่ว่างไว้
    // (เจ้าของท้วงรอบสอง 16 ก.ย. 2026 หลังย้ายมาอยู่ข้างโลโก้แล้วขอบขวาหายไป)
    <div className="w-[85%]">
      <div className="rounded-2xl overflow-hidden bg-[#F0F0F0]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="w-full aspect-square object-cover" />
        ) : (
          <div className="w-full aspect-square flex flex-col items-center justify-center gap-1 bg-gray-200 text-gray-400">
            <ImageIcon className="w-5 h-5" strokeWidth={1.5} />
            <span className="text-[11px]">โลโก้เพจ</span>
          </div>
        )}
        <div className="px-3 pt-2.5 pb-2">
          <p className="text-[13px] font-semibold leading-snug text-gray-900">{title || 'หัวข้อบนการ์ด'}</p>
          <p className="text-[12px] leading-[1.4] text-gray-500 mt-1">
            Don&apos;t want to miss out on the latest sales? You can stop these messages at any time.
          </p>
        </div>
        <div className="px-2 pb-2">
          <div className="rounded-lg bg-white py-2 text-center text-[13px] font-semibold text-gray-900">
            Get updates
          </div>
        </div>
      </div>
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
  const [budgetTouched, setBudgetTouched] = useState(false);
  const [optin, setOptin] = useState<OptinConfig>(() => readOptinConfig(null));
  const [imageFiles, setImageFiles] = useState<Partial<Record<OptinTrigger, File | null>>>({});
  /** URL พรีวิวของไฟล์ที่เพิ่งเลือก — สร้างครั้งเดียวตอนเลือก ไม่ใช่ทุก render (ไม่งั้นรั่ว) */
  const [imagePreviews, setImagePreviews] = useState<Partial<Record<OptinTrigger, string>>>({});
  const [imageBusy, setImageBusy] = useState(false);
  /** จังหวะที่กางอยู่ — ทีละอันพอ และเป็นตัวที่พรีวิวข้างขวาแสดงด้วย */
  const [expanded, setExpanded] = useState<OptinTrigger>('manual');

  const [coupons, setCoupons] = useState<CouponOption[]>([]);
  const [couponsDenied, setCouponsDenied] = useState(false);
  /** เปิดโมดัลเลือกคูปองให้จังหวะไหน */
  const [couponPickerFor, setCouponPickerFor] = useState<OptinTrigger | null>(null);
  const [couponSearch, setCouponSearch] = useState('');
  /** ช่องข้อความของจังหวะที่กางอยู่ — ชิปตัวแปรแทรกตรงตำแหน่งเคอร์เซอร์ */
  const introRef = useRef<HTMLTextAreaElement>(null);
  const rewardRef = useRef<HTMLTextAreaElement>(null);

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
      const usable = ads.filter(a => a.status === 'active');
      if (usable.length === 1) setAdAccountId(prev => prev || usable[0].external_id);

      // คูปองที่เลือกได้ — หน้านี้ใช้สิทธิ์ chat.broadcast แต่ API คูปองใช้ marketing.coupons
      // คนที่ไม่มีสิทธิ์จึงเห็นคำอธิบายแทนปุ่ม (ไม่ใช่ error)
      const couponRes = await apiFetch('/api/coupons');
      if (couponRes.ok) {
        const data = await couponRes.json().catch(() => null);
        const list = (data?.coupons || data || []) as (CouponOption & { is_active?: boolean })[];
        setCoupons(list.filter(c => c?.id && c.is_active !== false));
      } else if (couponRes.status === 403) {
        setCouponsDenied(true);
      }

      // ถามจำนวนผู้สมัครเองตั้งแต่เปิดหน้า — ร้านจะได้ไม่ต้องกดปุ่มก่อนถึงจะรู้ว่าควรตั้งงบเท่าไหร่
      const subRes = await apiFetch(`/api/broadcasts/messenger-subscribers?account_id=${id}`);
      if (subRes.ok) {
        const data = await subRes.json().catch(() => null);
        if (data) {
          setSubs(data as SubscriberInfo);
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
  const updateOptin = (patch: Partial<OptinConfig>) => setOptin(s => ({ ...s, ...patch }));

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
      for (const trigger of TRIGGER_ORDER) {
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

  const previewScenario = optin[expanded];
  const previewImage = imagePreviews[expanded] || previewScenario?.image_url || page?.picture_url || null;
  const previewCoupon = previewScenario?.coupon_id
    ? coupons.find(c => c.id === previewScenario.coupon_id)
    : undefined;

  // ลำดับที่ลูกค้าเห็นจริง: ข้อความนำ → การ์ด → (คูปองหลังกดรับ)
  const previewMessages = useMemo(() => {
    if (!page || !previewScenario) return [];
    const list: PhoneChatMessage[] = [];
    if (previewScenario.intro.trim()) {
      list.push({ key: 'intro', node: <TextBubble>{previewScenario.intro}</TextBubble> });
    }
    // บรรทัดคำขอเต็มกว้าง (ไม่มีรูปโปรไฟล์) แล้วการ์ดอยู่ข้างขวาของรูปโปรไฟล์
    list.push({ key: 'notice', wide: true, hideAvatar: true, node: <OptinNotice pageName={page.account_name} /> });
    list.push({
      key: 'card',
      wide: true,
      node: <OptinCardBubble title={previewScenario.title} imageUrl={previewImage} />,
    });
    // ⛔ ไม่วาดสิ่งที่ Meta เขียนเองหลังลูกค้ากดรับ — ทั้งฟอง "Get updates" ฝั่งลูกค้า
    // และบรรทัด "You've chosen to receive…" (เจ้าของให้เอาออกทั้งคู่)
    // พรีวิวมีไว้ดู**ข้อความที่ร้านตั้งเอง** ของที่แก้ไม่ได้ใส่มาแล้วรกเปล่า ๆ
    if (previewCoupon) {
      // แทนค่าผ่านตัวกลางตัวเดียวกับตัวส่งจริง — พรีวิวจะได้ไม่มีทางเพี้ยนจากของที่ลูกค้าได้รับ
      const msg = applyCouponCode(previewScenario.reward_message, previewCoupon.code);
      list.push({ key: 'coupon', node: <TextBubble>{msg}</TextBubble> });
    }
    return list;
  }, [page, previewScenario, previewImage, previewCoupon]);

  if (permLoading || loading) {
    return <Layout><Container size="5xl"><LoadingCard /></Container></Layout>;
  }
  if (!allowed) {
    return <Layout><Container size="5xl"><NoPermissionCard /></Container></Layout>;
  }
  if (!page) {
    return (
      <Layout><Container size="5xl">
        <PageHeader title="ตั้งค่าบรอดแคสต์" backHref="/marketing/broadcast/settings" />
        <EmptyCard title="ไม่พบเพจนี้" subtitle="อาจถูกปิดหรือถอดออกไปแล้ว" />
      </Container></Layout>
    );
  }

  const suggested = subs ? budgetFor(subs.eligible_now) : null;
  const filteredCoupons = couponSearch.trim()
    ? coupons.filter(c => `${c.code} ${c.name || ''}`.toLowerCase().includes(couponSearch.trim().toLowerCase()))
    : coupons;

  return (
    <Layout>
      <Container size="5xl">
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

          {/* ซ้าย = ตั้งค่าทีละจังหวะ · ขวา = มือถือจำลองของจังหวะที่กางอยู่ (ตัวเดียวกับที่บรอดแคสต์ใช้) */}
          <div className="grid lg:grid-cols-[minmax(0,1fr)_auto] gap-4 items-start mt-3">
            <div className="space-y-2 min-w-0">
              {TRIGGER_ORDER.map(trigger => {
                const sc = optin[trigger];
                const info = OPTIN_TRIGGERS[trigger];
                const open = expanded === trigger;
                const coupon = sc.coupon_id ? coupons.find(c => c.id === sc.coupon_id) : undefined;
                return (
                  <div key={trigger} className="inner-panel">
                    <div className="inner-panel-head flex items-center justify-between gap-3">
                      <button
                        type="button"
                        className="flex items-center gap-2 min-w-0 text-left flex-1"
                        onClick={() => setExpanded(trigger)}
                        aria-expanded={open}
                      >
                        <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                        <span className="min-w-0">
                          <span className="body-text font-medium block">{info.label}</span>
                          <span className="subtitle-text block truncate">{open ? info.description : sc.title || info.description}</span>
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
                      <div className="inner-panel-body grid sm:grid-cols-[150px_minmax(0,1fr)] gap-3 items-start">
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
                            cropAspect={1}
                            changeOnClick
                            maxWidthOrHeight={600}
                            onBusyChange={setImageBusy}
                            label="อัปรูป"
                            hint="ไม่ใส่ = ใช้โลโก้เพจ"
                            alt={`รูปการ์ด${info.label}`}
                          />
                        </div>

                        {/* เรียงตามลำดับที่ลูกค้าได้รับจริง: ข้อความนำ → การ์ด → คูปองหลังกดรับ
                            (เจ้าของขอ 16 ก.ย. 2026 — ฟอร์มกับพรีวิวต้องไล่ทางเดียวกัน) */}
                        <div className="grid gap-3 min-w-0">
                          <div>
                            <FormTextarea
                              ref={introRef}
                              label="ข้อความนำ (ไม่บังคับ)"
                              value={sc.intro}
                              maxLength={OPTIN_INTRO_MAX}
                              rows={2}
                              onChange={e => updateScenario(trigger, { intro: e.target.value })}
                              placeholder="เช่น ขอบคุณที่อุดหนุนนะคะ 💛 กดรับข่าวสารไว้ จะได้ไม่พลาดของใหม่และโปรพิเศษค่ะ"
                              hint="ส่งเป็นข้อความธรรมดาก่อนการ์ด — ฟรี ไม่คิดเงินเหมือนข้อความการตลาด"
                            />
                            {/* ชุดตัวแปรเดียวกับข้อความสำเร็จรูปในหน้าแชท — ไม่มี "ชื่อผู้ตอบ"
                                เพราะงานอัตโนมัติไม่มีคนตอบ */}
                            <VarChips
                              targetRef={introRef}
                              value={sc.intro}
                              onChange={v => updateScenario(trigger, { intro: v })}
                              only={['{{ชื่อลูกค้า}}', '{{ชื่อร้าน}}']}
                              className="mt-1.5"
                            />
                          </div>
                          <FormInput
                            label="หัวข้อบนการ์ด"
                            value={sc.title}
                            maxLength={OPTIN_TITLE_MAX}
                            onChange={e => updateScenario(trigger, { title: e.target.value })}
                            placeholder={info.defaultTitle(page.account_name)}
                            hint={`สูงสุด ${OPTIN_TITLE_MAX} ตัวอักษร · การ์ดของ Facebook มีแค่หัวข้อเดียว`}
                          />

                          {/* คูปองของจังหวะนี้ — เปิดสวิตช์แล้วเลือกใบจากโมดูลคูปอง */}
                          <div>
                            <div className="flex items-center justify-between gap-3">
                              <label className="field-label flex items-center gap-1.5">
                                <Ticket className="w-4 h-4 text-gray-400" />
                                ส่งคูปองเมื่อกดรับ
                                <HelpHint>
                                  ใส่คูปองในการ์ดไม่ได้ (Facebook ให้แค่รูป หัวข้อ ปุ่ม) — ระบบส่งโค้ดตามเข้าแชท
                                  ทันทีที่ลูกค้ากดรับ · เงื่อนไข/วันหมดอายุ/โควตา ตั้งที่ <strong>การตลาด › คูปอง</strong> ที่เดียว
                                </HelpHint>
                              </label>
                              <Toggle
                                checked={!!sc.coupon_id}
                                disabled={couponsDenied}
                                onChange={v => {
                                  if (v) { setCouponSearch(''); setCouponPickerFor(trigger); }
                                  else updateScenario(trigger, { coupon_id: null });
                                }}
                                aria-label={`ส่งคูปองเมื่อกดรับ (${info.label})`}
                              />
                            </div>

                            {couponsDenied ? (
                              <p className="helper-text mt-1">ไม่มีสิทธิ์ดูรายการคูปอง — ให้ผู้ดูแลตั้งให้ที่ การตลาด › คูปอง</p>
                            ) : sc.coupon_id && (
                              <div className="mt-2 grid gap-2">
                                <button
                                  type="button"
                                  className="choice-card choice-card-active flex items-center gap-2 p-2.5 text-left w-full"
                                  onClick={() => { setCouponSearch(''); setCouponPickerFor(trigger); }}
                                >
                                  <Ticket className="w-4 h-4 text-primary flex-shrink-0" />
                                  <span className="min-w-0 flex-1">
                                    <span className="body-text font-medium block truncate">{coupon?.code || 'คูปองที่เลือกไว้'}</span>
                                    <span className="subtitle-text block truncate">
                                      {coupon ? couponSummary(coupon) : 'คูปองนี้อาจถูกลบหรือปิดไปแล้ว — เลือกใหม่'}
                                    </span>
                                  </span>
                                  <span className="subtitle-text text-primary flex-shrink-0">เปลี่ยน</span>
                                </button>
                                <div>
                                  <FormTextarea
                                    ref={rewardRef}
                                    label="ข้อความที่ส่งพร้อมโค้ด"
                                    value={sc.reward_message}
                                    rows={2}
                                    onChange={e => updateScenario(trigger, { reward_message: e.target.value })}
                                    hint="ไม่แทรกโค้ดคูปอง ระบบจะต่อโค้ดไว้ท้ายข้อความให้"
                                  />
                                  {/* โค้ดคูปองเป็นตัวแปรเหมือนกัน — ต้องอยู่แถวเดียวกับตัวอื่น
                                      ไม่ใช่ปล่อยให้พิมพ์โทเคนเอาเองจากคำอธิบาย (เจ้าของท้วง 16 ก.ย. 2026) */}
                                  <VarChips
                                    targetRef={rewardRef}
                                    value={sc.reward_message}
                                    onChange={v => updateScenario(trigger, { reward_message: v })}
                                    only={['{{ชื่อลูกค้า}}', '{{ชื่อร้าน}}']}
                                    extra={[{
                                      token: OPTIN_COUPON_TOKEN,
                                      label: 'โค้ดคูปอง',
                                      hint: 'โค้ดของคูปองใบที่เลือกไว้ข้างบน',
                                    }]}
                                    className="mt-1.5"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* กติการ่วมของทั้ง 3 จังหวะ */}
              <div className="grid sm:grid-cols-3 gap-3 pt-3">
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
            </div>

            {/* พรีวิวตัวเดียวใช้ร่วมทั้ง 3 จังหวะ — เปลี่ยนตามอันที่กางอยู่ */}
            {/* w-56 = ความกว้างจริงของเครื่องหลัง zoom (20rem × 0.7) — ป้ายกับคำอธิบายอยู่นอกตัวที่ถูกย่อ
                ไม่คุมความกว้างเอง คอลัมน์จะกว้างกว่ามือถือแล้วดูเหมือนวางไม่ตรงกัน */}
            <div className="lg:sticky lg:top-4 w-56 mx-auto lg:mx-0">
              <p className="field-label mb-2">ตัวอย่างที่ลูกค้าเห็น</p>
              <PhonePreview
                accountName={page.account_name}
                accountPictureUrl={page.picture_url}
                messages={previewMessages}
                size="md"
                platform="facebook"
              />
              <p className="helper-text mt-2">
                จังหวะ &quot;{OPTIN_TRIGGERS[expanded].label}&quot; · ข้อความสีจางกับปุ่มบนการ์ดเป็นของ Facebook แก้ไม่ได้
                {previewCoupon && ' · ฟองสุดท้ายส่งหลังลูกค้ากดรับ'}
              </p>
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

        {/* เลือกคูปองจากที่ร้านสร้างไว้ — ที่นี่ไม่ตั้งเงื่อนไขคูปองเอง */}
        <Modal
          open={!!couponPickerFor}
          onClose={() => setCouponPickerFor(null)}
          title="เลือกคูปองที่จะส่งให้"
          icon={<Ticket className="w-5 h-5" />}
          size="md"
        >
          <div className="px-6 py-5">
            {coupons.length === 0 ? (
              <EmptyCard
                title="ยังไม่มีคูปองในระบบ"
                subtitle="สร้างคูปองที่ การตลาด › คูปอง ก่อน แล้วกลับมาเลือกที่นี่"
              />
            ) : (
              <>
                <SearchInput
                  value={couponSearch}
                  onChange={setCouponSearch}
                  placeholder="ค้นหาโค้ดหรือชื่อคูปอง"
                />
                <div className="mt-3 space-y-2 max-h-[50vh] overflow-y-auto">
                  {filteredCoupons.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="choice-card flex items-center gap-3 p-3 text-left w-full"
                      onClick={() => {
                        if (couponPickerFor) updateScenario(couponPickerFor, { coupon_id: c.id });
                        setCouponPickerFor(null);
                      }}
                    >
                      <Ticket className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="body-text font-medium block truncate">{c.code}</span>
                        <span className="subtitle-text block truncate">
                          {c.name ? `${c.name} · ` : ''}{couponSummary(c)}
                        </span>
                      </span>
                    </button>
                  ))}
                  {filteredCoupons.length === 0 && (
                    <p className="helper-text text-center py-4">ไม่พบคูปองที่ค้นหา</p>
                  )}
                </div>
              </>
            )}
            <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
              <Link href="/marketing/coupons" className="subtitle-text text-primary hover:underline">
                <Search className="w-4 h-4 inline-block mr-1 -mt-0.5" />
                จัดการคูปองทั้งหมด
              </Link>
              <Button variant="secondary" onClick={() => setCouponPickerFor(null)}>ปิด</Button>
            </div>
          </div>
        </Modal>
      </Container>
    </Layout>
  );
}
