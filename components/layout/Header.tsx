// Path: src/components/layout/Header.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import ThemeToggle from '@/components/ThemeToggle';
import { useFeatures } from '@/lib/features-context';
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
} from 'lucide-react';

// Notification interface
interface Notification {
  id: string;
  type: 'warning' | 'info' | 'success';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export default function Header() {
  const { userProfile, signOut } = useAuth();
  const { currentCompany, companyRoles } = useCompany();
  const { features } = useFeatures();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Initialize notifications with mock data (ในระบบจริงจะดึงจาก database)
  const [notifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'warning',
      title: 'วัตถุดิบใกล้หมด',
      message: 'ส้มเขียวหวาน เหลือ 30 kg',
      time: '10 นาทีที่แล้ว',
      read: false
    },
    {
      id: '2',
      type: 'info',
      title: 'ออเดอร์ใหม่',
      message: 'SO241107001 จากร้านส้มตำป้าหนอย',
      time: '1 ชั่วโมงที่แล้ว',
      read: false
    },
    {
      id: '3',
      type: 'success',
      title: 'QC ผ่าน',
      message: 'Batch OJ250724001 ผ่านการตรวจสอบ',
      time: '2 ชั่วโมงที่แล้ว',
      read: true
    }
  ]);

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
    <header className="bg-[#1A1A2E] lg:bg-white lg:dark:bg-slate-900 border-b border-[#F4511E]/20 lg:border-gray-200 lg:dark:border-slate-700 sticky top-0 z-30">
      <div className="relative flex items-center justify-end h-16 px-4 lg:px-6">
        {/* Mobile Logo (absolute center) */}
        <div className="lg:hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Image src="/logo.svg" alt="AooDelivery" width={100} height={65} className="h-10 w-auto" />
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
              className="relative p-2 text-[#F4511E] lg:text-gray-600 lg:dark:text-slate-400 hover:bg-white/10 lg:hover:bg-gray-100 lg:dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
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
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-4 border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${
                          !notification.read ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          {getNotificationIcon(notification.type)}
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 dark:text-white text-sm">
                              {notification.title}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                              {notification.message}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                              {notification.time}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                      ไม่มีการแจ้งเตือน
                    </div>
                  )}
                </div>

                {notifications.length > 0 && (
                  <div className="p-3 border-t border-gray-200 dark:border-slate-700">
                    <button className="w-full text-center text-sm text-[#F4511E] hover:text-[#F4511E]/80 font-medium">
                      ดูทั้งหมด
                    </button>
                  </div>
                )}
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
              <div className="w-8 h-8 bg-[#F4511E] rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-sm">
                  {userProfile?.name.charAt(0).toUpperCase()}
                </span>
              </div>
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
                    <p className="text-xs text-[#F4511E] mt-1">
                      {currentCompany?.name} · {
                        companyRoles.map(r => ({ owner: 'เจ้าของ', admin: 'ผู้ดูแลระบบ', manager: 'ผู้จัดการ', account: 'ฝ่ายบัญชี', warehouse: 'ฝ่ายคลังสินค้า', sales: 'ฝ่ายขาย', cashier: 'แคชเชียร์' } as Record<string, string>)[r] || r).join(', ')
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
