// Path: app/marketing/audiences/components/AudienceForm.tsx
//
// ฟอร์มสร้าง/แก้ไขกลุ่มเป้าหมาย — **หน้าฟอร์มเป็นเจ้าของ state ทั้งหมด** การ์ดย่อย
// (SourceStep · AudienceStep · AudienceRail · MetaSyncRows) รับค่าเข้ามาแล้วคืนกลับ
// (แบบเดียวกับหน้าสร้างบรอดแคสต์ — ตัวเลือกกลุ่มผู้รับจึงใช้การ์ดตัวเดียวกันได้เลย)
//
// กติกาสำคัญ:
// - กลุ่มเป้าหมายโฆษณา **หยิบคนจากหลายแหล่งมารวมเป็นกลุ่มเดียว** ⇒ ใช้ `unionAudienceOptions`
//   ไม่ใช่ `commonAudienceOptions` ของบรอดแคสต์ · ตัวที่มีแค่บางแหล่งยังใช้ได้ (ได้คนจาก
//   แหล่งนั้นแหล่งเดียว) — **ห้ามซ่อน** โชว์พร้อมเหตุผลเสมอ
// - `all` (ผู้ติดตามทั้งหมดของ LINE) ปิดตายทุกกรณี — เราไม่มีรายชื่อคนพวกนั้น จึงไม่มี
//   เบอร์/อีเมลจะส่งให้ Meta (เซิร์ฟเวอร์ก็ปฏิเสธ ดู validateAudienceDefinition)
// - จำนวนคนระหว่างโหลดโชว์ '—' **ห้ามโชว์ 0**
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import HelpHint from '@/components/ui/HelpHint';
import SaveButton from '@/components/ui/SaveButton';
import FormInput from '@/components/ui/FormInput';
import FormTextarea from '@/components/ui/FormTextarea';
import type { EntitySearchOption } from '@/components/ui/EntitySearchInput';
import { useFormValidation } from '@/lib/useFormValidation';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { useServerSearch } from '@/lib/useServerSearch';
import { useToast } from '@/lib/toast-context';
import { apiFetch, invalidateApiCache } from '@/lib/api-client';
import {
  AUDIENCE_OPTIONS,
  buildAudienceFilter,
  unionAudienceOptions,
  type AudienceCounts,
  type AudienceOption,
  type PickedContact,
  type StoredAudienceFilter,
  type TagRow,
} from '@/lib/broadcast/audience';
import type { AdAccountView } from '@/lib/ads/meta-ui';
import { findAudienceTemplate, templateUnavailableReason, type AudienceTemplate } from '@/lib/audiences/templates';
import AudienceStep from '@/app/marketing/broadcast/new/components/AudienceStep';
import SourceStep from './SourceStep';
import AudienceRail from './AudienceRail';
import MetaSyncRows from './MetaSyncRows';
import { toChatSourceAccounts } from './sources';
import type {
  AudienceDefinition,
  AudiencePreview,
  AudienceSource,
  AudienceView,
  ChatSourceAccount,
} from './types';

/** ทำไม 'ผู้ติดตามทั้งหมด' ใช้ทำกลุ่มโฆษณาไม่ได้ — บอกทางออกไว้ในประโยคเดียวกัน */
const ALL_DISABLED_REASON =
  'ไม่มีรายชื่อผู้ติดตาม จึงนับและ sync ไม่ได้ — ใช้ "คนที่เคยทักเข้ามา" แทน';

/** ตัวเลือกที่แหล่ง "ลูกค้าในระบบ" ตอบได้ — ตรงกับ CUSTOMER_AUDIENCE_KEYS ฝั่งเซิร์ฟเวอร์ */
const CUSTOMER_ONLY_EXCLUDE = new Set(['all', 'contacts', 'contacts_pick']);

/** บัญชีโฆษณาที่ผูกกลุ่มได้จริงตอนนี้ — เกณฑ์เดียวกับ notReadyReason() ใน MetaSyncRows */
function isAdAccountReady(a: AdAccountView): boolean {
  return a.status === 'active' && !!a.audiences_ok_at && !a.metadata?.tos_required;
}

interface Props {
  mode: 'create' | 'edit';
  /** โหมดแก้ไข — ค่าตั้งต้นจาก GET /api/audiences/[id] */
  initial?: AudienceView | null;
  /** มาจากแม่แบบ (?template=) — โหมดสร้างเท่านั้น กรอกค่าให้ครั้งเดียวแล้วผู้ใช้แก้ต่อได้ */
  templateKey?: string | null;
  /** แจ้งหน้าแม่เมื่อข้อมูลเปลี่ยน (ชื่อบนหัวเรื่อง · สถานะ sync) */
  onAudienceChange?: (a: AudienceView) => void;
}

export default function AudienceForm({ mode, initial, templateKey, onAudienceChange }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const form = useFormValidation();

  const [current, setCurrent] = useState<AudienceView | null>(initial ?? null);

  // ── ข้อมูลอ้างอิง ────────────────────────────────────────────────────
  const [chatAccounts, setChatAccounts] = useState<ChatSourceAccount[]>([]);
  const [chatLoading, setChatLoading] = useState(true);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccountView[]>([]);
  const [adLoading, setAdLoading] = useState(true);
  const [canManageAdAccounts, setCanManageAdAccounts] = useState(false);

  // ── ค่าที่ผู้ใช้กรอก ─────────────────────────────────────────────────
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [chatIds, setChatIds] = useState<string[]>(
    () => (initial?.definition?.sources || [])
      .filter(s => s.kind === 'chat')
      .map(s => (s as { chat_account_id: string }).chat_account_id),
  );
  const [includeCustomers, setIncludeCustomers] = useState(
    () => (initial?.definition?.sources || []).some(s => s.kind === 'customers'),
  );
  const [audience, setAudience] = useState(initial?.definition?.audience_type || '');
  const [tagIds, setTagIds] = useState<string[]>(() => initial?.definition?.audience_filter?.tag_ids || []);
  const [pickedContacts, setPickedContacts] = useState<PickedContact[]>(
    () => (initial?.definition?.audience_filter?.contact_ids || []).map(id => ({ id, name: '' })),
  );
  const [audienceDays, setAudienceDays] = useState(initial?.definition?.audience_filter?.days || 30);
  const [minMessages, setMinMessages] = useState(initial?.definition?.audience_filter?.min_messages || 0);
  const [lastChatDays, setLastChatDays] = useState(initial?.definition?.audience_filter?.last_chat_days || 0);

  // ── ผลนับ ────────────────────────────────────────────────────────────
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [counts, setCounts] = useState<AudienceCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── แม่แบบ + sync หลังบันทึก (โหมดสร้างเท่านั้น) ──────────────────────
  /** แม่แบบที่กรอกให้แล้ว — โชว์เป็น Alert เพื่ออธิบายว่าทำไมช่องถึงมีค่าอยู่แล้ว */
  const [appliedTemplate, setAppliedTemplate] = useState<AudienceTemplate | null>(null);
  const [templateNoticeOpen, setTemplateNoticeOpen] = useState(true);
  const templateAppliedRef = useRef(false);
  const [syncAfterSave, setSyncAfterSave] = useState(true);

  /** โหมดสร้างยังไม่มีใบให้ผูกกับบัญชีโฆษณา — บล็อก Meta จึงบอกให้บันทึกก่อน */
  const audienceId = mode === 'edit' ? (current?.id ?? null) : null;

  const applyAudience = useCallback((a: AudienceView) => {
    setCurrent(a);
    onAudienceChange?.(a);
  }, [onAudienceChange]);

  // ── โหลดช่องทางแชท + แท็ก + บัญชีโฆษณา ───────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [chatRes, tagRes, adRes] = await Promise.all([
          apiFetch('/api/chat-accounts'),
          apiFetch('/api/customers/tags'),
          apiFetch('/api/ads/accounts'),
        ]);

        // ดึงผู้ติดต่อได้เฉพาะ LINE/Facebook — เกณฑ์อยู่ที่ toChatSourceAccounts ที่เดียว
        if (chatRes.ok) setChatAccounts(toChatSourceAccounts((await chatRes.json()).accounts));

        if (tagRes.ok) setTags((await tagRes.json()).tags || []);

        // 403 = ไม่มีสิทธิ์ดูบัญชีโฆษณา — ไม่ใช่ error ของหน้านี้ แค่ไม่ชี้ไปหน้าที่เข้าไม่ได้
        if (adRes.ok) {
          setAdAccounts((await adRes.json()).accounts || []);
          setCanManageAdAccounts(true);
        }
      } catch {
        showToast('โหลดข้อมูลช่องทางไม่สำเร็จ', 'error');
      } finally {
        setChatLoading(false);
        setAdLoading(false);
      }
    })();
  }, [showToast]);

  // ── กรอกค่าจากแม่แบบ (?template=) ────────────────────────────────────
  //
  // **ต้องรอรายชื่อช่องทางโหลดเสร็จก่อน** เพราะแม่แบบติ๊กแหล่งที่มาให้ด้วย — กรอกก่อน
  // แล้วเอฟเฟกต์ที่เคลียร์ตัวเลือกซึ่งไม่อยู่ในรายการ (ด้านล่าง) จะล้างกลุ่มที่เพิ่งตั้งทิ้ง
  //
  // กรอกครั้งเดียวตลอดอายุฟอร์ม (ref guard) และเฉพาะตอนผู้ใช้ยังไม่ได้กรอกอะไรเลย —
  // ไม่งั้นค่าที่พิมพ์ไปแล้วจะถูกทับ
  useEffect(() => {
    if (mode !== 'create' || !templateKey || chatLoading) return;
    if (templateAppliedRef.current) return;
    templateAppliedRef.current = true;

    const t = findAudienceTemplate(templateKey);
    if (!t) return;

    const reason = templateUnavailableReason(t, chatAccounts);
    if (reason) { showToast(reason, 'error'); return; }

    // ผู้ใช้เริ่มกรอกเองแล้ว = ไม่แตะ (เช่นเปิดค้างไว้นานแล้วเน็ตเพิ่งตอบ)
    if (name || audience || chatIds.length > 0 || includeCustomers) return;

    const picked = t.sources === 'facebook_only'
      ? chatAccounts.filter(a => a.platform === 'facebook')
      : chatAccounts;

    setName(t.name);
    setDescription(t.description);
    setChatIds(picked.map(a => a.id));
    setIncludeCustomers(t.sources === 'chat_and_customers');
    setAudience(t.audience_type);
    if (t.days) setAudienceDays(t.days);
    setAppliedTemplate(t);
    // ตั้งใจอ่านค่าที่กรอกไว้เป็น "สภาพตอนนั้น" — ไม่ต้องรันซ้ำเมื่อผู้ใช้พิมพ์
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, templateKey, chatLoading, chatAccounts, showToast]);

  // ── แหล่งที่มา + ตัวเลือกกลุ่ม ────────────────────────────────────────
  const selectedChat = useMemo(
    () => chatAccounts.filter(a => chatIds.includes(a.id)),
    [chatAccounts, chatIds],
  );

  const sources = useMemo<AudienceSource[]>(() => {
    const list: AudienceSource[] = selectedChat.map(a => ({
      kind: 'chat', platform: a.platform, chat_account_id: a.id,
    }));
    if (includeCustomers) list.push({ kind: 'customers' });
    return list;
  }, [selectedChat, includeCustomers]);

  const platforms = useMemo(
    () => [...new Set(selectedChat.map(a => a.platform))],
    [selectedChat],
  );

  /** ตัวเลือกทั้งหมดของแหล่งที่เลือก + เหตุผลของตัวที่ใช้ได้ไม่ครบทุกแหล่ง */
  const { options, disabledOptions } = useMemo(() => {
    if (platforms.length > 0) {
      const union = unionAudienceOptions(platforms);
      return {
        options: union.options,
        disabledOptions: { ...union.unsupported, all: ALL_DISABLED_REASON },
      };
    }
    if (includeCustomers) {
      // ไม่มีห้องแชทเลย = ตอบได้เฉพาะกลุ่มที่คิดจากประวัติการซื้อ
      const list = (AUDIENCE_OPTIONS.line || []).filter(o => !CUSTOMER_ONLY_EXCLUDE.has(o.key));
      return { options: list as AudienceOption[], disabledOptions: {} as Record<string, string> };
    }
    return { options: [] as AudienceOption[], disabledOptions: {} as Record<string, string> };
  }, [platforms, includeCustomers]);

  // ตัวเลือกที่เลือกไว้หลุดออกจากรายการ (เปลี่ยนแหล่งที่มา) = ต้องเคลียร์ ไม่งั้นบันทึกไม่ผ่าน
  // แล้วผู้ใช้ไม่เห็นว่ากลุ่มไหนถูกเลือกอยู่
  //
  // ⚠️ ต้องรอรายชื่อช่องทางโหลดเสร็จก่อน และรายการตัวเลือกต้องไม่ว่าง — ไม่งั้นตอนเปิดหน้าแก้ไข
  // (ยังไม่รู้จักบัญชีแชท → options ว่าง) กลุ่มที่บันทึกไว้จะถูกล้างทิ้งทันทีก่อนผู้ใช้เห็นด้วยซ้ำ
  useEffect(() => {
    if (chatLoading || !audience || options.length === 0) return;
    if (options.some(o => o.key === audience) && !disabledOptions[audience]) return;
    setAudience('');
  }, [chatLoading, audience, options, disabledOptions]);

  const selectedOption = options.find(o => o.key === audience) || null;

  const audienceFilter = useMemo<StoredAudienceFilter>(() => buildAudienceFilter(audience, {
    tagIds,
    contactIds: pickedContacts.map(c => c.id),
    days: audienceDays,
    minMessages,
    lastChatDays,
  }), [audience, tagIds, pickedContacts, audienceDays, minMessages, lastChatDays]);

  const definition = useMemo<AudienceDefinition>(
    () => ({ audience_type: audience, audience_filter: audienceFilter, sources }),
    [audience, audienceFilter, sources],
  );

  /** ยังกรอกไม่ครบจนนับไม่ได้ — บอกว่าขาดอะไร ไม่ใช่ปล่อยแผงขวาว่าง */
  const hint = useMemo(() => {
    if (sources.length === 0) return 'เลือกแหล่งที่มาก่อน';
    if (!audience) return 'เลือกกลุ่มเป้าหมายก่อน';
    if (selectedOption?.needsTags && tagIds.length === 0) return 'เลือกแท็กก่อน';
    if (selectedOption?.needsPick && pickedContacts.length === 0) return 'เลือกผู้ติดต่อก่อน';
    return null;
  }, [sources, audience, selectedOption, tagIds, pickedContacts]);

  // ── นับจำนวนคนในกลุ่ม (ตัวเลขใหญ่ในแผงขวา) ───────────────────────────
  const previewSeq = useRef(0);
  const runPreview = useCallback(async (def: AudienceDefinition, skip: boolean) => {
    if (skip) { setPreview(null); setPreviewError(null); setPreviewLoading(false); return; }
    const seq = ++previewSeq.current;
    setPreviewLoading(true);
    try {
      const res = await apiFetch('/api/audiences/preview-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition: def }),
      });
      // ผลของคำขอเก่าที่มาช้ากว่าต้องถูกทิ้ง ไม่งั้นตัวเลขจะเด้งกลับไปของเงื่อนไขก่อนหน้า
      if (seq !== previewSeq.current) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPreview(null);
        setPreviewError(err.error || 'นับจำนวนคนในกลุ่มไม่สำเร็จ');
        return;
      }
      setPreview(await res.json());
      setPreviewError(null);
    } catch {
      if (seq !== previewSeq.current) return;
      setPreview(null);
      setPreviewError('นับจำนวนคนในกลุ่มไม่สำเร็จ');
    } finally {
      if (seq === previewSeq.current) setPreviewLoading(false);
    }
  }, []);

  const debouncedPreview = useDebouncedCallback(runPreview, 400);
  useEffect(() => {
    debouncedPreview(definition, !!hint);
  }, [definition, hint, debouncedPreview]);

  // ── จำนวนคนของทุกกลุ่ม (โชว์คู่รายการตัวเลือก) ────────────────────────
  const loadCounts = useCallback(async (accs: ChatSourceAccount[], dayCount: number) => {
    // นับแยกกลุ่มได้เฉพาะตอนมีห้องแชทเดียว — หลายแหล่งรายชื่อคนละชุด รวมยอดแล้วอ่านผิด
    if (accs.length !== 1) { setCounts(null); return; }
    const a = accs[0];
    setCountsLoading(true);
    try {
      const res = await apiFetch(
        `/api/broadcasts/audience-counts?platform=${a.platform}&account_id=${a.id}&days=${dayCount}`,
      );
      // ปลายทางยังนับไม่ได้ (Facebook) = โชว์ '—' ห้ามทำให้ทั้งหน้าพัง
      setCounts(res.ok ? await res.json() : null);
    } catch {
      setCounts(null);
    } finally {
      setCountsLoading(false);
    }
  }, []);

  const debouncedCounts = useDebouncedCallback(loadCounts, 400);
  useEffect(() => {
    debouncedCounts(selectedChat, audienceDays);
  }, [selectedChat, audienceDays, debouncedCounts]);

  /** ค้นผู้ติดต่อของห้องแชทที่เลือก — รายชื่อมีเป็นพัน ต้องค้นฝั่ง server */
  const contactSearch = useServerSearch<EntitySearchOption>({
    fetch: useCallback(async (q: string) => {
      const acc = selectedChat[0];
      if (!acc) return { rows: [], complete: true };
      const res = await apiFetch(
        `/api/chat/contacts?platform=${acc.platform}&account_id=${acc.id}&search=${encodeURIComponent(q)}&limit=20`,
      );
      if (!res.ok) throw new Error('contact search failed');
      const json = await res.json();
      const rows: EntitySearchOption[] = (json.contacts || []).map((c: Record<string, unknown>) => ({
        id: String(c.id),
        label: String(c.display_name || 'ไม่ทราบชื่อ'),
        subtitle: (c.customer_name as string) || undefined,
      }));
      return { rows, complete: rows.length < 20 };
    }, [selectedChat]),
  });

  // ── บันทึก ───────────────────────────────────────────────────────────
  /** บัญชีโฆษณาที่ผูกได้จริงตอนนี้ — ไม่มีสักใบ = ไม่ต้องโชว์ตัวเลือก sync ให้รก */
  const readyAdAccounts = useMemo(() => adAccounts.filter(isAdAccountReady), [adAccounts]);

  /** ผูกกลุ่มที่เพิ่งสร้างกับทุกบัญชีที่พร้อม แล้วให้เซิร์ฟเวอร์เริ่ม sync (202) */
  const startSyncs = async (id: string): Promise<{ ok: number; error: string | null }> => {
    let ok = 0;
    let error: string | null = null;
    for (const acc of readyAdAccounts) {
      try {
        const res = await apiFetch(`/api/audiences/${id}/syncs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ad_account_id: acc.id, auto_sync: true }),
        });
        if (res.ok) { ok += 1; continue; }
        const err = await res.json().catch(() => ({}));
        error = error || err.error || 'เริ่ม sync ไป Meta ไม่สำเร็จ';
      } catch {
        error = error || 'เริ่ม sync ไป Meta ไม่สำเร็จ';
      }
    }
    return { ok, error };
  };

  const handleSave = async () => {
    if (!form.validateAll()) return;
    if (sources.length === 0) { showToast('เลือกแหล่งที่มาอย่างน้อยหนึ่งแหล่ง', 'error'); return; }
    if (!audience) { showToast('เลือกกลุ่มเป้าหมายก่อน', 'error'); return; }
    if (selectedOption?.needsTags && tagIds.length === 0) { showToast('เลือกแท็กอย่างน้อยหนึ่งอัน', 'error'); return; }
    if (selectedOption?.needsPick && pickedContacts.length === 0) { showToast('เลือกผู้ติดต่ออย่างน้อยหนึ่งคน', 'error'); return; }

    setSaving(true);
    setPreviewError(null);
    try {
      const body = JSON.stringify({ name: name.trim(), description: description.trim(), definition });
      const res = audienceId
        ? await apiFetch(`/api/audiences/${audienceId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body,
          })
        : await apiFetch('/api/audiences', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
          });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPreviewError(err.error || 'บันทึกกลุ่มเป้าหมายไม่สำเร็จ');
        showToast(err.error || 'บันทึกกลุ่มเป้าหมายไม่สำเร็จ', 'error');
        return;
      }

      const saved = (await res.json())?.audience as AudienceView | undefined;
      invalidateApiCache('/api/audiences');
      if (audienceId) {
        if (saved) applyAudience(saved);
        showToast('บันทึกแล้ว', 'success');
      } else {
        // ผูกกับบัญชีโฆษณาที่พร้อมแล้วเริ่ม sync รอบแรกให้เลย — ไม่งั้นผู้ใช้ต้องไปกดเองอีก
        // หน้าหนึ่ง แล้วกลุ่มที่สร้างไว้ก็ยังยิงโฆษณาไม่ได้จริงโดยที่ไม่มีอะไรบอก
        // (ล้มเหลวไม่กลืน — บอกเป็น toast แล้วยังพาไปหน้ากลุ่มซึ่งกด sync ซ้ำได้)
        const synced = saved && syncAfterSave ? await startSyncs(saved.id) : null;
        if (synced?.error) showToast(synced.error, 'error');
        else if (synced) showToast(`บันทึกแล้ว · เริ่ม sync ไป Meta ${synced.ok} บัญชี`, 'success');
        else showToast('บันทึกกลุ่มแล้ว', 'success');

        if (saved) router.push(`/marketing/audiences/${saved.id}`);
        else router.push('/marketing/audiences');
      }
    } catch {
      showToast('บันทึกกลุ่มเป้าหมายไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
      <div className="space-y-4">
        {/* บอกว่าทำไมช่องถึงมีค่าอยู่แล้ว — ไม่บอก ผู้ใช้จะไม่รู้ว่าแก้ได้ */}
        {appliedTemplate && templateNoticeOpen && (
          <Alert tone="info" onClose={() => setTemplateNoticeOpen(false)}>
            ใช้แม่แบบ &ldquo;{appliedTemplate.name}&rdquo; — {appliedTemplate.use}
          </Alert>
        )}

        <Card padding="md">
          <h2 className="heading-4 mb-3">ชื่อกลุ่ม</h2>
          <div className="space-y-3">
            <FormInput
              ref={form.register('name')}
              label="ชื่อกลุ่ม"
              required
              maxLength={120}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="เช่น ลูกค้าเก่าหายไปเกิน 90 วัน"
              hint="ชื่อนี้โผล่ในหน้า Ads Manager ของ Meta ด้วย"
              disabled={saving}
            />
            <FormTextarea
              label="คำอธิบาย"
              rows={2}
              maxLength={500}
              showCount
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="ใช้กลุ่มนี้ทำอะไร (ไม่กรอกก็ได้)"
              disabled={saving}
            />
          </div>
        </Card>

        <SourceStep
          accounts={chatAccounts}
          chatIds={chatIds}
          onChatIdsChange={setChatIds}
          includeCustomers={includeCustomers}
          onIncludeCustomersChange={setIncludeCustomers}
          loading={chatLoading}
          disabled={saving}
        />

        {options.length > 0 && (
          <AudienceStep
            options={options}
            disabledOptions={disabledOptions}
            audience={audience}
            onAudienceChange={setAudience}
            counts={counts}
            countsLoading={countsLoading}
            countsUnavailable={selectedChat.length !== 1}
            contactTotal={counts?.contact_total ?? null}
            contactLinked={counts?.contact_linked ?? null}
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
            multiAccount={selectedChat.length > 1}
            minMessages={minMessages}
            onMinMessagesChange={setMinMessages}
            lastChatDays={lastChatDays}
            onLastChatDaysChange={setLastChatDays}
            disabled={saving}
          />
        )}

        {/* โหมดสร้างเท่านั้น — โหมดแก้ไขมีแถว sync รายบัญชีอยู่ในแผงขวาแล้ว */}
        {mode === 'create' && readyAdAccounts.length > 0 && (
          <div className="flex justify-end">
            <span className="flex items-center">
              <Checkbox
                checked={syncAfterSave}
                onChange={setSyncAfterSave}
                disabled={saving}
                label="sync ไป Meta ทันทีหลังบันทึก"
              />
              <HelpHint align="right">
                ผูกกลุ่มนี้กับทุกบัญชีโฆษณาที่พร้อม แล้วเริ่มอัปรายชื่อรอบแรกทันที ·
                ปิดไว้ = บันทึกอย่างเดียว ค่อยกด sync ในหน้ากลุ่ม
              </HelpHint>
            </span>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.push('/marketing/audiences')} disabled={saving}>
            ยกเลิก
          </Button>
          <SaveButton onClick={handleSave} loading={saving} />
        </div>
      </div>

      <div className="xl:sticky xl:top-4 space-y-4">
        <AudienceRail
          preview={preview}
          loading={previewLoading}
          error={previewError}
          hint={hint}
        />
        <MetaSyncRows
          audienceId={audienceId}
          syncs={current?.syncs || []}
          adAccounts={adAccounts}
          adAccountsLoading={adLoading}
          canManageAdAccounts={canManageAdAccounts}
          onAudienceChange={applyAudience}
          disabled={saving}
        />
      </div>
    </div>
  );
}
