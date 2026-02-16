'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, ShoppingBag, RefreshCw, Unlink, CheckCircle2,
  XCircle, Clock, ExternalLink, AlertTriangle, ChevronDown, ChevronUp,
  Plus, Trash2
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
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<ShopeeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    if (userProfile?.role === 'admin' || userProfile?.role === 'owner') {
      fetchAccounts();
    }
  }, [userProfile, fetchAccounts]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('shopee') === 'connected') {
      showToast('เชื่อมต่อ Shopee สำเร็จ', 'success');
      window.history.replaceState({}, '', '/settings/integrations');
    } else if (params.get('error') === 'shopee_auth_failed') {
      showToast('เชื่อมต่อ Shopee ไม่สำเร็จ กรุณาลองใหม่', 'error');
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
          <div className="flex border-b border-gray-200 dark:border-slate-700">
            <button
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 border-[#EE4D2D] text-[#EE4D2D]"
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
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-400 dark:text-slate-500 cursor-not-allowed"
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

              return (
                <div key={account.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                  {/* Card Header */}
                  <div className="flex items-center gap-3 p-4">
                    {/* Shop Icon */}
                    <div className="w-10 h-10 rounded-lg bg-[#EE4D2D]/10 flex items-center justify-center flex-shrink-0">
                      <ShoppingBag className="w-5 h-5 text-[#EE4D2D]" />
                    </div>

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
                        <span>เชื่อมต่อเมื่อ: {formatDate(account.created_at)}</span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleSync(account.id)}
                          disabled={isSyncing || account.connection_status === 'expired'}
                          className="px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 border border-[#EE4D2D] text-[#EE4D2D] hover:bg-[#EE4D2D]/5"
                        >
                          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                          {isSyncing ? 'กำลัง Sync...' : 'Sync Now'}
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
    </Layout>
  );
}
