// Path: app/marketing/audiences/components/SourceStep.tsx
//
// การ์ด "แหล่งที่มา" — เลือกว่าจะหยิบคนจากที่ไหนมารวมเป็นกลุ่มเดียว
//
// **มาหลังการ์ดกลุ่มเป้าหมาย** (เจ้าของสลับลำดับ 11 ก.ย. 2026) — พฤติกรรมที่เลือกเป็นตัวกำหนดว่า
// แหล่งไหนใช้ได้: ระบบติ๊กให้เองตอนเลือกพฤติกรรม (`defaultSourcesFor` ใน ./sources.ts) และแหล่งที่
// ตอบพฤติกรรมนั้นไม่ได้ขึ้นจาง กดไม่ได้ พร้อมเหตุผล — **ห้ามซ่อน**
//
// ต่างจากช่องทางของบรอดแคสต์ตรงที่ **ไม่ได้เลือกว่าจะส่งเข้าห้องไหน** แต่เลือกว่าจะเอา
// รายชื่อจากที่ไหน — ห้องแชท LINE/Facebook และ "ลูกค้าในระบบ" (ออเดอร์ / POS / หน้าร้าน)
// จึงติ๊กพร้อมกันได้ แล้วระบบตัดคนซ้ำให้ตอนรวม
//
// รูปแบบการ์ดติ๊ก (≤8 ใบวางในหน้า · มากกว่านั้นใช้ป๊อปอัป) ยืมมาจาก ChannelStep ของบรอดแคสต์
// — **ห้าม import ตัวนั้นมาใช้ตรง ๆ** เพราะมันกรองด้วยเงื่อนไข "ส่งบรอดแคสต์ได้ไหม"
// ซึ่งคนละเรื่องกับ "ดึงผู้ติดต่อมาทำกลุ่มได้ไหม"
'use client';

import Card from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';
import Checkbox from '@/components/ui/Checkbox';
import ChannelBadge from '@/components/ui/ChannelBadge';
import AccountPicker from '@/components/ui/AccountPicker';
import HelpHint from '@/components/ui/HelpHint';
import { BROADCAST_PLATFORMS } from '@/lib/broadcast/platforms';
import { audienceSourceUnsupportedReason } from '@/lib/broadcast/audience';
import { Users } from 'lucide-react';
import type { ChatSourceAccount } from './types';

/** เกินเท่านี้แล้วการ์ดจะยาวจนดันเนื้อหาที่เหลือตกจอ → เปลี่ยนไปใช้ป๊อปอัปแทน */
const INLINE_MAX = 8;

/**
 * บรรทัดรองของการ์ด LINE ที่ติ๊กได้ — ระบบไม่ติ๊ก LINE ให้เอง (ขึ้น Meta ได้น้อยมาก)
 * บรรทัดนี้บอกว่าจะติ๊กเมื่อไหร่ถึงคุ้ม
 */
const LINE_NOTE = 'เหมาะกับบรอดแคสต์ LINE';

interface Props {
  accounts: ChatSourceAccount[];
  chatIds: string[];
  onChatIdsChange: (ids: string[]) => void;
  includeCustomers: boolean;
  onIncludeCustomersChange: (v: boolean) => void;
  /** พฤติกรรมที่เลือกไว้ — ว่าง = ยังไม่เลือก การ์ดนี้บอกให้เลือกพฤติกรรมก่อน */
  audienceType: string;
  loading?: boolean;
  disabled?: boolean;
}

export default function SourceStep({
  accounts, chatIds, onChatIdsChange, includeCustomers, onIncludeCustomersChange,
  audienceType, loading, disabled,
}: Props) {
  const toggle = (id: string) => {
    onChatIdsChange(chatIds.includes(id) ? chatIds.filter(x => x !== id) : [...chatIds, id]);
  };

  const customersReason = audienceSourceUnsupportedReason('customers', audienceType);
  const customersActive = includeCustomers && !customersReason;
  const customersCard = (
    <Checkbox
      checked={customersActive}
      onChange={() => onIncludeCustomersChange(!includeCustomers)}
      disabled={disabled || !!customersReason}
      className={`choice-card px-3 py-2.5 ${customersActive ? 'choice-card-active' : ''} ${customersReason ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="w-10 h-10 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 flex items-center justify-center flex-shrink-0">
          <Users className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="body-text truncate">ลูกค้าในระบบ</p>
          <p className="subtitle-text">{customersReason || 'ออเดอร์ทุกช่องทาง รวม Shopee, Lazada, TikTok'}</p>
        </div>
      </div>
    </Checkbox>
  );

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        {/* เพดานความรู้ของระบบ — ไม่บอกไว้ ผู้ใช้จะงงว่าทำไมกลุ่ม 1,400 คนส่งขึ้น Meta ได้ 20 คน
            เดิมเป็นบรรทัดถาวรใต้การ์ด ("นับได้แต่ sync ไม่ได้") ซึ่งเจ้าของอ่านแล้วไม่เข้าใจ
            (11 ก.ย. 2026) — ย้ายมาเป็น HelpHint พร้อมเขียนใหม่ไม่ใช้คำว่า sync */}
        <h2 className="heading-4">
          แหล่งที่มา
          <HelpHint>
            Meta หาตัวคนได้จากเบอร์โทร อีเมล หรือ Messenger เท่านั้น · คนจาก LINE นับรวมในกลุ่มได้
            แต่ส่งขึ้น Meta ไม่ได้ เพราะ LINE ไม่ให้เบอร์หรืออีเมล จนกว่าห้องแชทนั้นจะผูกกับลูกค้าที่มีเบอร์
            เช่นตอนเปิดบิลจากแชท · ลูกค้าที่ซื้อผ่าน Shopee, Lazada, TikTok ก็เหมือนกัน แพลตฟอร์มไม่ส่งเบอร์
            หรืออีเมลของผู้ซื้อมาให้ร้าน
          </HelpHint>
        </h2>
        <span className="section-desc text-right">
          ติ๊กให้ตามกลุ่มเป้าหมาย แก้ได้ · คนซ้ำนับครั้งเดียว
        </span>
      </div>

      {loading ? (
        <p className="subtitle-text">กำลังโหลดช่องทาง...</p>
      ) : !audienceType ? (
        <p className="subtitle-text">เลือกกลุ่มเป้าหมายด้านบนก่อน ระบบจะติ๊กแหล่งที่มีข้อมูลนั้นให้</p>
      ) : accounts.length === 0 ? (
        <div className="space-y-2">
          <Alert tone="info">
            ยังไม่มีช่องทางแชทที่ดึงผู้ติดต่อได้ — เพิ่ม LINE OA หรือเพจ Facebook ที่ ตั้งค่า &gt; ช่องทาง Chat
            แล้วจะเลือกเป็นแหล่งที่มาได้
          </Alert>
          {customersCard}
        </div>
      ) : accounts.length <= INLINE_MAX ? (
        <div className="grid sm:grid-cols-2 gap-2">
          {accounts.map(a => {
            const reason = audienceSourceUnsupportedReason(a.platform, audienceType);
            const active = chatIds.includes(a.id) && !reason;
            const note = reason
              || (a.platform === 'line'
                ? `${BROADCAST_PLATFORMS.line.label} · ${LINE_NOTE}`
                : BROADCAST_PLATFORMS[a.platform].label);
            return (
              <Checkbox
                key={a.id}
                checked={active}
                onChange={() => toggle(a.id)}
                disabled={disabled || !!reason}
                className={`choice-card px-3 py-2.5 ${active ? 'choice-card-active' : ''} ${reason ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <ChannelBadge channel={{ platform: a.platform, picture_url: a.picture_url }} size="md" />
                  <div className="min-w-0">
                    <p className="body-text truncate">{a.name}</p>
                    <p className="subtitle-text">{note}</p>
                  </div>
                </div>
              </Checkbox>
            );
          })}
          {customersCard}
        </div>
      ) : (
        <div className="space-y-2">
          <AccountPicker
            accounts={accounts.map(a => {
              const reason = audienceSourceUnsupportedReason(a.platform, audienceType);
              return {
                id: a.id,
                platform: a.platform,
                name: a.name,
                picture_url: a.picture_url,
                badge: BROADCAST_PLATFORMS[a.platform].label,
                disabled: !!reason,
                disabledReason: reason || undefined,
              };
            })}
            value={chatIds}
            onChange={onChatIdsChange}
            disabled={disabled}
            placeholder="เลือกช่องทางแชทที่จะดึงผู้ติดต่อ (เลือกได้หลายอัน)"
          />
          {customersCard}
        </div>
      )}
    </Card>
  );
}
