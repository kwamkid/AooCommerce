// Path: app/marketing/audiences/components/AudienceRail.tsx
//
// แผงขวาของหน้าสร้าง/แก้ไขกลุ่ม — "กลุ่มนี้ได้กี่คน และ **sync ขึ้น Meta ได้กี่คน**"
//
// ⚠️ ตัวเลขที่สำคัญกว่าคือ **จับคู่ได้** ไม่ใช่ยอดรวม: กลุ่ม 1,400 คนที่มีเบอร์/อีเมลแค่ 20 คน
// อัปขึ้น Meta แล้วได้กลุ่มเล็กจนยิงโฆษณาไม่ได้ (Meta ต้องการราว 100 คนที่จับคู่ติด) —
// ต้องเห็นตั้งแต่ก่อนกดบันทึก ไม่ใช่ไปเจอตอน sync เสร็จ
//
// กำลังนับ = skeleton ทุกครั้ง รวมตอนเปลี่ยนกลุ่ม/แหล่ง (เจ้าของขอ 11 ก.ย. 2026 · เดิมตัวเลขเก่า
// จางลงแทน ซึ่งยังอ่านเป็นตัวเลขของเงื่อนไขใหม่ได้) · **ห้ามโชว์ 0** ระหว่างรอ (อ่านว่า "ไม่มีใครเลย")
// · `loading` ต้องจริงตั้งแต่เงื่อนไขเปลี่ยน ไม่ใช่รอให้คำขอออก — ผู้เรียกเทียบ key ของเงื่อนไขให้
'use client';

import Card from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';
import HelpHint from '@/components/ui/HelpHint';
import { ProgressBar } from '@/components/ui/Chart';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/utils/format';
import type { AudiencePreview } from './types';

/** ทำไมบางคน sync ไม่ได้ + ทำยังไงถึงจะได้ — บอกวิธีแก้ ไม่ใช่บอกแค่ว่าไม่ได้ */
const REACH_HELP =
  'Meta จับคู่คนจากเบอร์ อีเมล หรือ Messenger ID เท่านั้น · ผู้ติดต่อ LINE ที่ยังไม่ผูกกับข้อมูลลูกค้า'
  + 'ไม่มีทั้งสามอย่าง จึง sync ไม่ได้ — ผูกลูกค้าในหน้าแชท (หรือให้ลูกค้าสั่งซื้อผ่านบิล) '
  + 'แล้วจะ sync ได้ในรอบถัดไป';

interface Props {
  preview: AudiencePreview | null;
  loading: boolean;
  /** ข้อความจากเซิร์ฟเวอร์เมื่อ definition ยังไม่ผ่าน — โชว์เป็น Alert แดง */
  error: string | null;
  /** ยังกรอกไม่ครบจนนับไม่ได้ ("เลือกแหล่งที่มาก่อน") — คนละเรื่องกับ error */
  hint: string | null;
}

export default function AudienceRail({ preview, loading, error, hint }: Props) {
  // กำลังนับ หรือยังไม่เคยได้ผลเลย (ช่วงหน่วงก่อนยิงคำขอครั้งแรก)
  const pending = loading || (!preview && !error);

  return (
    <Card padding="md">
      {/* "ขนาดกลุ่ม" ไม่ใช่ "กลุ่มเป้าหมาย" — หัวหน้ากับการ์ดเลือกกลุ่มทางซ้ายใช้คำนั้นอยู่แล้ว
          ชื่อซ้ำสามที่แยกไม่ออกว่าการ์ดไหนทำอะไร (เดิม "สมาชิก" เจ้าของบอกไม่สื่อ 11 ก.ย. 2026) */}
      <h2 className="heading-4 mb-3">ขนาดกลุ่ม</h2>

      {hint ? (
        <p className="subtitle-text">{hint}</p>
      ) : pending ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-2 w-full" />
          <SkeletonText lines={3} />
        </div>
      ) : preview ? (
        <div>
          <div className="flex items-baseline gap-2">
            <span className="heading-1 tabular-nums">{formatNumber(preview.total)}</span>
            <span className="subtitle-text">คน</span>
          </div>

          <div className="mt-3 space-y-2">
            <ProgressBar value={preview.reachable.any} max={preview.total} size="sm" toneClass="bg-emerald-500" />
            <div className="flex items-start justify-between gap-2">
              <p className="subtitle-text">
                sync ไป Meta ได้ {formatNumber(preview.reachable.any)} จาก {formatNumber(preview.total)} คน
              </p>
              <HelpHint align="right">{REACH_HELP}</HelpHint>
            </div>
            {/* คนเดียวมีได้ทั้งเบอร์ อีเมล และ Messenger — สามบรรทัดนี้รวมกันเกิน "sync ได้" ได้ ไม่ใช่บั๊ก */}
            <ul className="space-y-0.5">
              <li className="subtitle-text">
                · มีเบอร์ {formatNumber(preview.reachable.phone)} · มีอีเมล {formatNumber(preview.reachable.email)}
              </li>
              <li className="subtitle-text">· มี Messenger {formatNumber(preview.reachable.psid)}</li>
              <li className="subtitle-text">· ยัง sync ไม่ได้ {formatNumber(preview.not_syncable)}</li>
            </ul>
          </div>

          {preview.capped && (
            <Alert tone="warning" className="mt-3">
              กลุ่มใหญ่เกิน 50,000 คน — ทำให้แคบลงก่อน
            </Alert>
          )}

          {/* คนส่วนใหญ่มาจากไหน — ผลรวมของแต่ละแถวอาจมากกว่ายอดรวม เพราะคนเดียวกันอยู่ได้หลายแหล่ง */}
          {!!preview.by_source?.length && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 space-y-1">
              <p className="field-label">มาจากแหล่งไหนบ้าง</p>
              {preview.by_source.map(s => (
                <p key={`${s.kind}-${s.platform ?? ''}`} className="subtitle-text">
                  {s.label} · {formatNumber(s.total)} คน (sync ได้ {formatNumber(s.syncable)})
                </p>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {error && !loading && <Alert tone="danger" className="mt-3">{error}</Alert>}
    </Card>
  );
}
