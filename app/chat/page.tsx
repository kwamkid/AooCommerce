'use client';

import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import SearchInput from '@/components/ui/SearchInput';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useHeaderSummary } from '@/lib/header-summary-context';
import { useCompany } from '@/lib/company-context';
import { buildMessagePreview } from '@/lib/chat/message-preview';
import { apiFetch } from '@/lib/api-client';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { formatPrice, formatNumber } from '@/lib/utils/format';
import { getBadgeColor, getPaymentBadgeColor } from '@/lib/status-tab-colors';
import { isConsignmentFlow, isDepartmentFlow } from '@/lib/flow-types';
import { supabase } from '@/lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  MessageCircle,
  Mail,
  CheckCheck,
  Search,
  Send,
  User,
  Loader2,
  ChevronLeft,
  Link as LinkIcon,
  X,
  Check,
  Phone,
  ShoppingCart,
  History,
  AlertCircle,
  RotateCcw,
  ImagePlus,
  Smile,
  ArrowDown,
  Filter,
  ChevronDown,
  UserCheck,
  UserX,
  Clock,
  Bell,
  FileText,
  ArrowUpDown,
  Trash2,
  Unlink,
  ExternalLink,
  UserPlus,
  MapPin,
  FilterX
} from 'lucide-react';
import Image from 'next/image';
import type { CustomerFormData } from '@/components/customers/customer-payload';
import { buildCustomerPayload } from '@/components/customers/customer-payload';
import TagBadge, { Tag } from '@/components/ui/TagBadge';
import TagInput from '@/components/ui/TagInput';
import { diffTagIds, patchCustomerTags, patchContactTags } from '@/lib/tag-links';
import Tooltip from '@/components/ui/Tooltip';
import type { UnifiedContact, ChatMessage, Customer, DayRange, ChatAccountInfo, LinkedContact } from './lib/chatTypes';
import MessageBubble from './components/MessageBubble';
import { FbIcon, IgIcon, LineIcon, ShopeeIcon, LazadaIcon, TiktokIcon, PlatformIcon, AccountCornerBadge, getAccountPicture, getAvatarUrl, getInitials, formatTime, formatLastMessage, compressImage, officialStickers, isSystemEventMessage } from './lib/chatHelpers';
import { FullPageLoading } from '@/components/ui/Loading';
import { LoadingCard } from '@/components/ui/StateCard';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import StatusBadge from '@/components/ui/StatusBadge';
import ChannelBadge from '@/components/ui/ChannelBadge';

// Dynamic imports for components that are not needed on initial load
const EmojiStickerPicker = dynamic(() => import('./components/EmojiStickerPicker'), { ssr: false });
const LinkCustomerModal = dynamic(() => import('./components/LinkCustomerModal'), { ssr: false });
const LightboxViewer = dynamic(() => import('./components/LightboxViewer'), { ssr: false });
// ฟอร์มสองตัวนี้ใหญ่มาก (OrderForm ~3,300 บรรทัด · CustomerForm ~700) แต่ใช้แค่ตอนเปิด
// แผงด้านข้าง — import ตรง ๆ = ติดไปกับ first-load JS ของหน้าแชททุกครั้งที่เปิดหน้า
const OrderForm = dynamic(() => import('@/components/orders/OrderForm'), { ssr: false, loading: () => <LoadingCard /> });
const CustomerForm = dynamic(() => import('@/components/customers/CustomerForm'), { ssr: false, loading: () => <LoadingCard /> });

/**
 * ชนิดข้อความที่ "วาดกล่องของตัวเอง" — ฟองรอบนอกต้องโปร่งใส ไม่งั้นจะได้กล่องซ้อนกล่อง
 * (การ์ดสินค้า/ออเดอร์ของ Shopee มีพื้นขาว+ขอบของตัวเองเหมือนการ์ด template ของ FB)
 */
const BARE_BUBBLE_TYPES = ['sticker', 'image', 'video', 'flex', 'template', 'imagemap', 'story_mention', 'item', 'order'];

function UnifiedChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  // ตัวเลขแชทที่ sidebar/กระดิ่ง — ต้องสั่งรีเฟรชเองหลังงานที่แก้หลายพันแถวทีเดียว (ดู markAllRead)
  const { refresh: refreshHeaderSummary } = useHeaderSummary();
  // realtime ต้องกรองตามบริษัท — ไม่กรอง = ทุกแท็บรับ event ของทุกบริษัทในระบบ
  const { currentCompany } = useCompany();
  const companyId = currentCompany?.id;
  const { confirmDialog, confirm } = useConfirmDialog();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Contacts list state
  const [contacts, setContacts] = useState<UnifiedContact[]>([]);
  // สำเนาล่าสุดของลิสต์ให้ handler realtime (ที่ subscribe ครั้งเดียว) เช็คได้ว่าแถวนั้นอยู่บนจอไหม
  // โดยไม่ต้องผูกเป็น dependency แล้วถอน+สมัคร channel ใหม่ทุกครั้งที่ลิสต์เปลี่ยน
  const contactsRef = useRef<UnifiedContact[]>([]);
  contactsRef.current = contacts;
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalUnread, setTotalUnread] = useState(0);
  const [hasMoreContacts, setHasMoreContacts] = useState(false);
  const [loadingMoreContacts, setLoadingMoreContacts] = useState(false);
  const contactsEndRef = useRef<HTMLDivElement>(null);

  // Chat accounts for filter
  const [chatAccounts, setChatAccounts] = useState<ChatAccountInfo[]>([]);

  // URL-derived filter state
  const filterAccountId = searchParams.get('account') || '';
  const filterPlatform = (searchParams.get('platform') || 'all') as 'all' | 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok';
  const filterTag = searchParams.get('tag') || '';
  const sortMode = (searchParams.get('sort') || 'time') as 'time' | 'unread';
  const filterLinked = (searchParams.get('linked') || 'all') as 'all' | 'linked' | 'unlinked';
  const filterUnread = searchParams.get('unread') === '1';

  const setFilterParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    const defaults: Record<string, string> = { account: '', platform: 'all', tag: '', sort: 'time', linked: 'all', unread: '' };
    for (const [k, v] of Object.entries(updates)) {
      if (v === (defaults[k] ?? '') || v === '') params.delete(k);
      else params.set(k, v);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Selected contact state
  const [selectedContact, setSelectedContact] = useState<UnifiedContact | null>(null);
  // refs สำหรับ realtime effect ที่ subscribe ครั้งเดียว — อ่านค่าล่าสุดโดยไม่ต้อง re-subscribe
  const selectedContactRef = useRef<UnifiedContact | null>(null);
  selectedContactRef.current = selectedContact;
  const latestFetchContactsRef = useRef<(loadMore?: boolean) => void>(() => {});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Linked contacts for customer profile
  const [linkedContacts, setLinkedContacts] = useState<LinkedContact[]>([]);
  const [profileAddresses, setProfileAddresses] = useState<any[]>([]);

  // Message input
  const [newMessage, setNewMessage] = useState('');
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Link customer modal
  const [showLinkModal, setShowLinkModal] = useState(false);

  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const warehousePortalRef = useRef<HTMLDivElement>(null);
  const headerActionsRef = useRef<HTMLDivElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Sticker picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');

  // Scroll to bottom button
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Lightbox for images/videos
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Right panel (split view) - desktop only
  const [rightPanel, setRightPanel] = useState<'order' | 'history' | 'profile' | 'edit-customer' | 'order-detail' | null>(null);
  const [orderFormKey, setOrderFormKey] = useState(0);

  // Mobile view mode
  const [mobileView, setMobileView] = useState<'contacts' | 'chat' | 'history' | 'profile' | 'edit-customer' | 'order-detail'>('contacts');
  // ปัดขวาในหน้าคุย = กลับไปรายชื่อแชท (ท่าเดียวกับแอปแชททั่วไป — หน้านี้ไม่เปลี่ยน URL
  // เบราว์เซอร์จึงไม่มีท่าย้อนกลับให้เอง)
  const mobileViewRef = useRef(mobileView);
  mobileViewRef.current = mobileView;

  // Order detail view
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Edit customer state
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editCustomerError, setEditCustomerError] = useState('');

  // Order history data
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Advanced filters
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [filterOrderDaysRange, setFilterOrderDaysRange] = useState<{ min: number; max: number | null } | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');

  // Day ranges from CRM settings
  const [dayRanges, setDayRanges] = useState<DayRange[]>([]);

  // Tags
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [profileTags, setProfileTags] = useState<Tag[]>([]);
  // ชุดแท็กล่าสุดที่ "เซิร์ฟเวอร์ยืนยัน" ของผู้ติดต่อที่เลือกอยู่ = baseline ของ diff
  // ⛔ ห้าม diff กับสิ่งที่จอแสดง (profileTags / contact.tags) — นั่นคือ snapshot ตอนกดเปิด
  // ซึ่งอาจเก่ากว่าความจริงใน DB แล้วจะไปลบแท็กที่คนอื่นเพิ่งติด (ดู lib/tag-links.ts)
  const profileTagsServerRef = useRef<Tag[]>([]);
  // baseline ข้างบนเป็นของผู้ติดต่อคนไหน — กันหยิบ baseline ของคนก่อนหน้ามา diff
  const profileTagsServerKeyRef = useRef<string | null>(null);

  const hasActiveFilter = filterLinked !== 'all' || filterOrderDaysRange !== null || filterTag !== '' || filterUnread || filterAccountId !== '' || sortMode !== 'time';

  // Platform color
  const platformColor = selectedContact?.source === 'instagram' ? '#E4405F' : selectedContact?.platform === 'line' ? '#06C755' : selectedContact?.platform === 'shopee' ? '#EE4D2D' : selectedContact?.platform === 'lazada' ? '#0F146E' : selectedContact?.platform === 'tiktok' ? '#161823' : '#1877F2';

  // Check if FB/IG messaging window expired (7 days since last incoming message)
  const isWindowExpired = useMemo(() => {
    if (!selectedContact || selectedContact.platform !== 'facebook') return false;
    const lastIncoming = [...messages].reverse().find(m => m.direction === 'incoming');
    if (!lastIncoming) return true; // No incoming messages at all
    const daysSince = (Date.now() - new Date(lastIncoming.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 7;
  }, [selectedContact, messages]);

  // Build media list from messages for lightbox navigation
  const mediaList = useMemo(() => {
    return messages
      .filter(m =>
        (m.message_type === 'image' && m.raw_message?.imageUrl) ||
        (m.message_type === 'video' && m.raw_message?.videoUrl)
      )
      .map(m => ({
        url: m.message_type === 'video' ? m.raw_message!.videoUrl! : m.raw_message!.imageUrl!,
        type: (m.message_type === 'video' ? 'video' : 'image') as 'image' | 'video',
        timestamp: m.created_at
      }));
  }, [messages]);

  const openLightbox = useCallback((url: string) => {
    const idx = mediaList.findIndex(m => m.url === url);
    setLightboxIndex(idx >= 0 ? idx : null);
  }, [mediaList]);

  // Fetch chat accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await apiFetch('/api/chat-accounts');
        if (res.ok) {
          const data = await res.json();
          setChatAccounts((data.accounts || []).filter((a: ChatAccountInfo) => a.is_active));
        }
      } catch {}
    };
    if (!authLoading && userProfile) fetchAccounts();
  }, [authLoading, userProfile]);

  // Fetch CRM settings (day ranges)
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await apiFetch('/api/settings/crm');
        if (response.ok) {
          const result = await response.json();
          setDayRanges(result.dayRanges || []);
        }
      } catch (error) {
        console.error('Error fetching CRM settings:', error);
      }
    };
    if (!authLoading && userProfile) fetchSettings();
  }, [authLoading, userProfile]);

  // Fetch all tags for filter & editing
  useEffect(() => {
    if (authLoading || !userProfile) return;
    apiFetch('/api/customers/tags').then(r => r.json()).then(d => {
      if (d.tags) setAllTags(d.tags);
    }).catch(() => {});
  }, [authLoading, userProfile]);

  // Debounce search term (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch contacts — use simple approach without AbortController for initial load
  const fetchIdRef = useRef(0);
  useEffect(() => {
    if (!authLoading && userProfile) {
      const id = ++fetchIdRef.current;
      setLoadingContacts(true);
      (async () => {
        try {
          const params = new URLSearchParams();
          if (filterAccountId) params.set('account_id', filterAccountId);
          else if (filterPlatform !== 'all') params.set('platform', filterPlatform);
          if (debouncedSearch) params.set('search', debouncedSearch);
          if (filterUnread) params.set('unread_only', 'true');
          if (filterLinked === 'linked') params.set('linked_only', 'true');
          if (filterLinked === 'unlinked') params.set('unlinked_only', 'true');
          if (filterOrderDaysRange) {
            params.set('order_days_min', filterOrderDaysRange.min.toString());
            if (filterOrderDaysRange.max !== null) params.set('order_days_max', filterOrderDaysRange.max.toString());
          }
          if (filterTag) params.set('tag', filterTag);
          params.set('limit', '30');
          params.set('offset', '0');

          const response = await apiFetch(`/api/chat/contacts?${params.toString()}`);
          if (fetchIdRef.current !== id) return; // stale
          if (!response.ok) throw new Error('Failed to fetch contacts');

          const result = await response.json();
          if (fetchIdRef.current !== id) return; // stale
          setContacts(result.contacts || []);
          setHasMoreContacts(result.summary?.hasMore || false);
          setTotalUnread(result.summary?.totalUnread || 0);
        } catch (error: any) {
          if (fetchIdRef.current !== id) return;
          console.error('Error fetching contacts:', error);
        } finally {
          if (fetchIdRef.current === id) setLoadingContacts(false);
        }
      })();
    }
  }, [authLoading, userProfile, debouncedSearch, filterLinked, filterUnread, filterOrderDaysRange, filterAccountId, filterPlatform, filterTag]);

  // Auto-select contact from URL param
  useEffect(() => {
    const contactId = searchParams.get('contact_id');
    if (contactId && contacts.length > 0 && !selectedContact) {
      const contact = contacts.find(c => c.id === contactId);
      if (contact) {
        setSelectedContact(contact);
        const params = new URLSearchParams(searchParams.toString());
        params.delete('contact_id');
        const qs = params.toString();
        router.replace(qs ? `?${qs}` : '/chat', { scroll: false });
      }
    }
  }, [searchParams, contacts, selectedContact, router]);

  // Fetch messages when contact selected
  useEffect(() => {
    if (selectedContact) {
      fetchMessages(selectedContact.id);
      setMobileView('chat');
      setRightPanel(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [selectedContact]);

  // Fetch linked contacts when customer changes
  // + สถิติออเดอร์ของแชทที่เปิดอยู่ — ลิสต์รายชื่อไม่ enrich ให้แล้ว (order_stats_loaded=false)
  //   บล็อก "สั่งล่าสุด / ยังไม่เคยสั่ง" ในแผงโปรไฟล์จึงมาทางนี้แทน (call เดิม ไม่เพิ่ม request)
  useEffect(() => {
    const customerId = selectedContact?.customer_id || selectedContact?.customer?.id;
    if (!customerId) {
      setLinkedContacts([]);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/chat/contacts?customer_id=${customerId}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setLinkedContacts(data?.linked_contacts || []);
        const stats = data?.order_stats as { last_order_date?: string | null; last_order_created_at?: string | null; avg_order_frequency?: number | null } | null | undefined;
        // API รุ่นเก่าไม่ส่ง order_stats มาเลย → ถือว่า "ไม่รู้" (ห้ามแสดงว่ายังไม่เคยสั่ง)
        const loaded = !!data && typeof data === 'object' && 'order_stats' in data;
        setSelectedContact(prev => {
          // ผู้ใช้อาจสลับแชทไปแล้วระหว่างรอ response — ห้ามเอาสถิติของลูกค้าคนก่อนมาแปะ
          if (!prev || (prev.customer_id || prev.customer?.id) !== customerId) return prev;
          return {
            ...prev,
            last_order_date: stats?.last_order_date ?? undefined,
            last_order_created_at: stats?.last_order_created_at ?? undefined,
            avg_order_frequency: stats?.avg_order_frequency ?? null,
            order_stats_loaded: loaded,
          };
        });
      })
      .catch(() => { if (!cancelled) setLinkedContacts([]); });
    return () => { cancelled = true; };
  }, [selectedContact?.customer_id, selectedContact?.customer?.id]);

  // Fetch shipping addresses when customer changes
  useEffect(() => {
    const customerId = selectedContact?.customer_id || selectedContact?.customer?.id;
    if (customerId) {
      apiFetch(`/api/shipping-addresses?customer_id=${customerId}`)
        .then(r => r.json())
        .then(data => setProfileAddresses(data.addresses || []))
        .catch(() => setProfileAddresses([]));
    } else {
      setProfileAddresses([]);
    }
  }, [selectedContact?.customer_id, selectedContact?.customer?.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollButton(distanceFromBottom > 100);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Sync rightPanel → mobileView when resizing (except 'order' which is unified)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768 && rightPanel && rightPanel !== 'order') {
        setMobileView(rightPanel);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rightPanel]);

  // Close filter popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showFilterPopover && !target.closest('[data-filter-popover]')) {
        setShowFilterPopover(false);
      }
      if (showAccountPicker && !target.closest('[data-account-picker]')) {
        setShowAccountPicker(false);
        setAccountSearch('');
      }
      if (showEmojiPicker && !target.closest('[data-emoji-picker]')) {
        setShowEmojiPicker(false);
        setEmojiSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterPopover, showAccountPicker, showEmojiPicker]);

  // Close emoji picker on Escape key
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEmojiPicker(false);
        setEmojiSearch('');
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [showEmojiPicker]);

  // IntersectionObserver for infinite scroll on contacts list
  useEffect(() => {
    if (!contactsEndRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreContacts && !loadingMoreContacts && !loadingContacts) {
          fetchContacts(true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(contactsEndRef.current);
    return () => observer.disconnect();
  }, [hasMoreContacts, loadingMoreContacts, loadingContacts, contacts.length]);

  // IntersectionObserver for infinite scroll on messages
  useEffect(() => {
    if (!messagesTopRef.current || !selectedContact) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreMessages && !loadingMore && !loadingMessages) {
          fetchMessages(selectedContact.id, true);
        }
      },
      { threshold: 0.1, root: messagesContainerRef.current }
    );
    observer.observe(messagesTopRef.current);
    return () => observer.disconnect();
  }, [hasMoreMessages, loadingMore, loadingMessages, selectedContact?.id, messages.length]);

  // ค่าตัวกรองล่าสุดสำหรับ handler ของ realtime — subscribe ครั้งเดียวต่อบริษัท handler จึงปิดทับ
  // (closure) ค่าตอน mount ไปตลอด ถ้าไม่อ่านผ่าน ref
  const filtersRef = useRef({ filterUnread, debouncedSearch, filterTag, filterOrderDaysRange, filterLinked, filterAccountId, filterPlatform, sortMode });
  filtersRef.current = { filterUnread, debouncedSearch, filterTag, filterOrderDaysRange, filterLinked, filterAccountId, filterPlatform, sortMode };

  /** unread ฝั่ง server "ก่อน" ที่เราจะ +1 เองตอนข้อความเข้า — ใช้คิดส่วนต่างของ totalUnread
   *  ตอน event ของตาราง contacts ตามมา (ไม่งั้นจะนับซ้ำหรือนับหาย แล้วแต่ลำดับ event) */
  const unreadBaselineRef = useRef<Map<string, number>>(new Map());

  // ── Supabase Realtime — channel เดียว กรองด้วย company_id ──────────────────────────
  //
  // WHY: ของเดิมเปิด 10 channel **ไม่กรองบริษัท** แล้วทุก event ยิง /api/chat/contacts ใหม่ทั้งชุด
  // (1 serverless invocation + ~6 query ต่อครั้ง) · ร้านหนึ่งมีข้อความ 125–250 ข้อความ/วัน คูณ
  // จำนวนแท็บที่เปิดค้าง = โหลดที่ไม่มีใครเห็นบนจอ และยังได้ event ของบริษัทอื่นมาด้วย
  // ตอนนี้: 1 channel · กรอง company_id · **patch แถวในลิสต์จาก payload ตรง ๆ** ดึงรายชื่อใหม่
  // เฉพาะเคสที่ patch เองไม่ได้ (แถวอยู่นอกหน้าที่โหลด / ผู้ติดต่อใหม่ / ลูกค้าที่ผูกเปลี่ยน)
  useEffect(() => {
    if (!companyId) return;
    // ผูกตัว Map ไว้ครั้งเดียว (ตัวเดิมตลอดอายุ component) — cleanup ห้ามอ่าน ref.current
    const baselines = unreadBaselineRef.current;

    // ทางสำรองเมื่อ patch เองไม่ได้ — หน่วงไว้เพื่อรวม event ที่มาเป็นชุด
    const REFETCH_MISSING_MS = 1500;      // แถวไม่อยู่ในลิสต์ → ต้องดึงถึงจะรู้ว่าควรโผล่ตรงไหน
    const REFETCH_UNREAD_SYNC_MS = 5000;  // แถวนอกจอเปลี่ยนตัวเลขยังไม่อ่าน → sync totalUnread ช้า ๆ พอ
    let refetchTimer: ReturnType<typeof setTimeout> | null = null;
    let refetchDelay = 0;
    const scheduleRefetch = (delayMs: number) => {
      // มีคิวที่จะยิงเร็วกว่าอยู่แล้ว → ปล่อยตัวเดิมทำงาน ห้ามเลื่อนออกไปไกลกว่าเดิม
      if (refetchTimer && refetchDelay <= delayMs) return;
      if (refetchTimer) clearTimeout(refetchTimer);
      refetchDelay = delayMs;
      refetchTimer = setTimeout(() => {
        refetchTimer = null;
        baselines.clear();
        latestFetchContactsRef.current();
      }, delayMs);
    };

    type Row = Record<string, unknown>;
    const handleNewMessage = (payload: RealtimePostgresChangesPayload<Row>, contactIdField: string) => {
      const raw = payload.new as Row;
      const newMsg = raw as unknown as ChatMessage;
      const msgContactId = raw[contactIdField] as string | undefined;
      if (!msgContactId) return;
      const selected = selectedContactRef.current;
      const isSelected = !!selected && msgContactId === selected.id;

      if (selected && isSelected) {
        setMessages(prev => {
          const existsById = prev.some(m => m.id === newMsg.id);
          if (existsById) return prev;
          if (newMsg.direction === 'outgoing') {
            const alreadyHave = prev.some(m => m.content === newMsg.content && m.direction === 'outgoing');
            if (alreadyHave) return prev;
          }
          // แทรกตามเวลาจริง ไม่ใช่ต่อท้ายดื้อ ๆ — ข้อความที่ระบบ "ตามเก็บ" มาทีหลัง
          // อาจเก่ากว่าใบที่อยู่บนจอแล้ว (ร้านตอบจากแอป Shopee/ข้อความอัตโนมัติ
          // ที่แพลตฟอร์มไม่ push มา เราดึงเข้ามาภายหลัง) ต่อท้ายจะได้ลำดับเวลาสลับ
          const row = { ...newMsg, contact_id: msgContactId };
          const at = new Date(row.created_at).getTime();
          let i = prev.length;
          while (i > 0 && new Date(prev[i - 1].created_at).getTime() > at) i--;
          return [...prev.slice(0, i), row, ...prev.slice(i)];
        });

        // Mark as read if viewing this contact (lightweight PATCH instead of re-fetching messages)
        if (newMsg.direction === 'incoming') {
          apiFetch(`/api/chat/contacts/${selected.id}/read`, { method: 'POST', body: JSON.stringify({ platform: selected.platform }) }).catch(() => {});
        }
      }

      const known = contactsRef.current.some(c => c.id === msgContactId);
      if (!known) {
        // ผู้ติดต่อใหม่ หรืออยู่นอก 30 แถวที่โหลดไว้ — ต้องดึงรายชื่อถึงจะรู้ว่าควรอยู่ตรงไหน
        scheduleRefetch(REFETCH_MISSING_MS);
        return;
      }

      const incomingUnread = newMsg.direction === 'incoming' && !isSelected;
      if (incomingUnread && !baselines.has(msgContactId)) {
        // จำค่าจาก server ไว้ก่อนบวกเอง — event ของตาราง contacts ที่ตามมาจะเอาไปคิดส่วนต่าง
        // (เก็บนอก updater เพราะ updater ของ React ต้องไม่มีผลข้างเคียง)
        const current = contactsRef.current.find(c => c.id === msgContactId);
        baselines.set(msgContactId, current?.unread_count || 0);
      }
      setContacts(prev => {
        const idx = prev.findIndex(c => c.id === msgContactId);
        if (idx === -1) return prev;
        const row = prev[idx];
        const updated: UnifiedContact = {
          ...row,
          last_message: buildMessagePreview(newMsg.message_type, newMsg.content),
          last_message_at: newMsg.created_at,
          unread_count: incomingUnread ? (row.unread_count || 0) + 1 : row.unread_count,
        };
        // ลิสต์เรียงตามข้อความล่าสุดก่อน (โหมด "ยังไม่อ่าน" เรียงตอน render อยู่แล้ว)
        const next = prev.slice();
        next.splice(idx, 1);
        next.unshift(updated);
        return next;
      });
      // ⚠️ ไม่ยุ่งกับ totalUnread ที่นี่ — ให้ event ของตาราง contacts เป็นคนเดียวที่ปรับ
      // (มันมีค่าจริงจาก DB มาด้วย จึงไม่นับซ้ำไม่ว่า event ไหนจะมาถึงก่อน)
    };

    const handleContactChange = (payload: RealtimePostgresChangesPayload<Row>) => {
      const row = payload.new as Row | undefined;
      const oldRow = payload.old as Partial<Row> | undefined;

      if (payload.eventType === 'DELETE') {
        const id = oldRow?.id as string | undefined;
        if (!id) return;
        const local = contactsRef.current.find(c => c.id === id);
        if (!local) return;
        setContacts(prev => prev.filter(c => c.id !== id));
        if (local.unread_count) setTotalUnread(t => Math.max(0, t - local.unread_count));
        baselines.delete(id);
        return;
      }

      const id = row?.id as string | undefined;
      if (!id) return;
      const local = contactsRef.current.find(c => c.id === id);

      if (payload.eventType === 'INSERT') {
        if (local) return; // มีอยู่แล้ว (เช่นเพิ่งดึงรายชื่อมาพอดี)
        const { filterLinked } = filtersRef.current;
        // ตัวกรอง "ผูกลูกค้าแล้ว / ยังไม่ผูก" ตัดสินได้จาก payload เลย — แถวที่ยังไงก็ไม่เข้าเกณฑ์
        // ไม่ต้องเสียการดึงรายชื่อทั้งชุด
        if (filterLinked === 'linked' && !row?.customer_id) return;
        if (filterLinked === 'unlinked' && row?.customer_id) return;
        scheduleRefetch(REFETCH_MISSING_MS);
        return;
      }

      // ── UPDATE ──
      const newUnread = typeof row?.unread_count === 'number' ? (row.unread_count as number) : undefined;

      if (!local) {
        // แถวอยู่นอกหน้าที่โหลด — เราแสดงมันไม่ได้อยู่แล้ว สนใจแค่ตอนตัวเลขยังไม่อ่านเปลี่ยน
        // เพราะ totalUnread นับ "ทุกแถว" ไม่ใช่แค่ที่โหลดมา · payload.old ของ Postgres ปกติมี
        // แค่ primary key (REPLICA IDENTITY DEFAULT) → ไม่รู้ค่าเก่า = ถือว่าเปลี่ยน แล้ว sync ช้า ๆ
        const oldUnread = typeof oldRow?.unread_count === 'number' ? (oldRow.unread_count as number) : undefined;
        if (oldUnread === undefined || oldUnread !== newUnread) scheduleRefetch(REFETCH_UNREAD_SYNC_MS);
        return;
      }

      const selected = selectedContactRef.current;
      const isSelectedRow = selected?.id === id;
      const status = row?.status as string | undefined;

      // ถูกบล็อก/ปิดไปแล้ว → เอาออกจากลิสต์ (แถวที่มองไม่เห็นแล้วไม่ควรถูกนับใน totalUnread ต่อ)
      if (status && status !== 'active') {
        setContacts(prev => prev.filter(c => c.id !== id));
        if (local.unread_count) setTotalUnread(t => Math.max(0, t - local.unread_count));
        baselines.delete(id);
        if (isSelectedRow) setSelectedContact(prev => (prev && prev.id === id ? { ...prev, status } : prev));
        return;
      }

      // ลูกค้าที่ผูกเปลี่ยน → payload ไม่มี object `customer` (มาจาก join) ต้องดึงใหม่ถึงจะได้ชื่อ/แท็ก
      const newCustomerId = (row?.customer_id as string | null | undefined) ?? undefined;
      if (newCustomerId !== (local.customer_id ?? undefined)) scheduleRefetch(REFETCH_MISSING_MS);

      // ตัวเลขยังไม่อ่าน: DB เป็นเจ้าของค่าจริง — เทียบกับ "ค่าก่อนที่เราจะบวกเอง" เพื่อไม่นับซ้ำ
      // กับ event ข้อความที่มาคู่กัน · แถวที่เปิดคุยอยู่คงเป็น 0 เสมอ (อ่านแล้วทันที)
      const baseUnread = baselines.get(id) ?? local.unread_count ?? 0;
      baselines.delete(id);
      const nextUnread = isSelectedRow ? 0 : (newUnread ?? local.unread_count ?? 0);
      const delta = nextUnread - baseUnread;
      if (delta !== 0) setTotalUnread(t => Math.max(0, t + delta));

      setContacts(prev => prev.map(c => {
        if (c.id !== id) return c;
        return {
          ...c,
          unread_count: nextUnread,
          last_message_at: (row?.last_message_at as string | undefined) ?? c.last_message_at,
          display_name: (row?.display_name as string | undefined) ?? c.display_name,
          status: status ?? c.status,
          chat_account_id: (row?.chat_account_id as string | undefined) ?? c.chat_account_id,
          // FB: picture_url ที่ API ประกอบให้เป็น URL ผ่าน proxy ของเรา ส่วนใน DB เป็น CDN ที่หมดอายุ
          // → ทับไม่ได้ ไม่งั้นรูปโปรไฟล์เฟซจะกลายเป็นรูปเสียหลังลูกค้าทักครั้งแรก
          ...(c.platform !== 'facebook' && row?.picture_url ? { picture_url: row.picture_url as string } : {}),
        };
      }));
      // ⚠️ ตั้งใจ: แถวที่เพิ่ง patch อาจไม่ตรงตัวกรองที่เปิดอยู่แล้ว (เช่นกรอง "ยังไม่อ่าน" แล้วมันเพิ่ง
      // ถูกอ่าน) — เราปล่อยให้มันค้างอยู่บนจอ ไม่ดึงรายชื่อใหม่เพื่อไล่ออก เพราะการดึงใหม่ทุกครั้งที่
      // ตัวเลขขยับคือสิ่งที่หน้านี้กำลังหนีอยู่พอดี · รอบ fetch ครั้งถัดไปจัดให้เอง

      if (isSelectedRow) {
        // หัวหน้าคุยต้องเปลี่ยนชื่อตาม แต่ **คงตัวเลขยังไม่อ่านของเดิมไว้** (กำลังอ่านอยู่)
        setSelectedContact(prev => (prev && prev.id === id ? {
          ...prev,
          display_name: (row?.display_name as string | undefined) ?? prev.display_name,
          status: status ?? prev.status,
        } : prev));
      }
    };

    const channel = supabase.channel(`chat-page-${companyId}`);
    // ข้อความเข้าใหม่ (5 แพลตฟอร์ม) — INSERT อย่างเดียวพอ
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'line_messages', filter: `company_id=eq.${companyId}` }, (p) => handleNewMessage(p, 'line_contact_id'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fb_messages', filter: `company_id=eq.${companyId}` }, (p) => handleNewMessage(p, 'fb_contact_id'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shopee_messages', filter: `company_id=eq.${companyId}` }, (p) => handleNewMessage(p, 'shopee_contact_id'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lazada_messages', filter: `company_id=eq.${companyId}` }, (p) => handleNewMessage(p, 'lazada_contact_id'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tiktok_messages', filter: `company_id=eq.${companyId}` }, (p) => handleNewMessage(p, 'tiktok_contact_id'))
      // ตัวผู้ติดต่อเอง (ชื่อ/รูป/ยังไม่อ่าน/สถานะ/ลูกค้าที่ผูก) — ต้องฟังครบทุก event
      .on('postgres_changes', { event: '*', schema: 'public', table: 'line_contacts', filter: `company_id=eq.${companyId}` }, handleContactChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fb_contacts', filter: `company_id=eq.${companyId}` }, handleContactChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopee_contacts', filter: `company_id=eq.${companyId}` }, handleContactChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lazada_contacts', filter: `company_id=eq.${companyId}` }, handleContactChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tiktok_contacts', filter: `company_id=eq.${companyId}` }, handleContactChange)
      .subscribe();

    return () => {
      if (refetchTimer) clearTimeout(refetchTimer);
      baselines.clear();
      supabase.removeChannel(channel);
    };
    // ค่าที่ handler ต้องใช้ (selectedContact / fetchContacts / ตัวกรอง) อ่านผ่าน ref ทั้งหมด
    // จึง subscribe ใหม่เฉพาะตอนเปลี่ยนบริษัท
  }, [companyId]);

  const fetchContactsRef = useRef<AbortController | null>(null);
  const fetchContacts = async (loadMore = false) => {
    // Abort any in-flight request to prevent duplicate calls
    if (fetchContactsRef.current) fetchContactsRef.current.abort();
    const controller = new AbortController();
    fetchContactsRef.current = controller;
    try {
      if (loadMore) setLoadingMoreContacts(true);
      const params = new URLSearchParams();
      if (filterAccountId) params.set('account_id', filterAccountId);
      else if (filterPlatform !== 'all') params.set('platform', filterPlatform);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filterUnread) params.set('unread_only', 'true');
      if (filterLinked === 'linked') params.set('linked_only', 'true');
      if (filterLinked === 'unlinked') params.set('unlinked_only', 'true');
      if (filterOrderDaysRange) {
        params.set('order_days_min', filterOrderDaysRange.min.toString());
        if (filterOrderDaysRange.max !== null) params.set('order_days_max', filterOrderDaysRange.max.toString());
      }
      if (filterTag) params.set('tag', filterTag);
      params.set('limit', '30');
      params.set('offset', loadMore ? contacts.length.toString() : '0');

      const response = await apiFetch(`/api/chat/contacts?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Failed to fetch contacts');

      const result = await response.json();
      let contactsList = result.contacts || [];

      if (selectedContact) {
        contactsList = contactsList.map((c: UnifiedContact) =>
          c.id === selectedContact.id ? { ...c, unread_count: 0 } : c
        );
      }

      // ค่าจาก server มาแล้ว → ทิ้ง baseline ของการบวก unread เองที่ค้างอยู่ (ไม่งั้นรอบหน้าจะคิดส่วนต่างผิด)
      unreadBaselineRef.current.clear();
      if (loadMore) {
        setContacts(prev => [...prev, ...contactsList]);
      } else {
        setContacts(contactsList);
      }

      setHasMoreContacts(result.summary?.hasMore || false);

      // Use totalUnread from API (counts ALL contacts, not just current page)
      if (!loadMore) {
        setTotalUnread(result.summary?.totalUnread || 0);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return; // Ignore aborted requests
      console.error('Error fetching contacts:', error);
    } finally {
      // Only update loading state if this is still the active request
      if (fetchContactsRef.current === controller) {
        setLoadingContacts(false);
        setLoadingMoreContacts(false);
      }
    }
  };
  // ให้ realtime effect (subscribe ครั้งเดียว) เรียก fetchContacts เวอร์ชันล่าสุดเสมอ
  latestFetchContactsRef.current = fetchContacts;

  const fetchMessages = async (contactId: string, loadMore = false) => {
    if (!selectedContact) return;
    try {
      if (loadMore) setLoadingMore(true);
      else setLoadingMessages(true);
      const offset = loadMore ? messages.length : 0;
      const limit = 50;
      const response = await apiFetch(`/api/chat/messages?contact_id=${contactId}&platform=${selectedContact.platform}&limit=${limit}&offset=${offset}`);
      if (!response.ok) throw new Error('Failed to fetch messages');

      const result = await response.json();
      const newMessages = result.messages || [];

      if (loadMore) {
        const container = messagesContainerRef.current;
        const prevScrollHeight = container?.scrollHeight || 0;
        setMessages(prev => [...newMessages, ...prev]);
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          }
        });
      } else {
        setMessages(newMessages);
      }

      setHasMoreMessages(newMessages.length === limit);
      if (!loadMore) {
        // เปิดอ่าน = แถวนี้ไม่ค้างแล้ว — **ต้องหักออกจากยอดรวมด้วย** เพราะยอดรวมนับทุกแถว
        // (เดิมได้ค่าใหม่ฟรีจากการดึงรายชื่อใหม่ทุก event ตอนนี้ patch เองจึงต้องหักเอง)
        const before = contactsRef.current.find(c => c.id === contactId)?.unread_count || 0;
        if (before) setTotalUnread(t => Math.max(0, t - before));
        unreadBaselineRef.current.delete(contactId);
        setContacts(prev => prev.map(c => c.id === contactId ? { ...c, unread_count: 0 } : c));
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingMessages(false);
      setLoadingMore(false);
    }
  };

  const sendBillToCustomer = async (orderId: string, orderNumber: string, billUrl: string) => {
    if (!selectedContact) return;
    const messageText = `สรุปคำสั่งซื้อ ${orderNumber}\n\nดูรายละเอียดและชำระเงินได้ที่:\n${billUrl}`;
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId, _tempId: tempId, contact_id: selectedContact.id,
      direction: 'outgoing', message_type: 'text', content: messageText,
      created_at: new Date().toISOString(), _status: 'sending'
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setMobileView('chat');
    setRightPanel(null);

    const contactId = selectedContact.id;
    const platform = selectedContact.platform;
    try {
      const response = await apiFetch('/api/chat/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, platform, message: messageText })
      });
      if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || 'Failed'); }
      const result = await response.json();
      if (result.message) {
        setMessages(prev => prev.map(m => m._tempId === tempId ? { ...result.message, contact_id: contactId, _status: 'sent' as const } : m));
      }
      showToast('ส่งบิลให้ลูกค้าสำเร็จ!');
    } catch (error) {
      const reason = error instanceof Error && error.message !== 'Failed' ? error.message : undefined;
      setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, _status: 'failed' as const, _error: reason } : m));
      showToast(reason ? `ส่งบิลไม่สำเร็จ: ${reason}` : 'ส่งบิลไม่สำเร็จ', 'error');
    }
  };

  const sendMessage = (retryMessage?: ChatMessage) => {
    const messageText = retryMessage?.content || newMessage.trim();
    if (!messageText || !selectedContact) return;
    const tempId = retryMessage?._tempId || `temp-${Date.now()}`;

    if (!retryMessage) {
      const optimisticMessage: ChatMessage = {
        id: tempId, _tempId: tempId, contact_id: selectedContact.id,
        direction: 'outgoing', message_type: 'text', content: messageText,
        created_at: new Date().toISOString(), _status: 'sending'
      };
      setMessages(prev => [...prev, optimisticMessage]);
      setNewMessage('');
      inputRef.current?.focus();
    } else {
      setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, _status: 'sending' as const } : m));
    }

    const contactId = selectedContact.id;
    const platform = selectedContact.platform;
    (async () => {
      try {
        const response = await apiFetch('/api/chat/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_id: contactId, platform, message: messageText })
        });
        if (!response.ok) {
          const errData = await response.json();
          if (errData.errorCode === 'MESSAGING_WINDOW_EXPIRED') {
            setMessages(prev => prev.filter(m => m._tempId !== tempId));
            showToast('ไม่สามารถส่งข้อความได้ — ลูกค้าไม่ได้ส่งข้อความมาภายใน 7 วัน (หมดเวลาตอบกลับ)', 'error');
            return;
          }
          throw new Error(errData.error || 'Failed');
        }
        const result = await response.json();
        if (result.message) {
          setMessages(prev => prev.map(m => m._tempId === tempId ? { ...result.message, contact_id: contactId, _status: 'sent' as const } : m));
        }
      } catch (error) {
        console.error('Error sending message:', error);
        // เก็บเหตุผลจากแพลตฟอร์มไว้ที่ข้อความ — คนกดลองใหม่ต้องรู้ว่าล้มเพราะอะไร ไม่ใช่ลองซ้ำเปล่า ๆ
        const reason = error instanceof Error && error.message !== 'Failed' ? error.message : undefined;
        setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, _status: 'failed' as const, _error: reason } : m));
        showToast(reason ? `ส่งข้อความไม่สำเร็จ: ${reason}` : 'ส่งข้อความไม่สำเร็จ', 'error');
      }
    })();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedContact) return;
    if (!file.type.startsWith('image/')) { showToast('กรุณาเลือกไฟล์รูปภาพ', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('ไฟล์ใหญ่เกินไป (สูงสุด 10MB)', 'error'); return; }

    const compressed = await compressImage(file);
    const tempId = `temp-${Date.now()}`;
    const localUrl = URL.createObjectURL(compressed);
    const optimisticMessage: ChatMessage = {
      id: tempId, _tempId: tempId, contact_id: selectedContact.id,
      direction: 'outgoing', message_type: 'image', content: '[รูปภาพ]',
      raw_message: { imageUrl: localUrl }, created_at: new Date().toISOString(), _status: 'sending'
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setUploadingImage(true);
    const contactId = selectedContact.id;
    const platform = selectedContact.platform;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');
      const fileName = `admin-images/${Date.now()}-${file.name.replace(/\.[^.]+$/, '.jpg')}`;
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(fileName, compressed, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(fileName);
      const imageUrl = urlData.publicUrl;

      const response = await apiFetch('/api/chat/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, platform, type: 'image', imageUrl })
      });
      if (!response.ok) {
        const errData = await response.json();
        if (errData.errorCode === 'MESSAGING_WINDOW_EXPIRED') {
          setMessages(prev => prev.filter(m => m._tempId !== tempId));
          showToast('ไม่สามารถส่งรูปภาพได้ — ลูกค้าไม่ได้ส่งข้อความมาภายใน 7 วัน (หมดเวลาตอบกลับ)', 'error');
          URL.revokeObjectURL(localUrl);
          return;
        }
        throw new Error(errData.error || 'Failed');
      }
      const result = await response.json();
      if (result.message) {
        setMessages(prev => prev.map(m => m._tempId === tempId ? { ...result.message, contact_id: contactId, _status: 'sent' as const } : m));
      }
      URL.revokeObjectURL(localUrl);
    } catch (error) {
      console.error('Error uploading image:', error);
      const reason = error instanceof Error && error.message !== 'Failed' ? error.message : undefined;
      setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, _status: 'failed' as const, _error: reason } : m));
      showToast(reason ? `ส่งรูปภาพไม่สำเร็จ: ${reason}` : 'ส่งรูปภาพไม่สำเร็จ', 'error');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendSticker = (packageId: string, stickerId: string) => {
    if (!selectedContact) return;
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId, _tempId: tempId, contact_id: selectedContact.id,
      direction: 'outgoing', message_type: 'sticker', content: '[สติกเกอร์]',
      raw_message: { packageId, stickerId }, created_at: new Date().toISOString(), _status: 'sending'
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setShowEmojiPicker(false);
    const contactId = selectedContact.id;

    (async () => {
      try {
        const response = await apiFetch('/api/chat/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_id: contactId, platform: 'line', type: 'sticker', packageId, stickerId })
        });
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed'); }
        const result = await response.json();
        if (result.message) {
          setMessages(prev => prev.map(m => m._tempId === tempId ? { ...result.message, contact_id: contactId, _status: 'sent' as const } : m));
        }
      } catch (error) {
        console.error('Error sending sticker:', error);
        // เก็บเหตุผลจากแพลตฟอร์มไว้ที่ข้อความ — คนกดลองใหม่ต้องรู้ว่าล้มเพราะอะไร ไม่ใช่ลองซ้ำเปล่า ๆ
        const reason = error instanceof Error && error.message !== 'Failed' ? error.message : undefined;
        setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, _status: 'failed' as const, _error: reason } : m));
        showToast(reason ? `ส่งสติกเกอร์ไม่สำเร็จ: ${reason}` : 'ส่งสติกเกอร์ไม่สำเร็จ', 'error');
      }
    })();
  };

  // ---- แท็ก: ตัวช่วยกลาง (ดู lib/tag-links.ts ว่าทำไมต้อง diff ไม่ใช่ replace-all) ----

  const contactTagKey = (c: { id: string; platform: string }) => `${c.platform}:${c.id}`;

  /** ชุดแท็กจริงจากเซิร์ฟเวอร์ — ผูกลูกค้าแล้วใช้แท็กของลูกค้า, ยังไม่ผูกใช้แท็กระดับ contact */
  const fetchTagsFor = async (contact: { id: string; platform: string; customer_id?: string | null }): Promise<Tag[]> => {
    const url = contact.customer_id
      ? `/api/customers/${contact.customer_id}/tags`
      : `/api/chat/contacts/${contact.id}/tags?platform=${encodeURIComponent(contact.platform)}`;
    const res = await apiFetch(url);
    if (!res.ok) throw new Error('Failed to load tags');
    const data = await res.json();
    return (data.tags || []) as Tag[];
  };

  /** ตั้ง baseline ของ diff (ไม่แตะแถวในลิสต์) */
  const setTagBaseline = (contact: { id: string; platform: string }, tags: Tag[]) => {
    profileTagsServerRef.current = tags;
    profileTagsServerKeyRef.current = contactTagKey(contact);
    setProfileTags(tags);
  };

  /**
   * เอาชุดที่เซิร์ฟเวอร์ยืนยันมาแปะทั้ง baseline, แถวในลิสต์ และผู้ติดต่อที่เลือกอยู่
   * แท็กของลูกค้าใช้ร่วมกันทุก contact ที่ผูกลูกค้าคนเดียวกัน → อัปเดตทุกแถวที่เกี่ยวข้อง
   */
  const applyServerTags = (contact: { id: string; platform: string; customer_id?: string | null }, tags: Tag[]) => {
    setTagBaseline(contact, tags);
    setContacts(prev => prev.map(ct =>
      (ct.id === contact.id && ct.platform === contact.platform) ||
      (!!contact.customer_id && ct.customer_id === contact.customer_id)
        ? { ...ct, tags } : ct
    ));
    setSelectedContact(prev =>
      prev && prev.id === contact.id && prev.platform === contact.platform ? { ...prev, tags } : prev
    );
  };

  /**
   * ขอบเขตของแท็กเปลี่ยนทันทีที่เชื่อม/ยกเลิกเชื่อมลูกค้า (ลูกค้า ↔ ระดับ contact)
   * ต้องดึงชุดใหม่มาตั้ง baseline ไม่งั้นการกดแท็กครั้งแรกหลังเชื่อมจะ diff กับชุดของ
   * "อีกขอบเขตหนึ่ง" แล้วสั่งลบแท็กเดิมของลูกค้าทิ้งทั้งหมด
   */
  const refreshTagsForContact = async (contact: { id: string; platform: string; customer_id?: string | null }) => {
    try {
      applyServerTags(contact, await fetchTagsFor(contact));
    } catch {
      // แท็กโหลดไม่ได้ไม่ควรทำให้การเชื่อม/ยกเลิกเชื่อมลูกค้าล้มตาม
    }
  };

  const linkCustomer = async (customerId: string | null) => {
    if (!selectedContact) return;
    try {
      const response = await apiFetch('/api/chat/contacts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedContact.id, platform: selectedContact.platform, customer_id: customerId })
      });
      if (!response.ok) throw new Error('Failed');
      if (customerId) {
        // Fetch customer details for local state update
        const custRes = await apiFetch(`/api/customers?search=${encodeURIComponent(customerId)}&limit=1`);
        const custData = custRes.ok ? await custRes.json() : null;
        const linkedCustomer = (custData?.customers || custData || []).find((c: Customer) => c.id === customerId);
        setSelectedContact(prev => prev ? {
          ...prev, customer_id: customerId,
          customer: linkedCustomer ? { id: linkedCustomer.id, name: linkedCustomer.name, customer_code: linkedCustomer.customer_code } : undefined
        } : null);
        setContacts(prev => prev.map(c => c.id === selectedContact.id ? {
          ...c, customer_id: customerId,
          customer: linkedCustomer ? { id: linkedCustomer.id, name: linkedCustomer.name, customer_code: linkedCustomer.customer_code } : undefined
        } : c));
      } else {
        setSelectedContact(prev => prev ? { ...prev, customer_id: undefined, customer: undefined } : null);
        setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, customer_id: undefined, customer: undefined } : c));
      }
      // เชื่อมแล้วต้องเห็นแท็กเดิมของลูกค้าทันที + ตั้ง baseline ใหม่ให้ตรงขอบเขต
      await refreshTagsForContact({ id: selectedContact.id, platform: selectedContact.platform, customer_id: customerId });
    } catch (error) {
      console.error('Error linking customer:', error);
    }
  };

  // Auto-create customer from delivery info (or contact name) + link to contact + update order
  const autoCreateAndLinkCustomerRef = useRef(false);
  const autoCreateAndLinkCustomer = async (orderId: string, deliveryInfo?: { name?: string; phone?: string; email?: string }) => {
    if (!selectedContact) return;
    // Guard: prevent duplicate calls (e.g. rapid bill creation for same contact)
    if (autoCreateAndLinkCustomerRef.current) return;
    if (selectedContact.customer_id) {
      // Already linked — just update order with existing customer_id
      await apiFetch('/api/orders', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: orderId, customer_id: selectedContact.customer_id }) });
      return;
    }
    autoCreateAndLinkCustomerRef.current = true;
    const contactId = selectedContact.id;
    const contactPlatform = selectedContact.platform;
    const customerName = deliveryInfo?.name || selectedContact.display_name;
    if (!customerName) { autoCreateAndLinkCustomerRef.current = false; return; }
    try {
      // 1. Create customer
      const custRes = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customerName,
          phone: deliveryInfo?.phone || null,
          email: deliveryInfo?.email || null,
          customer_type: 'retail',
        })
      });
      if (!custRes.ok) return;
      const custResult = await custRes.json();
      const newCustomer = custResult.customer || custResult;
      const customerId = newCustomer.id;
      if (!customerId) return;

      // 2. Link contact to new customer in DB
      const linkRes = await apiFetch('/api/chat/contacts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, platform: contactPlatform, customer_id: customerId })
      });
      if (!linkRes.ok) return;

      // 3. Update local state with customer info from create response
      const customerInfo = { id: customerId, name: newCustomer.name || customerName, customer_code: newCustomer.customer_code || '' };
      setSelectedContact(prev => prev && prev.id === contactId ? {
        ...prev, customer_id: customerId, customer: customerInfo
      } : prev);
      setContacts(prev => prev.map(c => c.id === contactId ? {
        ...c, customer_id: customerId, customer: customerInfo
      } : c));

      // 4. Update order with new customer_id
      await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, customer_id: customerId })
      });

      // 5. Re-fetch contacts from DB to ensure UI is in sync
      // (realtime subscription may have already fetched stale data before the link was saved)
      const refreshRes = await apiFetch(`/api/chat/contacts?limit=30&offset=0`);
      if (refreshRes.ok) {
        const refreshResult = await refreshRes.json();
        const refreshedContacts = refreshResult.contacts || [];
        setContacts(refreshedContacts);
        // Also update selectedContact with the fresh linked data
        const updated = refreshedContacts.find((c: UnifiedContact) => c.id === contactId);
        if (updated) setSelectedContact(updated);
      }

      // 6. ขอบเขตแท็กย้ายมาอยู่ที่ลูกค้าแล้ว — ตั้ง baseline ใหม่ (ลูกค้าเพิ่งสร้างจะได้ [])
      await refreshTagsForContact({ id: contactId, platform: contactPlatform, customer_id: customerId });
    } catch (error) {
      console.error('Error auto-creating customer:', error);
    } finally {
      autoCreateAndLinkCustomerRef.current = false;
    }
  };

  const handleOpenEditCustomer = () => {
    setEditCustomerError('');
    if (window.innerWidth < 768) setMobileView('edit-customer');
    else setRightPanel('edit-customer');
  };

  // Unlink customer from contact (ไม่ลบ customer)
  const handleUnlinkCustomer = async () => {
    if (!selectedContact?.customer) return;
    const ok = await confirm({ title: 'ยกเลิกการเชื่อมต่อลูกค้าจาก contact นี้?' }); if (!ok) return;

    try {
      const res = await apiFetch('/api/chat/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedContact.id, platform: selectedContact.platform, customer_id: null })
      });
      if (!res.ok) throw new Error('Failed to unlink');

      setSelectedContact(prev => prev ? { ...prev, customer_id: undefined, customer: undefined } : null);
      setContacts(prev => prev.map(c =>
        c.id === selectedContact.id ? { ...c, customer_id: undefined, customer: undefined } : c
      ));
      // ขอบเขตแท็กกลับมาเป็นระดับ contact — baseline ต้องเปลี่ยนตาม
      await refreshTagsForContact({ id: selectedContact.id, platform: selectedContact.platform, customer_id: null });
      setRightPanel(null);
      setMobileView('chat');
      showToast('ยกเลิกการเชื่อมต่อลูกค้าแล้ว');
    } catch (error) {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  };

  // Hard delete customer + unlink
  const handleDeleteCustomer = async () => {
    if (!selectedContact?.customer) return;
    const ok = await confirm({ title: `ลบลูกค้า "${selectedContact.customer.name}" ถาวร?`, description: 'ที่อยู่จัดส่งจะถูกลบ, ออเดอร์จะถูก unlink, contact จะกลับเป็นสถานะไม่มีลูกค้า', variant: 'danger' }); if (!ok) return;

    try {
      const res = await apiFetch(`/api/customers?id=${selectedContact.customer.id}&hard=true`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete');

      setSelectedContact(prev => prev ? { ...prev, customer_id: undefined, customer: undefined } : null);
      setContacts(prev => prev.map(c =>
        c.id === selectedContact.id ? { ...c, customer_id: undefined, customer: undefined } : c
      ));
      setRightPanel(null);
      setMobileView('chat');
      showToast('ลบลูกค้าแล้ว');
    } catch (error) {
      showToast('เกิดข้อผิดพลาดในการลบ', 'error');
    }
  };

  const handleUpdateCustomerInChat = async (formData: CustomerFormData, _resolvedId: string) => {
    if (!selectedContact?.customer) return;
    setEditingCustomer(true);
    setEditCustomerError('');
    try {
      const payload = buildCustomerPayload(formData, selectedContact.customer.id);

      const response = await apiFetch('/api/customers', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed'); }

      // Save tags — diff เท่านั้น: ฟอร์มนี้เปิดค้างได้นาน ถ้าส่งทั้งชุดทับ (PUT)
      // แท็กที่คนอื่นติดระหว่างนั้นจะหายไปทั้งที่ผู้ใช้ไม่ได้แตะแท็กเลย
      const customerId = selectedContact.customer.id;
      let tagBaseline: Tag[] | null =
        profileTagsServerKeyRef.current === contactTagKey(selectedContact) ? profileTagsServerRef.current : null;
      if (!tagBaseline) {
        // ปกติเข้าฟอร์มนี้ผ่านแผงโปรไฟล์ (baseline ถูก seed แล้ว) — กันเหนียวเผื่อเข้าทางอื่น
        try {
          tagBaseline = await fetchTagsFor({ id: selectedContact.id, platform: selectedContact.platform, customer_id: customerId });
        } catch {
          tagBaseline = [];
        }
      }
      let savedTags = profileTags;
      const returnedTags = await patchCustomerTags(customerId, diffTagIds(tagBaseline, profileTags));
      if (returnedTags) {
        savedTags = returnedTags;
        setTagBaseline(selectedContact, returnedTags);
      }

      const updatedCustomer = {
        ...selectedContact.customer, name: formData.name, contact_person: formData.contact_person,
        phone: formData.phone, email: formData.email,
        customer_type: formData.customer_type as 'retail' | 'wholesale' | 'distributor',
        billing_address: formData.billing_address,
        tax_id: formData.needs_tax_invoice ? formData.tax_id : '',
        tax_company_name: formData.needs_tax_invoice ? formData.tax_company_name : '',
        tax_branch: formData.needs_tax_invoice ? formData.tax_branch : '',
        credit_limit: formData.credit_limit, credit_days: formData.credit_days,
        notes: formData.notes, is_active: formData.is_active
      };
      setSelectedContact(prev => prev ? { ...prev, customer: updatedCustomer, tags: savedTags } : null);
      setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, customer: updatedCustomer, tags: savedTags } : c));
      setRightPanel('profile');
      setMobileView('chat');
    } catch (error) {
      console.error('Error updating customer:', error);
      setEditCustomerError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
      throw error;
    } finally {
      setEditingCustomer(false);
    }
  };

  const fetchOrderHistory = async (customerId: string) => {
    try {
      setLoadingHistory(true);
      // include_delivery = เอาที่อยู่ปลายทาง (เขต/จังหวัด) มาโชว์บนการ์ดประวัติ
      const response = await apiFetch(`/api/orders?customer_id=${customerId}&limit=20&include_delivery=true`);
      if (!response.ok) throw new Error('Failed');
      const result = await response.json();
      setOrderHistory(result.orders || []);
    } catch (error) {
      console.error('Error fetching order history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  /** เปิดบิลสำเร็จ = contact นี้ "เคยสั่ง" แน่นอน — patch state ทันทีไม่ต้องรอ refetch
   *  (ป้ายในลิสต์/หัวแชทอ่านจาก contact.last_order_* ซึ่ง enrich ตอนโหลด list เท่านั้น) */
  const markContactOrdered = (contactId: string) => {
    const now = new Date();
    const patch = {
      last_order_date: now.toISOString().split('T')[0],
      last_order_created_at: now.toISOString(),
      order_stats_loaded: true,
    };
    setSelectedContact(prev => (prev && prev.id === contactId ? { ...prev, ...patch } : prev));
    setContacts(prev => prev.map(c => (c.id === contactId ? { ...c, ...patch } : c)));
  };

  /** หลังบันทึกบิลจากแชท: ผูกลูกค้า (ถ้ายัง) → ดึง contacts ใหม่ให้ตรง DB → ย้ำป้าย "สั่งล่าสุด" */
  const handleBillSaved = async (orderId: string, customerId?: string, deliveryInfo?: { name?: string; phone?: string; email?: string }) => {
    const contact = selectedContact;
    if (!contact) return;
    markContactOrdered(contact.id);
    try {
      if (customerId && !contact.customer_id) {
        await linkCustomer(customerId);
      } else if (!customerId && !contact.customer_id) {
        await autoCreateAndLinkCustomer(orderId, deliveryInfo);
      }
      await fetchContacts();
    } catch (error) {
      console.error('Error refreshing contact after bill save:', error);
    } finally {
      // refetch อาจกลับมาก่อน DB enrich ทัน — เรารู้ว่าเพิ่งเปิดบิลจริง จึงย้ำอีกรอบ
      markContactOrdered(contact.id);
    }
  };

  /** ข้อความ "สั่งล่าสุด: ..." — คืน null เมื่อ **ไม่รู้** (โหมดค้นหาไม่ enrich)
   *  ห้ามเดาเป็น "ยังไม่เคยสั่ง" เพราะลูกค้าอาจมีออเดอร์อยู่จริง */
  const lastOrderLabel = (contact: UnifiedContact, withYear = false): string | null => {
    if (contact.last_order_date || contact.last_order_created_at) {
      const base = contact.last_order_created_at
        ? new Date(contact.last_order_created_at)
        : new Date(contact.last_order_date + 'T00:00:00');
      const date = base.toLocaleDateString('th-TH', withYear
        ? { day: 'numeric', month: 'short', year: '2-digit' }
        : { day: 'numeric', month: 'short' });
      const time = contact.last_order_created_at
        ? ' ' + new Date(contact.last_order_created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
        : '';
      return `สั่งล่าสุด: ${date}${time}`;
    }
    if (contact.order_stats_loaded === false) return null; // ไม่รู้ → ไม่แสดงอะไรเลย
    return 'ยังไม่เคยสั่ง';
  };

  const handleOpenHistory = () => {
    if (!selectedContact?.customer) return;
    if (window.innerWidth < 768) setMobileView('history');
    else setRightPanel(rightPanel === 'history' ? null : 'history');
    fetchOrderHistory(selectedContact.customer.id);
  };

  const handleOpenProfile = () => {
    if (!selectedContact) return;
    if (window.innerWidth < 768) setMobileView('profile');
    else setRightPanel(rightPanel === 'profile' ? null : 'profile');

    // วาดด้วย snapshot ของแถวก่อน (จอไม่ว่าง) แล้วดึงชุดจริงจากเซิร์ฟเวอร์มาทับ —
    // snapshot ถ่ายไว้ตอนโหลดลิสต์ อาจเก่ากว่าความจริง ถ้าเอาไปเป็น baseline ของ diff
    // การกดแท็กครั้งแรกจะไปลบแท็กที่คนอื่นเพิ่งติด
    const contact = selectedContact;
    setTagBaseline(contact, contact.tags || []);
    (async () => {
      try {
        const serverTags = await fetchTagsFor(contact);
        // สลับผู้ติดต่อไปแล้วระหว่างรอ = ทิ้งผลนี้ ห้ามเอาแท็กของคนก่อนหน้ามาทับ
        const cur = selectedContactRef.current;
        if (!cur || cur.id !== contact.id || cur.platform !== contact.platform) return;
        setTagBaseline(contact, serverTags);
      } catch {
        // คง snapshot ไว้เป็น baseline ต่อ (diff รอบหน้าจะได้มีอะไรอ้างอิง ไม่ใช่ลบทั้งชุด)
        showToast('โหลดแท็กล่าสุดไม่ได้', 'error');
      }
    })();
  };

  // Helper to render order card (used in both mobile and desktop history)
  const renderOrderCard = (order: any) => {
    const orderStatus = order.order_status || order.status;
    return (
      <div key={order.id} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:border-blue-300 transition-colors cursor-pointer"
        onClick={() => { setSelectedOrderId(order.id); if (window.innerWidth < 768) setMobileView('order-detail'); else setRightPanel('order-detail'); }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="font-medium text-gray-900 dark:text-white">{order.order_number}</span>
            {order.order_date && (<p className="text-xs text-gray-400 mt-0.5">เปิดบิล {new Date(order.created_at || order.order_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} {order.created_at && new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</p>)}
          </div>
          <div className="flex items-center gap-1">
            <StatusBadge status={orderStatus}>
              {orderStatus === 'completed' ? 'สำเร็จ' : orderStatus === 'new' ? 'ใหม่' : orderStatus === 'ready_to_ship' ? 'รอกดรับ' : orderStatus === 'processing' ? 'ที่ต้องจัดส่ง' : orderStatus === 'shipping' ? 'กำลังส่ง' : orderStatus === 'cancelled' ? 'ยกเลิก' : orderStatus}
            </StatusBadge>
            <StatusBadge status={order.payment_status} payment>
              {order.payment_status === 'paid' ? 'ชำระแล้ว' : order.payment_status === 'verifying' ? 'รอตรวจสอบ' : order.payment_status === 'cancelled' ? 'ยกเลิก' : 'รอชำระ'}
            </StatusBadge>
          </div>
        </div>
        {(() => {
          // ห้าง/ฝากขาย = ส่งหลายสาขาจริง → ชื่อสาขา (address_name) มีความหมาย
          const multiBranch = isDepartmentFlow(order.flow_type) || isConsignmentFlow(order.flow_type);
          if (multiBranch && order.branch_names?.length > 0) {
            return <div className="flex flex-wrap gap-1 mb-1.5">{order.branch_names.map((name: string, idx: number) => (<span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">{name}</span>))}</div>;
          }
          // ปลีก: address_name เป็นชื่อทั่วไป ("ที่อยู่หลัก") ไม่บอกอะไร → สรุปปลายทางจริงแทน
          const area = [order.delivery_amphoe || order.delivery_district, order.delivery_province]
            .filter((v: string | null | undefined, i: number, arr: (string | null | undefined)[]) => v && arr.indexOf(v) === i)
            .join(' · ');
          const recipient = order.delivery_name && order.delivery_name !== (selectedContact?.customer?.name || '')
            ? order.delivery_name : '';
          if (!area && !recipient) return null;
          return (
            <div className="flex flex-wrap items-center gap-1 mb-1.5">
              {recipient && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400"><User className="w-3 h-3" />{recipient}</span>}
              {area && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"><MapPin className="w-3 h-3" />{area}</span>}
            </div>
          );
        })()}
        <div className="text-sm text-gray-500 dark:text-slate-400">
          <div className="flex items-center justify-between">
            <span>{order.delivery_date ? `จัดส่ง ${new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}` : ''}</span>
            <span className="font-medium text-gray-900 dark:text-white">฿{formatPrice(order.total_amount)}</span>
          </div>
        </div>
      </div>
    );
  };

  // Helper to save tags (works for both customer and contact)
  //
  // ส่งเฉพาะ "ส่วนต่าง" ไม่ใช่ทั้งชุด — กดติดแท็ก 1 ตัวต้องแตะแค่ตัวนั้น
  // NOTE: `tags` ของแถวในลิสต์ที่ /api/chat/contacts ส่งมา = แท็กของลูกค้า ∪ แท็กระดับ contact
  // หลัง PATCH ฝั่งลูกค้า เราแปะกลับเฉพาะชุดของลูกค้า → แท็กระดับ contact (ถ้ามี) จะหายจาก
  // แถวชั่วคราวและกลับมาเองตอนดึงลิสต์รอบหน้า — ยอมรับได้ เพราะสำคัญกว่าคือแท็กไม่หายจริงใน DB
  const handleSaveProfileTags = async (newTags: Tag[]) => {
    if (!selectedContact) { setProfileTags(newTags); return; }
    const contact = selectedContact;
    const baseline = profileTagsServerKeyRef.current === contactTagKey(contact)
      ? profileTagsServerRef.current
      : (contact.tags || []);
    const diff = diffTagIds(baseline, newTags);

    setProfileTags(newTags); // optimistic — เห็นผลทันทีระหว่างรอเซิร์ฟเวอร์
    if (diff.add.length === 0 && diff.remove.length === 0) return;

    try {
      const returned = contact.customer_id
        ? await patchCustomerTags(contact.customer_id, diff)
        : await patchContactTags(contact.id, contact.platform, diff);
      if (returned) applyServerTags(contact, returned);
    } catch (error) {
      setProfileTags(baseline); // ล้มแล้วต้องกลับไปตรงกับความจริงฝั่งเซิร์ฟเวอร์
      showToast(error instanceof Error ? error.message : 'ไม่สามารถบันทึกแท็กได้', 'error');
    }
  };

  // Helper to render customer profile content
  const renderCustomerProfile = () => {
    if (!selectedContact) return null;

    const c = selectedContact.customer;
    const displayName = c?.name || selectedContact.display_name;
    const customerType = c?.customer_type;

    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-4">
        {/* Name + type badge */}
        <div className="pb-3 border-b border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{displayName}</h3>
          {customerType && (
            <StatusBadge status={customerType} className="mt-1.5" colors={customerType === 'retail' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' : customerType === 'wholesale' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400' : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'}>
              {customerType === 'retail' ? 'ลูกค้าปลีก' : customerType === 'wholesale' ? 'ลูกค้าส่ง' : 'ตัวแทนจำหน่าย'}
            </StatusBadge>
          )}
          {!c && <p className="text-sm text-gray-400 mt-1">ยังไม่ได้เชื่อมกับลูกค้า</p>}
        </div>

        {/* Tags */}
        <div className="pb-3 border-b border-gray-100 dark:border-slate-700">
          <label className="text-base font-medium text-gray-700 dark:text-slate-300 mb-1.5 block">แท็ก</label>
          <TagInput
            value={profileTags}
            onChange={handleSaveProfileTags}
            allTags={allTags}
            onTagCreated={(tag) => setAllTags(prev => [...prev, tag])}
            size="sm"
          />
        </div>

        {/* Shipping addresses */}
        {c && profileAddresses.length > 0 && (
          <div className="pb-3 border-b border-gray-100 dark:border-slate-700">
            <label className="text-base font-medium text-gray-700 dark:text-slate-300 mb-1.5 block">ที่อยู่จัดส่ง</label>
            <div className="space-y-2">
              {profileAddresses.filter((a: any) => a.is_active !== false).map((addr: any) => (
                <div key={addr.id} className="p-2.5 rounded-lg bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-600">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{addr.address_name || 'ที่อยู่'}</span>
                    {addr.is_default && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">หลัก</span>}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-slate-400">
                    {[addr.address_line1, addr.district, addr.amphoe, addr.province, addr.postal_code].filter(Boolean).join(' ')}
                  </p>
                  {addr.contact_person && <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{addr.contact_person} {addr.phone ? `• ${addr.phone}` : ''}</p>}
                  {addr.delivery_notes && <p className="text-xs text-gray-400 mt-0.5">📝 {addr.delivery_notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Billing address (tax) */}
        {c && (c.billing_address || c.billing_province) && (
          <div className="pb-3 border-b border-gray-100 dark:border-slate-700">
            <label className="text-base font-medium text-gray-700 dark:text-slate-300 mb-1.5 block">ที่อยู่ออกบิล</label>
            <p className="text-sm text-gray-600 dark:text-slate-400">{[c.billing_address, c.billing_district, c.billing_amphoe, c.billing_province, c.billing_postal_code].filter(Boolean).join(' ')}</p>
          </div>
        )}

        {/* Linked chat channels */}
        <div className="pb-3 border-b border-gray-100 dark:border-slate-700">
          <label className="text-base font-medium text-gray-700 dark:text-slate-300 mb-1.5 block">ช่องทางแชท</label>
          {linkedContacts.length > 0 ? (
            <div className="space-y-1.5">
              {linkedContacts.map(lc => {
                const isCurrentContact = lc.id === selectedContact.id && lc.platform === selectedContact.platform;
                return (
                  <button
                    key={`${lc.platform}-${lc.id}`}
                    onClick={() => {
                      if (!isCurrentContact) {
                        const found = contacts.find(ct => ct.id === lc.id && ct.platform === lc.platform);
                        if (found) setSelectedContact(found);
                      }
                    }}
                    className={`w-full flex items-center gap-2 p-1.5 rounded-md text-left transition-colors ${isCurrentContact ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-700' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}
                  >
                    <div className="relative flex-shrink-0">
                      {lc.picture_url ? (
                        <img src={lc.picture_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center"><User className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" /></div>
                      )}
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center ${lc.platform === 'line' ? 'bg-line' : lc.platform === 'shopee' ? 'bg-[#EE4D2D]' : lc.platform === 'lazada' ? 'bg-[#0F146E]' : lc.platform === 'tiktok' ? 'bg-[#161823]' : 'bg-facebook'}`}>
                        {lc.platform === 'line' ? <LineIcon size={8} /> : lc.platform === 'shopee' ? <ShopeeIcon size={8} /> : lc.platform === 'lazada' ? <LazadaIcon size={8} /> : lc.platform === 'tiktok' ? <TiktokIcon size={8} /> : <FbIcon size={8} />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{lc.display_name}</p>
                      {lc.account_name && <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{lc.account_name}</p>}
                    </div>
                    {isCurrentContact && <span className="text-xs text-blue-500 dark:text-blue-400 flex-shrink-0">ปัจจุบัน</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-1.5">
              <PlatformIcon contact={selectedContact} size={14} />
              <span className="text-sm text-gray-700 dark:text-slate-300">{selectedContact.display_name}</span>
            </div>
          )}
        </div>

        {/* Contact info */}
        {c && (c.contact_person || c.phone) && (
          <div className="pb-3 border-b border-gray-100 dark:border-slate-700 space-y-2">
            {c.contact_person && (
              <div>
                <label className="text-base font-medium text-gray-700 dark:text-slate-300 mb-0.5 block">ผู้ติดต่อ</label>
                <p className="text-sm text-gray-900 dark:text-white">{c.contact_person}</p>
              </div>
            )}
            {c.phone && (
              <div>
                <label className="text-base font-medium text-gray-700 dark:text-slate-300 mb-0.5 block">เบอร์โทร</label>
                <a href={`tel:${c.phone}`} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{c.phone}</a>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {c?.notes && (
          <div>
            <label className="text-base font-medium text-gray-700 dark:text-slate-300 mb-0.5 block">หมายเหตุ</label>
            <p className="text-sm text-gray-600 dark:text-slate-400 whitespace-pre-wrap">{c.notes}</p>
          </div>
        )}
      </div>
    );
  };

  // Helper: edit customer form initial data
  const editCustomerInitialData = selectedContact?.customer ? {
    name: selectedContact.customer.name || '', contact_person: selectedContact.customer.contact_person || '',
    phone: selectedContact.customer.phone || '', email: selectedContact.customer.email || '',
    customer_type: selectedContact.customer.customer_type || 'retail',
    credit_limit: selectedContact.customer.credit_limit || 0, credit_days: selectedContact.customer.credit_days || 0,
    is_active: selectedContact.customer.is_active ?? true, notes: selectedContact.customer.notes || '',
    needs_tax_invoice: !!selectedContact.customer.tax_id, tax_id: selectedContact.customer.tax_id || '',
    tax_company_name: selectedContact.customer.tax_company_name || '', tax_branch: selectedContact.customer.tax_branch || 'สำนักงานใหญ่',
    billing_address: [selectedContact.customer.billing_address, selectedContact.customer.billing_district, selectedContact.customer.billing_amphoe, selectedContact.customer.billing_province, selectedContact.customer.billing_postal_code].filter(Boolean).join(' '),
    shipping_address: '', shipping_district: '', shipping_amphoe: '',
    shipping_province: '', shipping_postal_code: '',
    shipping_google_maps_link: '', shipping_delivery_notes: ''
  } : undefined;

  // เคลียร์ "ยังไม่อ่าน" ทั้งชุด — ตามตัวกรองช่องทางที่เลือกอยู่
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const markAllRead = useCallback(async () => {
    const scope = filterAccountId
      ? 'ช่องทางที่เลือกอยู่'
      : filterPlatform !== 'all' ? `ช่องทาง ${filterPlatform}` : 'ทุกช่องทาง';
    const ok = await confirm({
      title: 'ทำเครื่องหมายว่าอ่านแล้วทั้งหมด?',
      description: `ล้างตัวเลขยังไม่อ่านของ${scope} — ข้อความยังอยู่ครบ แค่เลิกนับว่ายังไม่ได้อ่าน · ย้อนกลับไม่ได้`,
      confirmLabel: 'อ่านทั้งหมด',
    });
    if (!ok) return;
    setMarkingAllRead(true);
    try {
      const res = await apiFetch('/api/chat/contacts/read-all', {
        method: 'POST',
        body: JSON.stringify({
          ...(filterAccountId ? { account_id: filterAccountId } : {}),
          ...(filterPlatform !== 'all' ? { platform: filterPlatform } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'ล้างไม่สำเร็จ');
      showToast(`ล้างแล้ว ${data.cleared || 0} แชท`);
      // sidebar/กระดิ่งอ่านตัวเลขจาก /api/header/summary ซึ่งปกติรีเฟรชตาม realtime ของตาราง
      // contacts — แต่การล้างทีเดียวหลายพันแถว Supabase Realtime **ทิ้ง event ก้อนใหญ่** ได้
      // (ผู้ใช้กดอ่านทั้งหมดแล้วเลขที่ sidebar ค้าง 4 ก.ย. 2026) → สั่งรีเฟรชตรง ๆ เสมอ
      await Promise.all([fetchContacts(), refreshHeaderSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ล้างไม่สำเร็จ', 'error');
    } finally {
      setMarkingAllRead(false);
    }
  }, [confirm, filterAccountId, filterPlatform, showToast, refreshHeaderSummary]);

  // ── ย้อนกลับจากหน้าคุย → รายชื่อแชท ──
  //
  // ⚠️ **ห้ามเขียนท่าปัดขวาเอง** — เคยทำแล้วมันไป**ชนกับท่า back ของระบบ** (iOS/Android
  // มีท่าปัดกลับของตัวเองในแอปที่ติดตั้ง) ผลคือปัดทีเดียวเกิดสองอย่าง: ของเราพากลับ
  // รายชื่อ ส่วนของระบบถอย history จริงไปหน้าก่อนหน้า = เด้งออกไป /dashboard
  // (เจอจริง 4 ก.ย. 2026 — ดู fix-bug.md)
  //
  // ทางที่ถูกคือ **ทำให้การเปิดแชทเป็นหนึ่งขั้นใน history จริง ๆ** แล้วท่าปัดของระบบ
  // (และปุ่ม back ของ Android / ปุ่มย้อนกลับของเบราว์เซอร์) จะพากลับรายชื่อเองทั้งหมด
  // โดยไม่ต้องเขียน gesture สักบรรทัด
  const backToContacts = useCallback(() => {
    setSelectedContact(null);
    setMobileView('contacts');
  }, []);

  // เปิดหน้าคุยบนมือถือ = ดันหนึ่งขั้นเข้า history (URL เท่าเดิม — Next 16 รองรับการ
  // เรียก history.pushState ตรง ๆ โดยยังคง state ภายในของ router ไว้ให้)
  useEffect(() => {
    if (mobileView !== 'chat') return;
    if (typeof window === 'undefined' || window.innerWidth >= 768) return;
    if ((window.history.state as { aooChatOpen?: boolean } | null)?.aooChatOpen) return;
    window.history.pushState({ ...window.history.state, aooChatOpen: true }, '');
  }, [mobileView]);

  // ระบบพาถอยกลับมา (ปัดขวา / ปุ่ม back) → ปิดหน้าคุย
  useEffect(() => {
    const onPopState = () => {
      if (mobileViewRef.current !== 'contacts') backToContacts();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [backToContacts]);

  // ปุ่มย้อนกลับในหัวแชทต้องเดินผ่านทางเดียวกับท่าปัด ไม่งั้นขั้นที่ดันไว้จะค้าง
  // แล้วกด back ครั้งถัดไปจะกระเด็นออกจากหน้าแชทไปเลย
  const handleBackTap = useCallback(() => {
    if ((window.history.state as { aooChatOpen?: boolean } | null)?.aooChatOpen) window.history.back();
    else backToContacts();
  }, [backToContacts]);

  // ⚠️ early return ต้องอยู่หลัง hooks ทุกตัว — เคยวางไว้กลางไฟล์แล้ว hooks ที่เพิ่มทีหลัง
  // ไปอยู่ใต้มัน → ลำดับ hooks เปลี่ยนตอน authLoading พลิกจาก true เป็น false (4 ก.ย. 2026)
  if (authLoading) {
    return <Layout><LoadingCard /></Layout>;
  }

  return (
    <Layout noPadding>
      {/* ระยะขอบเดสก์ท็อปเป็น padding ของตัวครอบ (ไม่ใช่ margin ของ .chat-container)
          — margin จะทะลุตัวครอบ h-full ออกไปทำให้ main สูงเกินแล้วเลื่อนได้อีก */}
      <div className="h-full md:p-6">
      <div className="chat-container flex relative bg-white dark:bg-slate-800 md:rounded-lg md:border border-gray-200 dark:border-slate-700 overflow-hidden">
        {/* Contacts Sidebar */}
        <div className={`w-full md:w-80 border-r border-gray-200 dark:border-slate-700 flex flex-col ${mobileView !== 'contacts' ? 'hidden md:flex' : 'flex'} ${rightPanel ? 'md:hidden xl:flex' : ''}`}>
          {/* Header */}
          <div className="p-3 md:p-4 border-b border-gray-200 dark:border-slate-700">
            {/* Row 1: หัวข้อ + ตัวเลขยังไม่อ่านรวม | เรียง · เฉพาะยังไม่อ่าน · กรอง */}
            <div className="flex items-center gap-2 mb-2">
              {/* ตัวเลขยังไม่อ่านโชว์เต็มจำนวนติดหัวข้อ (ไม่ตัดเป็น "9+") — เป็นที่เดียวที่บอกยอดรวม
                  ทุกขนาดจอแล้ว หลังยุบแถวหัวข้อของเดสก์ท็อปทิ้ง */}
              <h2 className="flex-1 min-w-0 flex items-center gap-1.5 text-lg font-semibold text-gray-900 dark:text-white">
                <MessageCircle className="w-5 h-5 text-primary flex-shrink-0" />
                แชท
                {totalUnread > 0 && (
                  <span className="bg-red-500 text-white text-xs font-medium leading-none px-1.5 py-1 rounded-full">{formatNumber(totalUnread)}</span>
                )}
              </h2>
              <Tooltip text={sortMode === 'time' ? 'เรียงตามเวลา (กดเพื่อเรียงยังไม่อ่านก่อน)' : 'เรียงยังไม่อ่านก่อน (กดเพื่อเรียงตามเวลา)'}>
                <button onClick={() => setFilterParams({ sort: sortMode === 'time' ? 'unread' : 'time' })}
                  aria-label={sortMode === 'time' ? 'เรียงตามเวลา' : 'เรียงยังไม่อ่านก่อน'}
                  className={`h-[42px] w-[42px] flex-shrink-0 flex items-center justify-center border rounded-lg transition-colors ${sortMode === 'unread' ? 'bg-red-500 border-red-500 text-white' : 'border-gray-300 dark:border-slate-500 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700'}`}>
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </Tooltip>
              <Tooltip text={totalUnread > 0 ? `เฉพาะยังไม่อ่าน (${formatNumber(totalUnread)} ข้อความ)` : 'เฉพาะยังไม่อ่าน'}>
                <button onClick={() => setFilterParams({ unread: filterUnread ? '' : '1' })}
                  aria-label="เฉพาะยังไม่อ่าน"
                  className={`h-[42px] w-[42px] flex-shrink-0 flex items-center justify-center border rounded-lg transition-colors ${filterUnread ? 'bg-red-500 border-red-500 text-white' : 'border-gray-300 dark:border-slate-500 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700'}`}>
                  {/* ซองจดหมาย = ยังไม่อ่าน (ไอคอนแชทกลม ๆ ซ้ำกับไอคอนหัวข้อหน้า สื่อไม่ออกว่าเป็นตัวกรอง) ·
                      ไม่ต้องมีตัวเลขซ้อนบนปุ่ม — ยอดเต็มอยู่ข้างหัวข้อ "แชท" และใน tooltip แล้ว */}
                  <Mail className="w-4 h-4" />
                </button>
              </Tooltip>
              <div className="relative h-[42px]" data-filter-popover>
                <Tooltip text="กรองรายชื่อ">
                  <button onClick={() => setShowFilterPopover(!showFilterPopover)}
                    aria-label="กรองรายชื่อ"
                    className={`h-full w-[42px] flex items-center justify-center border rounded-lg transition-colors ${hasActiveFilter ? 'bg-primary border-primary text-white' : 'border-gray-300 dark:border-slate-500 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700'}`}>
                    <Filter className="w-5 h-5" />
                  </button>
                </Tooltip>
                {showFilterPopover && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
                    <div className="p-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                      <span className="text-base font-medium text-gray-900 dark:text-white">กรองรายชื่อ</span>
                      {hasActiveFilter && (<button onClick={() => { setFilterParams({ linked: 'all', tag: '', account: '', platform: 'all', sort: 'time', unread: '' }); setFilterOrderDaysRange(null); setShowFilterPopover(false); }} className="text-xs text-red-500 hover:text-red-600">ล้างทั้งหมด</button>)}
                    </div>
                    <div className="p-3 space-y-4">
                      <div>
                        <label className="text-base font-medium text-gray-600 dark:text-slate-400 mb-2 block">สถานะลูกค้า</label>
                        <div className="flex gap-2">
                          <button onClick={() => { setFilterParams({ linked: filterLinked === 'linked' ? 'all' : 'linked' }); setShowFilterPopover(false); }} className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors flex items-center justify-center gap-1 ${filterLinked === 'linked' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}><UserCheck className="w-4 h-4" /><span>ซื้อแล้ว</span></button>
                          <button onClick={() => { const next = filterLinked === 'unlinked' ? 'all' : 'unlinked'; setFilterParams({ linked: next }); if (next === 'unlinked') setFilterOrderDaysRange(null); setShowFilterPopover(false); }} className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors flex items-center justify-center gap-1 ${filterLinked === 'unlinked' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}><UserX className="w-4 h-4" /><span>ยังไม่ซื้อ</span></button>
                        </div>
                      </div>
                      {/* Tag filter */}
                      {allTags.length > 0 && (
                        <div>
                          <label className="text-base font-medium text-gray-600 dark:text-slate-400 mb-2 block">แท็ก</label>
                          <div className="flex flex-wrap gap-1">
                            <button onClick={() => { setFilterParams({ tag: '' }); setShowFilterPopover(false); }}
                              className={`px-2 py-1 text-sm rounded-lg transition-colors ${filterTag === '' ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}>ทั้งหมด</button>
                            {allTags.map(tag => {
                              const isActive = filterTag === tag.id;
                              return (
                                <button key={tag.id} onClick={() => { setFilterParams({ tag: isActive ? '' : tag.id }); setShowFilterPopover(false); }}
                                  className={`px-2 py-1 text-sm rounded-lg transition-colors flex items-center gap-1 ${isActive ? 'text-white' : 'hover:opacity-80'}`}
                                  style={isActive ? { backgroundColor: tag.color } : { backgroundColor: tag.color + '20', color: tag.color }}>
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isActive ? 'white' : tag.color }} />
                                  {tag.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* บางแพลตฟอร์มบอกเราไม่ได้ว่าแอดมินไปตอบจากแอปของมันเอง (LINE ไม่มี event ทั้งขาส่ง
                        และขาอ่าน) ตัวเลขยังไม่อ่านจึงค้างได้ — ที่นี่คือที่เดียวที่ล้างเองได้แล้ว จึงต้องโชว์ทุกจอ */}
                    {totalUnread > 0 && (
                      // เป็นลิงก์ข้อความ ไม่ใช่ปุ่มกรอบ — ในเมนูนี้กรอบเทาดูไม่ออกว่ากดได้ ·
                      // ระหว่างทำงานใช้ LoadingOverlay (popover ปิดไปแล้ว spinner ในนี้ไม่มีใครเห็น)
                      <div className="p-3 border-t border-gray-100 dark:border-slate-700 text-center">
                        <button type="button" onClick={() => { setShowFilterPopover(false); markAllRead(); }} disabled={markingAllRead}
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline disabled:opacity-50">
                          <CheckCheck className="w-4 h-4" />
                          อ่านทั้งหมด (ยังไม่อ่าน {formatNumber(totalUnread)})
                        </button>
                      </div>
                    )}
                    {/* ไม่มีปุ่มปิด — เลือกแล้วปิดเอง / แตะข้างนอกก็ปิด
                        (ตัวเลือกมีแค่ 2–3 ตัว กดทีละอันแล้วดูผลทันทีดีกว่า) */}
                  </div>
                )}
              </div>
            </div>
            {/* Row 2: ช่องทาง | ค้นหา — อยู่แถวเดียวกันตามที่ผู้ใช้ขอ (ประหยัดที่แนวตั้งบนมือถือ) */}
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0" data-account-picker>
                {(() => {
                  const selectedAccount = filterAccountId ? chatAccounts.find(a => a.id === filterAccountId) : null;
                  const selectedPic = selectedAccount ? getAccountPicture(selectedAccount) : null;
                  const filteredAccounts = accountSearch ? chatAccounts.filter(a => a.account_name.toLowerCase().includes(accountSearch.toLowerCase())) : chatAccounts;

                  return (
                    <>
                      <button onClick={() => { setShowAccountPicker(!showAccountPicker); if (showAccountPicker) setAccountSearch(''); }}
                        className="w-full h-[42px] flex items-center gap-2 px-2.5 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                        {selectedAccount ? (
                          <>
                            <ChannelBadge channel={{ platform: selectedAccount.platform, picture_url: selectedPic }} />
                            <span className="flex-1 text-left text-gray-900 dark:text-white truncate text-sm">{selectedAccount.account_name}</span>
                          </>
                        ) : (
                          <span className="flex-1 text-left text-gray-700 dark:text-slate-300 text-sm">ทุกช่องทาง</span>
                        )}
                        {loadingContacts ? (
                          <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin flex-shrink-0" />
                        ) : (
                          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${showAccountPicker ? 'rotate-180' : ''}`} />
                        )}
                      </button>
                      {showAccountPicker && (
                        // ปุ่มอยู่ริมซ้ายของแถวแล้ว (ครึ่งซ้าย) — ป๊อปอัปจึงกางได้เต็มความกว้างแถบ
                        // 288px = ความกว้างในของ sidebar บนเดสก์ท็อป · มือถือเผื่อขอบจอ 1.5rem
                        <div className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50 max-h-60 overflow-hidden flex flex-col" style={{ width: 'min(calc(100vw - 1.5rem), 288px)' }}>
                          <div className="p-2 border-b border-gray-100 dark:border-slate-700">
                            <input type="text" value={accountSearch} onChange={e => setAccountSearch(e.target.value)} placeholder="ค้นหาบัญชี..." autoFocus
                              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary" />
                          </div>
                          <div className="overflow-y-auto py-1">
                            {!accountSearch && (
                              <button onClick={() => { setFilterParams({ platform: 'all', account: '' }); setShowAccountPicker(false); setAccountSearch(''); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${!filterAccountId && filterPlatform === 'all' ? 'bg-gray-50 dark:bg-slate-700' : ''}`}>
                                <MessageCircle className="w-5 h-5 text-gray-400" />
                                <span className="text-gray-900 dark:text-white">ทุกช่องทาง</span>
                                {!filterAccountId && filterPlatform === 'all' && <Check className="w-4 h-4 text-primary ml-auto" />}
                              </button>
                            )}
                            {filteredAccounts.map(acc => {
                              const pic = getAccountPicture(acc);
                              const isActive = filterAccountId === acc.id;
                              return (
                                <button key={acc.id} onClick={() => { setFilterParams({ account: acc.id, platform: '' }); setShowAccountPicker(false); setAccountSearch(''); }}
                                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${isActive ? 'bg-gray-50 dark:bg-slate-700' : ''}`}>
                                  <ChannelBadge channel={{ platform: acc.platform, picture_url: pic }} />
                                  <span className="text-gray-900 dark:text-white truncate flex-1 text-left">{acc.account_name}</span>
                                  {acc.platform === 'line' ? <LineIcon size={16} /> : acc.platform === 'shopee' ? <ShopeeIcon size={16} /> : acc.platform === 'lazada' ? <LazadaIcon size={16} /> : acc.platform === 'tiktok' ? <TiktokIcon size={16} /> : acc.credentials?.ig_account_id ? (
                                    <span className="relative inline-flex w-6 h-[18px] flex-shrink-0">
                                      <span className="absolute left-[10px] top-0 z-0 rounded-full bg-white dark:bg-slate-800 p-[1px]"><IgIcon size={14} /></span>
                                      <span className="absolute left-0 top-0 z-10 rounded-full bg-white dark:bg-slate-800 p-[1px]"><FbIcon size={14} /></span>
                                    </span>
                                  ) : <FbIcon size={16} />}
                                  {isActive && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                                </button>
                              );
                            })}
                            {filteredAccounts.length === 0 && (
                              <div className="px-3 py-2 text-sm text-gray-400 dark:text-slate-500 text-center">ไม่พบบัญชี</div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="relative flex-1 min-w-0">
                {/* ⚠️ ห้ามส่ง h-[..] มา override — SearchInput สูง 42px อยู่แล้ว และการส่ง
                    ความสูงคนละค่ามาทับทำให้ "ค่าไหนชนะ" ขึ้นกับลำดับที่ Tailwind สร้าง CSS
                    (specificity เท่ากัน) = ความสูงเดาไม่ได้ · ทุกช่องในแถบกรองนี้ใช้ 42px เท่ากันหมด */}
                <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="ค้นหาชื่อ / แท็ก" />
                {searchTerm.length >= 1 && !filterTag && (() => {
                  const q = searchTerm.toLowerCase();
                  const matchedTags = allTags.filter(t => t.name.toLowerCase().includes(q));
                  if (matchedTags.length === 0) return null;
                  return (
                    // ช่องค้นหาเหลือครึ่งแถว — รายการแท็กจึงยึดขอบขวาแล้วกางย้อนไปทางซ้ายเต็มแถว
                    <div className="absolute z-50 top-full right-0 mt-1 w-[min(18rem,calc(100vw-1.5rem))] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                      <div className="px-3 py-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">แท็ก</div>
                      {matchedTags.slice(0, 5).map(tag => (
                        <button key={tag.id} onClick={() => { setFilterParams({ tag: tag.id }); setSearchTerm(''); }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-left">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                          <span className="text-sm text-gray-700 dark:text-slate-300">tag:</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{tag.name}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
            {/* Active filters display */}
            {hasActiveFilter && (
              <div className="flex flex-wrap items-center gap-1 mt-2">
                {filterLinked === 'linked' && !filterOrderDaysRange && (<span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full"><UserCheck className="w-3 h-3" />ซื้อแล้ว<button onClick={() => setFilterParams({ linked: 'all' })} className="ml-1 hover:text-blue-900"><X className="w-3 h-3" /></button></span>)}
                {filterLinked === 'unlinked' && (<span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full"><UserX className="w-3 h-3" />ยังไม่ซื้อ<button onClick={() => setFilterParams({ linked: 'all' })} className="ml-1 hover:text-orange-900"><X className="w-3 h-3" /></button></span>)}

                {filterOrderDaysRange !== null && (<span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${filterOrderDaysRange.min >= 7 ? 'bg-red-100 text-red-700' : filterOrderDaysRange.min >= 5 ? 'bg-orange-100 text-orange-700' : filterOrderDaysRange.min >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700'}`}><Clock className="w-3 h-3" />ไม่สั่ง {filterOrderDaysRange.max === null ? `${filterOrderDaysRange.min}+ วัน` : `${filterOrderDaysRange.min}-${filterOrderDaysRange.max} วัน`}<button onClick={() => { setFilterOrderDaysRange(null); setFilterParams({ linked: 'all' }); }} className="ml-1 hover:opacity-70"><X className="w-3 h-3" /></button></span>)}
                {filterTag && (() => { const tag = allTags.find(t => t.id === filterTag); return tag ? (<span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: tag.color + '20', color: tag.color }}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />{tag.name}<button onClick={() => setFilterParams({ tag: '' })} className="ml-1 hover:opacity-70"><X className="w-3 h-3" /></button></span>) : null; })()}
                <button onClick={() => { setFilterParams({ account: '', platform: 'all', tag: '', sort: 'time', linked: 'all', unread: '' }); setFilterOrderDaysRange(null); setSearchTerm(''); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-red-500 hover:text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <FilterX className="w-3 h-3" />ล้างตัวกรอง
                </button>
              </div>
            )}
          </div>

          {/* Contacts List — overscroll-contain กันลากสุดรายชื่อแล้ว main เด้งตาม */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {loadingContacts ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-slate-400"><MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" /><p>ยังไม่มีข้อความ</p></div>
            ) : (
              <>
                {(() => {
                  const sorted = sortMode === 'unread'
                    ? [...contacts].sort((a, b) => {
                        const aUnread = (a.unread_count || 0) > 0 ? 1 : 0;
                        const bUnread = (b.unread_count || 0) > 0 ? 1 : 0;
                        if (bUnread !== aUnread) return bUnread - aUnread;
                        return new Date(b.last_message_at || '').getTime() - new Date(a.last_message_at || '').getTime();
                      })
                    : contacts;
                  return sorted;
                })().map((contact) => (
                  <button key={contact.id} onClick={() => setSelectedContact(contact)}
                    className={`w-full px-3 py-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors border-b border-gray-100 dark:border-slate-700 ${selectedContact?.id === contact.id ? (contact.platform === 'line' ? 'bg-line/10' : contact.platform === 'shopee' ? 'bg-[#EE4D2D]/10' : contact.platform === 'lazada' ? 'bg-[#0F146E]/10' : contact.platform === 'tiktok' ? 'bg-[#161823]/10' : 'bg-facebook/10') : ''}`}>
                    {/* Avatar with channel profile badge */}
                    <div className="relative flex-shrink-0">
                      {getAvatarUrl(contact) ? (
                        <img src={getAvatarUrl(contact)!} alt={contact.display_name} loading="lazy" className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm" style={{ backgroundColor: contact.source === 'instagram' ? '#E4405F' : contact.platform === 'line' ? '#06C755' : contact.platform === 'shopee' ? '#EE4D2D' : contact.platform === 'lazada' ? '#0F146E' : contact.platform === 'tiktok' ? '#161823' : '#1877F2' }}>
                          {getInitials(contact.display_name)}
                        </div>
                      )}
                      {/* Channel profile pic badge (bottom-left) */}
                      <AccountCornerBadge contact={contact} sizeClass="w-5 h-5" />
                      {/* Linked customer indicator */}
                      {contact.customer && (<span className="absolute -bottom-0.5 -right-0.5 bg-blue-500 text-white w-4 h-4 rounded-full flex items-center justify-center shadow-sm border border-white dark:border-slate-800"><LinkIcon className="w-2.5 h-2.5" /></span>)}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 dark:text-white truncate">{contact.display_name}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-xs text-gray-400 dark:text-slate-500">{formatLastMessage(contact.last_message_at)}</span>
                          {contact.unread_count > 0 && (<span className="bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">{contact.unread_count > 99 ? '99+' : contact.unread_count}</span>)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <PlatformIcon contact={contact} size={12} />
                        {contact.account_name && (<span className="text-xs text-gray-400 dark:text-slate-300 truncate">{contact.account_name}</span>)}
                      </div>
                      {contact.last_message ? (
                        <div className="text-sm font-sarabun text-gray-500 dark:text-slate-400 truncate mt-0.5">{contact.last_message}</div>
                      ) : contact.customer ? (
                        <div className="text-xs truncate flex items-center gap-1 mt-0.5" style={{ color: contact.source === 'instagram' ? '#E4405F' : contact.platform === 'line' ? '#06C755' : contact.platform === 'shopee' ? '#EE4D2D' : contact.platform === 'lazada' ? '#0F146E' : contact.platform === 'tiktok' ? '#161823' : '#1877F2' }}>
                          <LinkIcon className="w-3 h-3" />{contact.customer.customer_code} - {contact.customer.name}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">ยังไม่มีข้อความ</div>
                      )}
                      {/* Tags */}
                      {contact.tags && contact.tags.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {contact.tags.slice(0, 3).map(tag => (
                            <TagBadge key={tag.id} tag={tag} size="sm" />
                          ))}
                          {contact.tags.length > 3 && <span className="text-[10px] text-gray-400">+{contact.tags.length - 3}</span>}
                        </div>
                      )}
                      {filterLinked === 'linked' && lastOrderLabel(contact) && (
                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {lastOrderLabel(contact)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
                <div ref={contactsEndRef} className="py-2">
                  {loadingMoreContacts && (<div className="flex items-center justify-center py-2"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>)}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`flex-col relative ${mobileView === 'chat' ? 'flex' : 'hidden md:flex'} ${rightPanel ? 'w-full md:w-[340px] xl:w-[420px]' : 'flex-1'}`}>
          {selectedContact ? (
            <>
              {/* Chat Header */}
              <div className="px-2 py-2 md:p-4 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2 md:gap-3">
                <button onClick={handleBackTap} aria-label="กลับไปรายชื่อแชท" className="md:hidden p-1 text-gray-500 hover:text-gray-700 flex-shrink-0"><ChevronLeft className="w-5 h-5" /></button>
                  {(() => {
                    const avatar = getAvatarUrl(selectedContact);
                    // รูปลูกค้า + **โลโก้ช่องทางที่คุยอยู่** ซ้อนมุมล่างซ้าย — ชุดเดียวกับในรายชื่อแชท
                    // (เดิมหัวแชทบอกที่มาด้วยตัวหนังสือจาง ๆ บรรทัดเดียว ซึ่งมองข้ามง่ายมาก
                    //  ทั้งที่คนคุยหลายเพจ/หลายร้านต้องรู้ตลอดว่ากำลังตอบในนามใคร)
                    const avatarInner = avatar ? (
                      <Image src={avatar} alt={selectedContact.display_name} width={36} height={36} className="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover" unoptimized />
                    ) : (
                      <div className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm" style={{ backgroundColor: platformColor }}>{getInitials(selectedContact.display_name)}</div>
                    );
                    const avatarEl = (
                      <div className="relative flex-shrink-0">
                        {avatarInner}
                        <AccountCornerBadge contact={selectedContact} sizeClass="w-[18px] h-[18px]" />
                      </div>
                    );
                    return (<>
                      {avatarEl}
                      <div className="min-w-0 flex-1 overflow-hidden" style={{ maxWidth: 'calc(100vw - 220px)' }}>
                        <h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5 min-w-0">
                          <span className="flex-shrink-0"><PlatformIcon contact={selectedContact} size={16} /></span>
                          <span className="truncate">{selectedContact.display_name}</span>
                        </h3>
                    {selectedContact.account_name && (<p className="text-xs text-gray-500 dark:text-slate-400 truncate">{selectedContact.account_name}</p>)}
                    {selectedContact.referral_ad_title && (() => {
                      const adData = selectedContact.referral_data?.ads_context_data;
                      const postId = adData?.post_id;
                      const adPhotoUrl = adData?.photo_url;
                      const adUrl = postId ? `https://www.facebook.com/${postId}` : null;
                      const sourceLabel = selectedContact.referral_source === 'ADS' ? 'Ads'
                        : selectedContact.referral_source === 'SHORTLINK' ? 'Shortlink'
                        : selectedContact.referral_source === 'CUSTOMER_CHAT_PLUGIN' ? 'Chat Plugin'
                        : selectedContact.referral_source || 'Referral';
                      return (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {adPhotoUrl && (
                            <Image src={adPhotoUrl} alt="ad" width={28} height={28} className="w-7 h-7 rounded object-cover flex-shrink-0" unoptimized />
                          )}
                          {adUrl ? (
                            <a href={adUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 dark:text-blue-400 hover:underline truncate max-w-[220px] flex items-center gap-0.5">
                              📣 {sourceLabel}: {selectedContact.referral_ad_title}
                              <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                            </a>
                          ) : (
                            <p className="text-xs text-blue-500 dark:text-blue-400 truncate max-w-[220px]">
                              📣 {sourceLabel}: {selectedContact.referral_ad_title}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    {selectedContact.customer && lastOrderLabel(selectedContact, true) && (() => {
                      const label = lastOrderLabel(selectedContact, true);
                      const neverOrdered = !selectedContact.last_order_date && !selectedContact.last_order_created_at;
                      return (
                        <p className={`text-[10px] ${neverOrdered ? 'text-orange-500' : 'text-gray-500 dark:text-slate-400'}`}>
                          {label}
                        </p>
                      );
                    })()}
                  </div>
                    </>);
                  })()}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {selectedContact.customer ? (
                    <>
                      <Tooltip text="ดูประวัติออเดอร์"><button onClick={handleOpenHistory} aria-label="ดูประวัติออเดอร์" className={`p-2 rounded-lg transition-colors ${rightPanel === 'history' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}><History className="w-4 h-4" /></button></Tooltip>
                      <Tooltip text={rightPanel === 'order' ? 'ปิดหน้าเปิดบิล' : 'เปิดบิล'}><button onClick={() => { setRightPanel(rightPanel === 'order' ? null : 'order'); }} aria-label={rightPanel === 'order' ? 'ปิดหน้าเปิดบิล' : 'เปิดบิล'} className={`p-2 rounded-lg transition-colors ${rightPanel === 'order' ? 'bg-primary text-white' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}><ShoppingCart className="w-4 h-4" /></button></Tooltip>
                      <Tooltip text="ดูข้อมูลลูกค้า"><button onClick={handleOpenProfile} aria-label="ดูข้อมูลลูกค้า" className={`p-2 rounded-lg transition-colors ${rightPanel === 'profile' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}><User className="w-4 h-4" /></button></Tooltip>
                    </>
                  ) : (
                    <>
                      <Tooltip text={rightPanel === 'order' ? 'ปิดหน้าเปิดบิล' : 'เปิดบิล'}><button onClick={() => { setRightPanel(rightPanel === 'order' ? null : 'order'); }} aria-label={rightPanel === 'order' ? 'ปิดหน้าเปิดบิล' : 'เปิดบิล'} className={`p-2 rounded-lg transition-colors ${rightPanel === 'order' ? 'bg-primary text-white' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}><ShoppingCart className="w-4 h-4" /></button></Tooltip>
                      <Tooltip text="แท็ก / โปรไฟล์"><button onClick={handleOpenProfile} aria-label="แท็ก / โปรไฟล์" className={`p-2 rounded-lg transition-colors ${rightPanel === 'profile' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}><User className="w-4 h-4" /></button></Tooltip>
                      <Tooltip text="เชื่อมลูกค้าที่มีอยู่"><button onClick={() => { setShowLinkModal(true); }} aria-label="เชื่อมลูกค้าที่มีอยู่" className="p-2 rounded-lg transition-colors bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600"><LinkIcon className="w-4 h-4" /></button></Tooltip>
                    </>
                  )}
                </div>
              </div>

              {/* Messages */}
              {/* overscroll-contain — ลากเลยสุดรายการแล้วห้ามส่งต่อให้ main เลื่อน/เด้ง */}
              {/* data-ptr-ignore — รายการข้อความเลื่อนขึ้นไปดูของเก่าบ่อย ถึงยอดแล้วลากต่อ
                  ไม่ควรรีเฟรชทั้งแอปทิ้งที่อ่านอยู่ — รูดรีเฟรชได้จากรายชื่อแชท/หัวแชทแทน */}
              <div ref={messagesContainerRef} onScroll={handleScroll} data-ptr-ignore className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 bg-gray-50 dark:bg-slate-900 relative font-sarabun">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-slate-400"><MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" /><p>ยังไม่มีข้อความ</p></div>
                ) : (
                  <>
                    <div ref={messagesTopRef} className="py-1">{loadingMore && (<div className="flex items-center justify-center py-2"><Loader2 className="w-4 h-4 text-gray-400 animate-spin" /></div>)}</div>
                    {messages.map((msg) => isSystemEventMessage(msg) ? (
                      // เหตุการณ์ของระบบ (ลูกค้ากดขอคุยกับเจ้าหน้าที่) — ชิปกลางจอ ไม่ใช่ฟองคำพูด
                      <div key={msg.id} className="flex justify-center">
                        <MessageBubble msg={msg} platform={selectedContact?.platform || 'line'} direction={msg.direction} />
                      </div>
                    ) : (
                      <div key={msg.id} className={`flex ${msg.direction === 'outgoing' ? 'justify-end pl-8' : 'justify-start pr-8'} gap-2`}>
                        {msg.direction === 'incoming' && (
                          <div className="flex-shrink-0 self-end">
                            {(msg.sender_picture_url || getAvatarUrl(selectedContact)) ? (<Image src={msg.sender_picture_url || getAvatarUrl(selectedContact)!} alt={msg.sender_name || selectedContact.display_name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" unoptimized />) : (<div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold" style={{ backgroundColor: platformColor }}>{getInitials(selectedContact.display_name)}</div>)}
                          </div>
                        )}
                        <div className="flex flex-col">
                          {msg.direction === 'incoming' && msg.sender_name && (<span className="text-xs text-gray-500 mb-0.5 ml-1">{msg.sender_name}</span>)}
                          <div className="flex items-end gap-1.5">
                            {msg.direction === 'outgoing' && (
                              <div className="flex flex-col items-end self-end mb-0.5 text-[10px] text-gray-400 dark:text-slate-500">
                                {msg.sent_by_user && <span>{msg.sent_by_user.name}</span>}
                                {/* ระบบของแพลตฟอร์มตอบเอง (นอกเวลาทำการ/แชทบอท) — ไม่ใช่คนของร้าน อย่าให้เข้าใจผิดว่ามีคนตอบแล้ว */}
                                {msg.raw_message?.auto_reply && <span>ตอบอัตโนมัติ</span>}
                                <div className="flex items-center gap-1">
                                  {msg._status === 'failed' && (<Tooltip text={msg._error ? `ส่งไม่สำเร็จ: ${msg._error} — กดเพื่อลองใหม่` : 'ส่งไม่สำเร็จ กดเพื่อลองใหม่'}><button onClick={() => { sendMessage(msg); }} aria-label="ส่งไม่สำเร็จ กดเพื่อลองใหม่" className="flex items-center gap-0.5 text-red-500 hover:text-red-600"><AlertCircle className="w-3 h-3" /><RotateCcw className="w-2.5 h-2.5" /></button></Tooltip>)}
                                  {msg._status === 'sending' && (<Loader2 className="w-2.5 h-2.5 animate-spin text-gray-400" />)}
                                  {msg._status === 'sent' && (<Check className="w-2.5 h-2.5" style={{ color: platformColor }} />)}
                                  <span>{formatTime(msg.created_at)}</span>
                                </div>
                              </div>
                            )}
                            <div className={`rounded-2xl max-w-[75vw] md:max-w-[min(70vw,400px)] ${BARE_BUBBLE_TYPES.includes(msg.message_type) ? 'bg-transparent' : msg.direction === 'outgoing'
                              ? msg._status === 'failed' ? 'bg-red-400 text-white rounded-br-sm px-3 py-1.5 md:px-4 md:py-2'
                              : msg._status === 'sending' ? 'text-white rounded-br-sm px-3 py-1.5 md:px-4 md:py-2' : 'text-white rounded-br-sm px-3 py-1.5 md:px-4 md:py-2'
                              : 'text-gray-900 dark:text-white rounded-bl-sm shadow-sm px-3 py-1.5 md:px-4 md:py-2'}`}
                              style={!BARE_BUBBLE_TYPES.includes(msg.message_type)
                                ? msg.direction === 'outgoing' && msg._status !== 'failed'
                                  ? { backgroundColor: msg._status === 'sending' ? platformColor + 'B3' : platformColor }
                                  : msg.direction === 'incoming'
                                    ? { backgroundColor: platformColor + '18' }
                                    : undefined
                                : undefined}>
                              <MessageBubble
                                msg={msg}
                                platform={selectedContact?.platform || 'line'}
                                direction={msg.direction}
                                onOpenLightbox={openLightbox}
                                onImageLoad={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                              />
                            </div>
                            {msg.direction === 'incoming' && (<span className="text-[10px] text-gray-400 self-end mb-0.5 whitespace-nowrap">{formatTime(msg.created_at)}</span>)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Scroll to bottom button */}
              {showScrollButton && (<Tooltip text="ไปที่ข้อความล่าสุด"><button onClick={scrollToBottom} aria-label="ไปที่ข้อความล่าสุด" className="absolute bottom-24 left-1/2 -translate-x-1/2 p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full shadow-xl hover:bg-gray-50 dark:hover:bg-slate-700/50 hover:shadow-2xl transition-all z-20 animate-bounce"><ArrowDown className="w-5 h-5" style={{ color: platformColor }} /></button></Tooltip>)}

              {/* Message Input */}
              {isWindowExpired ? (
                <div className="p-3 md:p-4 border-t border-gray-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">ไม่สามารถส่งข้อความได้ — ลูกค้าไม่ได้ส่งข้อความมาภายใน 7 วัน (หมดเวลาตอบกลับตามนโยบาย Facebook/Instagram)</span>
                  </div>
                </div>
              ) : (
              // ตัวนี้แหละที่ติดขอบล่างจอจริง ๆ จึงเป็นที่ที่ต้องเผื่อแถบ home indicator
              // (ห้ามไปเผื่อที่ตัวครอบทั้งหน้า — จะกลายเป็นแถบว่างค้างท้ายจอแทน)
              // บนมือถือใช้ pb-safe-min-2 = เท่ากับ inset ของ home indicator พอดี ไม่บวกเพิ่ม
              // (ผู้ใช้ขอให้ชิดล่างสุด) — ห้ามลดต่ำกว่า inset ไม่งั้นช่องพิมพ์ไปอยู่ใต้แถบ gesture ของ iOS
              <div className="p-2 md:p-4 pb-safe-min-2 md:pb-safe-4 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <div className="flex items-center gap-1 md:gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  {/* box="inline-flex" — ปุ่มนี้ disabled ตอนอัปโหลด ซึ่งไม่ยิง pointer event ต้องมีกล่องครอบถึงจะ hover ติด */}
                  <Tooltip text="ส่งรูปภาพ" box="inline-flex">
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadingImage} aria-label="ส่งรูปภาพ" className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors disabled:opacity-50">
                      {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                    </button>
                  </Tooltip>
                  {/* Emoji & Sticker wrapper */}
                  <div className="relative" data-emoji-picker>
                    <Tooltip text="อีโมจิ & สติกเกอร์">
                      <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setEmojiSearch(''); }} aria-label="อีโมจิ และ สติกเกอร์" className={`p-2 rounded-full transition-colors ${showEmojiPicker ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'text-gray-500 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                        <Smile className="w-5 h-5" />
                      </button>
                    </Tooltip>
                {showEmojiPicker && (
                    <EmojiStickerPicker
                      platform={selectedContact?.platform || 'line'}
                      onEmojiSelect={(emoji) => { setNewMessage(prev => prev + emoji); inputRef.current?.focus(); }}
                      onStickerSelect={(packageId, stickerId) => sendSticker(packageId, stickerId)}
                      onClose={() => { setShowEmojiPicker(false); setEmojiSearch(''); }}
                    />
                  )}
                  </div>
                  <input ref={inputRef} type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="พิมพ์ข้อความ..." autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="send"
                    className="flex-1 min-w-0 h-10 px-3 md:px-4 py-2 mr-2 text-sm md:text-base border border-gray-300 rounded-[15px] focus:outline-none focus:ring-2" style={{ '--tw-ring-color': platformColor } as any} />
                  <button onClick={() => { sendMessage(); }} disabled={!newMessage.trim()} className="p-2 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0" style={{ backgroundColor: platformColor }}><Send className="w-5 h-5" /></button>
                </div>
              </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-slate-900">
              <div className="text-center text-gray-500 dark:text-slate-400">
                <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">เลือกแชทเพื่อเริ่มสนทนา</p>
                <p className="text-sm">ข้อความจากลูกค้าจะแสดงที่นี่</p>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Order View — unified with desktop panel above */}

        {/* Mobile History View */}
        {mobileView === 'history' && selectedContact?.customer && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3"><button onClick={() => setMobileView('chat')} className="p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-6 h-6" /></button><History className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">ประวัติออเดอร์</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.name}</p></div></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingHistory ? (<div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>) : orderHistory.length === 0 ? (<div className="text-center py-8 text-gray-500 dark:text-slate-400"><History className="w-12 h-12 mx-auto mb-2 text-gray-300" /><p>ยังไม่มีประวัติออเดอร์</p></div>) : (<div className="space-y-3">{orderHistory.map(renderOrderCard)}</div>)}
            </div>
          </div>
        )}

        {/* Mobile Profile View */}
        {mobileView === 'profile' && selectedContact && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3"><button onClick={() => setMobileView('chat')} className="p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-6 h-6" /></button><User className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedContact.customer ? 'ข้อมูลลูกค้า' : 'โปรไฟล์'}</h2>{selectedContact.customer && <p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p>}</div></div>
              {selectedContact.customer && <button onClick={handleOpenEditCustomer} className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 rounded-lg transition-colors">แก้ไข</button>}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {renderCustomerProfile()}
              <div className="mt-4 space-y-2">
                {selectedContact.customer ? (
                  <>
                    <Button variant="primary" fullWidth icon={<ShoppingCart className="w-4 h-4" />} onClick={() => { setOrderFormKey(k => k + 1); setRightPanel('order'); }}>เปิดบิล</Button>
                    <Button variant="secondary" fullWidth onClick={() => window.open(`/customers/${selectedContact.customer!.id}`, '_blank')}>ดูรายละเอียดเต็ม</Button>
                    <div className="flex gap-2 pt-2">
                      <button onClick={handleUnlinkCustomer} className="flex-1 py-2 text-sm text-gray-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors flex items-center justify-center gap-1.5"><Unlink className="w-3.5 h-3.5" />ยกเลิกเชื่อมต่อ</button>
                      <button onClick={handleDeleteCustomer} className="flex-1 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />ลบลูกค้า</button>
                    </div>
                  </>
                ) : (
                  <button onClick={() => setShowLinkModal(true)} className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"><LinkIcon className="w-4 h-4" />เชื่อมต่อลูกค้า</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mobile Edit Customer View */}
        {mobileView === 'edit-customer' && selectedContact?.customer && editCustomerInitialData && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3"><button onClick={() => setMobileView('profile')} className="p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-6 h-6" /></button><User className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">แก้ไขข้อมูลลูกค้า</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p></div></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><CustomerForm compact={true} initialData={editCustomerInitialData} onSubmit={handleUpdateCustomerInChat} onCancel={() => setMobileView('profile')} isEditing={true} isLoading={editingCustomer} allTags={allTags} selectedTags={profileTags} onTagsChange={setProfileTags} onTagCreated={(tag) => setAllTags(prev => [...prev, tag])}/></div>
          </div>
        )}

        {/* Mobile Order Detail View */}
        {mobileView === 'order-detail' && selectedOrderId && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3"><button onClick={() => setMobileView('history')} className="p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-6 h-6" /></button><FileText className="w-5 h-5 text-blue-500" /><div><div className="flex items-center gap-1.5 flex-wrap"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{orderHistory.find(o => o.id === selectedOrderId)?.order_number || 'รายละเอียดออเดอร์'}</h2>{(() => { const o = orderHistory.find(o => o.id === selectedOrderId); if (!o) return null; const s = o.order_status || o.status; const p = o.payment_status; return (<><span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getBadgeColor(s).bg} ${getBadgeColor(s).color}`}>{s === 'completed' ? 'สำเร็จ' : s === 'new' ? 'ใหม่' : s === 'shipping' ? 'กำลังส่ง' : s === 'cancelled' ? 'ยกเลิก' : s}</span><span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getPaymentBadgeColor(p).bg} ${getPaymentBadgeColor(p).color}`}>{p === 'paid' ? 'ชำระแล้ว' : p === 'verifying' ? 'รอตรวจสอบ' : p === 'cancelled' ? 'ยกเลิก' : 'รอชำระ'}</span></>); })()}</div>{selectedContact?.customer && <p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.name}</p>}</div></div>
              <div className="flex items-center gap-2">
                <div ref={headerActionsRef} />
                <div ref={warehousePortalRef} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pt-4"><OrderForm key={`mobile-${selectedOrderId}`} editOrderId={selectedOrderId} embedded={true} warehousePortalRef={warehousePortalRef} headerActionsRef={headerActionsRef} onSuccess={() => { setMobileView('history'); showToast('บันทึกการแก้ไขสำเร็จ!'); if (selectedContact?.customer) fetchOrderHistory(selectedContact.customer.id); }} onCancel={() => setMobileView('history')} /></div>
          </div>
        )}

        {/* Desktop Right Panels */}
        {rightPanel === 'order' && selectedContact && (
          <div className="flex w-full md:w-auto md:flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 absolute inset-0 md:static md:inset-auto z-10">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3">
                <button onClick={() => setRightPanel(null)} className="p-1 -ml-1 text-gray-500 hover:text-gray-700 md:hidden"><ChevronLeft className="w-6 h-6" /></button>
                <ShoppingCart className="w-5 h-5 text-primary" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">เปิดบิล</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer ? selectedContact.customer.name : `${selectedContact.platform === 'line' ? 'LINE' : selectedContact.platform === 'shopee' ? 'Shopee' : selectedContact.platform === 'lazada' ? 'Lazada' : selectedContact.platform === 'tiktok' ? 'TikTok' : 'Facebook'}: ${selectedContact.display_name}`}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <div ref={headerActionsRef} />
                <div ref={warehousePortalRef} />
                <Tooltip text="ปิด"><button onClick={() => setRightPanel(null)} aria-label="ปิด" className="hidden md:block p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><X className="w-5 h-5" /></button></Tooltip>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pt-4"><OrderForm key={orderFormKey} {...(selectedContact.customer ? { preselectedCustomerId: selectedContact.customer.id } : {})} embedded={true} warehousePortalRef={warehousePortalRef} headerActionsRef={headerActionsRef} source={selectedContact.source || selectedContact.platform} sourceName={selectedContact.account_name} chatAccountId={selectedContact.chat_account_id} onSuccess={(orderId, customerId, deliveryInfo) => { setRightPanel(null); handleBillSaved(orderId, customerId, deliveryInfo); }} onSendBillToChat={sendBillToCustomer} onCancel={() => setRightPanel(null)} /></div>
          </div>
        )}

        {rightPanel === 'history' && selectedContact?.customer && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3"><History className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">ประวัติออเดอร์</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.name}</p></div></div>
              <Tooltip text="ปิด"><button onClick={() => setRightPanel(null)} aria-label="ปิด" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><X className="w-5 h-5" /></button></Tooltip>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingHistory ? (<div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>) : orderHistory.length === 0 ? (<div className="text-center py-8 text-gray-500 dark:text-slate-400"><History className="w-12 h-12 mx-auto mb-2 text-gray-300" /><p>ยังไม่มีประวัติออเดอร์</p></div>) : (<div className="space-y-3">{orderHistory.map(renderOrderCard)}</div>)}
            </div>
          </div>
        )}

        {rightPanel === 'profile' && selectedContact && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3"><User className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedContact.customer ? 'ข้อมูลลูกค้า' : 'โปรไฟล์'}</h2>{selectedContact.customer && <p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p>}</div></div>
              <div className="flex items-center gap-2">
                {selectedContact.customer && <button onClick={handleOpenEditCustomer} className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 rounded-lg transition-colors">แก้ไข</button>}
                <Tooltip text="ปิด"><button onClick={() => setRightPanel(null)} aria-label="ปิด" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><X className="w-5 h-5" /></button></Tooltip>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {renderCustomerProfile()}
              <div className="mt-4 space-y-2">
                {selectedContact.customer ? (
                  <>
                    <Button variant="primary" fullWidth icon={<ShoppingCart className="w-4 h-4" />} onClick={() => { setOrderFormKey(k => k + 1); setRightPanel('order'); }}>เปิดบิล</Button>
                    <Button variant="secondary" fullWidth onClick={() => window.open(`/customers/${selectedContact.customer!.id}`, '_blank')}>ดูรายละเอียดเต็ม</Button>
                    <div className="flex gap-2 pt-2">
                      <button onClick={handleUnlinkCustomer} className="flex-1 py-2 text-sm text-gray-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors flex items-center justify-center gap-1.5"><Unlink className="w-3.5 h-3.5" />ยกเลิกเชื่อมต่อ</button>
                      <button onClick={handleDeleteCustomer} className="flex-1 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />ลบลูกค้า</button>
                    </div>
                  </>
                ) : (
                  <button onClick={() => setShowLinkModal(true)} className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"><LinkIcon className="w-4 h-4" />เชื่อมต่อลูกค้า</button>
                )}
              </div>
            </div>
          </div>
        )}

        {rightPanel === 'edit-customer' && selectedContact?.customer && editCustomerInitialData && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3"><User className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">แก้ไขข้อมูลลูกค้า</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p></div></div>
              <Tooltip text="ปิด"><button onClick={() => setRightPanel('profile')} aria-label="ปิด" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><X className="w-5 h-5" /></button></Tooltip>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><CustomerForm compact={true} initialData={editCustomerInitialData} onSubmit={handleUpdateCustomerInChat} onCancel={() => setRightPanel('profile')} isEditing={true} isLoading={editingCustomer} allTags={allTags} selectedTags={profileTags} onTagsChange={setProfileTags} onTagCreated={(tag) => setAllTags(prev => [...prev, tag])}/></div>
          </div>
        )}

        {rightPanel === 'order-detail' && selectedOrderId && (
          <div className="flex w-full md:w-auto md:flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 absolute inset-0 md:static md:inset-auto z-10">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3"><button onClick={() => setRightPanel('history')} className="p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-5 h-5" /></button><FileText className="w-5 h-5 text-blue-500" /><div><div className="flex items-center gap-1.5 flex-wrap"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{orderHistory.find(o => o.id === selectedOrderId)?.order_number || 'รายละเอียดออเดอร์'}</h2>{(() => { const o = orderHistory.find(o => o.id === selectedOrderId); if (!o) return null; const s = o.order_status || o.status; const p = o.payment_status; return (<><span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getBadgeColor(s).bg} ${getBadgeColor(s).color}`}>{s === 'completed' ? 'สำเร็จ' : s === 'new' ? 'ใหม่' : s === 'shipping' ? 'กำลังส่ง' : s === 'cancelled' ? 'ยกเลิก' : s}</span><span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getPaymentBadgeColor(p).bg} ${getPaymentBadgeColor(p).color}`}>{p === 'paid' ? 'ชำระแล้ว' : p === 'verifying' ? 'รอตรวจสอบ' : p === 'cancelled' ? 'ยกเลิก' : 'รอชำระ'}</span></>); })()}</div>{selectedContact?.customer && <p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.name}</p>}</div></div>
              <div className="flex items-center gap-2">
                <div ref={headerActionsRef} />
                <div ref={warehousePortalRef} />
                <Tooltip text="ปิด"><button onClick={() => setRightPanel(null)} aria-label="ปิด" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><X className="w-5 h-5" /></button></Tooltip>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pt-4"><OrderForm key={selectedOrderId} editOrderId={selectedOrderId} embedded={true} warehousePortalRef={warehousePortalRef} headerActionsRef={headerActionsRef} onSuccess={() => { setRightPanel('history'); showToast('บันทึกการแก้ไขสำเร็จ!'); if (selectedContact?.customer) fetchOrderHistory(selectedContact.customer.id); }} onCancel={() => setRightPanel('history')} /></div>
          </div>
        )}
      </div>

      {/* Link Customer Modal */}
      {showLinkModal && selectedContact && (
        <LinkCustomerModal
          contact={selectedContact}
          platformColor={platformColor}
          onLink={(customerId) => { linkCustomer(customerId); setShowLinkModal(false); }}
          onClose={() => setShowLinkModal(false)}
        />
      )}

      {/* Lightbox / Gallery Overlay */}
      {lightboxIndex !== null && (
        <LightboxViewer
          mediaList={mediaList}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChangeIndex={(idx) => setLightboxIndex(idx)}
        />
      )}
      {confirmDialog}
      {/* ล้างยังไม่อ่านเป็นงานเขียนข้อมูลเป็นชุด (หลายพันแถว) — บังจอกันกดซ้ำจนกว่าจะเสร็จ */}
      <LoadingOverlay isOpen={markingAllRead} title="กำลังล้างยังไม่อ่าน..." message="ข้อความยังอยู่ครบ แค่เลิกนับว่ายังไม่ได้อ่าน" />
      </div>
    </Layout>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <FullPageLoading />
    }>
      <UnifiedChatPageContent />
    </Suspense>
  );
}
