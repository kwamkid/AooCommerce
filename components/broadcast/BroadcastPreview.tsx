// Path: components/broadcast/BroadcastPreview.tsx
//
// ตัวอย่าง "สิ่งที่ลูกค้าจะเห็น" ของบรอดแคสต์หนึ่งใบ — วาดจาก BroadcastContent ชนิดกลาง
// จึงใช้ได้ทั้งหน้าสร้าง (ยังไม่ส่ง รูปยังเป็น blob) และหน้ารายงาน (ส่งไปแล้ว รูปเป็น URL จริง)
//
// อยู่ใน components/ ไม่ใช่ในโฟลเดอร์หน้าสร้าง เพราะหน้ารายงานต้องเรียกตัวเดียวกัน —
// ก๊อปไปวาดเองแล้วสองหน้าจะแสดงคนละอย่างทั้งที่เป็นข้อความใบเดียวกัน
//
// ไฟล์นี้แค่แตกเนื้อหาเป็น "ข้อความทีละก้อน" ตามที่ LINE ส่งจริง (1 message object = 1 ก้อน)
// กรอบมือถือ · รูปโปรไฟล์ · การที่การ์ด/รูปเต็มจอตกบรรทัดลงมา อยู่ที่ LinePhonePreview ที่เดียว
//
// ⚠️ ของที่เราส่งไปเป็น **ข้อความขาเข้า**ของลูกค้า — ชิดซ้าย กล่องข้อความสีขาว
// (เคยวาดชิดขวาเป็นสีแบรนด์ = ฝั่งที่ลูกค้าพิมพ์เอง ผู้ใช้อ่านแล้วไม่เชื่อว่าเป็นของจริง)
//
// ⚠️ **ปุ่มบนการ์ดเป็นสีเขียว LINE ไม่ใช่สีส้มของแบรนด์เรา** — เทียบกับรูปแคปจริงแล้ว
// LINE วาดปุ่ม Flex `primary` เป็นเขียวตัวหนังสือขาว และ `secondary` เป็นเทาอ่อนตัวหนังสือเข้ม
// ตัวอย่างที่ใช้สีเราจะสวยกว่าของจริง = ผู้ใช้ตั้งความคาดหวังผิดตั้งแต่ยังไม่ส่ง
'use client';

import ProductImageThumb from '@/components/ui/ProductImageThumb';
import LinePhonePreview, { type PhoneChatMessage } from '@/components/broadcast/LinePhonePreview';
import { thumbUrl } from '@/lib/image-thumb';
import { discountPercent, type BroadcastContent } from '@/lib/broadcast/content';
import { BROADCAST_PLATFORMS, type BroadcastPlatform } from '@/lib/broadcast/platforms';

export interface BroadcastPreviewProps {
  content: BroadcastContent;
  /** ช่องทางที่จะส่ง — null (หลายช่องทาง/ยังไม่เลือก) = ไม่มีชื่อสำรองให้หัวห้องแชท */
  platform: BroadcastPlatform | null;
  /** blob/object URL ของรูปที่ยังไม่ได้อัปโหลด — ไม่มีก็ตกไปใช้ content.image_url */
  imagePreviewUrl?: string | null;
  /** ชื่อร้าน/OA/เพจ บนแถบหัวห้องแชท — เลือกหลายบัญชีให้ส่งของบัญชีแรก */
  accountName?: string | null;
  /** รูปโปรไฟล์ของบัญชีเดียวกับชื่อ — ไม่มีก็ตกไปเป็นตัวอักษรแรกของชื่อ */
  accountPictureUrl?: string | null;
  /** ความสูงจอมือถือ — md ในแผงสรุปของหน้าสร้าง (มีการ์ดอื่นอยู่ด้วย) · lg ที่อื่น */
  size?: 'md' | 'lg';
  className?: string;
}

/** กล่องข้อความขาเข้า — ขาว มุมบนซ้ายตัดสั้นเหมือนหางข้อความของ LINE */
const BUBBLE = 'w-fit max-w-full rounded-2xl rounded-tl-md px-3.5 py-2 bg-white text-gray-900';
/** ปุ่มใบแรกของการ์ด = สิ่งที่อยากให้กดที่สุด — LINE วาดเป็นเขียวทึบ */
const BTN_PRIMARY = 'block bg-line text-white rounded-lg py-2 text-center subtitle-text font-medium';
const BTN_SECONDARY = 'block bg-gray-200 text-gray-800 rounded-lg py-2 text-center subtitle-text';

/** ราคาแบบที่ร้านเขียนบนการ์ดจริง — "1,990.-" */
function priceLabel(value: number): string {
  return `${value.toLocaleString('th-TH')}.-`;
}

export default function BroadcastPreview({
  content, platform, imagePreviewUrl, accountName, accountPictureUrl, size, className,
}: BroadcastPreviewProps) {
  const imageUrl = imagePreviewUrl || content.image_url || null;
  const title = (content.title || '').trim();
  const text = (content.text || '').trim();
  const cards = content.products || [];
  const galleryImages = (content.images || []).filter(i => !!i.image_url);
  // สินค้าใบเดียว = การ์ดใหญ่เต็มความกว้าง (LINE ส่งเป็น giga) · หลายใบ = 80% ให้ใบถัดไปโผล่
  const cardWidth = cards.length === 1 ? 'w-full' : 'w-4/5';
  const buttons = (content.buttons || []).filter(b => b.label.trim());
  const quickReplies = (content.quick_replies || []).filter(q => q.trim());
  const imageStyle = content.image_style === 'rich' ? 'rich' : 'bubble';
  const cardStyle = content.card_style === 'image' ? 'image' : 'detail';
  // ไม่รู้ชื่อร้านก็ยังต้องมีอะไรสักอย่างบนหัวห้องแชท — ตกไปใช้ชื่อช่องทาง
  const senderName = (accountName || '').trim() || (platform ? BROADCAST_PLATFORMS[platform].label : '');

  const messages: PhoneChatMessage[] = [];
  /** "1. ข้อความ (ไม่บังคับ)" ของทุกชนิด — ส่งเป็นก้อนแรกแยกจากตัวรูป/การ์ด */
  const pushLeadText = () => {
    if (!text) return;
    messages.push({
      key: 'text',
      node: (
        <div className={BUBBLE}>
          <p className="subtitle-text whitespace-pre-wrap break-words">{text}</p>
        </div>
      ),
    });
  };

  if (content.kind === 'poster') {
    pushLeadText();
    if (imageUrl) {
      messages.push({
        key: 'poster',
        wide: true,
        // eslint-disable-next-line @next/next/no-img-element
        node: <img src={imageUrl} alt="โปสเตอร์" className="block w-full h-auto rounded-lg" />,
      });
    }
  } else if (content.kind === 'gallery') {
    pushLeadText();
    if (galleryImages.length > 0) {
      messages.push({
        key: 'gallery',
        wide: true,
        // รูปหลายใบ — ใบละ 80% ของจอ ใบถัดไปโผล่มาให้เห็นว่าเลื่อนดูต่อได้
        node: (
          <div className="phone-mock-hscroll flex gap-2">
            {galleryImages.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={img.image_url} alt={`รูปที่ ${i + 1}`} className="w-4/5 flex-shrink-0 h-auto rounded-xl object-cover" />
            ))}
          </div>
        ),
      });
    }
  } else if (content.kind === 'products') {
    pushLeadText();
    if (cards.length > 0) {
      messages.push({
        key: 'products',
        wide: true,
        node: (
          <div className="phone-mock-hscroll flex gap-2">
            {cards.map((c, i) => {
              const off = discountPercent(c);
              const badge = off !== null && (
                <span className="absolute top-2 left-2 bg-primary text-white rounded-full px-3 py-0.5 subtitle-text font-semibold">
                  ลด {off}%
                </span>
              );
              const square = c.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbUrl(c.image_url, 320)} alt={c.name} className="w-full aspect-square object-cover" />
              ) : (
                <div className="w-full aspect-square bg-gray-100 flex items-center justify-center">
                  <ProductImageThumb src={null} alt={c.name} size="md" />
                </div>
              );

              // แบบรูปเต็ม: รูปจัตุรัส + ป้ายลดมุมซ้ายบน + ราคาลอยกลางล่าง ไม่มีตัวหนังสือใต้รูป
              if (cardStyle === 'image') {
                return (
                  <div key={c.variation_id ?? i} className={`${cardWidth} flex-shrink-0 relative rounded-xl overflow-hidden bg-white`}>
                    {square}
                    {badge}
                    {c.price != null && (
                      <span className="absolute bottom-3 left-0 right-0 flex justify-center">
                        <span className="bg-black/60 text-white rounded-full px-4 py-1 body-text font-bold">
                          {priceLabel(c.price)}
                        </span>
                      </span>
                    )}
                  </div>
                );
              }
              return (
                <div key={c.variation_id ?? i} className={`${cardWidth} flex-shrink-0 rounded-xl bg-white border border-gray-200 overflow-hidden`}>
                  <div className="relative">
                    {square}
                    {badge}
                  </div>
                  <div className="p-3">
                    <p className="body-text font-semibold text-gray-900 line-clamp-2">{c.name}</p>
                    <span className="flex items-baseline gap-2 mt-0.5">
                      {c.price != null && <span className="subtitle-text text-gray-900">{priceLabel(c.price)}</span>}
                      {/* ราคาก่อนลดขีดฆ่า — โชว์เฉพาะตอนลดจริง ไม่งั้นเป็นการอวดส่วนลดที่ไม่มี */}
                      {off !== null && c.compare_at_price != null && (
                        <span className="subtitle-text line-through text-gray-400">{priceLabel(c.compare_at_price)}</span>
                      )}
                    </span>
                    <p className={`${BTN_PRIMARY} mt-3`}>{c.url ? 'สั่งเลย' : 'สนใจสินค้านี้'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ),
      });
    }
  } else if (content.kind === 'promo') {
    // โปรโมชัน (ถอดจากตัวเลือกแล้ว — ใบเก่ายังเปิดดูได้) = การ์ด Flex ใบเดียว หัวข้อ/ข้อความอยู่ในการ์ด
    messages.push({
      key: 'promo',
      wide: true,
      node: (
        <div className="w-full rounded-xl bg-white border border-gray-200 overflow-hidden">
          {imageUrl && (
            // สูงตามรูปจริง ไม่ครอบ — การ์ด Flex ที่ส่งออกไปใช้สัดส่วนของรูปเหมือนกัน
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="แบนเนอร์" className="w-full h-auto" />
          )}
          <div className="p-3">
            {title && <p className="body-text font-semibold text-gray-900">{title}</p>}
            {text && <p className="subtitle-text text-gray-600 mt-1 whitespace-pre-wrap break-words">{text}</p>}
            {/* เรียงเหมือน footer ของ Flex — ใบแรกเขียวทึบ ที่เหลือเทาอ่อน */}
            {buttons.length > 0 && (
              <div className="space-y-2 mt-3">
                {buttons.map((b, i) => (
                  <p key={i} className={i === 0 ? BTN_PRIMARY : BTN_SECONDARY}>{b.label}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      ),
    });
  } else {
    // ประกาศ: หัวข้อ+ข้อความ แล้วตามด้วยรูป — รูปธรรมดาอยู่ข้างรูปโปรไฟล์เหมือนแอดมินส่งรูปในแชท
    // · แบบ rich ของใบเก่า = รูปเต็มความกว้าง
    if (title || text) {
      messages.push({
        key: 'text',
        node: (
          <div className={`${BUBBLE} space-y-1.5`}>
            {title && <p className="subtitle-text font-semibold break-words">{title}</p>}
            {text && <p className="subtitle-text whitespace-pre-wrap break-words">{text}</p>}
          </div>
        ),
      });
    }
    if (imageUrl) {
      messages.push(imageStyle === 'rich'
        ? {
            key: 'image',
            wide: true,
            // eslint-disable-next-line @next/next/no-img-element
            node: <img src={imageUrl} alt="ตัวอย่างรูปที่จะส่ง" className="block w-full h-auto rounded-lg" />,
          }
        : {
            key: 'image',
            // eslint-disable-next-line @next/next/no-img-element
            node: <img src={imageUrl} alt="ตัวอย่างรูปที่จะส่ง" className="w-8/12 h-auto rounded-2xl" />,
          });
    }
  }

  return (
    <LinePhonePreview
      accountName={senderName || null}
      accountPictureUrl={accountPictureUrl}
      messages={messages}
      quickReplies={quickReplies}
      size={size}
      className={className}
    />
  );
}
