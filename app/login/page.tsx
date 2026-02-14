// Path: app/login/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import { Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signInWithLine, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  // Check if already logged in — let auth context handle redirect
  useEffect(() => {
    if (user) {
      // Auth context will redirect to /onboarding
    } else {
      setCheckingAuth(false);
    }
  }, [user]);

  // Handle email/password login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { error } = await signIn(formData.email, formData.password);
      
      if (error) {
        setError(error);
        setIsLoading(false);
      }
      // Login สำเร็จ — auth context routing จะ redirect ไป /onboarding
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
      setIsLoading(false);
    }
  };

  // Handle LINE login
  const handleLineLogin = async () => {
    setError('');
    setIsLoading(true);

    try {
      const { error } = await signInWithLine();
      
      if (error) {
        setError(error);
        setIsLoading(false);
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย LINE');
      setIsLoading(false);
    }
  };

  // แสดง loading เฉพาะตอนเริ่มต้นเท่านั้น
  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A1A2E]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#F4511E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">กำลังตรวจสอบ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#16213E] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <Image src="/logo.svg" alt="JOOLZ Factory" width={150} height={98} priority />
          </div>
          <p className="text-gray-400 text-sm">
            ระบบจัดการโรงงานผลิตน้ำผลไม้
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl p-8 border border-[#F4511E]/20">
          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Email Login Form */}
          <form onSubmit={handleEmailLogin} className="space-y-5">
            {/* Email Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                อีเมล
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent transition-all"
                  placeholder="your@email.com"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                รหัสผ่าน
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent transition-all"
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  กำลังเข้าสู่ระบบ...
                </>
              ) : (
                'เข้าสู่ระบบ'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-transparent text-gray-400 dark:text-slate-500">หรือ</span>
            </div>
          </div>

          {/* LINE Login Button */}
          <button
            onClick={handleLineLogin}
            disabled={isLoading}
            className="w-full py-3 bg-[#00B900] hover:bg-[#00B900]/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                กำลังเข้าสู่ระบบ...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15h-2v-3h2v-2c0-2.33 1.33-3.53 3.53-3.53.98 0 2.03.07 2.03.07v2.24h-1.14c-1.13 0-1.48.7-1.48 1.42V12h2.53l-.4 3h-2.13v6.8c4.56-.93 8-4.96 8-9.8 0-5.52-4.48-10-10-10z"/>
                </svg>
                เข้าสู่ระบบด้วย LINE
              </>
            )}
          </button>

          {/* Footer Note */}
          <p className="text-center text-xs text-gray-500 mt-6">
            สำหรับพนักงานที่ได้รับอนุญาตเท่านั้น
          </p>
        </div>

        {/* Test Account Info */}
        <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/10">
          <p className="text-xs text-gray-400 mb-2">🔐 Test Account:</p>
          <div className="space-y-1">
            <p className="text-xs text-gray-300">
              Email: kwamkid@gmail.com
            </p>
            <p className="text-xs text-gray-300">
              Password: 1234
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}