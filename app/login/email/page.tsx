'use client';

// ── หน้าล็อกอินด้วยอีเมล/รหัสผ่าน — **ของชั่วคราวสำหรับผู้ตรวจแอปเท่านั้น** ──
//
// ระบบจริงใช้ Google อย่างเดียวตั้งแต่ 14 ส.ค. 2026 (ทั้ง /login และ /register)
// แต่ผู้ตรวจของ Shopee/TikTok ขอ "test username + password" ซึ่งส่งบัญชี Google
// ให้ไม่ได้จริง (Google บล็อกการล็อกอินจากเครื่อง/ประเทศแปลกหน้า ผู้ตรวจจะเข้าไม่ได้)
//
// 🗑️ **ลบทิ้งเมื่อรีวิวผ่าน** — ลบทั้งโฟลเดอร์ app/login/email แล้วลบ user
//    shopee.review@aoocommerce.com ออกจาก Supabase Auth + company_members
//
// ไม่ลิงก์จากที่ไหนในระบบ (เข้าได้เฉพาะคนที่รู้ URL) — กลไกหลังบ้านใช้ตัวเดียว
// กับของเดิม `signIn()` → `loginWithPassword()` ที่ยังอยู่ครบ ไม่ได้เพิ่มช่องทางใหม่

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import FormInput from '@/components/ui/FormInput';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';

export default function EmailLoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await signIn(email.trim(), password);
    if (signInError) {
      setError(signInError);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="heading-2 text-gray-900">AooCommerce</h1>
          <p className="page-subtitle" lang="en">Sign in with email</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm px-6 py-6 space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          <FormInput
            label="อีเมล"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
          <FormInput
            label="รหัสผ่าน"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <Button type="submit" variant="primary" loading={loading} className="w-full">
            เข้าสู่ระบบ
          </Button>

          <p className="helper-text text-gray-500 text-center">
            พนักงานทั่วไปใช้{' '}
            <Link href="/login" className="text-primary hover:underline">เข้าสู่ระบบด้วย Google</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
