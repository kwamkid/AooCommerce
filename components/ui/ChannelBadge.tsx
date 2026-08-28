'use client';

// Avatar ช่องทาง + ตัวห้อย platform icon มุมล่าง — ใช้ร่วม **ทุกจุด** ที่แสดงรูปโปรไฟล์
// ของช่องทาง (การ์ดออเดอร์ · หน้าช่องทางแชท · การ์ดร้าน marketplace)
//
// มีรูป → โชว์รูป + icon platform ห้อยมุม · ไม่มีรูป **หรือรูปโหลดไม่ขึ้น** → icon
// platform บนพื้นกลม · URL รูปโปรไฟล์ของ FB/IG/marketplace หมดอายุกันได้ตลอด
// ปล่อยให้ <img> พังเอง = เห็นไอคอนรูปแตก (เจอจริง 2026-08-28) จึงต้อง fallback เสมอ

import { useEffect, useState } from 'react';

export const PLATFORM_ICONS: Record<string, string> = {
  line: '/social/line_oa.svg',
  facebook: '/social/facebook.svg',
  instagram: '/social/instagram.svg',
  tiktok: '/marketplace/tiktok_shop.svg',
  shopee: '/marketplace/shopee.svg',
  lazada: '/marketplace/lazada.svg',
  line_shopping: '/marketplace/line_shopping.svg',
};

export interface ChannelBadgeChannel {
  platform: string;
  picture_url?: string | null;
}

export type ChannelBadgeSize = 'sm' | 'md' | 'lg';

const SIZES: Record<ChannelBadgeSize, { box: string; icon: string; corner: string }> = {
  sm: { box: 'w-6 h-6', icon: 'w-3.5 h-3.5', corner: 'w-3 h-3 -bottom-0.5 -left-0.5' },
  md: { box: 'w-10 h-10', icon: 'w-5 h-5', corner: 'w-4 h-4 -bottom-0.5 -left-0.5' },
  lg: { box: 'w-12 h-12', icon: 'w-6 h-6', corner: 'w-5 h-5 -bottom-1 -left-1' },
};

export default function ChannelBadge({
  channel,
  size = 'sm',
}: {
  channel?: ChannelBadgeChannel | null;
  size?: ChannelBadgeSize;
}) {
  const [broken, setBroken] = useState(false);
  const pictureUrl = channel?.picture_url || null;

  // เปลี่ยนรูป (เช่นกด refresh โลโก้) ต้องได้ลองโหลดใหม่ ไม่ใช่ค้างสถานะพังเดิม
  useEffect(() => { setBroken(false); }, [pictureUrl]);

  if (!channel) return null;
  const platformIcon = PLATFORM_ICONS[channel.platform];
  const s = SIZES[size];
  const showPicture = !!pictureUrl && !broken;

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className="relative">
        {showPicture ? (
          <img
            src={pictureUrl}
            alt=""
            className={`${s.box} rounded-full object-cover`}
            onError={() => setBroken(true)}
          />
        ) : (
          <div className={`${s.box} rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center`}>
            {platformIcon && <img src={platformIcon} alt="" className={s.icon} />}
          </div>
        )}
        {showPicture && platformIcon && (
          <img
            src={platformIcon}
            alt=""
            className={`absolute ${s.corner} rounded bg-white dark:bg-slate-800 p-[1px]`}
          />
        )}
      </div>
    </div>
  );
}
