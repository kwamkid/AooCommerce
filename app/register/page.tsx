// Path: app/register/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Mail, Lock, User, AlertCircle, Loader2 } from 'lucide-react';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signUp, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  const inviteToken = searchParams.get('invite_token') || undefined;

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Check if already logged in
  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) {
        router.push('/dashboard');
      } else {
        setCheckingAuth(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [user, router]);

  // Validate form
  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'กรุณาระบุชื่อ';
    }

    if (!formData.email.trim()) {
      errors.email = 'กรุณาระบุอีเมล';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
    }

    if (!formData.password) {
      errors.password = 'กรุณาระบุรหัสผ่าน';
    } else if (formData.password.length < 6) {
      errors.password = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = 'กรุณายืนยันรหัสผ่าน';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'รหัสผ่านไม่ตรงกัน';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    setIsLoading(true);

    try {
      const { error } = await signUp(formData.email, formData.password, formData.name, inviteToken);

      if (error) {
        setError(error);
        setIsLoading(false);
      }
      // On success, auth-context auto-redirects to /onboarding
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการสมัครสมาชิก');
      setIsLoading(false);
    }
  };

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
        {/* Branding */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#F4511E] mb-2">AooDelivery</h1>
          <p className="text-gray-400 text-sm">
            สร้างบัญชีใหม่เพื่อเริ่มต้นใช้งาน
          </p>
        </div>

        {/* Register Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl p-8 border border-[#F4511E]/20">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">สมัครสมาชิก</h2>

          {/* Invite Token Notice */}
          {inviteToken && (
            <div className="mb-6 p-4 bg-[#F4511E]/10 border border-[#F4511E]/30 rounded-lg">
              <p className="text-sm text-[#F4511E]">คุณได้รับคำเชิญเข้าร่วมบริษัท สมัครสมาชิกเพื่อตอบรับคำเชิญ</p>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Register Form */}
          <form onSubmit={handleRegister} className="space-y-5">
            {/* Name Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                ชื่อ
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    setValidationErrors({ ...validationErrors, name: '' });
                  }}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent transition-all"
                  placeholder="ชื่อของคุณ"
                  disabled={isLoading}
                />
              </div>
              {validationErrors.name && (
                <p className="text-sm text-red-400 mt-1">{validationErrors.name}</p>
              )}
            </div>

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
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    setValidationErrors({ ...validationErrors, email: '' });
                  }}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent transition-all"
                  placeholder="your@email.com"
                  disabled={isLoading}
                />
              </div>
              {validationErrors.email && (
                <p className="text-sm text-red-400 mt-1">{validationErrors.email}</p>
              )}
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
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    setValidationErrors({ ...validationErrors, password: '' });
                  }}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent transition-all"
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  disabled={isLoading}
                />
              </div>
              {validationErrors.password && (
                <p className="text-sm text-red-400 mt-1">{validationErrors.password}</p>
              )}
            </div>

            {/* Confirm Password Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                ยืนยันรหัสผ่าน
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, confirmPassword: e.target.value });
                    setValidationErrors({ ...validationErrors, confirmPassword: '' });
                  }}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent transition-all"
                  placeholder="ยืนยันรหัสผ่านอีกครั้ง"
                  disabled={isLoading}
                />
              </div>
              {validationErrors.confirmPassword && (
                <p className="text-sm text-red-400 mt-1">{validationErrors.confirmPassword}</p>
              )}
            </div>

            {/* Register Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  กำลังสมัครสมาชิก...
                </>
              ) : (
                'สมัครสมาชิก'
              )}
            </button>
          </form>

          {/* Login Link */}
          <p className="text-center text-sm text-gray-400 mt-6">
            มีบัญชีอยู่แล้ว?{' '}
            <Link href="/login" className="text-[#F4511E] hover:text-[#F4511E]/80 font-medium transition-colors">
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-[#1A1A2E]">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#F4511E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white">กำลังโหลด...</p>
          </div>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
