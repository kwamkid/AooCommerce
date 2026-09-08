// Path: app/marketing/broadcast/new/components/SummaryRail.tsx
//
// แผงขวาที่ตรึงไว้ — จำนวนผู้รับ · โควตา · สรุปสิ่งที่เลือก · ปุ่มเดินหน้า · ตัวอย่าง
//
// สองอย่างนี้ต้องเห็นตลอดเวลาที่แก้ข้อความ ไม่ใช่ต้องเลื่อนกลับขึ้นไปดู:
// "ยิงถึงกี่คน" (ตัวเลขที่ตัดสินใจว่าคุ้มไหม) และ "ลูกค้าจะเห็นหน้าตาแบบไหน"
'use client';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import PlatformIcon from '@/components/ui/PlatformIcon';
import { ProgressBar } from '@/components/ui/Chart';
import BroadcastPreview from '@/components/broadcast/BroadcastPreview';
import type { BroadcastContent } from '@/lib/broadcast/content';
import type { BroadcastPlatform } from '@/lib/broadcast/platforms';
import { ArrowRight, Clock, Send } from 'lucide-react';
import type { FollowerStats, PerAccountPreview } from './types';

interface Props {
  step: 1 | 2;

  recipientCount: number;
  previewLoading: boolean;
  /** ผู้ติดต่อทั้งหมดของช่องทาง — ใช้เป็นตัวหารของแถบสัดส่วน (ไม่รู้ = ไม่วาดแถบ) */
  contactTotal: number | null;
  /** โหมด 'all' ยิงถึงคนที่เราไม่มีรายชื่อ เทียบสัดส่วนกับผู้ติดต่อไม่ได้ */
  hideProgress: boolean;
  quotaText: string | null;
  followerStats: FollowerStats | null;
  showFollowerStats: boolean;
  perAccount: PerAccountPreview[];
  shortAccounts: PerAccountPreview[];
  noRecipientsMessage: string | null;
  contentError: string | null;
  hasDraft: boolean;
  showLineCreditNote: boolean;

  /** สรุปสิ่งที่เลือกไว้ — ค่าว่างจะขึ้นเป็น "ยังไม่ได้เลือก" แบบจาง */
  channelSummary: string;
  audienceSummary: string;
  refineSummary: string;
  contentSummary: string;
  scheduleSummary: string;

  content: BroadcastContent;
  previewPlatform: BroadcastPlatform | null;
  imagePreviewUrl: string | null;

  scheduled: boolean;
  sending: boolean;
  canNext: boolean;
  canSend: boolean;
  onCancel: () => void;
  onNext: () => void;
  onBack: () => void;
  onSend: () => void;
}

export default function SummaryRail(p: Props) {
  return (
    <div className="xl:sticky xl:top-4 space-y-4">
      <Card padding="md">
        <p className="helper-text text-gray-500 dark:text-slate-400">ผู้รับ</p>
        <p className="heading-2 tabular-nums">
          {p.previewLoading ? '—' : p.recipientCount.toLocaleString()}
          <span className="body-text font-normal text-gray-500 dark:text-slate-400"> คน</span>
        </p>

        {!p.hideProgress && p.contactTotal != null && p.contactTotal > 0 && (
          <div className="mt-2">
            <ProgressBar value={p.recipientCount} max={p.contactTotal} size="sm" />
          </div>
        )}

        {p.quotaText && <p className="helper-text text-gray-500 dark:text-slate-400 mt-1.5">{p.quotaText}</p>}

        {p.showFollowerStats && p.followerStats?.total_adds != null && p.followerStats.blocks != null && (
          <p className="helper-text text-gray-400 dark:text-slate-500 mt-1">
            เคยแอดสะสม {p.followerStats.total_adds.toLocaleString()} · บล็อกแล้ว{' '}
            {p.followerStats.blocks.toLocaleString()} จึงไม่นับ
          </p>
        )}

        {p.perAccount.length > 1 && (
          <ul className="mt-2 space-y-0.5">
            {p.perAccount.map(r => (
              <li
                key={r.account.id}
                className="flex items-center gap-1.5 helper-text text-gray-500 dark:text-slate-400"
              >
                <PlatformIcon id={r.account.platform} size={12} />
                <span className="truncate flex-1">{r.account.name}</span>
                <span className="tabular-nums">{r.info.recipient_count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}

        {p.shortAccounts.length > 0 && (
          <p className="helper-text text-red-600 dark:text-red-400 mt-2">
            โควตาไม่พอ: {p.shortAccounts.map(r => r.account.name).join(' · ')} — ลดกลุ่มผู้รับหรือรอรอบเดือนหน้า
          </p>
        )}
        {p.noRecipientsMessage && (
          <p className="helper-text text-amber-700 dark:text-amber-500 mt-2">{p.noRecipientsMessage}</p>
        )}
        {p.contentError && p.hasDraft && (
          <p className="helper-text text-red-600 dark:text-red-400 mt-2">{p.contentError}</p>
        )}

        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 space-y-1">
          <SummaryRow label="ช่องทาง" value={p.channelSummary} />
          <SummaryRow label="กลุ่ม" value={p.audienceSummary} />
          {p.refineSummary && <SummaryRow label="ตัวกรอง" value={p.refineSummary} />}
          <SummaryRow label="เนื้อหา" value={p.contentSummary} />
          <SummaryRow label="ส่งเมื่อ" value={p.scheduleSummary} />
        </div>

        <div className="flex gap-2 mt-4">
          {p.step === 1 ? (
            <>
              <Button variant="secondary" className="flex-1" onClick={p.onCancel} disabled={p.sending}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                icon={<ArrowRight className="w-4 h-4" />}
                disabled={!p.canNext}
                onClick={p.onNext}
              >
                ถัดไป · เลือกเนื้อหา
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" className="flex-1" onClick={p.onBack} disabled={p.sending}>
                ย้อนกลับ
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                icon={p.scheduled ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                loading={p.sending}
                disabled={!p.canSend}
                onClick={p.onSend}
              >
                {p.scheduled ? 'ตั้งเวลาส่ง' : 'ส่งบรอดแคสต์'}
              </Button>
            </>
          )}
        </div>

        {p.showLineCreditNote && (
          <p className="helper-text text-gray-500 dark:text-slate-400 mt-3">
            ส่งถึง 500 คน = 500 ข้อความในโควตา · การ์ดที่มีรูป หัวข้อ และปุ่ม ยังนับเป็น 1 ข้อความเท่าข้อความเปล่า
          </p>
        )}
      </Card>

      <Card padding="md">
        <p className="field-label mb-2">ตัวอย่างที่ลูกค้าจะเห็น</p>
        {p.hasDraft ? (
          <BroadcastPreview
            content={p.content}
            platform={p.previewPlatform}
            imagePreviewUrl={p.imagePreviewUrl}
          />
        ) : (
          <p className="helper-text text-gray-400 dark:text-slate-500">
            {p.step === 1 ? 'ตัวอย่างจะขึ้นเมื่อพิมพ์เนื้อหาในขั้นถัดไป' : 'ตัวอย่างจะขึ้นเมื่อพิมพ์เนื้อหา'}
          </p>
        )}
      </Card>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const empty = !value;
  return (
    <div className="flex justify-between gap-3 helper-text">
      <span className="text-gray-500 dark:text-slate-400 flex-shrink-0">{label}</span>
      <span className={`text-right min-w-0 truncate ${empty ? 'text-gray-400 dark:text-slate-500' : 'text-gray-700 dark:text-slate-200'}`}>
        {value || 'ยังไม่ได้เลือก'}
      </span>
    </div>
  );
}
