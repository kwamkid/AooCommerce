'use client';

// รายการร้านของขั้น "เลือกร้าน"
//
// ทำไมเป็นการ์ดเรียงลงมา ไม่ใช่ `AccountPicker` (ป๊อปอัป): ขั้นนี้ทั้งขั้น**มีอยู่เพื่อ
// เลือกร้านอย่างเดียว** และตัวเลขที่ใช้ตัดสินใจ ("ผูกสินค้าไว้กี่รายการ") กับเหตุผลที่
// ร้านนั้นกดไม่ได้ ต้องอ่านได้โดยไม่ต้องกดเปิดอะไรก่อน — ซ่อนไว้หลังปุ่มคือเพิ่มขั้นให้
// wizard ที่ตัวมันเองเป็นขั้นอยู่แล้ว (ป๊อปอัปเหมาะกับที่ที่การเลือกร้านเป็นแค่ตัวกรอง
// ข้างช่องอื่น เช่นหน้าแชท/บรอดแคสต์)
//
// ⛔ ห้าม `switch (platform)` — ป้ายชื่อมาจาก MARKETPLACE_PLATFORMS เสมอ

import ChannelBadge from '@/components/ui/ChannelBadge';
import { EmptyCard, LoadingCard } from '@/components/ui/StateCard';
import { MARKETPLACE_PLATFORMS } from '@/lib/marketplace/platforms';
import type { MarketplaceAccount } from '@/app/settings/sales-channels/useMarketplaceAccounts';
import type { JobDef } from './JobPicker';

export function platformOf(account: MarketplaceAccount): string {
  return account.platform || 'shopee';
}

export function platformLabelOf(account: MarketplaceAccount): string {
  return MARKETPLACE_PLATFORMS[platformOf(account) as keyof typeof MARKETPLACE_PLATFORMS]?.label || 'Marketplace';
}

export function shopNameOf(account: MarketplaceAccount): string {
  return account.shop_name || `Shop #${account.shop_id}`;
}

/**
 * ร้านที่ทำงานนี้ไม่ได้ **ยังต้องโชว์ในรายการ** พร้อมเหตุผล — ซ่อนทิ้งแล้วเจ้าของ
 * จะถามซ้ำว่า "ทำไมไม่เห็นร้าน GB TH"
 */
export function blockedReason(account: MarketplaceAccount, def: JobDef): string | null {
  if (account.connection_status === 'expired') {
    return `การเชื่อมต่อหมดอายุ — ไปที่แท็บ ${platformLabelOf(account)} แล้วกด "เชื่อมต่อใหม่" ก่อน`;
  }
  if (def.needsLinks && account.linked_product_count === 0) {
    return 'ยังไม่ได้ผูกสินค้ากับร้านนี้ — ทำ "นำเข้าสินค้าจากร้าน" ก่อน';
  }
  return null;
}

interface Props {
  accounts: MarketplaceAccount[];
  loading: boolean;
  job: JobDef;
  /** ร้านที่เลือกอยู่ — ใช้ตอนเปิดหน้าด้วยลิงก์ที่ระบุร้านมาแล้ว */
  value?: string | null;
  onSelect: (account: MarketplaceAccount) => void;
}

export default function ShopPicker({ accounts, loading, job, value, onSelect }: Props) {
  if (loading) return <LoadingCard />;
  if (accounts.length === 0) {
    return (
      <EmptyCard
        title="ยังไม่ได้เชื่อมต่อร้าน marketplace"
        subtitle="เชื่อมต่อร้านที่หน้าช่องทางการขายก่อน แล้วกลับมาที่นี่"
      />
    );
  }

  return (
    <div className="space-y-2">
      {accounts.map(account => {
        const reason = blockedReason(account, job);
        return (
          <button
            key={account.id}
            type="button"
            disabled={reason !== null}
            onClick={() => onSelect(account)}
            className={`choice-card w-full p-3 text-left flex items-center gap-3 ${
              value === account.id ? 'choice-card-active' : ''
            } ${reason ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-slate-700/40'}`}
          >
            <ChannelBadge
              channel={{
                platform: platformOf(account),
                picture_url: account.metadata?.shop_logo as string | undefined,
              }}
              size="md"
            />
            <span className="min-w-0 flex-1">
              <span className="block body-text font-medium truncate">{shopNameOf(account)}</span>
              <span className="block helper-text">
                {reason || `${platformLabelOf(account)} · ผูกสินค้าไว้ ${account.linked_product_count} รายการ`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
