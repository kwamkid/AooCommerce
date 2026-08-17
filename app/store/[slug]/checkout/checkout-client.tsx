'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart, clearCart } from '@/lib/storefront-cart';
import { rememberOrder, rememberContact, readContact } from '@/lib/storefront-orders';
import { formatStorePrice, storefrontHref } from '@/lib/storefront';
import { searchAddress } from '@/lib/thai-address-data';

interface SlotOption {
  id: string;
  name: string;
  label: string;
  /** true = ช่วงถูกหั่นสั้นลงเพราะเวลาต้นรอบผ่านไปแล้ว */
  narrowed: boolean;
  full_label: string;
  available: boolean;
  reason: string | null;
}

interface DeliveryOptions {
  zone_required: boolean;
  slot_required: boolean;
  zone: {
    id: string; name: string; fee: number | null;
    needs_quote: boolean; free_applied: boolean;
    free_over: number | null; lead_minutes: number;
  } | null;
  slots: SlotOption[];
}

interface Props {
  shop: string;
  zoneEnabled: boolean;
  slotEnabled: boolean;
  dateEnabled: boolean;
}

/** วันนี้ในเขตเวลาไทย (ผู้ใช้ทุกคนอยู่ไทย) เป็น YYYY-MM-DD */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CheckoutClient({ shop, zoneEnabled, slotEnabled, dateEnabled }: Props) {
  const router = useRouter();
  const { lines, subtotal, hydrated } = useCart(shop);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [amphoe, setAmphoe] = useState('');
  const [province, setProvince] = useState('');
  const [postal, setPostal] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [slotId, setSlotId] = useState('');
  const [note, setNote] = useState('');

  // เติมข้อมูลผู้รับจากครั้งก่อน — ลูกค้าประจำไม่ต้องพิมพ์ที่อยู่ใหม่ทุกรอบ
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    const saved = readContact(shop);
    if (!saved) return;
    setName(saved.name); setPhone(saved.phone); setEmail(saved.email);
    setAddress(saved.address);
    setDistrict(saved.district); setAmphoe(saved.amphoe);
    setProvince(saved.province); setPostal(saved.postal_code);
    setAddressQuery(saved.address_label);
    setPrefilled(true);
  }, [shop]);

  const [options, setOptions] = useState<DeliveryOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ค้นหาตำบล/อำเภอ/จังหวัดจากคำเดียว — กรอกที่อยู่ไทยให้เร็วและถูกต้อง
  const addressSuggestions = useMemo(
    () => (addressQuery.trim().length >= 2 ? searchAddress(addressQuery.trim(), undefined, 8) : []),
    [addressQuery],
  );

  const hasArea = !!(province || postal);

  const fetchOptions = useCallback(async () => {
    if (!zoneEnabled && !slotEnabled) return;
    if (!hasArea) { setOptions(null); return; }
    setLoadingOptions(true);
    try {
      const qs = new URLSearchParams({ shop, subtotal: String(subtotal) });
      if (province) qs.set('province', province);
      if (amphoe) qs.set('amphoe', amphoe);
      if (postal) qs.set('postal_code', postal);
      if (deliveryDate) qs.set('date', deliveryDate);
      const res = await fetch(`/api/storefront/delivery-options?${qs}`);
      if (res.ok) setOptions(await res.json());
    } catch {
      // เงียบไว้ — ผู้ใช้ยังกรอกฟอร์มต่อได้ แล้ว server จะ validate ตอน submit อยู่ดี
    } finally {
      setLoadingOptions(false);
    }
  }, [shop, subtotal, province, amphoe, postal, deliveryDate, zoneEnabled, slotEnabled, hasArea]);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  // รอบที่เลือกไว้กลายเป็นไม่ว่าง (เปลี่ยนวัน/พื้นที่) → ล้างทิ้ง กันส่ง id ที่ใช้ไม่ได้
  useEffect(() => {
    if (!slotId || !options) return;
    const still = options.slots.find(s => s.id === slotId);
    if (!still?.available) setSlotId('');
  }, [options, slotId]);

  const shippingFee = options?.zone?.fee ?? 0;
  const needsQuote = options?.zone?.needs_quote ?? false;
  const outOfArea = !!options?.zone_required && hasArea && !options?.zone && !loadingOptions;
  const total = subtotal + shippingFee;

  const submit = async () => {
    setError('');
    if (lines.length === 0) { setError('ไม่มีสินค้าในตะกร้า'); return; }
    if (!name.trim()) { setError('กรุณากรอกชื่อผู้รับ'); return; }
    if (!/^[0-9+\-\s()]{8,20}$/.test(phone.trim())) { setError('กรุณากรอกเบอร์โทรให้ถูกต้อง'); return; }
    if (!address.trim()) { setError('กรุณากรอกที่อยู่จัดส่ง'); return; }
    if (outOfArea) { setError('ที่อยู่นี้อยู่นอกพื้นที่จัดส่งของร้าน'); return; }
    if (slotEnabled && dateEnabled && !deliveryDate) { setError('กรุณาเลือกวันที่จัดส่ง'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/storefront/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop,
          items: lines.map(l => ({ variation_id: l.variation_id, quantity: l.quantity })),
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          district, amphoe, province, postal_code: postal,
          delivery_date: deliveryDate || undefined,
          delivery_slot_id: slotId || undefined,
          note: note.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'สั่งซื้อไม่สำเร็จ');
        // ราคา/สต็อก/รอบเปลี่ยนระหว่างกรอกฟอร์ม → refresh ตัวเลือกให้ตรงความจริง
        if (res.status === 409) fetchOptions();
        return;
      }
      rememberContact(shop, {
        name: name.trim(), phone: phone.trim(), email: email.trim(),
        address: address.trim(), district, amphoe, province,
        postal_code: postal, address_label: addressQuery,
      });
      rememberOrder(shop, {
        id: data.order_id,
        order_number: data.order_number,
        total: data.total,
        created_at: new Date().toISOString(),
      });
      clearCart(shop);
      // จบในร้านเดียวกัน — ไม่เด้งออกไปหน้าบิลที่เป็นคนละดีไซน์
      router.push(storefrontHref(shop, `/order/${data.order_id}`));
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  if (!hydrated) {
    return <div className="sf-container"><p className="sf-empty">กำลังโหลด…</p></div>;
  }

  if (lines.length === 0) {
    return (
      <div className="sf-container">
        <div className="sf-hero"><h1>ชำระเงิน</h1></div>
        <p className="sf-empty">ยังไม่มีสินค้าในตะกร้า</p>
        <p style={{ textAlign: 'center' }}>
          <Link href={storefrontHref(shop)} className="sf-cta">เลือกซื้อสินค้า</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="sf-container">
      <div className="sf-hero"><h1>ชำระเงิน</h1></div>

      <div className="sf-checkout">
        <div className="sf-checkout-form">
          <section className="sf-fieldset">
            <h2>ผู้รับ</h2>
            {prefilled && (
              <p className="sf-hint" style={{ marginBottom: 10 }}>
                เติมข้อมูลจากครั้งก่อนให้แล้ว — แก้ไขได้ตามต้องการ
              </p>
            )}
            <label className="sf-label">ชื่อผู้รับ *
              <input className="sf-input" value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อ-นามสกุล" />
            </label>
            <div className="sf-field-row">
              <label className="sf-label">เบอร์โทร *
                <input className="sf-input" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="08xxxxxxxx" />
              </label>
              <label className="sf-label">อีเมล
                <input className="sf-input" value={email} onChange={e => setEmail(e.target.value)} inputMode="email" placeholder="ไม่บังคับ" />
              </label>
            </div>
          </section>

          <section className="sf-fieldset">
            <h2>ที่อยู่จัดส่ง</h2>
            <label className="sf-label">บ้านเลขที่ / อาคาร / ถนน *
              <input className="sf-input" value={address} onChange={e => setAddress(e.target.value)} placeholder="เช่น 123/45 ซอยสุขุมวิท 21" />
            </label>

            <label className="sf-label">ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์ *
              <input
                className="sf-input"
                value={addressQuery}
                onChange={e => setAddressQuery(e.target.value)}
                placeholder="พิมพ์ชื่อแขวง เขต หรือรหัสไปรษณีย์"
              />
            </label>
            {addressSuggestions.length > 0 && (
              <ul className="sf-suggest">
                {addressSuggestions.map((a, i) => (
                  <li key={`${a.district}-${a.amphoe}-${a.zipcode}-${i}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setDistrict(a.district); setAmphoe(a.amphoe);
                        setProvince(a.province); setPostal(String(a.zipcode));
                        setAddressQuery(`${a.district} · ${a.amphoe} · ${a.province} ${a.zipcode}`);
                      }}
                    >
                      {a.district} · {a.amphoe} · {a.province} {a.zipcode}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {province && (
              <p className="sf-hint">เลือกแล้ว: {district} · {amphoe} · {province} {postal}</p>
            )}
          </section>

          {(dateEnabled || slotEnabled) && (
            <section className="sf-fieldset">
              <h2>วันและเวลาจัดส่ง</h2>
              {dateEnabled && (
                <label className="sf-label">วันที่จัดส่ง{slotEnabled ? ' *' : ''}
                  <input
                    type="date"
                    className="sf-input"
                    value={deliveryDate}
                    min={todayISO()}
                    onChange={e => setDeliveryDate(e.target.value)}
                  />
                </label>
              )}

              {slotEnabled && (
                <>
                  <div className="sf-label" style={{ marginBottom: 6 }}>ช่วงเวลาจัดส่ง</div>
                  {!deliveryDate ? (
                    <p className="sf-hint">เลือกวันที่ก่อน แล้วจะแสดงรอบที่ว่าง</p>
                  ) : !options ? (
                    <p className="sf-hint">{hasArea ? 'กำลังตรวจสอบรอบที่ว่าง…' : 'กรอกพื้นที่จัดส่งก่อน'}</p>
                  ) : options.slots.length === 0 ? (
                    <p className="sf-hint">ยังไม่มีรอบจัดส่ง</p>
                  ) : (
                    <div className="sf-variations">
                      {options.slots.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          disabled={!s.available}
                          onClick={() => setSlotId(s.id === slotId ? '' : s.id)}
                          className={`sf-variation ${!s.available ? 'sf-variation-oos' : ''} ${s.id === slotId ? 'sf-variation-active' : ''}`}
                        >
                          {s.name} · {s.label}
                          {s.reason && <span> ({s.reason})</span>}
                          {s.narrowed && <span className="sf-slot-note">รอบ {s.full_label}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          <section className="sf-fieldset">
            <h2>ข้อความถึงร้าน</h2>
            <label className="sf-label">หมายเหตุ / ข้อความบนการ์ด
              <textarea className="sf-input" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="ไม่บังคับ" />
            </label>
          </section>
        </div>

        <aside className="sf-summary">
          <h2>สรุปคำสั่งซื้อ</h2>
          {lines.map(l => (
            <div key={l.variation_id} className="sf-summary-row">
              <span>{l.name}{l.variation_label ? ` (${l.variation_label})` : ''} × {l.quantity}</span>
              <span>{formatStorePrice(l.price * l.quantity)}</span>
            </div>
          ))}

          <div className="sf-summary-row sf-summary-sep">
            <span>ยอดรวมสินค้า</span><span>{formatStorePrice(subtotal)}</span>
          </div>

          {zoneEnabled && (
            <div className="sf-summary-row">
              <span>ค่าจัดส่ง{options?.zone ? ` (${options.zone.name})` : ''}</span>
              <span>
                {!hasArea ? 'กรอกที่อยู่ก่อน'
                  : loadingOptions ? 'กำลังคำนวณ…'
                  : outOfArea ? '—'
                  : needsQuote ? 'ร้านแจ้งยอดภายหลัง'
                  : options?.zone?.free_applied ? 'ส่งฟรี'
                  : formatStorePrice(shippingFee)}
              </span>
            </div>
          )}

          <div className="sf-summary-row sf-summary-total">
            <span>รวมทั้งสิ้น</span><span>{formatStorePrice(total)}</span>
          </div>

          {options?.zone?.free_over != null && !options.zone.free_applied && !needsQuote && (
            <p className="sf-hint">
              สั่งเพิ่มอีก {formatStorePrice(Math.max(0, Number(options.zone.free_over) - subtotal))} รับส่งฟรี
            </p>
          )}
          {needsQuote && (
            <p className="sf-hint">พื้นที่นี้คิดค่าจัดส่งตามระยะทางจริง ร้านจะติดต่อแจ้งยอดก่อนจัดส่ง</p>
          )}
          {outOfArea && (
            <p className="sf-error">ขออภัย ที่อยู่นี้อยู่นอกพื้นที่จัดส่งของร้าน</p>
          )}
          {error && <p className="sf-error">{error}</p>}

          <button
            type="button"
            className="sf-cta"
            style={{ width: '100%', marginTop: 12 }}
            disabled={submitting || outOfArea}
            onClick={submit}
          >
            {submitting ? 'กำลังสั่งซื้อ…' : 'ยืนยันคำสั่งซื้อ'}
          </button>
          <p className="sf-hint" style={{ textAlign: 'center' }}>
            กดยืนยันแล้วจะไปยังหน้าบิลเพื่อชำระเงิน
          </p>
        </aside>
      </div>
    </div>
  );
}
