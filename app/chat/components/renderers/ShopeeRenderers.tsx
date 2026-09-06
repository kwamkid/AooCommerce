'use client';

import Link from 'next/link';
import { ExternalLink, Headset, Package, Receipt } from 'lucide-react';
import { ChatMessage } from '@/app/chat/lib/chatTypes';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatPrice } from '@/lib/utils/format';
import { orderStatusLabel, paymentStatusLabel } from '@/lib/order-status';

// การ์ดของ Shopee ในหน้าแชท
//
// push code 10 ส่งมาแค่ id — ตัวเนื้อ (ชื่อสินค้า/รูป/สถานะออเดอร์) ถูกเติมไว้ตอน
// บันทึกข้อความแล้ว (lib/shopee/chat-enrich.ts) ที่นี่จึงแค่ "วาด" ไม่ยิง API เอง
// ข้อความเก่าที่ยังไม่ได้เติมเนื้อ (ก่อน backfill) ตกไปใช้การ์ดแบบมีแต่ลิงก์

interface RendererProps {
  msg: ChatMessage;
  direction: 'incoming' | 'outgoing';
}

const CARD_CLASS =
  'w-[260px] max-w-full rounded-xl border border-gray-200 dark:border-slate-600 ' +
  'bg-white dark:bg-slate-800 shadow-sm overflow-hidden';

function CardLink({ href, external, children }: { href: string; external?: boolean; children: React.ReactNode }) {
  const cls = 'inline-flex items-center gap-1 text-xs font-medium text-[#EE4D2D] hover:underline';
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
        <ExternalLink className="w-3 h-3" />
      </a>
    );
  }
  return <Link href={href} className={cls}>{children}</Link>;
}

// ─── สินค้า (message_type = 'item') ────────────────────────────────────────

export function ProductCardBubble({ msg }: RendererProps) {
  const item = msg.raw_message?.item;
  const fallbackUrl = item?.shopee_url || msg.raw_message?.itemUrl || msg.raw_message?.linkUrl;

  // ยังไม่มีข้อมูลสินค้า (ข้อความเก่า / เติมเนื้อไม่สำเร็จ) — อย่างน้อยต้องกดไปดูบน Shopee ได้
  if (!item) {
    return (
      <div className={`${CARD_CLASS} p-3`}>
        <div className="flex items-center gap-2 text-gray-700 dark:text-slate-200">
          <Package className="w-4 h-4 text-[#EE4D2D] flex-shrink-0" />
          <span className="text-sm">{msg.content || 'สินค้าจาก Shopee'}</span>
        </div>
        {fallbackUrl && <div className="mt-2"><CardLink href={fallbackUrl} external>ดูบน Shopee</CardLink></div>}
      </div>
    );
  }

  const name = item.name || 'สินค้าจาก Shopee';
  return (
    <div className={`${CARD_CLASS} p-2.5`}>
      <div className="flex gap-2.5">
        <ProductImageThumb src={item.image_url} alt={name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 break-words">{name}</p>
          {item.price != null && item.price > 0 && (
            <p className="text-sm font-semibold text-[#EE4D2D] mt-0.5">฿{formatPrice(item.price)}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700">
        {/* ผูกกับสินค้าในระบบแล้วเท่านั้นถึงเปิดหน้าสินค้าได้ — ไม่มี link = ปุ่มพาไปหน้าเปล่า */}
        {item.product_id && <CardLink href={`/products/${item.product_id}`}>เปิดในระบบ</CardLink>}
        <CardLink href={item.shopee_url} external>ดูบน Shopee</CardLink>
      </div>
    </div>
  );
}

// ─── คำสั่งซื้อ (message_type = 'order') ───────────────────────────────────

export function OrderCardBubble({ msg }: RendererProps) {
  const order = msg.raw_message?.order;
  const orderSn = order?.order_sn || msg.raw_message?.order_sn;

  if (!order && !orderSn) {
    return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;
  }

  return (
    <div className={`${CARD_CLASS} p-3`}>
      <div className="flex items-center gap-2">
        <Receipt className="w-4 h-4 text-[#EE4D2D] flex-shrink-0" />
        <span className="text-sm font-medium text-gray-900 dark:text-white break-all">
          {order?.order_number || orderSn}
        </span>
      </div>
      {order?.order_number && orderSn && order.order_number !== orderSn && (
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 break-all">Shopee: {orderSn}</p>
      )}

      {(order?.order_status || order?.payment_status) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {order.order_status && (
            <StatusBadge status={order.order_status}>{orderStatusLabel(order.order_status)}</StatusBadge>
          )}
          {order.payment_status && (
            <StatusBadge status={order.payment_status} payment>{paymentStatusLabel(order.payment_status)}</StatusBadge>
          )}
        </div>
      )}

      {order?.total_amount != null && (
        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-2">฿{formatPrice(order.total_amount)}</p>
      )}

      {/* ยังไม่ sync เข้ามา = ไม่มีหน้าให้เปิด — บอกไปตรง ๆ ดีกว่าให้กดแล้วเจอ 404 */}
      {order?.order_id ? (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700">
          <CardLink href={`/orders/${order.order_id}`}>เปิดออเดอร์</CardLink>
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">ยังไม่มีออเดอร์นี้ในระบบ</p>
      )}
    </div>
  );
}

// ─── เหตุการณ์เชิงระบบ (faq_liveagent) ─────────────────────────────────────

/**
 * ชิปกลางจอ — ไม่ใช่คำพูดของลูกค้าหรือของร้าน แต่เป็นเหตุการณ์ที่พนักงานต้องรู้
 * ("ลูกค้ากดขอคุยกับเจ้าหน้าที่" = แชทบอทส่งไม้ต่อแล้ว ต้องมีคนตอบ)
 */
export function SystemEventChip({ msg }: RendererProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-slate-700 text-xs text-gray-600 dark:text-slate-300">
      <Headset className="w-3.5 h-3.5 flex-shrink-0" />
      {msg.content || 'ลูกค้ากดขอคุยกับเจ้าหน้าที่'}
    </span>
  );
}
