'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Eye, EyeOff, ExternalLink, Copy, Check, X,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Zap, Plus,
  MessageCircle, Trash2, Edit2, Facebook, LogIn, Search
} from 'lucide-react';

const FB_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '';

interface FbPage {
  id: string;
  name: string;
  access_token: string;
  picture_url: string | null;
  instagram: { id: string; name: string; profile_picture_url: string } | null;
}

// Toggle component
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? 'bg-[#F4511E]' : 'bg-gray-300 dark:bg-slate-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

// Step number circle
function StepNumber({ number }: { number: number }) {
  return (
    <div className="w-7 h-7 rounded-full bg-[#F4511E] flex items-center justify-center flex-shrink-0">
      <span className="text-white text-sm font-bold">{number}</span>
    </div>
  );
}

interface ChatAccount {
  id: string;
  platform: 'line' | 'facebook';
  account_name: string;
  credentials: Record<string, unknown>;
  is_active: boolean;
  webhook_url: string;
  created_at: string;
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
    icon: MessageCircle,
    fields: [
      { key: 'channel_secret', label: 'Channel Secret', placeholder: 'วาง Channel Secret ที่นี่' },
      { key: 'channel_access_token', label: 'Channel Access Token', placeholder: 'วาง Channel Access Token ที่นี่' },
    ],
  },
  facebook: {
    label: 'Facebook / IG',
    color: '#1877F2',
    icon: Facebook,
    fields: [
      { key: 'page_access_token', label: 'Page Access Token', placeholder: 'วาง Page Access Token ที่นี่' },
    ],
  },
};

export default function ChatChannelsPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<ChatAccount[]>([]);
  const [activeTab, setActiveTab] = useState<'line' | 'facebook'>('line');

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

  // Expand state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Guide state (for webhook per card)
  const [guideOpen, setGuideOpen] = useState<Record<string, boolean>>({});

  // Copy state
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // FB OAuth state
  const [fbMode, setFbMode] = useState<'oauth' | 'manual'>(FB_APP_ID ? 'oauth' : 'manual');
  const [fbPages, setFbPages] = useState<FbPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbSdkReady, setFbSdkReady] = useState(false);
  const [fbSavingPage, setFbSavingPage] = useState(false);
  const [fbSearch, setFbSearch] = useState('');
  const fbSdkLoaded = useRef(false);

  useFetchOnce(() => {
    fetchAccounts();
  }, userProfile?.role === 'admin' || userProfile?.role === 'owner');

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

    window.FB.login((response) => {
      if (response.status !== 'connected' || !response.authResponse) {
        showToast('ไม่ได้รับสิทธิ์จาก Facebook', 'error');
        return;
      }
      exchangeFbToken(response.authResponse.accessToken);
    }, { scope: 'pages_show_list,pages_messaging,pages_read_engagement,instagram_manage_messages' });
  }, [fbSdkReady, showToast]);

  // Exchange FB token and fetch pages
  const exchangeFbToken = async (accessToken: string) => {
    setFbLoading(true);
    setFbPages([]);
    setSelectedPageId(null);

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

  // Save selected FB page as a chat account
  const handleSaveFbPage = async (page: FbPage) => {
    setFbSavingPage(true);
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
        const data = await response.json();
        throw new Error(data.error || 'Failed to create');
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
        // Non-critical: webhook can be set up manually later
        console.warn('Auto webhook subscribe failed, can be set up manually');
      }

      showToast(`เชื่อมต่อ ${page.name} สำเร็จ`);
      setFbPages([]);
      setSelectedPageId(null);
      await fetchAccounts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ';
      showToast(msg, 'error');
    } finally {
      setFbSavingPage(false);
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
    setSelectedPageId(null);
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

  // Delete account
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await apiFetch(`/api/chat-accounts?id=${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      showToast('ลบ Account สำเร็จ');
      setAccounts(prev => prev.filter(a => a.id !== id));
      if (expandedId === id) setExpandedId(null);
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

  // Copy to clipboard
  const handleCopy = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    showToast('คัดลอกแล้ว');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const lineAccounts = accounts.filter(a => a.platform === 'line');
  const fbAccounts = accounts.filter(a => a.platform === 'facebook');
  const tabAccounts = activeTab === 'line' ? lineAccounts : fbAccounts;
  const tabConfig = PLATFORM_CONFIG[activeTab];

  // Admin guard
  if (userProfile && userProfile.role !== 'admin' && userProfile.role !== 'owner') {
    return (
      <Layout title="ช่องทาง Chat">
        <div className="text-center py-16 text-gray-500 dark:text-slate-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Layout>
    );
  }

  // Inline form fields based on current context
  const formPlatform = editingId
    ? accounts.find(a => a.id === editingId)?.platform || activeTab
    : activeTab;
  const formConfig = PLATFORM_CONFIG[formPlatform];

  // Render FB OAuth form (Login with Facebook → select page)
  function renderFbOAuthForm() {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 space-y-4">
        <div className="text-sm font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
          <Facebook className="w-4 h-4" style={{ color: '#1877F2' }} />
          เพิ่ม Facebook / IG Account
        </div>

        {/* If pages have been fetched → show page selection */}
        {fbPages.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-slate-400">เลือก Page ที่ต้องการเชื่อมต่อ ({fbPages.length} Pages)</p>

            {/* Search box */}
            {fbPages.length > 5 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={fbSearch}
                  onChange={e => setFbSearch(e.target.value)}
                  placeholder="ค้นหา Page..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1877F2]/50 focus:border-[#1877F2]"
                />
              </div>
            )}

            {/* Page list */}
            <div className="max-h-80 overflow-y-auto space-y-1">
              {fbPages
                .filter(p => !fbSearch || p.name.toLowerCase().includes(fbSearch.toLowerCase()) || p.id.includes(fbSearch))
                .map(page => (
                <button
                  key={page.id}
                  onClick={() => setSelectedPageId(page.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                    selectedPageId === page.id
                      ? 'bg-[#1877F2]/10'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    {page.picture_url ? (
                      <img src={page.picture_url} alt={page.name} className="w-9 h-9 rounded-full" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
                        <Facebook className="w-4 h-4 text-[#1877F2]" />
                      </div>
                    )}
                    {page.instagram && (
                      <img
                        src={page.instagram.profile_picture_url}
                        alt={page.instagram.name}
                        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white dark:border-slate-800"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{page.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400 dark:text-slate-500">{page.id}</span>
                      {page.instagram && (
                        <span className="text-xs text-pink-500">• IG @{page.instagram.name}</span>
                      )}
                    </div>
                  </div>
                  {selectedPageId === page.id && (
                    <CheckCircle2 className="w-5 h-5 text-[#1877F2] flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            {/* Connect / Cancel */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  const page = fbPages.find(p => p.id === selectedPageId);
                  if (page) handleSaveFbPage(page);
                }}
                disabled={!selectedPageId || fbSavingPage}
                className="px-4 py-2 bg-[#1877F2] hover:bg-[#1565C0] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {fbSavingPage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                เชื่อมต่อ Page นี้
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" /> ยกเลิก
              </button>
            </div>
          </div>
        ) : (
          /* Login button */
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-slate-400">
              กดปุ่มด้านล่างเพื่อล็อกอิน Facebook แล้วเลือก Page ที่ต้องการเชื่อมต่อ
            </p>
            <button
              onClick={handleFbLogin}
              disabled={!fbSdkReady || fbLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1877F2] hover:bg-[#1565C0] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {fbLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              {fbLoading ? 'กำลังดึงข้อมูล...' : 'Login with Facebook'}
            </button>

            {!fbSdkReady && FB_APP_ID && (
              <p className="text-xs text-gray-400 dark:text-slate-500 text-center">กำลังโหลด Facebook SDK...</p>
            )}

            {/* Manual fallback link */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => { setFbMode('manual'); setShowForm(true); }}
                className="text-xs text-gray-400 dark:text-slate-500 hover:text-[#F4511E] transition-colors underline"
              >
                กรอกเอง (Manual)
              </button>
              <button
                onClick={resetForm}
                className="text-xs text-gray-400 dark:text-slate-500 hover:text-red-500 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render inline credential form (for add or edit — LINE always, FB manual mode)
  function renderInlineForm() {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 space-y-3">
        <div className="text-sm font-medium text-gray-700 dark:text-slate-300 flex items-center gap-2">
          {formPlatform === 'line' ? (
            <MessageCircle className="w-4 h-4" style={{ color: formConfig.color }} />
          ) : (
            <Facebook className="w-4 h-4" style={{ color: formConfig.color }} />
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
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
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
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
                  className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 hover:text-[#F4511E] transition-colors"
                >
                  <Zap className="w-4 h-4 text-[#F4511E]" />
                  <span>วิธีหา Credentials</span>
                  {formGuideOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {formGuideOpen && (
                  <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-3 text-xs text-gray-600 dark:text-slate-400">
                    <div className="flex gap-2">
                      <StepNumber number={1} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">สร้าง LINE Official Account</p>
                        <a href="https://www.linebiz.com/th/entry/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-[#06C755] hover:underline">
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
                          <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#06C755] hover:underline">
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
                className="text-xs text-gray-400 dark:text-slate-500 hover:text-[#1877F2] transition-colors underline"
              >
                กลับไปใช้ Login with Facebook
              </button>
            )}
          </>
        )}

        {/* Save / Cancel */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            บันทึก
          </button>
          <button
            onClick={resetForm}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" /> ยกเลิก
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout
      title="ช่องทาง Chat"
      breadcrumbs={[
        { label: 'ตั้งค่าระบบ', href: '/settings' },
        { label: 'ช่องทาง Chat' },
      ]}
    >
      <div className="max-w-3xl">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-slate-700 mb-6">
          <button
            onClick={() => { setActiveTab('line'); resetForm(); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'line'
                ? 'border-[#06C755] text-[#06C755]'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            LINE
            {lineAccounts.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === 'line' ? 'bg-[#06C755]/10 text-[#06C755]' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
              }`}>{lineAccounts.length}</span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('facebook'); resetForm(); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'facebook'
                ? 'border-[#1877F2] text-[#1877F2]'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            <Facebook className="w-4 h-4" />
            FB / IG
            {fbAccounts.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === 'facebook' ? 'bg-[#1877F2]/10 text-[#1877F2]' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
              }`}>{fbAccounts.length}</span>
            )}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Account Cards */}
            {tabAccounts.map(account => {
              const card = renderAccountCard(account);
              const isEditing = editingId === account.id;
              const isLast = account === tabAccounts[tabAccounts.length - 1];

              // For FB add: show OAuth form when fbMode=oauth, manual form when fbMode=manual
              const isFbOAuthAdd = activeTab === 'facebook' && fbMode === 'oauth' && !editingId;
              const showAddForm = isLast && showForm && !editingId;
              const showAddButton = isLast && !showForm && !(isFbOAuthAdd && fbPages.length > 0);

              return (
                <div key={account.id} className="space-y-4">
                  {card}
                  {/* Inline edit form right below this card */}
                  {isEditing && showForm && renderInlineForm()}
                  {/* Add button after last card (if not currently adding/editing) */}
                  {showAddButton && (
                    <button
                      onClick={startAdd}
                      className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-[#F4511E] hover:text-[#F4511E] transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      เพิ่ม {tabConfig.label} Account
                    </button>
                  )}
                  {/* Add form after last card */}
                  {showAddForm && (isFbOAuthAdd ? renderFbOAuthForm() : renderInlineForm())}
                </div>
              );
            })}

            {/* If no accounts, show add button or form */}
            {tabAccounts.length === 0 && (() => {
              const isFbOAuthAdd = activeTab === 'facebook' && fbMode === 'oauth' && !editingId;
              if (showForm && !editingId) {
                return isFbOAuthAdd ? renderFbOAuthForm() : renderInlineForm();
              }
              return (
                <button
                  onClick={startAdd}
                  className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-[#F4511E] hover:text-[#F4511E] transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่ม {tabConfig.label} Account
                </button>
              );
            })()}
          </div>
        )}
      </div>
    </Layout>
  );

  // Render account card
  function renderAccountCard(account: ChatAccount) {
    const config = PLATFORM_CONFIG[account.platform];
    const isExpanded = expandedId === account.id;
    const info = testInfo[account.id];
    const errorMsg: string | undefined = testErrors[account.id];
    const isTesting = testingId === account.id;
    const isDeleting = deletingId === account.id;

    // Bot/Page info from credentials
    const botName = (account.platform === 'line'
      ? account.credentials.bot_name
      : account.credentials.page_name) as string | undefined;
    const botPicture = (account.platform === 'line'
      ? account.credentials.bot_picture_url
      : account.credentials.page_picture_url || account.credentials.bot_picture_url) as string | undefined;
    const basicId = account.credentials.basic_id as string | undefined;
    const pageId = account.credentials.page_id as string | undefined;
    const igAccountId = account.credentials.ig_account_id as string | undefined;
    const igUsername = account.credentials.ig_username as string | undefined;
    const igPicture = account.credentials.ig_profile_picture_url as string | undefined;

    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
        {/* Account Header */}
        <div className="flex items-center gap-3 p-4">
          {/* Avatar / Platform Icon */}
          <div className="relative flex-shrink-0">
            {botPicture ? (
              <img src={botPicture} alt={botName || ''} className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${config.color}15` }}>
                {account.platform === 'line' ? (
                  <MessageCircle className="w-5 h-5" style={{ color: config.color }} />
                ) : (
                  <Facebook className="w-5 h-5" style={{ color: config.color }} />
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
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-gray-900 dark:text-white truncate">{account.account_name}</p>
              {botName && botName !== account.account_name ? (
                <span className="text-xs text-gray-400 dark:text-slate-500 truncate">({botName})</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
              {account.is_active ? (
                <span className="text-green-600 dark:text-green-400">เปิดใช้งาน</span>
              ) : (
                <span className="text-gray-400">ปิดใช้งาน</span>
              )}
              {basicId ? <span className="ml-1">@{basicId}</span> : null}
              {igUsername ? <span className="text-pink-500">• IG @{igUsername}</span> : null}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Toggle checked={account.is_active} onChange={() => handleToggleActive(account)} />
            <button
              onClick={() => startEdit(account)}
              className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setExpandedId(isExpanded ? null : account.id)}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expanded Section */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-slate-700 pt-3">
            {/* Extra info not shown in header */}
            {(pageId || igAccountId) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
                {pageId ? <span>Page ID: {pageId}</span> : null}
                {igAccountId ? <span className="text-pink-500">IG ID: {igAccountId}</span> : null}
              </div>
            )}

            {/* Test result (only shown after clicking test, when no bot info in credentials yet) */}
            {!botPicture && info ? (
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

            {errorMsg ? (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-600 dark:text-red-400">{errorMsg}</span>
              </div>
            ) : null}

            {/* Webhook URL & Guide — LINE only (FB uses auto-subscribe) */}
            {account.platform === 'line' && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Webhook URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={account.webhook_url}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-xs bg-gray-50 dark:bg-slate-700/50 text-gray-700 dark:text-slate-300 font-mono"
                    />
                    <button
                      onClick={() => handleCopy(account.webhook_url, `webhook-${account.id}`)}
                      className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      {copiedField === `webhook-${account.id}` ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setGuideOpen(prev => ({ ...prev, [account.id]: !prev[account.id] }))}
                  className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 hover:text-[#F4511E] transition-colors"
                >
                  <Zap className="w-4 h-4 text-[#F4511E]" />
                  <span>วิธีตั้งค่า Webhook</span>
                  {guideOpen[account.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {guideOpen[account.id] && (
                  <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-3 text-xs text-gray-600 dark:text-slate-400">
                    <div className="flex gap-2">
                      <StepNumber number={1} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">เปิด LINE Developers Console</p>
                        <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-[#06C755] hover:underline">
                          <ExternalLink className="w-3 h-3" /> เปิด LINE Developers
                        </a>
                        <p className="mt-1">เลือก Channel &rarr; แท็บ Messaging API &rarr; Webhook settings &rarr; Edit</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={2} />
                      <p className="font-medium text-gray-900 dark:text-white text-sm">วาง Webhook URL ด้านบน &rarr; กด Update &rarr; เปิด Use webhook</p>
                    </div>
                    <div className="flex gap-2">
                      <StepNumber number={3} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">ปิดข้อความอัตโนมัติ (แนะนำ)</p>
                        <p>LINE OA Manager &rarr; Settings &rarr; Response settings &rarr; ปิด Auto-response</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleTest(account)}
                disabled={isTesting}
                className="px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                style={{ border: `1px solid ${config.color}`, color: config.color }}
              >
                {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                ทดสอบ
              </button>
              <button
                onClick={() => {
                  if (confirm('ลบ Account นี้?')) handleDelete(account.id);
                }}
                disabled={isDeleting}
                className="px-3 py-2 border border-red-300 dark:border-red-800 text-red-500 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                ลบ
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
}
