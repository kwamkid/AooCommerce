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
import { useStableCallback } from '@/lib/useStableCallback';
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
  ACTION_LABELS,
  EMPTY_ACTION,
  actionSummary,
  buttonAction,
  isActionEmpty,
  posterAction,
  type BroadcastAction,
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
import { newGalleryDraft, type GalleryDraft } from './components/types';

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

/** ขนาดจริงของแบนเนอร์ (พิกเซล) */
interface ImageDims { width: number; height: number }

/**
 * เนื้อหาที่กรอกไว้ของ **ชนิดหนึ่ง** — แต่ละชนิด (ประกาศ/โปสเตอร์/โปรโมชัน/การ์ดสินค้า) เก็บของตัวเอง
 * แยกกันเหมือนแท็บ: สลับไปโปสเตอร์แล้วรูปที่ใส่ไว้ในประกาศต้องไม่โผล่ตาม (เจ้าของท้วง 10 ก.ย. 2026
 * ว่ากดโปสเตอร์แล้วตัวอย่างในแชทยังเป็นรูปของประกาศ) และสลับกลับมาของเดิมต้องยังอยู่
 */
interface KindDraft {
  title: string;
  text: string;
  imageFile: File | null;
  existingImageUrl: string | null;
  imageDims: ImageDims | null;
  tapAction: BroadcastAction;
  gallery: GalleryDraft[];
  cardStyle: 'image' | 'detail';
  buttons: BroadcastButton[];
  cards: BroadcastProductCard[];
  quickReplies: string[];
}

const EMPTY_DRAFT: KindDraft = {
  title: '', text: '', imageFile: null, existingImageUrl: null, imageDims: null,
  tapAction: EMPTY_ACTION, gallery: [], cardStyle: 'detail',
  buttons: [{ label: '', action: EMPTY_ACTION }], cards: [], quickReplies: [],
};

/**
 * วัดขนาดรูป — จากไฟล์ที่เพิ่งเลือก หรือจาก URL ของใบที่คัดลอกมา
 *
 * ต้องรู้ขนาดตั้งแต่ตอนกรอก เพราะ Flex ของ LINE วาดรูปตามสัดส่วนที่เราบอกเท่านั้น
 * (ไม่บอก = 1:1 โปสเตอร์แนวตั้งจะโดนครอบ) · วัดไม่ได้ = null แล้วตกไปใช้ทรงเดิม
 */
async function measureImageDims(source: File | string): Promise<ImageDims | null> {
  if (typeof source !== 'string' && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(source);
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dims;
    } catch {
      // เบราว์เซอร์เก่าไม่มี createImageBitmap — ตกไปวิธีสำรองข้างล่าง
    }
  }
  return new Promise<ImageDims | null>(resolve => {
    const src = typeof source === 'string' ? source : URL.createObjectURL(source);
    const objectUrl = typeof source === 'string' ? null : src;
    const img = new window.Image();
    const done = (dims: ImageDims | null) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(dims);
    };
    img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => done(null);
    img.src = src;
  });
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
  /** ขนาดรูปที่วัดได้ — ส่งไปกับเนื้อหาเพื่อให้การ์ดของ LINE ได้สัดส่วนตามรูปจริง */
  const [imageDims, setImageDims] = useState<ImageDims | null>(null);
  /** รูปของใบที่คัดลอกมา — ใช้ต่อได้เลยเมื่อผู้ใช้ไม่ได้เลือกไฟล์ใหม่ */
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  /** โปสเตอร์: กดรูปแล้วเกิดอะไร (ทะเบียนกลาง BroadcastAction — ปุ่มโปรโมชันใช้ชุดเดียวกัน) */
  const [tapAction, setTapAction] = useState<BroadcastAction>(EMPTY_ACTION);
  /** การ์ดสินค้า: รูปเต็ม หรือมีชื่อ+ปุ่ม */
  const [cardStyle, setCardStyle] = useState<'image' | 'detail'>('detail');
  const [buttons, setButtons] = useState<BroadcastButton[]>([{ label: '', action: EMPTY_ACTION }]);
  const [cards, setCards] = useState<BroadcastProductCard[]>([]);
  /** รูปหลายใบ — object URL/ขนาดของแต่ละใบดูแลที่ `updateGallery` */
  const [gallery, setGallery] = useState<GalleryDraft[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);

  /** ของที่กรอกค้างไว้ของชนิดที่ไม่ได้เปิดอยู่ — state ข้างบนคือชนิดที่เปิดอยู่เท่านั้น */
  const kindDraftsRef = useRef<Partial<Record<BroadcastContentKind, KindDraft>>>({});

  /**
   * สลับชนิดเนื้อหา = เก็บของชนิดเดิมไว้ก่อน แล้วหยิบของชนิดใหม่ขึ้นมา (ไม่เคยกรอก = เปล่า)
   * ทุกทางที่เปลี่ยน kind ต้องผ่านตัวนี้ ยกเว้นตอนคัดลอกจากใบเก่าที่ตั้งค่าทุกช่องเองอยู่แล้ว
   */
  const switchKind = useStableCallback((next: BroadcastContentKind) => {
    if (next === kind) return;
    kindDraftsRef.current[kind] = {
      title, text, imageFile, existingImageUrl, imageDims, tapAction, gallery,
      cardStyle, buttons, cards, quickReplies,
    };
    const d = kindDraftsRef.current[next] ?? EMPTY_DRAFT;
    setTitle(d.title);
    setText(d.text);
    setImageFile(d.imageFile);
    setExistingImageUrl(d.existingImageUrl);
    setImageDims(d.imageDims);
    setTapAction(d.tapAction);
    // รูปหลายใบเริ่มด้วยช่องเปล่า 1 ช่อง — ไม่งั้นเปิดมาเจอแค่ปุ่ม "เพิ่มรูป"
    setGallery(next === 'gallery' && d.gallery.length === 0 ? [newGalleryDraft()] : d.gallery);
    setCardStyle(d.cardStyle);
    setButtons(d.buttons);
    setCards(d.cards);
    setQuickReplies(d.quickReplies);
    setKind(next);
  });

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
  /** ร้านเปิดหน้าร้านออนไลน์แล้วไหม — โปสเตอร์แบบ "ไปที่สินค้า" ใช้ได้เฉพาะตอนเปิดแล้ว */
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

  // object URL ต้องคืนทุกครั้งที่เปลี่ยนรูป — สร้างใน render จะรั่วทุกรอบที่ re-render
  useEffect(() => {
    if (!imageFile) { setImagePreviewUrl(null); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // ร้านเปิดหน้าร้านออนไลน์หรือยัง — ชิป "ไปที่สินค้า" ของโปสเตอร์ปิดไว้พร้อมบอกเหตุผลถ้ายังไม่เปิด
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

  // วัดสัดส่วนของไฟล์ที่เลือก — เอาไฟล์ออกก็ล้างค่าทิ้ง (สัดส่วนของรูปเก่าใช้กับรูปใหม่ไม่ได้)
  useEffect(() => {
    if (!imageFile) { setImageDims(null); return; }
    let cancelled = false;
    measureImageDims(imageFile).then(dims => { if (!cancelled) setImageDims(dims); });
    return () => { cancelled = true; };
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
          // image_style 'rich' ของใบเก่าไม่กู้คืน — หน้าจอไม่มีตัวเลือกนี้แล้ว (รูปเต็มจอ = โปสเตอร์)
          // ใบเก่าที่มีแค่ link_url ก็อ่านเป็น action เปิดลิงก์ให้
          const tapFromOld = posterAction(c);
          if (tapFromOld) setTapAction(tapFromOld);
          if (c.card_style === 'image') setCardStyle('image');
          if (Array.isArray(c.buttons) && c.buttons.length > 0) {
            setButtons(c.buttons.map(b => ({ label: b.label || '', action: buttonAction(b) ?? EMPTY_ACTION })));
          }
          if (Array.isArray(c.products)) setCards(c.products);
          if (Array.isArray(c.images) && c.images.length > 0) {
            setGallery(c.images.map(img => ({
              ...newGalleryDraft(),
              existingUrl: img.image_url,
              width: img.image_width ?? null,
              height: img.image_height ?? null,
              action: img.action ?? EMPTY_ACTION,
            })));
          }
          if (Array.isArray(c.quick_replies)) setQuickReplies(c.quick_replies);
          // ใบเก่ายังไม่ได้เก็บขนาดรูป — วัดจากรูปเดิม ไม่งั้นการ์ดจะตกไปใช้ทรงเริ่มต้น
          if (c.image_width && c.image_height) {
            setImageDims({ width: Number(c.image_width), height: Number(c.image_height) });
          } else if (c.image_url) {
            const dims = await measureImageDims(c.image_url);
            if (dims) setImageDims(dims);
          }
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
    // ผ่าน switchKind เพื่อให้ของชนิดที่ใช้ไม่ได้ถูกเก็บไว้ ไม่ใช่หลุดไปโผล่ในชนิดแรก
    if (!compose.kinds.includes(kind)) switchKind(compose.kinds[0]);
  }, [compose, kind, switchKind]);

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
  const draftContent: BroadcastContent = useMemo(() => {
    // โปสเตอร์มีแค่รูปกับลิงก์ — ข้อความ/ปุ่ม/สินค้าที่กรอกไว้ตอนเป็นชนิดอื่นต้องไม่ติดไปด้วย
    // (ค่าที่ค้างอยู่จะทำให้ validate ตีตกทั้งที่หน้าจอไม่มีช่องนั้นให้ลบ)
    const isPoster = kind === 'poster';
    // ลิงก์/สินค้า/ข้อความที่กดรูปแล้วเกิด มีความหมายเฉพาะโปสเตอร์ตามแบบที่เลือก — ชนิดอื่นไม่ส่ง
    return {
      kind,
      title: isPoster ? '' : title.trim(),
      text: text.trim(),
      // รูปหลายใบใช้ `images` — ช่องรูปเดี่ยวไม่ใช้
      image_url: kind === 'gallery' ? null : (imageFile ? 'https://pending.upload' : existingImageUrl),
      image_width: imageDims?.width ?? null,
      image_height: imageDims?.height ?? null,
      // รูปของประกาศเป็นรูปธรรมดาเสมอ — รูปเต็มจอย้ายไปเป็นโปสเตอร์ตั้งแต่ 10 ก.ย. 2026
      image_style: 'bubble',
      link_url: null,
      tap_action: isPoster ? tapAction : null,
      card_style: cardStyle,
      // ปุ่มที่ยังไม่ได้แตะเลย (ป้ายว่าง + ยังไม่กรอก action) ไม่ส่ง — ไม่งั้น validate จะตีตกปุ่มเปล่าที่ระบบใส่มาให้เอง
      buttons: isPoster ? [] : buttons.filter(b => b.label.trim() || !isActionEmpty(b.action)),
      products: isPoster ? [] : cards,
      images: kind === 'gallery'
        ? gallery.map(g => ({
          image_url: g.existingUrl || (g.file ? 'https://pending.upload' : ''),
          image_width: g.width,
          image_height: g.height,
          action: g.action,
        }))
        : [],
      quick_replies: quickReplies,
    };
  }, [kind, title, text, imageFile, imageDims, existingImageUrl, tapAction, gallery,
    cardStyle, buttons, cards, quickReplies]);

  /** ตัวอย่างในแชทต้องเห็นรูปที่ยังไม่ได้อัป — แทน URL ชั่วคราวด้วย object URL ของไฟล์ */
  const previewContent: BroadcastContent = useMemo(() => (
    kind === 'gallery'
      ? { ...draftContent, images: gallery.map(g => ({
        image_url: g.previewUrl || g.existingUrl || '',
        image_width: g.width,
        image_height: g.height,
        action: g.action,
      })) }
      : draftContent
  ), [kind, draftContent, gallery]);

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
  // โปสเตอร์ไม่มีข้อความเลย — นับรูปกับลิงก์เป็น "เริ่มกรอกแล้ว" ไม่งั้นตัวอย่างจะไม่ขึ้น
  const hasDraft = !!(
    text.trim() || title.trim() || imagePreviewUrl || existingImageUrl || cards.length > 0
    || (kind === 'poster' && !isActionEmpty(tapAction))
    || (kind === 'gallery' && gallery.some(g => g.file || g.existingUrl))
  );
  const canNext = accountIds.length > 0 && !!audience && !pickPending;
  const canSend = canNext && !contentError && !quotaShort && !noRecipients && !scheduleError && !sending;

  const contactTotal = counts?.contact_total ?? preview?.contact_total ?? null;
  const contactLinked = counts?.contact_linked ?? preview?.contact_linked ?? null;

  /** ป้ายสรุปในแผงขวา — ค่าว่างจะขึ้นเป็น "ยังไม่ได้เลือก" แบบจาง */
  const contentSummary = useMemo(() => {
    if (!hasDraft) return '';
    const base = KIND_LABELS[kind];
    if (kind === 'poster') {
      const target = actionSummary(tapAction);
      return `${base} · ${ACTION_LABELS[tapAction.type]}${target ? ` ${target}` : ''}`;
    }
    if (kind === 'gallery') return `${base} · ${gallery.filter(g => g.file || g.existingUrl).length} ใบ`;
    if (kind === 'promo') {
      const n = buttons.filter(b => b.label.trim()).length;
      return n > 0 ? `${base} · ${n} ปุ่ม` : base;
    }
    if (kind === 'products') {
      const style = cardStyle === 'image' ? 'รูปเต็ม' : 'มีชื่อ+ปุ่ม';
      return cards.length > 0 ? `${base} · ${cards.length} ชิ้น · ${style}` : base;
    }
    return base;
  }, [hasDraft, kind, buttons, cards, cardStyle, tapAction, gallery]);

  /**
   * แก้รายการรูปหลายใบ — หน้าเป็นเจ้าของ object URL: ไฟล์เปลี่ยน = คืน URL เดิม สร้างใหม่ วัดขนาดใหม่
   * ใบที่ถูกลบก็คืน URL (สร้างใน render จะรั่วทุกรอบ)
   */
  const updateGallery = (next: GalleryDraft[]) => {
    const prevById = new Map(gallery.map(g => [g.id, g]));
    const resolved = next.map(g => {
      const prev = prevById.get(g.id);
      if (prev && prev.file === g.file) return g;
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      if (!g.file) return { ...g, previewUrl: null, width: null, height: null };
      const file = g.file;
      measureImageDims(file).then(dims => {
        if (!dims) return;
        setGallery(cur => cur.map(x => (x.id === g.id && x.file === file ? { ...x, width: dims.width, height: dims.height } : x)));
      });
      return { ...g, previewUrl: URL.createObjectURL(file), existingUrl: null, width: null, height: null };
    });
    for (const p of gallery) {
      if (p.previewUrl && !next.some(g => g.id === p.id)) URL.revokeObjectURL(p.previewUrl);
    }
    setGallery(resolved);
  };

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
      let imageUrl: string | null = existingImageUrl;
      if (compose?.image && imageFile && kind !== 'gallery') imageUrl = await uploadImage(imageFile);
      // รูปหลายใบ — อัปทีละใบ (ใบที่คัดลอกมาใช้ URL เดิม) · ช่องที่ยังไม่มีรูปถูกตัดตอน validate แล้ว
      const images = kind === 'gallery'
        ? await Promise.all(gallery.map(async g => ({
          image_url: g.existingUrl || (g.file ? await uploadImage(g.file) : ''),
          image_width: g.width,
          image_height: g.height,
          action: g.action,
        })))
        : [];

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
              content: { ...draftContent, image_url: imageUrl, images },
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

  /** การ์ดสินค้าจากผลค้นหา — ใช้ทั้งการ์ดสินค้าและสินค้าปลายทางของโปสเตอร์ */
  const cardFromSearchItem = (p: ProductSearchItem): BroadcastProductCard => {
    const discounted = !!p.discount_price && p.discount_price > 0;
    const price = discounted ? (p.discount_price as number) : p.default_price ?? 0;
    return {
      product_id: p.product_id,
      variation_id: p.id,
      // ชื่อบนการ์ดต้องแยกสีออกจากกัน ไม่งั้นได้การ์ด "YOYO 0+ Newborn Pack" 5 ใบเหมือนกันหมด
      name: p.variation_label ? `${p.name} - ${p.variation_label}` : p.name,
      image_url: p.image ?? null,
      price,
      // ราคาปกติเก็บไว้เฉพาะตอนลดจริง — การ์ดถึงจะขึ้นป้าย "ลด N%" กับราคาขีดฆ่าได้
      compare_at_price: discounted ? p.default_price ?? null : null,
      url: null,
    };
  };

  const addProductCard = (p: ProductSearchItem) => {
    // เช็คซ้ำด้วย variation ไม่ใช่ product — สินค้าตัวเดียวมีหลายสี/ขนาดที่ product_id
    // เดียวกัน (YOYO 0+ มี 5 สี) เช็คด้วย product_id จะเลือกได้แค่สีเดียว
    if (cards.some(c => c.variation_id === p.id)) return;
    if (compose && cards.length >= compose.productsMax) {
      showToast(`ใส่ได้ไม่เกิน ${compose.productsMax} ชิ้น`, 'error');
      return;
    }
    setCards(prev => [...prev, cardFromSearchItem(p)]);
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
                    onKindChange={switchKind}
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
                    imagePreviewUrl={imagePreviewUrl ?? existingImageUrl}
                    tapAction={tapAction}
                    onTapActionChange={setTapAction}
                    gallery={gallery}
                    onGalleryChange={updateGallery}
                    productToCard={cardFromSearchItem}
                    storefrontOpen={storefrontOpen}
                    cardStyle={cardStyle}
                    onCardStyleChange={setCardStyle}
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
            content={previewContent}
            previewPlatform={singlePlatform}
            imagePreviewUrl={imagePreviewUrl ?? existingImageUrl}
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
