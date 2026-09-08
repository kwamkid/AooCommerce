// Path: app/marketing/broadcast/new/page.tsx
//
// สร้างบรอดแคสต์ — เดินสองขั้น: **ส่งถึงใคร** แล้ว **ส่งอะไร เมื่อไหร่**
//
// หน้าเป็นเจ้าของ state ทั้งหมด การ์ดใน ./components รับค่าเข้ามาแล้วคืนกลับ —
// จำนวนผู้รับ โควตา และตัวอย่างข้อความอยู่ในแผงขวาที่ตรึงไว้ เพราะเป็นสองสิ่งที่ต้องเห็น
// ตลอดเวลาที่แก้เนื้อหา ไม่ใช่ต้องเลื่อนกลับขึ้นไปดู
//
// ⛔ ไม่มีขั้นไหน "ยุบเป็นบรรทัดสรุป" — เจ้าของทดลองแล้วไม่เอา (ต้องกดกางเพื่อดูว่าตัวเอง
//    ตั้งอะไรไว้ = แย่กว่าเลื่อนดู) · กดหัวขั้นเพื่อสลับได้ทันที validation อยู่ที่ตอนกดส่ง
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import Stepper from '@/components/ui/Stepper';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import type { DateValueType } from '@/components/ui/DateRangePicker';
import type { ProductSearchItem } from '@/components/ui/ProductSearchInput';
import type { EntitySearchOption } from '@/components/ui/EntitySearchInput';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { useServerSearch, type ServerSearchPage } from '@/lib/useServerSearch';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { formatThaiDateTime } from '@/lib/utils/format';
import {
  BROADCAST_PLATFORMS,
  BROADCAST_PLATFORM_LIST,
  canBroadcastVia,
  intersectCompose,
  isBroadcastPlatform,
  type BroadcastContentKind,
} from '@/lib/broadcast/platforms';
import {
  audienceLabel,
  buildAudienceFilter,
  commonAudienceOptions,
  describeAudienceRefine,
  type StoredAudienceFilter,
} from '@/lib/broadcast/audience';
import {
  validateBroadcastContent,
  type BroadcastButton,
  type BroadcastContent,
  type BroadcastProductCard,
} from '@/lib/broadcast/content';
import { Send } from 'lucide-react';
import ChannelStep from './components/ChannelStep';
import AudienceStep from './components/AudienceStep';
import ContentStep, { KIND_LABELS } from './components/ContentStep';
import ScheduleStep, { type SendMode } from './components/ScheduleStep';
import SummaryRail from './components/SummaryRail';
import type {
  AudienceCounts,
  BroadcastAccount,
  PerAccountPreview,
  PickedContact,
  PreviewInfo,
  TagRow,
} from './components/types';

/** ตั้งเวลาต้องล่วงหน้าพอให้ผู้ใช้ยกเลิกทัน และไม่ไกลจนลืมว่าตั้งไว้ */
const MIN_SCHEDULE_LEAD_MS = 2 * 60 * 1000;
const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

async function fetchProductPage(q: string): Promise<ServerSearchPage<ProductSearchItem>> {
  const res = await apiFetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=40`);
  if (!res.ok) throw new Error('product search failed');
  const json = await res.json();
  const rows: ProductSearchItem[] = (json.items || []).map((r: Record<string, unknown>) => ({
    id: String(r.variation_id),
    product_id: String(r.product_id),
    code: String(r.code ?? ''),
    name: String(r.name ?? ''),
    image: (r.image_url as string) ?? null,
    variation_label: (r.variation_label as string) ?? undefined,
    default_price: Number(r.default_price) || 0,
    discount_price: Number(r.discount_price) || 0,
  }));
  return { rows, complete: json.complete !== false };
}

/** ชั่วโมงถัดไปเต็มชั่วโมง — ค่าตั้งต้นของ "ตั้งเวลา" ที่ผ่านเกณฑ์ล่วงหน้าเสมอ */
function nextFullHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export default function NewBroadcastPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const { allowed, loading: authLoading } = useAuthGuard('chat.broadcast', { noRedirect: true });

  const [step, setStep] = useState<1 | 2>(1);
  const [accounts, setAccounts] = useState<BroadcastAccount[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  /** เลือกได้หลายบัญชี — เนื้อหาชุดเดียวยิงได้หลาย OA/หลายร้าน (aDay Fresh มี LINE 2 บัญชี) */
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [audience, setAudience] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  /** ผู้ติดต่อที่เลือกเอง — เก็บชื่อไว้ด้วยเพื่อโชว์เป็นชิป (คัดลอกใบเก่ามาจะรู้แค่ id) */
  const [pickedContacts, setPickedContacts] = useState<PickedContact[]>([]);
  /** จำนวนวันของกลุ่ม "ซื้อภายใน N วัน" / "หายไปเกิน N วัน" */
  const [audienceDays, setAudienceDays] = useState(30);
  /** ── ตัวกรองซ้อน: หั่นกลุ่มที่เลือกให้แคบลง (0 = ไม่กรอง) ── */
  const [minMessages, setMinMessages] = useState(0);
  const [lastChatDays, setLastChatDays] = useState(0);

  // ── เนื้อหา (ชนิดกลาง) ────────────────────────────────────────────────
  const [kind, setKind] = useState<BroadcastContentKind>('announce');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  /** รูปของใบที่คัดลอกมา — ใช้ต่อได้เลยเมื่อผู้ใช้ไม่ได้เลือกไฟล์ใหม่ */
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [buttons, setButtons] = useState<BroadcastButton[]>([{ label: '', url: '' }]);
  const [cards, setCards] = useState<BroadcastProductCard[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);

  // ── เวลาส่ง ───────────────────────────────────────────────────────────
  const [sendMode, setSendMode] = useState<SendMode>('now');
  const [scheduleDate, setScheduleDate] = useState<DateValueType>(() => {
    const d = nextFullHour();
    return { startDate: d, endDate: d };
  });
  const [scheduleTime, setScheduleTime] = useState(
    () => `${String(nextFullHour().getHours()).padStart(2, '0')}:00`,
  );

  /** ผลประเมินของบัญชีเดียว (ใช้โชว์รายละเอียดเมื่อเลือกใบเดียว) */
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [perAccount, setPerAccount] = useState<PerAccountPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [counts, setCounts] = useState<AudienceCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(false);
  const [sending, setSending] = useState(false);

  /** มาจาก ?from=<id> — ห้ามให้การเลือกบัญชีอัตโนมัติทับของที่คัดลอกมา */
  const prefillRef = useRef(false);

  const productSearch = useServerSearch<ProductSearchItem>({ fetch: fetchProductPage });

  /** ค้นผู้ติดต่อของ OA ที่เลือก — รายชื่อมีเป็นพัน ต้องค้นฝั่ง server (aDay Fresh 1,409 คน) */
  const contactSearch = useServerSearch<EntitySearchOption>({
    fetch: useCallback(async (q: string) => {
      const accId = accountIds[0] || '';
      const res = await apiFetch(
        `/api/chat/contacts?platform=line&account_id=${accId}&search=${encodeURIComponent(q)}&limit=20`,
      );
      if (!res.ok) throw new Error('contact search failed');
      const json = await res.json();
      const rows: EntitySearchOption[] = (json.contacts || []).map((c: Record<string, unknown>) => ({
        id: String(c.id),
        label: String(c.display_name || 'ไม่ทราบชื่อ'),
        subtitle: (c.customer_name as string) || undefined,
      }));
      return { rows, complete: rows.length < 20 };
    }, [accountIds]),
  });

  const selectedAccounts = useMemo(
    () => accounts.filter(a => accountIds.includes(a.id)),
    [accounts, accountIds],
  );
  const platforms = useMemo(
    () => [...new Set(selectedAccounts.map(a => a.platform))],
    [selectedAccounts],
  );
  /** ใช้ตัดสินเรื่องที่เป็นของแพลตฟอร์มเดียว (สีฟองตัวอย่าง · ข้อความโควตา) */
  const singlePlatform = platforms.length === 1 ? platforms[0] : null;
  const compose = useMemo(() => intersectCompose(platforms), [platforms]);
  const audienceOptions = useMemo(() => commonAudienceOptions(platforms), [platforms]);

  // object URL ต้องคืนทุกครั้งที่เปลี่ยนรูป — สร้างใน render จะรั่วทุกรอบที่ re-render
  useEffect(() => {
    if (!imageFile) { setImagePreviewUrl(null); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // ─── โหลดบัญชีของทุกช่องทางที่ส่งได้ + แท็ก ─────────────────────────
  useEffect(() => {
    if (!allowed) return;
    (async () => {
      try {
        const readyPlatforms = BROADCAST_PLATFORM_LIST.filter(p => canBroadcastVia(p.id)).map(p => p.id);
        const wantsChat = readyPlatforms.some(p => p === 'line' || p === 'facebook' || p === 'instagram');
        const marketplacePlatforms = readyPlatforms.filter(p => p === 'tiktok' || p === 'shopee' || p === 'lazada');

        const [chatRes, tagRes, ...shopResList] = await Promise.all([
          wantsChat ? apiFetch('/api/chat-accounts') : Promise.resolve(null),
          apiFetch('/api/customers/tags'),
          ...marketplacePlatforms.map(p => apiFetch(`/api/marketplace/accounts?platform=${p}`)),
        ]);

        const list: BroadcastAccount[] = [];
        if (chatRes?.ok) {
          const data = await chatRes.json();
          for (const a of data.accounts || []) {
            if (a.is_active && isBroadcastPlatform(a.platform) && canBroadcastVia(a.platform)) {
              // API คืน picture_url ที่ผ่าน resolveAccountPicture() มาแล้ว (รูป OA/เพจ/ร้าน)
              list.push({ id: a.id, platform: a.platform, name: a.account_name, picture_url: a.picture_url ?? null });
            }
          }
        }
        for (let i = 0; i < shopResList.length; i++) {
          const res = shopResList[i];
          if (!res?.ok) continue;
          const shops = await res.json();
          for (const s of Array.isArray(shops) ? shops : []) {
            if (s.is_active) {
              list.push({
                id: s.id,
                platform: marketplacePlatforms[i],
                name: s.shop_name || 'ร้าน',
                picture_url: (s.metadata?.shop_logo as string) || null,
              });
            }
          }
        }

        setAccounts(list);
        if (list.length === 1 && !prefillRef.current) setAccountIds([list[0].id]);

        if (tagRes?.ok) {
          const data = await tagRes.json();
          setTags(data.tags || []);
        }
      } catch {
        showToast('โหลดข้อมูลช่องทางไม่สำเร็จ', 'error');
      }
    })();
  }, [allowed, showToast]);

  // ─── คัดลอกจากใบเก่า (?from=) ────────────────────────────────────────
  // อ่าน query จาก window แทน useSearchParams เพื่อไม่ต้องมี Suspense ครอบทั้งหน้า
  useEffect(() => {
    if (!allowed) return;
    const fromId = new URLSearchParams(window.location.search).get('from');
    if (!fromId) return;
    prefillRef.current = true;
    (async () => {
      try {
        const res = await apiFetch(`/api/broadcasts/${fromId}`);
        if (!res.ok) return;
        const b = (await res.json())?.broadcast;
        if (!b) return;

        const accId = b.chat_account_id || b.marketplace_account_id;
        if (accId) setAccountIds([accId]);
        if (b.audience_type) setAudience(b.audience_type);

        const f: StoredAudienceFilter = b.audience_filter || {};
        if (Number(f.days) > 0) setAudienceDays(Number(f.days));
        if (Number(f.min_messages) > 0) setMinMessages(Number(f.min_messages));
        if (Number(f.last_chat_days) > 0) setLastChatDays(Number(f.last_chat_days));
        if (Array.isArray(f.tag_ids)) setTagIds(f.tag_ids);
        // รู้แค่ id — ชื่อจะขึ้นเป็นชิป "เลือกไว้ N คน" แทนรหัสยาว ๆ ที่อ่านไม่ออก
        if (Array.isArray(f.contact_ids)) {
          setPickedContacts(f.contact_ids.map((id: string) => ({ id, name: '' })));
        }

        const c: BroadcastContent | undefined = b.content;
        if (c) {
          if (c.kind) setKind(c.kind);
          setTitle(c.title || '');
          setText(c.text || '');
          setExistingImageUrl(c.image_url || null);
          if (Array.isArray(c.buttons) && c.buttons.length > 0) setButtons(c.buttons);
          if (Array.isArray(c.products)) setCards(c.products);
          if (Array.isArray(c.quick_replies)) setQuickReplies(c.quick_replies);
        }
      } catch {
        // คัดลอกไม่ได้ก็เริ่มใบเปล่า — ไม่ต้องรบกวนผู้ใช้ด้วย error ที่ทำอะไรต่อไม่ได้
      }
    })();
  }, [allowed]);

  // เปลี่ยนช่องทาง = กลุ่มผู้รับ/ชนิดเนื้อหาชุดเดิมอาจใช้ไม่ได้ → กลับไปตัวแรกที่รองรับ
  // ยังไม่รู้ช่องทาง (ตัวเลือกว่าง) ให้ปล่อยค่าไว้เฉย ๆ ไม่งั้นค่าที่คัดลอกมาจะถูกล้างทิ้ง
  useEffect(() => {
    if (audienceOptions.length === 0) return;
    if (!audienceOptions.some(o => o.key === audience)) setAudience(audienceOptions[0].key);
  }, [audienceOptions, audience]);

  useEffect(() => {
    if (!compose) return;
    if (!compose.kinds.includes(kind)) setKind(compose.kinds[0]);
  }, [compose, kind]);

  // ─── ตัวกรองผู้รับ — preview กับตอนส่งใช้ค่าเดียวกันเสมอ ───────────────
  const audienceFilter = useMemo(() => buildAudienceFilter(audience, {
    tagIds,
    contactIds: pickedContacts.map(c => c.id),
    days: audienceDays,
    minMessages,
    lastChatDays,
  }), [audience, tagIds, pickedContacts, audienceDays, minMessages, lastChatDays]);

  // ─── ประเมินผู้รับ + โควตา ──────────────────────────────────────────
  const runPreview = useCallback(async (
    accs: BroadcastAccount[], aud: string, filter: StoredAudienceFilter,
  ) => {
    if (accs.length === 0 || !aud) { setPreview(null); setPerAccount([]); return; }
    if (aud === 'contacts_pick' && (filter.contact_ids?.length ?? 0) === 0) {
      setPreview(null); setPerAccount([]); return;
    }
    setPreviewLoading(true);
    try {
      // ถามทีละบัญชีแล้วรวมยอด — โควตาเป็นของแต่ละ OA จึงต้องเช็คแยกใบ
      const results = await Promise.all(accs.map(async (a) => {
        const res = await apiFetch('/api/broadcasts/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: a.platform,
            account_id: a.id,
            audience_type: aud,
            audience_filter: filter,
          }),
        });
        if (!res.ok) return null;
        return { account: a, info: (await res.json()) as PreviewInfo };
      }));

      const ok = results.filter((r): r is PerAccountPreview => !!r);
      setPerAccount(ok);
      setPreview(ok.length === 1 ? ok[0].info : null);
    } catch {
      setPreview(null);
      setPerAccount([]);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const debouncedPreview = useDebouncedCallback(runPreview, 400);

  useEffect(() => {
    if (!allowed) return;
    debouncedPreview(selectedAccounts, audience, audienceFilter);
  }, [allowed, selectedAccounts, audience, audienceFilter, debouncedPreview]);

  // ─── จำนวนคนของทุกกลุ่ม (โชว์คู่รายการตัวเลือก) ──────────────────────
  const loadCounts = useCallback(async (accs: BroadcastAccount[], dayCount: number) => {
    // นับแยกกลุ่มได้เฉพาะตอนเลือกบัญชีเดียว — หลายบัญชีรายชื่อคนละชุด รวมยอดแล้วอ่านผิด
    if (accs.length !== 1) { setCounts(null); return; }
    const a = accs[0];
    setCountsLoading(true);
    try {
      const res = await apiFetch(
        `/api/broadcasts/audience-counts?platform=${a.platform}&account_id=${a.id}&days=${dayCount}`,
      );
      // ปลายทางยังไม่พร้อม/ตอบไม่ได้ = โชว์ '—' ห้ามทำให้ทั้งหน้าพัง
      setCounts(res.ok ? await res.json() : null);
    } catch {
      setCounts(null);
    } finally {
      setCountsLoading(false);
    }
  }, []);

  const debouncedCounts = useDebouncedCallback(loadCounts, 400);

  useEffect(() => {
    if (!allowed) return;
    debouncedCounts(selectedAccounts, audienceDays);
  }, [allowed, selectedAccounts, audienceDays, debouncedCounts]);

  // ─── สรุปสิ่งที่จะเกิดขึ้น ────────────────────────────────────────────
  const recipientCount = perAccount.reduce((n, r) => n + r.info.recipient_count, 0);
  const quota = preview?.quota ?? null;
  /** บัญชีที่โควตาไม่พอ — ต้องเช็คแยกใบเพราะโควตาเป็นของแต่ละ OA */
  const shortAccounts = perAccount.filter(r =>
    r.info.quota?.type === 'limited'
    && r.info.quota.remaining !== null
    && r.info.quota.remaining < r.info.recipient_count);
  const quotaShort = shortAccounts.length > 0;

  const quotaText = useMemo(() => {
    if (!quota || quota.type === 'unknown') return null;
    if (quota.type === 'none') return `ใช้ไป ${quota.used.toLocaleString()} ข้อความเดือนนี้ (ไม่จำกัด)`;
    return `โควตาเดือนนี้ ${quota.used.toLocaleString()}/${(quota.limit ?? 0).toLocaleString()}`;
  }, [quota]);

  /** เนื้อหาที่จะส่ง — รูปยังไม่ได้อัปโหลด ใช้ค่าแทนไปก่อนเพื่อให้ตรวจได้ */
  const draftContent: BroadcastContent = useMemo(() => ({
    kind,
    title: title.trim(),
    text: text.trim(),
    image_url: imageFile ? 'https://pending.upload' : existingImageUrl,
    buttons: buttons.filter(b => b.label.trim() || b.url.trim()),
    products: cards,
    quick_replies: quickReplies,
  }), [kind, title, text, imageFile, existingImageUrl, buttons, cards, quickReplies]);

  // ตรวจด้วยฟังก์ชันเดียวกับที่ API ใช้ — หน้าจอกับ server จึงพูดตรงกันเสมอ
  // เนื้อหาชุดเดียวต้องผ่าน **ทุกช่องทางที่เลือก** — ตัวไหนไม่ผ่านก็บอกตัวนั้น
  const contentError = platforms
    .map(p => validateBroadcastContent(p, draftContent))
    .find(Boolean) ?? null;

  // ─── เวลาส่ง ─────────────────────────────────────────────────────────
  const scheduledAt = useMemo(() => {
    if (sendMode !== 'schedule') return null;
    const raw = scheduleDate?.startDate;
    if (!raw) return null;
    const base = raw instanceof Date ? new Date(raw) : new Date(raw);
    if (isNaN(base.getTime())) return null;
    const [h, m] = (scheduleTime || '00:00').split(':').map(Number);
    base.setHours(h || 0, m || 0, 0, 0);
    return base;
  }, [sendMode, scheduleDate, scheduleTime]);

  const scheduleError = useMemo(() => {
    if (sendMode !== 'schedule') return null;
    if (!scheduledAt) return 'เลือกวันและเวลาที่จะส่งก่อน';
    const now = Date.now();
    if (scheduledAt.getTime() < now + MIN_SCHEDULE_LEAD_MS) return 'ตั้งเวลาล่วงหน้าอย่างน้อย 2 นาที';
    if (scheduledAt.getTime() > now + MAX_SCHEDULE_AHEAD_MS) return 'ตั้งเวลาล่วงหน้าได้ไม่เกิน 90 วัน';
    return null;
  }, [sendMode, scheduledAt]);

  // โหมด 'all' ของ LINE ยิงผ่าน broadcast API ไม่ต้องมีรายชื่อของเรา
  const pickPending = audience === 'contacts_pick' && pickedContacts.length === 0;
  const noRecipients = audience !== 'all' && !pickPending && !previewLoading
    && platforms.length > 0 && recipientCount === 0;
  const hasDraft = !!(text.trim() || title.trim() || imagePreviewUrl || existingImageUrl || cards.length > 0);
  const canNext = accountIds.length > 0 && !!audience && !pickPending;
  const canSend = canNext && !contentError && !quotaShort && !noRecipients && !scheduleError && !sending;

  const contactTotal = counts?.contact_total ?? preview?.contact_total ?? null;
  const contactLinked = counts?.contact_linked ?? preview?.contact_linked ?? null;

  /** ป้ายสรุปในแผงขวา — ค่าว่างจะขึ้นเป็น "ยังไม่ได้เลือก" แบบจาง */
  const contentSummary = useMemo(() => {
    if (!hasDraft) return '';
    const base = KIND_LABELS[kind];
    if (kind === 'promo') {
      const n = buttons.filter(b => b.label.trim()).length;
      return n > 0 ? `${base} · ${n} ปุ่ม` : base;
    }
    if (kind === 'products') return cards.length > 0 ? `${base} · ${cards.length} ชิ้น` : base;
    return base;
  }, [hasDraft, kind, buttons, cards]);

  // ─── ส่ง ─────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!canSend) return;
    const via = selectedAccounts.length === 1
      ? selectedAccounts[0].name
      : `${selectedAccounts.length} ช่องทาง (${selectedAccounts.map(a => a.name).join(' · ')})`;

    const ok = await confirm({
      title: scheduledAt ? 'ตั้งเวลาส่งบรอดแคสต์' : 'ส่งบรอดแคสต์',
      description: scheduledAt
        ? `ตั้งเวลาส่งถึง ${recipientCount.toLocaleString()} คน ผ่าน ${via} เวลา ${formatThaiDateTime(scheduledAt)}?`
        : `ส่งถึง ${recipientCount.toLocaleString()} คน ผ่าน ${via}? ข้อความจะถูกส่งทันที`,
      confirmLabel: scheduledAt ? 'ตั้งเวลาส่ง' : 'ส่งบรอดแคสต์',
      confirmIcon: <Send className="w-4 h-4" />,
    });
    if (!ok) return;

    setSending(true);
    try {
      // อัปโหลดรูปครั้งเดียวแล้วใช้ร่วมทุกช่องทาง — อัปซ้ำต่อช่องทางคือเปลืองเปล่า ๆ
      let imageUrl: string | null = existingImageUrl;
      if (compose?.image && imageFile) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        const ext = (imageFile.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const path = `broadcast-images/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-media')
          .upload(path, imageFile, { contentType: imageFile.type || 'image/jpeg' });
        if (uploadError) throw new Error('อัปโหลดรูปไม่สำเร็จ');
        imageUrl = supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
      }

      // หนึ่งบัญชี = บรอดแคสต์หนึ่งใบ — แต่ละใบมีสถานะ/ปุ่มส่งต่อของตัวเอง
      // ใบไหนล้มก็ล้มเฉพาะใบนั้น ไม่ลากใบที่ส่งไปแล้วลงไปด้วย
      const results = await Promise.all(selectedAccounts.map(async (a) => {
        try {
          const res = await apiFetch('/api/broadcasts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: a.platform,
              account_id: a.id,
              audience_type: audience,
              audience_filter: audienceFilter,
              content: { ...draftContent, image_url: imageUrl },
              ...(scheduledAt ? { scheduled_at: scheduledAt.toISOString() } : {}),
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { name: a.name, error: err.error || 'ส่งไม่สำเร็จ' };
          }
          return { name: a.name, error: null };
        } catch {
          return { name: a.name, error: 'ส่งไม่สำเร็จ' };
        }
      }));

      const failed = results.filter(r => r.error);
      if (failed.length === results.length) {
        throw new Error(failed[0].error || 'ส่งบรอดแคสต์ไม่สำเร็จ');
      }
      if (failed.length > 0) {
        // ส่งได้บางช่องทาง — ต้องบอกให้ครบว่าอันไหนไม่ผ่านเพราะอะไร ไม่ใช่แค่ "สำเร็จ"
        showToast(`ส่งแล้ว ${results.length - failed.length}/${results.length} ช่องทาง · ไม่สำเร็จ: ${failed.map(f => `${f.name} (${f.error})`).join(' · ')}`, 'error');
      } else if (scheduledAt) {
        const when = formatThaiDateTime(scheduledAt);
        showToast(
          results.length > 1
            ? `ตั้งเวลาส่งแล้ว ${when} · ${results.length} ช่องทาง`
            : `ตั้งเวลาส่งแล้ว ${when}`,
          'success',
        );
      } else {
        showToast(results.length > 1 ? `เริ่มส่งแล้ว ${results.length} ช่องทาง` : 'เริ่มส่งบรอดแคสต์แล้ว', 'success');
      }
      router.push('/marketing/broadcast');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ส่งบรอดแคสต์ไม่สำเร็จ', 'error');
      setSending(false);
    }
  };

  const addProductCard = (p: ProductSearchItem) => {
    // เช็คซ้ำด้วย variation ไม่ใช่ product — สินค้าตัวเดียวมีหลายสี/ขนาดที่ product_id
    // เดียวกัน (YOYO 0+ มี 5 สี) เช็คด้วย product_id จะเลือกได้แค่สีเดียว
    if (cards.some(c => c.variation_id === p.id)) return;
    if (compose && cards.length >= compose.productsMax) {
      showToast(`ใส่ได้ไม่เกิน ${compose.productsMax} ชิ้น`, 'error');
      return;
    }
    const price = p.discount_price && p.discount_price > 0 ? p.discount_price : p.default_price ?? 0;
    setCards(prev => [...prev, {
      product_id: p.product_id,
      variation_id: p.id,
      // ชื่อบนการ์ดต้องแยกสีออกจากกัน ไม่งั้นได้การ์ด "YOYO 0+ Newborn Pack" 5 ใบเหมือนกันหมด
      name: p.variation_label ? `${p.name} - ${p.variation_label}` : p.name,
      image_url: p.image ?? null,
      price,
      url: null,
    }]);
  };

  if (authLoading) {
    return <Layout><Container size="6xl"><LoadingCard /></Container></Layout>;
  }
  if (!allowed) {
    return <Layout><Container size="6xl"><NoPermissionCard /></Container></Layout>;
  }

  return (
    <Layout>
      {confirmDialog}
      <Container size="6xl">
        <PageHeader
          backHref="/marketing/broadcast"
          title="สร้างบรอดแคสต์"
          subtitle="ส่งจากระบบนี้ จึงเก็บไว้ครบว่าส่งอะไรถึงใคร และใครตอบกลับ"
        />

        {/* ฟอร์มซ้าย · สรุป+ตัวอย่างขวาแบบตรึง — จอแคบเรียงลงเป็นคอลัมน์เดียวตามลำดับเดิม */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_372px] gap-4 items-start">
          <div className="space-y-4">
            <Card padding="md">
              <Stepper
                ariaLabel="ขั้นตอนสร้างบรอดแคสต์"
                onSelect={k => setStep(Number(k) as 1 | 2)}
                allowJumpAhead
                steps={[
                  {
                    key: '1',
                    label: 'ส่งถึงใคร',
                    note: 'ช่องทาง + กลุ่มเป้าหมาย',
                    state: step === 1 ? 'current' : 'done',
                  },
                  {
                    key: '2',
                    label: 'ส่งอะไร เมื่อไหร่',
                    note: 'เนื้อหา + เวลาส่ง',
                    state: step === 2 ? 'current' : 'todo',
                  },
                ]}
              />
            </Card>

            {step === 1 ? (
              <>
                <ChannelStep
                  accounts={accounts}
                  value={accountIds}
                  onChange={setAccountIds}
                  disabled={sending}
                />
                {platforms.length > 0 && (
                  <AudienceStep
                    options={audienceOptions}
                    audience={audience}
                    onAudienceChange={setAudience}
                    counts={counts}
                    countsLoading={countsLoading}
                    countsUnavailable={selectedAccounts.length !== 1}
                    contactTotal={contactTotal}
                    contactLinked={contactLinked}
                    days={audienceDays}
                    onDaysChange={setAudienceDays}
                    tags={tags}
                    tagIds={tagIds}
                    onTagIdsChange={setTagIds}
                    contactResults={contactSearch.results}
                    contactLoading={contactSearch.loading}
                    onContactSearch={contactSearch.search}
                    pickedContacts={pickedContacts}
                    onPickedContactsChange={setPickedContacts}
                    multiAccount={accountIds.length > 1}
                    minMessages={minMessages}
                    onMinMessagesChange={setMinMessages}
                    lastChatDays={lastChatDays}
                    onLastChatDaysChange={setLastChatDays}
                    disabled={sending}
                  />
                )}
              </>
            ) : (
              <>
                {compose && (
                  <ContentStep
                    compose={compose}
                    platformLabel={singlePlatform ? BROADCAST_PLATFORMS[singlePlatform].label : 'ช่องทางที่เลือก'}
                    showCreditNote={platforms.includes('line')}
                    kind={kind}
                    onKindChange={setKind}
                    title={title}
                    onTitleChange={setTitle}
                    text={text}
                    onTextChange={setText}
                    imageFile={imageFile}
                    onImageFileChange={(f) => {
                      setImageFile(f);
                      // กดเอารูปออก = เอารูปของใบที่คัดลอกมาออกด้วย ไม่งั้นมันจะกลับมาเงียบ ๆ ตอนส่ง
                      if (!f) setExistingImageUrl(null);
                    }}
                    existingImageUrl={existingImageUrl}
                    buttons={buttons}
                    onButtonsChange={setButtons}
                    cards={cards}
                    onCardsChange={setCards}
                    quickReplies={quickReplies}
                    onQuickRepliesChange={setQuickReplies}
                    productResults={productSearch.results}
                    productLoading={productSearch.loading}
                    onProductSearch={productSearch.search}
                    onAddProduct={addProductCard}
                    disabled={sending}
                  />
                )}
                <ScheduleStep
                  mode={sendMode}
                  onModeChange={setSendMode}
                  date={scheduleDate}
                  onDateChange={setScheduleDate}
                  time={scheduleTime}
                  onTimeChange={setScheduleTime}
                  scheduledAt={scheduledAt}
                  error={scheduleError}
                  disabled={sending}
                />
              </>
            )}
          </div>

          <SummaryRail
            step={step}
            recipientCount={recipientCount}
            previewLoading={previewLoading}
            contactTotal={contactTotal}
            hideProgress={audience === 'all'}
            quotaText={quotaText}
            followerStats={preview?.follower_stats ?? null}
            showFollowerStats={audience === 'all'}
            perAccount={perAccount}
            shortAccounts={shortAccounts}
            noRecipientsMessage={noRecipients
              ? (singlePlatform === 'tiktok'
                ? 'ไม่มีผู้รับ — TikTok ให้ทักได้เฉพาะลูกค้าที่สั่งใน 365 วัน'
                : 'ไม่มีผู้รับที่ตรงเงื่อนไข — เลือกกลุ่มอื่นหรือเพิ่มแท็กก่อน')
              : null}
            contentError={contentError}
            hasDraft={hasDraft}
            showLineCreditNote={platforms.includes('line')}
            channelSummary={selectedAccounts.map(a => a.name).join(' · ')}
            audienceSummary={platforms.length > 0 && audience ? audienceLabel(audience, audienceFilter) : ''}
            refineSummary={describeAudienceRefine(audienceFilter)}
            contentSummary={contentSummary}
            scheduleSummary={sendMode === 'now'
              ? 'ทันที'
              : (scheduledAt && !scheduleError ? formatThaiDateTime(scheduledAt) : '')}
            content={draftContent}
            previewPlatform={singlePlatform}
            imagePreviewUrl={imagePreviewUrl ?? existingImageUrl}
            scheduled={sendMode === 'schedule'}
            sending={sending}
            canNext={canNext}
            canSend={canSend}
            onCancel={() => router.push('/marketing/broadcast')}
            onNext={() => setStep(2)}
            onBack={() => setStep(1)}
            onSend={handleSend}
          />
        </div>
      </Container>
    </Layout>
  );
}
