// Path: components/layout/Sidebar.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
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
} from 'lucide-react';

interface MenuItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: string[];
  badge?: number;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    title: 'POS',
    items: [
      { label: 'POS', href: '/pos', icon: <Monitor className="w-5 h-5" />, roles: ['admin', 'manager', 'sales', 'cashier'] },
      { label: 'รายการขาย POS', href: '/pos/orders', icon: <Receipt className="w-5 h-5" />, roles: ['admin', 'manager', 'cashier'] },
    ]
  },
  {
    title: 'ระบบการขาย',
    items: [
      { label: 'คำสั่งซื้อ', href: '/orders', icon: <ShoppingCart className="w-5 h-5" />, roles: ['admin', 'manager', 'sales', 'warehouse'] },
      { label: 'Chat', href: '/chat', icon: <MessageCircle className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] },
      { label: 'จัดของ & ส่ง', href: '/reports/delivery-summary', icon: <Truck className="w-5 h-5" />, roles: ['admin', 'manager', 'sales', 'warehouse'] },
      { label: 'สินค้า', href: '/products', icon: <Package2 className="w-5 h-5" />, roles: ['admin', 'manager', 'sales', 'warehouse'] }
    ]
  },
  {
    title: 'คลังสินค้า',
    items: [
      { label: 'สินค้าคงคลัง', href: '/inventory', icon: <Warehouse className="w-5 h-5" />, roles: ['admin', 'manager', 'warehouse'] },
    ]
  },
  {
    title: 'ลูกค้า',
    items: [
      { label: 'ลูกค้า', href: '/customers', icon: <UserCircle className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] },
      { label: 'ติดตามลูกค้า', href: '/crm/follow-up', icon: <UserCheck className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] },
      { label: 'ติดตามหนี้', href: '/crm/payment-followup', icon: <DollarSign className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] },
    ]
  },
  {
    title: 'รายงาน',
    items: [
      { label: 'รายงานยอดขาย', href: '/reports/sales', icon: <BarChart3 className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] },
      { label: 'รายงานยอดค้าง', href: '/reports/pending', icon: <FileText className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] }
    ]
  }
];

const getRoleLabel = (role: string | null) => {
  const labels: Record<string, string> = {
    owner: 'เจ้าของ',
    admin: 'ผู้ดูแลระบบ',
    manager: 'ผู้จัดการ',
    account: 'ฝ่ายบัญชี',
    warehouse: 'ฝ่ายคลังสินค้า',
    sales: 'ฝ่ายขาย',
    cashier: 'แคชเชียร์',
  };
  return role ? labels[role] || role : '';
};

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  // Default เป็น true เพื่อไม่ให้เมนูกระพริบ → ถ้า API บอกปิดค่อยซ่อน
  const [stockEnabled, setStockEnabled] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, loading: authLoading, signOut } = useAuth();
  const { currentCompany, companies, switchCompany, companyRole, loading: companyLoading } = useCompany();
  const { features, loading: featuresLoading } = useFeatures();
  const companyDropdownRef = useRef<HTMLDivElement>(null);

  const effectiveRole = (() => {
    if (companyRole === 'owner' || companyRole === 'admin') return 'admin';
    if (companyRole === 'manager') return 'manager';
    if (companyRole === 'warehouse') return 'warehouse';
    if (companyRole === 'cashier') return 'cashier';
    if (companyRole === 'account' || companyRole === 'sales') return 'sales';
    return userProfile?.role || null;
  })();

  useEffect(() => {
    if (pathname?.startsWith('/settings')) setSettingsOpen(true);
    if (pathname?.startsWith('/inventory')) setInventoryOpen(true);
    if (pathname?.startsWith('/products') || pathname === '/settings/categories' || pathname === '/settings/brands') setProductsOpen(true);
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

  const filteredSections = menuSections
    .filter(section => {
      // Hide "คลังสินค้า" section when stock feature is not enabled
      if (section.title === 'คลังสินค้า' && !stockEnabled) return false;
      // Hide "POS" section when pos feature is not enabled
      if (section.title === 'POS' && !features.pos) return false;
      return true;
    })
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (!effectiveRole || !item.roles.includes(effectiveRole)) return false;
        // Hide delivery-only menus when feature is off
        if (item.href === '/reports/delivery-summary' && !features.delivery_date.enabled) return false;
        if (item.href === '/crm/payment-followup' && !features.billing_cycle) return false;
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
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 lg:h-full bg-[#1A1A2E] border-r border-[#F4511E]/20 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-center h-16 border-b border-[#F4511E]/20 px-4">
            <Image src="/logo.svg" alt="AooDelivery" width={100} height={65} className="h-10 w-auto" priority />
          </div>

          {/* Company Profile (clickable for company list) */}
          <div className="relative border-b border-[#F4511E]/20" ref={companyDropdownRef}>
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
                      {getRoleLabel(companyRole)}
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
                              <p className="text-gray-400 text-xs">{getRoleLabel(m.role)}</p>
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
                          <div className="ml-3 border-l border-[#F4511E]/20">
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
                            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                              {item.badge}
                            </span>
                          )}
                          <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${inventoryOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {inventoryOpen && (
                          <div className="ml-3 border-l border-[#F4511E]/20">
                            <Link href="/inventory" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/inventory' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                              <Warehouse className="w-4 h-4" />
                              <span className="text-[16px] font-medium">สต๊อกสินค้า</span>
                            </Link>
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
                      className={`flex items-center space-x-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                        isActive
                          ? 'bg-[#F4511E] text-white'
                          : 'text-gray-300 hover:bg-[#F4511E]/10 hover:text-[#F4511E]'
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
                  );
                })}
              </div>
            ))}

            {/* Admin Section */}
            {!authLoading && !companyLoading && !featuresLoading && effectiveRole === 'admin' && (
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
                  <div className="ml-3 border-l border-[#F4511E]/20">
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
                    {features.pos && (
                    <Link href="/settings/pos-terminals" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/pos-terminals' ? 'text-[#F4511E]' : 'text-gray-400 hover:text-[#F4511E]'}`}>
                      <Monitor className="w-4 h-4" />
                      <span className="text-[16px] font-medium">จุดขาย POS</span>
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
          <div className="p-4 border-t border-[#F4511E]/20">
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
