// Path: lib/utils/image.ts

/**
 * แปลง Google Drive share URL ให้เป็น direct image URL
 * รองรับทุก format ของ Google Drive URL
 *
 * @param url - URL ของรูปภาพ (Google Drive share link หรือ URL ปกติ)
 * @returns Direct image URL ที่สามารถแสดงได้
 *
 * @example
 * // Google Drive share link (format 1)
 * getImageUrl('https://drive.google.com/file/d/1ABC123/view?usp=sharing')
 * // Returns: 'https://drive.google.com/uc?id=1ABC123'
 *
 * // Google Drive share link (format 2)
 * getImageUrl('https://drive.google.com/file/d/1ABC123/view')
 * // Returns: 'https://drive.google.com/uc?id=1ABC123'
 *
 * // Google Drive open link
 * getImageUrl('https://drive.google.com/open?id=1ABC123')
 * // Returns: 'https://drive.google.com/uc?id=1ABC123'
 *
 * // ปกติ URL
 * getImageUrl('https://example.com/image.jpg')
 * // Returns: 'https://example.com/image.jpg'
 */
export function getImageUrl(url?: string | null): string {
  if (!url) return '';

  // Supabase Storage URL - ใช้ตรงๆ ไม่ต้องผ่าน proxy
  if (url.includes('supabase.co/storage')) {
    return url;
  }

  // ถ้าไม่ใช่ Google Drive link ให้ return ตามเดิม
  if (!url.includes('drive.google.com')) {
    return url;
  }

  // ถ้าเป็น direct link อยู่แล้ว ให้ใช้ตามเดิม
  if (url.includes('drive.google.com/uc?id=') || url.includes('drive.google.com/thumbnail?id=')) {
    return url;
  }

  // Extract file ID จาก Google Drive URL formats ต่างๆ
  let fileId: string | null = null;

  // Format 1: https://drive.google.com/file/d/{FILE_ID}/view
  const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1) {
    fileId = match1[1];
  }

  // Format 2: https://drive.google.com/open?id={FILE_ID}
  // Format 3: https://drive.google.com/uc?export=view&id={FILE_ID}
  if (!fileId) {
    const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match2) {
      fileId = match2[1];
    }
  }

  // ถ้าเจอ file ID ให้แปลงเป็น direct link ผ่าน proxy
  if (fileId) {
    // ใช้ API proxy เพื่อแก้ปัญหา CORS
    const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    return `/api/image-proxy?url=${encodeURIComponent(driveUrl)}`;
  }

  // ถ้าแปลงไม่ได้ ให้ return ตามเดิม
  return url;
}
