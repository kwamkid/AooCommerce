// "Fly to cart" — รูปสินค้ายุบตัว แล้วโค้งวิ่งเข้าไอคอนตะกร้าบน header
//
// ทำงานกับ clone ที่ position:fixed แยกออกมาต่างหาก จึงไม่กระทบ layout เดิม
// และไม่ต้องให้ component ไหนรู้จักกัน — ปุ่มแค่บอกว่า "รูปไหน" แล้ว util
// หาตะกร้าเองจาก [data-sf-cart-target]
'use client';

/** ระยะเวลาบินทั้งหมด (ms) — ให้ตัวเรียกรู้ว่าควรเด้ง badge ตอนไหน */
export const FLY_DURATION = 620;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * หา <img> ของสินค้าที่ใกล้ปุ่มที่สุด โดยไต่ขึ้นไปหา container ที่กำหนด
 * (การ์ดในหน้ารวม หรือแกลเลอรีในหน้าสินค้า)
 */
export function findProductImage(button: Element | null): HTMLImageElement | null {
  if (!button) return null;
  const scope = button.closest('.sf-card') || button.closest('.sf-detail');
  if (!scope) return null;
  return scope.querySelector<HTMLImageElement>('.sf-gallery-main img, .sf-card-media img');
}

/**
 * ยิง animation. คืน true ถ้าเล่นจริง (false = ปิด motion / หาอะไรไม่เจอ)
 * ตัวเรียกไม่ต้อง cleanup — util เก็บกวาด clone เองเมื่อจบหรือถูกขัดจังหวะ
 */
export function flyToCart(image: HTMLImageElement | null): boolean {
  if (!image || prefersReducedMotion()) return false;

  const target = document.querySelector('[data-sf-cart-target]');
  if (!target) return false;

  const from = image.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return false;   // ซ่อนอยู่ ไม่ต้องเล่น

  // 1) ต้นฉบับยุบตัวสั้น ๆ — ให้รู้สึกว่า "ของถูกดึงออกไป"
  image.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(0.88)' },
      { transform: 'scale(1)' },
    ],
    { duration: 320, easing: 'cubic-bezier(.34, 1.56, .64, 1)' },
  );

  // 2) clone ที่จะบิน — เริ่มทับตำแหน่งเดิมเป๊ะ
  const clone = image.cloneNode(true) as HTMLImageElement;
  clone.setAttribute('aria-hidden', 'true');
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    objectFit: 'cover',
    borderRadius: '12px',
    zIndex: '9999',
    pointerEvents: 'none',
    willChange: 'transform, opacity',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(clone);

  // ระยะทางจากจุดเริ่ม → กลางไอคอนตะกร้า
  const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
  const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
  // ยกโค้งขึ้นก่อนตก — ดูเป็นการ "โยน" ไม่ใช่ลากเส้นตรง
  const lift = Math.min(160, Math.max(60, Math.abs(dy) * 0.45));
  const endScale = Math.max(0.08, (to.width * 0.8) / from.width);

  const animation = clone.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1, borderRadius: '12px', offset: 0 },
      { transform: `translate(${dx * 0.15}px, ${-lift}px) scale(0.72)`, opacity: 0.95, offset: 0.35 },
      { transform: `translate(${dx * 0.7}px, ${dy * 0.55 - lift * 0.25}px) scale(0.38)`, opacity: 0.9, offset: 0.7 },
      { transform: `translate(${dx}px, ${dy}px) scale(${endScale})`, opacity: 0.15, borderRadius: '999px', offset: 1 },
    ],
    { duration: FLY_DURATION, easing: 'cubic-bezier(.35, .06, .3, 1)', fill: 'forwards' },
  );

  const cleanup = () => clone.remove();
  animation.addEventListener('finish', cleanup);
  animation.addEventListener('cancel', cleanup);
  // กันค้างถ้า tab ถูกพักกลางทาง (animation event อาจไม่ยิง)
  window.setTimeout(cleanup, FLY_DURATION + 400);

  return true;
}
