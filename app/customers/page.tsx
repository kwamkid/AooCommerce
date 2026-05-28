// Path: app/customers/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { LoadingCard } from '@/components/ui/StateCard';
import Alert from '@/components/ui/Alert';
import FormInput from '@/components/ui/FormInput';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import SearchInput from '@/components/ui/SearchInput';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import { useFeatures } from '@/lib/features-context';
import {
  UserCircle,
  Plus,
  X,
  Loader2,
  Phone,
  Mail,
  Trash2,
  Tags,
  Link2,
  ExternalLink,
  Copy,
  RefreshCw,
  KeyRound,
} from 'lucide-react';
import TagBadge, { Tag, TAG_COLORS } from '@/components/ui/TagBadge';
import PlatformChipFilter from '@/app/components/PlatformChipFilter';
import FormSelect from '@/components/ui/FormSelect';
import ActionMenu, { ActionItem } from '@/components/ui/ActionMenu';

// Channel icon and label config
const CHANNEL_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  shopee: { label: 'Shopee', icon: '/marketplace/shopee.svg', color: 'bg-orange-50 text-orange-700' },
  tiktok: { label: 'TikTok', icon: '/marketplace/tiktok_shop.svg', color: 'bg-gray-50 text-gray-700' },
  lazada: { label: 'Lazada', icon: '/marketplace/lazada.svg', color: 'bg-blue-50 text-blue-700' },
  line: { label: 'LINE', icon: '/social/line_oa.svg', color: 'bg-green-50 text-green-700' },
  facebook: { label: 'Facebook', icon: '/social/facebook.svg', color: 'bg-blue-50 text-blue-700' },
  instagram: { label: 'Instagram', icon: '/social/instagram.svg', color: 'bg-pink-50 text-pink-700' },
  manual: { label: 'เปิดบิลตรง', icon: '', color: 'bg-gray-50 text-gray-600' },
};

// Customer interface
interface Customer {
  id: string;
  customer_code: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  billing_address?: string;
  billing_district?: string;
  billing_amphoe?: string;
  billing_province?: string;
  billing_postal_code?: string;
  tax_id?: string;
  customer_type: string;

  credit_limit: number;
  credit_days: number;
  assigned_salesperson?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Stats from API
  shipping_address_count?: number;
  default_address?: { address_line1: string; district: string; amphoe: string; province: string; postal_code: string } | null;
  line_display_name?: string | null;
  total_order_amount?: number;
  order_count?: number;
  tags?: Tag[];
  channels?: string[];
  portal_token?: string | null;
  portal_access_code?: string | null;
}

// Customer type config — label + Badge tone
const CUSTOMER_TYPES: Record<string, { label: string; tone: 'gray' | 'red' | 'amber' | 'emerald' | 'blue' | 'indigo' | 'purple' | 'orange' }> = {
  // ปลีก
  retail: { label: 'ลูกค้าปลีก', tone: 'blue' },
  dropship: { label: 'Dropship', tone: 'blue' },
  affiliate: { label: 'Affiliate', tone: 'purple' },
  // ตัวแทน (consignment feature)
  consignment_dealer: { label: 'ตัวแทนฝากขาย', tone: 'amber' },
  wholesale_dealer: { label: 'ตัวแทนขายขาด', tone: 'orange' },
  dealer: { label: 'ตัวแทน', tone: 'amber' },
  // ห้าง (department_store feature)
  department_store: { label: 'ห้างฝากขาย', tone: 'purple' },
  wholesale_department: { label: 'ห้างขายขาด', tone: 'red' },
  // องค์กร
  corporate: { label: 'องค์กร/B2B', tone: 'gray' },
  credit: { label: 'เครดิต (legacy)', tone: 'gray' },
};

// Filter tabs for customer list — gated by features
interface TypeTab { id: string; label: string; types: string[]; requiredFeature?: 'consignment' | 'department_store' }
const TYPE_TABS: TypeTab[] = [
  { id: 'all', label: 'ทั้งหมด', types: [] },
  { id: 'retail', label: 'ลูกค้าปลีก', types: ['retail', 'dropship', 'affiliate'] },
  { id: 'dealer', label: 'ตัวแทน', types: ['consignment_dealer', 'wholesale_dealer', 'dealer'], requiredFeature: 'consignment' },
  { id: 'dept', label: 'ห้าง', types: ['department_store', 'wholesale_department'], requiredFeature: 'department_store' },
  { id: 'corporate', label: 'องค์กร/B2B', types: ['corporate', 'credit'] },
];

function CustomerTypeBadge({ type }: { type: string }) {
  const config = CUSTOMER_TYPES[type] || { label: type, tone: 'gray' as const };
  return <Badge tone={config.tone} size="sm">{config.label}</Badge>;
}

function CustomersPageContent() {
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const { features } = useFeatures();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Init state from URL params
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('q') || '');
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState<string>(() => searchParams.get('type') || '');
  const [filterAmount, setFilterAmount] = useState<string>(() => searchParams.get('amount') || '');
  const [filterOrderCount, setFilterOrderCount] = useState<string>(() => searchParams.get('orders') || '');
  const [filterTag, setFilterTag] = useState<string>(() => searchParams.get('tag') || '');
  const [filterChannel, setFilterChannel] = useState<string>(() => searchParams.get('channel') || '');

  // Tag management
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(TAG_COLORS[0]);
  const [tagSaving, setTagSaving] = useState(false);

  // Selection & bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Portal code regenerate
  const [regeneratingCodeId, setRegeneratingCodeId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(() => parseInt(searchParams.get('page') || '1') || 1);
  const [rowsPerPage, setRowsPerPage] = useState(() => parseInt(searchParams.get('limit') || '20') || 20);

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({ title: `ลบลูกค้า ${selectedIds.size} รายการ ถาวร?`, description: 'ที่อยู่จัดส่ง, กิจกรรม จะถูกลบ และออเดอร์จะถูก unlink', variant: 'danger' }); if (!ok) return;

    setBulkDeleting(true);
    try {
      const ids = [...selectedIds].join(',');
      const res = await apiFetch(`/api/customers?ids=${ids}&hard=true`, { method: 'DELETE' });
      if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'ไม่สามารถลบได้'); }

      showToast(`ลบลูกค้า ${selectedIds.size} รายการสำเร็จ`);
      setCustomers(prev => prev.filter(c => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถลบได้', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  // Single delete handler
  const handleDeleteCustomer = async (customerId: string, customerName: string) => {
    const ok = await confirm({ title: `ลบลูกค้า "${customerName}" ถาวร?`, variant: 'danger' }); if (!ok) return;

    try {
      const res = await apiFetch(`/api/customers?id=${customerId}&hard=true`, { method: 'DELETE' });
      if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'ไม่สามารถลบได้'); }

      showToast('ลบลูกค้าสำเร็จ');
      setCustomers(prev => prev.filter(c => c.id !== customerId));
      setSelectedIds(prev => { const next = new Set(prev); next.delete(customerId); return next; });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถลบได้', 'error');
    }
  };

  // Regenerate portal code
  const handleRegenerateCode = async (customerId: string) => {
    setRegeneratingCodeId(customerId);
    try {
      const res = await apiFetch(`/api/customers/${customerId}/regenerate-portal-code`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'ไม่สามารถสร้างรหัสใหม่ได้');
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, portal_access_code: result.data.portal_access_code } : c));
      showToast('สร้างรหัส Portal ใหม่สำเร็จ', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setRegeneratingCodeId(null);
    }
  };

  // Sync filters → URL
  const syncUrl = useCallback((overrides: {
    q?: string; type?: string; amount?: string; orders?: string; tag?: string; channel?: string; page?: number; limit?: number;
  }) => {
    const p = new URLSearchParams();
    const q     = overrides.q       !== undefined ? overrides.q       : debouncedSearch;
    const type  = overrides.type    !== undefined ? overrides.type    : filterType;
    const amt   = overrides.amount  !== undefined ? overrides.amount  : filterAmount;
    const ord   = overrides.orders  !== undefined ? overrides.orders  : filterOrderCount;
    const tag   = overrides.tag     !== undefined ? overrides.tag     : filterTag;
    const ch    = overrides.channel !== undefined ? overrides.channel : filterChannel;
    const pg    = overrides.page    !== undefined ? overrides.page    : currentPage;
    const lmt   = overrides.limit   !== undefined ? overrides.limit   : rowsPerPage;
    if (q)    p.set('q', q);
    if (type) p.set('type', type);
    if (amt)  p.set('amount', amt);
    if (ord)  p.set('orders', ord);
    if (tag)  p.set('tag', tag);
    if (ch)   p.set('channel', ch);
    if (pg > 1)   p.set('page', String(pg));
    if (lmt !== 20) p.set('limit', String(lmt));
    const qs = p.toString();
    router.replace(qs ? `/customers?${qs}` : '/customers', { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filterType, filterAmount, filterOrderCount, filterTag, filterChannel, currentPage, rowsPerPage]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedSearch, filterType, filterAmount, filterOrderCount, filterTag, filterChannel, currentPage]);

  // Debounce search + sync URL
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
      syncUrl({ q: searchTerm, page: 1 });
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // Check auth
  useEffect(() => {
    if (authLoading) return;

    if (!userProfile) {
      router.push('/login');
      return;
    }

    // Check role permission
    if (!userProfile.roles?.some((r: string) => ['owner', 'admin', 'manager', 'sales', 'account'].includes(r))) {
      router.push('/dashboard');
    }
  }, [userProfile, authLoading, router]);

  // Fetch tags once
  useFetchOnce(async () => {
    try {
      const res = await apiFetch('/api/customers/tags');
      const result = await res.json();
      if (result.tags) setAllTags(result.tags);
    } catch { /* ignore */ }
  }, !authLoading && !!userProfile);

  // Fetch customers with server-side pagination + filters
  useEffect(() => {
    if (authLoading || !userProfile) return;

    const fetchCustomers = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          with_stats: 'true',
          page: String(currentPage),
          limit: String(rowsPerPage),
        });
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (filterType) params.set('type', filterType);
        if (filterTag) params.set('tag_id', filterTag);
        if (filterChannel) params.set('channel', filterChannel);

        const res = await apiFetch(`/api/customers?${params}`);
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to fetch customers');

        const data = result.customers || [];

        setCustomers(data as Customer[]);
        setTotalCustomers(result.total ?? data.length);
      } catch (err) {
        console.error('Error fetching customers:', err);
        setError('ไม่สามารถโหลดข้อมูลลูกค้าได้');
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, [authLoading, userProfile, currentPage, rowsPerPage, debouncedSearch, filterType, filterTag, filterChannel]);

  // Client-side filters (amount, orderCount — these work on the paginated server result)
  const filteredCustomers = customers.filter(customer => {
    const amt = customer.total_order_amount || 0;
    const matchesAmount = filterAmount === '' ||
      (filterAmount === '0' ? amt === 0 :
       filterAmount === '<10000' ? amt > 0 && amt < 10000 :
       filterAmount === '10000-50000' ? amt >= 10000 && amt <= 50000 :
       filterAmount === '50000-100000' ? amt > 50000 && amt <= 100000 :
       filterAmount === '>100000' ? amt > 100000 : true);

    const cnt = customer.order_count || 0;
    const matchesOrderCount = filterOrderCount === '' ||
      (filterOrderCount === '0' ? cnt === 0 :
       filterOrderCount === '1-5' ? cnt >= 1 && cnt <= 5 :
       filterOrderCount === '6-20' ? cnt >= 6 && cnt <= 20 :
       filterOrderCount === '>20' ? cnt > 20 : true);

    return matchesAmount && matchesOrderCount;
  });

  // Types that exist in customer data (for filter dropdown)
  const visibleTabs = useMemo(() => TYPE_TABS.filter(tab => {
    if (!tab.requiredFeature) return true;
    return features[tab.requiredFeature];
  }), [features]);

  // Pagination
  const totalPages = Math.ceil(totalCustomers / rowsPerPage);

  // Tag CRUD handlers
  const handleSaveTag = async () => {
    if (!tagName.trim() || tagSaving) return;
    setTagSaving(true);
    try {
      if (editingTag) {
        // Update
        const res = await apiFetch('/api/customers/tags', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingTag.id, name: tagName.trim(), color: tagColor }),
        });
        if (!res.ok) { const r = await res.json(); throw new Error(r.error); }
        const { tag } = await res.json();
        setAllTags(prev => prev.map(t => t.id === tag.id ? { ...tag, count: t.count } : t));
        // Update tags in customers too
        setCustomers(prev => prev.map(c => ({
          ...c,
          tags: c.tags?.map(t => t.id === tag.id ? tag : t),
        })));
        showToast('แก้ไขแท็กสำเร็จ');
      } else {
        // Create
        const res = await apiFetch('/api/customers/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: tagName.trim(), color: tagColor }),
        });
        if (!res.ok) { const r = await res.json(); throw new Error(r.error); }
        const { tag } = await res.json();
        setAllTags(prev => [...prev, tag]);
        showToast('สร้างแท็กสำเร็จ');
      }
      setEditingTag(null);
      setTagName('');
      setTagColor(TAG_COLORS[0]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถบันทึกแท็กได้', 'error');
    } finally {
      setTagSaving(false);
    }
  };

  const handleDeleteTag = async (tag: Tag) => {
    const ok = await confirm({ title: `ลบแท็ก "${tag.name}"?`, description: 'ลูกค้าทุกรายจะถูกถอดแท็กนี้ออก', variant: 'danger' });
    if (!ok) return;
    try {
      const res = await apiFetch('/api/customers/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tag.id }),
      });
      if (!res.ok) throw new Error();
      setAllTags(prev => prev.filter(t => t.id !== tag.id));
      setCustomers(prev => prev.map(c => ({
        ...c,
        tags: c.tags?.filter(t => t.id !== tag.id),
      })));
      if (filterTag === tag.id) { setFilterTag(''); syncUrl({ tag: '' }); }
      showToast('ลบแท็กสำเร็จ');
    } catch {
      showToast('ไม่สามารถลบแท็กได้', 'error');
    }
  };

  // Build action menu items (shared between desktop + mobile cards)
  const buildActionMenuItems = useCallback((customer: Customer): ActionItem[] => {
    const items: ActionItem[] = [];
    if (customer.customer_type === 'consignment_dealer' && customer.portal_token) {
      items.push({
        key: 'portal-link',
        label: 'ลิงก์ Portal',
        icon: <ExternalLink className="w-4 h-4 text-amber-500" />,
        onClick: () => window.open(`/portal/consignment/${customer.portal_token}`, '_blank'),
      });
      items.push({
        key: 'portal-copy',
        label: 'คัดลอกลิงก์',
        icon: <Copy className="w-4 h-4" />,
        onClick: () => { navigator.clipboard.writeText(`${window.location.origin}/portal/consignment/${customer.portal_token}`).then(() => showToast('คัดลอกลิงก์แล้ว', 'success')); },
      });
      items.push({
        key: 'portal-code',
        label: customer.portal_access_code ? `รหัส: ${customer.portal_access_code}` : 'รหัส Portal: ยังไม่มี',
        icon: <KeyRound className="w-4 h-4" />,
        onClick: customer.portal_access_code
          ? () => navigator.clipboard.writeText(customer.portal_access_code!).then(() => showToast('คัดลอกรหัสแล้ว', 'success'))
          : undefined,
        suffix: customer.portal_access_code ? <Copy className="w-3.5 h-3.5 text-gray-400" /> : undefined,
      });
      items.push({
        key: 'portal-regen',
        label: 'สร้างรหัสใหม่',
        icon: regeneratingCodeId === customer.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />,
        onClick: () => handleRegenerateCode(customer.id),
        disabled: regeneratingCodeId === customer.id,
      });
    }
    items.push({
      key: 'delete',
      label: 'ลบ',
      icon: <Trash2 className="w-4 h-4" />,
      danger: true,
      onClick: () => handleDeleteCustomer(customer.id, customer.name),
    });
    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regeneratingCodeId]);

  // ── DataTable column definitions ──
  const columns: DataTableColumn<Customer>[] = [
    {
      key: 'customer', label: 'ลูกค้า', alwaysVisible: true,
      defaultWidth: 240, reorderable: true, resizable: true,
      render: (c) => (
        <div>
          <div className="data-primary text-gray-900 dark:text-slate-100 text-[15px]">{c.name}</div>
          <div className="flex items-center gap-3 mt-0.5">
            {c.phone && (
              <a
                href={`tel:${c.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 data-secondary text-gray-500 dark:text-slate-400 hover:text-blue-600"
              >
                <Phone className="w-3 h-3" />
                {c.phone}
              </a>
            )}
            {c.email && (
              <span className="inline-flex items-center gap-1 data-secondary text-gray-500 dark:text-slate-400">
                <Mail className="w-3 h-3" />
                {c.email}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'type', label: 'ประเภท',
      defaultWidth: 110, reorderable: true,
      render: (c) => <CustomerTypeBadge type={c.customer_type} />,
    },
    {
      key: 'channels', label: 'ช่องทาง',
      defaultWidth: 110, reorderable: true,
      render: (c) => (
        c.channels && c.channels.length > 0 ? (
          <div className="flex items-center gap-1.5">
            {c.channels.map(ch => {
              const cfg = CHANNEL_CONFIG[ch];
              if (!cfg) return null;
              return (
                <span key={ch} title={cfg.label} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-700">
                  {cfg.icon ? <img src={cfg.icon} alt={cfg.label} className="w-4 h-4" /> : <span className="text-[10px]">{cfg.label.charAt(0)}</span>}
                </span>
              );
            })}
          </div>
        ) : (
          <span className="text-gray-300 text-sm">-</span>
        )
      ),
    },
    {
      key: 'tags', label: 'แท็ก',
      defaultWidth: 140, reorderable: true,
      render: (c) => (
        c.tags && c.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {c.tags.map(tag => (
              <TagBadge key={tag.id} tag={tag} size="sm" />
            ))}
          </div>
        ) : (
          <span className="text-gray-300 text-sm">-</span>
        )
      ),
    },
    {
      key: 'address', label: 'ที่อยู่',
      defaultWidth: 220, reorderable: true, resizable: true,
      render: (c) => (
        c.default_address ? (
          <span className="text-base text-gray-700 dark:text-slate-300 line-clamp-1">
            {[c.default_address.address_line1, c.default_address.amphoe, c.default_address.province].filter(Boolean).join(' ')}
          </span>
        ) : (
          <span className="text-gray-300 text-sm">-</span>
        )
      ),
    },
    {
      key: 'orderCount', label: 'จำนวนบิล',
      defaultWidth: 100, reorderable: true,
      headerClassName: 'text-center', cellClassName: 'text-center',
      render: (c) => (
        c.order_count && c.order_count > 0 ? (
          <span className="text-base text-gray-900 dark:text-white">{c.order_count}</span>
        ) : (
          <span className="text-gray-300 text-sm">-</span>
        )
      ),
    },
    {
      key: 'totalOrder', label: 'ยอดสั่งซื้อ',
      defaultWidth: 130, reorderable: true,
      headerClassName: 'text-right', cellClassName: 'text-right',
      render: (c) => (
        c.total_order_amount && c.total_order_amount > 0 ? (
          <span className="text-base text-gray-900 dark:text-white">฿{formatPrice(c.total_order_amount)}</span>
        ) : (
          <span className="text-gray-400 text-sm">-</span>
        )
      ),
    },
    {
      key: 'actions', label: '',
      alwaysVisible: true, stopPropagation: true,
      defaultWidth: 56,
      headerClassName: 'text-center', cellClassName: 'text-center',
      render: (c) => <ActionMenu items={buildActionMenuItems(c)} />,
    },
  ];

  // Mobile card renderer
  const mobileCardRender = (customer: Customer) => (
    <>
      {/* Row 1: Name + Type + Menu */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white text-[15px] truncate">{customer.name}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <CustomerTypeBadge type={customer.customer_type} />
          <div onClick={e => e.stopPropagation()}>
            <ActionMenu items={buildActionMenuItems(customer)} />
          </div>
        </div>
      </div>

      {/* Row 2: Phone + Email */}
      {(customer.phone || customer.email) && (
        <div className="flex items-center gap-3 mb-1.5 text-sm text-gray-500 dark:text-slate-400">
          {customer.phone && (
            <a href={`tel:${customer.phone}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-blue-600">
              <Phone className="w-3 h-3" />{customer.phone}
            </a>
          )}
          {customer.email && (
            <span className="inline-flex items-center gap-1">
              <Mail className="w-3 h-3" />{customer.email}
            </span>
          )}
        </div>
      )}

      {/* Row 3: Channels + Tags */}
      {((customer.channels && customer.channels.length > 0) || (customer.tags && customer.tags.length > 0)) && (
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          {customer.channels && customer.channels.length > 0 && (
            <div className="flex items-center gap-1">
              {customer.channels.map(ch => {
                const cfg = CHANNEL_CONFIG[ch];
                if (!cfg) return null;
                return (
                  <span key={ch} title={cfg.label} className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 dark:bg-slate-700">
                    {cfg.icon ? <img src={cfg.icon} alt={cfg.label} className="w-3.5 h-3.5" /> : <span className="text-[9px]">{cfg.label.charAt(0)}</span>}
                  </span>
                );
              })}
            </div>
          )}
          {customer.tags && customer.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {customer.tags.map(tag => (
                <TagBadge key={tag.id} tag={tag} size="sm" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Row 4: Address */}
      {customer.default_address && (
        <p className="text-sm text-gray-500 dark:text-slate-400 truncate mb-1.5">
          {[customer.default_address.address_line1, customer.default_address.amphoe, customer.default_address.province].filter(Boolean).join(' ')}
        </p>
      )}

      {/* Row 5: Order count + Total */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400 dark:text-slate-500">
          {customer.order_count && customer.order_count > 0 ? `${customer.order_count} บิล` : 'ยังไม่มีบิล'}
        </span>
        {customer.total_order_amount && customer.total_order_amount > 0 ? (
          <span className="font-semibold text-gray-900 dark:text-white">฿{formatPrice(customer.total_order_amount)}</span>
        ) : null}
      </div>
    </>
  );

  if (authLoading || loading) {
    return (
      <Layout>
        <Container size="full">
          <LoadingCard />
        </Container>
      </Layout>
    );
  }

  return (
    <Layout>
      <Container size="full">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="heading-1 flex items-center">
              <UserCircle className="w-8 h-8 mr-3 text-primary" />
              ลูกค้า
            </h1>
            <p className="page-subtitle">จัดการข้อมูลลูกค้าและความสัมพันธ์</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<Tags className="w-4 h-4" />}
              onClick={() => { setEditingTag(null); setTagName(''); setTagColor(TAG_COLORS[0]); setShowTagModal(true); }}
            >
              <span className="hidden md:inline">จัดการแท็ก</span>
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="w-5 h-5" />}
              onClick={() => router.push('/customers/new')}
            >
              เพิ่ม<span className="hidden md:inline">ลูกค้า</span>
            </Button>
          </div>
        </div>

        {/* Alerts */}
        {error && <Alert tone="danger">{error}</Alert>}

        {/* Filters and Search */}
        <div className="data-filter-card">
          <div className="flex flex-col gap-3">
            {/* Row 1: Search */}
            <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="ค้นหาชื่อ, รหัส, เบอร์โทร..." className="py-2" />

            {/* Row 2: Type tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {visibleTabs.map(tab => {
                const isActive = filterType === (tab.id === 'all' ? '' : tab.types.join(','));
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      const val = tab.id === 'all' ? '' : tab.types.join(',');
                      setFilterType(val); setCurrentPage(1);
                      if (tab.id !== 'all' && tab.id !== 'retail') { setFilterChannel(''); syncUrl({ type: val, channel: '', page: 1 }); }
                      else syncUrl({ type: val, page: 1 });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Row 3: Platform chips — only for ทั้งหมด / ลูกค้าปลีก */}
            {(!filterType || filterType === 'retail,dropship,affiliate') && (
              <PlatformChipFilter
                value={filterChannel || 'all'}
                onChange={(val) => { const ch = val === 'all' ? '' : val; setFilterChannel(ch); setCurrentPage(1); syncUrl({ channel: ch, page: 1 }); }}
              />
            )}

            {/* Row 4: Amount + other filters */}
            <div className="flex gap-2">
              {/* Order Amount Filter */}
              <div className="flex-1 min-w-0">
                <FormSelect
                  value={filterAmount}
                  onChange={(val) => { setFilterAmount(val); setCurrentPage(1); syncUrl({ amount: val, page: 1 }); }}
                  options={[
                    { id: '0', label: 'ยังไม่มียอด' },
                    { id: '<10000', label: 'น้อยกว่า ฿10,000' },
                    { id: '10000-50000', label: '฿10,000 - ฿50,000' },
                    { id: '50000-100000', label: '฿50,000 - ฿100,000' },
                    { id: '>100000', label: 'มากกว่า ฿100,000' },
                  ]}
                  clearLabel="ยอด"
                  searchThreshold={99}
                />
              </div>

              {/* Order Count Filter */}
              <div className="flex-1 min-w-0">
                <FormSelect
                  value={filterOrderCount}
                  onChange={(val) => { setFilterOrderCount(val); setCurrentPage(1); syncUrl({ orders: val, page: 1 }); }}
                  options={[
                    { id: '0', label: 'ยังไม่มีบิล' },
                    { id: '1-5', label: '1 - 5 บิล' },
                    { id: '6-20', label: '6 - 20 บิล' },
                    { id: '>20', label: 'มากกว่า 20 บิล' },
                  ]}
                  clearLabel="บิล"
                  searchThreshold={99}
                />
              </div>

              {/* Tag Filter */}
              {allTags.length > 0 && (
              <div className="flex-1 min-w-0">
                <FormSelect
                  value={filterTag}
                  onChange={(val) => { setFilterTag(val); setCurrentPage(1); syncUrl({ tag: val, page: 1 }); }}
                  options={allTags.map(t => ({ id: t.id, label: t.name }))}
                  clearLabel="แท็ก"
                  searchThreshold={99}
                />
              </div>
              )}
            </div>
          </div>
        </div>

        {/* Bulk Action Bar — floating bottom */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 shadow-lg px-6 py-3">
            <div className="max-w-screen-xl mx-auto flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                clear all
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  icon={<Trash2 className="w-4 h-4" />}
                  loading={bulkDeleting}
                  onClick={handleBulkDelete}
                >
                  {bulkDeleting ? 'กำลังลบ...' : `ลบ ${selectedIds.size} รายการ`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Customer Table */}
        <DataTable<Customer>
          storageKey="customers"
          columns={columns}
          data={filteredCustomers}
          getRowId={(c) => c.id}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          mobileCardRender={mobileCardRender}
          onRowClick={(c) => router.push(`/customers/${c.id}`)}
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={filteredCustomers.length}
          recordsPerPage={rowsPerPage}
          onPageChange={(p) => { setCurrentPage(p); syncUrl({ page: p }); }}
          onRecordsPerPageChange={(v) => { setRowsPerPage(v); syncUrl({ limit: v, page: 1 }); }}
          emptyMessage="ไม่พบข้อมูลลูกค้า"
          emptyIcon={<UserCircle className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
        />
      </Container>

      {/* Tag Management Modal */}
      <Modal
        open={showTagModal}
        onClose={() => setShowTagModal(false)}
        title={
          <span className="flex items-center gap-2">
            <Tags className="w-5 h-5 text-primary" />
            จัดการแท็ก
          </span>
        }
        size="md"
      >
        {/* Create / Edit form */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <FormInput
              type="text"
              value={tagName}
              onChange={e => setTagName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveTag();
                if (e.key === 'Escape' && editingTag) { setEditingTag(null); setTagName(''); setTagColor(TAG_COLORS[0]); }
              }}
              placeholder={editingTag ? 'แก้ไขชื่อแท็ก...' : 'ชื่อแท็กใหม่...'}
              containerClassName="flex-1 min-w-0"
            />
            <Button
              variant="primary"
              disabled={!tagName.trim() || tagSaving}
              loading={tagSaving}
              onClick={handleSaveTag}
            >
              {editingTag ? 'แก้ไข' : 'สร้าง'}
            </Button>
            {editingTag && (
              <Button
                variant="ghost"
                size="sm"
                icon={<X className="w-4 h-4" />}
                onClick={() => { setEditingTag(null); setTagName(''); setTagColor(TAG_COLORS[0]); }}
                title="ยกเลิกแก้ไข"
                aria-label="ยกเลิกแก้ไข"
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            {TAG_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setTagColor(c)}
                className={`w-6 h-6 rounded-full transition-all ${tagColor === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-slate-800' : 'hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Tag list */}
        <div className="px-5 py-3">
          {allTags.length === 0 ? (
            <p className="text-center text-gray-400 dark:text-slate-500 text-sm py-8">ยังไม่มีแท็ก</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map(tag => {
                const bg = tag.color + '20';
                const isEditing = editingTag?.id === tag.id;
                return (
                  <span
                    key={tag.id}
                    className={`inline-flex items-center gap-1 rounded-full text-sm font-medium pl-3 pr-1.5 py-1 cursor-pointer transition-all ${isEditing ? 'ring-2 ring-offset-1 ring-gray-400' : 'hover:opacity-80'}`}
                    style={{ backgroundColor: bg, color: tag.color }}
                    onClick={() => { setEditingTag(tag); setTagName(tag.name); setTagColor(tag.color); }}
                  >
                    {tag.name}
                    <span className="opacity-60">({tag.count ?? 0})</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag); }}
                      className="p-0.5 rounded-full hover:bg-black/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {confirmDialog}
    </Layout>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={
      <Layout>
        <Container size="full">
          <LoadingCard />
        </Container>
      </Layout>
    }>
      <CustomersPageContent />
    </Suspense>
  );
}
