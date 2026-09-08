'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import FormSelect from '@/components/ui/FormSelect';
import FormInput from '@/components/ui/FormInput';
import Radio from '@/components/ui/Radio';
import Alert from '@/components/ui/Alert';
import MultiSelectSearch from '@/components/ui/MultiSelectSearch';
import ImageDropzone from '@/components/ui/ImageDropzone';
import PlatformIcon from '@/components/ui/PlatformIcon';
import OptionCards from '@/components/ui/OptionCards';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
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
import { Megaphone, Plus, Send, Tag, Trash2 } from 'lucide-react';

/** บัญชีต้นทางหนึ่งใบ — LINE มาจาก chat_accounts ส่วน marketplace มาจากร้าน */
interface BroadcastAccount {
  id: string;
  platform: BroadcastPlatform;
  name: string;
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
    { key: 'contacts', label: 'ผู้ติดต่อทั้งหมดใน OA นี้' },
    { key: 'customers', label: 'เฉพาะที่ผูกกับลูกค้าในระบบแล้ว' },
    { key: 'tags', label: 'ตามแท็กลูกค้า' },
    {
      key: 'all',
      label: 'ทุกคนที่แอดเพื่อน OA (broadcast)',
      hint: 'รวมคนที่ยังไม่เคยทักมา — ระบบรู้จำนวนผู้ติดตามจาก LINE แต่ไม่รู้ว่าเป็นใคร จึงบันทึกลงห้องแชทได้เฉพาะผู้ติดต่อที่มีในระบบ',
    },
  ],
  tiktok: [
    {
      key: 'buyers_365d',
      label: 'ลูกค้าที่เคยสั่งซื้อ (ภายใน 365 วัน)',
      hint: 'TikTok ให้ทักได้เฉพาะผู้ซื้อที่มีออเดอร์กับร้านภายใน 365 วันเท่านั้น',
    },
    { key: 'tags', label: 'ตามแท็กลูกค้า', hint: 'นับเฉพาะคนที่ติดแท็กและมีออเดอร์ภายใน 365 วัน' },
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
        <div className="h-6 rounded bg-gray-200 dark:bg-slate-600" />
      </div>
    ),
  },
  promo: {
    label: 'โปรโมชัน',
    description: 'แบนเนอร์ + ปุ่มกด',
    preview: (
      <div className="w-full rounded border border-gray-300 dark:border-slate-500 overflow-hidden">
        <div className="h-5 bg-gray-200 dark:bg-slate-600" />
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
            <div className="h-4 bg-gray-200 dark:bg-slate-600" />
            <div className="p-0.5"><div className="h-1.5 rounded bg-gray-300 dark:bg-slate-500" /></div>
          </div>
        ))}
      </div>
    ),
  },
};

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
  const [accountId, setAccountId] = useState('');
  const [audience, setAudience] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);

  // ── เนื้อหา (ชนิดกลาง) ────────────────────────────────────────────────
  const [kind, setKind] = useState<BroadcastContentKind>('announce');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [buttons, setButtons] = useState<BroadcastButton[]>([{ label: '', url: '' }]);
  const [cards, setCards] = useState<BroadcastProductCard[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);

  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const productSearch = useServerSearch<ProductSearchItem>({ fetch: fetchProductPage });

  const selectedAccount = accounts.find(a => a.id === accountId);
  const platform = selectedAccount?.platform ?? null;
  const info = platform ? BROADCAST_PLATFORMS[platform] : null;
  const compose = info?.compose ?? null;
  const audienceOptions = useMemo(
    () => (platform ? AUDIENCE_OPTIONS[platform] || [] : []),
    [platform],
  );
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
              list.push({ id: a.id, platform: a.platform, name: a.account_name });
            }
          }
        }
        for (let i = 0; i < shopResList.length; i++) {
          const res = shopResList[i];
          if (!res?.ok) continue;
          const shops = await res.json();
          for (const s of Array.isArray(shops) ? shops : []) {
            if (s.is_active) list.push({ id: s.id, platform: marketplacePlatforms[i], name: s.shop_name || 'ร้าน' });
          }
        }

        setAccounts(list);
        if (list.length === 1) setAccountId(list[0].id);

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
    plat: BroadcastPlatform | null, accId: string, aud: string, ids: string[],
  ) => {
    if (!plat || !accId || !aud) { setPreview(null); return; }
    setPreviewLoading(true);
    try {
      const res = await apiFetch('/api/broadcasts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: plat,
          account_id: accId,
          audience_type: aud,
          audience_filter: aud === 'tags' ? { tag_ids: ids } : {},
        }),
      });
      if (!res.ok) { setPreview(null); return; }
      setPreview(await res.json());
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const debouncedPreview = useDebouncedCallback(runPreview, 400);

  useEffect(() => {
    if (!allowed) return;
    debouncedPreview(platform, accountId, audience, tagIds);
  }, [allowed, platform, accountId, audience, tagIds, debouncedPreview]);

  // ─── สรุปสิ่งที่จะเกิดขึ้น ────────────────────────────────────────────
  const recipientCount = preview?.recipient_count ?? 0;
  const quota = preview?.quota ?? null;
  const quotaShort = !!quota && quota.type === 'limited' && quota.remaining !== null && quota.remaining < recipientCount;

  const quotaText = useMemo(() => {
    if (!quota || quota.type === 'unknown') return null;
    if (quota.type === 'none') return `โควตาเดือนนี้ ใช้ไป ${quota.used.toLocaleString()} ข้อความ (ไม่จำกัด)`;
    return `โควตาเดือนนี้ ${quota.used.toLocaleString()}/${(quota.limit ?? 0).toLocaleString()} (เหลือ ${(quota.remaining ?? 0).toLocaleString()})`;
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
  const contentError = platform ? validateBroadcastContent(platform, draftContent) : 'เลือกช่องทางก่อน';

  // โหมด 'all' ของ LINE ยิงผ่าน broadcast API ไม่ต้องมีรายชื่อของเรา
  const noRecipients = audience !== 'all' && !previewLoading && !!platform && recipientCount === 0;
  const canSend = !!accountId && !!audience && !contentError && !quotaShort && !noRecipients && !sending;

  // ─── ส่ง ─────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!canSend || !platform) return;

    const ok = await confirm({
      title: 'ส่งบรอดแคสต์',
      description: `ส่งถึง ${recipientCount.toLocaleString()} คน ผ่าน ${selectedAccount?.name || 'ช่องทางนี้'} (${info?.label})? ข้อความจะถูกส่งทันที`,
      confirmLabel: 'ส่งบรอดแคสต์',
      confirmIcon: <Send className="w-4 h-4" />,
    });
    if (!ok) return;

    setSending(true);
    try {
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

      const res = await apiFetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          account_id: accountId,
          audience_type: audience,
          audience_filter: audience === 'tags' ? { tag_ids: tagIds } : {},
          content: { ...draftContent, image_url: imageUrl },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'ส่งบรอดแคสต์ไม่สำเร็จ');
      }
      showToast('เริ่มส่งบรอดแคสต์แล้ว', 'success');
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
    return <Layout><Container size="2xl"><LoadingCard /></Container></Layout>;
  }
  if (!allowed) {
    return <Layout><Container size="2xl"><NoPermissionCard /></Container></Layout>;
  }

  return (
    <Layout>
      {confirmDialog}
      <Container size="2xl">
        <PageHeader backHref="/marketing/broadcast" title="สร้างบรอดแคสต์" subtitle="ข้อความถูกส่งจากระบบนี้ จึงบันทึกไว้ให้ครบว่าส่งอะไรถึงใครไปแล้วบ้าง" />

        {/* 1. ช่องทาง */}
        <Card>
          <h2 className="heading-3">ช่องทาง</h2>
          <p className="section-desc mb-3">เลือกบัญชีที่จะใช้ส่ง</p>
          {accounts.length === 0 ? (
            <Alert tone="warning">
              ยังไม่มีช่องทางที่ส่งได้ — เพิ่ม LINE OA ที่ ตั้งค่า &gt; ช่องทาง Chat ก่อน
            </Alert>
          ) : (
            <FormSelect
              value={accountId}
              onChange={setAccountId}
              options={accounts.map(a => ({
                id: a.id,
                label: a.name,
                subtitle: BROADCAST_PLATFORMS[a.platform].label,
                icon: <PlatformIcon id={a.platform} size={18} />,
              }))}
              placeholder="-- เลือกช่องทาง --"
            />
          )}

          {info && <p className="section-desc mt-2">ส่งถึงได้: {info.audience}</p>}

          {pendingPlatforms.length > 0 && (
            <div className="mt-5 border-t border-gray-200 dark:border-slate-700 pt-4">
              <p className="field-label mb-2.5">ช่องทางอื่น — ยังส่งไม่ได้</p>
              <ul className="space-y-3">
                {pendingPlatforms.map(p => (
                  <li key={p.id} className="flex gap-2.5">
                    <span className="mt-0.5 flex-shrink-0 opacity-45"><PlatformIcon id={p.id} size={18} /></span>
                    <div className="min-w-0">
                      <p className="body-text text-gray-700 dark:text-slate-300">
                        {p.label}
                        <span className="text-gray-400 dark:text-slate-500"> · ส่งถึงได้แค่{p.audience}</span>
                      </p>
                      <p className="helper-text text-gray-500 dark:text-slate-400">{p.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* 2. ผู้รับ */}
        {platform && (
          <Card>
            <h2 className="heading-3">ผู้รับ</h2>
            <p className="section-desc mb-3">ส่งถึงใครบ้าง</p>

            <div className="space-y-3">
              {audienceOptions.map(opt => (
                <div key={opt.key}>
                  <Radio checked={audience === opt.key} onChange={() => setAudience(opt.key)} label={opt.label} />
                  {opt.hint && audience === opt.key && <p className="section-desc ml-7">{opt.hint}</p>}
                  {opt.key === 'tags' && audience === 'tags' && (
                    <div className="ml-7 mt-2">
                      <MultiSelectSearch
                        value={tagIds}
                        onChange={setTagIds}
                        options={tags.map(t => ({ id: t.id, label: t.name }))}
                        emptyLabel="เลือกแท็ก..."
                        icon={<Tag className="w-4 h-4" />}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <p className="body-text text-gray-700 dark:text-slate-300">
                {previewLoading
                  ? 'กำลังนับผู้รับ...'
                  : `ผู้รับ ${recipientCount.toLocaleString()} คน${quotaText ? ` · ${quotaText}` : ''}`}
              </p>

              {quotaShort && (
                <Alert tone="warning" title="โควตาไม่พอ">ลดกลุ่มผู้รับหรือรอรอบเดือนหน้า</Alert>
              )}

              {noRecipients && (
                <Alert tone="warning">
                  {platform === 'tiktok'
                    ? 'ไม่มีผู้รับที่ตรงเงื่อนไข — TikTok ให้ทักได้เฉพาะลูกค้าที่เคยสั่งซื้อภายใน 365 วัน'
                    : 'ไม่มีผู้รับที่ตรงเงื่อนไข — เลือกกลุ่มอื่นหรือเพิ่มแท็กให้ลูกค้าก่อน'}
                </Alert>
              )}

              {audience === 'all' && preview && (
                <Alert tone="info">
                  {preview.follower_stats?.reachable != null ? (
                    <>
                      LINE รายงานว่าส่งถึงได้ {preview.follower_stats.reachable.toLocaleString()} คน
                      (ข้อมูลของเมื่อวาน — ตรงกับเลข &quot;เพื่อน&quot; ใน LINE OA Manager) —
                      บันทึกลงห้องแชทได้ {preview.known_contact_count.toLocaleString()} คนที่มีในระบบ
                      {preview.follower_stats.total_adds != null && preview.follower_stats.blocks != null && (
                        <span className="block helper-text text-blue-700/70 dark:text-blue-300/70 mt-1">
                          เคยกดแอดสะสม {preview.follower_stats.total_adds.toLocaleString()} คน
                          · บล็อกไปแล้ว {preview.follower_stats.blocks.toLocaleString()} คน จึงไม่นับเป็นผู้รับ
                        </span>
                      )}
                    </>
                  ) : (
                    `LINE ยังไม่สรุปจำนวนผู้ติดตามให้ — บันทึกลงห้องแชทได้ ${preview.known_contact_count.toLocaleString()} คนที่มีในระบบ`
                  )}
                </Alert>
              )}
            </div>
          </Card>
        )}

        {/* 3. เนื้อหา */}
        {compose && (
          <Card>
            <h2 className="heading-3">เนื้อหา</h2>
            <p className="section-desc mb-3">ลูกค้าจะได้รับอะไร</p>

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

            {/* หัวข้อ — TikTok บังคับ · LINE ใช้เป็นหัวการ์ดของโปรโมชัน */}
            {(compose.titleMax || kind === 'promo') && (
              <div className="mb-4">
                <FormInput
                  label="หัวข้อ"
                  required={!!compose.titleMax}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={compose.titleMax ?? 40}
                  disabled={sending}
                  placeholder="หัวข้อที่ลูกค้าเห็นก่อน"
                  hint={`${title.length}/${compose.titleMax ?? 40} ตัวอักษร`}
                />
              </div>
            )}

            <label className="field-label block mb-1">
              {kind === 'products' ? 'ข้อความเกริ่น (ไม่บังคับ)' : 'ข้อความ'}
            </label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={kind === 'announce' ? 5 : 3}
              placeholder="พิมพ์ข้อความที่จะส่งถึงลูกค้า"
              disabled={sending}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <p className="subtitle-text mt-1 text-right text-gray-500 dark:text-slate-400">
              {text.length.toLocaleString()}/{(kind === 'promo' ? 60 : compose.bodyMax).toLocaleString()}
            </p>

            {/* รูป — โปรโมชันใช้เป็นแบนเนอร์บนการ์ด */}
            {compose.image && kind !== 'products' && (
              <div className="mt-4">
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
              <p className="section-desc mt-3">{info?.label} รับเฉพาะข้อความล้วน (แนบรูปไม่ได้)</p>
            )}

            {/* ปุ่มกด */}
            {kind === 'promo' && compose.buttonsMax > 0 && (
              <div className="mt-5">
                <label className="field-label block mb-1">ปุ่มกด (สูงสุด {compose.buttonsMax})</label>
                <p className="section-desc mb-2">ใส่ลิงก์ปลายทางเอง เช่น หน้าสินค้า หน้าโปรฯ หรือ LINE MyShop</p>
                <div className="space-y-2">
                  {buttons.map((b, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="w-40 flex-shrink-0">
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
              <div className="mt-5">
                <label className="field-label block mb-1">สินค้า (สูงสุด {compose.productsMax} ชิ้น)</label>
                <p className="section-desc mb-2">
                  ชื่อ รูป ราคา ดึงจากคลังสินค้าให้อัตโนมัติ · ไม่ใส่ลิงก์ = ปุ่มบนการ์ดเป็น
                  &quot;สนใจสินค้านี้&quot; ที่ลูกค้ากดแล้วทักเข้าห้องแชท
                </p>
                {cards.length >= compose.productsMax ? (
                  <p className="section-desc">ครบ {compose.productsMax} ชิ้นแล้ว — เอาออกก่อนถ้าจะเปลี่ยน</p>
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
                      <li key={c.variation_id ?? i} className="flex gap-3 items-start rounded-lg border border-gray-200 dark:border-slate-600 px-3 py-2.5">
                        <ProductImageThumb src={c.image_url} alt={c.name} size="sm" />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="body-text text-gray-900 dark:text-white truncate">{c.name}</p>
                          <p className="helper-text text-gray-500 dark:text-slate-400">
                            {c.price != null ? formatPrice(c.price) : 'ไม่มีราคา'}
                          </p>
                          <FormInput
                            value={c.url ?? ''}
                            disabled={sending}
                            placeholder="ลิงก์สินค้า (ไม่ใส่ก็ได้)"
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
              <div className="mt-5">
                <label className="field-label block mb-1">ปุ่มตอบเร็ว (ไม่บังคับ)</label>
                <p className="section-desc mb-2">
                  ลูกค้ากดแล้วข้อความนั้นถูกส่งเข้าห้องแชททันที — ได้บทสนทนาให้แอดมินปิดการขายต่อ
                </p>
                <div className="space-y-2">
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
                {quickReplies.length < compose.quickReplyMax && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Plus className="w-4 h-4" />}
                    disabled={sending}
                    className="mt-2"
                    onClick={() => setQuickReplies(prev => [...prev, ''])}
                  >
                    เพิ่มปุ่มตอบเร็ว
                  </Button>
                )}
              </div>
            )}

            {/* ตัวอย่าง — วาดตามชนิดจริงที่จะส่ง ไม่ใช่ฟองข้อความอย่างเดียว */}
            {(text.trim() || title.trim() || imagePreviewUrl || cards.length > 0) && (
              <div className="mt-5">
                <p className="field-label mb-2">ตัวอย่างที่ลูกค้าจะเห็น</p>
                <div className="rounded-lg bg-gray-100 dark:bg-slate-800 p-4 flex justify-end">
                  <div className="max-w-[80%] w-full space-y-2">
                    {kind === 'products' ? (
                      <>
                        {text.trim() && (
                          <div className={`ml-auto w-fit rounded-2xl px-4 py-2.5 text-white ${platform === 'line' ? 'bg-[#06C755]' : 'bg-gray-900'}`}>
                            <p className="whitespace-pre-wrap break-words">{text}</p>
                          </div>
                        )}
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {cards.map((c, i) => (
                            <div key={c.variation_id ?? i} className="w-32 flex-shrink-0 rounded-xl bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 overflow-hidden">
                              <div className="h-24 bg-gray-100 dark:bg-slate-600 flex items-center justify-center">
                                <ProductImageThumb src={c.image_url} alt={c.name} size="lg" />
                              </div>
                              <div className="p-2">
                                <p className="subtitle-text text-gray-900 dark:text-white line-clamp-2">{c.name}</p>
                                <p className="helper-text text-gray-500 dark:text-slate-400 mt-0.5">
                                  {c.price != null ? formatPrice(c.price) : ''}
                                </p>
                                <p className="helper-text text-center mt-1.5 py-1 rounded bg-gray-100 dark:bg-slate-600 text-gray-700 dark:text-slate-200">
                                  {c.url ? 'ดูสินค้า' : 'สนใจสินค้านี้'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : kind === 'promo' ? (
                      <div className="ml-auto w-64 rounded-xl bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 overflow-hidden">
                        {imagePreviewUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imagePreviewUrl} alt="แบนเนอร์" className="w-full h-28 object-cover" />
                        )}
                        <div className="p-3">
                          {title.trim() && <p className="body-text font-semibold text-gray-900 dark:text-white">{title}</p>}
                          {text.trim() && <p className="subtitle-text text-gray-600 dark:text-slate-300 mt-0.5 whitespace-pre-wrap break-words">{text}</p>}
                        </div>
                        {buttons.filter(b => b.label.trim()).map((b, i) => (
                          <p key={i} className="helper-text text-center py-2 border-t border-gray-200 dark:border-slate-600 text-[#F4511E]">
                            {b.label}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <div className={`ml-auto w-fit rounded-2xl px-4 py-2.5 text-white space-y-2 ${platform === 'line' ? 'bg-[#06C755]' : 'bg-gray-900'}`}>
                        <p className="text-[11px] opacity-80">📣 บรอดแคสต์</p>
                        {title.trim() && <p className="font-semibold break-words">{title}</p>}
                        {text.trim() && <p className="whitespace-pre-wrap break-words">{text}</p>}
                        {imagePreviewUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imagePreviewUrl} alt="ตัวอย่างรูปที่จะส่ง" className="rounded-lg max-h-56 w-auto" />
                        )}
                      </div>
                    )}

                    {quickReplies.filter(q => q.trim()).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {quickReplies.filter(q => q.trim()).map((q, i) => (
                          <span key={i} className="helper-text px-2.5 py-1 rounded-full border border-[#06C755] text-[#06C755] bg-white dark:bg-slate-700">
                            {q}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {contentError && (
              <p className="subtitle-text text-red-600 dark:text-red-400 mt-4">{contentError}</p>
            )}
          </Card>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.push('/marketing/broadcast')} disabled={sending}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            icon={<Send className="w-4 h-4" />}
            loading={sending}
            disabled={!canSend}
            onClick={handleSend}
          >
            ส่งบรอดแคสต์
          </Button>
        </div>

        {platform === 'line' && (
          <p className="section-desc flex items-center gap-1.5">
            <Megaphone className="w-4 h-4 flex-shrink-0" />
            ส่งถึง 500 คน = 500 ข้อความในโควตา OA — การ์ดที่มีรูป หัวข้อ และปุ่ม ยังนับเป็น 1 ข้อความเท่าข้อความเปล่า
          </p>
        )}

      </Container>
    </Layout>
  );
}
