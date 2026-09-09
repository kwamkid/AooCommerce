// Path: components/broadcast/BroadcastPreview.tsx
//
// ตัวอย่าง "สิ่งที่ลูกค้าจะเห็น" ของบรอดแคสต์หนึ่งใบ — วาดจาก BroadcastContent ชนิดกลาง
// จึงใช้ได้ทั้งหน้าสร้าง (ยังไม่ส่ง รูปยังเป็น blob) และหน้ารายงาน (ส่งไปแล้ว รูปเป็น URL จริง)
//
// อยู่ใน components/ ไม่ใช่ในโฟลเดอร์หน้าสร้าง เพราะหน้ารายงานต้องเรียกตัวเดียวกัน —
// ก๊อปไปวาดเองแล้วสองหน้าจะแสดงคนละอย่างทั้งที่เป็นข้อความใบเดียวกัน
'use client';

import Badge from '@/components/ui/Badge';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import { formatPrice } from '@/lib/utils/format';
import { thumbUrl } from '@/lib/image-thumb';
import { discountPercent, type BroadcastContent } from '@/lib/broadcast/content';
import type { BroadcastPlatform } from '@/lib/broadcast/platforms';

export interface BroadcastPreviewProps {
  content: BroadcastContent;
  /** สีฟองข้อความตามแบรนด์ของช่องทาง — null (หลายช่องทาง/ยังไม่เลือก) = เทาเข้ม */
  platform: BroadcastPlatform | null;
  /** blob/object URL ของรูปที่ยังไม่ได้อัปโหลด — ไม่มีก็ตกไปใช้ content.image_url */
  imagePreviewUrl?: string | null;
  className?: string;
}

export default function BroadcastPreview({
  content, platform, imagePreviewUrl, className,
}: BroadcastPreviewProps) {
  const bubbleClass = platform === 'line' ? 'bg-line' : 'bg-gray-900';
  const imageUrl = imagePreviewUrl || content.image_url || null;
  const title = (content.title || '').trim();
  const text = (content.text || '').trim();
  const cards = content.products || [];
  const buttons = (content.buttons || []).filter(b => b.label.trim());
  const quickReplies = (content.quick_replies || []).filter(q => q.trim());
  const imageStyle = content.image_style === 'rich' ? 'rich' : 'bubble';
  const cardStyle = content.card_style === 'image' ? 'image' : 'detail';

  return (
    <div className={`rounded-lg bg-gray-100 dark:bg-slate-800 p-3 space-y-2 ${className || ''}`}>
      {content.kind === 'poster' ? (
        // โปสเตอร์ = รูปเต็มความกว้างห้องแชท ไม่มีอะไรอยู่ข้างนอกรูปเลย
        imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="โปสเตอร์" className="w-full h-auto rounded-xl overflow-hidden" />
        )
      ) : content.kind === 'products' ? (
        <>
          {text && (
            <div className={`ml-auto w-fit max-w-full rounded-2xl px-3.5 py-2 text-white ${bubbleClass}`}>
              <p className="subtitle-text whitespace-pre-wrap break-words">{text}</p>
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {cards.map((c, i) => {
              const off = discountPercent(c);
              // แบบรูปเต็ม: รูปจัตุรัส + ป้ายลดมุมซ้ายบน + ราคาลอยกลางล่าง ไม่มีตัวหนังสือใต้รูป
              if (cardStyle === 'image') {
                return (
                  <div
                    key={c.variation_id ?? i}
                    className="w-32 flex-shrink-0 relative rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-600"
                  >
                    {c.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbUrl(c.image_url, 320)}
                        alt={c.name}
                        className="w-full aspect-square object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center">
                        <ProductImageThumb src={null} alt={c.name} size="md" />
                      </div>
                    )}
                    {off !== null && (
                      <Badge tone="orange" size="sm" className="absolute top-1 left-1">ลด {off}%</Badge>
                    )}
                    {c.price != null && (
                      <span className="absolute bottom-2 left-0 right-0 flex justify-center">
                        <span className="bg-black/60 text-white rounded-full px-2 py-0.5 subtitle-text font-semibold">
                          {formatPrice(c.price)}
                        </span>
                      </span>
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={c.variation_id ?? i}
                  className="w-28 flex-shrink-0 rounded-xl bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 overflow-hidden"
                >
                  <div className="relative h-20 bg-gray-100 dark:bg-slate-600 flex items-center justify-center">
                    <ProductImageThumb src={c.image_url} alt={c.name} size="md" />
                    {off !== null && (
                      <Badge tone="orange" size="sm" className="absolute top-1 left-1">ลด {off}%</Badge>
                    )}
                  </div>
                  <div className="p-1.5">
                    <p className="helper-text text-gray-900 dark:text-white line-clamp-2">{c.name}</p>
                    <p className="helper-text text-gray-500 dark:text-slate-400 mt-0.5">
                      {c.price != null ? formatPrice(c.price) : ''}
                    </p>
                    {/* ปุ่มทึบเหมือน footer ของ Flex — สิ่งที่อยากให้ลูกค้ากดที่สุดในการ์ด */}
                    <p className="helper-text text-center mt-1 py-0.5 rounded bg-primary text-white">
                      {c.url ? 'สั่งเลย' : 'สนใจสินค้านี้'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : content.kind === 'promo' ? (
        <div className="ml-auto w-full rounded-xl bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 overflow-hidden">
          {imageUrl && (
            // สูงตามรูปจริง ไม่ครอบ — การ์ด Flex ที่ส่งออกไปใช้สัดส่วนของรูปเหมือนกัน
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="แบนเนอร์" className="w-full h-auto" />
          )}
          <div className="p-2.5">
            {title && <p className="body-text font-semibold text-gray-900 dark:text-white">{title}</p>}
            {text && (
              <p className="helper-text text-gray-600 dark:text-slate-300 mt-0.5 whitespace-pre-wrap break-words">
                {text}
              </p>
            )}
          </div>
          {/* เรียงเหมือน footer ของ Flex — ปุ่มแรกทึบ (สิ่งที่อยากให้กดที่สุด) ที่เหลือเป็นปุ่มรอง */}
          {buttons.length > 0 && (
            <div className="p-2.5 space-y-1.5">
              {buttons.map((b, i) => (
                <p
                  key={i}
                  className={i === 0
                    ? 'subtitle-text font-medium text-center py-1.5 rounded-md bg-primary text-white'
                    : 'subtitle-text text-center py-1.5 rounded-md border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200'}
                >
                  {b.label}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={`ml-auto w-fit max-w-full rounded-2xl px-3.5 py-2 text-white space-y-1.5 ${bubbleClass}`}>
            <p className="helper-text text-white/80">📣 บรอดแคสต์</p>
            {title && <p className="subtitle-text font-semibold break-words">{title}</p>}
            {text && <p className="subtitle-text whitespace-pre-wrap break-words">{text}</p>}
            {/* รูปธรรมดาอยู่ในฟองเหมือนที่แอดมินส่งรูปในแชท */}
            {imageUrl && imageStyle !== 'rich' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="ตัวอย่างรูปที่จะส่ง" className="rounded-lg max-h-40 w-auto" />
            )}
          </div>
          {/* รูปเต็มจอเป็นข้อความแยกใบใต้ฟอง — กว้างเต็มห้องแชท ไม่ได้อยู่ในฟอง */}
          {imageUrl && imageStyle === 'rich' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="ตัวอย่างรูปที่จะส่ง" className="w-full h-auto rounded-xl overflow-hidden" />
          )}
        </>
      )}

      {quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-end">
          {quickReplies.map((q, i) => (
            <span
              key={i}
              className="helper-text px-2 py-0.5 rounded-full border border-line text-line bg-white dark:bg-slate-700"
            >
              {q}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
