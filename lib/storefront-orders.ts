// ประวัติคำสั่งซื้อของลูกค้าฝั่ง storefront — เก็บใน localStorage ของโดเมนที่
// ลูกค้ายืนอยู่ (first-party) เหมือนตะกร้า
//
// ร้านค้าออนไลน์แบบนี้ไม่มีระบบ login ลูกค้า จึงจำ "id ของออเดอร์ที่เครื่องนี้เคยสั่ง"
// ไว้แทน แล้วค่อยดึงรายละเอียดจาก API ทีหลัง — ตัว localStorage เก็บแค่ id +
// ข้อมูลย่อไว้แสดงรายการเร็ว ๆ ไม่ได้เก็บข้อมูลอ่อนไหว
//
// ⚠️ ห้ามใช้เป็นการยืนยันตัวตน — ใครถือ URL ก็เปิดออเดอร์ได้อยู่แล้ว
// (capability URL เหมือนหน้าบิล) นี่เป็นแค่ความสะดวกในการกลับมาดู
'use client';

import { useState, useEffect } from 'react';

export interface StoredOrder {
  id: string;
  order_number: string;
  total: number;
  created_at: string;   // ISO
}

/** ข้อมูลผู้รับที่จำไว้เติมฟอร์มรอบหน้า */
export interface StoredContact {
  name: string;
  phone: string;
  email: string;
  address: string;
  district: string;
  amphoe: string;
  province: string;
  postal_code: string;
  address_label: string;   // ข้อความที่โชว์ในช่องค้นหาที่อยู่
}

const ORDERS_PREFIX = 'aoo-sf-orders:';
const CONTACT_PREFIX = 'aoo-sf-contact:';
const MAX_KEPT = 30;

function ordersKey(shop: string) { return `${ORDERS_PREFIX}${shop}`; }
function contactKey(shop: string) { return `${CONTACT_PREFIX}${shop}`; }

export function readOrders(shop: string): StoredOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ordersKey(shop));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberOrder(shop: string, order: StoredOrder) {
  try {
    const existing = readOrders(shop).filter(o => o.id !== order.id);
    const next = [order, ...existing].slice(0, MAX_KEPT);   // ใหม่สุดอยู่บน
    localStorage.setItem(ordersKey(shop), JSON.stringify(next));
  } catch {
    // โควตาเต็ม / โหมดส่วนตัว — ไม่เป็นไร ลูกค้ายังเปิดจากลิงก์ได้
  }
}

export function readContact(shop: string): StoredContact | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(contactKey(shop));
    return raw ? (JSON.parse(raw) as StoredContact) : null;
  } catch {
    return null;
  }
}

export function rememberContact(shop: string, contact: StoredContact) {
  try {
    localStorage.setItem(contactKey(shop), JSON.stringify(contact));
  } catch { /* ignore */ }
}

export function forgetContact(shop: string) {
  try { localStorage.removeItem(contactKey(shop)); } catch { /* ignore */ }
}

/** รายการออเดอร์ที่เครื่องนี้เคยสั่ง — hydrated=false ระหว่างรอ client mount */
export function useStoredOrders(shop: string) {
  const [orders, setOrders] = useState<StoredOrder[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOrders(readOrders(shop));
    setHydrated(true);
  }, [shop]);

  return { orders, hydrated };
}
