// Path: components/layout/Sidebar.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { useFeatures } from '@/lib/features-context';
import { useHeaderSummary } from '@/lib/header-summary-context';
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
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
  ChevronRight,
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
  Pencil,
  MapPin,
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
    title: 'แคชเชียร์',
    items: [
      { label: 'Cashier (POS)', href: '/pos', icon: <Monitor className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'cashier'] },
      { label: 'รายการขาย', href: '/pos/orders', icon: <Receipt className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'cashier', 'account'] },
      { label: 'หน้าขาย PC', href: '/pc', icon: <Store className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'pc'] },
    ]
  },
  {
    title: 'ระบบการขาย',
    items: [
      { label: 'Chat', href: '/chat', icon: <MessageCircle className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'sales'] },
      { label: 'คำสั่งซื้อ', href: '/orders', icon: <ShoppingCart className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'sales', 'account', 'warehouse'] },
      { label: 'จัดของ & ส่ง', href: '/reports/delivery-summary', icon: <Truck className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'sales', 'warehouse'] },
    ]
  },
  {
    title: 'สินค้า',
    items: [
      { label: 'สินค้า', href: '/products', icon: <Package2 className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'sales', 'warehouse'] },
      { label: 'สินค้าคงคลัง', href: '/inventory', icon: <Warehouse className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'warehouse', 'cashier', 'sales'] },
      { label: 'โปรโมชั่น', href: '/promotions', icon: <Tag className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'sales'] },
    ]
  },
  {
    title: 'Contact',
    items: [
      { label: 'ซัพพลายเออร์', href: '/settings/suppliers', icon: <Factory className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin'] },
      { label: 'ลูกค้า', href: '/customers', icon: <UserCircle className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'sales', 'account'] },
    ]
  },
  {
    title: 'รายงาน',
    items: [
      { label: 'เอกสารบัญชี', href: '/invoices/tax', icon: <FileText className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'account'] },
      { label: 'รายงานยอดขาย', href: '/reports/sales', icon: <BarChart3 className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'sales', 'account'] },
      { label: 'ยอดขาย PC', href: '/counter-sales', icon: <Store className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin'] },
      { label: 'รายงานโปรโมชั่น', href: '/promotions/report', icon: <Tag className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'sales'] },
      { label: 'รายงานซัพพลายเออร์', href: '/reports/supplier', icon: <Factory className="w-[18px] h-[18px] flex-shrink-0" />, roles: ['admin', 'account'] }
    ]
  }
];

const ROLE_LABELS: Record<string, string> = {
  owner: 'เจ้าของ',
  admin: 'ผู้ดูแลระบบ',
  manager: 'ผู้จัดการ',
  account: 'บัญชี',
  warehouse: 'คลังสินค้า',
  sales: 'แอดมินออนไลน์',
  cashier: 'แคชเชียร์',
  pc: 'PC ประจำห้าง',
};

const getRoleLabels = (roles: string[]) => {
  if (!roles || roles.length === 0) return '';
  return roles.map(r => ROLE_LABELS[r] || r).join(', ');
};

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  // ย่อ sidebar เหลือแถบไอคอน (desktop เท่านั้น) — จำค่าไว้ใน localStorage
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem('aoo-sidebar-collapsed') === '1'); } catch { /* ignore */ }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('aoo-sidebar-collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  // Settings ใช้ drill-down (Linear/Slack pattern) — คลิกแล้ว sidebar สลับไปเป็น
  // เมนูตั้งค่าทั้งแผง แทน accordion 12 รายการที่กินพื้นที่
  // 'main' | 'settings' — ผูกกับ route: เข้าหน้า /settings/* ก็สลับให้เอง
  const [navView, setNavView] = useState<'main' | 'settings'>('main');
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [accountingOpen, setAccountingOpen] = useState(false);
  const [consignmentOpen, setConsignmentOpen] = useState(false);
  const [dealerWholesaleOpen, setDealerWholesaleOpen] = useState(false);
  const [deptStoreOpen, setDeptStoreOpen] = useState(false);
  const [deptWholesaleOpen, setDeptWholesaleOpen] = useState(false);
  const { summary } = useHeaderSummary();
  const lowStockCount = summary?.lowStockCount ?? 0;
  const chatUnreadCount = summary?.chatUnread ?? 0;
  const orderReadyCount = summary?.ordersReadyCount ?? 0;
  // Default true ตอน summary ยังไม่มา เพื่อไม่ให้เมนูกระพริบ
  const stockEnabled = summary?.stockConfig?.stockEnabled !== false;
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, loading: authLoading, signOut } = useAuth();
  const { currentCompany, companies, switchCompany, companyRoles, loading: companyLoading } = useCompany();
  const { features, loading: featuresLoading } = useFeatures();
  const companyDropdownRef = useRef<HTMLDivElement>(null);

  const effectiveRoles = (() => {
    const roles = new Set<string>();
    for (const r of companyRoles) {
      if (r === 'owner' || r === 'admin' || r === 'manager') {
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
    // /settings/* ไม่ต้องเปิด accordion อีก — ใช้ drill-down (ดู navView)
    if (pathname?.startsWith('/inventory')) setInventoryOpen(true);
    // "แก้ไขแบบชุด" is its own top-level parent — don't auto-open products
    // or inventory when we're on a bulk page.
    if (pathname?.startsWith('/products/bulk') || pathname?.startsWith('/inventory/bulk-stock-update')) {
      // bulk is a parent menu item; nothing else to open
    } else if (pathname?.startsWith('/products') || pathname === '/settings/categories' || pathname === '/settings/brands') {
      setProductsOpen(true);
    }
    if (pathname?.startsWith('/invoices') || pathname?.startsWith('/credit-notes') || pathname?.startsWith('/statements')) setAccountingOpen(true);
    if (pathname?.startsWith('/replenishments') || pathname?.startsWith('/consignment')) setConsignmentOpen(true);
    if (pathname?.startsWith('/department-store/reports') || pathname?.startsWith('/department-orders')) setDeptStoreOpen(true);
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

  // Badges (lowStockCount / chatUnread / orderReadyCount) + stockEnabled now
  // come from useHeaderSummary (single consolidated /api/header/summary fetch
  // + shared realtime subscriptions in the provider).

  const filteredSections = menuSections
    .filter(section => {
      // Hide inventory item (not whole section) when stock is disabled — handled via item filter below
      // Hide "แคชเชียร์" section when pos feature is not enabled
      if (section.title === 'แคชเชียร์' && !features.pos) return false;
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
        if (item.href === '/inventory' && !features.stock) return false;
        return true;
      })
    }))
    .map(section => {
      // Inject "แก้ไขแบบชุด" as a parent (top-level) item inside the "สินค้า"
      // section — positioned right after inventory when stock is on, otherwise
      // right after the products link. It's not a submenu of either.
      if (section.title !== 'สินค้า') return section;
      const bulkItem: MenuItem = {
        label: 'แก้ไขแบบชุด',
        href: '/products/bulk',
        icon: <Pencil className="w-[18px] h-[18px] flex-shrink-0" />,
        roles: ['admin'],
      };
      if (!bulkItem.roles.some(r => effectiveRoles.has(r))) return section;
      const items = [...section.items];
      const anchorHref = features.stock ? '/inventory' : '/products';
      const idx = items.findIndex(i => i.href === anchorHref);
      if (idx >= 0) items.splice(idx + 1, 0, bulkItem);
      else items.push(bulkItem);
      return { ...section, items };
    })
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

  // เมนูในชุด "ตั้งค่าระบบ" — gate ตาม feature flag เหมือนเดิม
  const settingsItems: { href: string; label: string; icon: React.ReactNode; isActive: boolean }[] = [
    { href: '/settings/company', label: 'ทั่วไป', icon: <Settings className="w-[18px] h-[18px] flex-shrink-0" />, isActive: pathname === '/settings' || pathname === '/settings/company' },
    { href: '/settings/members', label: 'จัดการสมาชิก', icon: <UserCog className="w-[18px] h-[18px] flex-shrink-0" />, isActive: pathname === '/settings/members' },
    { href: '/settings/payment-channels', label: 'ช่องทางชำระเงิน', icon: <CreditCard className="w-[18px] h-[18px] flex-shrink-0" />, isActive: pathname === '/settings/payment-channels' },
    { href: '/settings/chat-channels', label: 'ช่องทาง Chat', icon: <MessageCircle className="w-[18px] h-[18px] flex-shrink-0" />, isActive: pathname === '/settings/chat-channels' },
    { href: '/settings/sales-channels', label: 'ช่องทางการขาย', icon: <Store className="w-[18px] h-[18px] flex-shrink-0" />, isActive: pathname === '/settings/sales-channels' },
    ...(features.stock ? [{ href: '/settings/warehouses', label: 'คลังสินค้า', icon: <Warehouse className="w-[18px] h-[18px] flex-shrink-0" />, isActive: pathname === '/settings/warehouses' }] : []),
    { href: '/settings/carriers', label: 'ขนส่ง', icon: <Truck className="w-[18px] h-[18px] flex-shrink-0" />, isActive: pathname === '/settings/carriers' },
    ...(features.delivery_zone || features.delivery_slot ? [{ href: '/settings/delivery', label: 'การจัดส่ง', icon: <MapPin className="w-[18px] h-[18px] flex-shrink-0" />, isActive: pathname === '/settings/delivery' }] : []),
    { href: '/settings/storefront', label: 'หน้าร้านออนไลน์', icon: <Store className="w-[18px] h-[18px] flex-shrink-0" />, isActive: pathname === '/settings/storefront' },
    { href: '/settings/counters', label: 'สาขาฝากขาย (PC)', icon: <Store className="w-[18px] h-[18px] flex-shrink-0" />, isActive: pathname === '/settings/counters' },
    { href: '/settings/features', label: 'Feature เสริม', icon: <Handshake className="w-[18px] h-[18px] flex-shrink-0" />, isActive: pathname === '/settings/features' },
    ...(features.pos ? [{ href: '/settings/pos-terminals', label: 'แคชเชียร์', icon: <Monitor className="w-[18px] h-[18px] flex-shrink-0" />, isActive: pathname === '/settings/pos-terminals' }] : []),
    // เมนู Marketplace เดิมย้ายไปรวมใน "ช่องทางการขาย" (แท็บ เชื่อมต่อ Marketplace) แล้ว
  ];

  // /settings/categories|brands|suppliers อยู่ในหมวดอื่น (สินค้า/ข้อมูลหลัก) — ไม่ต้องสลับ view
  const isSettingsRoute = settingsItems.some(i => i.isActive);
  useEffect(() => {
    setNavView(isSettingsRoute ? 'settings' : 'main');
  }, [isSettingsRoute]);

  const handleSwitchCompany = (companyId: string) => {
    setCompanyDropdownOpen(false);
    if (companyId !== currentCompany?.id) {
      switchCompany(companyId);
      // Reload ทั้งหน้า — หลายหน้า (เช่น /chat) fetch โดยไม่ผูก dep กับบริษัท
      // สลับแล้วไม่ reload = เห็นข้อมูลค้างของบริษัทเดิมจนกด refresh เอง
      // (เกิดจริง: สลับบริษัทบนหน้าแชทแล้วลิสต์ว่าง/ค้าง) · realtime channels
      // กับ in-memory cache ก็ได้ reset สะอาดพร้อมกันด้วย
      window.location.reload();
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
        {isOpen ? <X className="w-6 h-6 text-primary" /> : <Menu className="w-6 h-6 text-primary" />}
      </button>

      {/* Mobile Overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setIsOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        data-collapsed={collapsed ? 'true' : undefined}
        className={`sidebar-panel fixed lg:static inset-y-0 left-0 z-40 ${collapsed ? 'lg:w-[68px]' : 'lg:w-[232px]'} w-[248px] lg:h-full bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center h-16 border-b border-gray-200 dark:border-slate-800 px-3 gap-2">
            <Link href="/dashboard" className={`flex-1 flex items-center min-w-0 ${collapsed ? 'justify-center' : 'justify-start pl-1'}`}>
              <Image
                src="/logo.svg"
                alt="AooCommerce"
                width={100}
                height={65}
                className={collapsed ? 'h-8 w-auto' : 'h-10 w-auto'}
                priority
              />
            </Link>
            {/* ย่อ/ขยาย sidebar — desktop only */}
            <button
              onClick={toggleCollapsed}
              title={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
              className="hidden lg:flex nav-collapse-btn p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
            >
              {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
            </button>
          </div>

          {/* Company Profile (clickable for company list) */}
          <div className="relative border-b border-gray-200 dark:border-slate-800" ref={companyDropdownRef}>
            {(authLoading || companyLoading) ? (
              <div className="w-full px-4 py-3 flex items-center gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-slate-700 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-24" />
                  <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-16" />
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                  className="nav-company-row w-full px-3 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {currentCompany?.logo_url ? (
                    <img
                      src={currentCompany.logo_url}
                      alt={currentCompany.name}
                      className="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-slate-600 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F4511E] to-[#E0480F] flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <div className="nav-label flex-1 text-left min-w-0">
                    <p className="text-gray-900 dark:text-white text-sm font-semibold truncate">
                      {currentCompany?.name || 'เลือกบริษัท'}
                    </p>
                    <p className="text-gray-400 dark:text-slate-400 text-xs">
                      {getRoleLabels(companyRoles)}
                    </p>
                  </div>
                  <ChevronDown className={`nav-label w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${companyDropdownOpen ? 'rotate-180' : ''}`} />
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
                            className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-primary/10 transition-colors ${
                              m.company_id === currentCompany?.id ? 'bg-primary/5' : ''
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
                            <div className="nav-label flex-1 text-left min-w-0">
                              <p className="text-gray-900 text-sm font-medium truncate">{m.company.name}</p>
                              <p className="text-gray-400 text-xs">{getRoleLabels(m.roles)}</p>
                            </div>
                            {m.company_id === currentCompany?.id && (
                              <Check className="w-4 h-4 text-primary flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-gray-100">
                        <button
                          onClick={handleAddCompany}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-primary/10 transition-colors text-gray-500 hover:text-primary"
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
          <nav className="flex-1 overflow-y-auto p-3">
            {navView === 'settings' ? (
            /* ===== SETTINGS VIEW — drill-down (Linear/Slack pattern) ===== */
            <div key="settings-view" className="nav-view-in-right nav-stagger">
              <button
                onClick={() => setNavView('main')}
                className="flex items-center w-full px-3 py-2 rounded-lg mb-2 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <ArrowLeft className="w-[18px] h-[18px] flex-shrink-0" />
                <span className="nav-label text-sm font-medium ml-3">ย้อนกลับ</span>
              </button>
              <h3 className="nav-section-title text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-[0.08em] mt-1 mb-1.5 px-3">
                ตั้งค่า
              </h3>
              {settingsItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center w-full px-3 py-2 rounded-lg mb-0.5 transition-colors ${
                    item.isActive
                      ? 'bg-orange-50 dark:bg-primary/15 text-[#C2410C] dark:text-orange-300 font-semibold'
                      : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span className="nav-label text-sm font-medium ml-3">{item.label}</span>
                </Link>
              ))}
            </div>
            ) : (
            /* ===== MAIN VIEW ===== */
            <div key="main-view" className="nav-view-in-left nav-stagger">
            {/* Dashboard */}
            <Link
              href="/dashboard"
              className={`flex items-center space-x-3 px-3 py-2 rounded-lg mb-2 transition-colors ${
                pathname === '/dashboard'
                  ? 'bg-orange-50 dark:bg-primary/15 text-[#C2410C] dark:text-orange-300 font-semibold'
                  : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Home className="w-[18px] h-[18px] flex-shrink-0" />
              <span className="nav-label text-sm font-medium">Dashboard</span>
            </Link>

            {/* Skeleton loading while auth/company/features are loading */}
            {(authLoading || companyLoading || featuresLoading) && (
              <div className="animate-pulse space-y-4 mt-4">
                {[1, 2, 3].map(section => (
                  <div key={section}>
                    <div className="h-3 w-16 bg-gray-200 dark:bg-slate-700 rounded mb-3" />
                    {Array.from({ length: section === 1 ? 5 : 2 }).map((_, i) => (
                      <div key={i} className="flex items-center space-x-3 px-3 py-2 mb-1">
                        <div className="w-5 h-5 bg-gray-200 dark:bg-slate-700 rounded" />
                        <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded flex-1" />
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
                    <h3 className="nav-section-title text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-[0.08em] mt-5 mb-1.5 px-3">
                      ตัวแทนจำหน่าย
                    </h3>
                    <button
                      onClick={() => setConsignmentOpen(!consignmentOpen)}
                      className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                        pathname?.startsWith('/replenishments') || pathname?.startsWith('/consignment')
                          ? 'text-[#C2410C] dark:text-orange-300 font-semibold'
                          : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <Store className="w-[18px] h-[18px] flex-shrink-0" />
                      <span className="nav-label text-sm font-medium ml-3">ตัวแทนฝากขาย</span>
                      <ChevronDown className={`nav-label w-4 h-4 ml-auto transition-transform ${consignmentOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {consignmentOpen && (
                      <div className="nav-submenu ml-3 border-l border-gray-200 dark:border-slate-700">
                        <Link href="/replenishments" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/replenishments' || pathname?.startsWith('/replenishments/') ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                          <ArrowUpFromLine className="w-4 h-4" />
                          <span className="nav-label text-sm font-medium">เติมสินค้าตัวแทน</span>
                        </Link>
                        <Link href="/consignment/reports" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/consignment/reports' || pathname?.startsWith('/consignment/reports/') ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                          <ClipboardList className="w-4 h-4" />
                          <span className="nav-label text-sm font-medium">ยอดขายตัวแทน</span>
                        </Link>
                      </div>
                    )}
                    {/* ตัวแทนขายขาด */}
                    <Link
                      href="/dealer-orders"
                      className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                        pathname?.startsWith('/dealer-orders')
                          ? 'text-[#C2410C] dark:text-orange-300 font-semibold'
                          : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <ShoppingBag className="w-[18px] h-[18px] flex-shrink-0" />
                      <span className="nav-label text-sm font-medium ml-3">ตัวแทนขายขาด</span>
                    </Link>
                  </>
                )}
                {/* Department Store Section */}
                {section.title === 'สินค้า' && features.department_store && (effectiveRoles.has('admin') || effectiveRoles.has('sales') || effectiveRoles.has('account')) && (
                  <>
                    <h3 className="nav-section-title text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-[0.08em] mt-5 mb-1.5 px-3">
                      ห้างสรรพสินค้า
                    </h3>
                    <button
                      onClick={() => setDeptStoreOpen(!deptStoreOpen)}
                      className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                        pathname?.startsWith('/department-store/reports') || pathname?.startsWith('/department-orders')
                          ? 'text-[#C2410C] dark:text-orange-300 font-semibold'
                          : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <Building2 className="w-[18px] h-[18px] flex-shrink-0" />
                      <span className="nav-label text-sm font-medium ml-3">ห้างฝากขาย</span>
                      <ChevronDown className={`nav-label w-4 h-4 ml-auto transition-transform ${deptStoreOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {deptStoreOpen && (
                      <div className="nav-submenu ml-3 border-l border-gray-200 dark:border-slate-700">
                        <Link href="/department-orders" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/department-orders' || pathname?.startsWith('/department-orders/') ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                          <Truck className="w-4 h-4" />
                          <span className="nav-label text-sm font-medium">ส่งห้าง</span>
                        </Link>
                        <Link href="/department-store/reports" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/department-store/reports' || pathname?.startsWith('/department-store/reports/') ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                          <ClipboardList className="w-4 h-4" />
                          <span className="nav-label text-sm font-medium">ยอดขายห้าง</span>
                        </Link>
                      </div>
                    )}
                    {/* ห้างขายขาด */}
                    <Link
                      href="/dept-wholesale-orders"
                      className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                        pathname?.startsWith('/dept-wholesale-orders')
                          ? 'text-[#C2410C] dark:text-orange-300 font-semibold'
                          : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <ShoppingBag className="w-[18px] h-[18px] flex-shrink-0" />
                      <span className="nav-label text-sm font-medium ml-3">ห้างขายขาด</span>
                    </Link>
                  </>
                )}
                <h3 className="nav-section-title text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-[0.08em] mt-5 mb-1.5 px-3">
                  {section.title}
                </h3>
                {section.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/' && item.href !== '/inventory' && item.href !== '/pos' && pathname?.startsWith(item.href + '/')) || (item.href === '/chat' && (pathname === '/line-chat' || pathname === '/fb-chat'));

                  // Products item: render as collapsible with submenu
                  if (item.href === '/products') {
                    // Bulk is its own top-level parent now — don't highlight
                    // the products header while the user is on /products/bulk.
                    const isBulkPage = pathname?.startsWith('/products/bulk') || pathname?.startsWith('/inventory/bulk-stock-update');
                    const isProductsPage = !isBulkPage && (
                      pathname?.startsWith('/products')
                      || pathname === '/settings/categories'
                      || pathname === '/settings/brands'
                    );
                    return (
                      <div key={item.href}>
                        <button
                          onClick={() => setProductsOpen(!productsOpen)}
                          className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                            isProductsPage
                              ? 'text-[#C2410C] dark:text-orange-300 font-semibold'
                              : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                          }`}
                        >
                          {item.icon}
                          <span className="nav-label text-sm font-medium ml-3">{item.label}</span>
                          <ChevronDown className={`nav-label w-4 h-4 ml-auto transition-transform ${productsOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {productsOpen && (
                          <div className="nav-submenu ml-3 border-l border-gray-200 dark:border-slate-700">
                            <Link href="/products" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/products' ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <Package2 className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">รายการสินค้า</span>
                            </Link>
                            <Link href="/settings/categories" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/categories' ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <Tag className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">หมวดหมู่</span>
                            </Link>
                            {features.product_brand && (
                            <Link href="/settings/brands" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/settings/brands' ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <Award className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">แบรนด์</span>
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
                              ? 'text-[#C2410C] dark:text-orange-300 font-semibold'
                              : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                          }`}
                        >
                          {item.icon}
                          <span className="nav-label text-sm font-medium ml-3">{item.label}</span>
                          <ChevronDown className={`nav-label w-4 h-4 ml-auto transition-transform ${accountingOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {accountingOpen && (
                          <div className="nav-submenu ml-3 border-l border-gray-200 dark:border-slate-700">
                            <Link href="/invoices/tax" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/invoices/tax' ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <FileText className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">ใบกำกับภาษี</span>
                            </Link>
                            <Link href="/invoices/receipts" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/invoices/receipts' ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <Receipt className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">ใบเสร็จรับเงิน</span>
                            </Link>
                            <Link href="/invoices/abbreviated" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/invoices/abbreviated' ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <ReceiptText className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">ใบกำกับอย่างย่อ</span>
                            </Link>
                            <Link href="/invoices/billing" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/invoices/billing' ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <FileText className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">ใบแจ้งหนี้</span>
                            </Link>
                            <Link href="/invoices/delivery-notes" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/invoices/delivery-notes' ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <Truck className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">ใบส่งสินค้า</span>
                            </Link>
                            <Link href="/return-notes" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/return-notes' || pathname?.startsWith('/return-notes/') ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <RotateCcw className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">ใบรับคืน</span>
                            </Link>
                            <Link href="/credit-notes" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/credit-notes' || pathname?.startsWith('/credit-notes/') ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <ReceiptText className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">ใบลดหนี้</span>
                            </Link>
                            <Link href="/statements" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/statements' || pathname?.startsWith('/statements/') ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <ClipboardList className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">ใบวางบิล</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Inventory item: render as collapsible with submenu
                  if (item.href === '/inventory') {
                    // Exclude /inventory/bulk-stock-update — that's owned by
                    // the standalone "แก้ไขแบบชุด" parent item.
                    const isInventoryPage = pathname?.startsWith('/inventory') && !pathname?.startsWith('/inventory/bulk-stock-update');
                    return (
                      <div key={item.href}>
                        <button
                          onClick={() => setInventoryOpen(!inventoryOpen)}
                          className={`flex items-center w-full px-3 py-2 rounded-lg mb-1 transition-colors ${
                            isInventoryPage
                              ? 'text-[#C2410C] dark:text-orange-300 font-semibold'
                              : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                          }`}
                        >
                          {item.icon}
                          <span className="nav-label text-sm font-medium ml-3">{item.label}</span>
                          {item.badge && (
                            <span className={`ml-2 ${item.badgeColor || 'bg-red-500'} text-white text-xs font-medium px-2 py-0.5 rounded-full`}>
                              {item.badge}
                            </span>
                          )}
                          <ChevronDown className={`nav-label w-4 h-4 ml-auto transition-transform ${inventoryOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {inventoryOpen && (
                          <div className="nav-submenu ml-3 border-l border-gray-200 dark:border-slate-700">
                            <Link href="/inventory" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/inventory' ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <Warehouse className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">สต๊อกสินค้า</span>
                            </Link>
                            {features.supplier && (
                            <Link href="/inventory/purchase-orders" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/inventory/purchase-orders' || pathname === '/inventory/purchase-order' || pathname?.startsWith('/inventory/purchase-orders/') ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <ClipboardList className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">ใบสั่งซื้อ (PO)</span>
                            </Link>
                            )}
                            <Link href="/inventory/receives" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/inventory/receives' || pathname === '/inventory/receive' || pathname?.startsWith('/inventory/receives/') ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <ArrowDownToLine className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">รายการรับเข้า</span>
                            </Link>
                            <Link href="/inventory/issues" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/inventory/issues' || pathname === '/inventory/issue' || pathname?.startsWith('/inventory/issues/') ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <ArrowUpFromLine className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">รายการเบิกออก</span>
                            </Link>
                            <Link href="/inventory/transfers" className={`flex items-center space-x-3 pl-5 pr-3 py-2 rounded-r-lg mb-0.5 transition-colors ${pathname === '/inventory/transfers' || pathname === '/inventory/transfer' || pathname?.startsWith('/inventory/transfers/') ? 'text-[#C2410C] dark:text-orange-300 font-semibold' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'}`}>
                              <ArrowLeftRight className="w-4 h-4" />
                              <span className="nav-label text-sm font-medium">รายการโอนย้าย</span>
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
                          ? 'bg-orange-50 dark:bg-primary/15 text-[#C2410C] dark:text-orange-300 font-semibold'
                          : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      {item.icon}
                      <span className="nav-label text-sm font-medium">{item.label}</span>
                      {item.badge && (
                        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-[#F4511E] text-white'
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

            </div>
            )}
          </nav>

          {/* ตั้งค่า — ปุ่มเปิด drill-down (ปักไว้ล่างสุดเหนือปุ่มออกจากระบบ) */}
          {!authLoading && !companyLoading && effectiveRoles.has('admin') && navView === 'main' && (
            <div className="px-3 pb-2">
              <button
                onClick={() => setNavView('settings')}
                className="flex items-center w-full px-3 py-2 rounded-lg text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <Settings className="w-[18px] h-[18px] flex-shrink-0" />
                <span className="nav-label text-sm font-medium ml-3 flex-1 text-left">ตั้งค่า</span>
                <ChevronRight className="nav-label w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
            </div>
          )}

          {/* Logout Button */}
          <div className="p-4 border-t border-gray-200 dark:border-slate-800">
            <button
              onClick={() => signOut()}
              className="flex items-center space-x-3 w-full px-3 py-2 text-gray-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 rounded-lg transition-colors"
            >
              <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
              <span className="nav-label text-sm font-medium">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
