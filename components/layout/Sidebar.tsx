// Path: src/components/layout/Sidebar.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  Home,
  Users,
  UserCircle,
  ShoppingCart,
  DollarSign,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  FileText,
  Package2,
  Truck,
  UserCheck,
  MessageCircle,
  CreditCard,
  ChevronDown
} from 'lucide-react';

// Menu item interface
interface MenuItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: string[];
  badge?: number;
}

// Menu section interface
interface MenuSection {
  title: string;
  items: MenuItem[];
}

// Menu sections configuration
const menuSections: MenuSection[] = [
  // ระบบการขาย - Sales System
  {
    title: 'ระบบการขาย',
    items: [
      {
        label: 'คำสั่งซื้อ',
        href: '/orders',
        icon: <ShoppingCart className="w-5 h-5" />,
        roles: ['admin', 'manager', 'sales']
      },
      {
        label: 'LINE Chat',
        href: '/line-chat',
        icon: <MessageCircle className="w-5 h-5" />,
        roles: ['admin', 'manager', 'sales']
      },
      {
        label: 'ติดตามลูกค้า',
        href: '/crm/follow-up',
        icon: <UserCheck className="w-5 h-5" />,
        roles: ['admin', 'manager', 'sales']
      },
      {
        label: 'ติดตามหนี้',
        href: '/crm/payment-followup',
        icon: <DollarSign className="w-5 h-5" />,
        roles: ['admin', 'manager', 'sales']
      },
      {
        label: 'จัดของ & ส่ง',
        href: '/reports/delivery-summary',
        icon: <Truck className="w-5 h-5" />,
        roles: ['admin', 'manager', 'sales']
      },
      {
        label: 'ลูกค้า',
        href: '/customers',
        icon: <UserCircle className="w-5 h-5" />,
        roles: ['admin', 'manager', 'sales']
      },
      {
        label: 'สินค้า',
        href: '/products',
        icon: <Package2 className="w-5 h-5" />,
        roles: ['admin', 'manager', 'sales']
      }
    ]
  },
  // รายงาน - Reports
  {
    title: 'รายงาน',
    items: [
      {
        label: 'รายงานยอดขาย',
        href: '/reports/sales',
        icon: <BarChart3 className="w-5 h-5" />,
        roles: ['admin', 'manager', 'sales']
      },
      {
        label: 'รายงานยอดค้าง',
        href: '/reports/pending',
        icon: <FileText className="w-5 h-5" />,
        roles: ['admin', 'manager', 'sales']
      }
    ]
  }
  // TODO: ระบบการผลิต - จะเพิ่มภายหลัง
];

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { userProfile, signOut } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Auto-open settings dropdown when on any settings page
  useEffect(() => {
    if (pathname?.startsWith('/settings')) {
      setSettingsOpen(true);
    }
  }, [pathname]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    const handleRouteChange = () => {
      if (window.innerWidth < 1024) {
        setIsOpen(false);
      }
    };

    handleRouteChange();
  }, [pathname]);

  // Filter menu sections based on user role
  const filteredSections = menuSections
    .map(section => ({
      ...section,
      items: section.items.filter(item =>
        userProfile && item.roles.includes(userProfile.role)
      )
    }))
    .filter(section => section.items.length > 0);

  return (
    <>
      {/* Mobile Menu Button - positioned inside the header bar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg hover:bg-white/10 transition-colors"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-[#E9B308]" />
        ) : (
          <Menu className="w-6 h-6 text-[#E9B308]" />
        )}
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-[#00231F] border-r border-[#E9B308]/20 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-center h-16 border-b border-[#E9B308]/20 px-4">
            <Image src="/logo.svg" alt="JOOLZ Factory" width={100} height={65} className="h-10 w-auto" priority />
          </div>

          {/* User Info */}
          {userProfile && (
            <div className="p-4 border-b border-[#E9B308]/20">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-[#E9B308]/20 rounded-full flex items-center justify-center">
                  <span className="text-[#E9B308] font-semibold">
                    {userProfile.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">
                    {userProfile.name}
                  </p>
                  <p className="text-[#E9B308] text-xs">
                    {userProfile.role === 'admin' && 'ผู้ดูแลระบบ'}
                    {userProfile.role === 'manager' && 'ผู้จัดการ'}
                    {userProfile.role === 'sales' && 'ฝ่ายขาย'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            {/* Dashboard */}
            <Link
              href="/dashboard"
              className={`flex items-center space-x-3 px-3 py-2 rounded-lg mb-2 transition-colors ${
                pathname === '/dashboard'
                  ? 'bg-[#E9B308] text-[#00231F]'
                  : 'text-gray-300 hover:bg-[#E9B308]/10 hover:text-[#E9B308]'
              }`}
            >
              <Home className="w-5 h-5" />
              <span className="text-[16px] font-medium">Dashboard</span>
            </Link>

            {/* Menu Sections */}
            {filteredSections.map((section, sectionIndex) => (
              <div key={sectionIndex}>
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mt-6 mb-2">
                  {section.title}
                </h3>
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                      pathname === item.href
                        ? 'bg-[#E9B308] text-[#00231F]'
                        : 'text-gray-300 hover:bg-[#E9B308]/10 hover:text-[#E9B308]'
                    }`}
                  >
                    {item.icon}
                    <span className="text-[16px] font-medium">{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ))}

            {/* Admin Section */}
            {userProfile?.role === 'admin' && (
              <div>
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mt-6 mb-2">
                  ผู้ดูแลระบบ
                </h3>
                <Link
                  href="/users"
                  className={`flex items-center space-x-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                    pathname === '/users'
                      ? 'bg-[#E9B308] text-[#00231F]'
                      : 'text-gray-300 hover:bg-[#E9B308]/10 hover:text-[#E9B308]'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  <span className="text-[16px] font-medium">จัดการผู้ใช้</span>
                </Link>
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                    pathname?.startsWith('/settings')
                      ? 'text-[#E9B308]'
                      : 'text-gray-300 hover:text-[#E9B308]'
                  }`}
                >
                  <Settings className="w-5 h-5" />
                  <span className="text-[16px] font-medium ml-3">ตั้งค่าระบบ</span>
                  <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                </button>
                {settingsOpen && (
                  <div className="ml-3 border-l border-[#E9B308]/20">
                    <Link
                      href="/settings"
                      className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${
                        pathname === '/settings'
                          ? 'text-[#E9B308]'
                          : 'text-gray-400 hover:text-[#E9B308]'
                      }`}
                    >
                      <Settings className="w-4 h-4" />
                      <span className="text-[16px] font-medium">ทั่วไป</span>
                    </Link>
                    <Link
                      href="/settings/payment-channels"
                      className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${
                        pathname === '/settings/payment-channels'
                          ? 'text-[#E9B308]'
                          : 'text-gray-400 hover:text-[#E9B308]'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span className="text-[16px] font-medium">ช่องทางชำระเงิน</span>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Logout Button */}
          <div className="p-4 border-t border-[#E9B308]/20">
            <button
              onClick={() => signOut()}
              className="flex items-center space-x-3 w-full px-3 py-2 text-gray-300 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-[16px] font-medium">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}