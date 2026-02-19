'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, ShoppingBag, RefreshCw, Unlink, CheckCircle2,
  XCircle, Clock, ExternalLink, AlertTriangle, ChevronDown, ChevronUp,
  Plus, Trash2, Upload
} from 'lucide-react';
import ShopeeBulkExportModal from '@/components/shopee/ShopeeBulkExportModal';

interface ShopeeAccount {
  id: string;
  shop_id: number;
  shop_name: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  last_product_sync_at: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  connection_status: 'connected' | 'expired' | 'disconnected';
  metadata: Record<string, unknown>;
  created_at: string;
}

export default function IntegrationsPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<ShopeeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncRange, setSyncRange] = useState<Record<string, number>>({}); // accountId → days
  const [refreshingLogoId, setRefreshingLogoId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number>(0); // 0-100
  const [syncPhaseLabel, setSyncPhaseLabel] = useState('');
  const [productSyncingId, setProductSyncingId] = useState<string | null>(null);
  const [productSyncProgress, setProductSyncProgress] = useState<number>(0);
  const [productSyncPhaseLabel, setProductSyncPhaseLabel] = useState('');
  const [bulkExportAccountId, setBulkExportAccountId] = useState<string | null>(null);
  const [bulkExportAccountName, setBulkExportAccountName] = useState<string>('');

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiFetch('/api/shopee/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFetchOnce(() => {
    fetchAccounts();
  }, userProfile?.role === 'admin' || userProfile?.role === 'owner');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('shopee') === 'connected') {
      showToast('เชื่อมต่อ Shopee สำเร็จ', 'success');
      fetchAccounts();
      window.history.replaceState({}, '', '/settings/integrations');
    } else if (params.get('error')) {
      const err = params.get('error');
      const messages: Record<string, string> = {
        shopee_auth_failed: 'เชื่อมต่อ Shopee ไม่สำเร็จ กรุณาลองใหม่',
        missing_params: 'ข้อมูลจาก Shopee ไม่ครบ กรุณาลองใหม่',
        no_shops: 'ไม่พบร้านค้าในบัญชีนี้',
      };
      showToast(messages[err || ''] || 'เกิดข้อผิดพลาด', 'error');
      window.history.replaceState({}, '', '/settings/integrations');
    }
  }, [showToast]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await apiFetch('/api/shopee/oauth/auth-url');
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
    onEvent: (event: Record<string, unknown>) => void
  ) => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
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
  };

  const handleSync = async (accountId: string) => {
    setSyncingId(accountId);
    setSyncProgress(0);
    setSyncPhaseLabel('กำลังเชื่อมต่อ...');

    const days = syncRange[accountId] || 1;
    const now = Math.floor(Date.now() / 1000);
    const timeFrom = now - days * 24 * 60 * 60;
    try {
      const res = await apiFetch('/api/shopee/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopee_account_id: accountId, time_from: timeFrom, time_to: now }),
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
            // Indeterminate: oscillate 5-15%
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
      });

      // Brief pause to show 100%
      await new Promise(r => setTimeout(r, 500));

      if (result.success) {
        const parts: string[] = [];
        if ((result.orders_created as number) > 0) parts.push(`คำสั่งซื้อใหม่ ${result.orders_created}`);
        if ((result.orders_updated as number) > 0) parts.push(`อัพเดทคำสั่งซื้อ ${result.orders_updated}`);
        const summary = parts.length > 0 ? parts.join(', ') : 'ไม่มีข้อมูลใหม่';
        showToast(`Sync สำเร็จ: ${summary}`, 'success');
        fetchAccounts();
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการ sync', 'error');
    } finally {
      setSyncingId(null);
      setSyncProgress(0);
      setSyncPhaseLabel('');
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!confirm('ต้องการยกเลิกการเชื่อมต่อร้านนี้?')) return;
    setDisconnectingId(accountId);
    try {
      const res = await apiFetch(`/api/shopee/accounts?id=${accountId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('ยกเลิกการเชื่อมต่อสำเร็จ', 'success');
        fetchAccounts();
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
        fetchAccounts();
      } else {
        showToast('ไม่สามารถอัพเดทได้', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setRefreshingLogoId(null);
    }
  };

  const handleProductSync = async (accountId: string) => {
    setProductSyncingId(accountId);
    setProductSyncProgress(0);
    setProductSyncPhaseLabel('กำลังเชื่อมต่อ...');

    try {
      const res = await apiFetch('/api/shopee/products/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopee_account_id: accountId }),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Sync สินค้าไม่สำเร็จ', 'error');
        return;
      }

      let result: Record<string, unknown> = {};

      await readSSEStream(res, (event) => {
        if (event.type === 'progress') {
          const phase = event.phase as string;
          const current = event.current as number;
          const total = event.total as number | null;
          const label = event.label as string;
          setProductSyncPhaseLabel(label);

          if (phase === 'collecting') {
            setProductSyncProgress(Math.min(5 + (current % 10), 15));
          } else if (phase === 'processing' && total) {
            setProductSyncProgress(Math.round((current / total) * 80) + 15);
          }
        } else if (event.type === 'done') {
          result = event;
          setProductSyncProgress(100);
          setProductSyncPhaseLabel('เสร็จสิ้น');
        } else if (event.type === 'error') {
          showToast((event.message as string) || 'Sync สินค้าไม่สำเร็จ', 'error');
        }
      });

      await new Promise(r => setTimeout(r, 500));

      if (result.success) {
        const parts: string[] = [];
        if ((result.products_created as number) > 0) parts.push(`สินค้าใหม่ ${result.products_created}`);
        if ((result.products_updated as number) > 0) parts.push(`อัพเดท ${result.products_updated}`);
        if ((result.links_created as number) > 0) parts.push(`เชื่อมโยง ${result.links_created}`);
        if ((result.products_skipped as number) > 0) parts.push(`ข้าม ${result.products_skipped}`);
        const summary = parts.length > 0 ? parts.join(', ') : 'ไม่มีข้อมูลใหม่';
        showToast(`Sync สินค้าสำเร็จ: ${summary}`, 'success');
        fetchAccounts();
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการ sync สินค้า', 'error');
    } finally {
      setProductSyncingId(null);
      setProductSyncProgress(0);
      setProductSyncPhaseLabel('');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Admin guard
  if (userProfile && userProfile.role !== 'admin' && userProfile.role !== 'owner') {
    return (
      <Layout title="Marketplace">
        <div className="text-center py-16 text-gray-500 dark:text-slate-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Layout>
    );
  }

  const activeAccounts = accounts.filter(a => a.is_active);

  return (
    <Layout
      title="Marketplace"
      breadcrumbs={[
        { label: 'ตั้งค่าระบบ', href: '/settings' },
        { label: 'Marketplace' },
      ]}
    >
      <div className="max-w-3xl">
        {/* Shopee Tab Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex">
            <button
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#EE4D2D]"
            >
              <ShoppingBag className="w-4 h-4" />
              Shopee
              {activeAccounts.length > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#EE4D2D]/10 text-[#EE4D2D]">
                  {activeAccounts.length}
                </span>
              )}
            </button>
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-400 dark:text-slate-500 cursor-not-allowed"
            >
              <ShoppingBag className="w-4 h-4" />
              TikTok Shop
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500">
                Soon
              </span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Account Cards */}
            {activeAccounts.map(account => {
              const isExpanded = expandedId === account.id;
              const isSyncing = syncingId === account.id;
              const isDisconnecting = disconnectingId === account.id;
              const isRefreshingLogo = refreshingLogoId === account.id;
              const isProductSyncing = productSyncingId === account.id;

              return (
                <div key={account.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                  {/* Card Header */}
                  <div className="flex items-center gap-3 p-4">
                    {/* Shop Logo — click to refresh */}
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
                        <div className="w-10 h-10 rounded-lg bg-[#EE4D2D]/10 flex items-center justify-center relative">
                          <ShoppingBag className="w-5 h-5 text-[#EE4D2D]" />
                          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-gray-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">กดเพื่ออัพเดท</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <RefreshCw className={`w-4 h-4 text-white ${isRefreshingLogo ? 'animate-spin' : ''}`} />
                      </div>
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {account.shop_name || `Shop #${account.shop_id}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                        {account.connection_status === 'connected' ? (
                          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            เชื่อมต่อแล้ว
                          </span>
                        ) : account.connection_status === 'expired' ? (
                          <span className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Token หมดอายุ
                          </span>
                        ) : (
                          <span className="text-gray-400 flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            ยกเลิกแล้ว
                          </span>
                        )}
                        <span className="ml-1">#{account.shop_id}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleSync(account.id)}
                        disabled={isSyncing || account.connection_status === 'expired'}
                        className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                        title="Sync Now"
                      >
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : account.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Sync Progress Bar */}
                  {isSyncing && (
                    <div className="px-4 pb-2 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2.5 py-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>กรุณาอย่าเปลี่ยนหน้า หรือ refresh ขณะกำลัง sync</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                        <span>{syncPhaseLabel || 'กำลัง Sync ออเดอร์...'}</span>
                        <span>{syncProgress}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#EE4D2D] rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${syncProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Product Sync Progress Bar */}
                  {isProductSyncing && (
                    <div className="px-4 pb-2 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2.5 py-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>กรุณาอย่าเปลี่ยนหน้า หรือ refresh ขณะกำลัง sync</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                        <span>{productSyncPhaseLabel || 'กำลัง Sync สินค้า...'}</span>
                        <span>{productSyncProgress}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${productSyncProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Expanded Section */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-slate-700 pt-3">
                      {/* Details */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
                        <span>Shop ID: {account.shop_id}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Sync ล่าสุด: {formatDate(account.last_sync_at)}
                        </span>
                        <span>Sync สินค้าล่าสุด: {formatDate(account.last_product_sync_at)}</span>
                        <span>เชื่อมต่อเมื่อ: {formatDate(account.created_at)}</span>
                      </div>

                      {/* Sync Controls */}
                      <div className="flex items-center gap-2 pt-1">
                        <select
                          value={syncRange[account.id] || 1}
                          onChange={e => setSyncRange(prev => ({ ...prev, [account.id]: parseInt(e.target.value) }))}
                          className="px-2 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#EE4D2D]/50"
                        >
                          <option value={1}>ย้อนหลัง 1 วัน</option>
                          <option value={3}>ย้อนหลัง 3 วัน</option>
                          <option value={7}>ย้อนหลัง 7 วัน</option>
                          <option value={15}>ย้อนหลัง 15 วัน</option>
                          <option value={30}>ย้อนหลัง 30 วัน</option>
                        </select>
                        <button
                          onClick={() => handleSync(account.id)}
                          disabled={isSyncing || account.connection_status === 'expired'}
                          className="px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 border border-[#EE4D2D] text-[#EE4D2D] hover:bg-[#EE4D2D]/5"
                        >
                          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                          {isSyncing ? 'กำลัง Sync...' : 'Sync Now'}
                        </button>
                        <button
                          onClick={() => handleProductSync(account.id)}
                          disabled={isProductSyncing || account.connection_status === 'expired'}
                          className="px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 border border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                        >
                          <ShoppingBag className={`w-4 h-4 ${isProductSyncing ? 'animate-pulse' : ''}`} />
                          {isProductSyncing ? 'กำลัง Sync...' : 'Sync สินค้า'}
                        </button>
                        <button
                          onClick={() => {
                            setBulkExportAccountId(account.id);
                            setBulkExportAccountName(account.shop_name || `Shop #${account.shop_id}`);
                          }}
                          disabled={account.connection_status === 'expired'}
                          className="px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 border border-[#EE4D2D] text-[#EE4D2D] hover:bg-[#EE4D2D]/5"
                        >
                          <Upload className="w-4 h-4" />
                          ส่งสินค้าไป Shopee
                        </button>
                        <button
                          onClick={() => handleDisconnect(account.id)}
                          disabled={isDisconnecting}
                          className="px-3 py-2 border border-red-300 dark:border-red-800 text-red-500 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                          {isDisconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          ยกเลิกการเชื่อมต่อ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add Button */}
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:border-[#EE4D2D] hover:text-[#EE4D2D] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {connecting ? 'กำลังเชื่อมต่อ...' : 'เชื่อมต่อร้าน Shopee'}
            </button>
          </div>
        )}
      </div>

      {/* Bulk Export Modal */}
      <ShopeeBulkExportModal
        isOpen={!!bulkExportAccountId}
        onClose={() => { setBulkExportAccountId(null); setBulkExportAccountName(''); }}
        accountId={bulkExportAccountId || ''}
        accountName={bulkExportAccountName}
      />
    </Layout>
  );
}
