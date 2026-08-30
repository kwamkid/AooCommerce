// Path: app/settings/sales-channels/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import SearchInput from '@/components/ui/SearchInput';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import Badge from '@/components/ui/Badge';
import Toggle from '@/components/ui/Toggle';
import FormSelect from '@/components/ui/FormSelect';
import PlatformIcon from '@/components/ui/PlatformIcon';
import FilterChips from '@/components/ui/FilterChips';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { useBfcacheReset } from '@/lib/useBfcacheReset';
import Tabs from '@/components/ui/Tabs';
import { useFeatures } from '@/lib/features-context';
import { isMarketplacePlatform } from '@/lib/marketplace-platforms';
import { Link as LinkIcon, Loader2, Lock, MessageCircle, Pencil, Plus, ShoppingBag, SlidersHorizontal, Star, Tag, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';

// Lazy chunk — โค้ดแท็บ marketplace โหลดเฉพาะตอนผู้ใช้กดแท็บจริง
// (data ก็ fetch ตอน mount อยู่แล้ว — แบบนี้ทั้ง JS และ data เป็น lazy คู่กัน)
const MarketplaceConnections = dynamic(() => import('./MarketplaceConnections'), {
  ssr: false,
  loading: () => <LoadingCard />,
});

interface SalesChannel {
  id: string;
  code: string;
  name: string;
  channel_type: 'manual' | 'chat';
  platform: string | null;
  picture_url?: string | null;
  ig_picture_url?: string | null;
  username?: string | null;
  ig_username?: string | null;
  chat_account_id: string | null;
  /** คลังที่ช่องทางนี้ตัดสต็อก — null = ใช้คลังหลัก */
  warehouse_id?: string | null;
  has_ig?: boolean;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  is_system: boolean;
  is_default: boolean;
  sort_order: number;
}

type ModalMode = 'create' | 'edit' | null;

// เฉพาะแพลตฟอร์มที่ขาย manual ได้จริง — Shopee/Lazada/TikTok (marketplace) ตัดออก
// เพราะออเดอร์เข้าผ่านการเชื่อมต่อ API เท่านั้น (แท็บ "เชื่อมต่อ Marketplace")
// ขาย Live/DM แบบ manual → สร้างช่องทางชื่อเองแบบไม่ระบุแพลตฟอร์มได้
const PLATFORM_OPTIONS = [
  { id: '', label: '— ไม่ระบุ —' },
  { id: 'line', label: 'LINE', icon: <PlatformIcon id="line" size={16} /> },
  { id: 'facebook', label: 'Facebook', icon: <PlatformIcon id="facebook" size={16} /> },
  { id: 'instagram', label: 'Instagram', icon: <PlatformIcon id="instagram" size={16} /> },
];

export default function SalesChannelsPage() {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { userProfile, loading: authLoading } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();

  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // pill quick filter ตามแพลตฟอร์ม — สไตล์เดียวกับแท็บ Marketplace
  // ไม่มีชิป "ทั้งหมด" แล้ว (ให้เข้าชุดกับแท็บ Marketplace ที่ดูทีละแพลตฟอร์ม)
  // จึงต้องเริ่มที่แพลตฟอร์มใดแพลตฟอร์มหนึ่งเสมอ ไม่งั้นจะได้หน้าที่ไม่มีชิปไหนถูกเลือก
  // แล้วกดกลับมาสถานะนั้นไม่ได้อีกเลย
  type ChannelPlatformFilter = 'line' | 'facebook' | 'instagram' | 'none';
  const [platformFilter, setPlatformFilter] = useState<ChannelPlatformFilter>('none');
  // Main tabs: ช่องทางของฉัน (manual + mirror list) / เชื่อมต่อ Marketplace (ย้ายมาจาก /settings/integrations)
  const [mainTab, setMainTab] = useState<'channels' | 'marketplace'>('channels');
  // แท็บ Marketplace: ปุ่ม "เชื่อมต่อร้าน X" อยู่บน PageHeader (ตำแหน่งเดียวกับ
  // ปุ่ม "+ เพิ่ม" ของแท็บช่องทางของฉัน) — platform ที่เลือกจึงต้องเป็น state ของหน้านี้
  const [mpPlatform, setMpPlatform] = useState<'shopee' | 'tiktok' | 'lazada'>('shopee');
  const [mpConnecting, setMpConnecting] = useState(false);
  // กด back จากหน้า OAuth → หน้าถูก restore จาก bfcache พร้อม connecting=true ค้าง
  useBfcacheReset(() => setMpConnecting(false));
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<SalesChannel | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SalesChannel | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state (code is auto-generated from name on create — not user-visible)
  const [formName, setFormName] = useState('');
  const [formPlatform, setFormPlatform] = useState('');
  const [formActive, setFormActive] = useState(true);
  // คลังที่ช่องทางนี้ตัดสต็อก — '' = ใช้คลังหลักของบริษัท (เหมือน marketplace)
  const [formWarehouse, setFormWarehouse] = useState('');
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; is_default: boolean; is_active?: boolean }[]>([]);

  const isAdmin = can(userProfile?.roles, 'masterdata.sales_channels');
  // แท็บเชื่อมต่อ marketplace โชว์เฉพาะตอนเปิด feature marketplace_sync เท่านั้น
  // (พฤติกรรมเดียวกับที่เมนู Marketplace เดิมถูกซ่อนจาก Sidebar ตอนปิด feature)
  const marketplaceTabVisible = features.marketplace_sync && can(userProfile?.roles, 'settings.access');
  const showMarketplace = mainTab === 'marketplace' && marketplaceTabVisible;

  // เริ่ม OAuth เชื่อมร้าน marketplace — สำเร็จแล้ว browser จะ redirect ออกไปเลย
  // จึงไม่ reset connecting ในเส้นทางสำเร็จ (bfcache reset ด้านบนจัดการตอนกด back)
  const handleMarketplaceConnect = async (platform: 'shopee' | 'tiktok' | 'lazada') => {
    setMpConnecting(true);
    const apiUrl = platform === 'tiktok' ? '/api/tiktok/oauth/auth-url'
      : platform === 'lazada' ? '/api/lazada/oauth/auth-url'
      : '/api/shopee/oauth/auth-url';
    try {
      const res = await apiFetch(apiUrl);
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        showToast('ไม่สามารถสร้างลิงก์เชื่อมต่อได้', 'error');
        setMpConnecting(false);
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
      setMpConnecting(false);
    }
  };

  const loadChannels = async () => {
    try {
      const res = await apiFetch('/api/sales-channels');
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      const json = await res.json();
      setChannels(json.channels || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      loadChannels();
      apiFetch('/api/warehouses')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          const list = Array.isArray(d) ? d : (d?.warehouses || []);
          setWarehouses(list.filter((w: { is_active?: boolean }) => w.is_active !== false));
        })
        .catch(() => { /* ไม่มีคลัง = ไม่ต้องโชว์ตัวเลือก */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // Deep link เข้าแท็บ marketplace — จาก OAuth callback (?shopee=connected ฯลฯ),
  // ลิงก์ ?tab=marketplace หรือ redirect จาก /settings/integrations เดิม
  // hash (#shopee/#lazada/#line ฯลฯ) = sub-tab ของแท็บนั้น — refresh แล้วเปิดที่เดิม
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const marketplace =
      params.get('tab') === 'marketplace' ||
      params.get('shopee') === 'connected' ||
      params.get('tiktok') === 'connected' ||
      params.get('success') === 'lazada_connected' ||
      !!params.get('error');
    if (marketplace) setMainTab('marketplace');
    const hash = window.location.hash.replace('#', '');
    if (marketplace && (hash === 'shopee' || hash === 'tiktok' || hash === 'lazada')) {
      setMpPlatform(hash);
    } else if (!marketplace && (hash === 'line' || hash === 'facebook' || hash === 'instagram' || hash === 'none')) {
      setPlatformFilter(hash);
    }
  }, []);

  // เขียนแท็บ + sub-tab กลับลง URL (?tab= + #anchor) ทุกครั้งที่เปลี่ยน —
  // ใช้ replaceState ไม่ให้ history รกและหน้าไม่ reload
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // ระหว่างยังมี query จาก OAuth callback ห้ามเขียนทับ — แท็บ marketplace ต้องอ่านก่อน
    if (params.get('shopee') || params.get('tiktok') || params.get('success') || params.get('error')
      || params.get('chat') || params.get('tiktok_profile')) return;
    const url = mainTab === 'marketplace'
      ? `/settings/sales-channels?tab=marketplace#${mpPlatform}`
      : `/settings/sales-channels#${platformFilter}`;
    window.history.replaceState({}, '', url);
  }, [mainTab, mpPlatform, platformFilter]);

  // แท็บ "ช่องทางของฉัน" ไม่แสดงช่องทาง marketplace เลย (กันสับสน) —
  // ร้าน Shopee/Lazada/TikTok จัดการที่แท็บ "เชื่อมต่อ Marketplace" ที่เดียว
  const nonMarketplace = useMemo(
    () => channels.filter(c => !isMarketplacePlatform(c.platform)),
    [channels]
  );

  // count ต่อ pill — นับจากลิสต์เต็ม (ไม่โดน search กรอง) ให้เลขนิ่ง
  const platformCounts = useMemo(() => {
    const counts = { line: 0, facebook: 0, instagram: 0, none: 0 };
    for (const c of nonMarketplace) {
      const ids = c.platform ? [c.platform, ...(c.channel_type === 'chat' && c.platform === 'facebook' && c.has_ig ? ['instagram'] : [])] : [];
      if (ids.length === 0) counts.none++;
      if (ids.includes('line')) counts.line++;
      if (ids.includes('facebook')) counts.facebook++;
      if (ids.includes('instagram')) counts.instagram++;
    }
    return counts;
  }, [nonMarketplace]);

  const filtered = useMemo(() => {
    const source0 = nonMarketplace.filter(c => {
      const ids = c.platform ? [c.platform, ...(c.channel_type === 'chat' && c.platform === 'facebook' && c.has_ig ? ['instagram'] : [])] : [];
      return platformFilter === 'none' ? ids.length === 0 : ids.includes(platformFilter);
    });
    const source = source0;
    const q = searchTerm.trim().toLowerCase();
    if (!q) return source;
    return source.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.platform || '').toLowerCase().includes(q)
    );
  }, [nonMarketplace, platformFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginated = filtered.slice(startIndex, startIndex + rowsPerPage);

  // เชื่อมเพจ/OA ทำที่หน้าช่องทาง Chat — ถามให้ชัดก่อนพาไป แล้วเปิด flow เพิ่ม
  // ของ platform นั้นเลย (?connect=) ไม่ปล่อยให้ไปหาปุ่มเองกลางหน้า
  const confirmConnectChat = async (platform: 'facebook' | 'line') => {
    const ok = await confirm({
      title: platform === 'line' ? 'เชื่อม LINE OA?' : 'เชื่อมเพจ Facebook / IG?',
      description: 'การเชื่อมเพจ/OA ทำที่หน้า "ช่องทาง Chat" — เชื่อมเสร็จระบบจะสร้างช่องทางการขายให้อัตโนมัติ ไปต่อเลยไหม?',
      confirmLabel: 'ไปเชื่อมเลย',
    });
    if (ok) router.push(`/settings/chat-channels?connect=${platform}${platform === 'line' ? '#line' : ''}`);
  };

  const openCreate = (platform = '') => {
    setEditing(null);
    setFormName('');
    setFormPlatform(platform);
    setFormActive(true);
    setFormWarehouse('');
    setModalMode('create');
  };

  const openEdit = (c: SalesChannel) => {
    // Chat-linked rows can only toggle is_active — open a minimal editor
    setEditing(c);
    setFormName(c.name);
    setFormPlatform(c.platform || '');
    setFormActive(c.is_active);
    setFormWarehouse(c.warehouse_id || '');
    setModalMode('edit');
  };

  // Generate a stable URL-safe code from the channel name. Falls back to a timestamp
  // suffix on collision (very unlikely in practice — names like "TikTok Live" → "tiktok_live").
  const generateCodeFromName = (name: string): string => {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9฀-๿]+/g, '_')  // keep latin + Thai range; collapse other to _
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    // If slug is empty (e.g. pure punctuation name) or starts non-ascii, prepend 'ch_'
    const base = /^[a-z0-9]/.test(slug) ? slug : `ch_${slug || Date.now().toString(36)}`;
    // Ensure within 2-32 chars (API regex constraint)
    return base.slice(0, 32).padEnd(2, '0');
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const isCreate = modalMode === 'create';
      const isChat = editing?.channel_type === 'chat';
      // Auto-generate code on create — user no longer enters it. If a collision happens
      // the API returns 409 and we retry with a short suffix.
      let payload: Record<string, unknown>;
      if (isCreate) {
        let code = generateCodeFromName(formName);
        // If the generated code collides with an existing one in state, append a suffix.
        if (channels.some(c => c.code === code)) {
          code = `${code.slice(0, 26)}_${Date.now().toString(36).slice(-4)}`;
        }
        payload = {
          code,
          name: formName.trim(),
          platform: formPlatform || null,
          is_active: formActive,
          warehouse_id: formWarehouse || null,
        };
      } else if (isChat) {
        // ช่องทางที่ mirror มาจากแชท แก้ชื่อไม่ได้ แต่เลือกคลังได้ (ออเดอร์ก็ตัดสต็อกเหมือนกัน)
        payload = { id: editing!.id, is_active: formActive, warehouse_id: formWarehouse || null };
      } else {
        payload = {
          id: editing!.id,
          name: formName.trim(),
          platform: formPlatform || null,
          is_active: formActive,
          warehouse_id: formWarehouse || null,
        };
      }
      const res = await apiFetch('/api/sales-channels', {
        method: isCreate ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'บันทึกไม่สำเร็จ');
      showToast(isCreate ? 'เพิ่มช่องทางสำเร็จ' : 'บันทึกการแก้ไขแล้ว');
      setModalMode(null);
      await loadChannels();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (c: SalesChannel) => {
    const next = !c.is_active;
    try {
      const res = await apiFetch('/api/sales-channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, is_active: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'บันทึกไม่สำเร็จ');
      setChannels(prev => prev.map(x => x.id === c.id ? { ...x, is_active: next } : x));
      showToast(next ? `เปิดใช้งาน "${c.name}" แล้ว` : `ปิดใช้งาน "${c.name}" แล้ว`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    }
  };

  const handleSetDefault = async (c: SalesChannel) => {
    if (c.is_default) return;
    if (!c.is_active) {
      showToast('ต้องเปิดใช้งานก่อนถึงจะตั้งเป็นค่าเริ่มต้นได้', 'error');
      return;
    }
    try {
      const res = await apiFetch('/api/sales-channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, is_default: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'บันทึกไม่สำเร็จ');
      // Local mirror of the constraint: exactly-one default.
      setChannels(prev => prev.map(x => ({ ...x, is_default: x.id === c.id })));
      showToast(`ตั้ง "${c.name}" เป็นค่าเริ่มต้นแล้ว`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/sales-channels?id=${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'ลบไม่สำเร็จ');
      if (json.soft_deleted) {
        showToast(json.message || 'ปิดใช้งานแทนการลบ');
      } else {
        showToast('ลบช่องทางแล้ว');
      }
      setDeleteTarget(null);
      await loadChannels();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ลบไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <Container size="full">
          <PageSkeleton variant="list" />
        </Container>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <NoPermissionCard />
      </Layout>
    );
  }

  // platform ids ของ channel — ใช้ทั้งวาดไอคอนและ pill filter (FB ที่ลิงก์ IG นับเป็นทั้งคู่)
  function channelPlatformIds(c: SalesChannel): string[] {
    const ids: string[] = [];
    if (c.platform) ids.push(c.platform);
    if (c.channel_type === 'chat' && c.platform === 'facebook' && c.has_ig) ids.push('instagram');
    return ids;
  }

  // Show platform as icon(s). Chat channels with IG linked show both FB + IG icons stacked.
  function renderPlatformIcons(c: SalesChannel) {
    const ids = channelPlatformIds(c);
    if (ids.length === 0) return <span className="data-muted text-gray-400 dark:text-slate-500">-</span>;
    return (
      <div className="flex items-center gap-1.5">
        {ids.map(id => <PlatformIcon key={id} id={id} />)}
      </div>
    );
  }

  const columns: DataTableColumn<SalesChannel>[] = [
    {
      key: 'name',
      label: 'ช่องทาง',
      alwaysVisible: true,
      headerClassName: 'min-w-[240px]',
      render: (c) => (
        <div className="flex items-center gap-3">
          {/* avatar เพจ/OA — สไตล์เดียวกับหน้าช่องทาง Chat (IG ซ้อนมุมขวาล่าง) */}
          {c.channel_type === 'chat' && (
            <div className="relative flex-shrink-0">
              {/* ไอคอน platform รองพื้นเสมอ — รูปโหลดพัง (เช่นลิงก์ fbcdn เก่าหมดอายุ)
                  ก็ซ่อนตัวเองแล้วเผยไอคอนแทน ไม่มีวงกลมว่างโล่ง */}
              <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                {c.platform ? <PlatformIcon id={c.platform} size={18} /> : null}
              </div>
              {c.picture_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.picture_url}
                  alt={c.name}
                  className="absolute inset-0 w-9 h-9 rounded-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              {c.has_ig && c.ig_picture_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.ig_picture_url}
                  alt="Instagram"
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white dark:border-slate-800 object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[16px] text-gray-900 dark:text-white">{c.name}</span>
              {c.is_default && (
                <Badge tone="amber" size="sm" title="ค่าเริ่มต้น" icon={<Star className="w-3 h-3 fill-current" />}>ค่าเริ่มต้น</Badge>
              )}
              {c.is_system && (
                <span title="ช่องทางของระบบ" className="inline-flex items-center text-gray-400">
                  <Lock className="w-3.5 h-3.5" />
                </span>
              )}
              {c.channel_type === 'chat' && (
                <span title="เชื่อมกับ chat account" className="inline-flex items-center text-emerald-500">
                  <LinkIcon className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
            {(c.username || c.ig_username) && (
              <div className="text-sm text-gray-400 dark:text-slate-500">
                {[c.username, c.ig_username && `IG: ${c.ig_username}`].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'ประเภท',
      headerClassName: 'w-[150px]',
      // ยุบคอลัมน์ "ประเภท" กับ "แพลตฟอร์ม" เข้าด้วยกัน — แถวแชทเดิมขึ้นป้าย Chat
      // แล้วมีไอคอน fb/ig ซ้ำความหมายกันอยู่คนละช่อง · ช่องทางแชทคือแพลตฟอร์มของมันเอง
      render: (c) =>
        c.channel_type === 'chat' ? (
          <Badge tone="emerald" size="sm">
            <MessageCircle className="w-3 h-3 mr-1" />
            <span className="mr-1">Chat</span>
            {renderPlatformIcons(c)}
          </Badge>
        ) : (
          <Badge tone="gray" size="sm">Manual</Badge>
        ),
    },
    {
      key: 'status',
      label: 'สถานะ',
      headerClassName: 'w-[90px]',
      stopPropagation: true,
      render: (c) => (
        <Toggle checked={c.is_active} onChange={() => handleToggleActive(c)} />
      ),
    },
    {
      key: 'actions',
      label: '',
      headerClassName: 'w-[44px]',
      stopPropagation: true,
      hideMobile: true,
      render: (c) => {
        const items: ActionItem[] = [];
        if (!c.is_default && c.is_active) {
          items.push({
            key: 'default',
            label: 'ตั้งเป็นค่าเริ่มต้น',
            icon: <Star className="w-4 h-4" />,
            onClick: () => handleSetDefault(c),
          });
        }
        if (c.channel_type === 'manual' && !c.is_system) {
          items.push({ key: 'edit', label: 'แก้ไข', icon: <Pencil className="w-4 h-4" />, onClick: () => openEdit(c), dividerBefore: items.length > 0 });
          items.push({
            key: 'delete',
            label: 'ลบ',
            icon: <Trash2 className="w-4 h-4" />,
            onClick: () => setDeleteTarget(c),
            danger: true,
            dividerBefore: true,
          });
        }
        if (items.length === 0) return null;
        return <ActionMenu items={items} />;
      },
    },
  ];

  const isEditingChat = editing?.channel_type === 'chat';

  return (
    <Layout>
      <Container size="full">
        <PageHeader
          icon={<Tag />}
          title="ช่องทางการขาย"
          subtitle="จัดการช่องทางที่ออเดอร์เข้ามา — ช่องทาง manual, เพจ LINE/FB และร้าน marketplace ที่เชื่อมต่อ"
          actions={
            showMarketplace ? (
              /* Dropdown เลือกแพลตฟอร์มที่จะเชื่อม — ตำแหน่ง + รูปแบบเดียวกับ
                 ปุ่ม "+ เพิ่ม" ของแท็บช่องทางของฉัน (ไม่ผูกกับ pill ที่เปิดอยู่
                 จะได้ไม่กดเชื่อมผิดแพลตฟอร์ม) */
              <ActionMenu
                placement="bottom"
                trigger={mpConnecting
                  ? <><Loader2 className="w-5 h-5 animate-spin" />กำลังเชื่อมต่อ...</>
                  : <><Plus className="w-5 h-5" />เชื่อมต่อร้านค้า</>}
                triggerClassName="btn btn-md btn-primary"
                items={(['shopee', 'tiktok', 'lazada'] as const).map(platform => ({
                  key: platform,
                  label: platform === 'shopee' ? 'เชื่อมต่อร้าน Shopee'
                    : platform === 'tiktok' ? 'เชื่อมต่อ TikTok Shop'
                    : 'เชื่อมต่อร้าน Lazada',
                  icon: <PlatformIcon id={platform} size={16} />,
                  disabled: mpConnecting,
                  onClick: () => { setMpPlatform(platform); handleMarketplaceConnect(platform); },
                }))}
              />
            ) : (
              /* ปุ่มเพิ่มเป็น dropdown — เลือกแพลตฟอร์มได้เลย แล้วเปิด modal พร้อมค่า preselect */
              /* ทางแยก 2 ทางตั้งแต่กดปุ่ม — เดิมมีรายการ LINE/FB/IG ที่แค่ preselect
                 ป้ายในฟอร์ม คนเข้าใจว่าคือการเชื่อมเพจแล้วสร้างป้ายซ้ำกับ mirror */
              <ActionMenu
                placement="bottom"
                trigger={<><Plus className="w-5 h-5" />เพิ่ม</>}
                triggerClassName="btn btn-md btn-primary"
                items={[
                  {
                    key: 'connect-fb',
                    label: 'เชื่อมเพจ Facebook / IG',
                    icon: <PlatformIcon id="facebook" size={16} />,
                    onClick: () => confirmConnectChat('facebook'),
                  },
                  {
                    key: 'connect-line',
                    label: 'เชื่อม LINE OA',
                    icon: <PlatformIcon id="line" size={16} />,
                    onClick: () => confirmConnectChat('line'),
                  },
                  {
                    key: 'manual',
                    label: 'สร้างป้ายช่องทางเอง (ไม่เชื่อมระบบ)',
                    icon: <Tag className="w-4 h-4 text-gray-400" />,
                    onClick: () => openCreate(''),
                    dividerBefore: true,
                  },
                ]}
              />
            )
          }
        />

        {/* Main tabs: ช่องทางของฉัน / เชื่อมต่อ Marketplace (convention เดียวกับ carriers, payment-channels) */}
        {marketplaceTabVisible && (
          <Tabs
            activeKey={mainTab}
            onSelect={(key) => setMainTab(key as 'channels' | 'marketplace')}
            tabs={[
              { key: 'channels', label: 'ช่องทางของฉัน', icon: <Tag className="w-4 h-4" /> },
              { key: 'marketplace', label: 'เชื่อมต่อ Marketplace', icon: <ShoppingBag className="w-4 h-4" /> },
            ]}
          />
        )}

        {showMarketplace ? (
          <MarketplaceConnections
            activePlatform={mpPlatform}
            onPlatformChange={setMpPlatform}
            setConnecting={setMpConnecting}
          />
        ) : (
          <>
        <FilterChips
          className="mb-4"
          value={platformFilter}
          onChange={id => { setPlatformFilter(id); setCurrentPage(1); }}
          chips={[
            // ตั้งค่าเอง = ช่องทาง manual ที่ผู้ใช้สร้างเอง — เป็นค่าเริ่มต้นจึงอยู่ซ้ายสุด
            { id: 'none' as const, label: 'ตั้งค่าเอง', count: platformCounts.none, icon: <SlidersHorizontal className="w-4 h-4" />, activeClass: 'border-primary text-primary bg-primary/10' },
            { id: 'line' as const, label: 'LINE', count: platformCounts.line, icon: <PlatformIcon id="line" size={16} />, activeClass: 'border-[#06C755] text-[#06C755] bg-[#06C755]/10' },
            { id: 'facebook' as const, label: 'Facebook', count: platformCounts.facebook, icon: <PlatformIcon id="facebook" size={16} />, activeClass: 'border-[#1877F2] text-[#1877F2] bg-[#1877F2]/10' },
            { id: 'instagram' as const, label: 'Instagram', count: platformCounts.instagram, icon: <PlatformIcon id="instagram" size={16} />, activeClass: 'border-[#E1306C] text-[#E1306C] bg-[#E1306C]/10' },
          ]}
        />

        {/* Search */}
        <div className="data-filter-card">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="ค้นหาชื่อ / รหัส / แพลตฟอร์ม"
            className="py-2"
          />
        </div>

        {/* Table */}
        <DataTable<SalesChannel>
          storageKey="sales-channels-list"
          columns={columns}
          data={paginated}
          loading={false}
          getRowId={(c) => c.id}
          onRowClick={(c) => {
            if (c.channel_type === 'manual' && !c.is_system) openEdit(c);
          }}
          emptyMessage="ยังไม่มีช่องทางการขาย"
          emptyIcon={<Tag className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={filtered.length}
          recordsPerPage={rowsPerPage}
          onPageChange={setCurrentPage}
          onRecordsPerPageChange={setRowsPerPage}
          mobileCardRender={(c) => (
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 dark:text-white text-[15px] truncate">{c.name}</p>
                  {c.is_system && <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                  {c.channel_type === 'chat' && <LinkIcon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
                </div>
                <p className="text-sm text-gray-400 dark:text-slate-500 truncate">{c.code}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {renderPlatformIcons(c)}
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <Toggle checked={c.is_active} onChange={() => handleToggleActive(c)} />
              </div>
            </div>
          )}
        />
          </>
        )}

        {/* Modal */}
        <Modal
          open={modalMode !== null}
          onClose={() => !submitting && setModalMode(null)}
          title={modalMode === 'edit' ? (isEditingChat ? 'แก้ไขสถานะ' : 'แก้ไขช่องทาง') : 'เพิ่มช่องทางการขาย'}
          icon={<Tag className="w-5 h-5 text-primary" />}
          size="md"
          disableBackdropClose={submitting}
          footer={
            <div className="flex gap-3 p-5">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setModalMode(null)}
                disabled={submitting}
              >
                ยกเลิก
              </Button>
              <SaveButton
                fullWidth
                onClick={handleSubmit}
                loading={submitting}
                disabled={
                  submitting ||
                  (modalMode === 'create' && !formName.trim())
                }
              />
            </div>
          }
        >
          <div className="p-5 space-y-4">
            {isEditingChat && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300 rounded-lg p-3">
                ช่องทางนี้เชื่อมกับ chat account — แก้ชื่อ/credentials ได้ที่{' '}
                <a href="/settings/chat-channels" className="underline font-medium">/settings/chat-channels</a>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                ชื่อช่องทาง <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                disabled={isEditingChat}
                placeholder="เช่น TikTok Live, ตลาดนัด JJ"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                แพลตฟอร์ม (ใช้แสดงสี/ไอคอน)
              </label>
              <FormSelect
                value={formPlatform}
                onChange={(v) => setFormPlatform(v)}
                options={PLATFORM_OPTIONS}
                disabled={isEditingChat}
                portal
              />
              {/* เลือก platform ตรงนี้ = ได้แค่ป้าย/ไอคอนติดบิล ไม่ได้เชื่อมแชท —
                  คนมักเข้าใจผิดแล้วสร้างซ้ำกับช่องทางที่ระบบ mirror จากแชทให้ */}
              {!isEditingChat && ['line', 'facebook', 'instagram'].includes(formPlatform) && (
                <p className="mt-1.5 text-sm text-amber-600 dark:text-amber-400">
                  ช่องทางนี้เป็นแค่ป้ายติดบิล ไม่ได้เชื่อมรับแชท — ถ้าต้องการให้แชทจากเพจ/OA
                  เข้าระบบด้วย ให้ไปเชื่อมที่{' '}
                  <a href="/settings/chat-channels" className="underline font-medium">ช่องทาง Chat</a>{' '}
                  แล้วช่องทางการขายจะถูกสร้างให้อัตโนมัติ (ไม่ต้องสร้างเองซ้ำ)
                </p>
              )}
            </div>

            {warehouses.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  คลังที่ตัดสต็อก
                </label>
                <FormSelect
                  value={formWarehouse}
                  onChange={v => setFormWarehouse(v)}
                  options={[
                    { id: '', label: `ใช้คลังหลัก${warehouses.find(w => w.is_default) ? ` (${warehouses.find(w => w.is_default)!.name})` : ''}` },
                    ...warehouses.map(w => ({ id: w.id, label: w.name })),
                  ]}
                  portal
                />
                <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400">
                  ออเดอร์ที่เปิดผ่านช่องทางนี้จะตัดสต็อกจากคลังที่เลือก — ออเดอร์เดิมไม่กระทบ
                </p>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formActive}
                onChange={e => setFormActive(e.target.checked)}
                className="w-4 h-4 accent-[#F4511E]"
              />
              <span className="text-sm text-gray-700 dark:text-slate-300">เปิดใช้งาน</span>
            </label>
          </div>
        </Modal>

        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => !deleting && setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="ลบช่องทางการขาย"
          description={`ยืนยันการลบ "${deleteTarget?.name || ''}" — ถ้ามีออเดอร์เคยใช้ ระบบจะปิดใช้งานแทน`}
          confirmLabel="ลบ"
          variant="danger"
          loading={deleting}
          icon={<Trash2 className="w-6 h-6 text-red-600" />}
        />
      </Container>
      {confirmDialog}
    </Layout>
  );
}
