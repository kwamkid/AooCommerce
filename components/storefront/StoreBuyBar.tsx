// แถบซื้อติดขอบล่างจอ (มือถือ) — ตัวห่อที่พา children ออกไป render ที่ <body>
//
// ทำไมต้อง portal: `.sf-root` ประกาศ `container-type: inline-size` ซึ่งบังคับ
// layout containment → `position: fixed` ของลูกหลานทุกตัวจะยึดกับ `.sf-root`
// (สูงเท่าทั้งหน้า) ไม่ใช่ viewport แถบจึงไปโผล่ท้ายเอกสารแทนที่จะลอยอยู่ขอบล่างจอ
// การย้ายออกไปนอก `.sf-root` เป็นทางเดียวที่ fixed ยึด viewport ได้จริง
//
// ราคาที่ต้องจ่าย 2 ข้อ:
//   1) ธีมของร้านอยู่บน `.sf-root` ทั้งหมด (token `--sf-*` + คลาสอย่าง `sf-btn-outline`
//      ที่ CSS อ้างแบบ descendant) — ตัวห่อจึงต้องได้ธีมชุดเดียวกัน ที่นี่รับมาเป็น prop
//      จาก server (`storefrontCssVars` / `storefrontRootClasses` ตัวเดียวกับที่ layout ใช้)
//      ไม่ใช่ไปก๊อปจาก DOM — ค่าจึงตรงกันแน่นอนและไม่ต้องยุ่งกับ DOM ตอน render
//   2) `@container` ใช้ไม่ได้เพราะอยู่นอกคอนเทนเนอร์ → สไตล์ของแถบใช้ `@media`
//      (ดู `.sf-buybar` ท้าย storefront.css)
'use client';

import { useEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** ติดที่ <body> ตอนมีแถบ — เว้นที่ล่างหน้าไม่ให้เนื้อหาโดนแถบทับ (หน้าที่ไม่มีแถบไม่โดนดันเปล่า ๆ) */
const BODY_CLASS = 'sf-has-buybar';

const subscribeNoop = () => () => {};

interface Props {
  /** คลาสธีมของร้าน (ไม่รวม `sf-root` ซึ่งพา container/flex/100vh มาด้วย) */
  themeClasses: string[];
  /** token `--sf-*` ชุดเดียวกับที่อยู่บน `.sf-root` */
  themeVars: Record<string, string>;
  children: ReactNode;
}

export default function StoreBuyBar({ themeClasses, themeVars, children }: Props) {
  // วาดแถบหลัง hydration เท่านั้น — ฝั่ง server ไม่มี document ให้ portal ลง
  // (แถวซื้อในเนื้อหน้าจึงต้อง render ตามปกติเสมอ ไม่งั้นจอว่างระหว่างรอ)
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  useEffect(() => {
    document.body.classList.add(BODY_CLASS);
    return () => { document.body.classList.remove(BODY_CLASS); };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className={['sf-theme', ...themeClasses].join(' ')} style={themeVars as CSSProperties}>
      <div className="sf-buybar" role="region" aria-label="สั่งซื้อสินค้า">{children}</div>
    </div>,
    document.body,
  );
}
