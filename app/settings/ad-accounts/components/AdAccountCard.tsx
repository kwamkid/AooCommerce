// Path: app/settings/ad-accounts/components/AdAccountCard.tsx
// การ์ดบัญชีโฆษณา 1 ใบ — โครงเดียวกับการ์ดช่องทางแชท (avatar + ชื่อ + ชิปสถานะ + เมนู)
//
// ⚠️ ความสามารถ 3 อย่างของ token **แยกกันจริง ๆ** จึงต้องมี 3 ชิป ไม่ใช่ชิปเดียวว่า "ปกติ":
// token จาก Events Manager ส่ง event ได้แต่ sync กลุ่มเป้าหมายไม่ได้ · บัญชีที่ยังไม่ยอมรับ
// ข้อกำหนด Custom Audience ก็ยิง event ได้ตามปกติ — รวบเป็นชิปเดียวแล้วผู้ใช้จะไล่ไม่ถูกว่าติดตรงไหน
'use client';

import { Check, Edit2, RefreshCw, Trash2, XCircle, Zap } from 'lucide-react';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import Alert from '@/components/ui/Alert';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import ChannelBadge from '@/components/ui/ChannelBadge';
import FormInput from '@/components/ui/FormInput';
import SaveButton from '@/components/ui/SaveButton';
import Tooltip from '@/components/ui/Tooltip';
import { formatNumber, formatThaiDateTime } from '@/lib/utils/format';
import {
  TOKEN_SOURCE_LABEL,
  customAudienceTosUrl,
  type AdAccountProbe,
  type AdAccountView,
} from '@/lib/ads/meta-ui';

/** ต่ำกว่านี้ถือว่า "ใกล้หมดอายุ" — เตือนให้ทันก่อนระบบหยุดส่ง event เงียบ ๆ */
const EXPIRY_WARN_DAYS = 7;

interface Chip {
  tone: BadgeTone;
  label: string;
  tooltip: string;
}

function checkedAtLine(at: string | null): string {
  return at ? `\nตรวจเมื่อ ${formatThaiDateTime(at)}` : '';
}

function tokenChip(account: AdAccountView): Chip {
  const when = checkedAtLine(account.last_checked_at);
  if (account.status === 'token_expired') {
    return {
      tone: 'red',
      label: 'token หมดอายุ',
      tooltip: `${account.last_error || 'token หมดอายุแล้ว ระบบหยุดส่ง event'}${when}\nแก้: เมนู › เชื่อมต่อใหม่`,
    };
  }
  if (account.status === 'error') {
    return {
      tone: 'red',
      label: 'มีปัญหา',
      tooltip: `${account.last_error || 'เชื่อมต่อบัญชีโฆษณานี้ไม่สำเร็จ'}${when}`,
    };
  }
  if (account.token_expires_at) {
    const daysLeft = (new Date(account.token_expires_at).getTime() - Date.now()) / 86_400_000;
    if (daysLeft <= EXPIRY_WARN_DAYS) {
      return {
        tone: 'amber',
        label: 'token ใกล้หมดอายุ',
        tooltip: `หมดอายุ ${formatThaiDateTime(account.token_expires_at)} — กดเมนู › เชื่อมต่อใหม่ ก่อนถึงวันนั้น`,
      };
    }
  }
  return { tone: 'emerald', label: 'token ปกติ', tooltip: `token ใช้ได้${when}` };
}

function capiChip(account: AdAccountView, probe?: AdAccountProbe): Chip {
  if (account.capi_ok_at) {
    return {
      tone: 'emerald',
      label: 'CAPI พร้อม',
      tooltip: `ส่ง Purchase/QualifiedLead เข้า Dataset นี้ได้${checkedAtLine(account.capi_ok_at)}`,
    };
  }
  const datasetIssue = !!account.last_error && /dataset/i.test(account.last_error);
  if (datasetIssue || (probe && !probe.capi_ok)) {
    return {
      tone: 'amber',
      label: 'CAPI ยังไม่พร้อม',
      tooltip: `${account.last_error || 'ยิง event เข้า Dataset นี้ไม่สำเร็จ'}\nแก้: ตรวจว่าเลือก Dataset ถูกใบ แล้วกดทดสอบอีกครั้ง`,
    };
  }
  return { tone: 'gray', label: 'ยังไม่ตรวจ CAPI', tooltip: 'กดเมนู › ทดสอบการเชื่อมต่อ เพื่อดูว่าส่ง event ได้จริงไหม' };
}

function audiencesChip(account: AdAccountView): Chip {
  if (account.audiences_ok_at) {
    return {
      tone: 'emerald',
      label: 'Audiences พร้อม',
      tooltip: `sync กลุ่มเป้าหมายขึ้นบัญชีนี้ได้${checkedAtLine(account.audiences_ok_at)}`,
    };
  }
  if (account.metadata.tos_required) {
    return {
      tone: 'amber',
      label: 'Audiences ต้องยอมรับข้อกำหนด',
      tooltip: 'Meta ให้ยอมรับข้อกำหนด Custom Audience ก่อนสร้างกลุ่ม — เปิด Ads Manager › Audiences › Terms',
    };
  }
  if (account.metadata.audiences_error) {
    return {
      tone: 'gray',
      label: 'Audiences ใช้ไม่ได้',
      tooltip: `${account.metadata.audiences_error}\ntoken จาก Events Manager ส่ง event ได้อย่างเดียว — ใช้ System User token ถ้าต้องการ sync กลุ่มเป้าหมาย`,
    };
  }
  return { tone: 'gray', label: 'ยังไม่ตรวจ Audiences', tooltip: 'กดเมนู › ทดสอบการเชื่อมต่อ เพื่อดูว่า sync กลุ่มเป้าหมายได้ไหม' };
}

function ProbeLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok
        ? <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
      <span>{label}</span>
    </li>
  );
}

export interface AdAccountCardProps {
  account: AdAccountView;
  /** ผลตรวจของรอบล่าสุดในหน้านี้ — ไม่มี = ยังไม่ได้กดทดสอบตั้งแต่เปิดหน้า */
  probe?: AdAccountProbe;
  testing: boolean;
  /** ต่อสิทธิ์ใหม่ผ่าน Facebook ได้เฉพาะใบที่มาจาก OAuth และมี App ID ตั้งไว้ */
  canReconnect: boolean;
  renaming: boolean;
  renameValue: string;
  renameSaving: boolean;
  onRenameStart: () => void;
  onRenameChange: (value: string) => void;
  onRenameCancel: () => void;
  onRenameSave: () => void;
  onTest: () => void;
  onReconnect: () => void;
  onDelete: () => void;
  onShowEvents: () => void;
}

export default function AdAccountCard({
  account, probe, testing, canReconnect,
  renaming, renameValue, renameSaving,
  onRenameStart, onRenameChange, onRenameCancel, onRenameSave,
  onTest, onReconnect, onDelete, onShowEvents,
}: AdAccountCardProps) {
  const chips = [tokenChip(account), capiChip(account, probe), audiencesChip(account)];
  const displayName = account.name || `act_${account.external_id}`;
  const { sent, failed } = account.events_7d;

  const menuItems: ActionItem[] = [
    {
      key: 'test',
      label: testing ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ',
      icon: <Zap className="w-4 h-4" />,
      onClick: onTest,
      disabled: testing,
      primary: true,
    },
    ...(canReconnect ? [{
      key: 'reconnect',
      label: 'เชื่อมต่อใหม่ (ขอสิทธิ์ใหม่)',
      icon: <RefreshCw className="w-4 h-4" />,
      onClick: onReconnect,
    }] : []),
    {
      key: 'delete',
      label: 'ยกเลิกการเชื่อมต่อ',
      icon: <Trash2 className="w-4 h-4" />,
      onClick: onDelete,
      danger: true,
      dividerBefore: true,
    },
  ];

  const probeTone = !probe ? null
    : !probe.token_ok ? 'danger'
    : (probe.capi_ok && probe.audiences_ok) ? 'success'
    : 'warning';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5">
          <ChannelBadge size="md" channel={{ platform: 'facebook', picture_url: null }} />
        </div>

        <div className="flex-1 min-w-0">
          {renaming ? (
            <div className="flex items-end gap-2 max-w-md">
              <FormInput
                label="ชื่อที่ใช้เรียกในระบบ"
                value={renameValue}
                onChange={e => onRenameChange(e.target.value)}
                containerClassName="flex-1"
              />
              <Button variant="secondary" onClick={onRenameCancel} disabled={renameSaving}>ยกเลิก</Button>
              <SaveButton loading={renameSaving} onClick={onRenameSave} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-gray-900 dark:text-white truncate">{displayName}</p>
              {chips.map(chip => (
                <Tooltip key={chip.label} text={chip.tooltip}>
                  <Badge tone={chip.tone} size="sm">{chip.label}</Badge>
                </Tooltip>
              ))}
              <Tooltip text={account.token_source === 'oauth'
                ? 'token มาจากการ Login Facebook — ต่ออายุด้วยเมนู › เชื่อมต่อใหม่'
                : 'token ที่กรอกเอง — ต่ออายุโดยสร้าง token ใบใหม่แล้วกรอกทับ'}>
                <Badge tone="gray" size="sm">{TOKEN_SOURCE_LABEL[account.token_source]}</Badge>
              </Tooltip>
            </div>
          )}

          <div className="mt-1 space-y-0.5 subtitle-text text-gray-500 dark:text-slate-400">
            <p className="truncate">
              act_{account.external_id}
              {account.currency ? ` · ${account.currency}` : ''}
              {account.business_name ? ` · ${account.business_name}` : ''}
            </p>
            <p className="flex flex-wrap items-center gap-1.5">
              {account.dataset_id
                ? <span className="truncate">Dataset: {account.dataset_name || 'ไม่ทราบชื่อ'} ({account.dataset_id})</span>
                : <span className="text-amber-600 dark:text-amber-400">ยังไม่ได้เลือก Dataset</span>}
              {account.metadata.same_as_page_dataset && (
                <Tooltip text="Purchase จากห้องแชทกับจากบิลอื่นเข้า dataset เดียวกัน — Meta ตัดซ้ำด้วย event_id ให้เอง">
                  <Badge tone="blue" size="sm">dataset เดียวกับเพจ</Badge>
                </Tooltip>
              )}
            </p>
          </div>
        </div>

        {!renaming && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Tooltip text="แก้ชื่อที่ใช้เรียกในระบบ" box="inline-flex">
              <button
                type="button"
                onClick={onRenameStart}
                aria-label="แก้ชื่อบัญชีโฆษณา"
                className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </Tooltip>
            <ActionMenu items={menuItems} />
          </div>
        )}
      </div>

      {/* token หมดอายุ = ระบบหยุดส่ง event ไปแล้ว ต้องบอกบนการ์ด ไม่ใช่แค่ชิปเล็ก ๆ */}
      {account.status === 'token_expired' && (
        <div className="px-4 pb-4">
          <Alert tone="danger">
            <span className="subtitle-text">
              token หมดอายุ
              {account.token_expires_at ? `เมื่อ ${formatThaiDateTime(account.token_expires_at)}` : ''}
              {' '}— ระบบหยุดส่ง event แล้ว · กดเมนู › เชื่อมต่อใหม่
            </span>
          </Alert>
        </div>
      )}

      {probe && probeTone && (
        <div className="px-4 pb-4">
          <Alert tone={probeTone} title="ผลทดสอบการเชื่อมต่อ">
            <ul className="mt-1 space-y-1 subtitle-text">
              <ProbeLine ok={probe.token_ok} label="token ใช้ได้" />
              <ProbeLine ok={probe.capi_ok} label="ส่ง event ได้" />
              <ProbeLine ok={probe.audiences_ok} label="sync กลุ่มเป้าหมายได้" />
            </ul>
            {probe.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5 subtitle-text">
                {probe.errors.map((err, i) => <li key={i}>· {err}</li>)}
              </ul>
            )}
            {probe.tos_required && (
              <p className="mt-2 subtitle-text">
                <a
                  href={customAudienceTosUrl(account.external_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  ยอมรับข้อกำหนด Custom Audience ใน Ads Manager
                </a>
                {' '}แล้วกดทดสอบอีกครั้ง
              </p>
            )}
          </Alert>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-slate-700">
        <p className="subtitle-text text-gray-500 dark:text-slate-400">
          event 7 วันล่าสุด{'  '}
          <span className="text-gray-700 dark:text-slate-200">Purchase ส่งแล้ว {formatNumber(sent)}</span>
          {' · '}
          <span className={failed > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
            ล้มเหลว {formatNumber(failed)}
          </span>
        </p>
        <Button size="sm" variant="secondary" onClick={onShowEvents}>ดูรายการ</Button>
      </div>
    </div>
  );
}
