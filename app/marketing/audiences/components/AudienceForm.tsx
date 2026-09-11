// Path: app/marketing/audiences/components/AudienceForm.tsx
//
// ฟอร์มสร้าง/แก้ไขกลุ่มเป้าหมาย — **หน้าฟอร์มเป็นเจ้าของ state ทั้งหมด** การ์ดย่อย
// (AudienceStep · SourceStep · AudienceRail · MetaSyncRows) รับค่าเข้ามาแล้วคืนกลับ
// (แบบเดียวกับหน้าสร้างบรอดแคสต์ — ตัวเลือกกลุ่มผู้รับจึงใช้การ์ดตัวเดียวกันได้เลย)
//
// กติกาสำคัญ:
// - ลำดับบนจอ: ชื่อกลุ่ม → กลุ่มเป้าหมาย (พฤติกรรม) → แหล่งที่มา (เจ้าของกำหนด 11 ก.ย. 2026)
// - **เลือกพฤติกรรมก่อน แหล่งที่มาทีหลัง** · หน้าบรอดแคสต์ยังเลือก
//   ช่องทางก่อน เพราะที่นั่นช่องทางคือตัวส่งข้อความ ส่วนหน้านี้ส่งไป Meta แหล่งเป็นแค่ที่เก็บข้อมูล
//   · เลือกพฤติกรรมแล้วระบบติ๊กแหล่งที่ตอบได้ให้เอง (`defaultSourcesFor` — ไม่ติ๊ก LINE ให้)
//   · แหล่งที่ตอบพฤติกรรมไม่ได้ขึ้นจางพร้อมเหตุผล · ทุกแหล่งที่เลือกต้องตอบได้ (กฎเดียวกับหลังบ้าน)
// - ชื่อกลุ่มตั้งให้จากพฤติกรรมจนกว่าผู้ใช้จะพิมพ์เอง (`nameTouched`)
// - **สร้างกลุ่ม = sync ไปทุกบัญชีโฆษณาที่พร้อมทันที ไม่มีตัวเลือกปิด** — กลุ่มมีไว้ยิงโฆษณา
//   สร้างแล้วไม่ขึ้น Meta ก็ไม่มีประโยชน์ (เจ้าของ 11 ก.ย. 2026 · เดิมมี checkbox ให้ปิด)
// - `all` (ผู้ติดตามทั้งหมดของ LINE) ปิดตายทุกกรณี — เราไม่มีรายชื่อคนพวกนั้น จึงไม่มี
//   เบอร์/อีเมลจะส่งให้ Meta (เซิร์ฟเวอร์ก็ปฏิเสธ ดู validateAudienceDefinition)
// - จำนวนคนเป็น skeleton ทุกครั้งที่นับใหม่ รวมตอนเปลี่ยนกลุ่ม (`resolvedKey` ≠ เงื่อนไขปัจจุบัน)
//   **ห้ามโชว์ 0** และห้ามค้างตัวเลขของเงื่อนไขเก่าไว้ให้อ่านผิด
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import FormInput from '@/components/ui/FormInput';
import FormTextarea from '@/components/ui/FormTextarea';
import { LoadingCard } from '@/components/ui/StateCard';
import type { EntitySearchOption } from '@/components/ui/EntitySearchInput';
import { useFormValidation } from '@/lib/useFormValidation';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { useServerSearch } from '@/lib/useServerSearch';
import { useToast } from '@/lib/toast-context';
import { apiFetch, invalidateApiCache } from '@/lib/api-client';
import {
  audienceBehaviorOptions,
  audienceLabel,
  buildAudienceFilter,
  type AudienceCounts,
  type AudienceSourceKind,
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
import { defaultSourcesFor, toChatSourceAccounts } from './sources';
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
  /** ผู้ใช้พิมพ์ชื่อเองแล้วหรือยัง — ยัง = ใช้ชื่อตามพฤติกรรมที่เลือก (โหมดแก้ไขถือว่าตั้งไว้แล้ว) */
  const [nameTouched, setNameTouched] = useState(mode === 'edit' || !!initial?.name);
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
  /** เงื่อนไข (JSON) ที่ตัวเลข/error ในแผงขวาตอบอยู่ — ไม่ตรงกับเงื่อนไขปัจจุบัน = กำลังนับใหม่ → skeleton */
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [counts, setCounts] = useState<AudienceCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── แม่แบบ (โหมดสร้างเท่านั้น) ──────────────────────
  /** แม่แบบที่กรอกให้แล้ว — โชว์เป็น Alert เพื่ออธิบายว่าทำไมช่องถึงมีค่าอยู่แล้ว */
  const [appliedTemplate, setAppliedTemplate] = useState<AudienceTemplate | null>(null);
  const [templateNoticeOpen, setTemplateNoticeOpen] = useState(true);
  const templateAppliedRef = useRef(false);

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
          apiFetch('/api/ads/accounts?lite=1'),
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
    if (nameTouched || audience || chatIds.length > 0 || includeCustomers) return;

    // แหล่งที่มาใช้เกณฑ์เดียวกับตอนผู้ใช้เลือกพฤติกรรมเอง — แม่แบบกับการเลือกเองต้องได้ผลเหมือนกัน
    const src = defaultSourcesFor(t.audience_type, chatAccounts);
    setName(t.name);
    setNameTouched(true);
    setDescription(t.description);
    setChatIds(src.chatIds);
    setIncludeCustomers(src.includeCustomers);
    setAudience(t.audience_type);
    if (t.days) setAudienceDays(t.days);
    setAppliedTemplate(t);
    // ตั้งใจอ่านค่าที่กรอกไว้เป็น "สภาพตอนนั้น" — ไม่ต้องรันซ้ำเมื่อผู้ใช้พิมพ์
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, templateKey, chatLoading, chatAccounts, showToast]);

  // ── พฤติกรรม (เลือกก่อน) ─────────────────────────────────────────────
  /** ชนิดแหล่งที่บริษัทมีจริง — ลูกค้าในระบบมีเสมอ */
  const availableKinds = useMemo<AudienceSourceKind[]>(
    () => ['customers', ...new Set(chatAccounts.map(a => a.platform))],
    [chatAccounts],
  );

  /** ทุกพฤติกรรม — ตัวที่ยังไม่มีแหล่งไหนของบริษัทตอบได้ขึ้นจางพร้อมเหตุผล (ไม่ขึ้นกับแหล่งที่ติ๊ก) */
  const { options, disabledOptions } = useMemo(() => {
    const r = audienceBehaviorOptions(availableKinds);
    const disabled: Record<string, string> = { ...r.disabled, all: ALL_DISABLED_REASON };
    return { options: r.options, disabledOptions: disabled };
  }, [availableKinds]);

  // ตัวเลือกที่เลือกไว้ใช้ไม่ได้กับบริษัทนี้ (เช่นเลิกเชื่อมเพจ Facebook) = ต้องเคลียร์
  // ไม่งั้นบันทึกไม่ผ่านแล้วผู้ใช้ไม่เห็นว่ากลุ่มไหนถูกเลือกอยู่
  //
  // ⚠️ ต้องรอรายชื่อช่องทางโหลดเสร็จก่อน — ไม่งั้นตอนเปิดหน้าแก้ไข (ยังไม่รู้จักบัญชีแชท
  // → "ทักจากโฆษณา" ขึ้นว่าไม่มีเพจ) กลุ่มที่บันทึกไว้จะถูกล้างทิ้งทันทีก่อนผู้ใช้เห็นด้วยซ้ำ
  useEffect(() => {
    if (chatLoading || !audience || options.length === 0) return;
    if (options.some(o => o.key === audience) && !disabledOptions[audience]) return;
    setAudience('');
  }, [chatLoading, audience, options, disabledOptions]);

  /**
   * เลือกพฤติกรรม = ติ๊กแหล่งที่ตอบได้ให้ใหม่ทุกครั้ง — ไม่เก็บแหล่งที่ติ๊กไว้กับพฤติกรรมเดิม เพราะ
   * แหล่งเดิมอาจตอบพฤติกรรมใหม่ไม่ได้แล้วบันทึกไม่ผ่านโดยไม่รู้ตัว · ผู้ใช้แก้ต่อได้ในการ์ดแหล่งที่มา
   */
  const handleAudienceChange = (key: string) => {
    setAudience(key);
    const src = defaultSourcesFor(key, chatAccounts);
    setChatIds(src.chatIds);
    setIncludeCustomers(src.includeCustomers);
  };

  // ── แหล่งที่มา (เลือกทีหลัง) ─────────────────────────────────────────
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
  /** เทียบกับ resolvedKey — แผงขวาขึ้น skeleton ทันทีที่เงื่อนไขเปลี่ยน ไม่ต้องรอช่วงหน่วงก่อนยิงคำขอ */
  const definitionKey = useMemo(() => JSON.stringify(definition), [definition]);

  /** ชื่อที่จะบันทึก — ยังไม่พิมพ์เอง = ชื่อของพฤติกรรม ("ซื้อล่าสุดภายใน 90 วัน") */
  const effectiveName = nameTouched ? name : (audience ? audienceLabel(audience, audienceFilter) : '');

  /** ยังกรอกไม่ครบจนนับไม่ได้ — บอกว่าขาดอะไร ไม่ใช่ปล่อยแผงขวาว่าง */
  const hint = useMemo(() => {
    if (!audience) return 'เลือกกลุ่มเป้าหมายก่อน';
    if (sources.length === 0) return 'เลือกแหล่งที่มาอย่างน้อยหนึ่งแหล่ง';
    if (selectedOption?.needsTags && tagIds.length === 0) return 'เลือกแท็กก่อน';
    if (selectedOption?.needsPick && pickedContacts.length === 0) return 'เลือกผู้ติดต่อก่อน';
    return null;
  }, [sources, audience, selectedOption, tagIds, pickedContacts]);

  // ── นับจำนวนคนในกลุ่ม (ตัวเลขใหญ่ในแผงขวา) ───────────────────────────
  const previewSeq = useRef(0);
  const runPreview = useCallback(async (def: AudienceDefinition, skip: boolean) => {
    if (skip) { setPreview(null); setPreviewError(null); setPreviewLoading(false); return; }
    const seq = ++previewSeq.current;
    const key = JSON.stringify(def);
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
        if (seq !== previewSeq.current) return;
        setPreview(null);
        setPreviewError(err.error || 'นับจำนวนคนในกลุ่มไม่สำเร็จ');
        setResolvedKey(key);
        return;
      }
      const json = await res.json();
      if (seq !== previewSeq.current) return;
      setPreview(json);
      setPreviewError(null);
      setResolvedKey(key);
    } catch {
      if (seq !== previewSeq.current) return;
      setPreview(null);
      setPreviewError('นับจำนวนคนในกลุ่มไม่สำเร็จ');
      setResolvedKey(key);
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
      // ปลายทางยังนับไม่ได้ (Facebook) = ไม่แสดงตัวเลข ห้ามทำให้ทั้งหน้าพัง
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
    // พฤติกรรมก่อนชื่อ ทั้งที่ชื่ออยู่บนสุด — ชื่อว่างเพราะยังไม่เลือกพฤติกรรม ต้องบอกเรื่องพฤติกรรม
    if (!audience) { showToast('เลือกกลุ่มเป้าหมายก่อน', 'error'); return; }
    if (!form.validateAll()) return;
    if (sources.length === 0) { showToast('เลือกแหล่งที่มาอย่างน้อยหนึ่งแหล่ง', 'error'); return; }
    if (selectedOption?.needsTags && tagIds.length === 0) { showToast('เลือกแท็กอย่างน้อยหนึ่งอัน', 'error'); return; }
    if (selectedOption?.needsPick && pickedContacts.length === 0) { showToast('เลือกผู้ติดต่ออย่างน้อยหนึ่งคน', 'error'); return; }

    setSaving(true);
    setPreviewError(null);
    try {
      const body = JSON.stringify({ name: effectiveName.trim(), description: description.trim(), definition });
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
        // ผูกกับทุกบัญชีโฆษณาที่พร้อมแล้วเริ่ม sync รอบแรกเสมอ — กลุ่มมีไว้ยิงโฆษณา ไม่มีตัวเลือกปิด
        // (ล้มเหลวไม่กลืน — บอกเป็น toast แล้วยังพาไปหน้ากลุ่มซึ่งกด sync ซ้ำได้)
        const synced = saved && readyAdAccounts.length > 0 ? await startSyncs(saved.id) : null;
        if (synced?.error) showToast(synced.error, 'error');
        else if (synced) showToast(`สร้างกลุ่มแล้ว · กำลัง sync ไป Meta ${synced.ok} บัญชี`, 'success');
        else showToast('สร้างกลุ่มแล้ว', 'success');

        // กลับหน้ารายการ (เจ้าของขอ 11 ก.ย. 2026) — แถวของกลุ่มใหม่เดินสถานะ sync ให้เห็นเอง
        // เพราะหน้ารายการ poll ตอนมีใบกำลัง sync · ล้าง cache อีกรอบหลังผูกบัญชีโฆษณา
        invalidateApiCache('/api/audiences');
        router.push('/marketing/audiences');
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

        {/* 1. ชื่อกลุ่ม — บนสุด (เจ้าของขอ) · ตั้งให้จากพฤติกรรมด้านล่าง ผู้ใช้แก้ได้ */}
        <Card padding="md">
          <h2 className="heading-4 mb-3">ชื่อกลุ่ม</h2>
          <div className="space-y-3">
            <FormInput
              ref={form.register('name')}
              label="ชื่อกลุ่ม"
              required
              maxLength={120}
              value={effectiveName}
              onChange={e => { setName(e.target.value); setNameTouched(true); }}
              placeholder="ตั้งให้เองเมื่อเลือกกลุ่มเป้าหมายด้านล่าง"
              hint="ตั้งให้ตามกลุ่มเป้าหมายที่เลือก แก้ได้ · ชื่อนี้โผล่ในหน้า Ads Manager ของ Meta ด้วย"
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

        {/* 2. พฤติกรรม — รอรายชื่อช่องทางก่อน ไม่งั้น "ทักจากโฆษณา" จะขึ้นว่าไม่มีเพจแวบหนึ่ง */}
        {chatLoading ? (
          <LoadingCard />
        ) : (
          <AudienceStep
            options={options}
            disabledOptions={disabledOptions}
            audience={audience}
            onAudienceChange={handleAudienceChange}
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

        {/* 3. แหล่งที่มา — ติ๊กให้ตามพฤติกรรม แหล่งที่ตอบไม่ได้ขึ้นจาง */}
        <SourceStep
          accounts={chatAccounts}
          chatIds={chatIds}
          onChatIdsChange={setChatIds}
          includeCustomers={includeCustomers}
          onIncludeCustomersChange={setIncludeCustomers}
          audienceType={audience}
          loading={chatLoading}
          disabled={saving}
        />

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.push('/marketing/audiences')} disabled={saving}>
            ยกเลิก
          </Button>
          {/* สร้าง = บอกผลของการกดให้ชัด · แก้ไข = "บันทึก" ตามมาตรฐานของ SaveButton */}
          <SaveButton onClick={handleSave} loading={saving}>
            {mode === 'create' ? 'สร้างกลุ่มเป้าหมาย' : undefined}
          </SaveButton>
        </div>
      </div>

      <div className="xl:sticky xl:top-4 space-y-4">
        <AudienceRail
          preview={preview}
          loading={previewLoading || resolvedKey !== definitionKey}
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
