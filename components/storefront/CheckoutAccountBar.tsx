// แถบบัญชีบนหัวฟอร์มชำระเงิน
//
// ⚠️ เป็น "ทางลัด" ไม่ใช่ "ด่าน" — ปุ่มยืนยันคำสั่งซื้อต้องกดได้เสมอโดยไม่ต้อง
// ล็อกอิน การบังคับสมัครก่อนซื้อคือสาเหตุอันดับต้น ๆ ที่ลูกค้าทิ้งตะกร้า
// หน้าที่ของแถบนี้มีอย่างเดียว: คนที่เคยซื้อแล้วไม่ต้องพิมพ์ที่อยู่ใหม่
'use client';

import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { loginWithGoogle, loginWithLINE } from '@/lib/auth/login-methods';
import { storefrontHref } from '@/lib/storefront';

interface Props {
  shop: string;
  signedIn: boolean;
  /** ล็อกอินอยู่แต่ยังไม่ได้ผูกกับร้านนี้ → ยังไม่มีที่อยู่ให้ดึง */
  linkedName: string | null;
  isStaff: boolean;
  lineOaName: string | null;
}

export default function CheckoutAccountBar({ shop, signedIn, linkedName, isStaff, lineOaName }: Props) {
  const [busy, setBusy] = useState('');
  const returnTo = storefrontHref(shop, '/checkout');

  if (signedIn) {
    return (
      <div className="sf-acctbar">
        <UserRound strokeWidth={1.75} aria-hidden="true" />
        <div>
          {linkedName
            ? <>เข้าสู่ระบบเป็น <strong>{linkedName}</strong> — เติมข้อมูลจากครั้งก่อนให้แล้ว</>
            : <>เข้าสู่ระบบแล้ว — สั่งซื้อครั้งนี้จะถูกเก็บเข้าประวัติของคุณ</>}
          {isStaff && (
            <div className="sf-hint">
              บัญชีนี้เป็นทีมงานของร้าน — ถ้ากำลังทดสอบ แนะนำให้เปิดหน้าต่างส่วนตัว
              จะได้เห็นหน้าร้านแบบเดียวกับลูกค้าจริง
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sf-acctbar">
      <UserRound strokeWidth={1.75} aria-hidden="true" />
      <div className="sf-acctbar-body">
        <span>เคยสั่งกับเราแล้ว? เข้าสู่ระบบเพื่อดึงที่อยู่เดิมมาใช้</span>
        <div className="sf-acctbar-btns">
          <button
            type="button"
            className="sf-btn-ghost"
            disabled={!!busy}
            onClick={async () => {
              setBusy('google');
              const r = await loginWithGoogle(undefined, returnTo);
              if (r.status === 'error') setBusy('');
            }}
          >
            {busy === 'google' ? 'กำลังเปิด Google…' : 'Google'}
          </button>
          {/* ปุ่ม LINE โผล่เฉพาะร้านที่ตั้ง LINE OA แล้ว — ร้านที่ไม่มี OA
              ล็อกอิน LINE ไปก็ส่งแจ้งเตือนไม่ได้ กลายเป็นปุ่มที่ให้ความคาดหวังผิด */}
          {lineOaName && (
            <button
              type="button"
              className="sf-btn-ghost"
              disabled={!!busy}
              onClick={async () => {
                setBusy('line');
                const r = await loginWithLINE(undefined, returnTo);
                if (r.status === 'error') setBusy('');
              }}
            >
              {busy === 'line' ? 'กำลังเปิด LINE…' : 'LINE'}
            </button>
          )}
        </div>
        <span className="sf-hint">ไม่เข้าสู่ระบบก็สั่งซื้อได้ตามปกติ</span>
      </div>
    </div>
  );
}
