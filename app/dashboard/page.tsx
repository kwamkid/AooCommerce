'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import {
  Truck,
  Phone,
  LucideIcon,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';

// Define color type
type StatColor = 'blue' | 'green' | 'yellow' | 'red';

// Interfaces
interface DeliveryOrder {
  id: string;
  orderNumber: string;
  deliveryDate: string;
  status: string;
  totalAmount: number;
  customer: {
    id: string;
    name: string;
    phone?: string;
  };
}

interface DashboardStats {
  todayDeliveries: {
    count: number;
    orders: DeliveryOrder[];
  };
  lowStockCount?: number;
}

// Stat Card Component
function StatCard({
  title,
  value,
  icon: Icon,
  color = 'blue',
  onClick
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color?: StatColor;
  onClick?: () => void;
}) {
  const colorClasses: Record<StatColor, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500'
  };

  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">{title}</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
        </div>
        <div className={`${colorClasses[color]} p-3 rounded-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch dashboard stats
  useFetchOnce(async () => {
    try {
      const response = await apiFetch('/api/dashboard');

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard stats');
      }

      const result = await response.json();
      setStats(result.stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setError('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  }, !authLoading && !!userProfile);

  // Check auth and redirect if needed
  useEffect(() => {
    if (!authLoading && !userProfile) {
      router.push('/login');
    }
  }, [userProfile, authLoading, router]);

  // Show loading while checking auth
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A1A2E]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#F4511E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  // If no profile after loading, don't render (will redirect)
  if (!userProfile) {
    return null;
  }

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-600 dark:text-slate-400 mt-1">
          สวัสดี, {userProfile.name || 'ผู้ใช้งาน'} — {(userProfile.roles?.includes('owner') || userProfile.roles?.includes('admin')) && 'ภาพรวมระบบทั้งหมด'}
          {userProfile.roles?.includes('manager') && 'ภาพรวมระบบ'}
          {userProfile.roles?.includes('sales') && 'ภาพรวมการขายและลูกค้า'}
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <StatCard
          title="ส่งของวันนี้"
          value={`${stats?.todayDeliveries?.count || 0} ออเดอร์`}
          icon={Truck}
          color="blue"
        />
        {(stats?.lowStockCount ?? 0) > 0 && (
          <StatCard
            title="สินค้าใกล้หมด"
            value={`${stats?.lowStockCount || 0} รายการ`}
            icon={AlertTriangle}
            color="red"
            onClick={() => router.push('/inventory?low_stock=true')}
          />
        )}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 gap-6">
        {/* Today's Deliveries */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              ลูกค้าที่ต้องส่งวันนี้
            </h3>
            <Link
              href="/orders"
              className="text-[#F4511E] hover:text-[#D63B0E] text-sm font-medium flex items-center"
            >
              ดูทั้งหมด
              <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
          <div className="space-y-3">
            {stats?.todayDeliveries?.orders && stats.todayDeliveries.orders.length > 0 ? (
              stats.todayDeliveries.orders.slice(0, 5).map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{order.customer.name}</p>
                    <p className="text-xs text-gray-600 dark:text-slate-400">Order: {order.orderNumber}</p>
                    {order.customer.phone && (
                      <p className="text-xs text-gray-500 dark:text-slate-400 flex items-center mt-1">
                        <Phone className="w-3 h-3 mr-1" />
                        {order.customer.phone}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#F4511E]">
                      ฿{formatPrice(order.totalAmount)}
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-gray-500 dark:text-slate-400 text-sm text-center py-4">ไม่มีการส่งของวันนี้</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
