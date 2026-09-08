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
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import {
  BROADCAST_PLATFORMS,
  BROADCAST_PLATFORM_LIST,
  canBroadcastVia,
  isBroadcastPlatform,
  type BroadcastPlatform,
} from '@/lib/broadcast/platforms';
import { Megaphone, Send, Tag } from 'lucide-react';

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
    {
      key: 'tags',
      label: 'ตามแท็กลูกค้า',
      hint: 'นับเฉพาะคนที่ติดแท็ก **และ** มีออเดอร์ภายใน 365 วัน',
    },
  ],
};

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
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);

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
        // marketplace กับ chat อยู่คนละปลายทาง — ยิงพร้อมกันแล้วรวมเป็นรายการเดียว
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
            if (s.is_active) {
              list.push({ id: s.id, platform: marketplacePlatforms[i], name: s.shop_name || 'ร้าน' });
            }
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

  // เปลี่ยนช่องทาง = กลุ่มผู้รับชุดเดิมอาจใช้ไม่ได้ → กลับไปตัวแรกของช่องทางใหม่เสมอ
  useEffect(() => {
    if (audienceOptions.length === 0) { setAudience(''); return; }
    if (!audienceOptions.some(o => o.key === audience)) setAudience(audienceOptions[0].key);
  }, [audienceOptions, audience]);

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

  const needsTitle = !!compose?.titleMax;
  const allowsImage = !!compose?.image;
  const bodyMax = compose?.bodyMax ?? 0;

  const hasContent = text.trim().length > 0 || (allowsImage && !!imageFile);
  const titleMissing = needsTitle && title.trim().length === 0;
  const textTooLong = !!compose && text.length > bodyMax;
  const titleTooLong = !!compose?.titleMax && title.length > compose.titleMax;
  // โหมด 'all' ของ LINE ยิงผ่าน broadcast API ไม่ต้องมีรายชื่อของเรา
  const noRecipients = audience !== 'all' && !previewLoading && !!platform && recipientCount === 0;
  const canSend = !!accountId && !!audience && hasContent && !titleMissing
    && !textTooLong && !titleTooLong && !quotaShort && !noRecipients && !sending;

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
      if (allowsImage && imageFile) {
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
          title: needsTitle ? title.trim() : null,
          text: text.trim() || null,
          image_url: imageUrl,
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

          {info && (
            <p className="section-desc mt-2">ส่งถึงได้: {info.audience}</p>
          )}

          {/* ช่องทางที่ยังส่งไม่ได้ — บอกเหตุผลไว้ตรงนี้ ผู้ใช้จะได้ไม่ต้องเดาว่าทำไมไม่มีให้เลือก
              (ข้อความอ่านจากทะเบียนเดียวกับที่ API ใช้ปฏิเสธ จึงตรงกันเสมอ) */}
          {pendingPlatforms.length > 0 && (
            <div className="mt-5 border-t border-gray-200 dark:border-slate-700 pt-4">
              <p className="field-label mb-2.5">ช่องทางอื่น — ยังส่งไม่ได้</p>
              <ul className="space-y-3">
                {pendingPlatforms.map(p => (
                  <li key={p.id} className="flex gap-2.5">
                    <span className="mt-0.5 flex-shrink-0 opacity-45">
                      <PlatformIcon id={p.id} size={18} />
                    </span>
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
                  <Radio
                    checked={audience === opt.key}
                    onChange={() => setAudience(opt.key)}
                    label={opt.label}
                  />
                  {opt.hint && audience === opt.key && (
                    <p className="section-desc ml-7">{opt.hint}</p>
                  )}
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
                <Alert tone="warning" title="โควตาไม่พอ">
                  ลดกลุ่มผู้รับหรือรอรอบเดือนหน้า
                </Alert>
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

        {/* 3. ข้อความ */}
        {compose && (
          <Card>
            <h2 className="heading-3">ข้อความ</h2>
            <p className="section-desc mb-3">ข้อความที่ลูกค้าจะได้รับ</p>

            {needsTitle && (
              <div className="mb-4">
                <FormInput
                  label="หัวข้อ"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={compose.titleMax}
                  disabled={sending}
                  placeholder="หัวข้อที่ลูกค้าเห็นก่อนเปิดอ่าน"
                  hint={`${title.length}/${compose.titleMax} ตัวอักษร`}
                />
              </div>
            )}

            <label className="field-label block mb-1">ข้อความ</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={5}
              placeholder="พิมพ์ข้อความที่จะส่งถึงลูกค้า"
              disabled={sending}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <p className={`subtitle-text mt-1 text-right ${textTooLong ? 'text-red-600' : 'text-gray-500 dark:text-slate-400'}`}>
              {text.length.toLocaleString()}/{bodyMax.toLocaleString()}
            </p>

            {allowsImage ? (
              <div className="mt-4">
                <label className="field-label block mb-1">รูปภาพ (ไม่บังคับ)</label>
                <ImageDropzone
                  value={imageFile}
                  onChange={setImageFile}
                  disabled={sending}
                  label="ลากรูปมาวาง หรือกดเพื่อเลือก"
                  maxWidthOrHeight={1280}
                />
              </div>
            ) : (
              <p className="section-desc mt-3">
                {info?.label} รับเฉพาะข้อความล้วน (แนบรูปไม่ได้)
              </p>
            )}

            {hasContent && (
              <div className="mt-5">
                <p className="field-label mb-2">ตัวอย่างที่ลูกค้าจะเห็น</p>
                <div className="rounded-lg bg-gray-100 dark:bg-slate-800 p-4 flex justify-end">
                  <div className={`max-w-[80%] rounded-2xl text-white px-4 py-2.5 space-y-2 ${platform === 'line' ? 'bg-[#06C755]' : 'bg-gray-900'}`}>
                    <p className="text-[11px] opacity-80">📣 บรอดแคสต์</p>
                    {needsTitle && title.trim() && <p className="font-semibold break-words">{title}</p>}
                    {text.trim() && <p className="whitespace-pre-wrap break-words">{text}</p>}
                    {imagePreviewUrl && allowsImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imagePreviewUrl}
                        alt="ตัวอย่างรูปที่จะส่ง"
                        className="rounded-lg max-h-56 w-auto"
                      />
                    )}
                  </div>
                </div>
              </div>
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
            ทุกข้อความที่ส่งกินโควตารายเดือนของ OA — ส่งถึง 500 คน = 500 ข้อความ
          </p>
        )}
      </Container>
    </Layout>
  );
}
