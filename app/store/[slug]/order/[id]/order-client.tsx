'use client';

import { useState, useEffect } from 'react';
import OrderProgress from '@/components/ui/OrderProgress';
import { getOrderHeadline } from '@/lib/order-progress';
import Link from 'next/link';
import { CheckCircle2, Copy, Check, Upload, CreditCard, Clock, Store, ReceiptText, Gift, EyeOff, FileText } from 'lucide-react';
import { formatStorePrice, storefrontHref } from '@/lib/storefront';
import { rememberOrder } from '@/lib/storefront-orders';
import SlipDropzone from '@/components/storefront/SlipDropzone';
import { THAI_BANKS } from '@/lib/constants/banks';

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
  /** /api/bills คืน order_date — ไม่มี created_at (เคยทำ "Invalid Date" ในหน้าคำสั่งซื้อของฉัน) */
  order_date?: string | null;
  created_at?: string;
  notes?: string | null;
  gift_card_requested?: boolean | null;
  gift_message?: string | null;
  gift_to?: string | null;
  gift_from?: string | null;
  gift_hide_price?: boolean | null;
  gift_card_fee?: number | null;
  tax_invoice_requested?: boolean | null;
  tax_invoice_name?: string | null;
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

/** โลโก้ธนาคารจากรายการกลาง — ไม่มี bank_code (พร้อมเพย์/เงินสด) ก็ไม่ต้องมีโลโก้ */
function bankLogo(code?: string | null): string | null {
  if (!code) return null;
  return THAI_BANKS.find(b => b.code === code)?.logo || null;
}

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
      created_at: order.order_date || order.created_at || new Date().toISOString(),
    });
  }, [shop, order.id, order.order_number, order.total_amount, order.order_date, order.created_at]);

  const verifying = order.payment_status === 'verifying';
  const headline = getOrderHeadline(order);

  const hasExtras = !!(order.gift_card_requested || order.gift_message || order.gift_hide_price || order.tax_invoice_requested);

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
      {/* สั่งซื้อจบไปแล้ว — แถบที่ลูกค้าอยากเห็นตรงนี้คือ "ออเดอร์ถึงไหนแล้ว"
          ไม่ใช่ ตะกร้า→ที่อยู่→ชำระเงิน ที่เดินผ่านมาหมดแล้ว */}
      <div className="sf-order-progress">
        <OrderProgress order={order} accent="var(--sf-primary)" />
      </div>
      <div className="sf-order-head">
        <CheckCircle2 className="sf-order-check" strokeWidth={1.6} aria-hidden="true" />
        <div>
          <h1>{verifying ? 'ได้รับสลิปแล้ว ขอบคุณครับ' : 'ขอบคุณสำหรับคำสั่งซื้อ'}</h1>
          <p>
            {/* สถานะเดียวจากตัวเดียวกับหน้าบัญชี/บิลออนไลน์ (lib/order-progress)
                เดิมพ่นทั้ง order_status และ payment_status ซึ่งขัดกันเองได้ */}
            เลขที่ <strong>{order.order_number}</strong> ·{' '}
            <span className={`sf-status-badge sf-status-${headline.tone}`}>{headline.label}</span>
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

                  {/* จอกว้างวางบัญชีคู่กับยอด — ลูกค้าคัดลอกเลขบัญชีแล้วคัดลอกยอดต่อได้เลย
                      โดยไม่ต้องเลื่อนจอ (จอแคบเรียงลงมาตามปกติ) */}
                  <div className="sf-pay-grid">
                    {transferChannels.map((ch, i) => {
                      const number = ch.config?.account_number || ch.config?.promptpay_id;
                      const logo = bankLogo(ch.config?.bank_code);
                      return (
                        <div key={i} className="sf-paycard">
                          <div className="sf-paycard-head">
                            {logo && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img className="sf-paycard-logo" src={logo} alt="" aria-hidden="true" />
                            )}
                            <div className="sf-paycard-heading">
                              <span className="sf-paycard-label">โอนเข้าบัญชี</span>
                              <strong className="sf-paycard-title">{ch.name}</strong>
                              {ch.config?.account_name && (
                                <span className="sf-paycard-sub">{ch.config.account_name}</span>
                              )}
                            </div>
                          </div>
                          {number && (
                            <button
                              type="button"
                              className={`sf-copybtn${copied === `b${i}` ? ' sf-copybtn-done' : ''}`}
                              onClick={() => copy(number, `b${i}`)}
                              aria-label={`คัดลอกเลขบัญชี ${number}`}
                            >
                              <span className="sf-copybtn-value">{number}</span>
                              <span className="sf-copybtn-action">
                                {copied === `b${i}`
                                  ? <><Check strokeWidth={2.25} aria-hidden="true" />คัดลอกแล้ว</>
                                  : <><Copy strokeWidth={1.75} aria-hidden="true" />คัดลอก</>}
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* ยอดเงินต้องคัดลอกได้เหมือนเลขบัญชี — ลูกค้าพิมพ์ยอดเองผิดคือสาเหตุต้น ๆ
                        ที่สลิปไม่ตรงบิล แล้วร้านต้องมาตามแก้ทีหลัง */}
                    <div className="sf-paycard sf-paycard-amount">
                      <div className="sf-paycard-head">
                        <div className="sf-paycard-heading">
                          <span className="sf-paycard-label">ยอดที่ต้องโอน</span>
                          <strong className="sf-paycard-total">{formatStorePrice(order.total_amount)}</strong>
                          <span className="sf-paycard-sub">โอนให้ตรงยอด ร้านจะตรวจสลิปได้เร็วขึ้น</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`sf-copybtn${copied === 'amount' ? ' sf-copybtn-done' : ''}`}
                        onClick={() => copy(order.total_amount.toFixed(2), 'amount')}
                        aria-label={`คัดลอกยอดเงิน ${order.total_amount.toFixed(2)} บาท`}
                      >
                        <span className="sf-copybtn-value">{order.total_amount.toFixed(2)}</span>
                        <span className="sf-copybtn-action">
                          {copied === 'amount'
                            ? <><Check strokeWidth={2.25} aria-hidden="true" />คัดลอกแล้ว</>
                            : <><Copy strokeWidth={1.75} aria-hidden="true" />คัดลอก</>}
                        </span>
                      </button>
                    </div>
                  </div>

                  <label className="sf-label" style={{ marginTop: 14 }}>แนบสลิปการโอน</label>
                  <SlipDropzone
                    value={slip}
                    onChange={f => { setSlip(f); setError(''); }}
                    disabled={sending}
                  />
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

          {/* ── ตัวเลือกเสริมที่เลือกไว้ ──
              ลูกค้าต้องได้เห็นสิ่งที่ตัวเองเลือกอีกครั้งหลังสั่ง โดยเฉพาะข้อความการ์ด
              (สะกดผิดแล้วรู้ตอนนี้ยังทัน) และการซ่อนราคา (ถ้าพลาดคือของขวัญพัง) */}
          {hasExtras && (
            <section className="sf-fieldset">
              <h2>ตัวเลือกที่เลือกไว้</h2>
              <div className="sf-facts">
                {(order.gift_card_requested || order.gift_message) && (
                  <div className="sf-extra">
                    <div className="sf-extra-head">
                      <span className="sf-extra-icon sf-extra-gift"><Gift strokeWidth={1.75} aria-hidden="true" /></span>
                      <strong>การ์ดอวยพร</strong>
                    </div>
                    {order.gift_message
                      ? <p className="sf-card-msg">{order.gift_message}</p>
                      : <p className="sf-hint">แนบการ์ดไปกับของ (ไม่ได้เขียนข้อความ)</p>}
                    {(order.gift_to || order.gift_from) && (
                      <p className="sf-hint">
                        {order.gift_to ? `ถึง: ${order.gift_to}` : ''}
                        {order.gift_to && order.gift_from ? ' · ' : ''}
                        {order.gift_from ? `จาก: ${order.gift_from}` : ''}
                      </p>
                    )}
                  </div>
                )}
                {order.gift_hide_price && (
                  <div className="sf-extra">
                    <div className="sf-extra-head">
                      <span className="sf-extra-icon sf-extra-hide"><EyeOff strokeWidth={1.75} aria-hidden="true" /></span>
                      <strong>ไม่แนบใบเสร็จและราคาไปกับของ</strong>
                    </div>
                    <p className="sf-hint">ใบเสร็จส่งให้ผู้สั่งแทน</p>
                  </div>
                )}
                {order.tax_invoice_requested && (
                  <div className="sf-extra">
                    <div className="sf-extra-head">
                      <span className="sf-extra-icon sf-extra-tax"><FileText strokeWidth={1.75} aria-hidden="true" /></span>
                      <strong>ใบกำกับภาษีเต็มรูปแบบ</strong>
                    </div>
                    <p className="sf-hint">
                      {order.tax_invoice_name ? `ออกในนาม ${order.tax_invoice_name}` : 'ร้านจะออกให้ตามข้อมูลที่กรอกไว้'}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}
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
            {/* ช้อปต่อเป็นปุ่มหลัก (อยากให้ลูกค้าซื้อต่อ) — ห้ามใช้ลูกศรซ้าย
                มันอ่านเป็นปุ่ม "ย้อนกลับ" ไม่ใช่ "ไปดูสินค้าอีก" */}
            <Link href={storefrontHref(shop)} className="sf-cta">
              <Store strokeWidth={2} aria-hidden="true" />ช้อปต่อ
            </Link>
            <Link href={storefrontHref(shop, '/orders')} className="sf-btn-ghost sf-btn-tint">
              <ReceiptText strokeWidth={1.75} aria-hidden="true" />คำสั่งซื้อของฉัน
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
