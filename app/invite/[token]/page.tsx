// Path: app/invite/[token]/page.tsx
'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import {
  Building2, Shield, AlertCircle, Loader2, CheckCircle,
  UserPlus, LogIn, Clock, XCircle,
} from 'lucide-react';

interface InvitationData {
  id: string;
  email: string | null;
  roles: string[];
  status: string;
  expires_at: string;
  created_at: string;
  company: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'เจ้าของ',
  admin: 'ผู้ดูแลระบบ',
  account: 'บัญชี',
  warehouse: 'คลังสินค้า',
  sales: 'แอดมินออนไลน์',
  cashier: 'แคชเชียร์',
};

const formatRoleLabels = (roles?: string[]) => {
  if (!roles || roles.length === 0) return '-';
  return roles.map(r => ROLE_LABELS[r] || r).join(', ');
};

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { user, session, loading: authLoading, signInWithGoogle, signInWithLINE } = useAuth();

  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [accepted, setAccepted] = useState(false);

  // Fetch invitation details
  useEffect(() => {
    const fetchInvitation = async () => {
      try {
        const response = await fetch(`/api/invitations/${token}`);
        const data = await response.json();

        if (response.ok && data.invitation) {
          setInvitation(data.invitation);
        } else {
          // Handle expired/used invitations
          if (data.invitation) {
            setInvitation(data.invitation);
          }
          setInviteError(data.error || 'ไม่พบคำเชิญนี้');
        }
      } catch (err) {
        setInviteError('เกิดข้อผิดพลาดในการโหลดข้อมูลคำเชิญ');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvitation();
  }, [token]);

  // Handle accept invitation
  const handleAccept = async () => {
    if (!session?.access_token) {
      setError('กรุณาเข้าสู่ระบบก่อน');
      return;
    }

    setIsAccepting(true);
    setError('');

    try {
      const response = await fetch(`/api/invitations/${token}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        setAccepted(true);
        // Redirect to dashboard after a short delay and reload to update company context
        setTimeout(() => {
          router.push('/dashboard');
          window.location.reload();
        }, 2000);
      } else {
        setError(data.error || 'ไม่สามารถตอบรับคำเชิญได้');
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการตอบรับคำเชิญ');
    } finally {
      setIsAccepting(false);
    }
  };

  // Loading state
  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A1A2E]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#F4511E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">กำลังโหลดข้อมูลคำเชิญ...</p>
        </div>
      </div>
    );
  }

  // Invite error state (expired, used, not found)
  if (inviteError && !invitation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#16213E] flex items-start sm:items-center justify-center pt-8 sm:pt-0 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-2">
              <Image src="/logo.svg" alt="AooCommerce" width={150} height={98} className="w-[120px] h-[78px] sm:w-[150px] sm:h-[98px]" priority />
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl p-8 border border-white/10 text-center">
            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">ไม่พบคำเชิญ</h2>
            <p className="text-gray-400 mb-6">{inviteError}</p>
            <Link
              href="/login"
              className="inline-flex items-center px-6 py-3 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors"
            >
              <LogIn className="w-5 h-5 mr-2" />
              ไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Invitation expired or used
  if (inviteError && invitation) {
    const isExpired = invitation.status === 'pending' && new Date(invitation.expires_at) < new Date();
    const isUsed = invitation.status === 'accepted';
    const isCancelled = invitation.status === 'cancelled';

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#16213E] flex items-start sm:items-center justify-center pt-8 sm:pt-0 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-2">
              <Image src="/logo.svg" alt="AooCommerce" width={150} height={98} className="w-[120px] h-[78px] sm:w-[150px] sm:h-[98px]" priority />
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl p-8 border border-white/10 text-center">
            {isExpired && (
              <>
                <Clock className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">คำเชิญหมดอายุ</h2>
                <p className="text-gray-400 mb-2">คำเชิญเข้าร่วม <span className="text-white font-medium">{invitation.company?.name}</span> หมดอายุแล้ว</p>
                <p className="text-gray-500 text-sm mb-6">กรุณาติดต่อผู้ดูแลระบบเพื่อส่งคำเชิญใหม่</p>
              </>
            )}
            {isUsed && (
              <>
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">คำเชิญถูกใช้งานแล้ว</h2>
                <p className="text-gray-400 mb-6">คำเชิญนี้ถูกตอบรับไปแล้ว</p>
              </>
            )}
            {isCancelled && (
              <>
                <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">คำเชิญถูกยกเลิก</h2>
                <p className="text-gray-400 mb-6">คำเชิญนี้ถูกยกเลิกโดยผู้ดูแลระบบ</p>
              </>
            )}
            {!isExpired && !isUsed && !isCancelled && (
              <>
                <AlertCircle className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">ไม่สามารถใช้คำเชิญได้</h2>
                <p className="text-gray-400 mb-6">{inviteError}</p>
              </>
            )}
            <Link
              href="/login"
              className="inline-flex items-center px-6 py-3 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors"
            >
              <LogIn className="w-5 h-5 mr-2" />
              ไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Accepted state
  if (accepted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#16213E] flex items-start sm:items-center justify-center pt-8 sm:pt-0 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-2">
              <Image src="/logo.svg" alt="AooCommerce" width={150} height={98} className="w-[120px] h-[78px] sm:w-[150px] sm:h-[98px]" priority />
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl p-8 border border-white/10 text-center">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">ตอบรับคำเชิญสำเร็จ!</h2>
            <p className="text-gray-400 mb-2">
              คุณเข้าร่วม <span className="text-white font-medium">{invitation?.company?.name}</span> เรียบร้อยแล้ว
            </p>
            <p className="text-gray-500 text-sm">กำลังนำคุณไปยังหน้าหลัก...</p>
          </div>
        </div>
      </div>
    );
  }

  // Main invitation display
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#16213E] flex items-start sm:items-center justify-center pt-8 sm:pt-0 p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-2">
            <Image src="/logo.svg" alt="AooCommerce" width={150} height={98} className="w-[120px] h-[78px] sm:w-[150px] sm:h-[98px]" priority />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">คำเชิญเข้าร่วมบริษัท</h2>
        </div>

        {/* Invitation Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl p-8 border border-white/10">
          {/* Company Info */}
          <div className="text-center mb-6">
            {invitation?.company?.logo_url ? (
              <img
                src={invitation.company.logo_url}
                alt={invitation.company.name}
                className="w-20 h-20 rounded-lg object-cover mx-auto mb-4"
              />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-[#F4511E]/10 flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-10 h-10 text-[#F4511E]" />
              </div>
            )}
            <h2 className="text-xl font-semibold text-white mb-2">{invitation?.company?.name}</h2>
            <p className="text-gray-400 text-sm">เชิญคุณเข้าร่วมบริษัท</p>
          </div>

          {/* Role Info */}
          <div className="bg-white/5 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-gray-300">
                <Shield className="w-4 h-4" />
                <span className="text-sm">ตำแหน่ง</span>
              </div>
              <span className="text-[#F4511E] font-medium">
                {formatRoleLabels(invitation?.roles)}
              </span>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Actions based on login state */}
          {user ? (
            <div className="space-y-4">
              <button
                onClick={handleAccept}
                disabled={isAccepting}
                className="w-full py-3 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isAccepting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    กำลังตอบรับ...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    ตอบรับคำเชิญ
                  </>
                )}
              </button>
              <p className="text-center text-xs text-gray-500 dark:text-slate-400">
                เข้าสู่ระบบในชื่อ {user.email}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Social login */}
              <button
                onClick={() => signInWithGoogle(token)}
                className="w-full py-3 bg-white hover:bg-gray-100 text-gray-700 font-semibold rounded-lg transition-colors flex items-center justify-center"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                ดำเนินการด้วย Google
              </button>

              <button
                onClick={() => signInWithLINE(token)}
                className="w-full py-3 bg-[#00B900] hover:bg-[#00B900]/90 text-white font-semibold rounded-lg transition-colors flex items-center justify-center"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                </svg>
                ดำเนินการด้วย LINE
              </button>

              {/* Divider */}
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-transparent text-gray-400">หรือ</span>
                </div>
              </div>

              <Link
                href={`/register?invite_token=${token}`}
                className="w-full py-3 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors flex items-center justify-center"
              >
                <UserPlus className="w-5 h-5 mr-2" />
                สมัครด้วยอีเมล
              </Link>

              <p className="text-center text-sm text-gray-400 mt-1">
                มีบัญชีอยู่แล้ว?{' '}
                <Link href="/login" className="text-[#F4511E] hover:text-[#F4511E]/80 font-medium transition-colors">
                  เข้าสู่ระบบ
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
