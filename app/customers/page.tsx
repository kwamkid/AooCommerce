// Path: app/customers/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import Checkbox from '@/components/ui/Checkbox';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import { useFeatures } from '@/lib/features-context';
import {
  UserCircle,
  Plus,
  Search,
  AlertCircle,
  Check,
  X,
  Loader2,
  Phone,
  Mail,
  Trash2,
  Tags,
  MoreHorizontal,
  Link2,
  ExternalLink,
  Copy,
  RefreshCw,
  KeyRound,
} from 'lucide-react';
import TagBadge, { Tag, TAG_COLORS } from '@/components/ui/TagBadge';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';
import PlatformChipFilter from '@/app/components/PlatformChipFilter';
import FormSelect from '@/components/ui/FormSelect';
import ActionMenu, { ActionItem } from '@/app/orders/components/ActionMenu';

// Column toggle system
type ColumnKey = 'customer' | 'type' | 'channels' | 'tags' | 'address' | 'totalOrder' | 'orderCount' | 'branch';

const COLUMN_CONFIGS: { key: ColumnKey; label: string; defaultVisible: boolean; alwaysVisible?: boolean }[] = [
  { key: 'customer', label: 'ลูกค้า', defaultVisible: true, alwaysVisible: true },
  { key: 'type', label: 'ประเภท', defaultVisible: true },
  { key: 'channels', label: 'ช่องทาง', defaultVisible: true },
  { key: 'tags', label: 'แท็ก', defaultVisible: true },
  { key: 'address', label: 'ที่อยู่', defaultVisible: true },
  { key: 'orderCount', label: 'จำนวนบิล', defaultVisible: true },
  { key: 'totalOrder', label: 'ยอดสั่งซื้อ', defaultVisible: true },
  { key: 'branch', label: 'สาขา', defaultVisible: true },
];

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

const STORAGE_KEY = 'customers-visible-columns';

function getDefaultColumns(): ColumnKey[] {
  return COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key);
}

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

// Customer type config — label + badge color for display
const CUSTOMER_TYPES: Record<string, { label: string; color: string; group?: string }> = {
  // ปลีก
  retail: { label: 'ลูกค้าปลีก', color: 'bg-blue-100 text-blue-800', group: 'retail' },
  dropship: { label: 'Dropship', color: 'bg-sky-100 text-sky-800', group: 'retail' },
  affiliate: { label: 'Affiliate', color: 'bg-fuchsia-100 text-fuchsia-800', group: 'retail' },
  // ตัวแทน (consignment feature)
  consignment_dealer: { label: 'ตัวแทนฝากขาย', color: 'bg-amber-100 text-amber-800', group: 'dealer' },
  wholesale_dealer: { label: 'ตัวแทนขายขาด', color: 'bg-orange-100 text-orange-800', group: 'dealer' },
  dealer: { label: 'ตัวแทน', color: 'bg-amber-100 text-amber-800', group: 'dealer' },
  // ห้าง (department_store feature)
  department_store: { label: 'ห้างฝากขาย', color: 'bg-pink-100 text-pink-800', group: 'dept' },
  wholesale_department: { label: 'ห้างขายขาด', color: 'bg-rose-100 text-rose-800', group: 'dept' },
  // องค์กร
  corporate: { label: 'องค์กร/B2B', color: 'bg-slate-100 text-slate-800', group: 'corporate' },
  credit: { label: 'เครดิต (legacy)', color: 'bg-gray-100 text-gray-800', group: 'corporate' },
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
  const config = CUSTOMER_TYPES[type] || { label: type, color: 'bg-gray-100 text-gray-800' };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
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
  const [dataFetched, setDataFetched] = useState(false);
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

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try { return new Set(JSON.parse(stored) as ColumnKey[]); } catch { /* use defaults */ }
      }
    }
    return new Set(getDefaultColumns());
  });

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const isCol = (key: ColumnKey) => {
    if (key === 'branch') return false;
    return visibleColumns.has(key);
  };

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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

  // Sync filters → URL (replace so back button goes to previous page, not previous filter state)
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
    if (!userProfile.roles?.some((r: string) => ['owner', 'admin', 'sales', 'account'].includes(r))) {
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
        setDataFetched(true);
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
  // Channel filter is now server-side
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

  // Pagination — server handles page/limit, client just uses totalCustomers for display
  const totalPages = Math.ceil(totalCustomers / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalCustomers);
  const paginatedCustomers = filteredCustomers;

  const allPageSelected = paginatedCustomers.length > 0 &&
    paginatedCustomers.every(c => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    const pageIds = paginatedCustomers.map(c => c.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
  };

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

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
              <UserCircle className="w-8 h-8 mr-3 text-[#F4511E]" />
              ลูกค้า
            </h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">จัดการข้อมูลลูกค้าและความสัมพันธ์</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditingTag(null); setTagName(''); setTagColor(TAG_COLORS[0]); setShowTagModal(true); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-base text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Tags className="w-4 h-4" />
              <span className="hidden md:inline">จัดการแท็ก</span>
            </button>
            <button
              onClick={() => router.push('/customers/new')}
              className="bg-[#F4511E] text-white px-4 py-2 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center font-medium"
            >
              <Plus className="w-5 h-5 mr-2" />
              เพิ่ม<span className="hidden md:inline">ลูกค้า</span>
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Filters and Search */}
        <div className="data-filter-card">
          <div className="flex flex-col gap-3">
            {/* Row 1: Search */}
            <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="ค้นหาชื่อ, รหัส, เบอร์โทร..." className="py-2" />

            {/* Row 2: Type tabs (ก่อน platform — เพราะ ตัวแทน/ห้าง ไม่มี platform) */}
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
                      // Clear platform filter for non-retail tabs
                      if (tab.id !== 'all' && tab.id !== 'retail') { setFilterChannel(''); syncUrl({ type: val, channel: '', page: 1 }); }
                      else syncUrl({ type: val, page: 1 });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-[#F4511E] text-white shadow-sm'
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
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
              >
                clear all
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {bulkDeleting ? 'กำลังลบ...' : `ลบ ${selectedIds.size} รายการ`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Customer Table */}
        <div className="data-table-wrap hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  <th className="w-[44px] px-3 py-3 text-center">
                    <Checkbox checked={allPageSelected} onChange={toggleSelectAll} />
                  </th>
                  {isCol('customer') && <th className="data-th min-w-[200px]">ลูกค้า</th>}
                  {isCol('type') && <th className="data-th w-[100px]">ประเภท</th>}
                  {isCol('channels') && <th className="data-th min-w-[100px]">ช่องทาง</th>}
                  {isCol('tags') && <th className="data-th min-w-[120px]">แท็ก</th>}

                  {isCol('address') && <th className="data-th min-w-[200px]">ที่อยู่</th>}
                  {isCol('orderCount') && <th className="data-th text-center w-[100px]">จำนวนบิล</th>}
                  {isCol('totalOrder') && <th className="data-th text-right w-[130px]">ยอดสั่งซื้อ</th>}
                  {isCol('branch') && <th className="data-th text-center w-[60px]">สาขา</th>}
                  <th className="w-[44px]"></th>
                </tr>
              </thead>
              <tbody className="data-tbody">
                {paginatedCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => router.push(`/customers/${customer.id}`)}
                    className="data-tr cursor-pointer"
                  >
                    {/* Checkbox */}
                    <td className="w-[44px] px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(customer.id)} onChange={() => toggleSelect(customer.id)} />
                    </td>

                    {/* ลูกค้า: ชื่อ + เบอร์โทร/อีเมล */}
                    {isCol('customer') && (
                    <td className="px-4 py-3">
                      <div>
                        <div className="data-primary text-gray-900 dark:text-slate-100 text-[15px]">{customer.name}</div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {customer.phone && (
                            <a
                              href={`tel:${customer.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 data-secondary text-gray-500 dark:text-slate-400 hover:text-blue-600"
                            >
                              <Phone className="w-3 h-3" />
                              {customer.phone}
                            </a>
                          )}
                          {customer.email && (
                            <span className="inline-flex items-center gap-1 data-secondary text-gray-500 dark:text-slate-400">
                              <Mail className="w-3 h-3" />
                              {customer.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    )}

                    {/* ประเภท */}
                    {isCol('type') && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      <CustomerTypeBadge type={customer.customer_type} />
                    </td>
                    )}

                    {/* ช่องทาง (icon only) */}
                    {isCol('channels') && (
                    <td className="px-3 py-3">
                      {customer.channels && customer.channels.length > 0 ? (
                        <div className="flex items-center gap-1.5">
                          {customer.channels.map(ch => {
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
                      )}
                    </td>
                    )}

                    {/* แท็ก */}
                    {isCol('tags') && (
                    <td className="px-3 py-3">
                      {customer.tags && customer.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {customer.tags.map(tag => (
                            <TagBadge key={tag.id} tag={tag} size="sm" />
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-sm">-</span>
                      )}
                    </td>
                    )}

                    {/* ที่อยู่ (default shipping address) */}
                    {isCol('address') && (
                    <td className="px-3 py-3">
                      {customer.default_address ? (
                        <span className="data-text text-gray-700 dark:text-slate-300 line-clamp-1">
                          {[customer.default_address.address_line1, customer.default_address.amphoe, customer.default_address.province].filter(Boolean).join(' ')}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">-</span>
                      )}
                    </td>
                    )}


                    {/* จำนวนบิล */}
                    {isCol('orderCount') && (
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {customer.order_count && customer.order_count > 0 ? (
                        <span className="data-number text-gray-900 dark:text-white">{customer.order_count}</span>
                      ) : (
                        <span className="text-gray-300 text-sm">-</span>
                      )}
                    </td>
                    )}

                    {/* ยอดสั่งซื้อรวม */}
                    {isCol('totalOrder') && (
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {customer.total_order_amount && customer.total_order_amount > 0 ? (
                        <span className="data-number text-gray-900 dark:text-white">
                          ฿{formatPrice(customer.total_order_amount)}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    )}

                    {/* สาขา */}
                    {isCol('branch') && (
                    <td className="px-3 py-3 text-center">
                      {customer.shipping_address_count && customer.shipping_address_count > 0 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#F4511E]/10 text-[#F4511E] text-sm font-semibold">
                          {customer.shipping_address_count}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">-</span>
                      )}
                    </td>
                    )}

                    {/* Action menu */}
                    <td className="w-[44px] px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu items={(() => {
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
                      })()}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={filteredCustomers.length}
            startIdx={startIndex}
            endIdx={Math.min(endIndex, filteredCustomers.length)}
            recordsPerPage={rowsPerPage}
            setRecordsPerPage={(v) => { setRowsPerPage(v); syncUrl({ limit: v, page: 1 }); }}
            setPage={(p) => { setCurrentPage(p); syncUrl({ page: p }); }}
          >
            <ColumnSettingsDropdown
              configs={COLUMN_CONFIGS.filter(c => c.key !== 'branch')}
              visible={visibleColumns}
              toggle={toggleColumn}
              buttonClassName="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              dropUp
            />
          </Pagination>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-0 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          {paginatedCustomers.length === 0 ? (
            <div className="text-center py-16">
              <UserCircle className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-slate-400 text-sm">ไม่พบข้อมูลลูกค้า</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {paginatedCustomers.map(customer => (
                <div
                  key={customer.id}
                  className="p-4 cursor-pointer active:bg-gray-50 dark:active:bg-slate-700/50"
                  onClick={() => router.push(`/customers/${customer.id}`)}
                >
                  {/* Row 1: Name + Type + Menu */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-[15px] truncate">{customer.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <CustomerTypeBadge type={customer.customer_type} />
                      <div onClick={e => e.stopPropagation()}>
                        <ActionMenu items={(() => {
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
                        })()} />
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
                </div>
              ))}
            </div>
          )}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={filteredCustomers.length}
            startIdx={startIndex}
            endIdx={Math.min(endIndex, filteredCustomers.length)}
            recordsPerPage={rowsPerPage}
            setRecordsPerPage={(v) => { setRowsPerPage(v); syncUrl({ limit: v, page: 1 }); }}
            setPage={(p) => { setCurrentPage(p); syncUrl({ page: p }); }}
          />
        </div>

        {/* Empty State */}
        {filteredCustomers.length === 0 && (
          <div className="text-center py-12 hidden md:block">
            <UserCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">ไม่พบข้อมูลลูกค้า</p>
            {searchTerm && (
              <p className="text-gray-400 text-sm mt-2">ลองค้นหาด้วยคำอื่น</p>
            )}
          </div>
        )}
      </div>
      {/* Tag Management Modal */}
      {showTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTagModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Tags className="w-5 h-5 text-[#F4511E]" />
                จัดการแท็ก
              </h3>
              <button onClick={() => setShowTagModal(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Create / Edit form */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tagName}
                  onChange={e => setTagName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveTag();
                    if (e.key === 'Escape' && editingTag) { setEditingTag(null); setTagName(''); setTagColor(TAG_COLORS[0]); }
                  }}
                  placeholder={editingTag ? 'แก้ไขชื่อแท็ก...' : 'ชื่อแท็กใหม่...'}
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-[#F4511E] focus:border-transparent outline-none"
                />
                <button
                  onClick={handleSaveTag}
                  disabled={!tagName.trim() || tagSaving}
                  className="px-4 py-2 bg-[#F4511E] text-white rounded-lg text-base font-medium hover:bg-[#D63B0E] disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {editingTag ? 'แก้ไข' : 'สร้าง'}
                </button>
                {editingTag && (
                  <button
                    onClick={() => { setEditingTag(null); setTagName(''); setTagColor(TAG_COLORS[0]); }}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="ยกเลิกแก้ไข"
                  >
                    <X className="w-4 h-4" />
                  </button>
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
            <div className="flex-1 overflow-y-auto px-5 py-3">
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
          </div>
        </div>
      )}

      {confirmDialog}
    </Layout>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    }>
      <CustomersPageContent />
    </Suspense>
  );
}
