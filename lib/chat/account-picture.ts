// รูปประจำช่องทางแชท (โลโก้ร้าน / รูปเพจ / รูป OA) — resolve ที่เดียว
//
// ใช้ร่วม 2 ที่: รายการช่องทางใน `/api/chat-accounts` (แสดงในหน้าตั้งค่า) และ
// `/api/push/icon` (ไอคอนบนแจ้งเตือน) — กฎว่ารูปของแต่ละแพลตฟอร์มอยู่ไหน
// ต้องเป็นกฎเดียวกัน ไม่งั้นไอคอนบนแจ้งเตือนกับรูปในหน้าตั้งค่าจะไม่ใช่รูปเดียวกัน

export interface AccountPictureOptions {
  /**
   * ขนาดรูปเพจของ Facebook — `small` (~50px) พอสำหรับ avatar ในรายการ
   * แต่ไอคอนแจ้งเตือนต้อง 192px จึงต้องขอ `large` ไม่งั้นได้รูปเบลอ
   */
  facebookSize?: 'small' | 'large';
}

/**
 * @param shopLogos map `marketplace_account_id` → `metadata.shop_logo`
 *   (แชท marketplace ไม่มีรูปใน credentials ของตัวเอง — โลโก้ร้านอยู่ที่ marketplace_accounts)
 */
export function resolveAccountPicture(
  platform: string,
  creds: Record<string, unknown> | null,
  shopLogos: Record<string, string>,
  opts: AccountPictureOptions = {}
): string | null {
  const mpId = creds?.marketplace_account_id;
  if (typeof mpId === 'string' && shopLogos[mpId]) return shopLogos[mpId];

  if (!creds) return null;
  if (platform === 'line') return (creds.bot_picture_url as string) || null;
  if (platform === 'facebook') {
    const pageId = creds.page_id as string | undefined;
    // Graph API เปิดรูปเพจให้ดึงได้โดยไม่ต้องใช้ token — ไม่ต้องเก็บ URL ที่หมดอายุ
    if (pageId) return `https://graph.facebook.com/${pageId}/picture?type=${opts.facebookSize || 'small'}`;
    return (creds.page_picture_url as string) || (creds.ig_profile_picture_url as string) || null;
  }
  return null;
}
