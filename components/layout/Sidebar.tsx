// Path: components/layout/Sidebar.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import {
  Home,
  Users,
  UserCircle,
  ShoppingCart,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  Package2,
  Truck,
  MessageCircle,
  CreditCard,
  ChevronDown,
  Building2,
  UserCog,
  Check,
  Facebook,
  Warehouse,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  ShoppingBag,
  Tag,
  Award,
  Monitor,
  Receipt,
  Factory,
  ClipboardList,
  ReceiptText,
  Handshake,
  FileText,
  Store,
  RotateCcw,
} from 'lucide-react';

interface MenuItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: string[];
  badge?: number;
  badgeColor?: string; // tailwind bg class e.g. 'bg-orange-500'
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    title: 'POS',
    items: [
      { label: 'POS', href: '/pos', icon: <Monitor className="w-5 h-5" />, roles: ['admin', 'cashier'] },
      { label: 'รายการขาย POS', href: '/pos/orders', icon: <Receipt className="w-5 h-5" />, roles: ['admin', 'cashier', 'account'] },
    ]
  },
  {
    title: 'ระบบการขาย',
    items: [
      { label: 'Chat', href: '/chat', icon: <MessageCircle className="w-5 h-5" />, roles: ['admin', 'sales'] },
      { label: 'คำสั่งซื้อ', href: '/orders', icon: <ShoppingCart className="w-5 h-5" />, roles: ['admin', 'sales', 'account', 'warehouse'] },
      { label: 'จัดของ & ส่ง', href: '/reports/delivery-summary', icon: <Truck className="w-5 h-5" />, roles: ['admin', 'sales', 'warehouse'] },
    ]
  },
  {
    title: 'สินค้า',
    items: [
      { label: 'สินค้า', href: '/products', icon: <Package2 className="w-5 h-5" />, roles: ['admin', 'sales', 'warehouse'] },
      { label: 'สินค้าคงคลัง', href: '/inventory', icon: <Warehouse className="w-5 h-5" />, roles: ['admin', 'warehouse', 'cashier', 'sales'] },
      { label: 'โปรโมชั่น', href: '/promotions', icon: <Tag className="w-5 h-5" />, roles: ['admin', 'sales'] },
    ]
  },
  {
    title: 'Contact',
    items: [
      { label: 'ซัพพลายเออร์', href: '/settings/suppliers', icon: <Factory className="w-5 h-5" />, roles: ['admin'] },
      { label: 'ลูกค้า', href: '/customers', icon: <UserCircle className="w-5 h-5" />, roles: ['admin', 'sales', 'account'] },
    ]
  },
  {
    title: 'รายงาน',
    items: [
      { label: 'เอกสารบัญชี', href: '/invoices/tax', icon: <FileText className="w-5 h-5" />, roles: ['admin', 'account'] },
      { label: 'รายงานยอดขาย', href: '/reports/sales', icon: <BarChart3 className="w-5 h-5" />, roles: ['admin', 'sales', 'account'] },
      { label: 'รายงานโปรโมชั่น', href: '/promotions/report', icon: <Tag className="w-5 h-5" />, roles: ['admin', 'sales'] },
      { label: 'รายงานซัพพลายเออร์', href: '/reports/supplier', icon: <Factory className="w-5 h-5" />, roles: ['admin', 'account'] }
    ]
  }
];

const ROLE_LABELS: Record<string, string> = {
  owner: 'เจ้าของ',
  admin: 'ผู้ดูแลระบบ',
  account: 'บัญชี',
  warehouse: 'คลังสินค้า',
  sales: 'แอดมินออนไลน์',
  cashier: 'แคชเชียร์',
};

const getRoleLabels = (roles: string[]) => {
  if (!roles || roles.length === 0) return '';
  return roles.map(r => ROLE_LABELS[r] || r).join(', ');
};

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [accountingOpen, setAccountingOpen] = useState(false);
  const [consignmentOpen, setConsignmentOpen] = useState(false);
  const [dealerWholesaleOpen, setDealerWholesaleOpen] = useState(false);
  const [deptStoreOpen, setDeptStoreOpen] = useState(false);
  const [deptWholesaleOpen, setDeptWholesaleOpen] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [orderReadyCount, setOrderReadyCount] = useState(0);
  // Default เป็น true เพื่อไม่ให้เมนูกระพริบ → ถ้า API บอกปิดค่อยซ่อน
  const [stockEnabled, setStockEnabled] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, loading: authLoading, signOut } = useAuth();
  const { currentCompany, companies, switchCompany, companyRoles, loading: companyLoading } = useCompany();
  const { features, loading: featuresLoading } = useFeatures();
  const companyDropdownRef = useRef<HTMLDivElement>(null);

  const effectiveRoles = (() => {
    const roles = new Set<string>();
    for (const r of companyRoles) {
      if (r === 'owner' || r === 'admin') {
        roles.add('admin');
      } else {
        roles.add(r);
      }
    }
    if (roles.size === 0) {
      for (const r of (userProfile?.roles || ['sales'])) {
        roles.add(r);
      }
    }
    return roles;
  })();

  useEffect(() => {
    if (pathname?.startsWith('/settings')) setSettingsOpen(true);
    if (pathname?.startsWith('/inventory')) setInventoryOpen(true);
    if (pathname?.startsWith('/products') || pathname === '/settings/categories' || pathname === '/settings/brands') setProductsOpen(true);
    if (pathname?.startsWith('/invoices') || pathname?.startsWith('/credit-notes') || pathname?.startsWith('/statements')) setAccountingOpen(true);
    if (pathname?.startsWith('/replenishments') || pathname?.startsWith('/consignment')) setConsignmentOpen(true);
    if (pathname?.startsWith('/department-store/reports')) setDeptStoreOpen(true);
  }, [pathname]);

  useEffect(() => {
    if (window.innerWidth < 1024) setIsOpen(false);
  }, [pathname]);

  // Close company dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(e.target as Node)) {
        setCompanyDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Check stock enabled + fetch low stock count (once)
  useFetchOnce(async () => {
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        const enabled = data.stockConfig?.stockEnabled !== false;
        setStockEnabled(enabled);

        if (enabled) {
          try {
            const invRes = await apiFetch('/api/inventory?low_stock=true&limit=1');
            if (invRes.ok) {
              const invData = await invRes.json();
              setLowStockCount(invData.total || 0);
            }
          } catch {
            // Ignore
          }
        }
      }
    } catch {
      // API error → keep default (enabled)
    }
  }, !!userProfile);

  // Fetch chat unread count via API
  const fetchChatUnread = useCallback(async () => {
    try {
      const res = await apiFetch('/api/chat/unread-count');
      if (res.ok) {
        const data = await res.json();
        setChatUnreadCount(data.unread || 0);
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch order ready_to_ship count via API
  const fetchOrderReadyCount = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders/ready-count');
      if (res.ok) {
        const data = await res.json();
        setOrderReadyCount(data.count || 0);
      }
    } catch { /* ignore */ }
  }, []);

  // Initial fetch + Supabase Realtime subscription for unread changes
  // Use stable IDs to prevent re-subscribing on every context re-render
  const userId = userProfile?.id;
  const companyId = currentCompany?.id;

  useEffect(() => {
    if (!userId || !companyId) return;

    fetchChatUnread();

    // Subscribe to unread_count changes on both contact tables
    const channel = supabase
      .channel('sidebar-unread')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'line_contacts',
        filter: `company_id=eq.${companyId}`,
      }, () => { fetchChatUnread(); })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'line_contacts',
        filter: `company_id=eq.${companyId}`,
      }, () => { fetchChatUnread(); })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'fb_contacts',
        filter: `company_id=eq.${companyId}`,
      }, () => { fetchChatUnread(); })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'fb_contacts',
        filter: `company_id=eq.${companyId}`,
      }, () => { fetchChatUnread(); })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, companyId, fetchChatUnread]);

  // Initial fetch + Supabase Realtime for order ready_to_ship count
  useEffect(() => {
    if (!userId || !companyId) return;

    fetchOrderReadyCount();

    // Listen for custom event from order pages (e.g. after accepting orders)
    const handler = () => fetchOrderReadyCount();
    window.addEventListener('orders-count-changed', handler);

    const channel = supabase
      .channel('sidebar-order-ready')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `company_id=eq.${companyId}`,
      }, () => { fetchOrderReadyCount(); })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
        filter: `company_id=eq.${companyId}`,
      }, () => { fetchOrderReadyCount(); })
      .subscribe();

    return () => {
      window.removeEventListener('orders-count-changed', handler);
      supabase.removeChannel(channel);
    };
  }, [userId, companyId, fetchOrderReadyCount]);

  const filteredSections = menuSections
    .filter(section => {
      // Hide inventory item (not whole section) when stock is disabled — handled via item filter below
      // Hide "POS" section when pos feature is not enabled
      if (section.title === 'POS' && !features.pos) return false;
      return true;
    })
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (effectiveRoles.size === 0 || !item.roles.some(r => effectiveRoles.has(r))) return false;
        // Hide delivery-only menus when feature is off
        if (item.href === '/reports/delivery-summary' && !features.delivery_date.enabled) return false;
        if (item.href === '/reports/supplier' && !features.supplier) return false;
        if (item.href === '/settings/suppliers' && !features.supplier) return false;
        // Hide inventory when stock is disabled
        if (item.href === '/inventory' && !stockEnabled) return false;
        return true;
      })
    }))
    .filter(section => section.items.length > 0);

  // Inject low stock badge into inventory menu item
  if (lowStockCount > 0) {
    filteredSections.forEach(section => {
      section.items.forEach(item => {
        if (item.href === '/inventory') {
          item.badge = lowStockCount;
        }
      });
    });
  }

  // Inject chat unread badge
  if (chatUnreadCount > 0) {
    filteredSections.forEach(section => {
      section.items.forEach(item => {
        if (item.href === '/chat') {
          item.badge = chatUnreadCount;
        }
      });
    });
  }

  // Inject order ready_to_ship badge (orange = same as รอกดรับ tab)
  if (orderReadyCount > 0) {
    filteredSections.forEach(section => {
      section.items.forEach(item => {
        if (item.href === '/orders') {
          item.badge = orderReadyCount;
          item.badgeColor = 'bg-orange-500';
        }
      });
    });
  }

  const handleSwitchCompany = (companyId: string) => {
    setCompanyDropdownOpen(false);
    if (companyId !== currentCompany?.id) {
      switchCompany(companyId);
    }
  };

  const handleAddCompany = () => {
    setCompanyDropdownOpen(false);
    router.push('/onboarding');
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg hover:bg-white/10 transition-colors"
      >
        {isOpen ? <X className="w-6 h-6 text-[#F4511E]" /> : <Menu className="w-6 h-6 text-[#F4511E]" />}
      </button>

      {/* Mobile Overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setIsOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 lg:h-full bg-[#1A1A2E] border-r border-white/10 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-center h-16 border-b border-white/10 px-4">
            <Image src="/logo.svg" alt="AooCommerce" width={100} height={65} className="h-10 w-auto" priority />
          </div>

          {/* Company Profile (clickable for company list) */}
          <div className="relative border-b border-white/10" ref={companyDropdownRef}>
            {(authLoading || companyLoading) ? (
              <div className="w-full px-4 py-3 flex items-center gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-white/10 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-white/10 rounded w-24" />
                  <div className="h-3 bg-white/10 rounded w-16" />
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
                >
                  {currentCompany?.logo_url ? (
                    <img
                      src={currentCompany.logo_url}
                      alt={currentCompany.name}
                      className="w-9 h-9 rounded-full object-cover border-2 border-[#F4511E]/30 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[#F4511E]/20 flex items-center justify-center border-2 border-[#F4511E]/30 flex-shrink-0">
                      <Building2 className="w-5 h-5 text-[#F4511E]" />
                    </div>
                  )}
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-white text-sm font-semibold truncate">
                      {currentCompany?.name || 'เลือกบริษัท'}
                    </p>
                    <p className="text-[#F4511E] text-xs">
                      {getRoleLabels(companyRoles)}
                    </p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${companyDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {companyDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setCompanyDropdownOpen(false)} />
                    <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-white rounded-xl shadow-2xl shadow-black/30 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 border border-gray-200">
                      <div className="py-1 max-h-64 overflow-y-auto">
                        {companies.map((m) => (
                          <button
                            key={m.company_id}
                            onClick={() => handleSwitchCompany(m.company_id)}
                            className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-[#F4511E]/10 transition-colors ${
                              m.company_id === currentCompany?.id ? 'bg-[#F4511E]/5' : ''
                            }`}
                          >
                            {m.company.logo_url ? (
                              <img
                                src={m.company.logo_url}
                                alt={m.company.name}
                                className="w-8 h-8 rounded-full object-cover border border-gray-200 flex-shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <Building2 className="w-4 h-4 text-gray-400" />
                              </div>
                            )}
                            <div className="flex-1 text-left min-w-0">
                              <p className="text-gray-900 text-sm font-medium truncate">{m.company.name}</p>
                              <p className="text-gray-400 text-xs">{getRoleLabels(m.roles)}</p>
                            </div>
                            {m.company_id === currentCompany?.id && (
                              <Check className="w-4 h-4 text-[#F4511E] flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-gray-100">
                        <button
                          onClick={handleAddCompany}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#F4511E]/10 transition-colors text-gray-500 hover:text-[#F4511E]"
                        >
                          <Building2 className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm">กลับไปเลือกบริษัท</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            {/* Dashboard */}
            <Link
              href="/dashboard"
              className={`flex items-center space-x-3 px-3 py-2 rounded-lg mb-2 transition-colors ${
                pathname === '/dashboard'
                  ? 'bg-[#F4511E] text-white'
                  : 'text-gray-300 hover:bg-[#F4511E]/10 hover:text-[#F4511E]'
              }`}
            >
              <Home className="w-5 h-5" />
              <span className="text-[16px] font-medium">Dashboard</span>
            </Link>

            {/* Skeleton loading while auth/company/features are loading */}
            {(authLoading || companyLoading || featuresLoading) && (
              <div className="animate-pulse space-y-4 mt-4">
                {[1, 2, 3].map(section => (
                  <div key={section}>
                    <div className="h-3 w-16 bg-white/10 rounded mb-3" />
                    {Array.from({ length: section === 1 ? 5 : 2 }).map((_, i) => (
                      <div key={i} className="flex items-center space-x-3 px-3 py-2 mb-1">
                        <div className="w-5 h-5 bg-white/10 rounded" />
                        <div className="h-4 bg-white/10 rounded flex-1" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Menu Sections */}
            {!authLoading && !companyLoading && !featuresLoading && filteredSections.map((section, sectionIndex) => (
              <div key={sectionIndex}>
                {/* Consignment Section — render before สินค้า */}
                {section.title === 'สินค้า' && features.consignment && (effectiveRoles.has('admin') || effectiveRoles.has('sales') || effectiveRoles.has('account')) && (
                  <>
                    <h3 className="text-xs text-gray-500 uppercase tracking-wider mt-6 mb-2">
                      ฝากขาย
                    </h3>
                    <button
                      onClick={() => setConsignmentOpen(!consignmentOpen)}
                      className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                        pathname?.startsWith('/replenishments') || pathname?.startsWith('/consignment')
                          ? 'text-[#F4511E]'
                          : 'text-gray-300 hover:text-[#F4511E]'
                      }`}
                    >
                      <Store className="w-5 h-5" />
                      <span className="text-[16px] font-medium ml-3">ตัวแทนฝากขาย</span>
                      <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${consignmentOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {consignmentOpen && (
                      <div className="ml-3 border-l border-white/10">
                        <Link href="/replenishments" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/replenishments' || pathname?.startsWith('/replenishments/') ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                          <ArrowUpFromLine className="w-4 h-4" />
                          <span className="text-[16px] font-medium">เติมสินค้าตัวแทน</span>
                        </Link>
                        <Link href="/consignment/reports" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/consignment/reports' || pathname?.startsWith('/consignment/reports/') ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                          <ClipboardList className="w-4 h-4" />
                          <span className="text-[16px] font-medium">ยอดขายตัวแทน</span>
                        </Link>
                      </div>
                    )}
                    {/* ตัวแทนขายขาด */}
                    <Link
                      href="/dealer-orders"
                      className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                        pathname?.startsWith('/dealer-orders')
                          ? 'text-[#F4511E]'
                          : 'text-gray-300 hover:text-[#F4511E]'
                      }`}
                    >
                      <ShoppingBag className="w-5 h-5" />
                      <span className="text-[16px] font-medium ml-3">ตัวแทนขายขาด</span>
                    </Link>
                  </>
                )}
                {/* Department Store Section */}
                {section.title === 'สินค้า' && features.department_store && (effectiveRoles.has('admin') || effectiveRoles.has('sales') || effectiveRoles.has('account')) && (
                  <>
                    <h3 className="text-xs text-gray-500 uppercase tracking-wider mt-6 mb-2">
                      ห้างสรรพสินค้า
                    </h3>
                    <button
                      onClick={() => setDeptStoreOpen(!deptStoreOpen)}
                      className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                        pathname?.startsWith('/department-store/reports') || pathname?.startsWith('/department-orders')
                          ? 'text-[#F4511E]'
                          : 'text-gray-300 hover:text-[#F4511E]'
                      }`}
                    >
                      <Building2 className="w-5 h-5" />
                      <span className="text-[16px] font-medium ml-3">ห้างฝากขาย</span>
                      <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${deptStoreOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {deptStoreOpen && (
                      <div className="ml-3 border-l border-white/10">
                        <Link href="/department-orders" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/department-orders' || pathname?.startsWith('/department-orders/') ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                          <Truck className="w-4 h-4" />
                          <span className="text-[16px] font-medium">ส่งห้าง</span>
                        </Link>
                        <Link href="/department-store/reports" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/department-store/reports' || pathname?.startsWith('/department-store/reports/') ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                          <ClipboardList className="w-4 h-4" />
                          <span className="text-[16px] font-medium">ยอดขายห้าง</span>
                        </Link>
                      </div>
                    )}
                    {/* ห้างขายขาด */}
                    <Link
                      href="/dept-wholesale-orders"
                      className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                        pathname?.startsWith('/dept-wholesale-orders')
                          ? 'text-[#F4511E]'
                          : 'text-gray-300 hover:text-[#F4511E]'
                      }`}
                    >
                      <ShoppingBag className="w-5 h-5" />
                      <span className="text-[16px] font-medium ml-3">ห้างขายขาด</span>
                    </Link>
                  </>
                )}
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mt-6 mb-2">
                  {section.title}
                </h3>
                {section.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/' && item.href !== '/inventory' && item.href !== '/pos' && pathname?.startsWith(item.href + '/')) || (item.href === '/chat' && (pathname === '/line-chat' || pathname === '/fb-chat'));

                  // Products item: render as collapsible with submenu
                  if (item.href === '/products') {
                    const isProductsPage = pathname?.startsWith('/products') || pathname === '/settings/categories' || pathname === '/settings/brands';
                    return (
                      <div key={item.href}>
                        <button
                          onClick={() => setProductsOpen(!productsOpen)}
                          className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                            isProductsPage
                              ? 'text-[#F4511E]'
                              : 'text-gray-300 hover:text-[#F4511E]'
                          }`}
                        >
                          {item.icon}
                          <span className="text-[16px] font-medium ml-3">{item.label}</span>
                          <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${productsOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {productsOpen && (
                          <div className="ml-3 border-l border-white/10">
                            <Link href="/products" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/products' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <Package2 className="w-4 h-4" />
                              <span className="text-[16px] font-medium">รายการสินค้า</span>
                            </Link>
                            <Link href="/settings/categories" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/categories' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <Tag className="w-4 h-4" />
                              <span className="text-[16px] font-medium">หมวดหมู่</span>
                            </Link>
                            {features.product_brand && (
                            <Link href="/settings/brands" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/brands' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <Award className="w-4 h-4" />
                              <span className="text-[16px] font-medium">แบรนด์</span>
                            </Link>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // เอกสารบัญชี: render as collapsible with submenu
                  if (item.href === '/invoices/tax') {
                    const isAccountingPage = pathname?.startsWith('/invoices') || pathname?.startsWith('/credit-notes') || pathname?.startsWith('/statements') || pathname?.startsWith('/return-notes');
                    return (
                      <div key={item.href}>
                        <button
                          onClick={() => setAccountingOpen(!accountingOpen)}
                          className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                            isAccountingPage
                              ? 'text-[#F4511E]'
                              : 'text-gray-300 hover:text-[#F4511E]'
                          }`}
                        >
                          {item.icon}
                          <span className="text-[16px] font-medium ml-3">{item.label}</span>
                          <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${accountingOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {accountingOpen && (
                          <div className="ml-3 border-l border-white/10">
                            <Link href="/invoices/tax" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/invoices/tax' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <FileText className="w-4 h-4" />
                              <span className="text-[16px] font-medium">ใบกำกับภาษี</span>
                            </Link>
                            <Link href="/invoices/receipts" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/invoices/receipts' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <Receipt className="w-4 h-4" />
                              <span className="text-[16px] font-medium">ใบเสร็จรับเงิน</span>
                            </Link>
                            <Link href="/invoices/abbreviated" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/invoices/abbreviated' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <ReceiptText className="w-4 h-4" />
                              <span className="text-[16px] font-medium">ใบกำกับอย่างย่อ</span>
                            </Link>
                            <Link href="/invoices/billing" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/invoices/billing' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <FileText className="w-4 h-4" />
                              <span className="text-[16px] font-medium">ใบแจ้งหนี้</span>
                            </Link>
                            <Link href="/invoices/delivery-notes" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/invoices/delivery-notes' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <Truck className="w-4 h-4" />
                              <span className="text-[16px] font-medium">ใบส่งสินค้า</span>
                            </Link>
                            <Link href="/return-notes" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/return-notes' || pathname?.startsWith('/return-notes/') ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <RotateCcw className="w-4 h-4" />
                              <span className="text-[16px] font-medium">ใบรับคืน</span>
                            </Link>
                            <Link href="/credit-notes" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/credit-notes' || pathname?.startsWith('/credit-notes/') ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <ReceiptText className="w-4 h-4" />
                              <span className="text-[16px] font-medium">ใบลดหนี้</span>
                            </Link>
                            <Link href="/statements" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/statements' || pathname?.startsWith('/statements/') ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <ClipboardList className="w-4 h-4" />
                              <span className="text-[16px] font-medium">ใบวางบิล</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Inventory item: render as collapsible with submenu
                  if (item.href === '/inventory') {
                    const isInventoryPage = pathname?.startsWith('/inventory');
                    return (
                      <div key={item.href}>
                        <button
                          onClick={() => setInventoryOpen(!inventoryOpen)}
                          className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                            isInventoryPage
                              ? 'text-[#F4511E]'
                              : 'text-gray-300 hover:text-[#F4511E]'
                          }`}
                        >
                          {item.icon}
                          <span className="text-[16px] font-medium ml-3">{item.label}</span>
                          {item.badge && (
                            <span className={`ml-2 ${item.badgeColor || 'bg-red-500'} text-white text-xs font-medium px-2 py-0.5 rounded-full`}>
                              {item.badge}
                            </span>
                          )}
                          <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${inventoryOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {inventoryOpen && (
                          <div className="ml-3 border-l border-white/10">
                            <Link href="/inventory" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/inventory' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <Warehouse className="w-4 h-4" />
                              <span className="text-[16px] font-medium">สต๊อกสินค้า</span>
                            </Link>
                            {features.supplier && (
                            <Link href="/inventory/purchase-orders" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/inventory/purchase-orders' || pathname === '/inventory/purchase-order' || pathname?.startsWith('/inventory/purchase-orders/') ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <ClipboardList className="w-4 h-4" />
                              <span className="text-[16px] font-medium">ใบสั่งซื้อ (PO)</span>
                            </Link>
                            )}
                            <Link href="/inventory/receives" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/inventory/receives' || pathname === '/inventory/receive' || pathname?.startsWith('/inventory/receives/') ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <ArrowDownToLine className="w-4 h-4" />
                              <span className="text-[16px] font-medium">รายการรับเข้า</span>
                            </Link>
                            <Link href="/inventory/issues" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/inventory/issues' || pathname === '/inventory/issue' || pathname?.startsWith('/inventory/issues/') ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <ArrowUpFromLine className="w-4 h-4" />
                              <span className="text-[16px] font-medium">รายการเบิกออก</span>
                            </Link>
                            <Link href="/inventory/transfers" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/inventory/transfers' || pathname === '/inventory/transfer' || pathname?.startsWith('/inventory/transfers/') ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <ArrowLeftRight className="w-4 h-4" />
                              <span className="text-[16px] font-medium">รายการโอนย้าย</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                        isActive
                          ? 'bg-[#F4511E] text-white'
                          : 'text-gray-300 hover:bg-[#F4511E]/10 hover:text-[#F4511E]'
                      }`}
                    >
                      {item.icon}
                      <span className="text-[16px] font-medium">{item.label}</span>
                      {item.badge && (
                        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-white/90 text-[#F4511E]'
                            : `${item.badgeColor || 'bg-red-500'} text-white`
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}

            {/* Admin Section */}
            {!authLoading && !companyLoading && !featuresLoading && effectiveRoles.has('admin') && (
              <div>
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mt-6 mb-2">
                  ผู้ดูแลระบบ
                </h3>
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                    pathname?.startsWith('/settings')
                      ? 'text-[#F4511E]'
                      : 'text-gray-300 hover:text-[#F4511E]'
                  }`}
                >
                  <Settings className="w-5 h-5" />
                  <span className="text-[16px] font-medium ml-3">ตั้งค่าระบบ</span>
                  <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                </button>
                {settingsOpen && (
                  <div className="ml-3 border-l border-white/10">
                    <Link href="/settings" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                      <Settings className="w-4 h-4" />
                      <span className="text-[16px] font-medium">ทั่วไป</span>
                    </Link>
                    <Link href="/settings/company" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/company' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                      <Building2 className="w-4 h-4" />
                      <span className="text-[16px] font-medium">ข้อมูลบริษัท</span>
                    </Link>
                    <Link href="/settings/members" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/members' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                      <UserCog className="w-4 h-4" />
                      <span className="text-[16px] font-medium">จัดการสมาชิก</span>
                    </Link>
                    <Link href="/settings/payment-channels" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/payment-channels' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                      <CreditCard className="w-4 h-4" />
                      <span className="text-[16px] font-medium">ช่องทางชำระเงิน</span>
                    </Link>
                    <Link href="/settings/chat-channels" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/chat-channels' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                      <MessageCircle className="w-4 h-4" />
                      <span className="text-[16px] font-medium">ช่องทาง Chat</span>
                    </Link>
                    <Link href="/settings/warehouses" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/warehouses' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                      <Warehouse className="w-4 h-4" />
                      <span className="text-[16px] font-medium">คลังสินค้า</span>
                    </Link>
                    <Link href="/settings/features" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/features' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                      <Handshake className="w-4 h-4" />
                      <span className="text-[16px] font-medium">Feature เสริม</span>
                    </Link>
                    {features.pos && (
                    <Link href="/settings/pos-terminals" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/pos-terminals' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                      <Monitor className="w-4 h-4" />
                      <span className="text-[16px] font-medium">เครื่อง POS</span>
                    </Link>
                    )}
                    {features.marketplace_sync && (
                    <Link href="/settings/integrations" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/integrations' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                      <ShoppingBag className="w-4 h-4" />
                      <span className="text-[16px] font-medium">Marketplace</span>
                    </Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Logout Button */}
          <div className="p-4 border-t border-white/10">
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
