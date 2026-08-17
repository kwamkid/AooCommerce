// Storefront cart — client-side only, stored in localStorage on the domain the
// shopper is standing on.
//
// ⚠️ ห้ามย้ายไปเก็บเป็น cookie ของโดเมน aoo: ตอนหน้าร้านถูกฝังในเว็บ WordPress
// ของลูกค้า cookie นั้นจะกลายเป็น third-party → Safari ITP บล็อก → ตะกร้าหาย
// (ปัญหาเดียวกับที่ทำให้เราไม่เลือก iframe) — localStorage ฝั่งโดเมนที่ผู้ใช้ยืน
// อยู่เป็น first-party เสมอ ไม่มีใครบล็อก
//
// ตะกร้ายังไม่แตะ DB — จะกลายเป็น order จริงตอนกดชำระเงินเท่านั้น
'use client';

import { useState, useEffect, useCallback } from 'react';

export interface CartLine {
  variation_id: string;
  product_slug: string;
  name: string;
  variation_label: string | null;
  price: number;      // ราคาตอนหยิบใส่ — ใช้แสดงผลเท่านั้น server คิดใหม่เสมอ
  image: string | null;
  quantity: number;
}

const KEY_PREFIX = 'aoo-sf-cart:';
const EVENT = 'aoo-sf-cart-change';
const MAX_QTY = 99;

function key(shop: string) { return `${KEY_PREFIX}${shop}`; }

export function readCart(shop: string): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key(shop));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(shop: string, lines: CartLine[]) {
  try {
    localStorage.setItem(key(shop), JSON.stringify(lines));
  } catch {
    // โควตาเต็ม / โหมดส่วนตัว — ตะกร้าในหน้าปัจจุบันยังใช้ได้ต่อ
  }
  // แจ้งทุก component ในแท็บเดียวกัน (storage event ยิงเฉพาะข้ามแท็บ)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { shop } }));
}

export function addToCart(shop: string, line: Omit<CartLine, 'quantity'>, qty = 1) {
  const lines = readCart(shop);
  const existing = lines.find(l => l.variation_id === line.variation_id);
  if (existing) {
    existing.quantity = Math.min(MAX_QTY, existing.quantity + qty);
  } else {
    lines.push({ ...line, quantity: Math.min(MAX_QTY, Math.max(1, qty)) });
  }
  writeCart(shop, lines);
}

export function setQuantity(shop: string, variationId: string, qty: number) {
  const lines = readCart(shop)
    .map(l => l.variation_id === variationId
      ? { ...l, quantity: Math.min(MAX_QTY, Math.max(0, Math.floor(qty))) }
      : l)
    .filter(l => l.quantity > 0);
  writeCart(shop, lines);
}

export function removeFromCart(shop: string, variationId: string) {
  writeCart(shop, readCart(shop).filter(l => l.variation_id !== variationId));
}

export function clearCart(shop: string) {
  writeCart(shop, []);
}

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.price * l.quantity, 0);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.quantity, 0);
}

/**
 * Live cart for one shop. `hydrated` is false on the first render so callers can
 * avoid a server/client mismatch (the server has no localStorage).
 */
export function useCart(shop: string) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => setLines(readCart(shop)), [shop]);

  useEffect(() => {
    refresh();
    setHydrated(true);
    const onChange = () => refresh();
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);  // แท็บอื่นแก้ตะกร้า
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [refresh]);

  return {
    lines,
    hydrated,
    count: cartCount(lines),
    subtotal: cartSubtotal(lines),
    refresh,
  };
}
