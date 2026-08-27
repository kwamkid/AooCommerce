'use client';

// แท็บ "เชื่อมต่อ Marketplace" ของหน้า /settings/sales-channels
// (ย้ายมาจาก /settings/integrations เดิม — path เก่า redirect มาที่นี่)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import { ShoppingBag, RefreshCw, Clock, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import { ExportButton, ImportButton } from '@/components/ui/ExportImportButton';
import Alert from '@/components/ui/Alert';
import MarketplaceQuotaPausedAlert from '@/components/ui/MarketplaceQuotaPausedAlert';
import Toggle from '@/components/ui/Toggle';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import PlatformIcon from '@/components/ui/PlatformIcon';
import { LoadingCard } from '@/components/ui/StateCard';
import { formatThaiDateTime } from '@/lib/utils/format';
import MarketplaceAccountCard, { SyncRangeSelect } from './MarketplaceAccountCard';
import { useMarketplaceAccounts, type MarketplaceAccount } from './useMarketplaceAccounts';

export default function MarketplaceConnections() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  // Badge-tab เลือกดูทีละแพลตฟอร์ม — แบบ flat ทั้งสามแพลตฟอร์มยาวเกินจอ
  const [activePlatform, setActivePlatform] = useState<'shopee' | 'tiktok' | 'lazada'>('shopee');
  // fetch เดียวได้ทุก platform (แทน 3 calls เดิม) — refetch หลัง write ใดๆ
  const {
    shopee: shopeeAccounts, tiktok: tiktokAccounts, lazada: lazadaAccounts,
    loading, refetch, patchAccount,
  } = useMarketplaceAccounts(can(userProfile?.roles, 'settings.access'));
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncRange, setSyncRange] = useState<Record<string, number>>({}); // accountId → days
  const [refreshingLogoId, setRefreshingLogoId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number>(0); // 0-100
  const [syncPhaseLabel, setSyncPhaseLabel] = useState('');
  const syncAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cleanUrl = '/settings/sales-channels?tab=marketplace';
    if (params.get('shopee') === 'connected') {
      showToast('เชื่อมต่อ Shopee สำเร็จ', 'success');
      refetch();
      window.history.replaceState({}, '', cleanUrl);
    } else if (params.get('tiktok') === 'connected') {
      showToast('เชื่อมต่อ TikTok Shop สำเร็จ', 'success');
      refetch();
      setActivePlatform('tiktok');
      const askChat = params.get('chat') === 'prompt';
      window.history.replaceState({}, '', cleanUrl);
      if (askChat) promptTikTokChat();
    } else if (params.get('success') === 'lazada_connected') {
      showToast('เชื่อมต่อ Lazada สำเร็จ', 'success');
      refetch();
      setActivePlatform('lazada');
      window.history.replaceState({}, '', cleanUrl);
    } else if (params.get('error')) {
      const err = params.get('error');
      const messages: Record<string, string> = {
        shopee_auth_failed: 'เชื่อมต่อ Shopee ไม่สำเร็จ กรุณาลองใหม่',
        shopee_save_failed: 'เชื่อมต่อ Shopee ผ่าน แต่บันทึกร้านไม่สำเร็จ — กรุณาแจ้งผู้ดูแลระบบ',
        tiktok_auth_failed: 'เชื่อมต่อ TikTok Shop ไม่สำเร็จ กรุณาลองใหม่',
        missing_params: 'ข้อมูลไม่ครบ กรุณาลองใหม่',
        no_shops: 'ไม่พบร้านค้าในบัญชีนี้',
        lazada_token_exchange: 'เชื่อมต่อ Lazada ไม่สำเร็จ กรุณาลองใหม่',
      };
      showToast(messages[err || ''] || 'เกิดข้อผิดพลาด', 'error');
      window.history.replaceState({}, '', cleanUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  // เชื่อมร้าน TikTok สำเร็จแล้ว → ถามต่อว่าจะเชื่อมแชทด้วยมั้ย (app แชทแยกจาก
  // app ออเดอร์ — บางร้านไม่ใช้แชท / บางร้านเชื่อมไว้แล้ว จึงไม่ต่อขาอัตโนมัติ)
  const promptTikTokChat = async () => {
    const ok = await confirm({
      title: 'เชื่อมต่อแชท TikTok Shop ต่อเลยหรือไม่?',
      description:
        'ถ้าต้องการรับ-ส่งแชท TikTok ในหน้ารวมแชท ต้องกดอนุญาตเพิ่มอีกหนึ่งครั้ง — ข้ามไปก่อนได้ แล้วมาเชื่อมทีหลังที่ ตั้งค่า > ช่องทางแชท แท็บ TikTok',
      confirmLabel: 'เชื่อมต่อแชท',
      cancelLabel: 'ไว้ทีหลัง',
    });
    if (!ok) return;
    setConnecting(true);
    try {
      const res = await apiFetch('/api/tiktok/oauth/auth-url?app=chat');
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
        return;
      }
      showToast('ไม่สามารถสร้างลิงก์เชื่อมต่อได้', 'error');
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
    setConnecting(false);
  };

  const handleConnect = async (platform: 'shopee' | 'tiktok' | 'lazada' = 'shopee') => {
    setConnecting(true);
    const apiUrl = platform === 'tiktok' ? '/api/tiktok/oauth/auth-url' : platform === 'lazada' ? '/api/lazada/oauth/auth-url' : '/api/shopee/oauth/auth-url';
    try {
      const res = await apiFetch(apiUrl);
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        showToast('ไม่สามารถสร้างลิงก์เชื่อมต่อได้', 'error');
        setConnecting(false);
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
      setConnecting(false);
    }
  };

  // Helper: read SSE stream from fetch response
  const readSSEStream = async (
    response: Response,
    onEvent: (event: Record<string, unknown>) => void,
    signal?: AbortSignal
  ) => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (signal?.aborted) {
          await reader.cancel();
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              onEvent(JSON.parse(line.slice(6)));
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (e) {
      if (signal?.aborted) return; // cancelled by user
      throw e;
    }
  };

  const handleCancelSync = async () => {
    const ok = await confirm({ title: 'ต้องการยกเลิกการ sync?' }); if (!ok) return;
    syncAbortRef.current?.abort();
  };

  const handleSync = async (accountId: string) => {
    setSyncingId(accountId);
    setSyncProgress(0);
    setSyncPhaseLabel('กำลังเชื่อมต่อ...');
    const controller = new AbortController();
    syncAbortRef.current = controller;

    const days = syncRange[accountId] || 1;
    const now = Math.floor(Date.now() / 1000);
    const timeFrom = now - days * 24 * 60 * 60;
    try {
      const res = await apiFetch('/api/shopee/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplace_account_id: accountId, time_from: timeFrom, time_to: now }),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Sync ไม่สำเร็จ', 'error');
        return;
      }

      let result: Record<string, unknown> = {};

      await readSSEStream(res, (event) => {
        if (event.type === 'progress') {
          const phase = event.phase as string;
          const current = event.current as number;
          const total = event.total as number | null;
          const label = event.label as string;
          setSyncPhaseLabel(label);

          if (phase === 'collecting') {
            setSyncProgress(Math.min(5 + (current % 10), 15));
          } else if (phase === 'processing' && total) {
            setSyncProgress(Math.round((current / total) * 80) + 15);
          }
        } else if (event.type === 'done') {
          result = event;
          setSyncProgress(100);
          setSyncPhaseLabel('เสร็จสิ้น');
        } else if (event.type === 'error') {
          showToast((event.message as string) || 'Sync ไม่สำเร็จ', 'error');
        }
      }, controller.signal);

      if (controller.signal.aborted) {
        showToast('ยกเลิกการ sync แล้ว', 'error');
        return;
      }

      // Brief pause to show 100%
      await new Promise(r => setTimeout(r, 500));

      if (result.success) {
        const parts: string[] = [];
        if ((result.orders_created as number) > 0) parts.push(`คำสั่งซื้อใหม่ ${result.orders_created}`);
        if ((result.orders_updated as number) > 0) parts.push(`อัพเดทคำสั่งซื้อ ${result.orders_updated}`);
        const summary = parts.length > 0 ? parts.join(', ') : 'ไม่มีข้อมูลใหม่';
        showToast(`Sync สำเร็จ: ${summary}`, 'success');
        refetch();
      }
    } catch {
      if (!controller.signal.aborted) {
        showToast('เกิดข้อผิดพลาดในการ sync', 'error');
      }
    } finally {
      syncAbortRef.current = null;
      setSyncingId(null);
      setSyncProgress(0);
      setSyncPhaseLabel('');
    }
  };

  const handleSyncIncomplete = async (accountId: string) => {
    setSyncingId(accountId);
    setSyncProgress(0);
    setSyncPhaseLabel('กำลังค้นหาออเดอร์ที่ยังไม่สมบูรณ์...');
    const controller = new AbortController();
    syncAbortRef.current = controller;

    try {
      const res = await apiFetch('/api/shopee/sync-incomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplace_account_id: accountId }),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Sync ไม่สำเร็จ', 'error');
        return;
      }

      let result: Record<string, unknown> = {};

      await readSSEStream(res, (event) => {
        if (event.type === 'progress') {
          const phase = event.phase as string;
          const current = event.current as number;
          const total = event.total as number | null;
          const label = event.label as string;
          setSyncPhaseLabel(label);

          if (phase === 'collecting') {
            setSyncProgress(Math.min(5 + (current % 10), 15));
          } else if (phase === 'processing' && total) {
            setSyncProgress(Math.round((current / total) * 80) + 15);
          }
        } else if (event.type === 'done') {
          result = event;
          setSyncProgress(100);
          setSyncPhaseLabel('เสร็จสิ้น');
        } else if (event.type === 'error') {
          showToast((event.message as string) || 'Sync ไม่สำเร็จ', 'error');
        }
      }, controller.signal);

      if (controller.signal.aborted) {
        showToast('ยกเลิกการ sync แล้ว', 'error');
        return;
      }

      await new Promise(r => setTimeout(r, 500));

      if (result.success) {
        const parts: string[] = [];
        if ((result.orders_created as number) > 0) parts.push(`คำสั่งซื้อใหม่ ${result.orders_created}`);
        if ((result.orders_updated as number) > 0) parts.push(`อัพเดทสถานะ ${result.orders_updated}`);
        const summary = parts.length > 0 ? parts.join(', ') : 'ไม่มีการเปลี่ยนแปลง';
        showToast(`Sync สถานะค้างสำเร็จ: ${summary}`, 'success');
        refetch();
      }
    } catch {
      if (!controller.signal.aborted) {
        showToast('เกิดข้อผิดพลาดในการ sync', 'error');
      }
    } finally {
      syncAbortRef.current = null;
      setSyncingId(null);
      setSyncProgress(0);
      setSyncPhaseLabel('');
    }
  };

  // Sync แบบ POST ธรรมดา (TikTok/Lazada) — เดิมเป็นสองฟังก์ชัน byte-identical ต่างกัน 3 token
  const SIMPLE_SYNC = {
    tiktok: { url: '/api/tiktok/sync', label: 'กำลัง Sync TikTok Shop...' },
    lazada: { url: '/api/lazada/sync', label: 'กำลัง Sync Lazada...' },
  } as const;

  const handleSimpleSync = async (platform: 'tiktok' | 'lazada', accountId: string) => {
    setSyncingId(accountId);
    setSyncProgress(10);
    setSyncPhaseLabel(SIMPLE_SYNC[platform].label);
    const controller = new AbortController();
    syncAbortRef.current = controller;
    const days = syncRange[accountId] || 1;
    try {
      const res = await apiFetch(SIMPLE_SYNC[platform].url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, days_back: days }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Sync ไม่สำเร็จ', 'error');
        return;
      }
      const result = await res.json();
      setSyncProgress(100);
      setSyncPhaseLabel('เสร็จสิ้น');
      await new Promise(r => setTimeout(r, 500));
      const parts: string[] = [];
      if (result.orders_created > 0) parts.push(`คำสั่งซื้อใหม่ ${result.orders_created}`);
      if (result.orders_updated > 0) parts.push(`อัพเดทคำสั่งซื้อ ${result.orders_updated}`);
      const summary = parts.length > 0 ? parts.join(', ') : 'ไม่มีข้อมูลใหม่';
      showToast(`Sync สำเร็จ: ${summary}`, 'success');
      refetch();
    } catch {
      showToast(controller.signal.aborted ? 'ยกเลิกการ sync แล้ว' : 'เกิดข้อผิดพลาดในการ sync', 'error');
    } finally {
      syncAbortRef.current = null;
      setSyncingId(null);
      setSyncProgress(0);
      setSyncPhaseLabel('');
    }
  };

  const handleDisconnect = async (accountId: string) => {
    const ok = await confirm({ title: 'ต้องการยกเลิกการเชื่อมต่อร้านนี้?', variant: 'danger' }); if (!ok) return;
    setDisconnectingId(accountId);
    try {
      const res = await apiFetch(`/api/shopee/accounts?id=${accountId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('ยกเลิกการเชื่อมต่อสำเร็จ', 'success');
        refetch();
      } else {
        showToast('ไม่สามารถยกเลิกได้', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleRefreshLogo = async (accountId: string) => {
    setRefreshingLogoId(accountId);
    try {
      const res = await apiFetch('/api/shopee/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId }),
      });
      if (res.ok) {
        showToast('อัพเดทข้อมูลร้านสำเร็จ', 'success');
        refetch();
      } else {
        showToast('ไม่สามารถอัพเดทได้', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setRefreshingLogoId(null);
    }
  };

  const handleToggleSync = async (accountId: string, field: 'auto_sync_stock' | 'auto_sync_product_info', value: boolean) => {
    // Optimistic update
    patchAccount(accountId, { [field]: value });
    try {
      const res = await apiFetch('/api/shopee/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId, [field]: value }),
      });
      if (!res.ok) {
        patchAccount(accountId, { [field]: !value });
        showToast('ไม่สามารถอัพเดทได้', 'error');
      }
    } catch {
      patchAccount(accountId, { [field]: !value });
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  };

  const platformChip = (
    id: 'shopee' | 'tiktok' | 'lazada',
    label: string,
    count: number,
    activeClass: string,
  ) => (
    <button
      type="button"
      onClick={() => setActivePlatform(id)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        activePlatform === id
          ? activeClass
          : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
      }`}
    >
      <PlatformIcon id={id} size={16} />
      {label}
      {count > 0 && (
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{count}</span>
      )}
    </button>
  );

  return (
    <div>
      {/* Platform badge tabs — เลือกดูทีละแพลตฟอร์ม + ปุ่มเชื่อมต่ออยู่บนขวา
          (ตำแหน่งเดียวกับปุ่ม "เพิ่ม" ของแท็บช่องทางของฉัน) */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {platformChip('shopee', 'Shopee', shopeeAccounts.length, 'border-shopee text-shopee bg-shopee/10')}
          {platformChip('tiktok', 'TikTok Shop', tiktokAccounts.length, 'border-gray-900 text-gray-900 bg-gray-900/5 dark:border-white dark:text-white dark:bg-white/10')}
          {platformChip('lazada', 'Lazada', lazadaAccounts.length, 'border-[#0F146E] text-[#0F146E] bg-[#0F146E]/10 dark:border-blue-400 dark:text-blue-400 dark:bg-blue-400/10')}
        </div>
        <Button
          variant="primary"
          icon={<Plus className="w-5 h-5" />}
          loading={connecting}
          onClick={() => handleConnect(activePlatform)}
        >
          {activePlatform === 'shopee' ? 'เชื่อมต่อร้าน Shopee'
            : activePlatform === 'tiktok' ? 'เชื่อมต่อ TikTok Shop'
            : 'เชื่อมต่อร้าน Lazada'}
        </Button>
      </div>

      {/* Quota paused banner — ทุก platform ที่ breaker เปิด */}
      <div className="mb-4 empty:mb-0 space-y-3">
        <MarketplaceQuotaPausedAlert note="ปุ่ม Sync ของ platform ที่โดนพักจะใช้ไม่ได้จนกว่าโควตาจะ reset" />
      </div>

      {/* ===== SHOPEE ===== */}
      {activePlatform === 'shopee' && (loading ? (
        <LoadingCard />
      ) : (
        <div className="space-y-4">
          {shopeeAccounts.map(account => {
            const isSyncing = syncingId === account.id;
            const isRefreshingLogo = refreshingLogoId === account.id;
            return (
              <MarketplaceAccountCard
                key={account.id}
                account={account}
                title={account.shop_name || `Shop #${account.shop_id}`}
                showProductCount
                expandable
                expanded={expandedId === account.id}
                onToggleExpand={() => setExpandedId(expandedId === account.id ? null : account.id)}
                onDisconnect={() => handleDisconnect(account.id)}
                disconnecting={disconnectingId === account.id}
                avatar={
                  <button
                    onClick={() => handleRefreshLogo(account.id)}
                    disabled={isRefreshingLogo}
                    className="relative flex-shrink-0 group"
                    title="กดเพื่ออัพเดทรูปร้าน"
                  >
                    {(account.metadata?.shop_logo as string) ? (
                      <img
                        src={account.metadata.shop_logo as string}
                        alt={account.shop_name || 'Shop'}
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-transparent flex items-center justify-center">
                        <ShoppingBag className="w-5 h-5 text-shopee" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <RefreshCw className={`w-4 h-4 text-white ${isRefreshingLogo ? 'animate-spin' : ''}`} />
                    </div>
                  </button>
                }
              >
                {/* Details */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
                  <span>Shop ID: {account.shop_id}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Sync ล่าสุด: {formatThaiDateTime(account.last_sync_at)}
                  </span>
                  <span>เชื่อมต่อเมื่อ: {formatThaiDateTime(account.created_at)}</span>
                </div>

                {/* Auto-Sync Toggles */}
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <Toggle
                      checked={account.auto_sync_stock !== false}
                      onChange={v => handleToggleSync(account.id, 'auto_sync_stock', v)}
                      aria-label="Sync Stock อัตโนมัติ"
                    />
                    <span className="text-xs text-gray-700 dark:text-slate-300">Sync Stock อัตโนมัติ</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle
                      checked={account.auto_sync_product_info !== false}
                      onChange={v => handleToggleSync(account.id, 'auto_sync_product_info', v)}
                      aria-label="Sync ชื่อ/ราคา อัตโนมัติ"
                    />
                    <span className="text-xs text-gray-700 dark:text-slate-300">Sync ชื่อ/ราคา อัตโนมัติ</span>
                  </div>
                </div>

                {/* Sync Controls */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <SyncRangeSelect
                    value={syncRange[account.id] || 1}
                    onChange={days => setSyncRange(prev => ({ ...prev, [account.id]: days }))}
                  />
                  <Button
                    variant="secondary"
                    icon={<RefreshCw className="w-4 h-4" />}
                    loading={isSyncing}
                    disabled={account.connection_status === 'expired'}
                    onClick={() => handleSync(account.id)}
                  >
                    {isSyncing ? 'กำลัง Sync...' : 'Sync Now'}
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<RefreshCw className="w-4 h-4" />}
                    loading={isSyncing}
                    disabled={account.connection_status === 'expired'}
                    onClick={() => handleSyncIncomplete(account.id)}
                  >
                    Sync สถานะค้าง
                  </Button>
                  <ImportButton
                    disabled={account.connection_status === 'expired'}
                    onClick={() => {
                      const name = account.shop_name || `Shop #${account.shop_id}`;
                      router.push(`/shopee/import?account_id=${account.id}&account_name=${encodeURIComponent(name)}`);
                    }}
                  >
                    นำเข้าสินค้าจาก Shopee
                  </ImportButton>
                  <ExportButton
                    disabled={account.connection_status === 'expired'}
                    onClick={() => {
                      const name = account.shop_name || `Shop #${account.shop_id}`;
                      router.push(`/shopee/export?account_id=${account.id}&account_name=${encodeURIComponent(name)}`);
                    }}
                  >
                    ส่งสินค้าไป Shopee
                  </ExportButton>
                </div>
              </MarketplaceAccountCard>
            );
          })}
        </div>
      ))}

      {/* ===== TIKTOK ===== */}
      {activePlatform === 'tiktok' && (loading ? (
        <LoadingCard />
      ) : (
        <div className="space-y-4">
          {tiktokAccounts.map(account => {
            const isSyncing = syncingId === account.id;
            const region = (account.metadata?.region as string) || '';
            return (
              <MarketplaceAccountCard
                key={account.id}
                account={account}
                title={account.shop_name || `TikTok Shop #${account.shop_id}`}
                titleExtra={region ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 uppercase">
                    {region}
                  </span>
                ) : undefined}
                expandable
                expanded={expandedId === account.id}
                onToggleExpand={() => setExpandedId(expandedId === account.id ? null : account.id)}
                onDisconnect={() => handleDisconnect(account.id)}
                disconnecting={disconnectingId === account.id}
                avatar={
                  <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
                    <ShoppingBag className="w-5 h-5 text-white" />
                  </div>
                }
              >
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
                  <span>Shop ID: {account.shop_id}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Sync ล่าสุด: {formatThaiDateTime(account.last_sync_at)}
                  </span>
                  <span>เชื่อมต่อเมื่อ: {formatThaiDateTime(account.created_at)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <SyncRangeSelect
                    value={syncRange[account.id] || 1}
                    onChange={days => setSyncRange(prev => ({ ...prev, [account.id]: days }))}
                  />
                  <Button
                    variant="secondary"
                    icon={<RefreshCw className="w-4 h-4" />}
                    loading={isSyncing}
                    disabled={account.connection_status === 'expired'}
                    onClick={() => handleSimpleSync('tiktok', account.id)}
                  >
                    {isSyncing ? 'กำลัง Sync...' : 'Sync Now'}
                  </Button>
                  <ImportButton
                    disabled={account.connection_status === 'expired'}
                    onClick={() => {
                      const name = account.shop_name || `Shop #${account.shop_id}`;
                      router.push(`/tiktok/import?account_id=${account.id}&account_name=${encodeURIComponent(name)}`);
                    }}
                  >
                    นำเข้าสินค้าจาก TikTok
                  </ImportButton>
                </div>
              </MarketplaceAccountCard>
            );
          })}
        </div>
      ))}

      {/* ===== LAZADA ===== */}
      {activePlatform === 'lazada' && (loading ? (
        <LoadingCard />
      ) : (
        <div className="space-y-4">
          <Alert tone="info">
            เชื่อมร้านแล้วเปิดรับ<b>แชท</b>ได้ที่{' '}
            <a href="/settings/chat-channels#lazada" className="underline font-medium">ตั้งค่า &gt; ช่องทาง Chat</a>
            {' '}— ออเดอร์เข้าอัตโนมัติผ่าน webhook + sync ทุก 15 นาที
          </Alert>
          {lazadaAccounts.map(account => {
            const isSyncing = syncingId === account.id;
            return (
              <MarketplaceAccountCard
                key={account.id}
                account={account}
                title={account.shop_name || `Lazada #${account.shop_id}`}
                onDisconnect={() => handleDisconnect(account.id)}
                disconnecting={disconnectingId === account.id}
                avatar={
                  <div className="w-10 h-10 rounded-lg bg-[#0F146E] flex items-center justify-center flex-shrink-0">
                    <ShoppingBag className="w-5 h-5 text-white" />
                  </div>
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SyncRangeSelect
                    value={syncRange[account.id] || 1}
                    onChange={days => setSyncRange(prev => ({ ...prev, [account.id]: days }))}
                  />
                  <Button
                    variant="secondary"
                    icon={<RefreshCw className="w-4 h-4" />}
                    loading={isSyncing}
                    disabled={account.connection_status === 'expired'}
                    onClick={() => handleSimpleSync('lazada', account.id)}
                  >
                    {isSyncing ? 'กำลัง Sync...' : 'Sync Now'}
                  </Button>
                </div>
              </MarketplaceAccountCard>
            );
          })}
        </div>
      ))}

      {/* Loading Overlay for sync operations */}
      <LoadingOverlay
        isOpen={!!syncingId}
        title="กำลัง Sync คำสั่งซื้อ..."
        message={syncPhaseLabel}
        progress={syncProgress}
        onCancel={handleCancelSync}
      />
      {confirmDialog}
    </div>
  );
}
