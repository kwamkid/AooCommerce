// Path: app/marketing/broadcast/new/components/ChannelStep.tsx
//
// การ์ด "ช่องทาง" ของขั้นที่ 1 — เลือกบัญชีที่จะใช้ส่ง (ติ๊กได้หลายใบ)
//
// บัญชีน้อย (≤8) วางเป็นการ์ดในหน้าเลยจะเร็วกว่าเปิดป๊อปอัปทีละครั้ง · มากกว่านั้น
// เรียงลงมาทั้งหมดจะดันเนื้อหาตกจอ (ABC the Baby มี FB 7 เพจ · Shopee 6 ร้าน) → AccountPicker
'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import Checkbox from '@/components/ui/Checkbox';
import ChannelBadge from '@/components/ui/ChannelBadge';
import AccountPicker from '@/components/ui/AccountPicker';
import PlatformIcon from '@/components/ui/PlatformIcon';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  BROADCAST_PLATFORMS,
  BROADCAST_PLATFORM_LIST,
  canBroadcastVia,
} from '@/lib/broadcast/platforms';
import type { BroadcastAccount } from './types';

/** เกินเท่านี้แล้วการ์ดจะยาวจนดันเนื้อหาที่เหลือตกจอ → เปลี่ยนไปใช้ป๊อปอัปแทน */
const INLINE_MAX = 8;

interface Props {
  accounts: BroadcastAccount[];
  /** ยังโหลดรายชื่อบัญชีไม่เสร็จ — วาดโครงแทน ไม่ใช่ข้อความ "ยังไม่มีช่องทาง" */
  loading?: boolean;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export default function ChannelStep({ accounts, loading, value, onChange, disabled }: Props) {
  const [showReasons, setShowReasons] = useState(false);
  const pending = BROADCAST_PLATFORM_LIST.filter(p => !canBroadcastVia(p.id));

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  };

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="heading-4">ช่องทาง</h2>
        <span className="section-desc text-right">
          เลือกได้หลายบัญชี · เนื้อหาชุดเดียวยิงได้ทุกใบ
        </span>
      </div>

      {loading ? (
        // ระหว่างโหลดรายชื่อบัญชี — ห้ามขึ้น "ยังไม่มีช่องทาง" (เจ้าของเห็นแวบแล้วนึกว่ายังไม่ได้เพิ่ม OA)
        <div className="grid sm:grid-cols-2 gap-2" aria-busy="true" aria-label="กำลังโหลดช่องทาง">
          <Skeleton className="h-[62px] rounded-lg" />
          <Skeleton className="h-[62px] rounded-lg" />
        </div>
      ) : accounts.length === 0 ? (
        <Alert tone="warning">
          ยังไม่มีช่องทางที่ส่งได้ — เพิ่ม LINE OA ที่ ตั้งค่า &gt; ช่องทาง Chat ก่อน
        </Alert>
      ) : accounts.length <= INLINE_MAX ? (
        <div className="grid sm:grid-cols-2 gap-2">
          {accounts.map(a => {
            const active = value.includes(a.id);
            return (
              <Checkbox
                key={a.id}
                checked={active}
                onChange={() => toggle(a.id)}
                disabled={disabled}
                className={`choice-card px-3 py-2.5 ${active ? 'choice-card-active' : ''}`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <ChannelBadge channel={{ platform: a.platform, picture_url: a.picture_url }} size="md" />
                  <div className="min-w-0">
                    <p className="body-text truncate">{a.name}</p>
                    <p className="subtitle-text">
                      {BROADCAST_PLATFORMS[a.platform].label}
                    </p>
                  </div>
                </div>
              </Checkbox>
            );
          })}
        </div>
      ) : (
        <AccountPicker
          accounts={accounts.map(a => ({
            id: a.id,
            platform: a.platform,
            name: a.name,
            picture_url: a.picture_url,
            badge: BROADCAST_PLATFORMS[a.platform].label,
          }))}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder="เลือกช่องทางที่จะใช้ส่ง (เลือกได้หลายอัน)"
        />
      )}

      {/* ช่องทางที่ยังส่งไม่ได้ — **ห้ามซ่อน** ไม่งั้นผู้ใช้จะถามซ้ำว่าทำไมไม่มี Shopee
          หนึ่งบรรทัดต่อแพลตฟอร์ม (ไม่ใช่ต่อบัญชี) จะได้ไม่ต้องยิง API โหลดร้าน/เพจของเจ้าที่ใช้ไม่ได้ */}
      {pending.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1">
              {pending.map(p => <PlatformIcon key={p.id} id={p.id} size={14} title={p.label} />)}
            </span>
            <span className="subtitle-text">
              {pending.map(p => p.label).join(' · ')} — ยังส่งไม่ได้
            </span>
            <Button variant="ghost" size="sm" onClick={() => setShowReasons(v => !v)}>
              {showReasons ? 'ซ่อนเหตุผล' : 'ดูเหตุผล'}
            </Button>
          </div>
          {showReasons && (
            <ul className="mt-2 space-y-1.5">
              {pending.map(p => (
                <li key={p.id} className="subtitle-text">
                  <span className="font-medium">{p.label}</span> — {p.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
