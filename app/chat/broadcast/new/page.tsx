'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import FormSelect from '@/components/ui/FormSelect';
import Radio from '@/components/ui/Radio';
import Alert from '@/components/ui/Alert';
import MultiSelectSearch from '@/components/ui/MultiSelectSearch';
import ImageDropzone from '@/components/ui/ImageDropzone';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { LINE_TEXT_MAX } from '@/lib/line/constants';
import { Megaphone, Send, Tag } from 'lucide-react';

type AudienceType = 'contacts' | 'customers' | 'tags' | 'all';

interface ChatAccountRow {
  id: string;
  platform: string;
  account_name: string;
  is_active: boolean;
}

interface TagRow { id: string; name: string; color: string }

interface QuotaInfo {
  type: 'none' | 'limited' | 'unknown';
  limit: number | null;
  used: number;
  remaining: number | null;
}

interface PreviewInfo {
  recipient_count: number;
  known_contact_count: number;
  quota: QuotaInfo | null;
  followers: number | null;
}

const AUDIENCE_OPTIONS: { key: AudienceType; label: string; hint?: string }[] = [
  { key: 'contacts', label: 'ผู้ติดต่อทั้งหมดใน OA นี้' },
  { key: 'customers', label: 'เฉพาะที่ผูกกับลูกค้าในระบบแล้ว' },
  { key: 'tags', label: 'ตามแท็กลูกค้า' },
  {
    key: 'all',
    label: 'ทุกคนที่แอดเพื่อน OA (broadcast)',
    hint: 'รวมคนที่ยังไม่เคยทักมา — ระบบรู้จำนวนผู้ติดตามจาก LINE แต่ไม่รู้ว่าเป็นใคร จึงบันทึกลงห้องแชทได้เฉพาะผู้ติดต่อที่มีในระบบ',
  },
];

export default function NewLineBroadcastPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const { allowed, loading: authLoading } = useAuthGuard('chat.broadcast', { noRedirect: true });

  const [accounts, setAccounts] = useState<ChatAccountRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [accountId, setAccountId] = useState('');
  const [audience, setAudience] = useState<AudienceType>('contacts');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // object URL ต้องคืนทุกครั้งที่เปลี่ยนรูป — สร้างใน render จะรั่วทุกรอบที่ re-render
  useEffect(() => {
    if (!imageFile) { setImagePreviewUrl(null); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // ─── โหลดช่องทาง + แท็ก ─────────────────────────────────────────────
  useEffect(() => {
    if (!allowed) return;
    (async () => {
      try {
        const [accRes, tagRes] = await Promise.all([
          apiFetch('/api/chat-accounts?platform=line'),
          apiFetch('/api/customers/tags'),
        ]);
        if (accRes.ok) {
          const data = await accRes.json();
          const list: ChatAccountRow[] = (data.accounts || []).filter(
            (a: ChatAccountRow) => a.platform === 'line' && a.is_active,
          );
          setAccounts(list);
          if (list.length === 1) setAccountId(list[0].id);
        }
        if (tagRes.ok) {
          const data = await tagRes.json();
          setTags(data.tags || []);
        }
      } catch {
        showToast('โหลดข้อมูลช่องทางไม่สำเร็จ', 'error');
      }
    })();
  }, [allowed, showToast]);

  // ─── ประเมินผู้รับ + โควตา ──────────────────────────────────────────
  const runPreview = useCallback(async (accId: string, aud: AudienceType, ids: string[]) => {
    if (!accId) { setPreview(null); return; }
    setPreviewLoading(true);
    try {
      const res = await apiFetch('/api/line/broadcasts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_account_id: accId,
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
    debouncedPreview(accountId, audience, tagIds);
  }, [allowed, accountId, audience, tagIds, debouncedPreview]);

  // ─── สรุปสิ่งที่จะเกิดขึ้น ────────────────────────────────────────────
  const recipientCount = preview?.recipient_count ?? 0;
  const quota = preview?.quota ?? null;
  const quotaShort = !!quota && quota.type === 'limited' && quota.remaining !== null && quota.remaining < recipientCount;
  const selectedAccount = accounts.find(a => a.id === accountId);

  const quotaText = useMemo(() => {
    if (!quota || quota.type === 'unknown') return null;
    if (quota.type === 'none') return `โควตาเดือนนี้ ใช้ไป ${quota.used.toLocaleString()} ข้อความ (ไม่จำกัด)`;
    return `โควตาเดือนนี้ ${quota.used.toLocaleString()}/${(quota.limit ?? 0).toLocaleString()} (เหลือ ${(quota.remaining ?? 0).toLocaleString()})`;
  }, [quota]);

  const hasContent = text.trim().length > 0 || !!imageFile;
  const textTooLong = text.length > LINE_TEXT_MAX;
  // โหมด 'all' ยิงผ่าน broadcast API ไม่ต้องมีรายชื่อของเรา — โหมดอื่นไม่มีผู้รับ = ส่งไม่ได้
  const noRecipients = audience !== 'all' && !previewLoading && recipientCount === 0;
  const canSend = !!accountId && hasContent && !textTooLong && !quotaShort && !noRecipients && !sending;

  // ─── ส่ง ─────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!canSend) return;

    const ok = await confirm({
      title: 'ส่งบรอดแคสต์',
      description: `ส่งถึง ${recipientCount.toLocaleString()} คน ผ่าน ${selectedAccount?.account_name || 'LINE OA'}? ข้อความจะถูกส่งทันทีและกินโควตา ${recipientCount.toLocaleString()} ข้อความ`,
      confirmLabel: 'ส่งบรอดแคสต์',
      confirmIcon: <Send className="w-4 h-4" />,
    });
    if (!ok) return;

    setSending(true);
    try {
      let imageUrl: string | null = null;
      if (imageFile) {
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

      const res = await apiFetch('/api/line/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_account_id: accountId,
          audience_type: audience,
          audience_filter: audience === 'tags' ? { tag_ids: tagIds } : {},
          text: text.trim() || null,
          image_url: imageUrl,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'ส่งบรอดแคสต์ไม่สำเร็จ');
      }
      showToast('เริ่มส่งบรอดแคสต์แล้ว', 'success');
      router.push('/chat/broadcast');
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
        <PageHeader backHref="/chat/broadcast" title="สร้างบรอดแคสต์" subtitle="ข้อความจะถูกส่งจากระบบนี้ จึงบันทึกลงห้องแชทของลูกค้าให้ด้วย" />

        {/* 1. ช่องทาง */}
        <Card>
          <h2 className="heading-3">ช่องทาง</h2>
          <p className="section-desc mb-3">เลือก LINE OA ที่จะใช้ส่ง</p>
          {accounts.length === 0 ? (
            <Alert tone="warning">
              ยังไม่มี LINE OA ที่เปิดใช้งาน — เพิ่มช่องทางที่ ตั้งค่า &gt; ช่องทาง Chat ก่อน
            </Alert>
          ) : (
            <FormSelect
              value={accountId}
              onChange={setAccountId}
              options={accounts.map(a => ({ id: a.id, label: a.account_name }))}
              placeholder="-- เลือก LINE OA --"
            />
          )}
        </Card>

        {/* 2. ผู้รับ */}
        <Card>
          <h2 className="heading-3">ผู้รับ</h2>
          <p className="section-desc mb-3">ส่งถึงใครบ้าง</p>

          <div className="space-y-3">
            {AUDIENCE_OPTIONS.map(opt => (
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
              <Alert tone="warning">ไม่มีผู้รับที่ตรงเงื่อนไข — เลือกกลุ่มอื่นหรือเพิ่มแท็กให้ลูกค้าก่อน</Alert>
            )}

            {audience === 'all' && preview && (
              <Alert tone="info">
                {preview.followers !== null
                  ? `LINE รายงานผู้ติดตาม ${preview.followers.toLocaleString()} คน (ข้อมูลของเมื่อวาน) — บันทึกลงห้องแชทได้ ${preview.known_contact_count.toLocaleString()} คนที่มีในระบบ`
                  : `LINE ยังไม่สรุปจำนวนผู้ติดตามให้ — บันทึกลงห้องแชทได้ ${preview.known_contact_count.toLocaleString()} คนที่มีในระบบ`}
              </Alert>
            )}
          </div>
        </Card>

        {/* 3. ข้อความ */}
        <Card>
          <h2 className="heading-3">ข้อความ</h2>
          <p className="section-desc mb-3">ข้อความและรูปที่ลูกค้าจะได้รับ</p>

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
            {text.length.toLocaleString()}/{LINE_TEXT_MAX.toLocaleString()}
          </p>

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

          {hasContent && (
            <div className="mt-5">
              <p className="field-label mb-2">ตัวอย่างที่ลูกค้าจะเห็น</p>
              <div className="rounded-lg bg-gray-100 dark:bg-slate-800 p-4 flex justify-end">
                <div className="max-w-[80%] rounded-2xl bg-[#06C755] text-white px-4 py-2.5 space-y-2">
                  <p className="text-[11px] opacity-80">📣 บรอดแคสต์</p>
                  {text.trim() && <p className="whitespace-pre-wrap break-words">{text}</p>}
                  {imagePreviewUrl && (
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

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.push('/chat/broadcast')} disabled={sending}>
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

        <p className="section-desc flex items-center gap-1.5">
          <Megaphone className="w-4 h-4 flex-shrink-0" />
          ทุกข้อความที่ส่งกินโควตารายเดือนของ OA — ส่งถึง 500 คน = 500 ข้อความ
        </p>
      </Container>
    </Layout>
  );
}
