'use client';

import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { useCompany } from '@/lib/company-context';
import { useFeatures } from '@/lib/features-context';
import {
  FileText,
  DollarSign,
  Package,
  AlertCircle,
  PackagePlus,
  FolderPlus,
  BadgePlus,
} from 'lucide-react';

interface BulkAction {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  /** Only show when features.stock is on. */
  requiresStock?: boolean;
}

const CREATE_ACTIONS: BulkAction[] = [
  {
    href: '/products/bulk/create',
    icon: <PackagePlus className="w-7 h-7" />,
    title: 'เพิ่มสินค้าใหม่',
    desc: 'สร้างสินค้าหลายตัวพร้อมกัน (รองรับ variations)',
  },
  {
    href: '/products/bulk/create-categories',
    icon: <FolderPlus className="w-7 h-7" />,
    title: 'เพิ่มหมวดหมู่ใหม่',
    desc: 'สร้างหมวดหมู่หลายรายการพร้อมกัน (รองรับหมวดหมู่ย่อย)',
  },
  {
    href: '/products/bulk/create-brands',
    icon: <BadgePlus className="w-7 h-7" />,
    title: 'เพิ่มแบรนด์ใหม่',
    desc: 'สร้างแบรนด์หลายรายการพร้อมกัน',
  },
];

const EDIT_ACTIONS: BulkAction[] = [
  {
    href: '/products/bulk/basic-info',
    icon: <FileText className="w-7 h-7" />,
    title: 'แก้ไขข้อมูลสินค้า',
    desc: 'ชื่อสินค้า, รหัส, สถานะ, แบรนด์, หมวดหมู่, คำอธิบาย',
  },
  {
    href: '/products/bulk/price',
    icon: <DollarSign className="w-7 h-7" />,
    title: 'แก้ไขราคา',
    desc: 'ราคาปกติ, ราคาขาย, ราคาทุน',
  },
  {
    href: '/inventory/bulk-stock-update',
    icon: <Package className="w-7 h-7" />,
    title: 'แก้ไขสต็อก',
    desc: 'จำนวนสต็อกแยกตามคลัง (1 หรือหลายคลังพร้อมกัน)',
    requiresStock: true,
  },
];

function ActionCard({ a }: { a: BulkAction }) {
  const disabled = !!a.badge;
  const inner = (
    <div
      className={`group relative bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border-2 border-transparent transition-all h-full ${
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:border-primary hover:shadow-md cursor-pointer'
      }`}
    >
      {a.badge && (
        <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-xs font-medium text-gray-600 dark:text-slate-400">
          {a.badge}
        </span>
      )}
      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg mb-3 transition-colors ${
        disabled
          ? 'bg-gray-100 dark:bg-slate-700 text-gray-400'
          : 'bg-orange-50 dark:bg-orange-900/20 text-primary group-hover:bg-primary group-hover:text-white'
      }`}>
        {a.icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{a.title}</h3>
      <p className="text-sm text-gray-500 dark:text-slate-400">{a.desc}</p>
    </div>
  );
  return disabled ? <div>{inner}</div> : <Link href={a.href}>{inner}</Link>;
}

export default function BulkProductsHub() {
  const { companyRoles } = useCompany();
  const { features } = useFeatures();
  const canEdit = companyRoles.includes('owner')
    || companyRoles.includes('admin')
    || companyRoles.includes('manager')
    || companyRoles.includes('warehouse');
  const visibleEditActions = EDIT_ACTIONS.filter(a => !a.requiresStock || features.stock);

  if (!canEdit) {
    return (
      <Layout>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">ไม่มีสิทธิ์เข้าถึง</h3>
          <p className="text-gray-500 dark:text-slate-400">เฉพาะเจ้าของ ผู้ดูแลระบบ ผู้จัดการ และคลังสินค้าเท่านั้น</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">จัดการสินค้าแบบชุด</h1>
          <p className="text-gray-600 dark:text-slate-400 mt-1">
            สร้างหรือแก้ไขข้อมูลหลายรายการพร้อมกันผ่าน Excel template — เลือกหมวดที่ต้องการเพื่อดาวน์โหลด template เฉพาะส่วนนั้น
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">สร้าง</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CREATE_ACTIONS.map(a => <ActionCard key={a.href} a={a} />)}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">แก้ไข / อัพเดท</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleEditActions.map(a => <ActionCard key={a.href} a={a} />)}
          </div>
        </section>
      </div>
    </Layout>
  );
}
