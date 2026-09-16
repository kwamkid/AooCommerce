// Client island on the (server-rendered) product page. The page stays SSR for
// SEO/AEO; only this button needs interactivity.
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Minus, Plus, Check } from 'lucide-react';
import { addToCart } from '@/lib/storefront-cart';
import { thumbUrl } from '@/lib/image-thumb';
import { flyToCart, findProductImage, FLY_DURATION } from '@/lib/storefront-fly-to-cart';
import StoreBuyBar from './StoreBuyBar';
import CartBadge from './CartBadge';
import {
  formatStorePrice, storefrontHref, SF_VARIATION_PICK_EVENT,
  type StorefrontVariation, type StorefrontOptionGroup,
} from '@/lib/storefront';

interface Props {
  shop: string;
  productSlug: string;
  productName: string;
  variations: StorefrontVariation[];
  images: string[];
  /**
   * ตัวเลือกที่ต้องถูกเลือกไว้ให้ตอนเปิดหน้า — server เป็นคนตัดสิน
   * (`pickDefaultVariation()` ใน lib/storefront-server.ts: ร้านตั้งเอง → ขายดีสุด → ตัวแรกที่มีของ)
   * ไม่ส่งมา/ของหมดแล้ว = ตกไปใช้ตัวแรกที่มีของ
   */
  defaultVariationId?: string;
  /** สินค้าชุด — มีค่า = เลือกทีละช่อง แทนรายการแบน */
  optionGroups?: StorefrontOptionGroup[];
  /**
   * ธีมของร้านสำหรับแถบซื้อล่างจอบนมือถือ — แถบถูก portal ออกไปนอก `.sf-root`
   * จึงไม่ได้รับ token/คลาสธีมทางการสืบทอด ต้องส่งมาให้ตรง ๆ (ดู StoreBuyBar.tsx)
   */
  themeClasses: string[];
  themeVars: Record<string, string>;
}

/** บอกทั้งหน้าว่าลูกค้าเลือกตัวเลือกไหน — ProductGallery เลื่อนไปรูปนั้น · DetailPrice เปลี่ยนราคา */
function announceImage(v: StorefrontVariation) {
  window.dispatchEvent(new CustomEvent(SF_VARIATION_PICK_EVENT, {
    detail: { image: v.image, label: v.label, price: v.price, compare_at: v.compare_at },
  }));
}

export default function AddToCartButton({
  shop, productSlug, productName, variations, images, defaultVariationId, optionGroups,
  themeClasses, themeVars,
}: Props) {
  const sellable = variations.filter(v => v.in_stock);
  const preselected = sellable.find(v => v.id === defaultVariationId) || sellable[0];
  const [selectedId, setSelectedId] = useState(preselected?.id || '');
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [buying, setBuying] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  if (sellable.length === 0) {
    // ของหมดทุกตัวเลือก — แถบล่างจอยังมีไว้ให้กดกลับไปตะกร้าได้ (ปุ่มซื้อกดไม่ได้)
    const soldOut = (
      <button type="button" className="sf-cta" disabled>สินค้าหมดชั่วคราว</button>
    );
    return (
      <div>
        <div className="sf-buy-row sf-buy-row-inline">{soldOut}</div>
        <StoreBuyBar themeClasses={themeClasses} themeVars={themeVars}>
          {soldOut}
          {/* ของหมดก็ยังต้องมีทางเข้าตะกร้า — ลูกค้าอาจมีของอื่นค้างอยู่ */}
          <CartBadge shop={shop} />
        </StoreBuyBar>
      </div>
    );
  }

  const selected = sellable.find(v => v.id === selectedId) || sellable[0];
  const groups = optionGroups && optionGroups.length > 0 ? optionGroups : null;

  const choose = (v: StorefrontVariation) => {
    setSelectedId(v.id);
    setAdded(false);
    announceImage(v);
  };

  // ── สินค้าชุด: เลือกทีละช่อง ──
  const picks = selected.options || {};
  const matchesOthers = (v: StorefrontVariation, group: string) =>
    groups!.every(g => g.name === group || v.options?.[g.name] === picks[g.name]);

  const pickValue = (group: string, value: string) => {
    const withValue = sellable.filter(v => v.options?.[group] === value);
    // ชุดที่ตรงทุกช่องก่อน · ไม่มี = ช่องอื่นขยับไปค่าแรกที่ใช้ได้ (ไล่ตามลำดับช่อง
    // คงค่าเดิมไว้ให้มากที่สุด) — variations เรียงตามลำดับตัวเลือกมาจาก server แล้ว
    let candidates = withValue;
    for (const g of groups!) {
      if (g.name === group) continue;
      const keep = candidates.filter(v => v.options?.[g.name] === picks[g.name]);
      if (keep.length > 0) candidates = keep;
    }
    if (candidates[0]) choose(candidates[0]);
  };

  /**
   * รูปที่จะให้บินเข้าตะกร้า — `findProductImage` ไต่ DOM ขึ้นไปหา `.sf-detail`
   * จากปุ่ม จึงใช้ ref ของปุ่มในเนื้อหน้าเสมอ (ปุ่มยังอยู่ใน DOM แม้ถูกซ่อนด้วย CSS
   * บนมือถือ — `closest()` ไม่สนใจ display) · ปุ่มในแถบล่างจออยู่นอก `.sf-root`
   * ผ่าน portal จึงไต่ไม่เจอ ต้องมาทางนี้ · ทางถอยสุดท้ายคือหาแกลเลอรีจาก document ตรง ๆ
   */
  const flyingImage = () =>
    findProductImage(btnRef.current)
    || document.querySelector<HTMLImageElement>('.sf-gallery-current img');

  const handleAdd = () => {
    const flying = flyToCart(flyingImage());
    setAdded(true);
    window.setTimeout(() => setAdded(false), FLY_DURATION + 900);
    const commit = () => addToCart(shop, {
      variation_id: selected.id,
      product_slug: productSlug,
      name: productName,
      variation_label: selected.label,
      price: selected.price,
      image: selected.image || images[0] || null,
    }, qty);
    if (flying) window.setTimeout(commit, FLY_DURATION - 120);
    else commit();
  };

  /**
   * "ซื้อเลย" = หยิบใส่ตะกร้าแล้วไปหน้าชำระเงินทันที (ของที่ค้างในตะกร้าอยู่แล้วไปด้วย
   * เหมือนกดใส่ตะกร้าแล้วกดตะกร้าเอง) · ไม่เล่น animation บินเข้าตะกร้าเพราะกำลังจะเปลี่ยนหน้า
   */
  const handleBuyNow = () => {
    if (buying) return;
    setBuying(true);
    addToCart(shop, {
      variation_id: selected.id,
      product_slug: productSlug,
      name: productName,
      variation_label: selected.label,
      price: selected.price,
      image: selected.image || images[0] || null,
    }, qty);
    router.push(storefrontHref(shop, '/checkout'));
  };

  /**
   * กล่องจำนวน + ปุ่มซื้อ — วาดสองที่ (ในเนื้อหน้า + แถบล่างจอบนมือถือ)
   * โดยใช้ state ชุดเดียวกัน · CSS ซ่อนตัวที่ไม่ใช้ตามความกว้างจอ จึงเห็นทีละชุดเสมอ
   * (บนมือถือ กล่องจำนวนโชว์ในเนื้อหน้า ส่วนปุ่มสองตัวโชว์ในแถบล่าง — แถบแคบเกินจะใส่ครบ)
   */
  const buyControls = (inBar: boolean) => (
    <>
      <div className="sf-qty" role="group" aria-label="จำนวน">
        <button type="button" onClick={() => { setQty(q => Math.max(1, q - 1)); setAdded(false); }} aria-label="ลดจำนวน"><Minus strokeWidth={2} aria-hidden="true" /></button>
        <span aria-live="polite">{qty}</span>
        <button type="button" onClick={() => { setQty(q => Math.min(99, q + 1)); setAdded(false); }} aria-label="เพิ่มจำนวน"><Plus strokeWidth={2} aria-hidden="true" /></button>
      </div>
      <button
        ref={inBar ? undefined : btnRef}
        type="button"
        className={`sf-cta sf-cta-add ${added ? 'sf-cta-added' : ''}`}
        onClick={handleAdd}
      >
        <span className="sf-cta-face" key={added ? 'done' : 'idle'}>
          {added
            ? <><Check strokeWidth={2.2} aria-hidden="true" />เพิ่มลงตะกร้าแล้ว</>
            : <>{inBar ? 'ใส่ตะกร้า' : <>หยิบใส่ตะกร้า · {formatStorePrice(selected.price * qty)}</>}</>}
        </span>
      </button>
      <button
        type="button"
        className="sf-cta sf-cta-buy"
        disabled={buying}
        onClick={handleBuyNow}
      >
        <span className="sf-cta-face">{buying ? 'กำลังไป…' : 'ซื้อเลย'}</span>
      </button>
    </>
  );

  return (
    <div>
      {groups ? (
        groups.map(g => (
          <div key={g.name} className="sf-option-group">
            <div className="sf-option-label">
              {g.name}: <strong>{picks[g.name] || '-'}</strong>
            </div>
            <div className="sf-variations" role="group" aria-label={g.name}>
              {g.values.map(value => {
                const soldOut = !sellable.some(v => v.options?.[g.name] === value);
                const available = sellable.some(v => v.options?.[g.name] === value && matchesOthers(v, g.name));
                const active = picks[g.name] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!available}
                    aria-pressed={active}
                    onClick={() => { if (!active) pickValue(g.name, value); }}
                    className={`sf-variation ${soldOut ? 'sf-variation-oos' : !available ? 'sf-variation-na' : ''} ${active ? 'sf-variation-active' : ''}`}
                  >
                    {value}
                    {soldOut && ' (หมด)'}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      ) : variations.length > 1 && (
        /* นับตัวเลือกทั้งหมด ไม่ใช่เฉพาะที่มีของ — ปุ่มด้านล่าง disabled + ต่อท้าย "(หมด)"
           ให้อยู่แล้ว · ของเดิมนับเฉพาะที่มีของ พอเหลือของตัวเลือกเดียวรายการหายทั้งแผง
           ลูกค้าเห็นแค่ช่วงราคาแต่ไม่รู้ว่ากำลังซื้อแบบไหน (เจอ 2026-09-15) */
        <div className="sf-variations">
          {variations.map(v => (
            <button
              key={v.id}
              type="button"
              disabled={!v.in_stock}
              onClick={() => choose(v)}
              className={`sf-variation ${v.image ? 'sf-variation-with-thumb' : ''} ${!v.in_stock ? 'sf-variation-oos' : ''} ${v.id === selected.id ? 'sf-variation-active' : ''}`}
            >
              {/* รูปต่อตัวเลือก (ถ้าร้านอัปไว้) — เลือกสีจากรูปง่ายกว่าอ่านชื่อสี */}
              {v.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sf-variation-thumb" src={thumbUrl(v.image, 96)} alt="" loading="lazy" />
              )}
              <span>
                {/* ไม่มีราคาบนปุ่ม — กดเลือกแล้วราคาด้านบนเปลี่ยนเป็นของตัวเลือกนั้นให้เอง
                    (DetailPrice ฟัง SF_VARIATION_PICK_EVENT อยู่) ปุ่มจึงสั้นและกวาดตาอ่านง่าย */}
                {v.label || 'ตัวเลือก'}
                {!v.in_stock && ' (หมด)'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* แถวซื้อในเนื้อหน้า — render เสมอ (SSR ต้องไม่ว่าง) แล้วค่อยซ่อนด้วย CSS บนมือถือ */}
      <div className="sf-buy-row sf-buy-row-inline">{buyControls(false)}</div>

      {/* มือถือ: แถบเดียวกันติดขอบล่างจอ พร้อมทางเข้าตะกร้า เพราะไอคอนบนหัวร้านหลบตอนเลื่อน */}
      <StoreBuyBar themeClasses={themeClasses} themeVars={themeVars}>
        {buyControls(true)}
        {/* ตะกร้าอยู่ขวาสุด ให้ตรงกับตำแหน่งบนหัวร้าน (บนขวา) — ลูกค้าจำที่อยู่ของ
            ตะกร้าเป็น "ฝั่งขวา" อยู่แล้ว และเป็นฝั่งที่นิ้วโป้งเอื้อมถึงง่ายที่สุด */}
        <CartBadge shop={shop} />
      </StoreBuyBar>

      {added && (
        <p className="sf-added sf-fade-up">
          <Link href={storefrontHref(shop, '/cart')} className="sf-footer-link">ดูตะกร้า →</Link>
        </p>
      )}
    </div>
  );
}
