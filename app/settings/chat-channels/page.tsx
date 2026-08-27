'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { Loader2, Eye, EyeOff, ExternalLink, Check, X, ChevronDown, ChevronUp, CheckCircle2, XCircle, Zap, Plus, Trash2, Edit2, Search, Facebook as FacebookSolidIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import ActionMenu from '@/components/ui/ActionMenu';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import PlatformIcon from '@/components/ui/PlatformIcon';
import SearchInput from '@/components/ui/SearchInput';
import Tabs from '@/components/ui/Tabs';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import Toggle from '@/components/ui/Toggle';

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


// Step number circle
function StepNumber({ number }: { number: number }) {
  return (
    <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
      <span className="text-white text-sm font-bold">{number}</span>
    </div>
  );
}

interface ChatAccount {
  id: string;
  platform: 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok';
  account_name: string;
  credentials: Record<string, unknown>;
  is_active: boolean;
  webhook_url: string;
  created_at: string;
}

interface ShopeeShop {
  id: string;
  shop_id: number;
  shop_name: string | null;
  is_active: boolean;
  // TikTok: token แชทมาจาก app แชทแยก — false = ยังไม่ผ่าน OAuth ขาแชท
  chat_connected?: boolean;
}

interface TestInfo {
  name: string;
  picture_url?: string;
  basic_id?: string;
  page_id?: string;
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
    const hash = window.location.hash.replace('#', '');
    if (hash === 'line' || hash === 'shopee' || hash === 'lazada' || hash === 'tiktok') setActiveTabState(hash);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // กลับมาจาก OAuth ขาแชท (?tiktok_chat= / ?lazada_chat= = connected|failed|skipped)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const platform = params.get('tiktok_chat') ? 'TikTok Shop' : params.get('lazada_chat') ? 'Lazada' : null;
    if (!platform) return;
    const result = params.get('tiktok_chat') || params.get('lazada_chat');
    if (result === 'connected') {
      showToast(`เชื่อมต่อแชท ${platform} สำเร็จ — เปิดสวิตช์ร้านที่ต้องการรับแชทได้เลย`, 'success');
    } else if (result === 'failed') {
      showToast(`เชื่อมต่อแชท ${platform} ไม่สำเร็จ กรุณาลองใหม่`, 'error');
    }
    // skipped = ผู้ใช้กดยกเลิกเอง — ไม่ต้องเด้งอะไร
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
  const [mpShopsLoaded, setMpShopsLoaded] = useState<Record<MarketplaceChatPlatform, boolean>>({ shopee: false, lazada: false, tiktok: false });
  const [shopeeToggling, setShopeeToggling] = useState<string | null>(null);

  // Inline form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Guide state (for inline form)
  const [formGuideOpen, setFormGuideOpen] = useState(false);

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
  const [fbSdkReady, setFbSdkReady] = useState(false);
  const [fbSavingPage, setFbSavingPage] = useState(false);
  const [fbSearch, setFbSearch] = useState('');
  const fbSdkLoaded = useRef(false);

  useFetchOnce(() => {
    fetchAccounts();
  }, can(userProfile?.roles, 'masterdata.chat_channels'));

  // Load connected marketplace shops when a Shopee/Lazada tab is active
  useEffect(() => {
    const platform = activeTab as MarketplaceChatPlatform;
    if (!MARKETPLACE_CHAT_PLATFORMS.includes(platform) || mpShopsLoaded[platform]) return;
    (async () => {
      try {
        const res = await apiFetch(`/api/shopee/accounts?platform=${platform}`);
        if (res.ok) {
          const data = await res.json();
          const rows: ShopeeShop[] = Array.isArray(data) ? data : (data.accounts || []);
          setMpShops(prev => ({ ...prev, [platform]: rows.filter(a => a.is_active) }));
        }
      } catch { /* non-critical — tab shows empty state */ }
      setMpShopsLoaded(prev => ({ ...prev, [platform]: true }));
    })();
  }, [activeTab, mpShopsLoaded]);

  // Load FB SDK when Facebook tab is active
  useEffect(() => {
    if (activeTab !== 'facebook' || !FB_APP_ID) return;

    // SDK already initialized
    if (window.FB) {
      if (!fbSdkReady) setFbSdkReady(true);
      return;
    }

    // Already loading script, just wait
    if (fbSdkLoaded.current) return;

    window.fbAsyncInit = () => {
      window.FB.init({
        appId: FB_APP_ID,
        cookie: true,
        xfbml: false,
        version: 'v21.0',
      });
      setFbSdkReady(true);
    };

    // Load SDK script
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
    fbSdkLoaded.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, showForm]);

  const fetchAccounts = async () => {
    try {
      const response = await apiFetch('/api/chat-accounts');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setAccounts(data.accounts || []);

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
    } catch (error) {
      console.error('Error fetching chat accounts:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  // FB Login
  const handleFbLogin = useCallback(() => {
    if (!fbSdkReady || !window.FB) {
      showToast('Facebook SDK ยังไม่พร้อม กรุณารอสักครู่', 'error');
      return;
    }

    const doLogin = () => {
      window.FB.login((response) => {
        if (response.status !== 'connected' || !response.authResponse) {
          showToast('ไม่ได้รับสิทธิ์จาก Facebook', 'error');
          return;
        }
        exchangeFbToken(response.authResponse.accessToken);
      }, {
        scope: 'pages_show_list,pages_messaging,pages_read_engagement,instagram_manage_messages',
        auth_type: 'reauthorize',
      });
    };

    // Logout first to avoid "overriding current access token" warning
    window.FB.getLoginStatus((statusResponse) => {
      if (statusResponse.status === 'connected') {
        window.FB.logout(() => doLogin());
      } else {
        doLogin();
      }
    });
  }, [fbSdkReady, showToast]);

  // Exchange FB token and fetch pages
  const exchangeFbToken = async (accessToken: string) => {
    setFbLoading(true);
    setFbPages([]);
    setSelectedPageIds(new Set());

    try {
      const res = await apiFetch('/api/fb/oauth/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortLivedToken: accessToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Token exchange failed');

      if (data.pages && data.pages.length > 0) {
        setFbPages(data.pages);
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
  const handleSaveFbPages = async (pages: FbPage[]) => {
    setFbSavingPage(true);
    let successCount = 0;
    let failCount = 0;

    for (const page of pages) {
      try {
        const response = await apiFetch('/api/chat-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: 'facebook',
            account_name: page.name,
            credentials: {
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
            },
          }),
        });
        if (!response.ok) {
          failCount++;
          continue;
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

        successCount++;
      } catch {
        failCount++;
      }
    }

    if (successCount > 0) {
      showToast(`เชื่อมต่อสำเร็จ ${successCount} Page${failCount > 0 ? `, ไม่สำเร็จ ${failCount}` : ''}`);
    } else {
      showToast('เชื่อมต่อไม่สำเร็จ', 'error');
    }

    setFbPages([]);
    setSelectedPageIds(new Set());
    await fetchAccounts();
    setFbSavingPage(false);
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
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create');
        }
      }
      showToast(editingId ? 'อัปเดตสำเร็จ' : 'เพิ่ม Account สำเร็จ');
      resetForm();
      await fetchAccounts();
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
  const handleConnectMarketplaceChat = async (platform: 'tiktok' | 'lazada') => {
    setConnectingChatAuth(true);
    try {
      const res = await apiFetch(`/api/${platform}/oauth/auth-url?app=chat`);
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
        showToast('เชื่อมต่อสำเร็จ');
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

  // Admin guard
  if (userProfile && !can(userProfile.roles, 'masterdata.chat_channels')) {
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
                        <p className="font-medium text-gray-900 dark:text-white text-sm">สร้าง LINE Official Account</p>
                        <a href="https://www.linebiz.com/th/entry/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-line hover:underline">
                          <ExternalLink className="w-3 h-3" /> สร้าง LINE OA
                        </a>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={2} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">เปิดใช้ Messaging API</p>
                        <p>LINE OA Manager &rarr; Settings &rarr; Messaging API &rarr; Enable</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={3} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">คัดลอก Channel Secret</p>
                        <p>
                          <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-line hover:underline">
                            <ExternalLink className="w-3 h-3" /> LINE Developers Console
                          </a>
                          {' '}&rarr; เลือก Channel &rarr; Basic settings &rarr; Channel secret &rarr; Copy
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={4} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">คัดลอก Channel Access Token</p>
                        <p>LINE Developers Console &rarr; เลือก Channel &rarr; Messaging API &rarr; Channel access token &rarr; Issue &rarr; Copy</p>
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
              <Button variant="primary" icon={<PlatformIcon id="facebook" size={16} />} loading={fbLoading} disabled={!fbSdkReady} onClick={handleFbLogin}>
                เชื่อมเพจ FB / IG
              </Button>
            ) : activeTab === 'line' ? (
              <Button variant="primary" icon={<PlatformIcon id="line" size={16} />} onClick={startAdd}>
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
                count: shopeeAccounts.filter(a => a.is_active).length || undefined,
                activeColorClass: 'border-[#EE4D2D] text-[#EE4D2D]',
              },
              {
                key: 'lazada',
                label: 'Lazada',
                icon: <PlatformIcon id="lazada" size={16} />,
                count: lazadaAccounts.filter(a => a.is_active).length || undefined,
                activeColorClass: 'border-[#0F146E] text-[#0F146E] dark:border-blue-400 dark:text-blue-400',
              },
              {
                key: 'tiktok',
                label: 'TikTok',
                icon: <PlatformIcon id="tiktok" size={16} />,
                count: tiktokAccounts.filter(a => a.is_active).length || undefined,
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
                  ? ' ข้อความใหม่จะเข้าอัตโนมัติผ่าน webhook (ต้องเปิด Webchat Push ใน Shopee Open Platform Console)'
                  : platform === 'lazada'
                    ? ' ข้อความใหม่จะเข้าอัตโนมัติผ่าน webhook (ต้องตั้ง Callback URL ใน Lazada Open Platform > Push Mechanism)'
                    : ' ข้อความใหม่จะเข้าอัตโนมัติผ่าน webhook (ต้องเปิด event NEW_MESSAGE ใน TikTok Partner Center > Webhooks)'}
              </div>
              {!mpShopsLoaded[platform] ? (
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
                  // TikTok/Lazada: token แชทมาจาก OAuth ขาแชทแยก — ยังไม่เชื่อม
                  // ต้องพาไปอนุญาตก่อน สวิตช์เปิดไปก็เป็นช่องแชทที่ใช้ไม่ได้
                  // (API ส่ง chat_connected=true ให้เองเมื่อ platform ไม่มีขาแชทแยก)
                  const needsChatAuth = (platform === 'tiktok' || platform === 'lazada') && shop.chat_connected === false;
                  return (
                    <div key={shop.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-3 py-2.5 flex items-center gap-3">
                      <PlatformIcon id={platform} size={24} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{shop.shop_name || `${platformLabel} ${shop.shop_id}`}</p>
                        <p className="helper-text text-gray-500">
                          Shop ID: {shop.shop_id}
                          {chatEnabled ? ' · รับแชทอยู่' : needsChatAuth ? ' · ยังไม่ได้เชื่อมต่อแชท' : ''}
                        </p>
                      </div>
                      {needsChatAuth ? (
                        <Button size="sm" variant="secondary" loading={connectingChatAuth} onClick={() => handleConnectMarketplaceChat(platform as 'tiktok' | 'lazada')}>
                          เชื่อมต่อแชท
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
                const pages = fbPages.filter(p => selectedPageIds.has(p.id));
                if (pages.length > 0) handleSaveFbPages(pages);
              }}
              disabled={selectedPageIds.size === 0 || fbSavingPage}
              loading={fbSavingPage}
              icon={!fbSavingPage ? <Check className="w-4 h-4" /> : undefined}
              className="!bg-facebook hover:!bg-facebook-hover"
            >
              {fbSavingPage ? 'กำลังเชื่อมต่อ...' : `เชื่อมต่อ ${selectedPageIds.size > 0 ? selectedPageIds.size + ' ' : ''}Page`}
            </Button>
          </div>
        }
      >
        <div className="p-4 space-y-3">
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
              const localConnectedIds = new Set(
                fbAccounts.map(a => a.credentials.page_id as string).filter(Boolean)
              );
              return fbPages
                .filter(p => !fbSearch || p.name.toLowerCase().includes(fbSearch.toLowerCase()) || p.id.includes(fbSearch))
                .map(page => {
                  const connectedBy = page.connected_by ?? (localConnectedIds.has(page.id) ? 'current' : null);
                  const isConnected = connectedBy !== null;
                  const remark = connectedBy === 'current'
                    ? 'เชื่อมต่อแล้ว'
                    : connectedBy === 'other'
                      ? 'มีบัญชีอื่นเชื่อมต่อไปแล้ว'
                      : null;
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
                        <span className={`subtitle-text flex-shrink-0 whitespace-nowrap ${connectedBy === 'other' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-slate-500'}`}>
                          {remark}
                        </span>
                      ) : selectedPageIds.has(page.id) ? (
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                          <Check className="w-4 h-4 text-white" />
                        </div>
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
                          <ExternalLink className="w-3 h-3" /> เปิด LINE Developers
                        </a>
                        <p className="mt-1">เลือก Channel &rarr; แท็บ Messaging API &rarr; Webhook settings &rarr; Edit</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={2} />
                      <p className="font-medium text-gray-900 dark:text-white subtitle-text">วาง Webhook URL ด้านบน &rarr; กด Update &rarr; เปิด Use webhook</p>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={3} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white subtitle-text">ปิดข้อความอัตโนมัติ (แนะนำ)</p>
                        <p>LINE OA Manager &rarr; Settings &rarr; Response settings &rarr; ปิด Auto-response</p>
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
    const basicId = account.credentials.basic_id as string | undefined;
    const pageId = account.credentials.page_id as string | undefined;
    const pageUsername = account.credentials.page_username as string | undefined;
    const igAccountId = account.credentials.ig_account_id as string | undefined;
    const igUsername = account.credentials.ig_username as string | undefined;
    const igPicture = account.credentials.ig_profile_picture_url as string | undefined;

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
            {botPicture ? (
              <img src={botPicture} alt={botName || ''} className="w-10 h-10 rounded-full group-hover:opacity-75 transition-opacity" />
            ) : (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center group-hover:opacity-75 transition-opacity" style={{ backgroundColor: `${config.color}15` }}>
                {account.platform === 'line' ? (
                  <PlatformIcon id="line" size={20} />
                ) : (
                  <PlatformIcon id="facebook" size={20} />
                )}
              </div>
            )}
            {igPicture && (
              <img
                src={igPicture}
                alt={igUsername || 'IG'}
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white dark:border-slate-800"
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
            </div>
            <div className="flex items-center gap-2 subtitle-text text-gray-500 dark:text-slate-400">
              {account.platform === 'line' ? (
                <span className="inline-flex items-center gap-1">
                  <PlatformIcon id="line" size={14} />
                  <span className="text-line dark:text-line">LINE</span>
                  {basicId ? <span className="text-gray-500 dark:text-slate-400">@{basicId}</span> : null}
                </span>
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
                  {info.basic_id ? <p className="text-xs text-gray-500">@{info.basic_id}</p> : null}
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
