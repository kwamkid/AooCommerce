// Path: lib/auth-context.tsx
'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { UserProfile, CompanyRole } from '@/types';

interface CompanyMembershipRaw {
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

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  connectionError: boolean;
  hasCompany: boolean;
  companies: CompanyMembershipRaw[];
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string, inviteToken?: string) => Promise<{ error: string | null }>;
  signInWithGoogle: (inviteToken?: string) => Promise<{ error: string | null }>;
  signInWithLINE: (inviteToken?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  retryConnection: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PUBLIC_ROUTES = ['/login', '/register', '/auth/callback', '/line-callback', '/onboarding', '/bills', '/transfers/receive', '/supplier-portal'];
const STORAGE_KEY = 'aoo-current-company-id';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // loading = true until we know auth state + company state
  const [loading, setLoading] = useState(true);
  const [hasCompany, setHasCompany] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [companies, setCompanies] = useState<CompanyMembershipRaw[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  const fetchUserProfile = useCallback(async (authUser: User, accessToken: string): Promise<UserProfile | null> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.status === 500) {
        // Server error (likely Supabase connection timeout)
        setConnectionError(true);
        return null;
      }

      const result = await response.json();
      if (!response.ok || !result.profile) return null;
      setConnectionError(false);

      const data = result.profile;
      const companiesData: CompanyMembershipRaw[] = result.companies || [];
      setCompanies(companiesData);
      setHasCompany(companiesData.length > 0);

      // Use company roles directly as the user's effective roles
      const savedCompanyId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const currentMembership = companiesData.find((m: { company_id: string }) => m.company_id === savedCompanyId) || companiesData[0];
      const effectiveRoles = (currentMembership?.roles || ['sales']) as CompanyRole[];

      return {
        id: data.id,
        email: data.email || authUser.email || '',
        name: data.name || authUser.email?.split('@')[0] || 'User',
        roles: effectiveRoles,
        phone: data.phone || undefined,
        isActive: data.is_active ?? true,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      // Network error (fetch failed, timeout, DNS, etc.)
      setConnectionError(true);
      return null;
    }
  }, []);

  // Track whether profile has been fetched to prevent duplicate calls
  const profileFetchedRef = useRef(false);

  // Single init on mount — determines full auth + company state
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);

          const profile = await fetchUserProfile(currentSession.user, currentSession.access_token);
          if (!mounted) return;

          profileFetchedRef.current = true;

          if (profile) {
            setUserProfile(profile);
          } else {
            // Fallback profile
            setUserProfile({
              id: currentSession.user.id,
              email: currentSession.user.email || '',
              name: currentSession.user.email?.split('@')[0] || 'User',
              roles: ['sales'],
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date()
            });
          }
        }
      } catch (error) {
        console.error('Auth init error:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, [fetchUserProfile]);

  // Listen for auth state changes
  // TOKEN_REFRESHED: only update session silently (no re-fetch, no state cascade)
  // SIGNED_IN: fetch profile only if init hasn't done it already
  // SIGNED_OUT: clear all state
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'TOKEN_REFRESHED' && currentSession) {
        // Silently update session reference without triggering re-renders
        setSession(currentSession);
        return;
      }
      if (event === 'SIGNED_IN' && currentSession) {
        setSession(currentSession);
        setUser(currentSession.user);

        // Only fetch profile if init() hasn't already done it
        if (!profileFetchedRef.current) {
          profileFetchedRef.current = true;
          const profile = await fetchUserProfile(currentSession.user, currentSession.access_token);
          if (profile) {
            setUserProfile(profile);
          }
          setLoading(false);
        }
      }
      if (event === 'SIGNED_OUT') {
        profileFetchedRef.current = false;
        setUser(null);
        setUserProfile(null);
        setSession(null);
        setHasCompany(false);
        setCompanies([]);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchUserProfile]);

  // Routing — only runs after loading is done
  useEffect(() => {
    if (loading) return;
    // Don't redirect when there's a connection error — show error UI instead
    if (connectionError) return;

    const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));
    const isInvitePage = pathname.startsWith('/invite/');
    const isSuperAdminPage = pathname.startsWith('/superadmin');
    if (isInvitePage || isSuperAdminPage) return;

    // Not logged in → go to login (unless already on public route)
    if (!user) {
      if (!isPublicRoute && pathname !== '/') {
        router.replace('/login');
      }
      return;
    }

    // Logged in → handle routing
    // On login/register page → go to company list
    if (pathname === '/login' || pathname === '/register') {
      router.replace('/onboarding');
      return;
    }

    // No company AND no saved selection → must create/join one
    const savedCompanyId = localStorage.getItem(STORAGE_KEY);
    if (!hasCompany && !savedCompanyId && !isPublicRoute) {
      router.replace('/onboarding');
      return;
    }
  }, [user, pathname, loading, router, hasCompany]);

  const signIn = async (email: string, password: string) => {
    try {
      // Reset state for fresh login
      setLoading(true);
      setHasCompany(false);
      localStorage.removeItem(STORAGE_KEY);

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setLoading(false);
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
        }
        return { error: error.message };
      }

      if (data.session?.user) {
        setSession(data.session);
        setUser(data.session.user);

        const profile = await fetchUserProfile(data.session.user, data.session.access_token);
        if (profile) {
          setUserProfile(profile);
        }
      }

      setLoading(false);
      return { error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      setLoading(false);
      return { error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' };
    }
  };

  const signUp = async (email: string, password: string, name: string, inviteToken?: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (inviteToken) headers['X-Invite-Token'] = inviteToken;

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password, name }),
      });

      const result = await response.json();
      if (!response.ok) {
        return { error: result.error || 'เกิดข้อผิดพลาดในการสมัครสมาชิก' };
      }

      // Auto sign in after registration
      const signInResult = await signIn(email, password);
      return signInResult;
    } catch (error) {
      console.error('Sign up error:', error);
      return { error: 'เกิดข้อผิดพลาดในการสมัครสมาชิก' };
    }
  };

  const signInWithGoogle = async (inviteToken?: string) => {
    try {
      if (inviteToken) {
        document.cookie = `invite_token=${inviteToken}; path=/; max-age=3600; SameSite=Lax`;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) return { error: error.message };
      return { error: null };
    } catch {
      return { error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google' };
    }
  };

  const signInWithLINE = async (inviteToken?: string) => {
    try {
      if (inviteToken) {
        document.cookie = `invite_token=${inviteToken}; path=/; max-age=3600; SameSite=Lax`;
      }
      const channelId = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID;
      if (!channelId) {
        return { error: 'LINE Login ยังไม่ได้ตั้งค่า' };
      }
      const redirectUri = `${window.location.origin}/line-callback`;
      const state = Math.random().toString(36).substring(2);
      const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=profile%20openid`;
      window.location.href = lineAuthUrl;
      return { error: null };
    } catch {
      return { error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย LINE' };
    }
  };

  const signOut = async () => {
    localStorage.removeItem(STORAGE_KEY);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
    setUser(null);
    setUserProfile(null);
    setSession(null);
    setHasCompany(false);
    setCompanies([]);
    router.replace('/login');
  };

  const refreshProfile = async () => {
    if (user && session) {
      const profile = await fetchUserProfile(user, session.access_token);
      if (profile) setUserProfile(profile);
    }
  };

  const retryConnection = () => {
    setConnectionError(false);
    setLoading(true);
    profileFetchedRef.current = false;
    // Re-run init by reloading the page
    window.location.reload();
  };

  const value = useMemo(() => ({
    user, userProfile, session, loading, connectionError, hasCompany, companies,
    signIn, signUp, signInWithGoogle, signInWithLINE, signOut, refreshProfile, retryConnection,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, userProfile, session, loading, connectionError, hasCompany, companies]);

  return (
    <AuthContext.Provider value={value}>
      {connectionError && !loading ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 px-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4m0 4h.01" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
              ระบบไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ในขณะนี้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตของคุณแล้วลองใหม่อีกครั้ง
            </p>
            <button
              onClick={retryConnection}
              className="w-full py-3 px-4 bg-[#F4511E] hover:bg-[#E64A19] text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              ลองใหม่อีกครั้ง
            </button>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-4">
              หากปัญหายังคงอยู่ กรุณาติดต่อผู้ดูแลระบบ
            </p>
          </div>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
