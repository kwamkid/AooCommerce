'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import CopyField from '@/components/ui/CopyField';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useBfcacheReset } from '@/lib/useBfcacheReset';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { Loader2, Eye, EyeOff, ExternalLink, Check, X, ChevronDown, ChevronUp, CheckCircle2, XCircle, Zap, Plus, Trash2, Edit2, Search, RefreshCw, Facebook as FacebookSolidIcon } from 'lucide-react';
import { formatThaiDateTime } from '@/lib/utils/format';
import dynamic from 'next/dynamic';
import ActionMenu from '@/components/ui/ActionMenu';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import PlatformIcon from '@/components/ui/PlatformIcon';
import ChannelBadge from '@/components/ui/ChannelBadge';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import { parallelLimit } from '@/lib/parallel';
import Tooltip from '@/components/ui/Tooltip';
import SearchInput from '@/components/ui/SearchInput';
import Tabs from '@/components/ui/Tabs';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import Toggle from '@/components/ui/Toggle';
import Card from '@/components/ui/Card';
import FormInput from '@/components/ui/FormInput';
import FormSelect from '@/components/ui/FormSelect';
import StepNumber from '@/components/ui/StepNumber';
import { useFacebookSdk, FB_LOGIN_CONFIG } from '@/lib/useFacebookSdk';
import { useIsSuperAdmin } from '@/lib/useIsSuperAdmin';
import { META_MARKETING_MESSAGES_SCOPES } from '@/lib/ads/meta-ui';

// Lazy-load modals — only needed on edit / after FB OAuth returns pages.
const Modal = dynamic(() => import('@/components/ui/Modal'), { ssr: false });

const FB_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '';

interface FbPage {
  id: string;
  name: string;
  username?: string | null;
  access_token: string;
  picture_url: string | null;
  instagram: { id: string; name: string; profile_picture_url: string } | null;
  connected_by?: 'current' | 'other' | null;
}


/**
 * สิทธิ์ที่ขอตอนเชื่อมเพจ — `page_events` = สิทธิ์ที่ Conversions API ต้องใช้
 * (หา/สร้าง dataset ของเพจ + ยิง event Purchase) · token ที่ออกก่อน 9 ก.ย. 2026
 * ไม่มีสิทธิ์นี้ ต้องกด "เชื่อมต่อ Facebook" ใหม่ถึงจะได้ token ที่ครบ
 */
const FB_PAGE_SCOPE = 'pages_show_list,pages_messaging,pages_read_engagement,instagram_manage_messages,page_events';

/**
 * Marketing Messages on Messenger (ทดลอง) — app มีสิทธิ์แค่ระดับ Standard = ขอได้เฉพาะบัญชี
 * ที่มีบทบาทใน app Meta · จึงอยู่ในเมนูของผู้ดูแลระบบเท่านั้น ไม่ปนปุ่มเชื่อมเพจของร้าน ·
 * ได้ Advanced Access แล้วค่อยย้ายเข้า FB_PAGE_SCOPE
 */
const FB_MARKETING_MESSAGES_SCOPE = META_MARKETING_MESSAGES_SCOPES.join(',');

interface ChatAccount {
  id: string;
  platform: 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok';
  account_name: string;
  credentials: Record<string, unknown>;
  is_active: boolean;
  webhook_url: string;
  created_at: string;
  /** ผลตรวจจริงล่าสุดจากตัวเฝ้า (lib/chat/channel-health.ts) — null = ยังไม่เคยตรวจ */
  health_status?: string | null;
  health_detail?: string | null;
  health_checked_at?: string | null;
}

// ป้ายเตือนบนการ์ดช่องทาง — โชว์เฉพาะ 3 สถานะที่เป็นปัญหาจริง
// (`check_failed` = ตรวจไม่สำเร็จ ไม่ใช่ช่องทางพัง จึงไม่ขึ้นป้าย)
const HEALTH_BADGE: Record<string, { tone: 'red' | 'amber'; label: string }> = {
  token_invalid: { tone: 'red', label: 'token หมดอายุ' },
  webhook_missing: { tone: 'amber', label: 'webhook ไม่ต่อ' },
  webhook_unreachable: { tone: 'amber', label: 'webhook เรียกไม่ถึง' },
};

interface ShopeeShop {
  id: string;
  shop_id: number;
  shop_name: string | null;
  is_active: boolean;
  // TikTok: token แชทมาจาก app แชทแยก — false = ยังไม่ผ่าน OAuth ขาแชท
  chat_connected?: boolean;
  chat_expired?: boolean;
  /** metadata.shop_logo = โลโก้ร้านจาก marketplace */
  metadata?: Record<string, unknown> | null;
}

/** app แชท Shopee ของบริษัท — key ถูกปิดบังมาจาก API (โชว์ 4 ตัวท้ายพอให้ยืนยันใบ) */
interface ShopeeChatApp {
  id: string;
  label: string | null;
  partner_id: number;
  partner_key_masked: string | null;
  push_key_masked: string | null;
  has_push_key: boolean;
  env: 'production' | 'sandbox';
  /** โหมดที่บริษัทตั้งเอง — full = ออเดอร์+สินค้า+แชทผ่าน app นี้ · chat = แชทอย่างเดียว */
  usage: 'full' | 'chat';
  is_active: boolean;
  last_push_config_check: {
    at?: string;
    ok?: boolean;
    /** โหมดที่ใช้ตอนตั้ง push ครั้งนั้น (chat_only = ค่าเก่าก่อนมีคอลัมน์ usage) */
    mode?: 'full' | 'chat' | 'chat_only';
    error?: string | null;
    config?: { push_config_on_list?: number[]; live_push_status?: string; callback_url?: string } | null;
  } | null;
}

interface TestInfo {
  name: string;
  picture_url?: string;
  basic_id?: string;
  /** premium ID ที่ตั้งเอง (@abcthebaby) — โชว์ก่อน basic_id */
  premium_id?: string;
  page_id?: string;
  /** FB เท่านั้น: token ใบนี้ยิง Conversions API ได้ไหม (ตรวจจริงตอนกดทดสอบ) */
  capi?: { ready: boolean; error: string | null };
}

const PLATFORM_CONFIG = {
  line: {
    label: 'LINE',
    color: '#06C755',
    fields: [
      { key: 'channel_secret', label: 'Channel Secret', placeholder: 'วาง Channel Secret ที่นี่' },
      { key: 'channel_access_token', label: 'Channel Access Token', placeholder: 'วาง Channel Access Token ที่นี่' },
    ],
  },
  facebook: {
    label: 'Facebook / IG',
    color: '#1877F2',
    fields: [
      { key: 'page_access_token', label: 'Page Access Token', placeholder: 'วาง Page Access Token ที่นี่' },
    ],
  },
  shopee: {
    label: 'Shopee',
    color: '#EE4D2D',
    fields: [] as { key: string; label: string; placeholder: string }[],
  },
  lazada: {
    label: 'Lazada',
    color: '#0F146E',
    fields: [] as { key: string; label: string; placeholder: string }[],
  },
  tiktok: {
    label: 'TikTok Shop',
    color: '#161823',
    fields: [] as { key: string; label: string; placeholder: string }[],
  },
};

// Chat platforms that ride on a marketplace connection (ตั้งค่า > Integrations)
type MarketplaceChatPlatform = 'shopee' | 'lazada' | 'tiktok';
const MARKETPLACE_CHAT_PLATFORMS: MarketplaceChatPlatform[] = ['shopee', 'lazada', 'tiktok'];

export default function ChatChannelsPage() {
  const { userProfile } = useAuth();
  const router = useRouter();
  /** เพิ่งเชื่อมเพจสำเร็จ และบริษัทนี้ยังไม่มีบัญชีโฆษณาสักใบ — ชวนต่อให้จบในทางเดียว */
  const [showAdsNudge, setShowAdsNudge] = useState(false);
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const { features, fetched: featuresFetched } = useFeatures();
  // แชท Shopee/Lazada เกาะการเชื่อมต่อ marketplace — ปิดฟีเจอร์ marketplace แล้ว
  // ต้องไม่โผล่ที่นี่ด้วย ไม่งั้นเปิดสวิตช์ไปก็ไม่มีร้านให้เลือก
  const showMarketplaceChat = features.marketplace_sync;

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<ChatAccount[]>([]);
  const [activeTab, setActiveTabState] = useState<'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok'>('facebook');

  // Read hash on mount — allow #line / #shopee / #lazada to override the default
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'line' || hash === 'shopee' || hash === 'lazada' || hash === 'tiktok') setActiveTabState(hash);
    };
    applyHash();
    // ถ้าอยู่หน้านี้อยู่แล้วแล้วกดลิงก์ที่ต่างกันแค่ #anchor Next จะไม่ remount
    // ต้องฟัง hashchange เอง ไม่งั้นแจ้งเตือน/การ์ดบน dashboard ที่ลิงก์มาที่
    // แท็บของแพลตฟอร์มโดยตรงจะกดแล้วไม่เกิดอะไรขึ้น
    window.addEventListener('hashchange', applyHash);

    // ?connect=line|facebook — มาจากหน้าช่องทางการขาย: เปิด flow เพิ่มให้เลย
    // ไม่ใช่แค่พามาถึงหน้าแล้วปล่อยให้หาปุ่มเอง
    const connect = new URLSearchParams(window.location.search).get('connect');
    if (connect === 'line') {
      setActiveTabState('line');
      setShowForm(true); // ฟอร์ม LINE เป็น inline form ของแท็บ
    } else if (connect === 'facebook') {
      setActiveTabState('facebook');
      // FB ต้องกดเองหนึ่งครั้ง — popup OAuth เปิดอัตโนมัติจะโดน browser บล็อก
      showToast('กดปุ่ม "เชื่อมเพจ FB / IG" เพื่อเลือกเพจที่จะเชื่อม');
    }
    if (connect) window.history.replaceState({}, '', '/settings/chat-channels' + window.location.hash);
    return () => window.removeEventListener('hashchange', applyHash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // กลับมาจาก OAuth ขาแชท (?tiktok_chat= / ?lazada_chat= = connected|failed|skipped)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const platform = params.get('tiktok_chat') ? 'TikTok Shop'
      : params.get('lazada_chat') ? 'Lazada'
        : params.get('shopee_chat') ? 'Shopee' : null;
    if (!platform) return;
    const result = params.get('tiktok_chat') || params.get('lazada_chat') || params.get('shopee_chat');
    if (result === 'connected') {
      showToast(`เชื่อมต่อแชท ${platform} สำเร็จ — เปิดสวิตช์ร้านที่ต้องการรับแชทได้เลย`, 'success');
    } else if (result === 'failed') {
      showToast(`เชื่อมต่อแชท ${platform} ไม่สำเร็จ กรุณาลองใหม่`, 'error');
    } else {
      // skipped = กดยกเลิกที่หน้าอนุญาตของแพลตฟอร์ม — **ร้านเชื่อมสำเร็จไปแล้ว**
      // (ขาออเดอร์พามาต่อขาแชทเอง) ต้องบอกให้ชัด ไม่งั้นจะนึกว่าทั้งอย่างล้ม
      showToast(`เชื่อมต่อร้าน ${platform} แล้ว — ยังไม่ได้เปิดแชท กดปุ่ม "เชื่อมต่อแชท" ที่ร้านได้ทีหลัง`);
    }
    window.history.replaceState({}, '', `/settings/chat-channels${window.location.hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ปิดฟีเจอร์ระหว่างที่ค้างอยู่แท็บ marketplace (หรือเปิดหน้าด้วย #shopee) → กลับแท็บแรก
  useEffect(() => {
    // รอ featuresFetched ก่อน — ค่าเริ่มต้นของ flag คือปิดหมด ถ้าไม่รอจะเด้งคน
    // ที่เปิดฟีเจอร์ไว้ออกจากแท็บที่ deep-link มาทุกครั้ง
    if (featuresFetched && !showMarketplaceChat && (activeTab === 'shopee' || activeTab === 'lazada' || activeTab === 'tiktok')) {
      setActiveTabState('facebook');
    }
  }, [featuresFetched, showMarketplaceChat, activeTab]);

  const setActiveTab = (tab: 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok') => {
    setActiveTabState(tab);
    window.location.hash = tab === 'facebook' ? '' : tab;
  };

  // Shopee/Lazada: connected marketplace shops (chat rides on the marketplace connection)
  const [mpShops, setMpShops] = useState<Record<MarketplaceChatPlatform, ShopeeShop[]>>({ shopee: [], lazada: [], tiktok: [] });
  // โหลดครั้งเดียวตอน mount ไม่ใช่ต่อแท็บ — count บนแท็บต้องขึ้นตั้งแต่ยังไม่กดเข้าไป
  const [mpShopsLoaded, setMpShopsLoaded] = useState(false);
  const [shopeeToggling, setShopeeToggling] = useState<string | null>(null);

  // app แชท Shopee ของบริษัท (Seller In House) — Shopee ให้ Chat API เฉพาะ app ประเภทนี้
  // และ app ผูกกับบัญชี seller ที่จดมัน ⇒ ทุกบริษัทต้องมีของตัวเอง ใช้ app กลางแทนไม่ได้
  const [shopeeApp, setShopeeApp] = useState<ShopeeChatApp | null>(null);
  const [shopeeAppLoaded, setShopeeAppLoaded] = useState(false);
  // usage ว่าง = ยังไม่ได้เลือกเอง → ส่งไปแบบว่าง ให้ server เดาจากสภาพร้านให้ (กติกาเดียวกัน)
  const [shopeeAppForm, setShopeeAppForm] = useState({ partner_id: '', partner_key: '', push_key: '', env: 'production', usage: '', label: '' });
  const [shopeeAppEditing, setShopeeAppEditing] = useState(false);
  const [shopeeAppSaving, setShopeeAppSaving] = useState(false);
  const [shopeeAppPushing, setShopeeAppPushing] = useState(false);
  // โหมดตั้งต้นของ app ใบใหม่ — กติกาเดียวกับฝั่ง server: มีร้านอยู่บน app กลางแล้ว = บริษัทนี้
  // มา "เติมแชท" ⇒ chat · ไม่มีร้านเลย หรือมีร้านที่เชื่อมผ่าน app ตัวเองแล้ว ⇒ full
  const shopeeUsageDefault: 'full' | 'chat' =
    mpShops.shopee.some(s => s.metadata?.shopee_app === 'seller') ? 'full'
      : mpShops.shopee.length > 0 ? 'chat' : 'full';

  // Inline form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Guide state (for inline form)
  const [formGuideOpen, setFormGuideOpen] = useState(false);
  // id ของบัญชี LINE ที่กำลังจะสร้าง — สุ่มไว้ตั้งแต่เปิดฟอร์ม เพื่อโชว์ Webhook URL ให้คัดลอกไปวางใน
  // LINE Developers ได้เลยระหว่างกรอก (เดิมต้องบันทึกก่อนแล้วกดแก้ไขถึงเห็น URL — คนไม่รู้ว่าต้องทำ)
  const [pendingLineId, setPendingLineId] = useState<string | null>(null);

  // Test state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testInfo, setTestInfo] = useState<Record<string, TestInfo>>({});
  const [testErrors, setTestErrors] = useState<Record<string, string>>({});

  // Copy state

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // FB OAuth state
  const [fbMode, setFbMode] = useState<'oauth' | 'manual'>(FB_APP_ID ? 'oauth' : 'manual');
  const [fbPages, setFbPages] = useState<FbPage[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [fbLoading, setFbLoading] = useState(false);
  // SDK โหลดเฉพาะตอนอยู่แท็บ Facebook เหมือนเดิม — ตัวโหลดอยู่ที่ lib/useFacebookSdk.ts
  // (ใช้ร่วมกับหน้าบัญชีโฆษณา ซึ่งขอสิทธิ์คนละชุดแต่ต้องใช้ SDK ตัวเดียวกัน)
  const fb = useFacebookSdk(activeTab === 'facebook');
  const fbSdkReady = fb.ready;
  const [fbSavingPage, setFbSavingPage] = useState(false);
  // ความคืบหน้าตอนเชื่อม/อัปเดตสิทธิ์หลายเพจ — แต่ละเพจต้องคุยกับ Meta หลายรอบ (token · webhook · ทดสอบ · CAPI)
  // ทำทีละเพจเรียงกันเคยช้าจนเจ้าของทัก (10 ก.ย. 2026) จึงทำ 3 เพจพร้อมกันและบอกว่าถึงไหนแล้ว
  const [fbSaveProgress, setFbSaveProgress] = useState<{ done: number; total: number; active: string[] } | null>(null);
  const [fbSearch, setFbSearch] = useState('');
  // page_id ของเพจที่กด "เชื่อมต่อใหม่" — พอ Facebook คืนรายชื่อเพจมาแล้วจะติ๊กเพจนี้ให้เลย
  // (ล้างค่าทุกครั้งที่ exchangeFbToken เริ่มทำงาน — รอบถัดไปต้องไม่ติ๊กค้าง)
  const reconnectPageIdRef = useRef<string | null>(null);
  // สิทธิ์เสริมของรอบล็อกอินถัดไป (เมนูทดลอง) — handleFbLogin อ่านแล้วล้าง
  const fbExtraScopeRef = useRef('');

  useFetchOnce(() => {
    fetchAccounts();
  }, can(userProfile, 'masterdata.chat_channels'));

  // ร้าน marketplace ที่เชื่อมไว้ (แชทเกาะการเชื่อมต่อ marketplace) — ดึงทุก platform
  // ในคอลเดียวตอน mount เพื่อให้ count บนแท็บถูกต้องก่อนกดเข้าแท็บนั้น
  const loadMarketplaceShops = useCallback(async () => {
    try {
      const res = await apiFetch('/api/marketplace/accounts?platform=all');
      if (res.ok) {
        const data = await res.json();
        const rows: (ShopeeShop & { platform?: string })[] = Array.isArray(data) ? data : (data.accounts || []);
        const grouped: Record<MarketplaceChatPlatform, ShopeeShop[]> = { shopee: [], lazada: [], tiktok: [] };
        for (const row of rows) {
          if (!row.is_active) continue;
          const platform = (row.platform || 'shopee') as MarketplaceChatPlatform;
          if (MARKETPLACE_CHAT_PLATFORMS.includes(platform)) grouped[platform].push(row);
        }
        setMpShops(grouped);
      }
    } catch { /* non-critical — แท็บจะขึ้น empty state */ }
    setMpShopsLoaded(true);
  }, []);

  useFetchOnce(() => {
    loadMarketplaceShops();
  }, can(userProfile, 'masterdata.chat_channels'));

  const loadShopeeApp = useCallback(async () => {
    try {
      const res = await apiFetch('/api/shopee/apps');
      if (res.ok) {
        const rows: ShopeeChatApp[] = await res.json();
        setShopeeApp(rows.find(r => r.is_active) || null);
      }
    } catch { /* non-critical — การ์ดจะขึ้นเป็นฟอร์มเปล่าให้กรอกใหม่ */ }
    setShopeeAppLoaded(true);
  }, []);

  useFetchOnce(() => {
    loadShopeeApp();
  }, can(userProfile, 'masterdata.chat_channels'));

  // เมนูทดลองของผู้ดูแลระบบ (FB_MARKETING_MESSAGES_SCOPE) — ร้านทั่วไปไม่เห็น
  const isSuperAdmin = useIsSuperAdmin(can(userProfile, 'masterdata.chat_channels'));

  const saveShopeeApp = async () => {
    setShopeeAppSaving(true);
    try {
      const res = await apiFetch('/api/shopee/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shopeeAppForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // ข้อความจาก Shopee ตรง ๆ — "บันทึกไม่สำเร็จ" ลอย ๆ ไม่ช่วยให้รู้ว่ากรอกอะไรผิด
        showToast(typeof data.error === 'string' ? data.error : 'บันทึก app ไม่สำเร็จ', 'error');
      } else {
        setShopeeApp(data);
        setShopeeAppEditing(false);
        setShopeeAppForm({ partner_id: '', partner_key: '', push_key: '', env: 'production', usage: '', label: '' });
        showToast('บันทึก app แชท Shopee แล้ว — ขั้นต่อไปกด "ตั้งค่า push (webchat)"', 'success');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
    setShopeeAppSaving(false);
  };

  const applyShopeePushConfig = async () => {
    if (!shopeeApp) return;
    setShopeeAppPushing(true);
    try {
      const res = await apiFetch(`/api/shopee/apps/${shopeeApp.id}/push-config`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(typeof data.error === 'string' ? data.error : 'ตั้งค่า push ไม่สำเร็จ', 'error');
      } else {
        showToast('เปิด push แชท (code 10) ให้ app นี้แล้ว', 'success');
      }
      await loadShopeeApp();
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
    setShopeeAppPushing(false);
  };

  const fetchAccounts = async (): Promise<ChatAccount[]> => {
    try {
      const response = await apiFetch('/api/chat-accounts');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      const list: ChatAccount[] = data.accounts || [];
      setAccounts(list);

      // Re-subscribe all FB pages to ensure message_echoes is enabled
      const hasFb = (data.accounts || []).some((a: { platform: string }) => a.platform === 'facebook');
      if (hasFb) {
        try {
          const subRes = await apiFetch('/api/fb/oauth/subscribe-webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resubscribeAll: true }),
          });
          if (subRes.ok) {
            const subData = await subRes.json();
            if (subData.updated > 0) {
              console.log(`FB webhook re-subscribed: ${subData.updated}/${subData.total} pages`);
            }
          }
        } catch { /* non-critical */ }
      }
      return list;
    } catch (error) {
      console.error('Error fetching chat accounts:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
      return [];
    } finally {
      setLoading(false);
    }
  };

  // FB Login — ท่าล็อกอิน (getLoginStatus → logout → login) อยู่ใน useFacebookSdk แล้ว
  const handleFbLogin = useCallback(() => {
    const extraScope = fbExtraScopeRef.current;
    fbExtraScopeRef.current = '';
    // .then(ok, err) สองอาร์กิวเมนต์ — ตัวจับ error คุมเฉพาะขาล็อกอิน ไม่กิน error
    // ของ exchangeFbToken (ซึ่งมี try/catch + toast ของตัวเองอยู่แล้ว)
    // มี config ของ Facebook Login for Business = ใช้ config (สิทธิ์ตั้งใน App Dashboard · เติมรายรอบไม่ได้)
    fb.login(extraScope ? `${FB_PAGE_SCOPE},${extraScope}` : FB_PAGE_SCOPE, { configId: FB_LOGIN_CONFIG.pages }).then(exchangeFbToken, (err: unknown) => {
      // ล้างเพจที่จองไว้ด้วย ไม่งั้นรอบหน้าที่กด "เชื่อมเพจ" ปกติจะมีเพจติ๊กค้างมาจากรอบที่ล้ม
      reconnectPageIdRef.current = null;
      const message = err instanceof Error ? err.message : '';
      showToast(
        message === 'not_ready'
          ? 'Facebook SDK ยังไม่พร้อม กรุณารอสักครู่'
          : 'ไม่ได้รับสิทธิ์จาก Facebook',
        'error',
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fb.login, showToast]);

  // Exchange FB token and fetch pages
  const exchangeFbToken = async (accessToken: string) => {
    setFbLoading(true);
    setFbPages([]);
    setSelectedPageIds(new Set());
    // อ่านแล้วล้างทันที — ไม่ว่ารอบนี้จะจบทางไหน ค่าต้องไม่ค้างไปรอบหน้า
    const reconnectPageId = reconnectPageIdRef.current;
    reconnectPageIdRef.current = null;

    try {
      const res = await apiFetch('/api/fb/oauth/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortLivedToken: accessToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Token exchange failed');

      if (data.pages && data.pages.length > 0) {
        const pages: FbPage[] = data.pages;
        setFbPages(pages);
        if (reconnectPageId) {
          // Facebook ให้สิทธิ์เฉพาะเพจที่ผู้ใช้ติ๊กในหน้าต่างของมัน — เพจที่ไม่ได้ติ๊กจะไม่อยู่ในลิสต์
          if (pages.some(p => p.id === reconnectPageId)) {
            setSelectedPageIds(new Set([reconnectPageId]));
          } else {
            const name = accounts.find(a => a.platform === 'facebook' && a.credentials.page_id === reconnectPageId)?.account_name || reconnectPageId;
            showToast(`Facebook ไม่ได้ให้สิทธิ์เพจ "${name}" ในรอบนี้ — กดเชื่อมต่อใหม่แล้วเลือกเพจนี้ในหน้าต่างของ Facebook`, 'error');
          }
        }
      } else {
        showToast('ไม่พบ Page ที่จัดการได้ กรุณาตรวจสอบสิทธิ์', 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      showToast(msg, 'error');
    } finally {
      setFbLoading(false);
    }
  };

  // Save selected FB pages as chat accounts
  // เพจที่เชื่อมอยู่แล้ว = **อัปเดต token ใบเดิม** (PUT merge) ห้ามลบแล้วเพิ่มใหม่ —
  // ลบทิ้งจะทำให้ห้องแชทเก่าหลุดจากบัญชี (fb_contacts.chat_account_id = NULL) และ sales_channels ซ้ำ
  const handleSaveFbPages = async (pages: FbPage[]) => {
    setFbSavingPage(true);
    let createdCount = 0;
    let updatedCount = 0;
    let failCount = 0;
    const capiNotReady: string[] = [];

    const buildCreds = (page: FbPage) => ({
      page_access_token: page.access_token,
      page_id: page.id,
      page_name: page.name,
      ...(page.username ? { page_username: page.username } : {}),
      ...(page.picture_url ? { page_picture_url: page.picture_url } : {}),
      ...(page.instagram ? {
        ig_account_id: page.instagram.id,
        ig_username: page.instagram.name,
        ig_profile_picture_url: page.instagram.profile_picture_url,
      } : {}),
    });

    const total = pages.length;
    let done = 0;
    const active = new Set<string>();
    const report = () => setFbSaveProgress({ done, total, active: [...active] });
    report();

    // 3 เพจพร้อมกัน — Meta/Vercel รับได้สบาย และเวลารวมลดจาก "จำนวนเพจ × หลายวิ" เหลือราวหนึ่งในสาม
    await parallelLimit(pages, async (page) => {
      active.add(page.name);
      report();
      try {
        const existing = accounts.find(a => a.platform === 'facebook' && a.credentials.page_id === page.id);
        let accountId: string | null = existing?.id ?? null;

        if (existing) {
          const response = await apiFetch('/api/chat-accounts', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: existing.id, credentials: buildCreds(page) }),
          });
          if (!response.ok) {
            failCount++;
            return;
          }
          updatedCount++;
        } else {
          const response = await apiFetch('/api/chat-accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: 'facebook',
              account_name: page.name,
              credentials: buildCreds(page),
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            failCount++;
            return;
          }
          accountId = data?.account?.id || null;
          createdCount++;
        }

        // Auto-subscribe webhook for this page
        try {
          await apiFetch('/api/fb/oauth/subscribe-webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pageId: page.id,
              pageAccessToken: page.access_token,
            }),
          });
        } catch {
          console.warn(`Auto webhook subscribe failed for ${page.name}`);
        }

        // ตรวจสิทธิ์ Conversions API ของ token ใบใหม่ทันที — ผลไปขึ้นเป็นป้ายบนการ์ดเพจ
        if (accountId) {
          try {
            const testRes = await apiFetch(`/api/chat-accounts/${accountId}/test`, { method: 'POST' });
            const testData = await testRes.json().catch(() => ({}));
            if (testData?.info?.capi && testData.info.capi.ready === false) capiNotReady.push(page.name);
          } catch { /* ตรวจไม่ได้ก็ไม่ใช่เหตุให้การเชื่อมต่อล้ม */ }
        }
      } catch {
        failCount++;
      } finally {
        active.delete(page.name);
        done++;
        report();
      }
    }, 3);
    setFbSaveProgress(null);

    const parts: string[] = [];
    if (updatedCount > 0) parts.push(`อัปเดตสิทธิ์ ${updatedCount} เพจ`);
    if (createdCount > 0) parts.push(`เชื่อมต่อใหม่ ${createdCount} เพจ`);
    if (parts.length > 0) {
      showToast(parts.join(' · ') + (failCount > 0 ? ` · ไม่สำเร็จ ${failCount} เพจ` : ''));
    } else {
      showToast('เชื่อมต่อไม่สำเร็จ', 'error');
    }
    if (capiNotReady.length > 0) {
      showToast(`CAPI ยังไม่พร้อม: ${capiNotReady.join(', ')} — ดูเหตุผลบนการ์ด`, 'error');
    }

    setFbPages([]);
    setSelectedPageIds(new Set());
    setFbSearch('');
    await fetchAccounts();
    setFbSavingPage(false);

    // เชื่อมเพจได้แล้ว = จังหวะเดียวที่ผู้ใช้กำลังคิดเรื่องนี้อยู่ — ถ้ายังไม่มีบัญชีโฆษณา
    // สักใบค่อยชวน (มีอยู่แล้วไม่ต้องกวน) · ถามไม่ได้ก็เงียบ ไม่ใช่เรื่องคอขาดบาดตาย
    if (createdCount + updatedCount > 0 && can(userProfile, 'masterdata.ad_accounts')) {
      try {
        const res = await apiFetch('/api/ads/accounts');
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.accounts) && data.accounts.length === 0) setShowAdsNudge(true);
      } catch { /* ไม่ต้องบอกอะไรผู้ใช้ — การชวนต่อล้มไม่ใช่ปัญหาของเขา */ }
    }
  };

  // Reset form
  const resetForm = () => {
    setAccountName('');
    setCredentials({});
    setShowFields({});
    setShowForm(false);
    setEditingId(null);
    setFormGuideOpen(false);
    setFbPages([]);
    setSelectedPageIds(new Set());
    setFbSearch('');
    setFbMode(FB_APP_ID ? 'oauth' : 'manual');
  };

  // Start adding
  const startAdd = () => {
    resetForm();
    setPendingLineId(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : null);
    setShowForm(true);
  };

  // Start editing (inline)
  const startEdit = (account: ChatAccount) => {
    setEditingId(account.id);
    setAccountName(account.account_name);
    const creds: Record<string, string> = {};
    const config = PLATFORM_CONFIG[account.platform];
    config.fields.forEach(f => {
      creds[f.key] = (account.credentials[f.key] as string) || '';
    });
    setCredentials(creds);
    setShowFields({});
    setShowForm(true);
    setFormGuideOpen(false);
  };

  // Save account
  const handleSave = async () => {
    const platform = editingId
      ? accounts.find(a => a.id === editingId)?.platform || activeTab
      : activeTab;

    if (!accountName.trim()) {
      showToast('กรุณากรอกชื่อ Account', 'error');
      return;
    }

    const config = PLATFORM_CONFIG[platform];
    const hasAllCreds = config.fields.every(f => credentials[f.key]?.trim());
    if (!editingId && !hasAllCreds) {
      showToast('กรุณากรอก Credentials ให้ครบ', 'error');
      return;
    }

    setSaving(true);
    let createdId: string | null = null;
    try {
      if (editingId) {
        const response = await apiFetch('/api/chat-accounts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId,
            account_name: accountName,
            credentials,
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update');
        }
      } else {
        const response = await apiFetch('/api/chat-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform,
            account_name: accountName,
            credentials,
            // LINE: ใช้ id ที่โชว์ใน Webhook URL ตอนกรอก — URL ที่คนวางไปแล้วใน LINE จะได้ตรงกับบัญชีจริง
            ...(platform === 'line' && pendingLineId ? { id: pendingLineId } : {}),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create');
        }
        createdId = data?.account?.id || data?.data?.id || data?.id || null;
      }
      const wasCreate = !editingId;
      resetForm();
      const list = await fetchAccounts();
      // LINE ที่เพิ่งสร้าง: Webhook URL เพิ่งมี (มี id ของบัญชี) — เปิดหน้าตั้งค่า Webhook ให้ต่อทันที
      // ไม่งั้นคนจะเข้าใจว่าเสร็จแล้ว ทั้งที่ยังไม่ได้ลงทะเบียน webhook ที่ LINE = ข้อความไม่เข้าระบบ
      const created = wasCreate && platform === 'line' && createdId ? list.find(a => a.id === createdId) : undefined;
      showToast(created
        ? 'เพิ่ม LINE OA แล้ว — อย่าลืมวาง Webhook URL ใน LINE Developers และเปิด Use webhook (กดแก้ไขบัญชีเพื่อดู URL อีกครั้งได้)'
        : wasCreate ? 'เพิ่ม Account สำเร็จ' : 'อัปเดตสำเร็จ');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ';
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Toggle active
  const handleToggleActive = async (account: ChatAccount) => {
    try {
      const response = await apiFetch('/api/chat-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: account.id,
          is_active: !account.is_active,
        }),
      });
      if (!response.ok) throw new Error('Failed to toggle');
      setAccounts(prev => prev.map(a =>
        a.id === account.id ? { ...a, is_active: !a.is_active } : a
      ));
    } catch {
      showToast('เปลี่ยนสถานะไม่สำเร็จ', 'error');
    }
  };

  // Shopee/Lazada: toggle chat for a connected marketplace shop
  const findMarketplaceChatAccount = (platform: MarketplaceChatPlatform, shop: ShopeeShop) =>
    accounts.filter(a => a.platform === platform).find(a => {
      const c = a.credentials as Record<string, unknown>;
      return c?.marketplace_account_id === shop.id || Number(c?.shop_id) === shop.shop_id;
    });

  // TikTok/Lazada: เริ่ม OAuth ขาแชท (app แชทแยกจาก app ออเดอร์) — จบแล้ว
  // callback เด้งกลับหน้านี้พร้อม ?{platform}_chat=... (token ผูกระดับบัญชี
  // ครอบคลุมทุกร้านของบัญชีนั้น)
  const [connectingChatAuth, setConnectingChatAuth] = useState(false);
  // กด back จากหน้า OAuth → หน้าเดิมถูก restore จาก bfcache พร้อม loading ค้าง
  useBfcacheReset(() => setConnectingChatAuth(false));
  const handleConnectMarketplaceChat = async (platform: MarketplaceChatPlatform) => {
    setConnectingChatAuth(true);
    try {
      // Shopee ไม่มี "app แชท" แยกแบบ TikTok/Lazada — เป็น app ของร้าน (seller) ที่ทำได้ทุกอย่าง
      // แต่เราขออนุญาตมาเพื่อใช้แชทอย่างเดียว จึงเข้าทาง ?app=seller
      const res = await apiFetch(platform === 'shopee'
        ? '/api/shopee/oauth/auth-url?app=seller'
        : `/api/${platform}/oauth/auth-url?app=chat`);
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
        return;
      }
      const data = await res.json().catch(() => ({}));
      showToast(typeof data.error === 'string' && data.error.includes('not configured')
        ? 'ระบบยังไม่ได้ตั้งค่า app แชทของแพลตฟอร์มนี้ — กรุณาแจ้งผู้ดูแลระบบ'
        : 'ไม่สามารถสร้างลิงก์เชื่อมต่อได้', 'error');
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
    setConnectingChatAuth(false);
  };

  const handleMarketplaceToggle = async (platform: MarketplaceChatPlatform, shop: ShopeeShop) => {
    setShopeeToggling(shop.id);
    try {
      const chatAccount = findMarketplaceChatAccount(platform, shop);
      if (chatAccount) {
        const response = await apiFetch('/api/chat-accounts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: chatAccount.id, is_active: !chatAccount.is_active }),
        });
        if (!response.ok) throw new Error('toggle failed');
        setAccounts(prev => prev.map(a => a.id === chatAccount.id ? { ...a, is_active: !a.is_active } : a));
      } else {
        const response = await apiFetch('/api/chat-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, marketplace_account_id: shop.id }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'create failed');
        }
        await fetchAccounts();
      }
      showToast('บันทึกแล้ว');
    } catch (e) {
      showToast(e instanceof Error && e.message !== 'toggle failed' && e.message !== 'create failed' ? e.message : 'เปลี่ยนสถานะไม่สำเร็จ', 'error');
    } finally {
      setShopeeToggling(null);
    }
  };

  // Delete account
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await apiFetch(`/api/chat-accounts?id=${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      showToast('ลบ Account สำเร็จ');
      setAccounts(prev => prev.filter(a => a.id !== id));
    } catch {
      showToast('ลบไม่สำเร็จ', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Test connection
  const handleTest = async (account: ChatAccount) => {
    setTestingId(account.id);
    setTestErrors(prev => ({ ...prev, [account.id]: '' }));
    setTestInfo(prev => {
      const next = { ...prev };
      delete next[account.id];
      return next;
    });
    try {
      const response = await apiFetch(`/api/chat-accounts/${account.id}/test`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setTestInfo(prev => ({ ...prev, [account.id]: data.info }));
        const capi = data.info?.capi as { ready: boolean; error: string | null } | undefined;
        showToast(capi?.ready ? 'เชื่อมต่อสำเร็จ · CAPI พร้อม' : 'เชื่อมต่อสำเร็จ');
        // แยกใบ — การเชื่อมต่อผ่าน แต่สิทธิ์ CAPI ไม่ผ่าน เป็นคนละเรื่องกัน
        if (capi && !capi.ready) showToast(`CAPI ยังไม่พร้อม: ${capi.error || 'ตรวจไม่ผ่าน'}`, 'error');
        await fetchAccounts();
      } else {
        setTestErrors(prev => ({ ...prev, [account.id]: data.error || 'เชื่อมต่อไม่สำเร็จ' }));
      }
    } catch {
      setTestErrors(prev => ({ ...prev, [account.id]: 'เกิดข้อผิดพลาดในการทดสอบ' }));
    } finally {
      setTestingId(null);
    }
  };

  const lineAccounts = accounts.filter(a => a.platform === 'line');
  const fbAccounts = accounts.filter(a => a.platform === 'facebook');
  const shopeeAccounts = accounts.filter(a => a.platform === 'shopee');
  const lazadaAccounts = accounts.filter(a => a.platform === 'lazada');
  const tiktokAccounts = accounts.filter(a => a.platform === 'tiktok');
  const tabAccounts = activeTab === 'line' ? lineAccounts : activeTab === 'shopee' ? shopeeAccounts : activeTab === 'lazada' ? lazadaAccounts : activeTab === 'tiktok' ? tiktokAccounts : fbAccounts;
  const tabConfig = PLATFORM_CONFIG[activeTab];

  // เพจใน picker เชื่อมอยู่กับใคร — 'current' = บริษัทนี้เชื่อมไว้แล้ว (เลือกซ้ำได้เพื่ออัปเดตสิทธิ์)
  // · 'other' = บริษัทอื่นถือไว้ (เลือกไม่ได้ 1 เพจ = 1 บัญชี)
  const fbConnectedPageIds = new Set(
    fbAccounts.map(a => a.credentials.page_id as string).filter(Boolean)
  );
  const pageConnectedBy = (page: FbPage): 'current' | 'other' | null =>
    page.connected_by ?? (fbConnectedPageIds.has(page.id) ? 'current' : null);

  const fbSelectedPages = fbPages.filter(p => selectedPageIds.has(p.id));
  const fbSelectedCurrent = fbSelectedPages.filter(p => pageConnectedBy(p) === 'current').length;
  // ป้ายปุ่มต้องบอกตรงกับสิ่งที่จะเกิดจริง — อัปเดตสิทธิ์ของเดิม / เชื่อมของใหม่ / ทั้งสองอย่าง
  const fbSubmitLabel = fbSelectedPages.length === 0
    ? 'เชื่อมต่อ Page'
    : fbSelectedCurrent === fbSelectedPages.length
      ? `อัปเดตสิทธิ์ ${fbSelectedPages.length} Page`
      : fbSelectedCurrent === 0
        ? `เชื่อมต่อ ${fbSelectedPages.length} Page`
        : `เชื่อมต่อ/อัปเดต ${fbSelectedPages.length} Page`;

  // Admin guard
  if (userProfile && !can(userProfile, 'masterdata.chat_channels')) {
    return (
      <Layout>
        <NoPermissionCard />
      </Layout>
    );
  }

  // Inline form fields based on current context
  const formPlatform = editingId
    ? accounts.find(a => a.id === editingId)?.platform || activeTab
    : activeTab;
  const formConfig = PLATFORM_CONFIG[formPlatform];

  // Render FB-styled add button — clicks straight into OAuth (no intermediate form)
  function renderFbAddButton() {
    return (
      <div className="space-y-2">
        <button
          onClick={handleFbLogin}
          disabled={!fbSdkReady || fbLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-facebook hover:bg-facebook-hover text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {fbLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <FacebookSolidIcon className="w-5 h-5" fill="currentColor" stroke="none" />
          )}
          {fbLoading ? 'กำลังดึงข้อมูล...' : 'เพิ่ม Facebook / IG Account'}
        </button>
        {/* Facebook ให้สิทธิ์เฉพาะเพจที่ติ๊กในหน้าต่างของมัน — เพจที่ไม่ได้ติ๊กจะเสียสิทธิ์ที่เคยให้ไว้ */}
        <p className="subtitle-text text-gray-500 dark:text-slate-400 text-center">
          ในหน้าต่างของ Facebook ให้เลือก &ldquo;เพจทั้งหมด&rdquo; หรือติ๊กทุกเพจที่เชื่อมอยู่ — เพจที่ไม่ได้ติ๊กจะเสียสิทธิ์เดิม
        </p>
        <div className="flex items-center justify-center">
          <button
            onClick={() => { setFbMode('manual'); setShowForm(true); }}
            className="helper-text text-gray-500 hover:text-primary transition-colors underline"
          >
            กรอกเอง (Manual)
          </button>
        </div>
      </div>
    );
  }

  // Render inline credential form (for add or edit — LINE always, FB manual mode)
  function renderInlineForm() {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 space-y-3">
        <div className="text-sm font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
          {formPlatform === 'line' ? (
            <PlatformIcon id="line" size={16} />
          ) : (
            <PlatformIcon id="facebook" size={16} />
          )}
          {editingId ? 'แก้ไข' : 'เพิ่ม'} {formConfig.label} Account
        </div>

        {/* Account Name */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">ชื่อ Account</label>
          <input
            type="text"
            value={accountName}
            onChange={e => setAccountName(e.target.value)}
            placeholder={formPlatform === 'line' ? 'เช่น ร้านหลัก LINE OA' : 'เช่น Main Page'}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        {/* Credential Fields — hide for FB edit (user doesn't need to see tokens) */}
        {(formPlatform === 'line' || !editingId) && (
          <>
            {formConfig.fields.map(field => (
              <div key={field.key}>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">{field.label}</label>
                <div className="relative">
                  <input
                    type={showFields[field.key] ? 'text' : 'password'}
                    value={credentials[field.key] || ''}
                    onChange={e => setCredentials(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFields(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    {showFields[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}

            {/* Webhook URL ตั้งแต่ตอนสร้าง — id สุ่มไว้แล้ว (pendingLineId) เซิร์ฟเวอร์จะใช้ id นี้ตอนบันทึก */}
            {formPlatform === 'line' && !editingId && pendingLineId && (
              <div className="bg-line/5 dark:bg-line/10 border border-line/30 rounded-lg p-3 space-y-2">
                <CopyField label="Webhook URL (เอาไปวางใน LINE Developers › Messaging API › Webhook settings)" value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/line/webhook?account=${pendingLineId}`} />
                <p className="text-xs text-gray-500 dark:text-slate-400">วางแล้วกด Verify → เปิด Use webhook · URL นี้ผูกกับบัญชีที่กำลังสร้าง กดบันทึกด้านล่างให้เสร็จด้วย ไม่งั้น LINE จะยิงมาแล้วไม่มีใครรับ</p>
              </div>
            )}

            {/* Guide toggle */}
            {formPlatform === 'line' && (
              <>
                <button
                  onClick={() => setFormGuideOpen(!formGuideOpen)}
                  className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 hover:text-primary transition-colors"
                >
                  <Zap className="w-4 h-4 text-primary" />
                  <span>วิธีหา Credentials</span>
                  {formGuideOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {formGuideOpen && (
                  <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-3 text-xs text-gray-600 dark:text-slate-400">
                    <div className="flex gap-2">
                      <StepNumber number={1} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">สร้าง / Login LINE Official Account</p>
                        <a href="https://manager.line.biz/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-line hover:underline">
                          <ExternalLink className="w-3 h-3" /> manager.line.biz (LINE OA Manager)
                        </a>
                        <p className="mt-1">มี OA อยู่แล้วก็ Login เข้าไปเลือกบัญชีนั้น · ยังไม่มีให้กด &ldquo;สร้าง LINE Official Account&rdquo; ในหน้านี้</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={2} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">เปิดใช้ Messaging API</p>
                        <p>LINE OA Manager &rarr; Settings (ตั้งค่า) &rarr; Messaging API &rarr; Enable &rarr; เลือก/สร้าง Provider &rarr; ตกลง</p>
                        <p className="mt-1">ขั้นนี้ LINE จะสร้าง Channel ให้ใน LINE Developers อัตโนมัติ (ผูกกับบัญชี LINE ที่ใช้ Login OA Manager)</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={3} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">เข้า LINE Developers Console แล้วคัดลอก Channel Secret</p>
                        <p>
                          <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-line hover:underline">
                            <ExternalLink className="w-3 h-3" /> developers.line.biz/console
                          </a>
                          {' '}&rarr; ถ้าเด้งไปหน้าแรก ให้กด <span className="font-medium">Console</span> มุมขวาบน แล้ว Login ด้วยบัญชี LINE <span className="font-medium">เดียวกับที่ใช้ใน OA Manager</span>
                        </p>
                        <p className="mt-1">เลือก Provider &rarr; เลือก Channel ของ OA &rarr; แท็บ Basic settings &rarr; Channel secret &rarr; Copy</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={4} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">คัดลอก Channel Access Token</p>
                        <p>Channel เดิม &rarr; แท็บ Messaging API &rarr; เลื่อนล่างสุด Channel access token (long-lived) &rarr; Issue &rarr; Copy</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={5} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">วาง Webhook URL (กล่องเขียวด้านบน) ใน LINE แล้วกดบันทึก</p>
                        <p>LINE Developers &rarr; แท็บ Messaging API &rarr; Webhook settings &rarr; Edit &rarr; วาง URL &rarr; Update &rarr; Verify &rarr; เปิด Use webhook · แล้วปิด Auto-response ใน OA Manager (Settings &rarr; Response settings) · ไม่ทำขั้นนี้ข้อความลูกค้าจะไม่เข้าระบบ</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Back to OAuth link (for FB manual mode) */}
            {formPlatform === 'facebook' && FB_APP_ID && !editingId && (
              <button
                onClick={() => { setFbMode('oauth'); setShowForm(false); }}
                className="text-xs text-gray-400 dark:text-slate-500 hover:text-facebook transition-colors underline"
              >
                กลับไปใช้ Login with Facebook
              </button>
            )}
          </>
        )}

        {/* Save / Cancel */}
        <div className="flex gap-2 pt-1">
          <SaveButton
            loading={saving}
            onClick={handleSave}
          />
          <Button variant="secondary" onClick={resetForm} icon={<X className="w-4 h-4" />}>
            ยกเลิก
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <Container size="full">
        <PageHeader
          title="ช่องทาง Chat"
          subtitle={`เชื่อมต่อ LINE OA, Facebook / Instagram${showMarketplaceChat ? ', Shopee, Lazada และ TikTok' : ''} เพื่อรับข้อความจากลูกค้า`}
          actions={
            /* ปุ่มเชื่อมหลักของแท็บที่เปิดอยู่ — บรรทัดเดียวกับ title ให้เหมือนหน้าอื่น
               (แท็บ marketplace ไม่มีปุ่มรวม — เป็นสวิตช์รายร้านในเนื้อหา) */
            activeTab === 'facebook' ? (
              <Button variant="primary" icon={<PlatformIcon id="facebook" size={16} mono />} loading={fbLoading} disabled={!fbSdkReady} onClick={handleFbLogin}>
                เชื่อมเพจ FB / IG
              </Button>
            ) : activeTab === 'line' ? (
              <Button variant="primary" icon={<PlatformIcon id="line" size={16} mono />} onClick={startAdd}>
                เพิ่ม LINE OA
              </Button>
            ) : undefined
          }
        />
        <Tabs
          activeKey={activeTab}
          onSelect={(key) => { setActiveTab(key as 'facebook' | 'line' | 'shopee' | 'lazada'); resetForm(); }}
          tabs={[
            {
              key: 'facebook',
              label: 'FB / IG',
              icon: <PlatformIcon id="facebook" size={16} />,
              count: fbAccounts.length || undefined,
              activeColorClass: 'border-facebook text-facebook',
            },
            {
              key: 'line',
              label: 'LINE',
              icon: <PlatformIcon id="line" size={16} />,
              count: lineAccounts.length || undefined,
              activeColorClass: 'border-line text-line',
            },
            ...(showMarketplaceChat ? [
              {
                key: 'shopee',
                label: 'Shopee',
                icon: <PlatformIcon id="shopee" size={16} />,
                count: mpShops.shopee.length || undefined,
                activeColorClass: 'border-[#EE4D2D] text-[#EE4D2D]',
              },
              {
                key: 'lazada',
                label: 'Lazada',
                icon: <PlatformIcon id="lazada" size={16} />,
                count: mpShops.lazada.length || undefined,
                activeColorClass: 'border-[#0F146E] text-[#0F146E] dark:border-blue-400 dark:text-blue-400',
              },
              {
                key: 'tiktok',
                label: 'TikTok',
                icon: <PlatformIcon id="tiktok" size={16} />,
                count: mpShops.tiktok.length || undefined,
                activeColorClass: 'border-[#161823] text-[#161823] dark:border-slate-300 dark:text-slate-300',
              },
            ] : []),
          ]}
        />

        {loading ? (
          <LoadingCard />
        ) : (showMarketplaceChat && (activeTab === 'shopee' || activeTab === 'lazada' || activeTab === 'tiktok')) ? (() => {
          const platform = activeTab as MarketplaceChatPlatform;
          const platformLabel = platform === 'shopee' ? 'Shopee' : platform === 'lazada' ? 'Lazada' : 'TikTok Shop';
          const shops = mpShops[platform];
          return (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-300">
                แชท {platformLabel} ใช้การเชื่อมต่อร้านจากหน้า Integrations โดยตรง — เปิดสวิตช์เพื่อรับแชทของร้านนั้นเข้าหน้ารวมแชท
                {platform === 'shopee'
                  ? ' ⚠️ Shopee ให้ Chat API เฉพาะ app ประเภท "Seller In House" ที่จดในนามบัญชีร้านเอง (นโยบาย 18 พ.ย. 2024) — บริษัทต้องมี app ของตัวเอง แล้วกด "เชื่อมต่อแชท" ทีละร้าน · ข้อความใหม่เข้าอัตโนมัติผ่าน webhook'
                  : platform === 'lazada'
                    ? ' ข้อความใหม่จะเข้าอัตโนมัติผ่าน webhook (ต้องตั้ง Callback URL ใน Lazada Open Platform > Push Mechanism)'
                    : ' ข้อความใหม่จะเข้าอัตโนมัติผ่าน webhook (ต้องเปิด event NEW_MESSAGE ใน TikTok Partner Center > Webhooks)'}
              </div>
              {platform === 'shopee' && (!shopeeAppLoaded ? <LoadingCard /> : (
                <Card>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="heading-4">app แชท Shopee ของบริษัท</h3>
                      <p className="section-desc">
                        จด app ประเภท <strong>Seller In House</strong> ที่ open.shopee.com ด้วยบัญชีร้านของคุณเอง แล้วเอา Partner ID/Key มาใส่ที่นี่
                        — app กลางของระบบใช้แทนไม่ได้ เพราะ Shopee ผูก Chat API ไว้กับบัญชี seller ที่จด app
                      </p>
                    </div>
                    {shopeeApp && !shopeeAppEditing && (
                      <Button size="sm" variant="secondary" icon={<Edit2 className="w-4 h-4" />} onClick={() => {
                        setShopeeAppEditing(true);
                        setShopeeAppForm({
                          partner_id: String(shopeeApp.partner_id), partner_key: '', push_key: '',
                          env: shopeeApp.env, usage: shopeeApp.usage, label: shopeeApp.label || '',
                        });
                      }}>แก้ไข</Button>
                    )}
                  </div>

                  {shopeeApp && !shopeeAppEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        <div><span className="helper-text text-gray-500">Partner ID</span><p>{shopeeApp.partner_id}</p></div>
                        <div><span className="helper-text text-gray-500">Environment</span><p>{shopeeApp.env === 'sandbox' ? 'Sandbox (test shop เท่านั้น)' : 'Production'}</p></div>
                        <div><span className="helper-text text-gray-500">Partner Key</span><p>{shopeeApp.partner_key_masked}</p></div>
                        <div>
                          <span className="helper-text text-gray-500">Live Push Partner Key</span>
                          <p>{shopeeApp.has_push_key ? shopeeApp.push_key_masked : 'ใช้ Partner Key ใบเดียวกัน'}</p>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="helper-text text-gray-500">ใช้ app นี้กับ</span>
                          <p>{shopeeApp.usage === 'chat'
                            ? 'แชทอย่างเดียว — ออเดอร์/สินค้าผ่าน app กลางของระบบ'
                            : 'ทุกอย่าง — ออเดอร์ สินค้า แชท (ร้านเชื่อมผ่าน app นี้โดยตรง)'}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <Button size="sm" variant="secondary" loading={shopeeAppPushing} onClick={applyShopeePushConfig}>
                          ตั้งค่า push (webchat)
                        </Button>
                        {shopeeApp.last_push_config_check && (
                          <p className="helper-text text-gray-500">
                            {shopeeApp.last_push_config_check.ok === false
                              ? `ล่าสุดล้มเหลว: ${shopeeApp.last_push_config_check.error || '-'}`
                              : `push ที่เปิดอยู่: ${(shopeeApp.last_push_config_check.config?.push_config_on_list || []).join(', ') || '-'}`}
                            {shopeeApp.last_push_config_check.config?.live_push_status
                              ? ` · สถานะ: ${shopeeApp.last_push_config_check.config.live_push_status}`
                              : ''}
                          </p>
                        )}
                      </div>
                      {/* บอกจาก **โหมดที่ตั้งไว้** ไม่ใช่ผลการตั้งครั้งก่อน — เปลี่ยนโหมดแล้วยังไม่กดปุ่ม
                          ต้องอ่านออกว่ากดแล้วจะได้อะไร */}
                      <p className="helper-text text-gray-500">
                        {shopeeApp.usage === 'full'
                          ? 'โหมด "ทุกอย่าง": เปิด push ครบทุก code ที่ระบบรองรับ และ block ร้านที่เชื่อมผ่าน app นี้ที่ app กลาง กันออเดอร์เข้าสองใบ'
                          : 'โหมด "แชทอย่างเดียว": เปิดเฉพาะ code 10 (แชท) และปิด code อื่นที่ค้างอยู่ — ออเดอร์/สินค้าเข้าทาง app กลางของระบบ'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormInput
                          label="Partner ID" required value={shopeeAppForm.partner_id}
                          onChange={(e) => setShopeeAppForm(f => ({ ...f, partner_id: e.target.value }))}
                          placeholder="เช่น 2043961"
                        />
                        <div>
                          <label className="field-label">Environment</label>
                          <FormSelect
                            value={shopeeAppForm.env}
                            onChange={(v) => setShopeeAppForm(f => ({ ...f, env: v }))}
                            options={[
                              { id: 'production', label: 'Production (ร้านจริง)' },
                              { id: 'sandbox', label: 'Sandbox (test shop เท่านั้น)' },
                            ]}
                          />
                        </div>
                        <FormInput
                          label="Partner Key" type="password" value={shopeeAppForm.partner_key}
                          onChange={(e) => setShopeeAppForm(f => ({ ...f, partner_key: e.target.value }))}
                          hint={shopeeApp ? 'เว้นว่าง = ใช้ใบเดิม' : undefined}
                          placeholder="Live Partner Key จากหน้า App ใน Shopee Open Platform"
                        />
                        <FormInput
                          label="Live Push Partner Key" type="password" value={shopeeAppForm.push_key}
                          onChange={(e) => setShopeeAppForm(f => ({ ...f, push_key: e.target.value }))}
                          hint="เว้นว่าง = ใช้ Partner Key ใบเดียวกัน"
                          placeholder="ถ้า Shopee ออกคีย์ push แยก"
                        />
                        {/* โหมดของ app — ตัวนี้คุมทั้ง push ที่เปิด และลำดับปุ่มเชื่อมร้านในหน้าช่องทางการขาย
                            ยังไม่เคยเลือก = โชว์ค่าที่ระบบจะเลือกให้ตามสภาพร้าน (ค่าเดียวกับฝั่ง server) */}
                        <div className="sm:col-span-2">
                          <label className="field-label">ใช้ app นี้กับ</label>
                          <FormSelect
                            value={shopeeAppForm.usage || shopeeUsageDefault}
                            onChange={(v) => setShopeeAppForm(f => ({ ...f, usage: v }))}
                            options={[
                              { id: 'full', label: 'ทุกอย่าง — ออเดอร์ สินค้า แชท (ร้านเชื่อมผ่าน app นี้โดยตรง)' },
                              { id: 'chat', label: 'แชทอย่างเดียว — ออเดอร์/สินค้าผ่าน app กลางของระบบ' },
                            ]}
                          />
                        </div>
                      </div>
                      <p className="helper-text text-gray-500">
                        Live Push Partner Key ต้องกดสร้างเองใน Shopee Open Platform ที่ <strong>Push Mechanism › Set Push</strong>
                        — ถ้าไม่ได้กดสร้าง Shopee จะเซ็น push ด้วย Partner Key ใบเดิม (เว้นช่องนี้ไว้ได้)
                      </p>
                      <div className="flex justify-end gap-3">
                        {shopeeApp && (
                          <Button variant="secondary" onClick={() => setShopeeAppEditing(false)}>ยกเลิก</Button>
                        )}
                        <SaveButton loading={shopeeAppSaving} onClick={saveShopeeApp} />
                      </div>
                    </div>
                  )}
                </Card>
              ))}

              {!mpShopsLoaded ? (
                <LoadingCard />
              ) : shops.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 text-center space-y-2">
                  <p className="text-sm text-gray-600 dark:text-slate-300">ยังไม่มีร้าน {platformLabel} ที่เชื่อมต่อ</p>
                  <a href="/settings/sales-channels?tab=marketplace" className="text-sm text-primary underline">ไปเชื่อมต่อร้าน {platformLabel} ที่หน้า ช่องทางการขาย</a>
                </div>
              ) : (
                shops.map(shop => {
                  const chatAccount = findMarketplaceChatAccount(platform, shop);
                  const chatEnabled = !!chatAccount?.is_active;
                  // ทุกแพลตฟอร์ม: token แชทมาจาก OAuth ขาแชทแยก — ยังไม่เชื่อมต้องพาไปอนุญาตก่อน
                  // สวิตช์เปิดไปก็เป็นช่องแชทที่ใช้ไม่ได้ (API ส่ง chat_connected=true ให้เอง
                  // เมื่อร้านนั้นใช้ token ชุดหลักคุยแชทได้อยู่แล้ว)
                  const needsChatAuth = shop.chat_connected === false;
                  // ร้านที่ authorize ทั้งร้านมาด้วย app ของบริษัทเอง — แชทเกาะ token ชุดหลักได้เลย
                  const onSellerApp = platform === 'shopee' && shop.metadata?.shopee_app === 'seller';
                  // ยังไม่มี app ของบริษัท = กดเชื่อมต่อแชทไปก็เด้ง ต้องกรอก app ในการ์ดข้างบนก่อน
                  const shopeeAppMissing = platform === 'shopee' && shopeeAppLoaded && !shopeeApp;
                  const shopeeAppUsageFull = platform === 'shopee' && shopeeApp?.usage === 'full';
                  return (
                    <div key={shop.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-3 py-2.5 flex items-center gap-3">
                      <ChannelBadge
                        size="md"
                        channel={{ platform, picture_url: (shop.metadata?.shop_logo as string) || null }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate flex items-center gap-1.5">
                          <span className="truncate">{shop.shop_name || `${platformLabel} ${shop.shop_id}`}</span>
                          {onSellerApp && <Badge tone="indigo" size="sm">app ของร้าน</Badge>}
                        </p>
                        <p className="helper-text text-gray-500">
                          Shop ID: {shop.shop_id}
                          {needsChatAuth
                            ? (shop.chat_expired ? ' · การเชื่อมต่อแชทหมดอายุ' : ' · ยังไม่ได้เชื่อมต่อแชท')
                            : chatEnabled ? ' · รับแชทอยู่' : ''}
                        </p>
                      </div>
                      {needsChatAuth && shopeeAppMissing ? (
                        <Tooltip text="กรอก app แชท Shopee ของบริษัทในการ์ดด้านบนก่อน แล้วปุ่มนี้ถึงจะใช้ได้" box="inline-flex">
                          <Button size="sm" variant="secondary" disabled>เชื่อมต่อแชท</Button>
                        </Tooltip>
                      ) : needsChatAuth && shopeeAppUsageFull ? (
                        // โหมด "ทุกอย่าง" แต่ร้านนี้ยังไม่มี token แชท = ร้านนี้ยังอยู่บน app กลาง
                        // ต่อ token แชทเพิ่มให้ก็ผิดโครง (โหมดนี้ตั้งใจให้ทุกอย่างมาทาง app ของร้าน)
                        <p className="helper-text text-gray-500 max-w-[16rem] text-right">
                          ร้านนี้เชื่อมผ่าน app กลาง — เชื่อมร้านใหม่ผ่าน app ของร้าน หรือเปลี่ยนโหมดเป็นแชทอย่างเดียว
                        </p>
                      ) : needsChatAuth ? (
                        <Button size="sm" variant="secondary" loading={connectingChatAuth} onClick={() => handleConnectMarketplaceChat(platform)}>
                          {shop.chat_expired ? 'เชื่อมต่อแชทใหม่' : 'เชื่อมต่อแชท'}
                        </Button>
                      ) : shopeeToggling === shop.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : (
                        <Toggle checked={chatEnabled} onChange={() => handleMarketplaceToggle(platform, shop)} />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })() : (
          <div className="space-y-4">
            {showAdsNudge && activeTab === 'facebook' && (
              <Alert tone="success" onClose={() => setShowAdsNudge(false)}>
                <div className="space-y-3">
                  <p>เชื่อมเพจแล้ว — จะเชื่อมบัญชีโฆษณา Meta ต่อเลยไหม? ระบบจะส่ง Purchase ให้โฆษณา Click-to-Messenger เรียนรู้ และ sync กลุ่มเป้าหมายได้</p>
                  <div className="flex items-center gap-2">
                    <Button variant="primary" size="sm" onClick={() => router.push('/settings/ad-accounts?connect=1')}>
                      เชื่อมบัญชีโฆษณา
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowAdsNudge(false)}>ไว้ทีหลัง</Button>
                  </div>
                </div>
              </Alert>
            )}

            {/* Account Cards */}
            {tabAccounts.map(account => {
              const card = renderAccountCard(account);
              const isLast = account === tabAccounts[tabAccounts.length - 1];

              // FB OAuth: button triggers OAuth directly (no intermediate form); manual mode uses inline form.
              const isFbOAuthAdd = activeTab === 'facebook' && fbMode === 'oauth' && !editingId;
              const showAddForm = isLast && showForm && !editingId && !isFbOAuthAdd;
              const showAddButton = isLast && (isFbOAuthAdd || !showForm);

              return (
                <div key={account.id} className="space-y-4">
                  {card}
                  {/* Add button after last card */}
                  {showAddButton && (
                    isFbOAuthAdd ? renderFbAddButton() : (
                      <button
                        onClick={startAdd}
                        className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        เพิ่ม {tabConfig.label} Account
                      </button>
                    )
                  )}
                  {/* Manual form (FB manual mode or LINE) after last card */}
                  {showAddForm && renderInlineForm()}
                </div>
              );
            })}

            {/* If no accounts, show add button or form */}
            {tabAccounts.length === 0 && (() => {
              const isFbOAuthAdd = activeTab === 'facebook' && fbMode === 'oauth' && !editingId;
              if (isFbOAuthAdd) return renderFbAddButton();
              if (showForm && !editingId) return renderInlineForm();
              return (
                <button
                  onClick={startAdd}
                  className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่ม {tabConfig.label} Account
                </button>
              );
            })()}
          </div>
        )}
      </Container>
      {confirmDialog}

      {/* Facebook Page selection modal — opens after OAuth returns pages */}
      <Modal
        open={fbPages.length > 0}
        onClose={() => { setFbPages([]); setSelectedPageIds(new Set()); setFbSearch(''); }}
        title={`เลือก Page ที่ต้องการเชื่อมต่อ (${fbPages.length} Pages)`}
        icon={<FacebookSolidIcon className="w-5 h-5 text-facebook" fill="currentColor" stroke="none" />}
        size="xl"
        disableBackdropClose={fbSavingPage}
        hideCloseButton={fbSavingPage}
        footer={
          <div className="flex gap-2 justify-end p-4">
            <Button
              variant="secondary"
              onClick={() => { setFbPages([]); setSelectedPageIds(new Set()); setFbSearch(''); }}
              disabled={fbSavingPage}
              icon={<X className="w-4 h-4" />}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={() => {
                if (fbSelectedPages.length > 0) handleSaveFbPages(fbSelectedPages);
              }}
              disabled={fbSelectedPages.length === 0 || fbSavingPage}
              loading={fbSavingPage}
              icon={!fbSavingPage ? <Check className="w-4 h-4" /> : undefined}
              className="!bg-facebook hover:!bg-facebook-hover"
            >
              {fbSavingPage ? 'กำลังเชื่อมต่อ...' : fbSubmitLabel}
            </Button>
          </div>
        }
      >
        <div className="p-4 space-y-3">
          <Alert tone="info">
            <span className="subtitle-text">
              เพจที่เชื่อมอยู่แล้วเลือกได้เพื่ออัปเดตสิทธิ์ — ใช้เมื่อ Facebook ขอสิทธิ์เพิ่ม เช่น Conversions API · ข้อมูลแชทและการตั้งค่าเดิมไม่หาย
            </span>
          </Alert>

          {/* Search box */}
          {fbPages.length > 5 && (
            <SearchInput
              value={fbSearch}
              onChange={setFbSearch}
              placeholder="ค้นหา Page..."
              ringColor="focus:ring-facebook"
            />
          )}

          {/* Page list — capped height so modal stays compact */}
          <div className="max-h-[55vh] overflow-y-auto space-y-1 -mx-1 px-1">
            {(() => {
              return fbPages
                .filter(p => !fbSearch || p.name.toLowerCase().includes(fbSearch.toLowerCase()) || p.id.includes(fbSearch))
                .map(page => {
                  const connectedBy = pageConnectedBy(page);
                  // เชื่อมอยู่กับบริษัทนี้ = เลือกได้ตามปกติ (ทับ token ใบเดิม) — ที่กดไม่ได้มีแค่เพจของบริษัทอื่น
                  const isConnected = connectedBy === 'other';
                  const remark = connectedBy === 'other' ? 'มีบัญชีอื่นเชื่อมต่อไปแล้ว' : null;
                  return (
                    <button
                      key={page.id}
                      onClick={() => {
                        if (isConnected) return;
                        setSelectedPageIds(prev => {
                          const next = new Set(prev);
                          if (next.has(page.id)) next.delete(page.id);
                          else next.add(page.id);
                          return next;
                        });
                      }}
                      disabled={isConnected}
                      title={connectedBy === 'other' ? 'Page นี้ถูกเชื่อมต่อกับบัญชีอื่นในระบบแล้ว — 1 Page เชื่อมต่อได้ทีละ 1 บัญชี' : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                        isConnected
                          ? 'opacity-50 cursor-not-allowed'
                          : selectedPageIds.has(page.id)
                            ? 'bg-orange-50 dark:bg-orange-900/30'
                            : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        {page.picture_url ? (
                          <img src={page.picture_url} alt={page.name} className={`w-9 h-9 rounded-full ${isConnected ? 'grayscale' : ''}`} />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-facebook/10 flex items-center justify-center">
                            <PlatformIcon id="facebook" size={16} />
                          </div>
                        )}
                        {page.instagram && (
                          <img
                            src={page.instagram.profile_picture_url}
                            alt={page.instagram.name}
                            className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white dark:border-slate-800 ${isConnected ? 'grayscale' : ''}`}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`body-text font-medium truncate ${isConnected ? 'text-gray-400 dark:text-slate-500' : 'text-gray-900 dark:text-white'}`}>{page.name}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="helper-text text-gray-400 dark:text-slate-500">{page.id}</span>
                          {page.instagram && (
                            <span className={`helper-text ${isConnected ? 'text-gray-400 dark:text-slate-500' : 'text-pink-500'}`}>• IG @{page.instagram.name}</span>
                          )}
                        </div>
                      </div>
                      {remark ? (
                        <span className="subtitle-text flex-shrink-0 whitespace-nowrap text-amber-600 dark:text-amber-400">
                          {remark}
                        </span>
                      ) : selectedPageIds.has(page.id) ? (
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      ) : connectedBy === 'current' ? (
                        <Badge tone="blue" size="sm" className="flex-shrink-0">อัปเดตสิทธิ์</Badge>
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-slate-600 flex-shrink-0" />
                      )}
                    </button>
                  );
                });
            })()}
          </div>
        </div>
      </Modal>

      {/* ความคืบหน้าตอนเชื่อม/อัปเดตสิทธิ์หลายเพจ — บังจอกันกดซ้ำ + บอกว่าถึงเพจไหนแล้ว */}
      <LoadingOverlay
        isOpen={!!fbSaveProgress}
        title={fbSaveProgress ? `กำลังเชื่อมต่อ/อัปเดตสิทธิ์ ${fbSaveProgress.done}/${fbSaveProgress.total} เพจ` : ''}
        message={fbSaveProgress && fbSaveProgress.active.length > 0 ? `กำลังทำ: ${fbSaveProgress.active.join(' · ')}` : undefined}
        progress={fbSaveProgress ? Math.round((fbSaveProgress.done / Math.max(fbSaveProgress.total, 1)) * 100) : undefined}
        showWarning={false}
      />

      {/* Test-connection loading modal — visible while the test API is running */}
      <Modal
        open={!!testingId}
        onClose={() => { /* not closeable — auto-dismisses when API resolves */ }}
        size="sm"
        hideCloseButton
        disableBackdropClose
      >
        <div className="p-6 flex flex-col items-center text-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <div>
            <p className="body-text font-medium text-gray-900 dark:text-white">กำลังทดสอบการเชื่อมต่อ</p>
            {(() => {
              const target = accounts.find(a => a.id === testingId);
              return target ? (
                <p className="subtitle-text text-gray-500 dark:text-slate-400 mt-1">{target.account_name}</p>
              ) : null;
            })()}
          </div>
        </div>
      </Modal>

      {/* Edit account modal — opens when user clicks pencil icon on an account card */}
      <Modal
        open={!!editingId && showForm}
        onClose={resetForm}
        title={`แก้ไข ${formConfig.label} Account`}
        icon={formPlatform === 'line' ? <PlatformIcon id="line" size={18} /> : <FacebookSolidIcon className="w-5 h-5 text-facebook" fill="currentColor" stroke="none" />}
        size="lg"
        disableBackdropClose={saving}
        hideCloseButton={saving}
        footer={
          <div className="flex gap-2 justify-end p-4">
            <Button variant="secondary" onClick={resetForm} disabled={saving} icon={<X className="w-4 h-4" />}>
              ยกเลิก
            </Button>
            <SaveButton onClick={handleSave} loading={saving} />
          </div>
        }
      >
        <div className="p-4 space-y-3">
          {/* Account Name */}
          <div>
            <label className="field-label">ชื่อ Account</label>
            <input
              type="text"
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
              placeholder={formPlatform === 'line' ? 'เช่น ร้านหลัก LINE OA' : 'เช่น Main Page'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>

          {/* LINE credentials — FB tokens are managed by OAuth so we don't expose them */}
          {formPlatform === 'line' && formConfig.fields.map(field => (
            <div key={field.key}>
              <label className="field-label">{field.label}</label>
              <div className="relative">
                <input
                  type={showFields[field.key] ? 'text' : 'password'}
                  value={credentials[field.key] || ''}
                  onChange={e => setCredentials(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowFields(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  {showFields[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}

          {/* LINE webhook URL — needed for LINE Developers Console setup */}
          {editingId && formPlatform === 'line' && (() => {
            const editingAccount = accounts.find(a => a.id === editingId);
            if (!editingAccount) return null;
            return (
              <>
                <CopyField label="Webhook URL" value={editingAccount.webhook_url} />

                <button
                  onClick={() => setFormGuideOpen(!formGuideOpen)}
                  className="flex items-center gap-2 subtitle-text text-gray-500 dark:text-slate-400 hover:text-primary transition-colors"
                >
                  <Zap className="w-4 h-4 text-primary" />
                  <span>วิธีตั้งค่า Webhook</span>
                  {formGuideOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {formGuideOpen && (
                  <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-3 helper-text text-gray-600 dark:text-slate-400">
                    <div className="flex gap-2">
                      <StepNumber number={1} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white subtitle-text">เปิด LINE Developers Console</p>
                        <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-line hover:underline">
                          <ExternalLink className="w-3 h-3" /> developers.line.biz/console
                        </a>
                        <p className="mt-1">ถ้าเด้งไปหน้าแรก กด <span className="font-medium">Console</span> มุมขวาบนแล้ว Login ด้วยบัญชี LINE เดียวกับ OA Manager &rarr; เลือก Provider &rarr; Channel ของ OA นี้ &rarr; แท็บ Messaging API &rarr; Webhook settings &rarr; Edit</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={2} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white subtitle-text">วาง Webhook URL ด้านบน &rarr; Update &rarr; กด Verify &rarr; เปิดสวิตช์ Use webhook</p>
                        <p>Verify ต้องขึ้น Success — ถ้าไม่ ให้เช็คว่า Channel secret / Access token ที่กรอกไว้ตรงกับ Channel นี้</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={3} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white subtitle-text">ปิดข้อความตอบกลับอัตโนมัติของ LINE (จำเป็น ไม่งั้นลูกค้าได้ 2 คำตอบ)</p>
                        <p>LINE OA Manager &rarr; Settings &rarr; Response settings &rarr; Chat = เปิด · Auto-response = ปิด · Webhooks = เปิด</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={4} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white subtitle-text">ทดสอบ</p>
                        <p>ทักหา OA จากมือถือ 1 ข้อความ &rarr; ต้องเห็นในหน้าแชทของระบบภายในไม่กี่วินาที</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </Modal>
    </Layout>
  );

  // Render account card
  function renderAccountCard(account: ChatAccount) {
    const config = PLATFORM_CONFIG[account.platform];
    const info = testInfo[account.id];
    const errorMsg: string | undefined = testErrors[account.id];
    const isTesting = testingId === account.id;

    // Bot/Page info from credentials
    const botName = (account.platform === 'line'
      ? account.credentials.bot_name
      : account.credentials.page_name) as string | undefined;
    const fbPageId = account.credentials.page_id as string | undefined;
    const botPicture = (account.platform === 'line'
      ? account.credentials.bot_picture_url as string | undefined
      : fbPageId
        ? `https://graph.facebook.com/${fbPageId}/picture?type=small`
        : account.credentials.page_picture_url as string | undefined);
    const basicIdRaw = account.credentials.basic_id as string | undefined;
    const premiumId = account.credentials.premium_id as string | undefined;
    // premium ID (@abcthebaby) คือชื่อที่ร้านใช้จริง — โชว์ก่อน basic ID (@vyq5483e) ที่ LINE สุ่มให้
    const basicId = premiumId || basicIdRaw;
    // LINE: token ผิดตั้งแต่ตอนบันทึก = ไม่มีชื่อ/รูป OA และส่งข้อความไม่ได้ — ต้องบอกบนการ์ด ไม่ใช่รูปว่างเงียบ ๆ
    const lineProfileError = account.platform === 'line' ? (account.credentials.bot_profile_error as string | undefined) : undefined;
    const pageId = account.credentials.page_id as string | undefined;
    const pageUsername = account.credentials.page_username as string | undefined;
    const igAccountId = account.credentials.ig_account_id as string | undefined;
    const igUsername = account.credentials.ig_username as string | undefined;
    const igPicture = account.credentials.ig_profile_picture_url as string | undefined;
    const health = account.health_status ? HEALTH_BADGE[account.health_status] : undefined;

    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
        {/* Account Header */}
        <div className="flex items-center gap-3 p-4">
          {/* Avatar / Platform Icon — clickable to refresh picture */}
          <button
            type="button"
            onClick={() => handleTest(account)}
            disabled={isTesting}
            className="relative flex-shrink-0 group cursor-pointer"
            title="กดเพื่ออัพเดตรูปโปรไฟล์"
          >
            <div className="group-hover:opacity-75 transition-opacity">
              <ChannelBadge size="md" channel={{ platform: account.platform, picture_url: botPicture || null }} />
            </div>
            {igPicture && (
              <img
                src={igPicture}
                alt={igUsername || 'IG'}
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white dark:border-slate-800"
                // รูปโปรไฟล์ IG จาก Graph API หมดอายุได้ — ตายแล้วซ่อนตัวเอง ไม่ปล่อยรูปแตก
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            {isTesting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full">
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              </div>
            )}
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-gray-900 dark:text-white truncate">{account.account_name}</p>
              {botName && botName !== account.account_name ? (
                <span className="text-xs text-gray-400 dark:text-slate-500 truncate">({botName})</span>
              ) : null}
              {health ? (
                <Tooltip text={`${account.health_detail || health.label}${account.health_checked_at ? `\nตรวจเมื่อ ${formatThaiDateTime(account.health_checked_at)}` : ''}`}>
                  <Badge tone={health.tone} size="sm">{health.label}</Badge>
                </Tooltip>
              ) : null}
              {/* Conversions API — token ที่ออกก่อนมี scope `page_events` ผ่านทุกอย่างยกเว้นอันนี้
                  ⇒ ต้องบอกบนการ์ด ไม่งั้นโฆษณา Click-to-Messenger จะ optimize ไม่ได้แบบเงียบ ๆ */}
              {account.platform === 'facebook' ? (() => {
                const checkedAt = account.credentials.meta_capi_checked_at as string | undefined;
                const when = checkedAt ? `\nตรวจเมื่อ ${formatThaiDateTime(checkedAt)}` : '';
                const capiError = account.credentials.meta_capi_error as string | undefined;
                const datasetId = account.credentials.meta_dataset_id as string | undefined;
                if (capiError) {
                  return (
                    <Tooltip text={`${capiError}${when}\nแก้: เมนู › เชื่อมต่อใหม่ (ขอสิทธิ์ใหม่)`}>
                      <Badge tone="amber" size="sm">CAPI ยังไม่พร้อม</Badge>
                    </Tooltip>
                  );
                }
                if (datasetId) {
                  return (
                    <Tooltip text={`Conversions API ส่ง Purchase ให้เพจนี้ได้${when}`}>
                      <Badge tone="emerald" size="sm">CAPI พร้อม</Badge>
                    </Tooltip>
                  );
                }
                return (
                  <Tooltip text="กดรูปโปรไฟล์เพื่อทดสอบการเชื่อมต่อ — ระบบจะตรวจสิทธิ์ Conversions API ให้ด้วย">
                    <Badge tone="gray" size="sm">ยังไม่ตรวจ CAPI</Badge>
                  </Tooltip>
                );
              })() : null}
              {/* ข้อความการตลาด (Marketing Messages · ทดลอง) — "ทดสอบเชื่อมต่อ" จดจาก debug_token ของ token เพจ */}
              {account.platform === 'facebook' && account.credentials.meta_marketing_messages === true ? (
                <Tooltip text={`token ของเพจนี้มีสิทธิ์ส่งข้อความการตลาด (Marketing Messages · ทดลอง)${account.credentials.meta_marketing_checked_at ? `\nตรวจเมื่อ ${formatThaiDateTime(account.credentials.meta_marketing_checked_at as string)}` : ''}`}>
                  <Badge tone="indigo" size="sm">ข้อความการตลาด</Badge>
                </Tooltip>
              ) : null}
            </div>
            <div className="flex items-center gap-2 subtitle-text text-gray-500 dark:text-slate-400">
              {account.platform === 'line' ? (
                <>
                <span className="inline-flex items-center gap-1">
                  <PlatformIcon id="line" size={14} />
                  <span className="text-line dark:text-line">LINE</span>
                  {basicId ? <span className="text-gray-500 dark:text-slate-400">{basicId.startsWith('@') ? basicId : `@${basicId}`}</span> : null}
                  {premiumId && basicIdRaw ? <span className="text-gray-400 dark:text-slate-500">({basicIdRaw})</span> : null}
                </span>
                {lineProfileError ? (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <XCircle className="w-3.5 h-3.5" /> {lineProfileError}
                  </span>
                ) : null}
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1">
                    <PlatformIcon id="facebook" size={14} />
                    <span className="text-facebook dark:text-facebook">
                      {pageUsername ? `@${pageUsername}` : 'Facebook'}
                    </span>
                  </span>
                  {igUsername ? (
                    <span className="inline-flex items-center gap-1">
                      <PlatformIcon id="instagram" size={14} />
                      <span className="text-pink-500">@{igUsername}</span>
                    </span>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Toggle checked={account.is_active} onChange={() => handleToggleActive(account)} />
            <button
              onClick={() => startEdit(account)}
              className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
              title="แก้ไขชื่อ"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <ActionMenu
              items={[
                {
                  key: 'test',
                  label: isTesting ? 'กำลังทดสอบ...' : 'ทดสอบเชื่อมต่อ',
                  icon: isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />,
                  onClick: () => handleTest(account),
                  disabled: isTesting,
                },
                // ขอ token ใบใหม่ให้เพจนี้ — ใช้เมื่อ Facebook เพิ่ม scope (เช่น page_events ของ CAPI)
                // ที่ token ใบเดิมไม่มี · จบแล้ว PUT ทับใบเดิม ข้อมูลแชทไม่หาย
                ...(account.platform === 'facebook' && FB_APP_ID ? [{
                  key: 'reconnect',
                  label: 'เชื่อมต่อใหม่ (ขอสิทธิ์ใหม่)',
                  icon: <RefreshCw className="w-4 h-4" />,
                  onClick: () => {
                    reconnectPageIdRef.current = (account.credentials.page_id as string) || null;
                    handleFbLogin();
                  },
                }] : []),
                // โหมด config เติมสิทธิ์รายรอบไม่ได้ — ข้อความการตลาดย้ายไปปุ่ม "เชื่อม business" หน้าบัญชีโฆษณา
                ...(account.platform === 'facebook' && FB_APP_ID && isSuperAdmin && !FB_LOGIN_CONFIG.pages ? [{
                  key: 'reconnect-marketing',
                  label: 'เชื่อมต่อใหม่ + สิทธิ์ข้อความการตลาด',
                  description: 'ทดลอง · เฉพาะผู้ดูแลระบบ',
                  icon: <RefreshCw className="w-4 h-4" />,
                  onClick: () => {
                    reconnectPageIdRef.current = (account.credentials.page_id as string) || null;
                    fbExtraScopeRef.current = FB_MARKETING_MESSAGES_SCOPE;
                    handleFbLogin();
                  },
                }] : []),
                {
                  key: 'delete',
                  label: 'ลบ',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: async () => {
                    const ok = await confirm({ title: 'ต้องการลบ Account นี้?', variant: 'danger' });
                    if (ok) handleDelete(account.id);
                  },
                  danger: true,
                  dividerBefore: true,
                },
              ]}
            />
          </div>
        </div>

        {/* Inline test error banner (rarely shown — info already in toast) */}
        {(errorMsg || (!botPicture && info)) && (
          <div className="px-4 pb-4 -mt-2">
            {errorMsg ? (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-600 dark:text-red-400">{errorMsg}</span>
              </div>
            ) : !botPicture && info ? (
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: `${config.color}08`, border: `1px solid ${config.color}30` }}>
                {info.picture_url ? <img src={info.picture_url} alt={info.name} className="w-10 h-10 rounded-full" /> : null}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{info.name}</p>
                  {(info.premium_id || info.basic_id) ? <p className="text-xs text-gray-500">{info.premium_id || info.basic_id}{info.premium_id && info.basic_id ? ` (${info.basic_id})` : ''}</p> : null}
                  {info.page_id ? <p className="text-xs text-gray-500">Page ID: {info.page_id}</p> : null}
                </div>
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: config.color }} />
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }
}
