// Path: components/broadcast/BroadcastPreview.tsx
//
// ตัวอย่าง "สิ่งที่ลูกค้าจะเห็น" ของบรอดแคสต์หนึ่งใบ — วาดจาก BroadcastContent ชนิดกลาง
// จึงใช้ได้ทั้งหน้าสร้าง (ยังไม่ส่ง รูปยังเป็น blob) และหน้ารายงาน (ส่งไปแล้ว รูปเป็น URL จริง)
//
// อยู่ใน components/ ไม่ใช่ในโฟลเดอร์หน้าสร้าง เพราะหน้ารายงานต้องเรียกตัวเดียวกัน —
// ก๊อปไปวาดเองแล้วสองหน้าจะแสดงคนละอย่างทั้งที่เป็นข้อความใบเดียวกัน
//
// ⚠️ วาดเป็น "ห้องแชทของลูกค้า" ไม่ใช่กล่องข้อความลอย ๆ — ของที่เราส่งไปเป็น
// **ข้อความขาเข้า**ของลูกค้า จึงชิดซ้าย มีรูปโปรไฟล์ร้านนำหน้า และฟองเป็นสีขาว
// (เคยวาดชิดขวาเป็นฟองสีแบรนด์ = ฝั่งที่ลูกค้าพิมพ์เอง ผู้ใช้อ่านแล้วไม่เชื่อว่าเป็นของจริง)
//
// ⚠️ **ปุ่มบนการ์ดเป็นสีเขียว LINE ไม่ใช่สีส้มของแบรนด์เรา** — เทียบกับรูปแคปจริงแล้ว
// LINE วาดปุ่ม Flex `primary` เป็นเขียวตัวหนังสือขาว และ `secondary` เป็นเทาอ่อนตัวหนังสือเข้ม
// ตัวอย่างที่ใช้สีเราจะสวยกว่าของจริง = ผู้ใช้ตั้งความคาดหวังผิดตั้งแต่ยังไม่ส่ง
//
// พื้นหลังห้องแชทตรึงเป็นสีเดียวทั้งธีมสว่าง/มืด ของข้างในจึงไม่ต้องมี dark: อีก
'use client';

import { Image as ImageIcon, Mic, Plus } from 'lucide-react';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import UserAvatar from '@/components/ui/UserAvatar';
import { thumbUrl } from '@/lib/image-thumb';
import { discountPercent, type BroadcastContent } from '@/lib/broadcast/content';
import { BROADCAST_PLATFORMS, type BroadcastPlatform } from '@/lib/broadcast/platforms';

export interface BroadcastPreviewProps {
  content: BroadcastContent;
  /** ช่องทางที่จะส่ง — null (หลายช่องทาง/ยังไม่เลือก) = ไม่มีชื่อสำรองให้หัวข้อความ */
  platform: BroadcastPlatform | null;
  /** blob/object URL ของรูปที่ยังไม่ได้อัปโหลด — ไม่มีก็ตกไปใช้ content.image_url */
  imagePreviewUrl?: string | null;
  /** ชื่อร้าน/OA/เพจที่ลูกค้าเห็นเหนือฟองแรก */
  accountName?: string | null;
  /** รูปโปรไฟล์ของช่องทาง — ไม่มีก็ตกไปเป็นตัวอักษรแรกของชื่อ */
  accountPictureUrl?: string | null;
  className?: string;
}

/** ฟองข้อความขาเข้า — ขาว มุมบนซ้ายตัดสั้นเหมือนหางฟองของ LINE */
const BUBBLE = 'w-fit max-w-full rounded-2xl rounded-tl-md px-3.5 py-2 bg-white text-gray-900';
/** ปุ่มใบแรกของการ์ด = สิ่งที่อยากให้กดที่สุด — LINE วาดเป็นเขียวทึบ */
const BTN_PRIMARY = 'block bg-line text-white rounded-lg py-2 text-center subtitle-text font-medium';
const BTN_SECONDARY = 'block bg-gray-200 text-gray-800 rounded-lg py-2 text-center subtitle-text';

/** ราคาแบบที่ร้านเขียนบนการ์ดจริง — "1,990.-" */
function priceLabel(value: number): string {
  return `${value.toLocaleString('th-TH')}.-`;
}

export default function BroadcastPreview({
  content, platform, imagePreviewUrl, accountName, accountPictureUrl, className,
}: BroadcastPreviewProps) {
  const imageUrl = imagePreviewUrl || content.image_url || null;
  const title = (content.title || '').trim();
  const text = (content.text || '').trim();
  const cards = content.products || [];
  const buttons = (content.buttons || []).filter(b => b.label.trim());
  const quickReplies = (content.quick_replies || []).filter(q => q.trim());
  const imageStyle = content.image_style === 'rich' ? 'rich' : 'bubble';
  const cardStyle = content.card_style === 'image' ? 'image' : 'detail';
  // ไม่รู้ชื่อร้านก็ยังต้องมีอะไรสักอย่างเหนือฟอง — ตกไปใช้ชื่อช่องทาง
  const senderName = (accountName || '').trim() || (platform ? BROADCAST_PLATFORMS[platform].label : '');
  // รูปเต็มจอ (โปสเตอร์ · ประกาศแบบ rich ของใบเก่า) LINE วาดเต็มความกว้างห้องแชทชนขอบ ไม่เว้นขอบซ้าย
  // ข้างรูปโปรไฟล์ — จึงวาดนอกคอลัมน์ข้าง avatar (เจ้าของท้วงจากรูปแคปจริง 10 ก.ย. 2026)
  const fullWidthImage = imageUrl && (content.kind === 'poster' || (content.kind === 'announce' && imageStyle === 'rich'))
    ? imageUrl : null;

  return (
    <div className={`rounded-lg overflow-hidden bg-linechat p-3 ${className || ''}`}>
      <div className="flex gap-2 items-start">
        <UserAvatar name={senderName || null} src={accountPictureUrl} size="sm" />

        <div className="flex-1 min-w-0 space-y-1.5">
          {senderName && <p className="helper-text text-white/90 truncate">{senderName}</p>}

          {content.kind === 'poster' ? (
            // โปสเตอร์ = ฟองข้อความ (ถ้ามี) ในคอลัมน์นี้ · ตัวรูปวาดเต็มความกว้างข้างล่างนอกคอลัมน์
            text && (
              <div className={BUBBLE}>
                <p className="subtitle-text whitespace-pre-wrap break-words">{text}</p>
              </div>
            )
          ) : content.kind === 'products' ? (
            <>
              {text && (
                <div className={BUBBLE}>
                  <p className="subtitle-text whitespace-pre-wrap break-words">{text}</p>
                </div>
              )}
              {/* การ์ดกว้าง 80% ของห้อง — ใบถัดไปโผล่มาให้เห็นว่าเลื่อนดูต่อได้ */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {cards.map((c, i) => {
                  const off = discountPercent(c);
                  const badge = off !== null && (
                    <span className="absolute top-2 left-2 bg-primary text-white rounded-full px-3 py-0.5 subtitle-text font-semibold">
                      ลด {off}%
                    </span>
                  );
                  const square = c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl(c.image_url, 320)}
                      alt={c.name}
                      className="w-full aspect-square object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-gray-100 flex items-center justify-center">
                      <ProductImageThumb src={null} alt={c.name} size="md" />
                    </div>
                  );

                  // แบบรูปเต็ม: รูปจัตุรัส + ป้ายลดมุมซ้ายบน + ราคาลอยกลางล่าง ไม่มีตัวหนังสือใต้รูป
                  if (cardStyle === 'image') {
                    return (
                      <div
                        key={c.variation_id ?? i}
                        className="w-4/5 flex-shrink-0 relative rounded-xl overflow-hidden bg-white"
                      >
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
                    <div
                      key={c.variation_id ?? i}
                      className="w-4/5 flex-shrink-0 rounded-xl bg-white border border-gray-200 overflow-hidden"
                    >
                      <div className="relative">
                        {square}
                        {badge}
                      </div>
                      <div className="p-3">
                        <p className="body-text font-semibold text-gray-900 line-clamp-2">{c.name}</p>
                        <span className="flex items-baseline gap-2 mt-0.5">
                          {c.price != null && (
                            <span className="subtitle-text text-gray-900">{priceLabel(c.price)}</span>
                          )}
                          {/* ราคาก่อนลดขีดฆ่า — โชว์เฉพาะตอนลดจริง ไม่งั้นเป็นการอวดส่วนลดที่ไม่มี */}
                          {off !== null && c.compare_at_price != null && (
                            <span className="subtitle-text line-through text-gray-400">
                              {priceLabel(c.compare_at_price)}
                            </span>
                          )}
                        </span>
                        <p className={`${BTN_PRIMARY} mt-3`}>
                          {c.url ? 'สั่งเลย' : 'สนใจสินค้านี้'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : content.kind === 'promo' ? (
            <div className="w-full rounded-xl bg-white border border-gray-200 overflow-hidden">
              {imageUrl && (
                // สูงตามรูปจริง ไม่ครอบ — การ์ด Flex ที่ส่งออกไปใช้สัดส่วนของรูปเหมือนกัน
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="แบนเนอร์" className="w-full h-auto" />
              )}
              <div className="p-3">
                {title && <p className="body-text font-semibold text-gray-900">{title}</p>}
                {text && (
                  <p className="subtitle-text text-gray-600 mt-1 whitespace-pre-wrap break-words">
                    {text}
                  </p>
                )}
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
          ) : (
            <>
              {(title || text) && (
                <div className={`${BUBBLE} space-y-1.5`}>
                  {title && <p className="subtitle-text font-semibold break-words">{title}</p>}
                  {text && <p className="subtitle-text whitespace-pre-wrap break-words">{text}</p>}
                </div>
              )}
              {/* รูปธรรมดา = ฟองรูปแยกใบ ไม่เต็มความกว้างห้อง เหมือนแอดมินส่งรูปในแชท */}
              {imageUrl && imageStyle !== 'rich' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="ตัวอย่างรูปที่จะส่ง" className="w-8/12 h-auto rounded-2xl" />
              )}
            </>
          )}

        </div>
      </div>

      {/* รูปเต็มจอ — กว้างเกือบชนขอบห้อง เหลือขอบซ้ายขวานิดเดียว (ตามรูปแคปจริง) ไม่ใช่กว้างแค่คอลัมน์ข้างรูปโปรไฟล์ */}
      {fullWidthImage && (
        <div className="-mx-1.5 mt-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fullWidthImage} alt={content.kind === 'poster' ? 'โปสเตอร์' : 'ตัวอย่างรูปที่จะส่ง'} className="block w-full h-auto rounded-lg" />
        </div>
      )}

      {/* ปุ่มตอบเร็ว — LINE วางไว้ท้ายห้องเต็มความกว้าง (ไม่ได้อยู่ในคอลัมน์ข้างรูปโปรไฟล์) เรียงกึ่งกลาง
          เป็นเม็ดสีเข้มตัวหนังสือขาว — เทียบกับรูปแคปจริงของเจ้าของ 10 ก.ย. 2026 (เดิมวาดชิดขวาเม็ดขาว) */}
      {quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center pt-2">
          {quickReplies.map((q, i) => (
            <span key={i} className="subtitle-text px-3 py-1 rounded-full bg-gray-900/70 text-white">
              {q}
            </span>
          ))}
        </div>
      )}

      {/* แถบพิมพ์ข้อความของลูกค้า — ให้เห็นว่าทั้งหมดอยู่ในห้องแชทจริง และปุ่มตอบเร็วอยู่เหนือแถบนี้พอดี
          (เจ้าของขอ 10 ก.ย. 2026) · ของตกแต่ง ไม่ใช่ช่องกรอก */}
      <div className="-mx-3 -mb-3 mt-2 flex items-center gap-2 bg-white px-2 py-1.5 text-gray-400" aria-hidden="true">
        <Plus className="w-5 h-5" />
        <ImageIcon className="w-5 h-5" />
        <span className="flex-1 h-8 rounded-full bg-gray-100 px-3 flex items-center subtitle-text">Aa</span>
        <Mic className="w-5 h-5" />
      </div>
    </div>
  );
}
