'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Copy } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart, clearCart } from '@/lib/storefront-cart';
import { supabase } from '@/lib/supabase';
import { rememberOrder, rememberContact, readContact } from '@/lib/storefront-orders';
import { formatStorePrice, storefrontHref } from '@/lib/storefront';
import CheckoutSteps from '@/components/storefront/CheckoutSteps';
import CheckoutAccountBar from '@/components/storefront/CheckoutAccountBar';
import DateRangePicker from '@/components/ui/DateRangePicker';
import FormSelect from '@/components/ui/FormSelect';
import { searchAddress } from '@/lib/thai-address-data';
import { parseThaiAddress } from '@/lib/address-parser';

interface SlotOption {
  id: string;
  name: string;
  label: string;
  /** true = ช่วงถูกหั่นสั้นลงเพราะเวลาต้นรอบผ่านไปแล้ว */
  narrowed: boolean;
  /** "HH:MM" — ใช้หารอบที่เริ่มไวที่สุด (ลิสต์เรียงตาม sort_order ไม่ใช่เวลา) */
  start_time: string;
  full_label: string;
  available: boolean;
  reason: string | null;
}

interface DeliveryOptions {
  /** วันในสัปดาห์ที่ร้านมีรอบส่ง (0=อาทิตย์ … 6=เสาร์) */
  available_weekdays?: number[];
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
  giftCard: boolean;
  giftCardFee: number;
  lineLogin: boolean;
  lineChannelId: string;
}

/** ข้อมูลลูกค้าที่ผูกกับบัญชีที่ล็อกอินอยู่ (จาก /api/storefront/me) */
interface LinkedCustomer {
  name: string | null;
  avatar_url: string | null;
  phone: string | null;
  email: string | null;
  billing_address: string | null;
  billing_district: string | null;
  billing_amphoe: string | null;
  billing_province: string | null;
  billing_postal_code: string | null;
}

/** วันนี้ในเขตเวลาไทย (ผู้ใช้ทุกคนอยู่ไทย) เป็น YYYY-MM-DD */
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CheckoutClient({ shop, zoneEnabled, slotEnabled, dateEnabled, giftCard, giftCardFee, lineLogin, lineChannelId }: Props) {
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
  // ส่งให้คนอื่น — ผู้รับคนละคนกับผู้สั่ง
  const [shipToOther, setShipToOther] = useState(false);
  const [rcpName, setRcpName] = useState('');
  const [rcpPhone, setRcpPhone] = useState('');
  const [mapsLink, setMapsLink] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [giftTo, setGiftTo] = useState('');
  const [giftFrom, setGiftFrom] = useState('');
  const [wantCard, setWantCard] = useState(false);
  const [giftHidePrice, setGiftHidePrice] = useState(true);
  const [taxInvoice, setTaxInvoice] = useState(false);
  const [taxName, setTaxName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [taxBranch, setTaxBranch] = useState('');
  const [taxAddress, setTaxAddress] = useState('');
  const rcpNameRef = useRef<HTMLInputElement>(null);
  const taxNameRef = useRef<HTMLInputElement>(null);
  const taxIdRef = useRef<HTMLInputElement>(null);
  const taxAddrRef = useRef<HTMLTextAreaElement>(null);

  // เติมข้อมูลผู้รับจากครั้งก่อน — ลูกค้าประจำไม่ต้องพิมพ์ที่อยู่ใหม่ทุกรอบ
  const [prefilled, setPrefilled] = useState(false);
  const [account, setAccount] = useState<{ signedIn: boolean; isStaff: boolean; customer: LinkedCustomer | null }>(
    { signedIn: false, isStaff: false, customer: null },
  );

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

  // ที่อยู่จากบัญชี — ใช้เมื่อเครื่องนี้ยังไม่มีข้อมูลค้างไว้ (เปลี่ยนเครื่อง/ล้างเบราว์เซอร์)
  // ของใน localStorage คือสิ่งที่ลูกค้าพิมพ์ล่าสุดบนเครื่องนี้ จึงใหม่กว่าเสมอ ห้ามทับ
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/storefront/me?shop=${encodeURIComponent(shop)}`);
        if (!res.ok) return;
        const d = await res.json();
        if (!alive) return;
        setAccount({ signedIn: !!d.signed_in, isStaff: !!d.is_staff, customer: d.customer || null });

        if (readContact(shop)) return;
        const c: LinkedCustomer | null = d.customer;
        if (c) {
          if (c.name) setName(c.name);
          if (c.phone) setPhone(c.phone);
          if (c.email) setEmail(c.email);
          if (c.billing_address) setAddress(c.billing_address);
          if (c.billing_district) setDistrict(c.billing_district);
          if (c.billing_amphoe) setAmphoe(c.billing_amphoe);
          if (c.billing_province) setProvince(c.billing_province);
          if (c.billing_postal_code) setPostal(c.billing_postal_code);
          const label = [c.billing_district, c.billing_amphoe, c.billing_province, c.billing_postal_code]
            .filter(Boolean).join(' ');
          if (label) setAddressQuery(label);
          if (c.billing_address || c.name) setPrefilled(true);
        }
        // login ครั้งแรกยังไม่มีแถวลูกค้าในร้านนี้ (แถวถูกสร้างตอนสั่งซื้อ/เข้าหน้าบัญชี)
        // — ชื่อกับอีเมลมีอยู่แล้วใน session ที่ login มา อย่าให้พิมพ์ซ้ำ
        if (!d.signed_in || (c?.name && c?.email)) return;
        const { data: sess } = await supabase.auth.getSession();
        const u = sess.session?.user;
        if (!alive || !u) return;
        const m = (u.user_metadata || {}) as Record<string, string>;
        const sessionName = m.full_name || m.name || m.display_name || '';
        if (!c?.name && sessionName) setName(sessionName);
        if (!c?.email && u.email) setEmail(u.email);
      } catch {
        // ล็อกอินไม่ได้/เน็ตหลุด ก็แค่กรอกเองตามปกติ ไม่ควรบล็อกการสั่งซื้อ
      }
    })();
    return () => { alive = false; };
  }, [shop]);

  // ปุ่มยืนยันอยู่ในกล่องสรุป ซึ่งอยู่คนละที่กับช่องที่กรอกผิด — ข้อความเตือน
  // อย่างเดียวไม่พอ ต้องพาไปที่ช่องนั้นให้ด้วย ไม่งั้นต้องไล่หาเองว่าช่องไหน
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const focusField = (ref: React.RefObject<HTMLInputElement | null>) => {
    ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    ref.current?.focus({ preventScroll: true });
  };

  // ใบกำกับภาษีส่วนใหญ่ออกในนามผู้สั่งและใช้ที่อยู่เดียวกับที่กรอกไว้ข้างบน
  // — เติมให้แล้วพาไปที่ช่องที่ยังว่าง ไม่ต้องพิมพ์ซ้ำทั้งชุด
  const fillTaxFromBuyer = () => {
    if (!taxName.trim()) setTaxName(name.trim());
    if (!taxAddress.trim()) {
      const line = [address.trim(), district, amphoe, province, postal].filter(Boolean).join(' ');
      setTaxAddress(line);
    }
    const nextEmpty =
      !name.trim() ? taxNameRef
      : !taxId.replace(/\D/g, '') ? taxIdRef
      : !address.trim() ? taxAddrRef
      : taxIdRef;
    window.setTimeout(() => {
      nextEmpty.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      nextEmpty.current?.focus({ preventScroll: true });
    }, 0);
  };

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
  // การ์ดต้อง: ร้านเปิดบริการ + ส่งให้คนอื่น + ลูกค้ากดขอ
  // ลูกค้าชอบส่งที่อยู่มาเป็นก้อนเดียว (จากแชท/โน้ตในมือถือ) — วางทีเดียวแล้ว
  // แยก ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ ให้เลย เหลือไว้ในช่องแรกแค่บ้านเลขที่+ถนน
  // ใช้ตัวแยกตัวเดียวกับหน้าเปิดบิลหลังบ้าน (lib/address-parser) — ที่อยู่จากลูกค้า
  // คนเดียวกันจะได้ออกมาเหมือนกันทั้งสองทาง
  const handleAddressPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.trim().length <= 10) return;      // สั้น ๆ = พิมพ์เอง ไม่ต้องยุ่ง
    const parsed = parseThaiAddress(pasted);
    // แยกไม่ออกสักส่วน → ปล่อยให้วางตามปกติ ดีกว่าไปตัดที่อยู่ลูกค้าทิ้ง
    if (!parsed || (!parsed.province && !parsed.postal_code)) return;
    e.preventDefault();
    setAddress(parsed.address || pasted.trim());
    if (parsed.district) setDistrict(parsed.district);
    if (parsed.amphoe) setAmphoe(parsed.amphoe);
    if (parsed.province) setProvince(parsed.province);
    if (parsed.postal_code) setPostal(parsed.postal_code);
    setAddressQuery(
      [parsed.district, parsed.amphoe, parsed.province, parsed.postal_code].filter(Boolean).join(' · '),
    );
  }, []);

  const cardOn = giftCard && shipToOther && wantCard;
  // วันที่ร้านไม่มีรอบส่งเลย — ยังไม่รู้ (ยังไม่ได้กรอกพื้นที่) ก็ไม่ปิดวันไหน
  // รอบที่เลือกได้ → เป็นตัวเลือกใน dropdown · รอบที่เลือกไม่ได้ → ลิสต์เหตุผลใต้ช่อง
  // (ปนไว้ในลิสต์แต่กดไม่ได้ก็ยังชวนให้พยายามกดอยู่ดี)
  const slotChoices = (options?.slots || [])
    .filter(s => s.available)
    .map(s => ({ id: s.id, label: `${s.name} · ${s.label}` }));
  const blockedSlots = (options?.slots || []).filter(s => !s.available && s.reason);
  const slotPlaceholder =
    !hasArea ? 'กรอกพื้นที่จัดส่งก่อน'
    : !deliveryDate ? 'เลือกวันที่ก่อน'
    : !options ? 'กำลังตรวจสอบรอบที่ว่าง…'
    : slotChoices.length === 0 ? 'ไม่มีรอบว่างในวันนี้'
    : 'เลือกช่วงเวลา';

  const openWeekdays = options?.available_weekdays;
  const closedWeekdays = openWeekdays?.length
    ? [0, 1, 2, 3, 4, 5, 6].filter(d => !openWeekdays.includes(d))
    : undefined;

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

  // ── ค่าเริ่มต้น: วันนี้ + รอบที่เริ่มไวที่สุด ─────────────────────────────
  // ลูกค้าเกือบทุกคนอยากได้ของเร็วสุดอยู่แล้ว — ให้ค่าที่ใช้ได้เลยแล้วค่อยปรับ
  // ดีกว่าบังคับเลือกเองทุกคน · จำไว้ว่า default มาจากเรา ถ้าลูกค้าเลือกวันเอง
  // ห้ามระบบย้ายวันให้อีก (dateAutoRef)
  const dateAutoRef = useRef(false);
  const autoHopsRef = useRef(0);
  useEffect(() => {
    if (!dateEnabled || !slotEnabled || !hasArea || deliveryDate) return;
    dateAutoRef.current = true;
    autoHopsRef.current = 0;
    setDeliveryDate(toISO(new Date()));
  }, [dateEnabled, slotEnabled, hasArea, deliveryDate]);

  useEffect(() => {
    if (!slotEnabled || !options || loadingOptions || !deliveryDate) return;
    const open = options.slots.filter(s => s.available);
    if (open.length > 0) {
      // ลิสต์เรียงตาม sort_order ของร้าน ไม่ใช่ตามเวลา — ต้องหาเองว่ารอบไหนเริ่มก่อน
      if (!slotId) {
        const earliest = [...open].sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
        setSlotId(earliest.id);
      }
      return;
    }
    // วันที่เราตั้งให้เองไม่มีรอบว่าง (เช่นสั่งดึกเลยเวลารอบสุดท้าย) → เลื่อนหา
    // วันแรกที่มีรอบ ข้ามวันหยุดร้าน · จำกัด 14 วัน กันวนไม่จบเมื่อร้านปิดยาว
    if (!dateAutoRef.current || autoHopsRef.current >= 14) return;
    const d = new Date(`${deliveryDate}T00:00:00`);
    for (let i = 0; i < 7; i++) {
      d.setDate(d.getDate() + 1);
      autoHopsRef.current += 1;
      if (!closedWeekdays?.includes(d.getDay())) { setDeliveryDate(toISO(d)); return; }
    }
  }, [options, loadingOptions, deliveryDate, slotEnabled, slotId, closedWeekdays]);

  const shippingFee = options?.zone?.fee ?? 0;
  const needsQuote = options?.zone?.needs_quote ?? false;
  const outOfArea = !!options?.zone_required && hasArea && !options?.zone && !loadingOptions;
  const cardFee = cardOn && giftMessage.trim() ? giftCardFee : 0;
  const total = subtotal + shippingFee + cardFee;

  const submit = async () => {
    setError('');
    if (lines.length === 0) { setError('ไม่มีสินค้าในตะกร้า'); return; }
    if (!name.trim()) { setError('กรุณากรอกชื่อผู้รับ'); focusField(nameRef); return; }
    if (!/^[0-9+\-\s()]{8,20}$/.test(phone.trim())) { setError('กรุณากรอกเบอร์โทรให้ถูกต้อง'); focusField(phoneRef); return; }
    if (shipToOther && !rcpName.trim()) { setError('กรุณากรอกชื่อผู้รับ'); focusField(rcpNameRef); return; }
    if (shipToOther && !rcpPhone.trim()) { setError('กรุณากรอกเบอร์ผู้รับ'); focusField(rcpNameRef); return; }
    if (!address.trim()) { setError('กรุณากรอกที่อยู่จัดส่ง'); focusField(addressRef); return; }
    if (taxInvoice && !taxName.trim()) { setError('กรุณากรอกชื่อผู้เสียภาษี'); return; }
    if (taxInvoice && taxId.replace(/\D/g, '').length !== 13) { setError('เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก'); return; }
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
          ship_to_other: shipToOther,
          recipient_name: rcpName.trim(),
          recipient_phone: rcpPhone.trim(),
          google_maps_link: mapsLink.trim(),
          gift_card: cardOn,
          gift_message: cardOn ? giftMessage.trim() : '',
          gift_to: cardOn ? (giftTo.trim() || rcpName.trim()) : '',
          gift_from: cardOn ? (giftFrom.trim() || name.trim()) : '',
          gift_hide_price: shipToOther && giftHidePrice,
          tax_invoice: taxInvoice,
          tax_name: taxName.trim(),
          tax_id: taxId,
          tax_branch: taxBranch.trim(),
          tax_address: taxAddress.trim(),
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
        <CheckoutSteps shop={shop} current="info" />
        <div className="sf-hero"><h1>ข้อมูลจัดส่ง</h1></div>
        <p className="sf-empty">ยังไม่มีสินค้าในตะกร้า</p>
        <p style={{ textAlign: 'center' }}>
          <Link href={storefrontHref(shop)} className="sf-cta">เลือกซื้อสินค้า</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="sf-container">
      <CheckoutSteps shop={shop} current="info" />
      <div className="sf-hero"><h1>ข้อมูลจัดส่ง</h1></div>

      <div className="sf-checkout">
        <div className="sf-checkout-form">
          <CheckoutAccountBar
            shop={shop}
            signedIn={account.signedIn}
            linkedName={account.customer?.name || null}
            avatarUrl={account.customer?.avatar_url || null}
            isStaff={account.isStaff}
            lineLogin={lineLogin}
            lineChannelId={lineChannelId}
            onSignedOut={() => setAccount({ signedIn: false, isStaff: false, customer: null })}
          />
          <section className="sf-fieldset">
            <h2>ผู้สั่งซื้อ</h2>
            <p className="sf-hint" style={{ marginBottom: 10 }}>
              {prefilled
                ? 'เติมข้อมูลจากครั้งก่อนให้แล้ว — แก้ไขได้ตามต้องการ'
                : 'ใช้ติดต่อกลับและเก็บประวัติการสั่งซื้อ ไม่ได้ส่งไปกับของ'}
            </p>
            <label className="sf-label">ชื่อผู้สั่ง *
              <input ref={nameRef} className="sf-input" value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อ-นามสกุล" />
            </label>
            <div className="sf-field-row">
              <label className="sf-label">เบอร์โทร *
                <input ref={phoneRef} className="sf-input" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="08xxxxxxxx" />
              </label>
              <label className="sf-label">อีเมล
                <input className="sf-input" value={email} onChange={e => setEmail(e.target.value)} inputMode="email" placeholder="ไม่บังคับ" />
              </label>
            </div>
          </section>

          <section className="sf-fieldset sf-fieldset-ship">
            <h2>จัดส่งถึง</h2>

            {/* สั่งไปกินเอง กับ สั่งไปให้คนอื่น เป็นคนละงานกัน — แยกให้ชัดตั้งแต่ต้น
                ไม่งั้นลูกค้าจะกรอกชื่อตัวเองแล้วคนส่งของโทรผิดคน */}
            <div className="sf-who">
              {([
                { key: false, cls: 'sf-who-self', title: 'ส่งให้ตัวเอง', desc: 'ใช้ชื่อและเบอร์ของผู้สั่ง' },
                { key: true, cls: 'sf-who-other', title: 'ส่งให้คนอื่น', desc: 'เป็นของขวัญ แนบการ์ดได้' },
              ] as const).map(o => (
                <button
                  key={String(o.key)}
                  type="button"
                  className={`sf-who-btn ${o.cls}${shipToOther === o.key ? ' sf-who-on' : ''}`}
                  aria-pressed={shipToOther === o.key}
                  onClick={() => setShipToOther(o.key)}
                >
                  <span className="sf-who-tick" aria-hidden="true" />
                  <span>
                    <b>{o.title}</b>
                    <small>{o.desc}</small>
                  </span>
                </button>
              ))}
            </div>

            {shipToOther && (
              <>
                <div className="sf-field-row">
                  <label className="sf-label">ชื่อผู้รับ *
                    <input ref={rcpNameRef} className="sf-input" value={rcpName} onChange={e => setRcpName(e.target.value)} placeholder="ชื่อคนที่จะได้รับของ" />
                  </label>
                  <label className="sf-label">เบอร์ผู้รับ *
                    <input className="sf-input" value={rcpPhone} onChange={e => setRcpPhone(e.target.value)} inputMode="tel" placeholder="ให้คนส่งของโทรหาได้" />
                  </label>
                </div>
                <p className="sf-hint" style={{ marginTop: -6, marginBottom: 12 }}>
                  คนส่งของจะโทรหาเบอร์นี้ ไม่ใช่เบอร์ผู้สั่ง
                </p>
              </>
            )}

            <label className="sf-label">บ้านเลขที่ / อาคาร / ถนน *
              <input
                ref={addressRef}
                className="sf-input"
                value={address}
                onChange={e => setAddress(e.target.value)}
                onPaste={handleAddressPaste}
                placeholder="เช่น 123/45 ซอยสุขุมวิท 21"
              />
            </label>
            <p className="sf-hint" style={{ marginTop: -6 }}>
              มีที่อยู่เต็ม ๆ อยู่แล้ว? วางทั้งก้อนตรงนี้ได้เลย — ระบบแยกตำบล อำเภอ จังหวัด รหัสไปรษณีย์ ให้เอง
            </p>

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

            {(zoneEnabled || slotEnabled) && !hasArea && (
              <p className="sf-hint" style={{ marginTop: -4 }}>
                กรอกตำบล/อำเภอ/จังหวัด หรือรหัสไปรษณีย์ก่อน แล้วระบบจะคำนวณค่าจัดส่ง
                และแสดงรอบที่ส่งได้ให้
              </p>
            )}

            {/* หมุดแผนที่มีประโยชน์เฉพาะร้านที่วิ่งส่งเอง (เปิดโซนจัดส่ง) —
                ร้านส่งพัสดุผ่านขนส่ง คนส่งใช้ที่อยู่ตัวหนังสือ ไม่ต้องถามลิงก์ให้รก */}
            {zoneEnabled && (
              <>
                <label className="sf-label" style={{ marginTop: 12 }}>ลิงก์ Google Maps
                  <input className="sf-input" value={mapsLink} onChange={e => setMapsLink(e.target.value)} inputMode="url" placeholder="https://maps.app.goo.gl/…" />
                </label>
                <p className="sf-hint">
                  เปิด Google Maps → กดค้างที่หมุด → แชร์ → คัดลอกลิงก์ · ช่วยให้คนส่งหาบ้านเจอเร็วขึ้นมาก
                </p>
              </>
            )}
          </section>

          {(dateEnabled || slotEnabled) && (
            <section className="sf-fieldset sf-fieldset-accent">
              <h2>วันและเวลาจัดส่ง</h2>

              {/* วันกับรอบเวลาเป็นการตัดสินใจเดียวกัน วางคู่กันให้เห็นพร้อมกัน
                  (จอแคบก็ยังคู่ — .sf-field-row เป็น 2 คอลัมน์เสมอ) */}
              <div className="sf-field-row">
                {dateEnabled && (
                  <div className="sf-label">
                    วันที่จัดส่ง{slotEnabled ? ' *' : ''}
                    <div style={{ marginTop: 5 }}>
                      {/* ปิดวันที่ร้านไม่มีรอบส่งไปเลย ดีกว่าให้กดได้แล้วเจอ "ไม่มีรอบจัดส่ง" ทีหลัง */}
                      <DateRangePicker
                        asSingle
                        useRange={false}
                        value={deliveryDate ? { startDate: deliveryDate, endDate: deliveryDate } : { startDate: null, endDate: null }}
                        onChange={(v) => {
                          dateAutoRef.current = false;
                          const d = v?.startDate;
                          setDeliveryDate(d ? (typeof d === 'string' ? d.slice(0, 10) : toISO(d)) : '');
                        }}
                        minDate={new Date()}
                        disabledDaysOfWeek={closedWeekdays}
                        placeholder="เลือกวันที่จัดส่ง"
                      />
                    </div>
                  </div>
                )}

                {slotEnabled && (
                  <div className="sf-label">
                    ช่วงเวลาจัดส่ง{dateEnabled ? ' *' : ''}
                    <div style={{ marginTop: 5 }}>
                      <FormSelect
                        value={slotId}
                        onChange={setSlotId}
                        disabled={slotChoices.length === 0}
                        placeholder={slotPlaceholder}
                        options={slotChoices}
                        portal
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* รอบที่เลือกไม่ได้ไม่ถูกซ่อน — บอกเหตุผลไว้ใต้ช่อง ลูกค้าจะได้รู้ว่าต้อง
                  เลื่อนวันหรือรอรอบถัดไป ไม่ใช่คิดว่าร้านไม่ส่งพื้นที่นี้ */}
              {blockedSlots.length > 0 && (
                <ul className="sf-slot-blocked">
                  {blockedSlots.map(s => (
                    <li key={s.id}>{s.name} · {s.label} — {s.reason}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* ตัวเลือกเสริม — สามอย่างนี้ลูกค้าส่วนใหญ่ไม่แตะ รวมไว้การ์ดเดียว
              ให้สิ่งที่ทุกคนต้องกรอก (ที่อยู่ วันเวลาส่ง) เด่นกว่าของที่เลือกได้ */}
          <section className="sf-fieldset">
            <h2>ตัวเลือกเสริม</h2>

            {giftCard && shipToOther && (
              <div className="sf-opt">
                <label className="sf-switch">
                  <input type="checkbox" checked={wantCard} onChange={e => setWantCard(e.target.checked)} />
                  <span className="sf-switch-box" aria-hidden="true" />
                  <span>
                    <b>แนบการ์ดอวยพรไปกับของ</b>
                    <small>ร้านเขียนข้อความของคุณลงการ์ดให้</small>
                  </span>
                </label>

                {wantCard && (<div className="sf-opt-body">
                  <label className="sf-label">ข้อความบนการ์ด
                    <textarea
                      className="sf-input" rows={4} maxLength={220}
                      value={giftMessage} onChange={e => setGiftMessage(e.target.value)}
                      placeholder="เช่น ขอบคุณสำหรับทุกอย่างในปีที่ผ่านมา ขอให้สุขภาพแข็งแรงนะครับ"
                    />
                  </label>
                  <p className={`sf-hint${giftMessage.length > 200 ? ' sf-error' : ''}`} style={{ textAlign: 'right', marginTop: -4 }}>
                    {giftMessage.length} / 220
                  </p>

                  <div className="sf-field-row">
                    <label className="sf-label">ถึง
                      <input className="sf-input" value={giftTo} onChange={e => setGiftTo(e.target.value)} placeholder={rcpName || 'ชื่อที่จะขึ้นบนการ์ด'} />
                    </label>
                    <label className="sf-label">จาก
                      <input className="sf-input" value={giftFrom} onChange={e => setGiftFrom(e.target.value)} placeholder={name || 'ชื่อผู้ให้'} />
                    </label>
                  </div>

                </div>)}
              </div>
            )}

            <div className="sf-opt">
              <label className="sf-switch">
                <input type="checkbox" checked={taxInvoice} onChange={e => setTaxInvoice(e.target.checked)} />
                <span className="sf-switch-box" aria-hidden="true" />
                <span>
                  <b>ต้องการใบกำกับภาษีเต็มรูปแบบ</b>
                  <small>ออกในนามผู้สั่งซื้อ ไม่ใช่ผู้รับของ</small>
                </span>
              </label>

              {taxInvoice && (
                <div className="sf-opt-body">
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                    <button type="button" className="sf-btn-ghost sf-btn-sm" onClick={fillTaxFromBuyer}>
                      <Copy strokeWidth={1.75} aria-hidden="true" />ใช้ที่อยู่ผู้สั่ง
                    </button>
                  </div>
                  <label className="sf-label">ชื่อผู้เสียภาษี / ชื่อบริษัท *
                    <input ref={taxNameRef} className="sf-input" value={taxName} onChange={e => setTaxName(e.target.value)} placeholder="บริษัท ตัวอย่าง จำกัด" />
                  </label>
                  <div className="sf-field-row">
                    <label className="sf-label">เลขประจำตัวผู้เสียภาษี *
                      <input ref={taxIdRef} className="sf-input" value={taxId} onChange={e => setTaxId(e.target.value)} inputMode="numeric" placeholder="13 หลัก" />
                    </label>
                    <label className="sf-label">สาขา
                      <input className="sf-input" value={taxBranch} onChange={e => setTaxBranch(e.target.value)} placeholder="สำนักงานใหญ่" />
                    </label>
                  </div>
                  <label className="sf-label">ที่อยู่ออกใบกำกับภาษี *
                    <textarea ref={taxAddrRef} className="sf-input" rows={3} value={taxAddress} onChange={e => setTaxAddress(e.target.value)} placeholder="ที่อยู่ตามหนังสือรับรอง — คนละที่กับที่อยู่จัดส่งได้" />
                  </label>
                </div>
              )}
            </div>

            {/* ราคาติดไปกับของขวัญคือหายนะที่แก้ทีหลังไม่ได้ — แยกสวิตช์ของตัวเอง
                เพราะไม่แนบการ์ดก็ยังต้องซ่อนราคาได้ */}
            {shipToOther && (
              <div className="sf-opt">
                <label className="sf-switch">
                  <input type="checkbox" checked={giftHidePrice} onChange={e => setGiftHidePrice(e.target.checked)} />
                  <span className="sf-switch-box" aria-hidden="true" />
                  <span>
                    <b>ไม่แนบใบเสร็จและราคาไปกับของ</b>
                    <small>ใบเสร็จส่งให้ผู้สั่งแทน</small>
                  </span>
                </label>
              </div>
            )}
          </section>

          <section className="sf-fieldset">
            <h2>ข้อความถึงร้าน</h2>
            <label className="sf-label">หมายเหตุ
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

          {cardFee > 0 && (
            <div className="sf-summary-row">
              <span>การ์ดอวยพร</span>
              <span>{formatStorePrice(cardFee)}</span>
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
            className="sf-cta sf-cta-block"
            style={{ marginTop: 12 }}
            disabled={submitting || outOfArea}
            onClick={submit}
          >
            {submitting ? 'กำลังสั่งซื้อ…' : 'ยืนยันคำสั่งซื้อ'}
          </button>
          <p className="sf-hint" style={{ textAlign: 'center' }}>
            ขั้นถัดไปเลือกวิธีชำระเงิน — ยังไม่มีการตัดเงินตอนนี้
          </p>
        </aside>
      </div>
    </div>
  );
}
