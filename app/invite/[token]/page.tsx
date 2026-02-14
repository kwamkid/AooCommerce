// Path: app/invite/[token]/page.tsx
'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import {
  Building2, Shield, AlertCircle, Loader2, CheckCircle,
  UserPlus, LogIn, Clock, XCircle,
} from 'lucide-react';

interface InvitationData {
  id: string;
  email: string;
  role: string;
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
  manager: 'ผู้จัดการ',
  account: 'บัญชี',
  warehouse: 'คลังสินค้า',
  sales: 'ฝ่ายขาย',
};

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();

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
      <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#16213E] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#F4511E] mb-2">AooDelivery</h1>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl p-8 border border-[#F4511E]/20 text-center">
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
      <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#16213E] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#F4511E] mb-2">AooDelivery</h1>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl p-8 border border-[#F4511E]/20 text-center">
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
      <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#16213E] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#F4511E] mb-2">AooDelivery</h1>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl p-8 border border-[#F4511E]/20 text-center">
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
    <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#16213E] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#F4511E] mb-2">AooDelivery</h1>
          <p className="text-gray-400 text-sm">คำเชิญเข้าร่วมบริษัท</p>
        </div>

        {/* Invitation Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl p-8 border border-[#F4511E]/20">
          {/* Company Info */}
          <div className="text-center mb-6">
            {invitation?.company?.logo_url ? (
              <img
                src={invitation.company.logo_url}
                alt={invitation.company.name}
                className="w-20 h-20 rounded-lg object-cover mx-auto mb-4 border-2 border-[#F4511E]/30"
              />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-[#F4511E]/10 flex items-center justify-center mx-auto mb-4 border-2 border-[#F4511E]/30">
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
                {ROLE_LABELS[invitation?.role || ''] || invitation?.role}
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
            <div className="space-y-4">
              <Link
                href={`/register?invite_token=${token}`}
                className="w-full py-3 bg-[#F4511E] hover:bg-[#F4511E]/90 text-white font-semibold rounded-lg transition-colors flex items-center justify-center"
              >
                <UserPlus className="w-5 h-5 mr-2" />
                สมัครสมาชิกเพื่อตอบรับ
              </Link>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-transparent text-gray-400 dark:text-slate-500">หรือ</span>
                </div>
              </div>

              <Link
                href="/login"
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors border border-gray-600 flex items-center justify-center"
              >
                <LogIn className="w-5 h-5 mr-2" />
                มีบัญชีอยู่แล้ว? เข้าสู่ระบบ
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
