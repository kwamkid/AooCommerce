'use client';

import { useState, useEffect, useCallback } from 'react';
import { GoogleMark, LineMark } from '@/components/storefront/BrandMarks';
import Link from 'next/link';
import { UserRound, LogOut, Bell, ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react';
import { loginWithGoogle, loginWithLINE } from '@/lib/auth/login-methods';
import { clearSession } from '@/lib/auth/session-manager';
import { supabase } from '@/lib/supabase';
import { formatStorePrice, storefrontHref } from '@/lib/storefront';
import type { StorefrontLineOa } from '@/lib/storefront-server';

interface CustomerProfile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  line_user_id: string | null;
  /** รูปที่ซิงก์มาจากบัญชี Google/LINE (lib/customer-avatar) */
  avatar_url: string | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  total_amount: number;
  created_at: string;
  delivery_date: string | null;
  delivery_slot_label: string | null;
  tracking_number: string | null;
  shipping_carrier: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  new: 'รับคำสั่งซื้อแล้ว',
  ready_to_ship: 'กำลังเตรียมของ',
  processing: 'กำลังจัดของ',
  shipping: 'จัดส่งแล้ว',
  completed: 'จัดส่งสำเร็จ',
  cancelled: 'ยกเลิก',
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: 'รอชำระเงิน',
  verifying: 'รอตรวจสอบสลิป',
  paid: 'ชำระแล้ว',
  cancelled: 'ยกเลิก',
};

interface Props {
  shop: string;
  shopName: string;
  /** ร้านเปิดปุ่มล็อกอิน LINE และกรอก channel ครบแล้วหรือยัง */
  lineLogin: boolean;
  lineChannelId: string;
  lineOa: StorefrontLineOa | null;
}

export default function AccountClient({ shop, shopName, lineLogin, lineChannelId, lineOa }: Props) {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [linking, setLinking] = useState(false);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/storefront/me?shop=${encodeURIComponent(shop)}`);
      if (!res.ok) return;
      const data = await res.json();
      setSignedIn(!!data.signed_in);
      setIsStaff(!!data.is_staff);
      setCustomer(data.customer);
      setOrders(data.orders || []);
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => { load(); }, [load]);

  const returnTo = storefrontHref(shop, '/account');

  const signInGoogle = async () => {
    setBusy('google');
    const r = await loginWithGoogle(undefined, returnTo);
    if (r.status === 'error') setBusy('');
  };

  const signInLine = async () => {
    setBusy('line');
    const r = await loginWithLINE(undefined, returnTo, { shopSlug: shop, channelId: lineChannelId });
    if (r.status === 'error') setBusy('');
  };

  // ผูกบัญชีเข้ากับร้านนี้ — ทำเมื่อผู้ใช้กดเองเท่านั้น ไม่ทำอัตโนมัติ
  // เพราะ session อาจเป็นของพนักงานที่ login ค้างไว้ ไม่ใช่ลูกค้าจริง
  const linkAccount = async () => {
    setLinking(true);
    try {
      const res = await fetch('/api/storefront/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      });
      if (res.ok) await load();
    } finally {
      setLinking(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearSession();
    setSignedIn(false); setIsStaff(false); setCustomer(null); setOrders([]);
  };

  if (loading) {
    return <div className="sf-container"><p className="sf-empty">กำลังโหลด…</p></div>;
  }

  // ── ยังไม่ได้เข้าสู่ระบบ ──
  if (!signedIn) {
    return (
      <div className="sf-container">
        <div className="sf-hero">
          <h1>บัญชีของฉัน</h1>
          <p>เข้าสู่ระบบเพื่อดูประวัติการสั่งซื้อ ติดตามสถานะจัดส่ง และรับแจ้งเตือนจาก {shopName}</p>
        </div>

        <div className="sf-auth-box">
          <button type="button" className="sf-auth-btn" onClick={signInGoogle} disabled={!!busy}>
            <GoogleMark size={20} />
            {busy === 'google' ? 'กำลังเปิด Google…' : 'เข้าสู่ระบบด้วย Google'}
          </button>

          {/* โผล่เฉพาะร้านที่เปิดใช้งานไว้เอง — มี OA ไม่ได้แปลว่าล็อกอิน LINE พร้อมใช้ */}
          {lineLogin && (
            <>
              <button type="button" className="sf-auth-btn sf-auth-line" onClick={signInLine} disabled={!!busy}>
                <LineMark size={20} />
                {busy === 'line' ? 'กำลังเปิด LINE…' : 'เข้าสู่ระบบด้วย LINE'}
              </button>
              {lineOa && (
                <p className="sf-hint">
                  ถ้าอยากรับข่าวสารจากร้าน กด <strong>เพิ่มเพื่อน {lineOa.name}</strong> ได้เลย
                </p>
              )}
            </>
          )}

          <p className="sf-hint" style={{ marginTop: 14 }}>
            ไม่เข้าสู่ระบบก็สั่งซื้อได้ตามปกติ —{' '}
            <Link href={storefrontHref(shop)} className="sf-footer-link">เลือกซื้อสินค้า</Link>
          </p>
        </div>
      </div>
    );
  }

  // ── login อยู่ แต่ยังไม่ได้ผูกบัญชีกับร้านนี้ ──
  if (!customer) {
    return (
      <div className="sf-container">
        <div className="sf-hero">
          <h1>บัญชีของฉัน</h1>
          <p>คุณเข้าสู่ระบบอยู่แล้ว แต่ยังไม่ได้ผูกบัญชีนี้กับ {shopName}</p>
        </div>

        {isStaff && (
          <div className="sf-warn">
            <AlertTriangle strokeWidth={1.75} aria-hidden="true" />
            <div>
              <strong>คุณกำลังใช้บัญชีพนักงานของร้านนี้</strong>
              <p className="sf-hint">
                ถ้ากำลังทดสอบมุมมองลูกค้า ให้ออกจากระบบก่อน หรือเปิดหน้าต่างไม่ระบุตัวตน
                (Incognito) — ถ้ากดผูกบัญชี ระบบจะสร้างข้อมูล &quot;ลูกค้า&quot; จากบัญชีพนักงานของคุณ
              </p>
            </div>
          </div>
        )}

        <div className="sf-auth-box">
          <button type="button" className="sf-cta" style={{ width: '100%' }}
            onClick={linkAccount} disabled={linking}>
            {linking ? 'กำลังผูกบัญชี…' : `ใช้บัญชีนี้สั่งซื้อกับ ${shopName}`}
          </button>
          <button type="button" className="sf-btn-ghost" style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
            onClick={signOut}>
            <LogOut strokeWidth={1.75} aria-hidden="true" /> ออกจากระบบ / ใช้บัญชีอื่น
          </button>
        </div>
      </div>
    );
  }

  // ── เข้าสู่ระบบแล้ว ──
  return (
    <div className="sf-container">
      {isStaff && (
        <div className="sf-warn">
          <AlertTriangle strokeWidth={1.75} aria-hidden="true" />
          <div>
            <strong>บัญชีนี้เป็นพนักงานของร้านนี้ด้วย</strong>
            <p className="sf-hint">กำลังดูในมุมมองลูกค้า — ออกจากระบบเพื่อทดสอบแบบผู้เยี่ยมชมทั่วไป</p>
          </div>
        </div>
      )}
      <div className="sf-hero">
        <h1>บัญชีของฉัน</h1>
        <p>ประวัติการสั่งซื้อกับ {shopName} — ดูได้จากทุกเครื่องที่เข้าสู่ระบบบัญชีนี้</p>
      </div>

      <div className="sf-account-head">
        <div className="sf-account-id">
          {customer?.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="sf-account-avatar" src={customer.avatar_url} alt="" aria-hidden="true" />
          ) : (
            <UserRound strokeWidth={1.6} aria-hidden="true" />
          )}
          <div>
            <div className="sf-cart-name">{customer?.name || 'ลูกค้า'}</div>
            <div className="sf-hint">{customer?.email || customer?.phone || ''}</div>
          </div>
        </div>
        <button type="button" className="sf-btn-ghost" onClick={signOut}>
          <LogOut strokeWidth={1.75} aria-hidden="true" /> ออกจากระบบ
        </button>
      </div>

      {/* ⚠️ ห้ามสัญญาว่าจะ push แจ้งเตือนออเดอร์อัตโนมัติ — LINE Login ของระบบ
          ใช้ channel กลางตัวเดียว userId ที่ได้จึงอยู่คนละ provider กับ OA ของร้าน
          ส่งเข้า OA ร้านไม่ได้ · สิ่งที่เพิ่มเพื่อนแล้วได้จริงคือคุยกับร้านได้ */}
      {lineOa && (
        <div className="sf-notice">
          <Bell strokeWidth={1.75} aria-hidden="true" />
          <div>
            <strong>คุยกับร้านทาง LINE</strong>
            <p className="sf-hint">
              เพิ่มเพื่อน {lineOa.name} ไว้ ถามเรื่องออเดอร์หรือสินค้าได้ตลอด
              และไม่พลาดข่าวสารจากร้าน
            </p>
          </div>
          <a href={lineOa.add_friend_url} target="_blank" rel="noopener noreferrer" className="sf-cta">
            เพิ่มเพื่อน <ExternalLink strokeWidth={2} aria-hidden="true" />
          </a>
        </div>
      )}

      <h2 className="sf-account-section">ประวัติการสั่งซื้อ</h2>
      {orders.length === 0 ? (
        <p className="sf-empty">ยังไม่มีคำสั่งซื้อในบัญชีนี้</p>
      ) : (
        <div className="sf-cart-list">
          {orders.map(o => (
            <Link key={o.id} href={storefrontHref(shop, `/order/${o.id}`)} className="sf-order-row">
              <div className="sf-cart-info">
                <span className="sf-cart-name">{o.order_number}</span>
                <div className="sf-cart-unit">
                  {new Date(o.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' · '}{STATUS_LABEL[o.order_status] || o.order_status}
                </div>
                {o.tracking_number && (
                  <div className="sf-cart-unit">
                    เลขพัสดุ {o.tracking_number}{o.shipping_carrier ? ` (${o.shipping_carrier})` : ''}
                  </div>
                )}
              </div>
              {/* ยอดเงินกับสถานะการจ่ายเป็นคนละเรื่อง — วางคนละบรรทัดชิดขวา
                  จะกวาดตาไล่ลงมาทีละคอลัมน์ได้ ไม่ต้องอ่านประโยคยาว ๆ ทั้งแถว */}
              <div className="sf-order-meta">
                <div className="sf-cart-total">{formatStorePrice(o.total_amount)}</div>
                <span className={`sf-pay-badge sf-pay-${o.payment_status}`}>
                  {PAYMENT_LABEL[o.payment_status] || o.payment_status}
                </span>
              </div>
              <ChevronRight strokeWidth={1.75} aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
