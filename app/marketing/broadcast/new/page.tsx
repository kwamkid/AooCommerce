'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import FormInput from '@/components/ui/FormInput';
import Radio from '@/components/ui/Radio';
import AccountPicker from '@/components/ui/AccountPicker';
import Alert from '@/components/ui/Alert';
import Modal from '@/components/ui/Modal';
import MultiSelectSearch from '@/components/ui/MultiSelectSearch';
import ImageDropzone from '@/components/ui/ImageDropzone';
import PlatformIcon from '@/components/ui/PlatformIcon';
import OptionCards from '@/components/ui/OptionCards';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import EntitySearchInput, { type EntitySearchOption } from '@/components/ui/EntitySearchInput';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { useServerSearch, type ServerSearchPage } from '@/lib/useServerSearch';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/utils/format';
import {
  BROADCAST_PLATFORMS,
  BROADCAST_PLATFORM_LIST,
  canBroadcastVia,
  intersectCompose,
  isBroadcastPlatform,
  type BroadcastContentKind,
  type BroadcastPlatform,
} from '@/lib/broadcast/platforms';
import {
  BUTTON_LABEL_MAX,
  validateBroadcastContent,
  type BroadcastButton,
  type BroadcastContent,
  type BroadcastProductCard,
} from '@/lib/broadcast/content';
import { ChevronDown, Plus, Send, Tag, Trash2 } from 'lucide-react';

/** บัญชีต้นทางหนึ่งใบ — LINE มาจาก chat_accounts ส่วน marketplace มาจากร้าน */
interface BroadcastAccount {
  id: string;
  platform: BroadcastPlatform;
  name: string;
  /** รูปโปรไฟล์ของช่องทาง (รูป OA / รูปเพจ / โลโก้ร้าน) — ไม่มีก็ตกไปใช้ไอคอนแพลตฟอร์ม */
  picture_url: string | null;
}

interface TagRow { id: string; name: string; color: string }

interface QuotaInfo {
  type: 'none' | 'limited' | 'unknown';
  limit: number | null;
  used: number;
  remaining: number | null;
}

interface FollowerStats {
  /** คนที่ยิงถึงได้จริง — ตรงกับเลข "เพื่อน" ใน LINE OA Manager */
  reachable: number | null;
  /** ยอดสะสมที่เคยกดแอด (ไม่ลดเมื่อบล็อก) */
  total_adds: number | null;
  blocks: number | null;
}

interface PreviewInfo {
  recipient_count: number;
  known_contact_count: number;
  quota: QuotaInfo | null;
  follower_stats: FollowerStats | null;
  window_days: number | null;
}

interface AudienceOption { key: string; label: string; hint?: string }

/**
 * กลุ่มผู้รับต่างกันตามช่องทาง เพราะ "ใครที่ทักได้" ต่างกัน —
 * ต้องตรงกับ AUDIENCE_BY_PLATFORM ใน /api/broadcasts (server ปฏิเสธค่าที่ไม่รู้จัก)
 */
const AUDIENCE_OPTIONS: Partial<Record<BroadcastPlatform, AudienceOption[]>> = {
  line: [
    {
      key: 'contacts',
      label: 'คนที่เคยทักเข้ามา',
      hint: 'ทุกคนที่มีห้องแชทอยู่ในระบบเรา — เคยส่งข้อความหาร้านอย่างน้อยครั้งหนึ่ง',
    },
    {
      key: 'customers',
      label: 'คนที่เคยทัก + ผูกกับลูกค้าแล้ว',
      hint: 'เฉพาะห้องแชทที่จับคู่กับข้อมูลลูกค้าในระบบแล้ว (รู้ชื่อจริง/เบอร์/ประวัติซื้อ)',
    },
    {
      key: 'tags',
      label: 'ตามแท็ก',
      hint: 'นับทั้งแท็กที่ติดกับลูกค้า และแท็กที่ติดกับห้องแชทโดยตรง',
    },
    {
      key: 'all',
      label: 'ผู้ติดตามทั้งหมด',
      hint: 'รวมคนที่แอดเพื่อนไว้แต่ไม่เคยทักมาเลย — LINE ส่งให้ทุกคน แต่เราไม่รู้ว่าเป็นใคร จึงบันทึกลงห้องแชทได้เฉพาะคนที่เคยทัก · กลุ่มนี้ใหญ่ที่สุดและกินโควตามากสุด',
    },
    {
      key: 'contacts_pick',
      label: 'เลือกรายคน',
      hint: 'พิมพ์ชื่อแล้วเลือกทีละคน — ใช้ทดสอบส่งหาตัวเองก่อนยิงจริง หรือส่งกลุ่มเล็กเฉพาะกิจ',
    },
  ],
  tiktok: [
    { key: 'buyers_365d', label: 'ลูกค้าที่เคยสั่งซื้อ (365 วัน)', hint: 'TikTok ให้ทักได้เฉพาะกรอบนี้' },
    { key: 'tags', label: 'ตามแท็กลูกค้า', hint: 'นับเฉพาะคนที่ติดแท็กและมีออเดอร์ใน 365 วัน' },
  ],
};

/** การ์ดเลือกชนิดเนื้อหา — preview วาดรูปทรงจริงให้เห็นว่าลูกค้าจะได้อะไร */
const KIND_CARDS: Record<BroadcastContentKind, { label: string; description: string; preview: React.ReactNode }> = {
  announce: {
    label: 'ประกาศ',
    description: 'ข้อความ + รูป',
    preview: (
      <div className="w-full space-y-1">
        <div className="h-1.5 rounded bg-gray-300 dark:bg-slate-500" />
        <div className="h-1.5 w-3/4 rounded bg-gray-300 dark:bg-slate-500" />
        <div className="h-5 rounded bg-gray-200 dark:bg-slate-600" />
      </div>
    ),
  },
  promo: {
    label: 'โปรโมชัน',
    description: 'แบนเนอร์ + ปุ่มกด',
    preview: (
      <div className="w-full rounded border border-gray-300 dark:border-slate-500 overflow-hidden">
        <div className="h-4 bg-gray-200 dark:bg-slate-600" />
        <div className="p-1 space-y-1">
          <div className="h-1.5 w-2/3 rounded bg-gray-300 dark:bg-slate-500" />
          <div className="h-2.5 rounded bg-[#F4511E]/70" />
        </div>
      </div>
    ),
  },
  products: {
    label: 'การ์ดสินค้า',
    description: 'เลื่อนดูได้ กดสั่งเลย',
    preview: (
      <div className="w-full flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex-1 rounded border border-gray-300 dark:border-slate-500 overflow-hidden">
            <div className="h-3.5 bg-gray-200 dark:bg-slate-600" />
            <div className="p-0.5"><div className="h-1.5 rounded bg-gray-300 dark:bg-slate-500" /></div>
          </div>
        ))}
      </div>
    ),
  },
};

/** ตัวกรองผู้รับตามชนิดกลุ่ม — ที่เดียวเพื่อให้ preview กับตอนส่งใช้ค่าเดียวกันเสมอ */
function buildAudienceFilter(audience: string, tagIds: string[], contactIds: string[]) {
  if (audience === 'tags') return { tag_ids: tagIds };
  if (audience === 'contacts_pick') return { contact_ids: contactIds };
  return {};
}

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

export default function NewBroadcastPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const { allowed, loading: authLoading } = useAuthGuard('chat.broadcast', { noRedirect: true });

  const [accounts, setAccounts] = useState<BroadcastAccount[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  /** เลือกได้หลายบัญชี — เนื้อหาชุดเดียวยิงได้หลาย OA/หลายร้าน (aDay Fresh มี LINE 2 บัญชี) */
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [audience, setAudience] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  /** ผู้ติดต่อที่เลือกเอง (audience 'contacts_pick') — เก็บชื่อไว้ด้วยเพื่อโชว์เป็นรายการ */
  const [pickedContacts, setPickedContacts] = useState<{ id: string; name: string }[]>([]);

  // ── เนื้อหา (ชนิดกลาง) ────────────────────────────────────────────────
  const [kind, setKind] = useState<BroadcastContentKind>('announce');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [buttons, setButtons] = useState<BroadcastButton[]>([{ label: '', url: '' }]);
  const [cards, setCards] = useState<BroadcastProductCard[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);

  /** ผลประเมินของบัญชีเดียว (ใช้โชว์รายละเอียดเมื่อเลือกใบเดียว) */
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [perAccount, setPerAccount] = useState<{ account: BroadcastAccount; info: PreviewInfo }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  /** กลุ่มผู้รับเลือกในโมดัล — รายการจะยาวขึ้นเรื่อย ๆ (ไม่ซื้อมา N วัน · ทักแล้วยังไม่ซื้อ ฯลฯ)
   *  เรียงเป็นการ์ดในหน้าจะดันเนื้อหาตกจอ */
  const [audienceModal, setAudienceModal] = useState(false);

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

  // กลุ่มผู้รับที่ **ทุกช่องทางที่เลือกมีเหมือนกัน** — เลือกข้ามเจ้าแล้วเหลือเฉพาะตัวร่วม
  const audienceOptions = useMemo(() => {
    if (platforms.length === 0) return [];
    const lists = platforms.map(p => AUDIENCE_OPTIONS[p] || []);
    return lists[0].filter(o => lists.every(l => l.some(x => x.key === o.key)));
  }, [platforms]);
  const pendingPlatforms = BROADCAST_PLATFORM_LIST.filter(p => !canBroadcastVia(p.id));

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
        if (list.length === 1) setAccountIds([list[0].id]);

        if (tagRes?.ok) {
          const data = await tagRes.json();
          setTags(data.tags || []);
        }
      } catch {
        showToast('โหลดข้อมูลช่องทางไม่สำเร็จ', 'error');
      }
    })();
  }, [allowed, showToast]);

  // เปลี่ยนช่องทาง = กลุ่มผู้รับ/ชนิดเนื้อหาชุดเดิมอาจใช้ไม่ได้ → กลับไปตัวแรกที่รองรับ
  useEffect(() => {
    if (audienceOptions.length === 0) { setAudience(''); return; }
    if (!audienceOptions.some(o => o.key === audience)) setAudience(audienceOptions[0].key);
  }, [audienceOptions, audience]);

  useEffect(() => {
    if (!compose) return;
    if (!compose.kinds.includes(kind)) setKind(compose.kinds[0]);
  }, [compose, kind]);

  // ─── ประเมินผู้รับ + โควตา ──────────────────────────────────────────
  const runPreview = useCallback(async (
    accs: BroadcastAccount[], aud: string, ids: string[], picked: string[],
  ) => {
    if (accs.length === 0 || !aud) { setPreview(null); setPerAccount([]); return; }
    if (aud === 'contacts_pick' && picked.length === 0) { setPreview(null); setPerAccount([]); return; }
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
            audience_filter: buildAudienceFilter(aud, ids, picked),
          }),
        });
        if (!res.ok) return null;
        return { account: a, info: (await res.json()) as PreviewInfo };
      }));

      const ok = results.filter((r): r is { account: BroadcastAccount; info: PreviewInfo } => !!r);
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
    debouncedPreview(selectedAccounts, audience, tagIds, pickedContacts.map(c => c.id));
  }, [allowed, selectedAccounts, audience, tagIds, pickedContacts, debouncedPreview]);

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
    image_url: imageFile ? 'https://pending.upload' : null,
    buttons: buttons.filter(b => b.label.trim() || b.url.trim()),
    products: cards,
    quick_replies: quickReplies,
  }), [kind, title, text, imageFile, buttons, cards, quickReplies]);

  // ตรวจด้วยฟังก์ชันเดียวกับที่ API ใช้ — หน้าจอกับ server จึงพูดตรงกันเสมอ
  // เนื้อหาชุดเดียวต้องผ่าน **ทุกช่องทางที่เลือก** — ตัวไหนไม่ผ่านก็บอกตัวนั้น
  const contentError = platforms
    .map(p => validateBroadcastContent(p, draftContent))
    .find(Boolean) ?? null;

  // โหมด 'all' ของ LINE ยิงผ่าน broadcast API ไม่ต้องมีรายชื่อของเรา
  const selectedAudience = audienceOptions.find(o => o.key === audience) || null;
  const pickPending = audience === 'contacts_pick' && pickedContacts.length === 0;
  const noRecipients = audience !== 'all' && !pickPending && !previewLoading
    && platforms.length > 0 && recipientCount === 0;
  const canSend = accountIds.length > 0 && !!audience && !pickPending
    && !contentError && !quotaShort && !noRecipients && !sending;
  const hasDraft = !!(text.trim() || title.trim() || imagePreviewUrl || cards.length > 0);

  /** บรรทัดสรุปใต้ชื่อกลุ่ม — บอกจำนวน หรือบอกว่ายังต้องเลือกอะไรต่อ */
  const audienceSummary = (() => {
    if (!selectedAudience) return 'ยังไม่ได้เลือก';
    if (audience === 'tags' && tagIds.length === 0) return 'ยังไม่ได้เลือกแท็ก';
    if (audience === 'contacts_pick') {
      return pickedContacts.length === 0
        ? 'ยังไม่ได้เลือกผู้รับ'
        : `เลือกไว้ ${pickedContacts.length} คน`;
    }
    if (previewLoading) return 'กำลังนับผู้รับ...';
    return `${recipientCount.toLocaleString()} คน`;
  })();

  // ─── ส่ง ─────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!canSend) return;

    const ok = await confirm({
      title: 'ส่งบรอดแคสต์',
      description: selectedAccounts.length === 1
        ? `ส่งถึง ${recipientCount.toLocaleString()} คน ผ่าน ${selectedAccounts[0].name}? ข้อความจะถูกส่งทันที`
        : `ส่งถึง ${recipientCount.toLocaleString()} คน ผ่าน ${selectedAccounts.length} ช่องทาง (${selectedAccounts.map(a => a.name).join(' · ')})? ข้อความจะถูกส่งทันที`,
      confirmLabel: 'ส่งบรอดแคสต์',
      confirmIcon: <Send className="w-4 h-4" />,
    });
    if (!ok) return;

    setSending(true);
    try {
      // อัปโหลดรูปครั้งเดียวแล้วใช้ร่วมทุกช่องทาง — อัปซ้ำต่อช่องทางคือเปลืองเปล่า ๆ
      let imageUrl: string | null = null;
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
              audience_filter: buildAudienceFilter(audience, tagIds, pickedContacts.map(c => c.id)),
              content: { ...draftContent, image_url: imageUrl },
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

  const bubbleClass = singlePlatform === 'line' ? 'bg-[#06C755]' : 'bg-gray-900';

  return (
    <Layout>
      {confirmDialog}
      <Container size="6xl">
        <PageHeader backHref="/marketing/broadcast" title="สร้างบรอดแคสต์" subtitle="ข้อความถูกส่งจากระบบนี้ จึงบันทึกไว้ให้ครบว่าส่งอะไรถึงใครไปแล้วบ้าง" />

        {/* ฟอร์มซ้าย · สรุป+ตัวอย่างขวาแบบตรึง — จอแคบจะเรียงลงเป็นคอลัมน์เดียวตามลำดับเดิม */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
          <div className="space-y-5">

            {/* 1. ส่งถึงใคร — ช่องทางกับกลุ่มผู้รับเป็นเรื่องเดียวกัน ไม่ต้องแยกการ์ด */}
            <Card padding="md">
              <h2 className="heading-4 mb-3">ช่องทาง</h2>

              {accounts.length === 0 ? (
                <Alert tone="warning">
                  ยังไม่มีช่องทางที่ส่งได้ — เพิ่ม LINE OA ที่ ตั้งค่า &gt; ช่องทาง Chat ก่อน
                </Alert>
              ) : (
                <AccountPicker
                  accounts={[
                    ...accounts.map(a => ({
                      id: a.id,
                      platform: a.platform,
                      name: a.name,
                      picture_url: a.picture_url,
                      badge: BROADCAST_PLATFORMS[a.platform].label,
                    })),
                    // ช่องทางที่ยังส่งไม่ได้ — โชว์เป็นแถวกดไม่ได้พร้อมเหตุผล **หนึ่งแถวต่อ
                    // แพลตฟอร์ม** ไม่ใช่ต่อบัญชี เพราะเลือกไม่ได้อยู่แล้วจึงไม่ต้องยิง API
                    // ไปโหลดรายชื่อร้าน/เพจของเจ้าที่ยังใช้ไม่ได้มาให้เปลืองเปล่า ๆ
                    ...pendingPlatforms.map(p => ({
                      id: `platform:${p.id}`,
                      platform: p.id,
                      name: p.label,
                      picture_url: null,
                      disabled: true,
                      disabledReason: p.reason,
                    })),
                  ]}
                  value={accountIds}
                  onChange={setAccountIds}
                  placeholder="เลือกช่องทางที่จะใช้ส่ง (เลือกได้หลายอัน)"
                />
              )}

              {platforms.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <p className="field-label mb-1.5">กลุ่มผู้รับ</p>
                  <button
                    type="button"
                    onClick={() => setAudienceModal(true)}
                    className="w-full min-h-[42px] flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors text-left"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block body-text text-gray-900 dark:text-white truncate">
                        {selectedAudience?.label || 'เลือกกลุ่มผู้รับ'}
                      </span>
                      <span className="block helper-text text-gray-500 dark:text-slate-400 truncate">
                        {audienceSummary}
                      </span>
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                </div>
              )}
            </Card>

            {/* 2. เนื้อหา */}
            {compose && (
              <Card padding="md">
                <h2 className="heading-4 mb-3">เนื้อหา</h2>

                {compose.kinds.length > 1 && (
                  <div className="mb-4">
                    <OptionCards<BroadcastContentKind>
                      value={kind}
                      onChange={setKind}
                      disabled={sending}
                      options={compose.kinds.map(k => ({ id: k, ...KIND_CARDS[k] }))}
                    />
                  </div>
                )}

                <div className="space-y-4">
                  {/* หัวข้อ — TikTok บังคับ · LINE ใช้เป็นหัวการ์ดของโปรโมชัน */}
                  {(compose.titleMax || kind === 'promo') && (
                    <FormInput
                      label="หัวข้อ"
                      required={!!compose.titleMax}
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      maxLength={compose.titleMax ?? 40}
                      disabled={sending}
                      placeholder="หัวข้อที่ลูกค้าเห็นก่อน"
                      hint={`${title.length}/${compose.titleMax ?? 40}`}
                    />
                  )}

                  <div>
                    <label className="field-label block mb-1">
                      {kind === 'products' ? 'ข้อความเกริ่น (ไม่บังคับ)' : 'ข้อความ'}
                    </label>
                    <textarea
                      value={text}
                      onChange={e => setText(e.target.value)}
                      rows={kind === 'announce' ? 4 : 2}
                      placeholder="พิมพ์ข้อความที่จะส่งถึงลูกค้า"
                      disabled={sending}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                    <p className="helper-text mt-1 text-right text-gray-500 dark:text-slate-400">
                      {text.length.toLocaleString()}/{(kind === 'promo' ? 60 : compose.bodyMax).toLocaleString()}
                    </p>
                  </div>

                  {/* รูป — โปรโมชันใช้เป็นแบนเนอร์บนการ์ด */}
                  {compose.image && kind !== 'products' && (
                    <div>
                      <label className="field-label block mb-1">
                        {kind === 'promo' ? 'แบนเนอร์ (ไม่บังคับ)' : 'รูปภาพ (ไม่บังคับ)'}
                      </label>
                      <ImageDropzone
                        value={imageFile}
                        onChange={setImageFile}
                        disabled={sending}
                        label="ลากรูปมาวาง หรือกดเพื่อเลือก"
                        maxWidthOrHeight={1280}
                      />
                    </div>
                  )}
                  {!compose.image && (
                    <p className="helper-text text-gray-500 dark:text-slate-400">
                      {singlePlatform ? BROADCAST_PLATFORMS[singlePlatform].label : 'ช่องทางที่เลือก'} รับเฉพาะข้อความล้วน (แนบรูปไม่ได้)
                    </p>
                  )}

                  {/* ปุ่มกด */}
                  {kind === 'promo' && compose.buttonsMax > 0 && (
                    <div>
                      <label className="field-label block mb-1">ปุ่มกด (สูงสุด {compose.buttonsMax})</label>
                      <p className="helper-text text-gray-500 dark:text-slate-400 mb-2">
                        ใส่ลิงก์ปลายทางเอง เช่น หน้าสินค้า หน้าโปรฯ
                      </p>
                      <div className="space-y-2">
                        {buttons.map((b, i) => (
                          <div key={i} className="flex gap-2 items-start">
                            <div className="w-36 flex-shrink-0">
                              <FormInput
                                value={b.label}
                                maxLength={BUTTON_LABEL_MAX}
                                disabled={sending}
                                placeholder="สั่งเลย"
                                onChange={e => setButtons(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <FormInput
                                value={b.url}
                                disabled={sending}
                                placeholder="https://..."
                                onChange={e => setButtons(prev => prev.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                              />
                            </div>
                            {buttons.length > 1 && (
                              <Button
                                variant="ghost"
                                icon={<Trash2 className="w-4 h-4" />}
                                aria-label="ลบปุ่ม"
                                disabled={sending}
                                onClick={() => setButtons(prev => prev.filter((_, j) => j !== i))}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                      {buttons.length < compose.buttonsMax && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Plus className="w-4 h-4" />}
                          disabled={sending}
                          className="mt-2"
                          onClick={() => setButtons(prev => [...prev, { label: '', url: '' }])}
                        >
                          เพิ่มปุ่ม
                        </Button>
                      )}
                    </div>
                  )}

                  {/* การ์ดสินค้า */}
                  {kind === 'products' && (
                    <div>
                      <label className="field-label block mb-1">สินค้า (สูงสุด {compose.productsMax} ชิ้น)</label>
                      <p className="helper-text text-gray-500 dark:text-slate-400 mb-2">
                        ชื่อ รูป ราคา ดึงจากคลังให้เอง · ไม่ใส่ลิงก์ = ปุ่มเป็น &quot;สนใจสินค้านี้&quot; ที่ลูกค้ากดแล้วทักเข้าห้องแชท
                      </p>
                      {cards.length >= compose.productsMax ? (
                        <p className="helper-text text-gray-500 dark:text-slate-400">
                          ครบ {compose.productsMax} ชิ้นแล้ว — เอาออกก่อนถ้าจะเปลี่ยน
                        </p>
                      ) : (
                        <ProductSearchInput
                          products={productSearch.results}
                          loading={productSearch.loading}
                          onSearchChange={productSearch.search}
                          onSelect={addProductCard}
                          isDisabled={p => cards.some(c => c.variation_id === p.id)}
                        />
                      )}
                      {cards.length > 0 && (
                        <ul className="mt-3 space-y-2">
                          {cards.map((c, i) => (
                            <li key={c.variation_id ?? i} className="flex gap-3 items-center rounded-lg border border-gray-200 dark:border-slate-600 px-3 py-2">
                              <ProductImageThumb src={c.image_url} alt={c.name} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="body-text text-gray-900 dark:text-white truncate">{c.name}</p>
                                <p className="helper-text text-gray-500 dark:text-slate-400">
                                  {c.price != null ? formatPrice(c.price) : 'ไม่มีราคา'}
                                </p>
                              </div>
                              <div className="w-52 flex-shrink-0">
                                <FormInput
                                  value={c.url ?? ''}
                                  disabled={sending}
                                  placeholder="ลิงก์ (ไม่ใส่ก็ได้)"
                                  onChange={e => setCards(prev => prev.map((x, j) => j === i ? { ...x, url: e.target.value || null } : x))}
                                />
                              </div>
                              <Button
                                variant="ghost"
                                icon={<Trash2 className="w-4 h-4" />}
                                aria-label="เอาออก"
                                disabled={sending}
                                onClick={() => setCards(prev => prev.filter((_, j) => j !== i))}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* ปุ่มตอบเร็ว */}
                  {compose.quickReplyMax > 0 && (
                    <div>
                      <label className="field-label block mb-1">ปุ่มตอบเร็ว (ไม่บังคับ)</label>
                      <p className="helper-text text-gray-500 dark:text-slate-400 mb-2">
                        ลูกค้ากดแล้วข้อความเข้าห้องแชททันที — ได้บทสนทนาให้แอดมินปิดการขายต่อ
                      </p>
                      {quickReplies.length > 0 && (
                        <div className="space-y-2 mb-2">
                          {quickReplies.map((q, i) => (
                            <div key={i} className="flex gap-2 items-start">
                              <div className="flex-1 min-w-0">
                                <FormInput
                                  value={q}
                                  maxLength={BUTTON_LABEL_MAX}
                                  disabled={sending}
                                  placeholder="เช่น สนใจ / ขอรายละเอียด"
                                  onChange={e => setQuickReplies(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                                />
                              </div>
                              <Button
                                variant="ghost"
                                icon={<Trash2 className="w-4 h-4" />}
                                aria-label="ลบปุ่มตอบเร็ว"
                                disabled={sending}
                                onClick={() => setQuickReplies(prev => prev.filter((_, j) => j !== i))}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {quickReplies.length < compose.quickReplyMax && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Plus className="w-4 h-4" />}
                          disabled={sending}
                          onClick={() => setQuickReplies(prev => [...prev, ''])}
                        >
                          เพิ่มปุ่มตอบเร็ว
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* ── แผงขวา: สรุป + ตัวอย่าง + ปุ่มส่ง ── */}
          <div className="xl:sticky xl:top-4 space-y-4">
            <Card padding="md">
              {/* จำนวนผู้รับคือตัวเลขที่ต้องเห็นตลอดเวลาที่แก้ข้อความ ไม่ใช่ต้องเลื่อนกลับขึ้นไปดู */}
              <p className="helper-text text-gray-500 dark:text-slate-400">ผู้รับ</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                {previewLoading ? '—' : recipientCount.toLocaleString()}
                <span className="body-text font-normal text-gray-500 dark:text-slate-400"> คน</span>
              </p>
              {quotaText && <p className="helper-text text-gray-500 dark:text-slate-400 mt-0.5">{quotaText}</p>}

              {audience === 'all' && preview?.follower_stats?.total_adds != null && preview.follower_stats.blocks != null && (
                <p className="helper-text text-gray-400 dark:text-slate-500 mt-1.5">
                  เคยแอดสะสม {preview.follower_stats.total_adds.toLocaleString()} · บล็อกแล้ว {preview.follower_stats.blocks.toLocaleString()} จึงไม่นับ
                </p>
              )}

              {perAccount.length > 1 && (
                <ul className="mt-2 space-y-0.5">
                  {perAccount.map(r => (
                    <li key={r.account.id} className="flex items-center gap-1.5 helper-text text-gray-500 dark:text-slate-400">
                      <PlatformIcon id={r.account.platform} size={12} />
                      <span className="truncate flex-1">{r.account.name}</span>
                      <span className="tabular-nums">{r.info.recipient_count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}

              {quotaShort && (
                <p className="helper-text text-red-600 dark:text-red-400 mt-2">
                  โควตาไม่พอ: {shortAccounts.map(r => r.account.name).join(' · ')} — ลดกลุ่มผู้รับหรือรอรอบเดือนหน้า
                </p>
              )}
              {noRecipients && (
                <p className="helper-text text-amber-700 dark:text-amber-500 mt-2">
                  {singlePlatform === 'tiktok'
                    ? 'ไม่มีผู้รับ — TikTok ให้ทักได้เฉพาะลูกค้าที่สั่งใน 365 วัน'
                    : 'ไม่มีผู้รับที่ตรงเงื่อนไข — เลือกกลุ่มอื่นหรือเพิ่มแท็กก่อน'}
                </p>
              )}
              {contentError && hasDraft && (
                <p className="helper-text text-red-600 dark:text-red-400 mt-2">{contentError}</p>
              )}

              <div className="flex gap-2 mt-4">
                <Button variant="secondary" className="flex-1" onClick={() => router.push('/marketing/broadcast')} disabled={sending}>
                  ยกเลิก
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  icon={<Send className="w-4 h-4" />}
                  loading={sending}
                  disabled={!canSend}
                  onClick={handleSend}
                >
                  ส่ง
                </Button>
              </div>

              {platforms.includes('line') && (
                <p className="helper-text text-gray-500 dark:text-slate-400 mt-3">
                  ส่งถึง 500 คน = 500 ข้อความในโควตา · การ์ดที่มีรูป หัวข้อ และปุ่ม ยังนับเป็น 1 ข้อความเท่าข้อความเปล่า
                </p>
              )}
            </Card>

            {/* ตัวอย่าง — วาดตามชนิดจริงที่จะส่ง อยู่ข้างฟอร์มให้เห็นระหว่างพิมพ์ */}
            {hasDraft && (
              <Card padding="md">
                <p className="field-label mb-2">ตัวอย่างที่ลูกค้าจะเห็น</p>
                <div className="rounded-lg bg-gray-100 dark:bg-slate-800 p-3 space-y-2">
                  {kind === 'products' ? (
                    <>
                      {text.trim() && (
                        <div className={`ml-auto w-fit max-w-full rounded-2xl px-3.5 py-2 text-white ${bubbleClass}`}>
                          <p className="subtitle-text whitespace-pre-wrap break-words">{text}</p>
                        </div>
                      )}
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {cards.map((c, i) => (
                          <div key={c.variation_id ?? i} className="w-28 flex-shrink-0 rounded-xl bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 overflow-hidden">
                            <div className="h-20 bg-gray-100 dark:bg-slate-600 flex items-center justify-center">
                              <ProductImageThumb src={c.image_url} alt={c.name} size="md" />
                            </div>
                            <div className="p-1.5">
                              <p className="helper-text text-gray-900 dark:text-white line-clamp-2">{c.name}</p>
                              <p className="helper-text text-gray-500 dark:text-slate-400 mt-0.5">
                                {c.price != null ? formatPrice(c.price) : ''}
                              </p>
                              <p className="helper-text text-center mt-1 py-0.5 rounded bg-gray-100 dark:bg-slate-600 text-gray-700 dark:text-slate-200">
                                {c.url ? 'ดูสินค้า' : 'สนใจสินค้านี้'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : kind === 'promo' ? (
                    <div className="ml-auto w-full rounded-xl bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 overflow-hidden">
                      {imagePreviewUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imagePreviewUrl} alt="แบนเนอร์" className="w-full h-24 object-cover" />
                      )}
                      <div className="p-2.5">
                        {title.trim() && <p className="body-text font-semibold text-gray-900 dark:text-white">{title}</p>}
                        {text.trim() && <p className="helper-text text-gray-600 dark:text-slate-300 mt-0.5 whitespace-pre-wrap break-words">{text}</p>}
                      </div>
                      {buttons.filter(b => b.label.trim()).map((b, i) => (
                        <p key={i} className="helper-text text-center py-1.5 border-t border-gray-200 dark:border-slate-600 text-[#F4511E]">
                          {b.label}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className={`ml-auto w-fit max-w-full rounded-2xl px-3.5 py-2 text-white space-y-1.5 ${bubbleClass}`}>
                      <p className="text-[11px] opacity-80">📣 บรอดแคสต์</p>
                      {title.trim() && <p className="subtitle-text font-semibold break-words">{title}</p>}
                      {text.trim() && <p className="subtitle-text whitespace-pre-wrap break-words">{text}</p>}
                      {imagePreviewUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imagePreviewUrl} alt="ตัวอย่างรูปที่จะส่ง" className="rounded-lg max-h-40 w-auto" />
                      )}
                    </div>
                  )}

                  {quickReplies.filter(q => q.trim()).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {quickReplies.filter(q => q.trim()).map((q, i) => (
                        <span key={i} className="helper-text px-2 py-0.5 rounded-full border border-[#06C755] text-[#06C755] bg-white dark:bg-slate-700">
                          {q}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* โมดัลเลือกกลุ่มผู้รับ — แยกออกจากหน้าเพราะรายการจะยาวขึ้นเรื่อย ๆ และบางตัวเลือก
            มีของให้กรอกต่อ (แท็ก · รายชื่อ · จำนวนวัน) ซึ่งใส่ใน dropdown แล้วอึดอัด */}
        <Modal
          open={audienceModal}
          onClose={() => setAudienceModal(false)}
          title="เลือกกลุ่มผู้รับ"
          size="lg"
          footer={
            <div className="modal-footer px-6 py-4 flex justify-end gap-2">
              <Button variant="primary" onClick={() => setAudienceModal(false)}>เสร็จสิ้น</Button>
            </div>
          }
        >
          <div className="modal-body px-6 py-5 space-y-2">
            {audienceOptions.map(opt => {
              const active = audience === opt.key;
              return (
                <div key={opt.key}>
                  <Radio
                    checked={active}
                    onChange={() => setAudience(opt.key)}
                    className={`!items-start px-3 py-2.5 rounded-lg border transition-colors ${
                      active
                        ? 'border-[#F4511E] bg-orange-50/50 dark:bg-orange-950/20'
                        : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block body-text text-gray-900 dark:text-white">{opt.label}</span>
                      {opt.hint && (
                        <span className="block helper-text text-gray-500 dark:text-slate-400 mt-0.5">{opt.hint}</span>
                      )}
                    </span>
                  </Radio>

                  {/* ของที่ต้องกรอกต่อของตัวเลือกนั้น — โผล่ใต้ตัวที่เลือกเท่านั้น */}
                  {active && opt.key === 'tags' && (
                    <div className="mt-2 ml-3">
                      <MultiSelectSearch
                        value={tagIds}
                        onChange={setTagIds}
                        options={tags.map(t => ({ id: t.id, label: t.name }))}
                        emptyLabel="เลือกแท็ก..."
                        icon={<Tag className="w-4 h-4" />}
                      />
                    </div>
                  )}

                  {active && opt.key === 'contacts_pick' && (
                    <div className="mt-2 ml-3">
                      <EntitySearchInput
                        value=""
                        options={contactSearch.results}
                        loading={contactSearch.loading}
                        onSearchChange={contactSearch.search}
                        minSearchLength={2}
                        placeholder="พิมพ์ชื่อผู้ติดต่อเพื่อเพิ่ม"
                        emptyMessage="ไม่พบผู้ติดต่อที่ตรงกับคำค้น"
                        onChange={(id, o) => {
                          setPickedContacts(prev =>
                            prev.some(c => c.id === id) ? prev : [...prev, { id, name: o.label }]);
                        }}
                      />
                      {pickedContacts.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {pickedContacts.map(c => (
                            <li
                              key={c.id}
                              className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full border border-gray-200 dark:border-slate-600"
                            >
                              <span className="helper-text text-gray-700 dark:text-slate-300">{c.name}</span>
                              <button
                                type="button"
                                aria-label={`เอา ${c.name} ออก`}
                                onClick={() => setPickedContacts(prev => prev.filter(x => x.id !== c.id))}
                                className="w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {accountIds.length > 1 && (
                        <p className="helper-text text-amber-700 dark:text-amber-500 mt-1.5">
                          ค้นจากบัญชีแรกที่เลือกเท่านั้น — เลือกรายคนควรติ๊กบัญชีเดียว
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Modal>
      </Container>
    </Layout>
  );
}
