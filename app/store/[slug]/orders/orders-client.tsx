'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useStoredOrders } from '@/lib/storefront-orders';
import { formatStorePrice, storefrontHref } from '@/lib/storefront';

export default function OrdersClient({ shop }: { shop: string }) {
  const { orders, hydrated } = useStoredOrders(shop);

  if (!hydrated) {
    return <div className="sf-container"><p className="sf-empty">กำลังโหลด…</p></div>;
  }

  return (
    <div className="sf-container">
      <div className="sf-hero">
        <h1>คำสั่งซื้อของฉัน</h1>
        <p>
          รายการที่สั่งจากอุปกรณ์เครื่องนี้ — เปิดดูสถานะและชำระเงินได้จากที่นี่
        </p>
      </div>

      {orders.length === 0 ? (
        <>
          <p className="sf-empty">ยังไม่มีคำสั่งซื้อจากเครื่องนี้</p>
          <p style={{ textAlign: 'center' }}>
            <Link href={storefrontHref(shop)} className="sf-cta">เลือกซื้อสินค้า</Link>
          </p>
        </>
      ) : (
        <>
          <div className="sf-cart-list">
            {orders.map(o => (
              <Link key={o.id} href={storefrontHref(shop, `/order/${o.id}`)} className="sf-order-row">
                <div className="sf-cart-info">
                  <span className="sf-cart-name">{o.order_number}</span>
                  <div className="sf-cart-unit">
                    {new Date(o.created_at).toLocaleDateString('th-TH', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })} น.
                  </div>
                </div>
                <div className="sf-cart-total">{formatStorePrice(o.total)}</div>
                <ChevronRight strokeWidth={1.75} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <p className="sf-hint" style={{ marginTop: 16 }}>
            รายการนี้เก็บไว้ในเบราว์เซอร์ของคุณเอง — ถ้าล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่อง
            รายการจะหายไป แต่ยังเปิดคำสั่งซื้อได้จากลิงก์เดิมเสมอ
          </p>
        </>
      )}
    </div>
  );
}
