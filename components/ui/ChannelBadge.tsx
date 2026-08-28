'use client';

// Avatar ช่องทางขาย + ตัวห้อย platform icon มุมล่าง — ใช้ร่วมทุกจุดที่แสดงที่มาของ order
// (มี avatar ร้าน → โชว์รูปร้าน + icon platform ห้อยมุม · ไม่มี → icon platform บนพื้นกลม)

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

export default function ChannelBadge({ channel }: { channel?: ChannelBadgeChannel | null }) {
  if (!channel) return null;
  const platformIcon = PLATFORM_ICONS[channel.platform];

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className="relative">
        {channel.picture_url ? (
          <img src={channel.picture_url} alt="" className="w-6 h-6 rounded-full object-cover" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center">
            {platformIcon && <img src={platformIcon} alt="" className="w-3.5 h-3.5" />}
          </div>
        )}
        {channel.picture_url && platformIcon && (
          <img src={platformIcon} alt="" className="absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded bg-white dark:bg-slate-800 p-[1px]" />
        )}
      </div>
    </div>
  );
}
