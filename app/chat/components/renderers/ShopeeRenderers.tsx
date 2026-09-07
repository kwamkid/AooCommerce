'use client';

import Link from 'next/link';
import { ExternalLink, Headset, Info, Package, Receipt, Store, Ticket, UserMinus, UserPlus } from 'lucide-react';
import { ChatMessage } from '@/app/chat/lib/chatTypes';
import { linkify } from './SharedRenderers';
import Badge from '@/components/ui/Badge';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatPrice } from '@/lib/utils/format';
import { orderStatusLabel, paymentStatusLabel } from '@/lib/order-status';

// การ์ดของ marketplace ทุกเจ้าในหน้าแชท (Shopee · Lazada · TikTok)
//
// การ์ด item/order ที่แพลตฟอร์มส่งมามีแต่ id — ตัวเนื้อ (ชื่อสินค้า/รูป/สถานะออเดอร์)
// ถูกเติมไว้ตอนบันทึกข้อความแล้ว (lib/shopee/chat-enrich.ts · lib/lazada/chat-enrich.ts)
// ที่นี่จึงแค่ "วาด" ไม่ยิง API เอง · ข้อความเก่าที่ยังไม่ได้เติมเนื้อ (ก่อน backfill)
// ตกไปใช้การ์ดแบบมีแต่ลิงก์
//
// ⚠️ ชื่อ/สีของแพลตฟอร์มอยู่ที่ PLATFORM_META ตัวเดียว — ห้าม hardcode "Shopee" ในการ์ด
// (การ์ดใบเดียวกันนี้ใช้กับ Lazada/TikTok ด้วย)

// การ์ดสินค้าไม่ใช่ของ marketplace อย่างเดียวแล้ว — ลูกค้าแตะสินค้าในร้านค้าของเพจ
// Facebook/Instagram แล้วส่งมาถามก็ได้การ์ดใบเดียวกัน (สีของ CTA จึงต้องเป็นสีของช่องทางนั้น)
type CardPlatform = 'shopee' | 'lazada' | 'tiktok' | 'facebook' | 'instagram' | 'line';

const PLATFORM_META: Record<CardPlatform, { label: string; color: string }> = {
  shopee: { label: 'Shopee', color: '#EE4D2D' },
  lazada: { label: 'Lazada', color: '#0F146E' },
  tiktok: { label: 'TikTok', color: '#161823' },
  facebook: { label: 'Facebook', color: '#1877F2' },
  instagram: { label: 'Instagram', color: '#E4405F' },
  line: { label: 'LINE', color: '#06C755' },
};

interface RendererProps {
  msg: ChatMessage;
  direction: 'incoming' | 'outgoing';
  platform?: CardPlatform;
}

function metaOf(platform?: CardPlatform) {
  return PLATFORM_META[platform ?? 'shopee'] ?? PLATFORM_META.shopee;
}

const CARD_CLASS =
  'w-[260px] max-w-full rounded-xl border border-gray-200 dark:border-slate-600 ' +
  'bg-white dark:bg-slate-800 shadow-sm overflow-hidden';

function CardLink({
  href, external, color, children,
}: { href: string; external?: boolean; color: string; children: React.ReactNode }) {
  const cls = 'inline-flex items-center gap-1 text-xs font-medium hover:underline';
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={{ color }}>
        {children}
        <ExternalLink className="w-3 h-3" />
      </a>
    );
  }
  return <Link href={href} className={cls} style={{ color }}>{children}</Link>;
}

// ─── สินค้า (message_type = 'item') ────────────────────────────────────────

export function ProductCardBubble({ msg, platform }: RendererProps) {
  const meta = metaOf(platform);
  const item = msg.raw_message?.item;
  const url = item?.platform_url || item?.shopee_url || msg.raw_message?.itemUrl || msg.raw_message?.linkUrl;

  // ยังไม่มีข้อมูลสินค้า (ข้อความเก่า / เติมเนื้อไม่สำเร็จ) — อย่างน้อยต้องกดไปดูบนแพลตฟอร์มได้
  if (!item) {
    return (
      <div className={`${CARD_CLASS} p-3`}>
        <div className="flex items-center gap-2 text-gray-700 dark:text-slate-200">
          <Package className="w-4 h-4 flex-shrink-0" style={{ color: meta.color }} />
          <span className="text-sm">{msg.content || `สินค้าจาก ${meta.label}`}</span>
        </div>
        {url && <div className="mt-2"><CardLink href={url} external color={meta.color}>ดูบน {meta.label}</CardLink></div>}
      </div>
    );
  }

  const name = item.name || `สินค้าจาก ${meta.label}`;
  const extraCount = Math.max((msg.raw_message?.elements?.length ?? 0) - 1, 0);
  const voucherPrice = item.voucher_price;
  const showVoucher = voucherPrice != null && voucherPrice > 0
    && (item.price == null || voucherPrice < item.price);

  return (
    <div className={`${CARD_CLASS} p-2.5`}>
      <div className="flex gap-2.5">
        <ProductImageThumb src={item.image_url} alt={name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 break-words">{name}</p>
          {item.price != null && item.price > 0 && (
            <p className="text-sm font-semibold mt-0.5" style={{ color: meta.color }}>฿{formatPrice(item.price)}</p>
          )}
          {/* ราคาหลังคูปองของแพลตฟอร์ม — ลูกค้าเห็นตัวเลขนี้ พนักงานต้องเห็นด้วยจะได้ตอบตรงกัน */}
          {showVoucher && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
              ราคาหลังคูปอง ฿{formatPrice(voucherPrice)}
            </p>
          )}
          {/* ราคาอ่านไม่ออกว่าเป็นราคา (ไซซ์/สี/คำโปรย) — ยังมีค่ากับพนักงาน แสดงตามที่มา */}
          {item.price == null && item.subtitle && (
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 break-words">{item.subtitle}</p>
          )}
          {/* ลูกค้าส่งมาหลายชิ้นในข้อความเดียว — การ์ดโชว์ใบแรก บอกไว้ว่ายังมีอีก */}
          {extraCount > 0 && (
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">+{extraCount} รายการ</p>
          )}
        </div>
      </div>
      {/* ไม่มีทั้งลิงก์ในระบบและลิงก์บนแพลตฟอร์ม (การ์ดของ Facebook Shop ไม่มี URL) —
          แถวปุ่มว่างเปล่าพร้อมเส้นคั่นดูเหมือนของพัง จึงซ่อนทั้งแถว */}
      {(item.product_id || url) && (
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700">
          {/* ผูกกับสินค้าในระบบแล้วเท่านั้นถึงเปิดหน้าสินค้าได้ — ไม่มี link = ปุ่มพาไปหน้าเปล่า */}
          {item.product_id && <CardLink href={`/products/${item.product_id}`} color={meta.color}>เปิดในระบบ</CardLink>}
          {url && <CardLink href={url} external color={meta.color}>ดูบน {meta.label}</CardLink>}
        </div>
      )}
    </div>
  );
}

// ─── คำสั่งซื้อ (message_type = 'order') ───────────────────────────────────

export function OrderCardBubble({ msg, platform }: RendererProps) {
  const meta = metaOf(platform);
  const order = msg.raw_message?.order;
  const orderSn = order?.order_sn || msg.raw_message?.order_sn;

  if (!order && !orderSn) {
    return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;
  }

  return (
    <div className={`${CARD_CLASS} p-3`}>
      <div className="flex items-center gap-2">
        <Receipt className="w-4 h-4 flex-shrink-0" style={{ color: meta.color }} />
        <span className="text-sm font-medium text-gray-900 dark:text-white break-all">
          {order?.order_number || orderSn}
        </span>
      </div>
      {order?.order_number && orderSn && order.order_number !== orderSn && (
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 break-all">{meta.label}: {orderSn}</p>
      )}

      {/* Lazada แนบชื่อ+รูปสินค้าในออเดอร์มาด้วย — เห็นแล้วรู้ทันทีว่าลูกค้าถามถึงใบไหน */}
      {(order?.item_name || order?.image_url) && (
        <div className="flex items-start gap-2 mt-2">
          {order.image_url && <ProductImageThumb src={order.image_url} alt={order.item_name || ''} size="md" />}
          {order.item_name && (
            <p className="text-xs text-gray-600 dark:text-slate-300 line-clamp-2 break-words flex-1 min-w-0">
              {order.item_name}
            </p>
          )}
        </div>
      )}

      {(order?.order_status || order?.payment_status || order?.order_type === 'ReturnOrder') && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {order?.order_type === 'ReturnOrder' && <Badge tone="amber" size="sm">คำขอคืนสินค้า</Badge>}
          {order?.order_status && (
            <StatusBadge status={order.order_status}>{orderStatusLabel(order.order_status)}</StatusBadge>
          )}
          {order?.payment_status && (
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
          <CardLink href={`/orders/${order.order_id}`} color={meta.color}>เปิดออเดอร์</CardLink>
        </div>
      ) : order?.platform_url ? (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700">
          <CardLink href={order.platform_url} external color={meta.color}>ดูบน {meta.label}</CardLink>
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">ยังไม่มีออเดอร์นี้ในระบบ</p>
      )}
    </div>
  );
}

// ─── คูปอง (message_type = 'voucher') ──────────────────────────────────────

export function VoucherCardBubble({ msg, platform }: RendererProps) {
  const meta = metaOf(platform);
  const voucher = msg.raw_message?.voucher;
  const title = voucher?.title != null ? String(voucher.title) : msg.content;
  const discount = voucher?.discount != null ? String(voucher.discount) : null;
  const code = voucher?.code != null ? String(voucher.code) : null;
  const validity = voucher?.validity != null
    ? String(voucher.validity)
    : [voucher?.start, voucher?.end].filter(Boolean).join(' - ') || null;
  const link = voucher?.link_url != null ? String(voucher.link_url) : msg.raw_message?.linkUrl;

  return (
    <div className={`${CARD_CLASS} p-3`}>
      <div className="flex items-center gap-2">
        <Ticket className="w-4 h-4 flex-shrink-0" style={{ color: meta.color }} />
        <span className="text-sm font-medium text-gray-900 dark:text-white break-words">
          {title || 'คูปองส่วนลด'}
        </span>
      </div>
      {discount && <p className="text-sm font-semibold mt-1" style={{ color: meta.color }}>{discount}</p>}
      {code && <p className="text-xs text-gray-600 dark:text-slate-300 mt-1 break-all">รหัส: {code}</p>}
      {validity && <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 break-words">{validity}</p>}
      {link && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700">
          <CardLink href={link} external color={meta.color}>ดูบน {meta.label}</CardLink>
        </div>
      )}
    </div>
  );
}

// ─── ชวนกดติดตามร้าน (message_type = 'follow_invite') ──────────────────────

export function FollowInviteChip({ msg, platform }: RendererProps) {
  const meta = metaOf(platform);
  const link = msg.raw_message?.link_url || msg.raw_message?.linkUrl;
  const label = msg.content || 'ชวนติดตามร้าน';

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-slate-700 text-xs text-gray-600 dark:text-slate-300">
      <Store className="w-3.5 h-3.5 flex-shrink-0" style={{ color: meta.color }} />
      {label}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: meta.color }}>
          เปิด
        </a>
      )}
    </span>
  );
}

// ─── เหตุการณ์เชิงระบบ / ประกาศของแพลตฟอร์ม ────────────────────────────────

/**
 * ชิปกลางจอ — ไม่ใช่คำพูดของลูกค้าหรือของร้าน แต่เป็นเหตุการณ์/ประกาศที่พนักงานต้องรู้
 * (Shopee: "ลูกค้ากดขอคุยกับเจ้าหน้าที่" · Lazada: ข้อความเตือนเรื่องความปลอดภัย)
 *
 * ข้อความยาว ๆ ของ Lazada ยัดใส่ชิปกลมแล้วอ่านไม่ออก — เกิน ~60 ตัวอักษรวาดเป็นกล่อง
 */
const CHIP_MAX_CHARS = 60;

const SYSTEM_EVENT_ICONS: Record<string, typeof Info> = {
  faq_liveagent: Headset,
  member_joined: UserPlus,
  member_left: UserMinus,
};

export function SystemEventChip({ msg }: RendererProps) {
  const event = msg.raw_message?.system_event;
  const Icon = (event && SYSTEM_EVENT_ICONS[event]) || Info;
  const text = msg.content || 'ลูกค้ากดขอคุยกับเจ้าหน้าที่';

  if (text.length > CHIP_MAX_CHARS) {
    return (
      <div className="rounded-xl max-w-[420px] px-3 py-2 text-xs whitespace-pre-wrap text-center bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
        <Icon className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
        {linkify(text)}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-slate-700 text-xs text-gray-600 dark:text-slate-300">
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      {text}
    </span>
  );
}
