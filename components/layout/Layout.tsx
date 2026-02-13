// Path: components/layout/Layout.tsx
'use client';

import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
  children: ReactNode;
  title?: string;
  breadcrumbs?: {
    label: string;
    href?: string;
  }[];
}

export default function Layout({ children, title, breadcrumbs }: LayoutProps) {
  // ไม่มี loading check ใดๆ - ให้ page component จัดการเอง
  
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {/* Page Header */}
          {(title || breadcrumbs) && (
            <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
              {/* Breadcrumbs */}
              {breadcrumbs && breadcrumbs.length > 0 && (
                <nav className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                  {breadcrumbs.map((item, index) => (
                    <div key={index} className="flex items-center">
                      {index > 0 && (
                        <span className="mx-2 text-gray-400">/</span>
                      )}
                      {item.href ? (
                        <a
                          href={item.href}
                          className="hover:text-[#E9B308] transition-colors"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <span className="text-gray-900 font-medium">
                          {item.label}
                        </span>
                      )}
                    </div>
                  ))}
                </nav>
              )}

              {/* Page Title */}
              {title && (
                <h1 className="text-2xl font-bold text-gray-900">
                  {title}
                </h1>
              )}
            </div>
          )}

          {/* Page Body */}
          <div className="p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export { Sidebar, Header };