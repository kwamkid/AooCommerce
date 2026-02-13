// Path: lib/auth-context.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { UserProfile } from '@/types';

// Auth Context Interface
interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithLine: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// Create Auth Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/line-callback'];

// Auth Provider Component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Fetch user profile via API (bypasses RLS)
  const fetchUserProfile = async (authUser: User, accessToken?: string): Promise<UserProfile> => {
    try {
      // Get token if not provided
      let token = accessToken;
      if (!token) {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData.session?.access_token;
      }

      if (!token) {
        console.log('No access token available');
        throw new Error('No access token');
      }

      // Fetch profile via API
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok || !result.profile) {
        console.log('API error or no profile:', result.error);
        throw new Error(result.error || 'Failed to fetch profile');
      }

      const data = result.profile;

      // Map database fields to UserProfile
      return {
        id: data.id,
        email: data.email || authUser.email || '',
        name: data.name || authUser.email?.split('@')[0] || 'User',
        role: data.role || 'operation',
        phone: data.phone || undefined,
        isActive: data.is_active ?? true,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      // Fallback on error
      const isAdmin = authUser.email === 'kwamkid@gmail.com';
      return {
        id: authUser.id,
        email: authUser.email || '',
        name: authUser.email?.split('@')[0] || 'User',
        role: isAdmin ? 'admin' : 'operation',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  };

  // Initialize auth on mount
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      console.log('Initializing auth...');
      
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          if (mounted) setLoading(false);
          return;
        }
        
        if (!mounted) return;

        if (session?.user) {
          console.log('Found user:', session.user.email);
          setSession(session);
          setUser(session.user);

          // ดึง profile ผ่าน API
          const profile = await fetchUserProfile(session.user, session.access_token);
          setUserProfile(profile);
          console.log('Loaded profile from API:', profile);
        } else {
          console.log('No session found');
        }
      } catch (error) {
        console.error('Init error:', error);
      } finally {
        if (mounted) {
          setLoading(false);
          console.log('Init complete');
        }
      }
    };

    // รันทันที ไม่ต้อง delay
    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  // Listen to auth changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        console.log('Auth event:', event);

        // Skip initial session - already handled in initAuth
        if (event === 'INITIAL_SESSION') return;

        // Only handle actual sign in/out events, not token refresh
        if (event === 'SIGNED_IN' && currentSession) {
          // Check if user actually changed to prevent infinite loop
          setSession(prev => {
            if (prev?.user?.id === currentSession.user.id) {
              return prev; // No change needed
            }
            return currentSession;
          });

          setUser(prev => {
            if (prev?.id === currentSession.user.id) {
              return prev; // No change needed
            }
            // Only update profile if user actually changed
            fetchUserProfile(currentSession.user, currentSession.access_token).then(profile => {
              setUserProfile(profile);
            });
            return currentSession.user;
          });

          setLoading(false);

        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setUserProfile(null);
          setSession(null);
          setLoading(false);
          router.push('/login');
        } else if (event === 'TOKEN_REFRESHED' && currentSession) {
          // Only update session token, not trigger re-render of user/profile
          setSession(currentSession);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [router]);

  // Handle routing
  useEffect(() => {
    if (loading) return;

    // ถ้ามี user และอยู่หน้า login -> ไป dashboard
    if (user && pathname === '/login') {
      console.log('Redirecting to dashboard');
      router.push('/dashboard');
    }

    // ถ้าไม่มี user และอยู่หน้า protected -> ไป login
    if (!user && !PUBLIC_ROUTES.includes(pathname) && pathname !== '/') {
      console.log('Redirecting to login');
      router.push('/login');
    }
  }, [user, pathname, loading, router]);

  // Sign in
  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
        }
        return { error: error.message };
      }

      return { error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' };
    }
  };

  // Sign in with LINE
  const signInWithLine = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (error) {
      return { error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย LINE' };
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      // Clear state และ redirect เสมอ แม้จะมี error
      setUser(null);
      setUserProfile(null);
      setSession(null);
      router.push('/login');
    }
  };

  // Refresh profile - ดึงผ่าน API
  const refreshProfile = async () => {
    if (user && session) {
      const profile = await fetchUserProfile(user, session.access_token);
      setUserProfile(profile);
    }
  };

  // Context value
  const value: AuthContextType = {
    user,
    userProfile,
    session,
    loading,
    signIn,
    signInWithLine,
    signOut,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}