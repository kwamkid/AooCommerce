'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  Building2,
  Package,
  Users,
  Menu,
  X,
  LogOut,
  Shield,
} from 'lucide-react';

const menuItems = [
  { label: 'Dashboard', href: '/superadmin', icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: 'Companies', href: '/superadmin/companies', icon: <Building2 className="w-5 h-5" /> },
  { label: 'Packages', href: '/superadmin/packages', icon: <Package className="w-5 h-5" /> },
  { label: 'Users', href: '/superadmin/users', icon: <Users className="w-5 h-5" /> },
];

export default function SuperAdminSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { userProfile, signOut } = useAuth();

  useEffect(() => {
    if (window.innerWidth < 1024) setIsOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === '/superadmin') return pathname === '/superadmin';
    return pathname?.startsWith(href);
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
            <Image src="/logo.svg" alt="AooCommerce" width={100} height={65} className="h-10 w-auto" priority />
          </div>

          {/* Super Admin Badge */}
          <div className="px-4 py-3 border-b border-[#F4511E]/20">
            <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 rounded-lg">
              <Shield className="w-5 h-5 text-red-400" />
              <div>
                <p className="text-red-400 text-sm font-semibold">Super Admin</p>
                <p className="text-gray-400 text-xs truncate">{userProfile?.email || ''}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                  isActive(item.href)
                    ? 'bg-[#F4511E] text-white'
                    : 'text-gray-300 hover:bg-[#F4511E]/10 hover:text-[#F4511E]'
                }`}
              >
                {item.icon}
                <span className="text-[16px] font-medium">{item.label}</span>
              </Link>
            ))}

            {/* Back to normal */}
            <div className="mt-6 pt-4 border-t border-[#F4511E]/20">
              <Link
                href="/dashboard"
                className="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors"
              >
                <LayoutDashboard className="w-5 h-5" />
                <span className="text-sm">กลับหน้าหลัก</span>
              </Link>
            </div>
          </nav>

          {/* Logout */}
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
