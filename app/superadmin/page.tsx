'use client';

import { useState, useEffect } from 'react';
import SuperAdminLayout from './components/SuperAdminLayout';
import { apiFetch } from '@/lib/api-client';
import { Users, Building2, Package, Loader2 } from 'lucide-react';

interface Stats {
  totalUsers: number;
  totalCompanies: number;
  activeCompanies: number;
  packageCounts: Record<string, number>;
  recentCompanies: { id: string; name: string; slug: string; logo_url: string | null; is_active: boolean; created_at: string }[];
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await apiFetch('/api/superadmin/stats');
        if (res.ok) {
          setStats(await res.json());
        }
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <SuperAdminLayout title="Dashboard" subtitle="ภาพรวมระบบทั้งหมด">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      ) : stats ? (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Users className="w-6 h-6" />} label="Users ทั้งหมด" value={stats.totalUsers} color="blue" />
            <StatCard icon={<Building2 className="w-6 h-6" />} label="Companies ทั้งหมด" value={stats.totalCompanies} color="green" />
            <StatCard icon={<Building2 className="w-6 h-6" />} label="Companies ที่ Active" value={stats.activeCompanies} color="emerald" />
            <StatCard icon={<Package className="w-6 h-6" />} label="Active Subscriptions" value={Object.values(stats.packageCounts).reduce((a, b) => a + b, 0)} color="orange" />
          </div>

          {/* Package Distribution */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Companies แยกตาม Package</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Object.entries(stats.packageCounts).length === 0 ? (
                <p className="text-gray-500 dark:text-slate-400 text-sm col-span-3">ยังไม่มี subscription</p>
              ) : (
                Object.entries(stats.packageCounts).map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-[#F4511E]" />
                      <span className="font-medium text-gray-900 dark:text-white">{name}</span>
                    </div>
                    <span className="text-2xl font-bold text-[#F4511E]">{count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Companies */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Companies ล่าสุด</h2>
            <div className="space-y-3">
              {stats.recentCompanies.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-slate-700 last:border-0">
                  <div className="flex items-center gap-3">
                    {c.logo_url ? (
                      <img src={c.logo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">{c.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${c.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-slate-500">
                      {new Date(c.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-center text-gray-500 py-20">ไม่สามารถโหลดข้อมูลได้</p>
      )}
    </SuperAdminLayout>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-5">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${colorMap[color] || colorMap.blue}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-500 dark:text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
