'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, ShoppingBag, RefreshCw, Unlink, CheckCircle2,
  XCircle, Clock, ExternalLink, AlertTriangle
} from 'lucide-react';

interface ShopeeAccount {
  id: string;
  shop_id: number;
  shop_name: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  connection_status: 'connected' | 'expired' | 'disconnected';
  metadata: Record<string, unknown>;
  created_at: string;
}

export default function IntegrationsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<ShopeeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

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

  useEffect(() => {
    fetchAccounts();

    // Check URL params for OAuth result
    const params = new URLSearchParams(window.location.search);
    if (params.get('shopee') === 'connected') {
      showToast('เชื่อมต่อ Shopee สำเร็จ', 'success');
      // Clean up URL
      window.history.replaceState({}, '', '/settings/integrations');
    } else if (params.get('error') === 'shopee_auth_failed') {
      showToast('เชื่อมต่อ Shopee ไม่สำเร็จ กรุณาลองใหม่', 'error');
      window.history.replaceState({}, '', '/settings/integrations');
    }
  }, [fetchAccounts, showToast]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await apiFetch('/api/shopee/oauth/auth-url');
      if (res.ok) {
        const { url } = await res.json();
        // Redirect to Shopee login
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

  const handleSync = async (accountId: string) => {
    setSyncingId(accountId);
    try {
      const res = await apiFetch('/api/shopee/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopee_account_id: accountId }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          `Sync สำเร็จ: สร้างใหม่ ${data.created} รายการ, อัพเดท ${data.updated} รายการ`,
          'success'
        );
        fetchAccounts();
      } else {
        showToast(data.error || 'Sync ไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการ sync', 'error');
    } finally {
      setSyncingId(null);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="w-3 h-3" />
            เชื่อมต่อแล้ว
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <AlertTriangle className="w-3 h-3" />
            Token หมดอายุ
          </span>
        );
      case 'disconnected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            <XCircle className="w-3 h-3" />
            ยกเลิกแล้ว
          </span>
        );
    }
  };

  if (!user) return null;

  const activeAccounts = accounts.filter(a => a.is_active);

  return (
    <Layout
      title="เชื่อมต่อ Marketplace"
      breadcrumbs={[
        { label: 'ตั้งค่าระบบ', href: '/settings' },
        { label: 'Marketplace' },
      ]}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            เชื่อมต่อร้านค้าจาก Marketplace เพื่อ sync ออเดอร์เข้าระบบอัตโนมัติ
          </p>
        </div>

        {/* Shopee Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          {/* Section Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#EE4D2D]/10 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-[#EE4D2D]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Shopee</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {activeAccounts.length > 0
                    ? `เชื่อมต่อแล้ว ${activeAccounts.length} ร้าน`
                    : 'ยังไม่ได้เชื่อมต่อ'}
                </p>
              </div>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-2 px-4 py-2 bg-[#EE4D2D] hover:bg-[#D94429] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              {connecting ? 'กำลังเชื่อมต่อ...' : 'เชื่อมต่อ Shopee'}
            </button>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : activeAccounts.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingBag className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">ยังไม่มีร้าน Shopee ที่เชื่อมต่อ</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs">กดปุ่ม &ldquo;เชื่อมต่อ Shopee&rdquo; เพื่อ Login และเลือกร้าน</p>
            </div>
          ) : (
            /* Shop List */
            <div className="divide-y divide-gray-200 dark:divide-slate-700">
              {activeAccounts.map(account => (
                <div key={account.id} className="px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {account.shop_name || `Shop #${account.shop_id}`}
                        </h3>
                        {getStatusBadge(account.connection_status)}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>Shop ID: {account.shop_id}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Sync ล่าสุด: {formatDate(account.last_sync_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleSync(account.id)}
                        disabled={syncingId === account.id || account.connection_status === 'expired'}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncingId === account.id ? 'animate-spin' : ''}`} />
                        {syncingId === account.id ? 'กำลัง Sync...' : 'Sync Now'}
                      </button>
                      <button
                        onClick={() => handleDisconnect(account.id)}
                        disabled={disconnectingId === account.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Future: TikTok Section */}
        <div className="mt-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden opacity-60">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">TikTok Shop</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">เร็วๆ นี้</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 text-xs rounded-full">
              Coming Soon
            </span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
