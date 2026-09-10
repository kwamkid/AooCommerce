// Path: app/marketing/broadcast/new/page.tsx
//
// สร้างบรอดแคสต์ — เดินสองขั้น: **ส่งถึงใคร** แล้ว **ส่งอะไร เมื่อไหร่**
//
// หน้าเป็นเจ้าของ state ทั้งหมด การ์ดใน ./components รับค่าเข้ามาแล้วคืนกลับ —
// จำนวนผู้รับ โควตา และตัวอย่างข้อความอยู่ในแผงขวาที่ตรึงไว้ เพราะเป็นสองสิ่งที่ต้องเห็น
// ตลอดเวลาที่แก้เนื้อหา ไม่ใช่ต้องเลื่อนกลับขึ้นไปดู
//
// เนื้อหาเป็น **บล็อก** (BlocksEditor · kind 'blocks' ตั้งแต่ 11 ก.ย. 2026) — รูปขึ้น storage ตอนกดส่งเท่านั้น
// ใบเก่าที่กด "ส่งซ้ำ" (?from=) แปลงเป็นบล็อกให้ด้วย contentToEditor()
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
import { useServerSearch } from '@/lib/useServerSearch';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { formatThaiDateTime } from '@/lib/utils/format';
import {
  BROADCAST_PLATFORM_LIST,
  canBroadcastVia,
  intersectCompose,
  isBroadcastPlatform,
} from '@/lib/broadcast/platforms';
import {
  audienceLabel,
  buildAudienceFilter,
  commonAudienceOptions,
  describeAudienceRefine,
  type StoredAudienceFilter,
} from '@/lib/broadcast/audience';
import { blocksSummary, validateBroadcastContent, type BroadcastContent } from '@/lib/broadcast/content';
import { Send } from 'lucide-react';
import ChannelStep from './components/ChannelStep';
import AudienceStep from './components/AudienceStep';
import BlocksEditor from './components/BlocksEditor';
import ScheduleStep, { type SendMode } from './components/ScheduleStep';
import SummaryRail from './components/SummaryRail';
import {
  contentToEditor, draftImage, editorBlocksError, editorFiles, editorToContent, hasEditorContent,
  measureImageDims, newBlock, previewImage, uploadedImage, type EditorBlock,
} from './components/blocks-model';
import { fetchProductPage, productSearchItemToCard } from './components/product-search';
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

/** ชั่วโมงถัดไปเต็มชั่วโมง — ค่าตั้งต้นของ "ตั้งเวลา" ที่ผ่านเกณฑ์ล่วงหน้าเสมอ */
function nextFullHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

/** กลุ่มที่ /audience-counts นับไว้แล้ว — เลือกกลุ่มพวกนี้ (ไม่มีตัวกรองซ้อน) ไม่ต้องยิง /preview */
const COUNTED_AUDIENCES = new Set([
  'not_bought', 'bought', 'bought_before', 'bought_within', 'bought_once', 'contacts', 'all',
]);
/** กลุ่มที่ตัวเลขขึ้นกับจำนวนวัน — ต้องรอชุดนับของจำนวนวันปัจจุบัน */
const DAY_AUDIENCES = new Set(['bought_before', 'bought_within']);

/**
 * ผลประเมินผู้รับจากชุดนับทุกกลุ่ม — ค่าเดียวกับที่ /preview คืน (นับด้วยกติกาตัวเดียวกัน)
 * 'all' ยิงถึงผู้ติดตามทุกคน: ผู้รับ = ยิงถึงได้จริงของ LINE · รายชื่อที่เรารู้ = ผู้ติดต่อทั้งหมด
 */
function previewFromCounts(c: AudienceCounts, audience: string): PreviewInfo | null {
  const known = audience === 'all' ? c.counts.contacts : c.counts[audience];
  if (typeof known !== 'number') return null;
  return {
    recipient_count: audience === 'all' ? (c.follower_stats?.reachable ?? known) : known,
    known_contact_count: known,
    quota: c.quota ?? null,
    follower_stats: audience === 'all' ? (c.follower_stats ?? null) : null,
    window_days: null,
    contact_total: c.contact_total ?? undefined,
    contact_linked: c.contact_linked ?? undefined,
  };
}

export default function NewBroadcastPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const { allowed, loading: authLoading } = useAuthGuard('chat.broadcast', { noRedirect: true });

  const [step, setStep] = useState<1 | 2>(1);
  const [accounts, setAccounts] = useState<BroadcastAccount[]>([]);
  /** ยังโหลดรายชื่อบัญชีไม่เสร็จ — การ์ดช่องทางวาดโครงแทนข้อความ "ยังไม่มีช่องทาง" */
  const [accountsLoading, setAccountsLoading] = useState(true);
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

  // ── เนื้อหา (บล็อก) ─────────────────────────────────────────────────
  // ของที่ยังไม่ได้บันทึก (ไฟล์ที่ยังไม่อัป · object URL) อยู่ในตัวแก้ไข — แปลงเป็น content ตอนตรวจ/ส่ง
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => [newBlock('text')]);
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
  /**
   * จำนวนคนต่อกลุ่ม (+ โควตา/ผู้ติดตาม) — จดว่าเป็นของบัญชีไหน กี่วัน จะได้ไม่เอาชุดของบัญชีเก่า
   * มาแสดงระหว่างรอชุดใหม่ · กลุ่มพื้นฐานใช้ชุดนี้แทน /preview ได้เลย
   */
  const [countsState, setCountsState] = useState<{ accountId: string; days: number; data: AudienceCounts } | null>(null);
  const [countsLoading, setCountsLoading] = useState(false);
  /** บัญชีที่นับทุกกลุ่มไม่สำเร็จ — ตกไปใช้ /preview ตามเดิม */
  const [countsErrorFor, setCountsErrorFor] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /** ร้านเปิดหน้าร้านออนไลน์แล้วไหม — "ไปที่สินค้า" ใช้ได้เฉพาะตอนเปิดแล้ว · การ์ดจากสินค้าตั้งปุ่มตามนี้ */
  const [storefrontOpen, setStorefrontOpen] = useState(false);

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
  /** ใช้ตัดสินเรื่องที่เป็นของแพลตฟอร์มเดียว (สีในตัวอย่างแชท · ข้อความโควตา) */
  const singlePlatform = platforms.length === 1 ? platforms[0] : null;
  const compose = useMemo(() => intersectCompose(platforms), [platforms]);
  const audienceOptions = useMemo(() => commonAudienceOptions(platforms), [platforms]);

  // ร้านเปิดหน้าร้านออนไลน์หรือยัง — ชิป "ไปที่สินค้า" ปิดไว้พร้อมบอกเหตุผลถ้ายังไม่เปิด
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/settings/storefront');
        if (!res.ok) return;
        const j = await res.json();
        if (!cancelled) setStorefrontOpen(!!j?.storefront?.enabled && !!j?.slug);
      } catch {
        // ถามไม่ได้ = ถือว่ายังไม่เปิด — API ยังกันซ้ำตอนสร้างใบอยู่ดี
      }
    })();
    return () => { cancelled = true; };
  }, [allowed]);

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
      } finally {
        setAccountsLoading(false);
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
          // ใบเก่าทุกชนิดแปลงเป็นบล็อก (ประกาศ → ข้อความ + รูป · โปสเตอร์ → ข้อความ + รูปเต็มจอ · …)
          const editor = contentToEditor(c);
          setBlocks(editor.blocks.length > 0 ? editor.blocks : [newBlock('text')]);
          setQuickReplies(editor.quickReplies);
          // รูปเต็มจอของใบเก่าที่ยังไม่ได้เก็บขนาด — วัดจากรูปเดิม ไม่งั้นตกไปใช้ทรงเริ่มต้น
          for (const eb of editor.blocks) {
            if (eb.type !== 'rich' || !eb.existingUrl || (eb.width && eb.height)) continue;
            const url = eb.existingUrl;
            measureImageDims(url).then(dims => {
              if (!dims) return;
              setBlocks(prev => prev.map(x => (
                x.id === eb.id && x.type === 'rich' && x.existingUrl === url ? { ...x, ...dims } : x
              )));
            });
          }
        }
      } catch {
        // คัดลอกไม่ได้ก็เริ่มใบเปล่า — ไม่ต้องรบกวนผู้ใช้ด้วย error ที่ทำอะไรต่อไม่ได้
      }
    })();
  }, [allowed]);

  // เปลี่ยนช่องทาง = กลุ่มผู้รับชุดเดิมอาจใช้ไม่ได้ → กลับไปตัวแรกที่รองรับ
  // ยังไม่รู้ช่องทาง (ตัวเลือกว่าง) ให้ปล่อยค่าไว้เฉย ๆ ไม่งั้นค่าที่คัดลอกมาจะถูกล้างทิ้ง
  useEffect(() => {
    if (audienceOptions.length === 0) return;
    if (!audienceOptions.some(o => o.key === audience)) setAudience(audienceOptions[0].key);
  }, [audienceOptions, audience]);

  // ─── ตัวกรองผู้รับ — preview กับตอนส่งใช้ค่าเดียวกันเสมอ ───────────────
  const audienceFilter = useMemo(() => buildAudienceFilter(audience, {
    tagIds,
    contactIds: pickedContacts.map(c => c.id),
    days: audienceDays,
    minMessages,
    lastChatDays,
  }), [audience, tagIds, pickedContacts, audienceDays, minMessages, lastChatDays]);

  // ─── ประเมินผู้รับ + โควตา ──────────────────────────────────────────
  const previewSeqRef = useRef(0);
  const runPreview = useCallback(async (
    accs: BroadcastAccount[], aud: string, filter: StoredAudienceFilter,
  ) => {
    // ผลของรอบเก่าที่กลับมาช้ากว่ารอบใหม่ต้องถูกทิ้ง — ไม่งั้นตัวเลขกระโดดกลับไปเป็นของกลุ่มก่อนหน้า
    const seq = ++previewSeqRef.current;
    if (accs.length === 0 || !aud || (aud === 'contacts_pick' && (filter.contact_ids?.length ?? 0) === 0)) {
      setPreview(null);
      setPerAccount([]);
      setPreviewLoading(false);
      return;
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

      if (seq !== previewSeqRef.current) return;
      const ok = results.filter((r): r is PerAccountPreview => !!r);
      setPerAccount(ok);
      setPreview(ok.length === 1 ? ok[0].info : null);
    } catch {
      if (seq !== previewSeqRef.current) return;
      setPreview(null);
      setPerAccount([]);
    } finally {
      if (seq === previewSeqRef.current) setPreviewLoading(false);
    }
  }, []);

  const debouncedPreview = useDebouncedCallback(runPreview, 400);

  /**
   * กลุ่มพื้นฐานของบัญชี LINE เดียวที่ไม่มีตัวกรองซ้อน = รู้ผู้รับ/โควตาจากชุดนับทุกกลุ่มแล้ว
   * ไม่ต้องยิง /preview (เดิมยิงทุกครั้งที่เปิดหน้าและทุกครั้งที่กดเปลี่ยนกลุ่ม ซ้ำกับชุดนับ)
   * ชุดนับของบัญชีนี้ล้ม → ตกไปใช้ /preview ตามเดิม
   */
  const singleAccount = selectedAccounts.length === 1 ? selectedAccounts[0] : null;
  const refineActive = (audienceFilter.min_messages ?? 0) > 0 || (audienceFilter.last_chat_days ?? 0) > 0;
  const countsFromTable = !!singleAccount && singleAccount.platform === 'line'
    && COUNTED_AUDIENCES.has(audience) && !refineActive
    && countsErrorFor !== singleAccount.id;
  const countsForAccount = singleAccount && countsState?.accountId === singleAccount.id ? countsState.data : null;
  const countsDays = countsState?.days ?? null;
  const derivedPreview = useMemo<PreviewInfo | null>(() => {
    if (!countsFromTable || !countsForAccount) return null;
    // กลุ่มที่นับตามจำนวนวันต้องรอชุดของจำนวนวันปัจจุบัน
    if (DAY_AUDIENCES.has(audience) && countsDays !== audienceDays) return null;
    return previewFromCounts(countsForAccount, audience);
  }, [countsFromTable, countsForAccount, countsDays, audience, audienceDays]);

  // เลือกบัญชี/กลุ่ม = ถามทันที · พิมพ์จำนวนวัน/ตัวกรอง = รอผู้ใช้หยุดก่อน (debounce)
  const previewKeyRef = useRef('');
  useEffect(() => {
    if (!allowed) return;
    if (countsFromTable) { debouncedPreview.cancel(); return; }
    const key = `${selectedAccounts.map(a => a.id).join(',')}|${audience}`;
    if (key !== previewKeyRef.current) {
      previewKeyRef.current = key;
      debouncedPreview.now(selectedAccounts, audience, audienceFilter);
    } else {
      debouncedPreview(selectedAccounts, audience, audienceFilter);
    }
  }, [allowed, countsFromTable, selectedAccounts, audience, audienceFilter, debouncedPreview]);

  // ─── จำนวนคนของทุกกลุ่ม (โชว์คู่รายการตัวเลือก) ──────────────────────
  const countsSeqRef = useRef(0);
  const loadCounts = useCallback(async (accs: BroadcastAccount[], dayCount: number) => {
    const seq = ++countsSeqRef.current;
    // นับแยกกลุ่มได้เฉพาะตอนเลือกบัญชีเดียว — หลายบัญชีรายชื่อคนละชุด รวมยอดแล้วอ่านผิด
    if (accs.length !== 1) { setCountsState(null); setCountsLoading(false); return; }
    const a = accs[0];
    setCountsLoading(true);
    try {
      const res = await apiFetch(
        `/api/broadcasts/audience-counts?platform=${a.platform}&account_id=${a.id}&days=${dayCount}`,
      );
      const data = res.ok ? ((await res.json()) as AudienceCounts) : null;
      if (seq !== countsSeqRef.current) return;
      // ตอบไม่ได้ = ไม่มีตัวเลขต่อกลุ่ม (ห้ามเดา 0) และแผงสรุปตกไปใช้ /preview แทน
      setCountsState(data ? { accountId: a.id, days: dayCount, data } : null);
      setCountsErrorFor(data ? null : a.id);
    } catch {
      if (seq !== countsSeqRef.current) return;
      setCountsState(null);
      setCountsErrorFor(a.id);
    } finally {
      if (seq === countsSeqRef.current) setCountsLoading(false);
    }
  }, []);

  const debouncedCounts = useDebouncedCallback(loadCounts, 400);

  // เปลี่ยนบัญชี = นับทันที · เปลี่ยนจำนวนวัน (พิมพ์/กดชิป) = รอผู้ใช้หยุดก่อน
  const countsKeyRef = useRef('');
  useEffect(() => {
    if (!allowed) return;
    const key = selectedAccounts.map(a => a.id).join(',');
    if (key !== countsKeyRef.current) {
      countsKeyRef.current = key;
      debouncedCounts.now(selectedAccounts, audienceDays);
    } else {
      debouncedCounts(selectedAccounts, audienceDays);
    }
  }, [allowed, selectedAccounts, audienceDays, debouncedCounts]);

  // ─── สรุปสิ่งที่จะเกิดขึ้น — มาจากชุดนับทุกกลุ่ม (กลุ่มพื้นฐาน) หรือจาก /preview (กรณีอื่น) ───
  const effPerAccount: PerAccountPreview[] = countsFromTable
    ? (derivedPreview && singleAccount ? [{ account: singleAccount, info: derivedPreview }] : [])
    : perAccount;
  const effPreview = countsFromTable ? derivedPreview : preview;
  const effPreviewLoading = countsFromTable ? !derivedPreview : previewLoading;
  const recipientCount = effPerAccount.reduce((n, r) => n + r.info.recipient_count, 0);
  const quota = effPreview?.quota ?? null;
  /** บัญชีที่โควตาไม่พอ — ต้องเช็คแยกใบเพราะโควตาเป็นของแต่ละ OA */
  const shortAccounts = effPerAccount.filter(r =>
    r.info.quota?.type === 'limited'
    && r.info.quota.remaining !== null
    && r.info.quota.remaining < r.info.recipient_count);
  const quotaShort = shortAccounts.length > 0;

  const quotaText = useMemo(() => {
    if (!quota || quota.type === 'unknown') return null;
    if (quota.type === 'none') return `ใช้ไป ${quota.used.toLocaleString()} ข้อความเดือนนี้ (ไม่จำกัด)`;
    return `โควตาเดือนนี้ ${quota.used.toLocaleString()}/${(quota.limit ?? 0).toLocaleString()}`;
  }, [quota]);

  /** เนื้อหาที่จะตรวจ — รูปที่ยังไม่อัปใช้ค่าแทน https ไปก่อน (อัปจริงตอนกดส่งเท่านั้น) */
  const draftContent = useMemo(() => editorToContent(blocks, quickReplies, draftImage), [blocks, quickReplies]);
  /** ตัวอย่างในแชทต้องเห็นรูปที่ยังไม่ได้อัป — ใช้ object URL ของไฟล์แทน */
  const previewContent = useMemo(() => editorToContent(blocks, quickReplies, previewImage), [blocks, quickReplies]);

  // ตรวจด้วยฟังก์ชันเดียวกับที่ API ใช้ — หน้าจอกับ server จึงพูดตรงกันเสมอ
  // เนื้อหาชุดเดียวต้องผ่าน **ทุกช่องทางที่เลือก** — ตัวไหนไม่ผ่านก็บอกตัวนั้น
  // (การ์ดแท็บ "สินค้าในร้าน" ที่ยังไม่เลือกสินค้าบอกตรง ๆ ก่อน — ตัวตรวจกลางเห็นแค่การ์ดเปล่า)
  const contentError = editorBlocksError(blocks)
    ?? platforms.map(p => validateBroadcastContent(p, draftContent)).find(Boolean)
    ?? null;

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
  const noRecipients = audience !== 'all' && !pickPending && !effPreviewLoading
    && platforms.length > 0 && recipientCount === 0;
  const hasDraft = hasEditorContent(blocks);
  const canNext = accountIds.length > 0 && !!audience && !pickPending;
  const canSend = canNext && !contentError && !quotaShort && !noRecipients && !scheduleError && !sending;

  const contactTotal = countsForAccount?.contact_total ?? preview?.contact_total ?? null;
  const contactLinked = countsForAccount?.contact_linked ?? preview?.contact_linked ?? null;

  /** ป้ายสรุปในแผงขวา — "ข้อความ + รูปเต็มจอ + การ์ด 3 ใบ" · ค่าว่างขึ้นเป็น "ยังไม่ได้เลือก" แบบจาง */
  const contentSummary = hasDraft ? blocksSummary(draftContent.blocks || []) : '';

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
      const uploadImage = async (file: File): Promise<string> => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const path = `broadcast-images/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-media')
          .upload(path, file, { contentType: file.type || 'image/jpeg' });
        if (uploadError) throw new Error('อัปโหลดรูปไม่สำเร็จ');
        return supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
      };
      // ขึ้น storage ตอนนี้เท่านั้น — ก่อนกดส่งรูปแค่ย่ออยู่ในเครื่อง · ไฟล์เดียวกันอัปครั้งเดียว
      const urls = new Map<File, string>();
      await Promise.all([...new Set(editorFiles(blocks))].map(async f => { urls.set(f, await uploadImage(f)); }));
      const content = editorToContent(blocks, quickReplies, uploadedImage(urls));

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
              content,
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
                  loading={accountsLoading}
                  value={accountIds}
                  onChange={setAccountIds}
                  disabled={sending}
                />
                {/* ระหว่างโหลดบัญชีจองที่ของการ์ดกลุ่มเป้าหมายไว้ — หน้าไม่เด้งตอนข้อมูลมาถึง */}
                {accountsLoading && <LoadingCard />}
                {!accountsLoading && platforms.length > 0 && (
                  <AudienceStep
                    options={audienceOptions}
                    audience={audience}
                    onAudienceChange={setAudience}
                    counts={countsForAccount}
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
                  <BlocksEditor
                    blocks={blocks}
                    onBlocksChange={setBlocks}
                    quickReplies={quickReplies}
                    onQuickRepliesChange={setQuickReplies}
                    quickReplyMax={compose.quickReplyMax}
                    showCreditNote={platforms.includes('line')}
                    picker={{
                      storefrontOpen,
                      productResults: productSearch.results,
                      productLoading: productSearch.loading,
                      onProductSearch: productSearch.search,
                      productToCard: productSearchItemToCard,
                    }}
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
            previewLoading={effPreviewLoading}
            contactTotal={contactTotal}
            hideProgress={audience === 'all'}
            quotaText={quotaText}
            followerStats={effPreview?.follower_stats ?? null}
            showFollowerStats={audience === 'all'}
            perAccount={effPerAccount}
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
            content={previewContent}
            previewPlatform={singlePlatform}
            accountName={selectedAccounts[0]?.name ?? null}
            accountPictureUrl={selectedAccounts[0]?.picture_url ?? null}
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
