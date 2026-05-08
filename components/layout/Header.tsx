// Path: src/components/layout/Header.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import ThemeToggle from '@/components/ThemeToggle';
import UserAvatar from '@/components/ui/UserAvatar';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import {
  Bell,
  User,
  LogOut,
  Settings,
  ChevronDown,
  AlertCircle,
  Clock,
  CheckCircle,
  ScrollText,
  ShoppingBag,
} from 'lucide-react';

interface Notification {
  id: string;
  type: 'warning' | 'info' | 'success';
  title: string;
  message: string;
  time: string;
  read: boolean;
  href?: string;
}

interface MarketplaceHealth {
  expired_count: number;
  inactive_count: number;
  error_count: number;
  total_issues: number;
  issues: Array<{
    account_id: string;
    shop_name: string | null;
    platform: string;
    type: 'expired' | 'disconnected';
    message: string;
  }>;
}

export default function Header() {
  const { userProfile, signOut } = useAuth();
  const { currentCompany, companyRoles } = useCompany();
  const { features } = useFeatures();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const [notifications, setNotifications] = useState<Notification[]>([]);

  const fetchMarketplaceHealth = useCallback(async () => {
    if (!features.marketplace_sync) return;
    try {
      const res = await apiFetch('/api/marketplace/health');
      if (!res.ok) return;
      const data: MarketplaceHealth = await res.json();
      const items: Notification[] = data.issues.map(issue => ({
        id: `mp-${issue.account_id}`,
        type: 'warning',
        title: issue.type === 'expired' ? 'Token Shopee หมดอายุ' : 'ร้านถูกปิดการเชื่อมต่อ',
        message: `${issue.shop_name || 'Shop'} — ${issue.message}`,
        time: '',
        read: false,
        href: '/settings/integrations',
      }));
      setNotifications(items);
    } catch (e) {
      console.error('Failed to fetch marketplace health:', e);
    }
  }, [features.marketplace_sync]);

  useEffect(() => {
    fetchMarketplaceHealth();
    // Refresh every 5 minutes
    const interval = setInterval(fetchMarketplaceHealth, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMarketplaceHealth]);

  const [currentTime, setCurrentTime] = useState('');

  // Update current time
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeString = now.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const dateString = now.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      setCurrentTime(`${timeString} | ${dateString}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);

    return () => clearInterval(interval);
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.user-menu') && !target.closest('.notification-menu')) {
        setShowUserMenu(false);
        setShowNotifications(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Get notification icon based on type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'info':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <Bell className="w-5 h-5" />;
    }
  };

  // Count unread notifications
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="bg-[#1A1A2E] lg:bg-white lg:dark:bg-slate-900 border-b border-primary/20 lg:border-gray-200 lg:dark:border-slate-700 sticky top-0 z-30">
      <div className="relative flex items-center justify-end h-16 px-4 lg:px-6">
        {/* Mobile Logo (absolute center) */}
        <div className="lg:hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Image src="/logo.svg" alt="AooCommerce" width={100} height={65} className="h-10 w-auto" />
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-2 lg:space-x-4">
          {/* Current Time */}
          <div className="hidden lg:block text-sm text-gray-600 dark:text-slate-400">
            {currentTime}
          </div>

          {/* Theme Switcher */}
          <ThemeToggle className="hidden lg:block" />

          {/* Notifications */}
          <div className="relative notification-menu">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowUserMenu(false);
              }}
              className="relative p-2 text-primary lg:text-gray-600 lg:dark:text-slate-400 hover:bg-white/10 lg:hover:bg-gray-100 lg:dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                  <h3 className="font-semibold text-gray-900 dark:text-white">การแจ้งเตือน</h3>
                  {unreadCount > 0 && (
                    <p className="text-sm text-gray-500 dark:text-slate-400">{unreadCount} รายการที่ยังไม่ได้อ่าน</p>
                  )}
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => {
                      const content = (
                        <div className="flex items-start space-x-3">
                          {getNotificationIcon(notification.type)}
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 dark:text-white text-sm">
                              {notification.title}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                              {notification.message}
                            </p>
                            {notification.time && (
                              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                                {notification.time}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                      const className = `block p-4 border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${
                        !notification.read ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
                      }`;
                      return notification.href ? (
                        <Link
                          key={notification.id}
                          href={notification.href}
                          onClick={() => setShowNotifications(false)}
                          className={className}
                        >
                          {content}
                        </Link>
                      ) : (
                        <div key={notification.id} className={className}>
                          {content}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                      ไม่มีการแจ้งเตือน
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative user-menu">
            <button
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowNotifications(false);
              }}
              className="flex items-center space-x-2 p-2 text-white lg:text-gray-700 lg:dark:text-slate-200 hover:bg-white/10 lg:hover:bg-gray-100 lg:dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <UserAvatar
                src={userProfile?.avatar}
                name={userProfile?.name}
                email={userProfile?.email}
                size="sm"
              />
              <span className="hidden lg:block font-medium text-sm">
                {userProfile?.name}
              </span>
              <ChevronDown className="w-4 h-4 hidden lg:block" />
            </button>

            {/* User Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                  <p className="font-medium text-gray-900 dark:text-white">{userProfile?.name}</p>
                  <p className="text-sm text-gray-500 dark:text-slate-400">{userProfile?.email}</p>
                  {companyRoles.length > 0 && (
                    <p className="text-xs text-primary mt-1">
                      {currentCompany?.name} · {
                        companyRoles.map(r => ({ owner: 'เจ้าของ', admin: 'ผู้ดูแลระบบ', account: 'บัญชี', warehouse: 'คลังสินค้า', sales: 'แอดมินออนไลน์', cashier: 'แคชเชียร์' } as Record<string, string>)[r] || r).join(', ')
                      }
                    </p>
                  )}
                </div>

                {/* Mobile Theme Switcher */}
                <div className="lg:hidden p-2 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2 px-3">
                  <span className="text-xs text-gray-500 dark:text-slate-400">ธีม</span>
                  <ThemeToggle />
                </div>

                <div className="p-2">
                  <button
                    className="w-full flex items-center space-x-3 px-3 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <User className="w-4 h-4" />
                    <span className="text-sm">โปรไฟล์</span>
                  </button>

                  {(companyRoles.includes('owner') || companyRoles.includes('admin')) && (
                    <button
                      className="w-full flex items-center space-x-3 px-3 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      <span className="text-sm">ตั้งค่าระบบ</span>
                    </button>
                  )}
                </div>

                {/* Support / Logs */}
                {(companyRoles.includes('owner') || companyRoles.includes('admin')) && features.marketplace_sync && (
                  <div className="border-t border-gray-200 dark:border-slate-700 p-2">
                    <p className="text-xs text-gray-400 dark:text-slate-500 px-3 mb-1">Support</p>
                    <Link
                      href="/logs/shopee"
                      onClick={() => setShowUserMenu(false)}
                      className="w-full flex items-center space-x-3 px-3 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <ScrollText className="w-4 h-4" />
                      <span className="text-sm">Shopee Log</span>
                    </Link>
                  </div>
                )}

                <div className="border-t border-gray-200 dark:border-slate-700 p-2">
                  <button
                    onClick={() => signOut()}
                    className="w-full flex items-center space-x-3 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm">ออกจากระบบ</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
