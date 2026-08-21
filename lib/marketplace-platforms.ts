// Path: lib/marketplace-platforms.ts
// รายชื่อแพลตฟอร์มที่นับเป็น "marketplace" — ที่เดียวของทั้งระบบ
//
// ทั้งสามตัวนี้ทำงานเหมือนกันหมด: เก็บใน marketplace_accounts, มี OAuth,
// webhook, cron sync ของตัวเอง และถูกเปิด/ปิดด้วย feature flag `marketplace_sync`
// ตัวเดียวกัน — เพิ่มแพลตฟอร์มใหม่ (Shopify, LINE Shopping ฯลฯ) ให้เพิ่มที่นี่
// แล้วทุกจุดที่ซ่อน/แสดงตาม flag จะตามให้เอง
export const MARKETPLACE_PLATFORMS = ['shopee', 'lazada', 'tiktok'] as const;

export type MarketplacePlatform = (typeof MARKETPLACE_PLATFORMS)[number];

export function isMarketplacePlatform(platform?: string | null): boolean {
  return !!platform && (MARKETPLACE_PLATFORMS as readonly string[]).includes(platform.toLowerCase());
}
