'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ChatAccountInfo, UnifiedContact, ChatMessage } from './chatTypes';
import { roomMosaicPictures } from '@/lib/chat/line-room-identity';

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
/**
 * ที่มาของ referral เป็นคำไทย — ใช้ทั้งการ์ดหัวสายสนทนา หัวหน้าคุย และประวัติในแผงโปรไฟล์
 * (ค่าที่แปลไม่ได้คืนของเดิมไป ดีกว่าเดาแล้วบอกผิด)
 */
export function referralSourceLabel(source?: string | null): string {
  if (source === 'ADS') return 'โฆษณา';
  if (source === 'SHORTLINK') return 'ลิงก์ m.me';
  if (source === 'CUSTOMER_CHAT_PLUGIN') return 'ปุ่มแชทบนเว็บไซต์';
  return source || 'ลิงก์';
}

/** โพสต์ต้นทางของโฆษณา — สื่อจริง (รูป/วิดีโอ) อยู่ที่โพสต์ ไม่ใช่ที่ URL ใน referral */
export function referralPostUrl(postId?: string | null): string | null {
  return postId ? `https://www.facebook.com/${postId}` : null;
}

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

/**
 * อวาตาร์ของผู้ติดต่อ — ใช้ทุกที่ที่ต้องวาดรูปคน/ห้อง (รายชื่อ · หัวห้อง)
 *
 * 3 กรณีเรียงตามลำดับ:
 *   1. มีรูปของตัวเอง       → รูปเดียวเต็มวง
 *   2. ห้อง LINE ที่ไม่มีรูป → **โมเสกจากรูปสมาชิก** แบบเดียวกับแอป LINE
 *      (LINE ไม่มี API บอกชื่อ/รูปของ room — ดู lib/chat/line-room-identity.ts)
 *   3. ไม่มีอะไรเลย         → วงกลมสีช่องทาง + ตัวอักษรย่อ
 */
export function ContactAvatar({ contact, sizeClass, color }: {
  contact: UnifiedContact;
  /** เช่น 'w-12 h-12' — ผู้เรียกคุมขนาดเอง */
  sizeClass: string;
  /** สีพื้นตอนไม่มีรูป (สีประจำช่องทาง) */
  color: string;
}) {
  const single = getAvatarUrl(contact);
  if (single) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={single} alt={contact.display_name} loading="lazy" className={`${sizeClass} rounded-full object-cover`} />;
  }

  const mosaic = roomMosaicPictures(contact.member_profiles);
  if (mosaic.length > 0) {
    return (
      <div className={`${sizeClass} rounded-full overflow-hidden grid grid-cols-2 grid-rows-2 bg-gray-100 dark:bg-slate-700`}>
        {mosaic.map((url, i) => (
          // 1 รูป = เต็มวง · 2 รูป = ผ่าครึ่งซ้ายขวา · 3 รูป = ซ้ายเต็มสูง + ขวาซ้อนสองช่อง · 4 รูป = 2x2
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt=""
            loading="lazy"
            className={`w-full h-full object-cover ${
              mosaic.length === 1 ? 'col-span-2 row-span-2'
                : mosaic.length === 2 ? 'row-span-2'
                : mosaic.length === 3 && i === 0 ? 'row-span-2' : ''
            }`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center text-white font-semibold`} style={{ backgroundColor: color }}>
      {getInitials(contact.nickname || contact.display_name)}
    </div>
  );
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
function compressToJpeg(file: Blob, maxSizeKB: number): Promise<Blob | null> {
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

/**
 * ไฟล์นี้เป็น HEIC/HEIF ไหม — **ต้องดูนามสกุลด้วย ไม่ใช่ดูแค่ `file.type`**
 * Chrome บน Windows ให้ `type` เป็นสตริงว่างกับ .heic บ่อย ๆ (ระบบไม่รู้จักชนิดนี้)
 */
function looksLikeHeic(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/heic' || type === 'image/heif' || type.startsWith('image/heic') || type.startsWith('image/heif')) return true;
  return /\.(heic|heif)$/i.test(file.name || '');
}

/** ไฟล์นี้พอจะเป็นรูปไหม (เช็คเร็ว ไม่อ่านไฟล์) — ใช้แทน `file.type.startsWith('image/')` ที่ตกไฟล์ type ว่าง */
export function looksLikeImageFile(file: File): boolean {
  if ((file.type || '').toLowerCase().startsWith('image/')) return true;
  return /\.(jpe?g|jfif|jpe|pjpe?g|png|gif|webp|bmp|dib|heic|heif|avif|tiff?)$/i.test(file.name || '');
}

/**
 * อ่านไบต์แรกของไฟล์แล้วบอกว่าเป็นรูปชนิดไหน — **ความจริงอยู่ในไฟล์ ไม่ใช่ในชื่อหรือ `type`**
 * Chrome บน Windows ให้ `type` ว่างกับไฟล์ที่ระบบไม่รู้จักนามสกุล และรูปที่เซฟจาก LINE/เว็บ
 * มาชื่อแปลก ๆ หรือไม่มีนามสกุลได้ (เจ้าของแจ้ง "ส่งรูปไม่ได้ — ข้ามไฟล์ที่ไม่ใช่รูปภาพ" 9 ก.ย. 2026)
 * คืน null เมื่อไม่ใช่รูปที่รู้จัก หรืออ่านไฟล์ไม่ได้
 */
export async function sniffImageMime(file: File): Promise<string | null> {
  let b: Uint8Array;
  try {
    b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  } catch {
    return null;
  }
  if (b.length < 4) return null;
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 3) === 'GIF') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)) return 'image/tiff';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return null;
}

/**
 * ไฟล์เอกสารที่ส่งทางแชทได้ **แบบลิงก์** — อัปขึ้น Storage แล้วส่ง URL ให้ลูกค้าโหลด
 *
 * แชททุกแพลตฟอร์มที่เราต่ออยู่ส่งไฟล์แนบตรง ๆ ไม่ได้ (LINE Messaging API ไม่มีชนิดข้อความสำหรับไฟล์ ·
 * Shopee/Lazada/TikTok รับแค่รูป) · เคยลองแปลง PDF เป็นรูปแล้วเจ้าของบอก "ไม่ชัด" (9 ก.ย. 2026)
 * จึงเปลี่ยนเป็นส่งไฟล์ต้นฉบับผ่านลิงก์สาธารณะแทน — ชัดเท่าต้นฉบับ และรับได้หลายชนิด
 *
 * รายการนี้คือ "ของที่ลูกค้าเปิดได้แน่ ๆ" — ไฟล์ที่รันได้ (exe/bat/sh/js…) ไม่รับ กันส่งของอันตรายไปหาลูกค้า
 */
const DOC_TYPES: Record<string, { mime: string; label: string }> = {
  pdf: { mime: 'application/pdf', label: 'PDF' },
  doc: { mime: 'application/msword', label: 'Word' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word' },
  xls: { mime: 'application/vnd.ms-excel', label: 'Excel' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel' },
  ppt: { mime: 'application/vnd.ms-powerpoint', label: 'PowerPoint' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint' },
  txt: { mime: 'text/plain', label: 'ข้อความ' },
  csv: { mime: 'text/csv', label: 'CSV' },
  zip: { mime: 'application/zip', label: 'ZIP' },
  rar: { mime: 'application/vnd.rar', label: 'RAR' },
  '7z': { mime: 'application/x-7z-compressed', label: '7z' },
  mp4: { mime: 'video/mp4', label: 'วิดีโอ' },
  mov: { mime: 'video/quicktime', label: 'วิดีโอ' },
  mp3: { mime: 'audio/mpeg', label: 'เสียง' },
  m4a: { mime: 'audio/mp4', label: 'เสียง' },
};
export const DOC_ACCEPT = Object.keys(DOC_TYPES).map(e => `.${e}`).join(',');
export const DOC_KIND_LABELS = 'PDF, Word, Excel, PowerPoint, ZIP, วิดีโอ, เสียง';
export const DOC_MAX_BYTES = 25 * 1024 * 1024;

/** เป็นไฟล์เอกสารที่ส่งเป็นลิงก์ได้ไหม — คืน mime ที่ควรใช้ตอนอัป (ไฟล์จาก Windows มี type ว่างบ่อย) */
export function documentKind(file: File): { mime: string; label: string } | null {
  const ext = (file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!ext) return null;
  const known = DOC_TYPES[ext];
  if (!known) return null;
  return { mime: (file.type || '').trim() || known.mime, label: known.label };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** เป็นรูปไหม — เช็คชื่อ/`type` ก่อน (เร็ว) ไม่ผ่านค่อยอ่านไบต์แรกของไฟล์ */
export async function isImageFile(file: File): Promise<boolean> {
  if (looksLikeImageFile(file)) return true;
  return (await sniffImageMime(file)) !== null;
}

/**
 * แปลง HEIC/HEIF → JPEG ในเครื่องผู้ใช้ ด้วย libheif (wasm) ของ heic2any
 * โหลดแบบ dynamic **เฉพาะตอนเจอไฟล์ HEIC จริง ๆ** — ก้อนนี้ 1.3MB คนที่ส่ง JPG/PNG
 * ตามปกติจะไม่โดนดาวน์โหลดเลย · คืน null เมื่อแปลงไม่สำเร็จ
 */
async function heicToJpeg(file: File): Promise<Blob | null> {
  try {
    const heic2any = (await import('heic2any')).default;
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    // HEIC หนึ่งไฟล์เก็บได้หลายภาพ (Live Photo / burst) — เอาภาพแรกพอ
    const blob = Array.isArray(out) ? out[0] : out;
    return blob instanceof Blob ? blob : null;
  } catch (err) {
    console.error('HEIC → JPEG conversion failed:', err);
    return null;
  }
}

export interface PreparedChatImage { blob: Blob; ext: string; contentType: string }

/**
 * เตรียมรูปให้พร้อมส่งเข้าแชท — คืนชนิด/นามสกุล **ตามของจริง** ไม่ใช่ฝัง .jpg ไว้เฉย ๆ
 * (ของเดิมอัปไฟล์ PNG/WebP/HEIC ด้วยชื่อ .jpg + content-type image/jpeg ปลายทางจึงเห็นรูปเสีย)
 *
 * ลำดับ: ชนิดที่ส่งได้อยู่แล้วและเล็กพอ → ให้ canvas ย่อ (Safari/iOS ถอดรหัส HEIC เองได้ตรงนี้)
 * → ถ้าเป็น HEIC ที่เบราว์เซอร์ถอดไม่ได้ (Chrome/Edge/Firefox บนคอม) ค่อยลาก libheif มาแปลง
 */
export async function prepareChatImage(
  file: File,
  maxSizeKB = 500,
  /** เรียกเมื่อ **ต้องลาก libheif มาแปลงจริง ๆ** เท่านั้น (Safari ถอด HEIC เองได้ จะไม่เรียก)
   *  ใช้บอกผู้ใช้ว่ากำลังแปลงอยู่ — รูป 12MP ใช้เวลาไม่กี่วินาทีแต่ก็นานพอให้คนสงสัยว่าค้าง */
  onHeicConvert?: () => void,
): Promise<PreparedChatImage> {
  const type = (file.type || '').toLowerCase();
  const isPng = type === 'image/png';
  const asIs = (): PreparedChatImage => ({
    blob: file,
    ext: isPng ? 'png' : 'jpg',
    contentType: isPng ? 'image/png' : 'image/jpeg',
  });
  const jpeg = (blob: Blob): PreparedChatImage => ({ blob, ext: 'jpg', contentType: 'image/jpeg' });

  // เล็กพออยู่แล้วและเป็นชนิดที่ปลายทางรับได้ → ส่งของเดิม คุณภาพไม่ต้องเสียไปกับการแปลง
  if (file.size <= maxSizeKB * 1024 && SENDABLE_IMAGE_TYPES.has(type)) return asIs();

  const compressed = await compressToJpeg(file, maxSizeKB);
  if (compressed) return jpeg(compressed);

  // เบราว์เซอร์ถอดรหัสไฟล์นี้ไม่ได้ — ถ้าเป็น HEIC จาก iPhone ให้ libheif แปลงให้ แล้วย่อซ้ำ
  if (looksLikeHeic(file)) {
    onHeicConvert?.();
    const converted = await heicToJpeg(file);
    if (converted) return jpeg((await compressToJpeg(converted, maxSizeKB)) || converted);
    throw new Error('แปลงไฟล์ HEIC ไม่สำเร็จ — ลองบันทึกรูปเป็น JPG แล้วส่งใหม่');
  }

  // แปลงไม่ได้ แต่ชนิดเดิมปลายทางรับได้อยู่แล้ว → ส่งดิบไป (แค่ไฟล์ใหญ่กว่าที่อยากได้)
  if (SENDABLE_IMAGE_TYPES.has(type)) return asIs();
  throw new Error('ไฟล์รูปแบบนี้ส่งไม่ได้ (รองรับ JPG และ PNG) — บันทึกเป็น JPG ก่อนแล้วลองใหม่');
}

export const officialStickers = [
  { packageId: '1', stickers: ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17'] },
  { packageId: '2', stickers: ['18','19','20','21','22','23','24','25','26','27','28','29','30','31','32'] },
  { packageId: '3', stickers: ['180','181','182','183','184','185','186','187','188','189','190','191','192','193','194','195'] },
];


/**
 * รวมรูปชุดเดียวกันให้เป็น "อัลบั้ม" ฟองเดียว — แบบเดียวกับที่แอป LINE แสดง
 *
 * เกณฑ์: ข้อความติดกัน · ทิศทางเดียวกัน · เป็นรูป · มี `raw_message.image_set.id` ตรงกัน
 * (LINE ใส่ id นี้มาให้เองตอนลูกค้าส่งหลายรูปรวดเดียว ส่วนขาออกของเราใส่เองตอนส่งเป็นชุด)
 *
 * ⚠️ **รวมใบที่กำลังส่งด้วย** — เจ้าของขอให้เห็นเป็นอัลบั้มตั้งแต่กดส่ง ไม่ใช่ฟองแยก 3 ใบ
 *    แล้วค่อยกลายเป็นอัลบั้มตอนเสร็จ (ภาพกระโดด) · ใบที่ยังไม่เสร็จจางพร้อมวงหมุนในช่องของตัวเอง
 * ⚠️ ใบที่ **ส่งไม่สำเร็จไม่รวม** — ต้องแยกออกมาให้เห็นสถานะและปุ่มลองใหม่รายใบ
 * ⚠️ คืน "ข้อความสังเคราะห์" สำหรับวาดเท่านั้น ห้ามเอาไปเขียน DB หรือใช้แทน messages
 *    (lightbox ยังอ่านจาก messages ตัวจริง รูปทุกใบจึงยังอยู่ในแกลเลอรีครบ)
 */
export function groupImageAlbums(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let i = 0;

  const groupable = (m: ChatMessage) =>
    m.message_type === 'image'
    && !!m.raw_message?.imageUrl
    && !!m.raw_message?.image_set?.id
    && m._status !== 'failed';

  while (i < messages.length) {
    const head = messages[i];
    if (!groupable(head)) { out.push(head); i += 1; continue; }

    const setId = head.raw_message!.image_set!.id;
    let j = i + 1;
    while (
      j < messages.length
      && groupable(messages[j])
      && messages[j].raw_message!.image_set!.id === setId
      && messages[j].direction === head.direction
    ) j += 1;

    if (j - i < 2) { out.push(head); i += 1; continue; }

    // เรียงตามลำดับที่ผู้ส่งตั้งใจ — LINE ยิงรูปแต่ละใบเป็นคนละ event มาถึงสลับกันได้
    const members = messages.slice(i, j).slice().sort(
      (a, b) => (a.raw_message?.image_set?.index ?? 0) - (b.raw_message?.image_set?.index ?? 0)
    );
    const anyPending = members.some(m => m._status === 'sending');
    out.push({
      ...head,
      _status: anyPending ? 'sending' : head._status,
      message_type: 'image_album',
      content: `[รูปภาพ ${members.length} รูป]`,
      raw_message: {
        ...head.raw_message,
        album: members.map(m => ({
          url: m.raw_message!.imageUrl!,
          messageId: m.id,
          pending: m._status === 'sending',
        })),
      },
    });
    i = j;
  }
  return out;
}
