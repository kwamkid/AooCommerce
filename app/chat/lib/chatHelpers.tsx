'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ChatAccountInfo, UnifiedContact } from './chatTypes';

export function FbIcon({ size = 16 }: { size?: number }) {
  return <Image src="/social/facebook.svg" alt="Facebook" width={size} height={size} className="flex-shrink-0" />;
}

export function IgIcon({ size = 16 }: { size?: number }) {
  return <Image src="/social/instagram.svg" alt="Instagram" width={size} height={size} className="flex-shrink-0" />;
}

export function LineIcon({ size = 16 }: { size?: number }) {
  return <Image src="/social/line_oa.svg" alt="LINE" width={size} height={size} className="flex-shrink-0" />;
}

export function ShopeeIcon({ size = 16 }: { size?: number }) {
  return <Image src="/marketplace/shopee.svg" alt="Shopee" width={size} height={size} className="flex-shrink-0" />;
}

export function LazadaIcon({ size = 16 }: { size?: number }) {
  return <Image src="/marketplace/lazada.svg" alt="Lazada" width={size} height={size} className="flex-shrink-0" />;
}

export function TiktokIcon({ size = 16 }: { size?: number }) {
  return <Image src="/marketplace/tiktok_shop.svg" alt="TikTok Shop" width={size} height={size} className="flex-shrink-0" />;
}

/** Returns the correct platform icon for a contact based on source */
export function PlatformIcon({ contact, size = 16 }: { contact: { platform: string; source?: string }; size?: number }) {
  if (contact.source === 'instagram') return <IgIcon size={size} />;
  if (contact.platform === 'line') return <LineIcon size={size} />;
  if (contact.platform === 'shopee') return <ShopeeIcon size={size} />;
  if (contact.platform === 'lazada') return <LazadaIcon size={size} />;
  if (contact.platform === 'tiktok') return <TiktokIcon size={size} />;
  return <FbIcon size={size} />;
}

/** สีประจำแพลตฟอร์ม — ที่เดียวของทั้งหน้าแชท (เดิม copy เป็น ternary ยาวสองที่) */
export function getPlatformColor(contact: { platform: string; source?: string }): string {
  if (contact.source === 'instagram') return '#E4405F';
  if (contact.platform === 'line') return '#06C755';
  if (contact.platform === 'shopee') return '#EE4D2D';
  if (contact.platform === 'lazada') return '#0F146E';
  if (contact.platform === 'tiktok') return '#161823';
  return '#1877F2';
}

/**
 * ตราช่องทางมุมซ้ายล่างของรูปโปรไฟล์ (รายชื่อแชท + หัวแชท)
 *
 * รูปช่องทางเป็น URL ภายนอกที่ตายได้ (LINE คืน 404 เมื่อ OA เปลี่ยนรูป) → พังแล้ว
 * ต้องตกไปเป็นไอคอน platform ไม่ใช่วงกลมว่าง (บทเรียนเดียวกับ ChannelBadge)
 */
export function AccountCornerBadge({
  contact,
  sizeClass,
}: {
  contact: { platform: string; source?: string; account_picture_url?: string; account_name?: string };
  sizeClass: string;
}) {
  const url = contact.account_picture_url;
  // จำ "URL ไหนที่พัง" ไม่ใช่ boolean — พอสลับไปคู่สนทนาคนอื่น (หรือรูปถูกรีเฟรชแล้ว)
  // ค่าจะไม่ตรงกันเอง = กลับไปลองโหลดใหม่ โดยไม่ต้องมี effect คอย reset
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = !!url && brokenUrl === url;

  const base = `absolute -bottom-0.5 -left-0.5 ${sizeClass} rounded-full shadow-sm border-2 border-white dark:border-slate-800`;

  if (url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={contact.account_name || ''} loading="lazy"
        onError={() => setBrokenUrl(url)}
        className={`${base} object-cover`} />
    );
  }

  return (
    <span className={`${base} flex items-center justify-center`} style={{ backgroundColor: getPlatformColor(contact) }}>
      <PlatformIcon contact={contact} size={10} />
    </span>
  );
}

/**
 * รูปประจำช่องทาง — `null` = ไม่มีรูปจริง (ให้ UI ตกไปใช้ไอคอน platform เอง)
 *
 * ค่าหลักมาจาก `/api/chat-accounts` ที่ resolve ให้แล้ว (รวมโลโก้ร้าน marketplace)
 * ที่เหลือเป็น fallback สำหรับ payload เก่าที่ยังไม่มี `picture_url`
 *
 * ❌ ห้ามคืน path ไอคอน platform เป็น "รูป" — เคยทำแล้วช่องทาง Shopee/Lazada/TikTok
 * โชว์โลโก้แพลตฟอร์มแทนโลโก้ร้านจริงทุกที่ (เจอจริง 2026-08-28)
 */
export function getAccountPicture(account: ChatAccountInfo): string | null {
  if (account.picture_url) return account.picture_url;
  if (!account.credentials) return null;
  if (account.platform === 'line') return (account.credentials.bot_picture_url as string) || null;
  if (account.platform === 'facebook') {
    const pageId = account.credentials.page_id as string;
    if (pageId) return `https://graph.facebook.com/${pageId}/picture?type=small`;
  }
  return null;
}

export function getAvatarUrl(contact: UnifiedContact): string | null {
  if (contact.picture_url) return contact.picture_url;
  if (contact.platform === 'facebook' && contact.platform_user_id) {
    return `https://graph.facebook.com/${contact.platform_user_id}/picture?type=large`;
  }
  return null;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function formatTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ' + date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

/**
 * ข้อความที่เป็น "เหตุการณ์" ไม่ใช่คำพูดของใคร (ตอนนี้: ลูกค้า Shopee กดขอคุยกับเจ้าหน้าที่)
 *
 * วาดเป็นชิปกลางจอ — ไม่มีรูปโปรไฟล์ ไม่มีหางฟอง ไม่มีเวลา เพราะไม่มีใคร "พูด"
 * ประโยคนี้ ถ้าวาดเป็นฟองจะอ่านเหมือนลูกค้าพิมพ์เอง
 */
export function isSystemEventMessage(msg: { message_type: string; raw_message?: { system_event?: string } | null }): boolean {
  return msg.message_type === 'faq_liveagent' || !!msg.raw_message?.system_event;
}

export function formatLastMessage(dateString?: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'เมื่อกี้';
  if (diffMins < 60) return `${diffMins} นาที`;
  if (diffHours < 24) return `${diffHours} ชม.`;
  if (diffDays < 7) return `${diffDays} วัน`;
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

/**
 * ย่อรูปเป็น JPEG ด้วย canvas — คืน null เมื่อเบราว์เซอร์ **ถอดรหัสไฟล์นี้ไม่ได้**
 * (เช่น HEIC จาก iPhone เปิดบน Chrome) ผู้เรียกต้องตัดสินใจต่อเอง ห้ามเงียบ ๆ
 * ส่งไฟล์ดิบไปให้ LINE/FB เพราะปลายทางจะได้รูปเสียโดยที่ฝั่งเราขึ้นว่าส่งสำเร็จ
 */
function compressToJpeg(file: File, maxSizeKB: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else { width = Math.round(width * (maxDim / height)); height = maxDim; }
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx || !width || !height) { resolve(null); return; }
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.8;
      const tryCompress = () => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(null); return; }
          if (blob.size <= maxSizeKB * 1024 || quality <= 0.3) { resolve(blob); }
          else { quality -= 0.1; tryCompress(); }
        }, 'image/jpeg', quality);
      };
      tryCompress();
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export function compressImage(file: File, maxSizeKB = 500): Promise<Blob> {
  if (file.size <= maxSizeKB * 1024) return Promise.resolve(file);
  return compressToJpeg(file, maxSizeKB).then((blob) => blob || file);
}

/** ชนิดที่ทั้ง LINE และ Facebook แสดงผลได้แน่นอน (LINE รับแค่ JPEG/PNG) */
const SENDABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

export interface PreparedChatImage { blob: Blob; ext: string; contentType: string }

/**
 * เตรียมรูปให้พร้อมส่งเข้าแชท — คืนชนิด/นามสกุล **ตามของจริง** ไม่ใช่ฝัง .jpg ไว้เฉย ๆ
 * (ของเดิมอัปไฟล์ PNG/WebP/HEIC ด้วยชื่อ .jpg + content-type image/jpeg ปลายทางจึงเห็นรูปเสีย)
 * โยน error เมื่อเป็นรูปแบบที่แปลงไม่ได้และปลายทางรับไม่ได้ — บอกผู้ใช้ดีกว่าส่งของพัง
 */
export async function prepareChatImage(file: File, maxSizeKB = 500): Promise<PreparedChatImage> {
  const type = (file.type || '').toLowerCase();
  const isPng = type === 'image/png';

  // เล็กพออยู่แล้วและเป็นชนิดที่ปลายทางรับได้ → ส่งของเดิม คุณภาพไม่ต้องเสียไปกับการแปลง
  if (file.size <= maxSizeKB * 1024 && SENDABLE_IMAGE_TYPES.has(type)) {
    return { blob: file, ext: isPng ? 'png' : 'jpg', contentType: isPng ? 'image/png' : 'image/jpeg' };
  }

  const jpeg = await compressToJpeg(file, maxSizeKB);
  if (jpeg) return { blob: jpeg, ext: 'jpg', contentType: 'image/jpeg' };

  // แปลงไม่ได้ แต่ชนิดเดิมปลายทางรับได้อยู่แล้ว → ส่งดิบไป (แค่ไฟล์ใหญ่กว่าที่อยากได้)
  if (SENDABLE_IMAGE_TYPES.has(type)) {
    return { blob: file, ext: isPng ? 'png' : 'jpg', contentType: isPng ? 'image/png' : 'image/jpeg' };
  }
  throw new Error('ไฟล์รูปแบบนี้ส่งไม่ได้ (รองรับ JPG และ PNG) — บันทึกเป็น JPG ก่อนแล้วลองใหม่');
}

export const officialStickers = [
  { packageId: '1', stickers: ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17'] },
  { packageId: '2', stickers: ['18','19','20','21','22','23','24','25','26','27','28','29','30','31','32'] },
  { packageId: '3', stickers: ['180','181','182','183','184','185','186','187','188','189','190','191','192','193','194','195'] },
];
