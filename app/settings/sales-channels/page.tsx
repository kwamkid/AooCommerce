// Path: app/settings/sales-channels/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import Tabs from '@/components/ui/Tabs';
import { useFeatures } from '@/lib/features-context';
import { isMarketplacePlatform } from '@/lib/marketplace-platforms';
import {
  Tag, Plus, Pencil, Trash2, Lock, MessageCircle, Link as LinkIcon, Star, ShoppingBag,
} from 'lucide-react';
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
  chat_account_id: string | null;
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
  const { userProfile, loading: authLoading } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();

  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // pill quick filter ตามแพลตฟอร์ม — สไตล์เดียวกับแท็บ Marketplace
  const [platformFilter, setPlatformFilter] = useState<'all' | 'line' | 'facebook' | 'instagram' | 'none'>('all');
  // Main tabs: ช่องทางของฉัน (manual + mirror list) / เชื่อมต่อ Marketplace (ย้ายมาจาก /settings/integrations)
  const [mainTab, setMainTab] = useState<'channels' | 'marketplace'>('channels');
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

  const isAdmin = can(userProfile?.roles, 'masterdata.sales_channels');
  // แท็บเชื่อมต่อ marketplace โชว์เฉพาะตอนเปิด feature marketplace_sync เท่านั้น
  // (พฤติกรรมเดียวกับที่เมนู Marketplace เดิมถูกซ่อนจาก Sidebar ตอนปิด feature)
  const marketplaceTabVisible = features.marketplace_sync && can(userProfile?.roles, 'settings.access');
  const showMarketplace = mainTab === 'marketplace' && marketplaceTabVisible;

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
    if (!authLoading) loadChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // Deep link เข้าแท็บ marketplace — จาก OAuth callback (?shopee=connected ฯลฯ),
  // ลิงก์ ?tab=marketplace หรือ redirect จาก /settings/integrations เดิม
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('tab') === 'marketplace' ||
      params.get('shopee') === 'connected' ||
      params.get('tiktok') === 'connected' ||
      params.get('success') === 'lazada_connected' ||
      params.get('error')
    ) {
      setMainTab('marketplace');
    }
  }, []);

  // แท็บ "ช่องทางของฉัน" ไม่แสดงช่องทาง marketplace เลย (กันสับสน) —
  // ร้าน Shopee/Lazada/TikTok จัดการที่แท็บ "เชื่อมต่อ Marketplace" ที่เดียว
  const nonMarketplace = useMemo(
    () => channels.filter(c => !isMarketplacePlatform(c.platform)),
    [channels]
  );

  // count ต่อ pill — นับจากลิสต์เต็ม (ไม่โดน search กรอง) ให้เลขนิ่ง
  const platformCounts = useMemo(() => {
    const counts = { all: nonMarketplace.length, line: 0, facebook: 0, instagram: 0, none: 0 };
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
    let source = nonMarketplace;
    if (platformFilter !== 'all') {
      source = source.filter(c => {
        const ids = c.platform ? [c.platform, ...(c.channel_type === 'chat' && c.platform === 'facebook' && c.has_ig ? ['instagram'] : [])] : [];
        return platformFilter === 'none' ? ids.length === 0 : ids.includes(platformFilter);
      });
    }
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

  const openCreate = (platform = '') => {
    setEditing(null);
    setFormName('');
    setFormPlatform(platform);
    setFormActive(true);
    setModalMode('create');
  };

  const openEdit = (c: SalesChannel) => {
    // Chat-linked rows can only toggle is_active — open a minimal editor
    setEditing(c);
    setFormName(c.name);
    setFormPlatform(c.platform || '');
    setFormActive(c.is_active);
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
        };
      } else if (isChat) {
        payload = { id: editing!.id, is_active: formActive };
      } else {
        payload = {
          id: editing!.id,
          name: formName.trim(),
          platform: formPlatform || null,
          is_active: formActive,
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
        <div className="flex items-center gap-2">
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
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'ประเภท',
      headerClassName: 'w-[110px]',
      render: (c) =>
        c.channel_type === 'chat' ? (
          <Badge tone="emerald" size="sm">
            <MessageCircle className="w-3 h-3 mr-1" />Chat
          </Badge>
        ) : (
          <Badge tone="gray" size="sm">Manual</Badge>
        ),
    },
    {
      key: 'platform',
      label: 'แพลตฟอร์ม',
      headerClassName: 'w-[110px]',
      render: (c) => renderPlatformIcons(c),
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
            showMarketplace ? undefined : (
              /* ปุ่มเพิ่มเป็น dropdown — เลือกแพลตฟอร์มได้เลย แล้วเปิด modal พร้อมค่า preselect */
              <ActionMenu
                placement="bottom"
                trigger={<><Plus className="w-5 h-5" />เพิ่ม</>}
                triggerClassName="btn btn-md btn-primary"
                items={[
                  { key: 'manual', label: 'ช่องทางทั่วไป (Manual)', icon: <Tag className="w-4 h-4 text-gray-400" />, onClick: () => openCreate('') },
                  ...PLATFORM_OPTIONS.filter(p => p.id).map(p => ({
                    key: p.id,
                    label: p.label,
                    icon: <PlatformIcon id={p.id} size={16} />,
                    onClick: () => openCreate(p.id),
                    dividerBefore: p.id === 'line',
                  })),
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
          <MarketplaceConnections />
        ) : (
          <>
        {/* Platform pill filter — สไตล์เดียวกับแท็บเชื่อมต่อ Marketplace */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {([
            { id: 'all', label: 'ทั้งหมด', icon: null, active: 'border-primary text-primary bg-primary/10' },
            { id: 'line', label: 'LINE', icon: <PlatformIcon id="line" size={16} />, active: 'border-[#06C755] text-[#06C755] bg-[#06C755]/10' },
            { id: 'facebook', label: 'Facebook', icon: <PlatformIcon id="facebook" size={16} />, active: 'border-[#1877F2] text-[#1877F2] bg-[#1877F2]/10' },
            { id: 'instagram', label: 'Instagram', icon: <PlatformIcon id="instagram" size={16} />, active: 'border-[#E1306C] text-[#E1306C] bg-[#E1306C]/10' },
            { id: 'none', label: 'อื่นๆ', icon: null, active: 'border-gray-500 text-gray-700 bg-gray-500/10 dark:text-slate-200' },
          ] as const).map(pill => (
            <button
              key={pill.id}
              type="button"
              onClick={() => { setPlatformFilter(pill.id); setCurrentPage(1); }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                platformFilter === pill.id
                  ? pill.active
                  : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              {pill.icon}
              {pill.label}
              {platformCounts[pill.id] > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{platformCounts[pill.id]}</span>
              )}
            </button>
          ))}
        </div>

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
            </div>

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
    </Layout>
  );
}
