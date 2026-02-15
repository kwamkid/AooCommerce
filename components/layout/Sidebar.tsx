// Path: components/layout/Sidebar.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
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
  Facebook
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
    title: 'ระบบการขาย',
    items: [
      { label: 'คำสั่งซื้อ', href: '/orders', icon: <ShoppingCart className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] },
      { label: 'Chat', href: '/chat', icon: <MessageCircle className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] },
      { label: 'ติดตามลูกค้า', href: '/crm/follow-up', icon: <UserCheck className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] },
      { label: 'ติดตามหนี้', href: '/crm/payment-followup', icon: <DollarSign className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] },
      { label: 'จัดของ & ส่ง', href: '/reports/delivery-summary', icon: <Truck className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] },
      { label: 'ลูกค้า', href: '/customers', icon: <UserCircle className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] },
      { label: 'สินค้า', href: '/products', icon: <Package2 className="w-5 h-5" />, roles: ['admin', 'manager', 'sales'] }
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
  };
  return role ? labels[role] || role : '';
};

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, signOut } = useAuth();
  const { currentCompany, companies, switchCompany, companyRole } = useCompany();
  const companyDropdownRef = useRef<HTMLDivElement>(null);

  const effectiveRole = (() => {
    if (companyRole === 'owner' || companyRole === 'admin') return 'admin';
    if (companyRole === 'manager') return 'manager';
    if (companyRole === 'account' || companyRole === 'warehouse' || companyRole === 'sales') return 'sales';
    return userProfile?.role || null;
  })();

  useEffect(() => {
    if (pathname?.startsWith('/settings')) setSettingsOpen(true);
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

  const filteredSections = menuSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => effectiveRole && item.roles.includes(effectiveRole))
    }))
    .filter(section => section.items.length > 0);

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
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-[#1A1A2E] border-r border-[#F4511E]/20 transform transition-transform duration-300 ease-in-out ${
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
            <button
              onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
            >
              {/* Company Logo */}
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

              {/* Company Info */}
              <div className="flex-1 text-left min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  {currentCompany?.name || 'เลือกบริษัท'}
                </p>
                <p className="text-[#F4511E] text-xs">
                  {getRoleLabel(companyRole)}
                </p>
              </div>

              {/* Chevron */}
              <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${companyDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {/* Floating Popup - company list directly */}
            {companyDropdownOpen && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setCompanyDropdownOpen(false)} />

                {/* Popup */}
                <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-white rounded-xl shadow-2xl shadow-black/30 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 border border-gray-200">
                  {/* Company List */}
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

                  {/* Footer */}
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
                      (pathname === item.href || (item.href === '/chat' && (pathname === '/line-chat' || pathname === '/fb-chat')))
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
                ))}
              </div>
            ))}

            {/* Admin Section */}
            {effectiveRole === 'admin' && (
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
