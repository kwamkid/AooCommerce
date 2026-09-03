// Path: app/onboarding/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import SignedInUser from '@/components/onboarding/SignedInUser';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Image from 'next/image';
import { FullPageLoading } from '@/components/ui/Loading';
import { Building2, AlertCircle, Loader2, Plus, ChevronRight, Users, User, LogOut } from 'lucide-react';

interface CompanyMembership {
  company_id: string;
  roles: string[];
  company: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    is_active: boolean;
  };
}

export default function OnboardingPage() {
  const router = useRouter();
  const { session, user, loading, signOut } = useAuth();
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<CompanyMembership[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [needsName, setNeedsName] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Fetch existing companies + (if profile is missing) prompt for name. If the
  // user has no companies AND profile is set, send them straight into the
  // setup wizard at step 1 — the wizard now collects logo/name/description.
  useFetchOnce(async () => {
    if (!session?.access_token) {
      setLoadingCompanies(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      const memberships: CompanyMembership[] = data.companies || [];
      setCompanies(memberships);

      // Check if profile name is missing or is just a placeholder
      const name = data.profile?.name || '';
      const email = data.profile?.email || user?.email || '';
      const emailPrefix = email.split('@')[0];
      const isPlaceholder = !name
        || name === 'User'
        || name === emailPrefix
        || name.startsWith('line_');
      if (isPlaceholder) {
        setNeedsName(true);
        setProfileName('');
      } else if (memberships.length === 0) {
        // Profile is OK and the user has zero companies → wizard.
        router.replace('/onboarding/setup');
        return;
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoadingCompanies(false);
    }
  }, !loading && !!user && !!session?.access_token);

  // Select existing company and go to dashboard
  const handleSelectCompany = (companyId: string) => {
    localStorage.setItem('aoo-current-company-id', companyId);
    // Full page navigation to reinitialize all contexts with new company
    window.location.href = '/dashboard';
  };

  // Open the setup wizard. The wizard owns logo/name/description (step 1)
  // and only creates the company at /api/onboarding/finalize, so abandoning
  // mid-way leaves no orphan record.
  const handleCreateNew = () => {
    // Wipe any wizard state from a previous attempt so the new wizard starts
    // fresh (otherwise the previous company's logo would preload).
    try {
      ['aoo-wiz-company', 'aoo-wiz-channels', 'aoo-wiz-warehouse', 'aoo-wiz-carriers', 'aoo-wiz-payment']
        .forEach(k => sessionStorage.removeItem(k));
    } catch { /* ignore */ }
    router.push('/onboarding/setup');
  };

  // Handle save profile name
  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim() || !session?.access_token) return;

    setSavingName(true);
    setError('');
    try {
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: profileName.trim() }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'เกิดข้อผิดพลาด');
        setSavingName(false);
        return;
      }
      setNeedsName(false);
      // After saving name, if the user has zero companies, jump into the wizard.
      if (companies.length === 0) {
        router.replace('/onboarding/setup');
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการบันทึกชื่อ');
    } finally {
      setSavingName(false);
    }
  };

  // Role label mapping
  const getRoleLabels = (roles: string[]) => {
    const labels: Record<string, string> = {
      owner: 'เจ้าของ',
      admin: 'ผู้ดูแลระบบ',
      account: 'บัญชี',
      warehouse: 'คลังสินค้า',
      sales: 'แอดมินออนไลน์',
      cashier: 'แคชเชียร์',
    };
    return roles.map(r => labels[r] || r).join(', ');
  };

  // Show loading while checking auth
  if (loading || loadingCompanies) {
    return (
      <FullPageLoading label="กำลังโหลด..." />
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 flex flex-col sm:justify-center justify-start items-center px-4 pt-safe-4 pb-safe-6 relative overflow-hidden">
      {/* Decorative soft blobs — ให้พื้นหลังสว่างมีมิติ ไม่แบนจนโล่ง */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-[#F4511E]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 w-[480px] h-[480px] rounded-full bg-amber-300/25 blur-3xl" />

      {/* ตัวตนคน login — ใช้ชิปเดียวกับ wizard (แทนปุ่ม logout จางๆ ที่คนมองข้าม)
          ⚠️ บนมือถือชิปนี้ต้องอยู่ **ในสายการวาง** ห้ามลอย absolute — ชื่อ+อีเมลทำให้มัน
          กว้างเกือบเต็มจอ แล้วไปทับโลโก้ที่อยู่กึ่งกลางด้านบน (เจอจริง 4 ก.ย. 2026)
          จอใหญ่ค่อยลอยไปมุมขวาบนได้ เพราะมีที่เหลือพอ */}
      <div className="w-full max-w-lg sm:max-w-none sm:w-auto sm:absolute sm:top-4 sm:right-4 z-10 mb-4 sm:mb-0 flex justify-end">
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-1.5">
          <SignedInUser />
        </div>
      </div>

      <div className="w-full max-w-lg">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-2">
            <Image src="/logo.svg" alt="AooCommerce" width={150} height={98} className="w-[120px] h-[78px] sm:w-[150px] sm:h-[98px]" priority />
          </div>
          {needsName ? (
            <>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">ยินดีต้อนรับ!</h2>
              <p className="text-gray-500 dark:text-slate-400 text-sm">กรุณาระบุชื่อของคุณเพื่อดำเนินการต่อ</p>
            </>
          ) : companies.length > 0 ? (
            <>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">เลือกบริษัท</h2>
              <p className="text-gray-500 dark:text-slate-400 text-sm">เลือกบริษัทที่ต้องการเข้าใช้งาน หรือสร้างบริษัทใหม่</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">สร้างบริษัทของคุณ</h2>
              <p className="text-gray-500 dark:text-slate-400 text-sm">
                เริ่มต้นใช้งานระบบจัดการธุรกิจ — ถ้าคุณเป็น<b>พนักงานที่ถูกเชิญ</b> ไม่ต้องสร้างบริษัทใหม่:
                แจ้งแอดมินให้ส่งลิงก์เชิญมาที่อีเมลของคุณ (แสดงที่มุมขวาบน) หรือออกจากระบบแล้วเข้าด้วยอีเมลที่ถูกเชิญ
              </p>
            </>
          )}

        </div>

        {/* Name completion form (for OAuth users without name) */}
        {needsName && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-gray-200 dark:border-slate-700">
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
              </div>
            )}
            <form onSubmit={handleSaveName} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  ชื่อ-นามสกุล <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    placeholder="ชื่อ-นามสกุลของคุณ"
                    required
                    disabled={savingName}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={savingName || !profileName.trim()}
                className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {savingName ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    กำลังบันทึก...
                  </>
                ) : (
                  'ดำเนินการต่อ'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Company List (if has companies) */}
        {!needsName && companies.length > 0 && (
          <div className="space-y-4 mb-6">
            {/* Existing Companies */}
            <div className="space-y-3">
              {companies.map((membership) => (
                <button
                  key={membership.company_id}
                  onClick={() => handleSelectCompany(membership.company_id)}
                  className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-primary/50 hover:-translate-y-0.5 transition-all flex items-center gap-4 text-left group"
                >
                  {/* Logo */}
                  {membership.company.logo_url ? (
                    <img
                      src={membership.company.logo_url}
                      alt={membership.company.name}
                      className="w-14 h-14 rounded-xl object-cover border border-gray-200 dark:border-slate-600"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#F4511E] to-[#E0480F] flex items-center justify-center shadow-sm">
                      <Building2 className="w-7 h-7 text-white" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-gray-900 dark:text-white font-semibold text-lg truncate">
                      {membership.company.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-sm text-gray-400 dark:text-slate-500">
                        {getRoleLabels(membership.roles)}
                      </span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>

            {/* Create New Company Button — opens the wizard at step 1 */}
            <button
              onClick={handleCreateNew}
              className="w-full bg-white/70 dark:bg-slate-800/60 rounded-2xl p-4 border-2 border-dashed border-gray-300 dark:border-slate-600 hover:border-primary/60 hover:bg-white transition-all flex items-center gap-4 text-left group"
            >
              <div className="w-14 h-14 rounded-xl bg-orange-50 dark:bg-slate-700 flex items-center justify-center border border-orange-100 dark:border-slate-600 group-hover:border-primary/40">
                <Plus className="w-7 h-7 text-primary transition-colors" />
              </div>
              <div className="flex-1">
                <h3 className="text-gray-800 dark:text-slate-200 font-semibold group-hover:text-primary transition-colors">
                  สร้างบริษัทใหม่
                </h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">เพิ่มบริษัทหรือร้านค้าใหม่</p>
              </div>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
