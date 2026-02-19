// Path: lib/auth-context.tsx
'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
  hasCompany: boolean;
  companies: CompanyMembershipRaw[];
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string, inviteToken?: string) => Promise<{ error: string | null }>;
  signInWithLine: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PUBLIC_ROUTES = ['/login', '/register', '/auth/callback', '/line-callback', '/onboarding', '/bills'];
const STORAGE_KEY = 'aoo-current-company-id';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // loading = true until we know auth state + company state
  const [loading, setLoading] = useState(true);
  const [hasCompany, setHasCompany] = useState(false);
  const [companies, setCompanies] = useState<CompanyMembershipRaw[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  const fetchUserProfile = useCallback(async (authUser: User, accessToken: string): Promise<UserProfile | null> => {
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      const result = await response.json();
      if (!response.ok || !result.profile) return null;

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
      return null;
    }
  }, []);

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

  // Listen for sign-out only (sign-in is handled by login page redirect)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'TOKEN_REFRESHED' && currentSession) {
        setSession(currentSession);
      }
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserProfile(null);
        setSession(null);
        setHasCompany(false);
        setCompanies([]);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Routing — only runs after loading is done
  useEffect(() => {
    if (loading) return;

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

  const signInWithLine = async () => {
    try {
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

  return (
    <AuthContext.Provider value={{
      user, userProfile, session, loading, hasCompany, companies,
      signIn, signUp, signInWithLine, signOut, refreshProfile,
    }}>
      {children}
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
