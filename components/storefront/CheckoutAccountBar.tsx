// แถบบัญชีบนหัวฟอร์มชำระเงิน — แถวเดียว ไม่อธิบายอะไรยาว
//
// ⚠️ เป็น "ทางลัด" ไม่ใช่ "ด่าน" — ปุ่มยืนยันคำสั่งซื้อต้องกดได้เสมอโดยไม่ต้อง
// ล็อกอิน การบังคับสมัครก่อนซื้อคือสาเหตุอันดับต้น ๆ ที่ลูกค้าทิ้งตะกร้า
'use client';

import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { loginWithGoogle, loginWithLINE } from '@/lib/auth/login-methods';
import { clearSession } from '@/lib/auth/session-manager';
import { supabase } from '@/lib/supabase';
import { storefrontHref } from '@/lib/storefront';
import { GoogleMark, LineMark } from '@/components/storefront/BrandMarks';

interface Props {
  shop: string;
  signedIn: boolean;
  /** ล็อกอินอยู่แต่ยังไม่ได้ผูกกับร้านนี้ → ยังไม่มีที่อยู่ให้ดึง */
  linkedName: string | null;
  isStaff: boolean;
  /** ร้านเปิดให้ล็อกอินด้วย LINE และกรอก channel ครบแล้วหรือยัง */
  lineLogin: boolean;
  lineChannelId: string;
  /** ออกจากระบบแล้วให้ฟอร์มกลับไปโหมดไม่ล็อกอิน โดยไม่โหลดหน้าใหม่ (ที่พิมพ์ไว้จะได้ไม่หาย) */
  onSignedOut: () => void;
}

export default function CheckoutAccountBar({
  shop, signedIn, linkedName, isStaff, lineLogin, lineChannelId, onSignedOut,
}: Props) {
  const [busy, setBusy] = useState('');
  const [profile, setProfile] = useState<{ name: string; avatar: string | null } | null>(null);
  const returnTo = storefrontHref(shop, '/checkout');

  // รูปกับชื่อมาจาก session ที่มีในเครื่องอยู่แล้ว — getSession ไม่ยิงเน็ต
  useEffect(() => {
    if (!signedIn) { setProfile(null); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (!alive || !u) return;
      const m = (u.user_metadata || {}) as Record<string, string>;
      setProfile({
        name: linkedName || m.full_name || m.name || u.email || 'บัญชีของฉัน',
        avatar: m.avatar_url || m.picture || null,
      });
    });
    return () => { alive = false; };
  }, [signedIn, linkedName]);

  const signOut = async () => {
    setBusy('out');
    await supabase.auth.signOut();
    clearSession();
    setBusy('');
    onSignedOut();
  };

  if (signedIn) {
    return (
      <div className="sf-acctbar">
        {profile?.avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={profile.avatar} alt="" className="sf-acct-avatar" />
          : <span className="sf-acct-avatar sf-acct-avatar-blank"><UserRound strokeWidth={1.75} aria-hidden="true" /></span>}

        <span className="sf-acct-name">
          {profile?.name || 'บัญชีของฉัน'}
          {isStaff && <span className="sf-hint">บัญชีทีมงาน — ทดสอบควรใช้หน้าต่างส่วนตัว</span>}
        </span>

        <button type="button" className="sf-btn-ghost" disabled={!!busy} onClick={signOut}>
          {busy === 'out' ? 'กำลังออก…' : 'ออกจากระบบ'}
        </button>
      </div>
    );
  }

  return (
    <div className="sf-acctbar sf-acctbar-signin">
      <div className="sf-acctbar-pitch">
        <strong>เข้าสู่ระบบไว้ ครั้งหน้าสั่งง่ายกว่าเดิม</strong>
        <span className="sf-hint">เก็บประวัติการสั่งซื้อ ติดตามสถานะได้ทุกเมื่อ และไม่ต้องกรอกที่อยู่ใหม่</span>
      </div>

      <div className="sf-acctbar-btns">
        <button
          type="button"
          className="sf-auth-btn"
          disabled={!!busy}
          onClick={async () => {
            setBusy('google');
            const r = await loginWithGoogle(undefined, returnTo);
            if (r.status === 'error') setBusy('');
          }}
        >
          <GoogleMark />
          {busy === 'google' ? 'กำลังเปิด Google…' : 'เข้าสู่ระบบด้วย Google'}
        </button>

        {/* โผล่เฉพาะร้านที่เปิดใช้งานไว้เอง — การมี OA ไม่ได้แปลว่าล็อกอิน LINE พร้อมใช้ */}
        {lineLogin && (
          <button
            type="button"
            className="sf-auth-btn sf-auth-line"
            disabled={!!busy}
            onClick={async () => {
              setBusy('line');
              const r = await loginWithLINE(undefined, returnTo, { shopSlug: shop, channelId: lineChannelId });
              if (r.status === 'error') setBusy('');
            }}
          >
            <LineMark />
            {busy === 'line' ? 'กำลังเปิด LINE…' : 'เข้าสู่ระบบด้วย LINE'}
          </button>
        )}
      </div>
    </div>
  );
}
