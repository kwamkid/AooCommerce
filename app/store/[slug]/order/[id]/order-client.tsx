'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2, Copy, Check, Upload, CreditCard, Clock } from 'lucide-react';
import { formatStorePrice, storefrontHref } from '@/lib/storefront';
import { rememberOrder } from '@/lib/storefront-orders';

export interface StoreOrder {
  id: string;
  company_id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  subtotal: number;
  vat_amount: number;
  shipping_fee: number;
  total_amount: number;
  vat_registered: boolean;
  created_at: string;
  notes?: string | null;
  delivery_name?: string | null;
  delivery_phone?: string | null;
  delivery_address?: string | null;
  delivery_district?: string | null;
  delivery_amphoe?: string | null;
  delivery_province?: string | null;
  delivery_postal_code?: string | null;
  delivery_date?: string | null;
  delivery_zone_label?: string | null;
  delivery_slot_label?: string | null;
  is_cancelled?: boolean;
  is_expired?: boolean;
  items: Array<{
    product_name: string;
    variation_label?: string | null;
    quantity: number;
    unit_price: number;
    total: number;
    image?: string | null;
  }>;
  payment_channels: Array<{
    type: string;
    name: string;
    config?: { bank_code?: string; account_number?: string; account_name?: string; promptpay_id?: string; description?: string };
    available_channels?: Array<{ code: string; fee_payer: string }>;
  }>;
  payment_record?: { status: string; slip_image_url?: string | null } | null;
}

const STATUS_LABEL: Record<string, string> = {
  new: 'รับคำสั่งซื้อแล้ว',
  ready_to_ship: 'กำลังเตรียมของ',
  processing: 'กำลังจัดของ',
  shipping: 'กำลังจัดส่ง',
  completed: 'จัดส่งสำเร็จ',
  cancelled: 'ยกเลิกแล้ว',
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: 'รอชำระเงิน',
  verifying: 'รอร้านตรวจสอบสลิป',
  paid: 'ชำระเงินแล้ว',
  cancelled: 'ยกเลิก',
};

export default function OrderClient({ shop, initialOrder }: { shop: string; initialOrder: StoreOrder }) {
  const [order, setOrder] = useState(initialOrder);
  const [copied, setCopied] = useState('');
  const [slip, setSlip] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // จำไว้ว่าเครื่องนี้เคยสั่งออเดอร์นี้ → กลับมาดูได้ที่ "คำสั่งซื้อของฉัน"
  useEffect(() => {
    rememberOrder(shop, {
      id: order.id,
      order_number: order.order_number,
      total: order.total_amount,
      created_at: order.created_at,
    });
  }, [shop, order.id, order.order_number, order.total_amount, order.created_at]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1600);
    } catch { /* clipboard ถูกบล็อก — ลูกค้ายังพิมพ์เองได้ */ }
  };

  const refresh = async () => {
    try {
      const res = await fetch(`/api/bills?id=${order.id}`);
      if (res.ok) setOrder((await res.json()).bill);
    } catch { /* ignore */ }
  };

  const notifyPayment = async () => {
    if (!slip) { setError('กรุณาแนบสลิปการโอน'); return; }
    setError(''); setMessage(''); setSending(true);
    try {
      const fd = new FormData();
      fd.append('order_id', order.id);
      fd.append('payment_method', 'transfer');
      fd.append('slip_image', slip);
      const res = await fetch('/api/bills', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'แจ้งชำระเงินไม่สำเร็จ'); return; }
      setMessage('แจ้งชำระเงินเรียบร้อย ร้านกำลังตรวจสอบสลิป');
      setSlip(null);
      await refresh();
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSending(false);
    }
  };

  const payByGateway = async () => {
    setError(''); setGatewayLoading(true);
    try {
      const res = await fetch('/api/beam/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.payment_url) {
        setError(data.error || 'สร้างลิงก์ชำระเงินไม่สำเร็จ');
        return;
      }
      window.location.href = data.payment_url;
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setGatewayLoading(false);
    }
  };

  const address = [
    order.delivery_address, order.delivery_district, order.delivery_amphoe,
    order.delivery_province, order.delivery_postal_code,
  ].filter(Boolean).join(' ');

  const unpaid = order.payment_status === 'pending' && !order.is_cancelled;
  const transferChannels = order.payment_channels?.filter(c => c.type === 'bank_transfer') || [];
  const gateway = order.payment_channels?.find(c => c.type === 'payment_gateway');

  return (
    <div className="sf-container">
      <div className="sf-order-head">
        <CheckCircle2 className="sf-order-check" strokeWidth={1.6} aria-hidden="true" />
        <div>
          <h1>ขอบคุณสำหรับคำสั่งซื้อ</h1>
          <p>
            เลขที่ <strong>{order.order_number}</strong> ·{' '}
            {STATUS_LABEL[order.order_status] || order.order_status} ·{' '}
            <span className={order.payment_status === 'paid' ? 'sf-paid' : 'sf-unpaid'}>
              {PAYMENT_LABEL[order.payment_status] || order.payment_status}
            </span>
          </p>
        </div>
      </div>

      <div className="sf-checkout">
        <div className="sf-checkout-form">
          {/* ── ชำระเงิน ── */}
          {unpaid && (
            <section className="sf-fieldset">
              <h2>ชำระเงิน {formatStorePrice(order.total_amount)}</h2>

              {gateway && (gateway.available_channels?.length ?? 0) > 0 && (
                <button type="button" className="sf-cta" style={{ width: '100%', marginBottom: 16 }}
                  onClick={payByGateway} disabled={gatewayLoading}>
                  <CreditCard strokeWidth={2} aria-hidden="true" />
                  {gatewayLoading ? 'กำลังเปิดหน้าชำระเงิน…' : 'ชำระผ่านบัตร / QR / e-Wallet'}
                </button>
              )}

              {transferChannels.length > 0 && (
                <>
                  <p className="sf-hint" style={{ marginBottom: 10 }}>หรือโอนเข้าบัญชีร้าน แล้วแนบสลิป</p>
                  {transferChannels.map((ch, i) => (
                    <div key={i} className="sf-bank">
                      <div>
                        <div className="sf-bank-name">{ch.name}</div>
                        {ch.config?.account_name && <div className="sf-hint">{ch.config.account_name}</div>}
                      </div>
                      {(ch.config?.account_number || ch.config?.promptpay_id) && (
                        <button type="button" className="sf-copy"
                          onClick={() => copy((ch.config?.account_number || ch.config?.promptpay_id)!, `b${i}`)}>
                          <span className="sf-bank-no">{ch.config?.account_number || ch.config?.promptpay_id}</span>
                          {copied === `b${i}`
                            ? <Check strokeWidth={2} aria-hidden="true" />
                            : <Copy strokeWidth={1.75} aria-hidden="true" />}
                        </button>
                      )}
                    </div>
                  ))}

                  <label className="sf-label" style={{ marginTop: 14 }}>แนบสลิปการโอน
                    <input type="file" accept="image/*" className="sf-input"
                      onChange={e => { setSlip(e.target.files?.[0] || null); setError(''); }} />
                  </label>
                  <button type="button" className="sf-cta" style={{ width: '100%' }}
                    onClick={notifyPayment} disabled={sending || !slip}>
                    <Upload strokeWidth={2} aria-hidden="true" />
                    {sending ? 'กำลังส่ง…' : 'แจ้งชำระเงิน'}
                  </button>
                </>
              )}

              {transferChannels.length === 0 && !gateway && (
                <p className="sf-hint">ร้านจะติดต่อกลับเพื่อแจ้งวิธีชำระเงิน</p>
              )}

              {error && <p className="sf-error">{error}</p>}
              {message && <p className="sf-ok">{message}</p>}
            </section>
          )}

          {order.payment_status === 'verifying' && (
            <section className="sf-fieldset">
              <h2><Clock strokeWidth={1.75} aria-hidden="true" /> รอร้านตรวจสอบสลิป</h2>
              <p className="sf-hint">ร้านได้รับสลิปแล้ว จะยืนยันให้เร็วที่สุด</p>
            </section>
          )}

          {order.payment_status === 'paid' && (
            <section className="sf-fieldset sf-paid-box">
              <h2><CheckCircle2 strokeWidth={1.75} aria-hidden="true" /> ชำระเงินเรียบร้อย</h2>
              <p className="sf-hint">ร้านกำลังเตรียมของให้คุณ</p>
            </section>
          )}

          {/* ── ข้อมูลจัดส่ง ── */}
          <section className="sf-fieldset">
            <h2>จัดส่งถึง</h2>
            <div className="sf-facts">
              {order.delivery_name && <p><strong>{order.delivery_name}</strong>{order.delivery_phone ? ` · ${order.delivery_phone}` : ''}</p>}
              {address && <p>{address}</p>}
              {(order.delivery_date || order.delivery_slot_label) && (
                <p>
                  {order.delivery_date && new Date(order.delivery_date + 'T00:00:00')
                    .toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {order.delivery_slot_label ? ` · ${order.delivery_slot_label}` : ''}
                </p>
              )}
              {order.delivery_zone_label && <p className="sf-hint">พื้นที่: {order.delivery_zone_label}</p>}
              {order.notes && <p className="sf-hint">หมายเหตุ: {order.notes}</p>}
            </div>
          </section>
        </div>

        {/* ── สรุปรายการ ── */}
        <aside className="sf-summary">
          <h2>รายการสินค้า</h2>
          {order.items?.map((it, i) => (
            <div key={i} className="sf-summary-row">
              <span>{it.product_name}{it.variation_label ? ` (${it.variation_label})` : ''} × {it.quantity}</span>
              <span>{formatStorePrice(it.total)}</span>
            </div>
          ))}
          <div className="sf-summary-row sf-summary-sep">
            <span>ยอดรวมสินค้า</span>
            <span>{formatStorePrice(order.total_amount - order.shipping_fee)}</span>
          </div>
          {order.shipping_fee > 0 && (
            <div className="sf-summary-row"><span>ค่าจัดส่ง</span><span>{formatStorePrice(order.shipping_fee)}</span></div>
          )}
          {order.vat_registered && order.vat_amount > 0 && (
            <div className="sf-summary-row"><span className="sf-hint">รวม VAT 7%</span><span className="sf-hint">{formatStorePrice(order.vat_amount)}</span></div>
          )}
          <div className="sf-summary-row sf-summary-total">
            <span>รวมทั้งสิ้น</span><span>{formatStorePrice(order.total_amount)}</span>
          </div>

          <div className="sf-order-actions">
            <Link href={storefrontHref(shop)} className="sf-btn-ghost">เลือกซื้อต่อ</Link>
            <Link href={storefrontHref(shop, '/orders')} className="sf-btn-ghost">คำสั่งซื้อของฉัน</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
