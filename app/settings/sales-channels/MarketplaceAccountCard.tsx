'use client';

// การ์ดร้าน marketplace หนึ่งใบ — เปลือกเดียวใช้ทุก platform (Shopee / TikTok / Lazada)
// แทน markup ที่เคย copy กัน 3 ชุดใน MarketplaceConnections (แต่ละชุด drift กันเอง):
// ส่วนที่ต่างต่อ platform ส่งเข้ามาเป็น slot (avatar / body) — ส่วนที่เหมือนกัน
// (โครงการ์ด, บรรทัดสถานะ 3 แบบ, จำนวนสินค้าเชื่อมต่อ, ปุ่มลบ, ปุ่มขยาย) อยู่ที่นี่ที่เดียว

import { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Package, Trash2 } from 'lucide-react';
import ActionMenu from '@/components/ui/ActionMenu';
import FormSelect from '@/components/ui/FormSelect';
import type { MarketplaceAccount } from './useMarketplaceAccounts';

// ---------- ตัวเลือกช่วง sync ย้อนหลัง (เคย inline ซ้ำ 3 ชุด) ----------
const SYNC_RANGE_OPTIONS = [
  { id: '1', label: 'ย้อนหลัง 1 วัน' },
  { id: '3', label: 'ย้อนหลัง 3 วัน' },
  { id: '7', label: 'ย้อนหลัง 7 วัน' },
  { id: '15', label: 'ย้อนหลัง 15 วัน' },
  { id: '30', label: 'ย้อนหลัง 30 วัน' },
];

export function SyncRangeSelect({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <div className="w-44">
      <FormSelect
        value={String(value || 1)}
        onChange={v => onChange(parseInt(v))}
        options={SYNC_RANGE_OPTIONS}
        searchThreshold={99}
        portal
      />
    </div>
  );
}

// ---------- บรรทัดสถานะการเชื่อมต่อ (เดิม ternary ซ้ำ 3 ชุด — Lazada เคยหายไป 1 branch) ----------
function ConnectionStatusLine({ account }: { account: MarketplaceAccount }) {
  if (account.connection_status === 'connected') {
    return (
      <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> เชื่อมต่อแล้ว
      </span>
    );
  }
  if (account.connection_status === 'expired') {
    return (
      <span className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> Token หมดอายุ
      </span>
    );
  }
  return (
    <span className="text-gray-400 flex items-center gap-1">
      <XCircle className="w-3 h-3" /> ยกเลิกแล้ว
    </span>
  );
}

interface MarketplaceAccountCardProps {
  account: MarketplaceAccount;
  /** ช่องรูป/โลโก้ด้านซ้าย — Shopee เป็นปุ่มกดรีเฟรชโลโก้, TikTok/Lazada เป็น tile สีแบรนด์ */
  avatar: ReactNode;
  title: string;
  /** chip เสริมข้างชื่อ (เช่น region ของ TikTok) */
  titleExtra?: ReactNode;
  /** โชว์จำนวนสินค้าเชื่อมต่อในบรรทัดสถานะ (Shopee) */
  showProductCount?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onDisconnect: () => void;
  disconnecting?: boolean;
  /** เนื้อหาการ์ด (รายละเอียด/toggle/ปุ่ม sync) — expandable=true จะโชว์เฉพาะตอนกางออก */
  children?: ReactNode;
}

export default function MarketplaceAccountCard({
  account, avatar, title, titleExtra, showProductCount,
  expandable, expanded, onToggleExpand, onDisconnect, disconnecting, children,
}: MarketplaceAccountCardProps) {
  const bodyVisible = expandable ? expanded : true;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        {avatar}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900 dark:text-white truncate">{title}</p>
            {titleExtra}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
            <ConnectionStatusLine account={account} />
            <span className="ml-1">#{account.shop_id}</span>
            {showProductCount && account.linked_product_count > 0 && (
              <>
                <span className="mx-1">·</span>
                <span className="flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  {account.linked_product_count} สินค้าเชื่อมต่อ
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {expandable && (
            <button
              onClick={onToggleExpand}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              aria-label={expanded ? 'ย่อ' : 'ขยาย'}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          {/* ยกเลิกการเชื่อมต่อเป็นงานอันตราย — เก็บไว้ใน ⋮ เหมือนแท็บช่องทางของฉัน
              ไม่ใช่ถังขยะแดงลอยอยู่ข้างนอกให้กดพลาดได้ */}
          <ActionMenu
            placement="bottom"
            items={[{
              key: 'disconnect',
              label: disconnecting ? 'กำลังยกเลิก…' : 'ยกเลิกการเชื่อมต่อ',
              icon: <Trash2 className="w-4 h-4" />,
              danger: true,
              disabled: disconnecting,
              onClick: onDisconnect,
            }]}
          />
        </div>
      </div>

      {/* Body */}
      {bodyVisible && children && (
        <div className={`px-4 pb-4 space-y-3 ${expandable ? 'border-t border-gray-100 dark:border-slate-700 pt-3' : ''}`}>
          {children}
        </div>
      )}
    </div>
  );
}
