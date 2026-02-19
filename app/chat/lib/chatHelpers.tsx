import Image from 'next/image';
import type { ChatAccountInfo, UnifiedContact } from './chatTypes';

export function FbIcon({ size = 16 }: { size?: number }) {
  return <Image src="/social/facebook.svg" alt="Facebook" width={size} height={size} className="flex-shrink-0" />;
}

export function LineIcon({ size = 16 }: { size?: number }) {
  return <Image src="/social/line_oa.svg" alt="LINE" width={size} height={size} className="flex-shrink-0" />;
}

export function getAccountPicture(account: ChatAccountInfo): string | null {
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

export function compressImage(file: File, maxSizeKB = 500): Promise<Blob> {
  return new Promise((resolve) => {
    if (file.size <= maxSizeKB * 1024) { resolve(file); return; }
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
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.8;
      const tryCompress = () => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          if (blob.size <= maxSizeKB * 1024 || quality <= 0.3) { resolve(blob); }
          else { quality -= 0.1; tryCompress(); }
        }, 'image/jpeg', quality);
      };
      tryCompress();
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export const officialStickers = [
  { packageId: '1', stickers: ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17'] },
  { packageId: '2', stickers: ['18','19','20','21','22','23','24','25','26','27','28','29','30','31','32'] },
  { packageId: '3', stickers: ['180','181','182','183','184','185','186','187','188','189','190','191','192','193','194','195'] },
];
