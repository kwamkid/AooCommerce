// Path: app/onboarding/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import Image from 'next/image';
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
      <div className="flex items-center justify-center min-h-screen bg-[#1A1A2E]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#16213E] flex items-start sm:items-center justify-center pt-8 sm:pt-0 p-4 relative">
      {/* Logout button */}
      <button
        onClick={signOut}
        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm"
      >
        <LogOut className="w-4 h-4" />
        ออกจากระบบ
      </button>

      <div className="w-full max-w-lg">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-2">
            <Image src="/logo.svg" alt="AooCommerce" width={150} height={98} className="w-[120px] h-[78px] sm:w-[150px] sm:h-[98px]" priority />
          </div>
          {needsName ? (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">ยินดีต้อนรับ!</h2>
              <p className="text-gray-400 text-sm">กรุณาระบุชื่อของคุณเพื่อดำเนินการต่อ</p>
            </>
          ) : companies.length > 0 ? (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">เลือกบริษัท</h2>
              <p className="text-gray-400 text-sm">เลือกบริษัทที่ต้องการเข้าใช้งาน หรือสร้างบริษัทใหม่</p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">สร้างบริษัทของคุณ</h2>
              <p className="text-gray-400 text-sm">เริ่มต้นใช้งานระบบจัดการธุรกิจ</p>
            </>
          )}
        </div>

        {/* Name completion form (for OAuth users without name) */}
        {needsName && (
          <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl p-8 border border-white/10">
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
            <form onSubmit={handleSaveName} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  ชื่อ-นามสกุล <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white/10 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
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
                  className="w-full bg-white/10 backdrop-blur-md rounded-xl p-4 border border-primary/20 hover:border-primary/60 hover:bg-white/15 transition-all flex items-center gap-4 text-left group"
                >
                  {/* Logo */}
                  {membership.company.logo_url ? (
                    <img
                      src={membership.company.logo_url}
                      alt={membership.company.name}
                      className="w-14 h-14 rounded-lg object-cover border border-white/10"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
                      <Building2 className="w-7 h-7 text-primary" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-lg truncate">
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
                  <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>

            {/* Create New Company Button — opens the wizard at step 1 */}
            <button
              onClick={handleCreateNew}
              className="w-full bg-white/5 backdrop-blur-md rounded-xl p-4 border border-dashed border-gray-600 hover:border-primary/50 hover:bg-white/10 transition-all flex items-center gap-4 text-left group"
            >
              <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center border border-gray-600 group-hover:border-primary/30">
                <Plus className="w-7 h-7 text-gray-400 group-hover:text-primary transition-colors" />
              </div>
              <div className="flex-1">
                <h3 className="text-gray-300 font-semibold group-hover:text-white transition-colors">
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
