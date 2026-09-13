// Path: app/marketing/audiences/components/AudienceRail.tsx
//
// แผงขวาของหน้าสร้าง/แก้ไขกลุ่ม — ตัวเลขใหญ่คือ **ส่งขึ้น Meta ได้กี่คน** ส่วนจำนวนคนในกลุ่มทั้งหมด
// เป็นบรรทัดรอง
//
// ⚠️ ตัวเลขใหญ่ต้องเป็นจำนวนที่ส่งขึ้น Meta ได้ ไม่ใช่ยอดรวม — เดิมโชว์ยอดรวมตัวใหญ่ ("2,166 คน")
// แล้วมีบรรทัดเล็กว่า sync ได้ 5 เจ้าของอ่านแล้วงงว่ากลุ่มมีกี่คนกันแน่ (11 ก.ย. 2026) · หน้านี้มีไว้ยิงโฆษณา
// คนที่ไม่มีเบอร์/อีเมล/Messenger Meta หาตัวไม่เจอ นับไปก็ไม่ได้ใช้
// · ต่ำกว่า META_AUDIENCE_MIN_MATCHED ต้องเตือนตั้งแต่ก่อนกดสร้าง ไม่ใช่ไปเจอตอนตั้งโฆษณา
// · บอกด้วยว่าคนที่ส่งไม่ได้ส่วนใหญ่มาจากไหน (`not_syncable_marketplace`) — ร้านที่ขายผ่าน marketplace
//   เป็นหลักจะมีคนแบบนี้เกือบทั้งกลุ่ม ไม่บอกแล้วผู้ใช้จะนึกว่าระบบนับผิด
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
import PlatformIcon from '@/components/ui/PlatformIcon';
import { Users } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';
import { META_AUDIENCE_MIN_MATCHED } from '@/lib/ads/meta-ui';
import type { AudiencePreview } from './types';

/** ทำไมบางคนส่งขึ้น Meta ไม่ได้ + ทำยังไงถึงจะได้ — บอกวิธีแก้ ไม่ใช่บอกแค่ว่าไม่ได้ */
const REACH_HELP =
  'Meta หาตัวคนได้จากเบอร์โทร อีเมล หรือ Messenger เท่านั้น · ลูกค้าที่ซื้อผ่าน Shopee, Lazada, TikTok '
  + 'ไม่มีเบอร์หรืออีเมล เพราะแพลตฟอร์มไม่ส่งมาให้ร้าน · ผู้ติดต่อ LINE ที่ยังไม่ผูกกับข้อมูลลูกค้าก็ไม่มี · '
  + 'ผูกลูกค้าในหน้าแชท หรือเปิดบิลพร้อมเบอร์โทร แล้วจะส่งขึ้น Meta ได้ในรอบถัดไป';

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
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-2 w-full" />
          <SkeletonText lines={3} />
        </div>
      ) : preview ? (
        <div>
          <p className="subtitle-text">ส่งขึ้น Meta ได้</p>
          <div className="flex items-baseline gap-2">
            <span className="heading-1 tabular-nums">{formatNumber(preview.reachable.any)}</span>
            <span className="subtitle-text">คน</span>
          </div>

          <div className="mt-3 space-y-2">
            <ProgressBar value={preview.reachable.any} max={preview.total} size="sm" toneClass="bg-emerald-500" />
            <div className="flex items-start justify-between gap-2">
              {/* สรุปเป็นสมการสั้น ๆ ให้เห็น − = เลย (เจ้าของขอ 13 ก.ย. 2026 — ประโยคยาวอ่านช้ากว่า)
                  คำอธิบายเต็มอยู่บรรทัดล่างกับใน ? แล้ว */}
              <p className="subtitle-text tabular-nums">
                ในกลุ่ม {formatNumber(preview.total)} − ส่งไม่ได้ {formatNumber(preview.not_syncable)} ={' '}
                <span className="font-medium text-gray-700 dark:text-slate-200">
                  {formatNumber(preview.reachable.any)} คน
                </span>
              </p>
              <HelpHint align="right">
                <span className="block">
                  ในกลุ่มนี้มีเบอร์ {formatNumber(preview.reachable.phone)} · มีอีเมล{' '}
                  {formatNumber(preview.reachable.email)} · มี Messenger {formatNumber(preview.reachable.psid)} ·
                  คนเดียวมีได้หลายอย่าง สามตัวนี้จึงซ้อนกัน
                </span>
                <span className="block mt-1">{REACH_HELP}</span>
              </HelpHint>
            </div>
            {/* บรรทัดพวกนี้ต้อง "บวกแล้วลงตัว": เบอร์/อีเมล + Messenger อย่างเดียว = ยอดที่ส่งได้ ·
                บวกคนที่ส่งไม่ได้ = ยอดในกลุ่ม (เดิมนับซ้อนกันเพราะคนเดียวมีได้ทั้งเบอร์และอีเมล เจ้าของบวก
                แล้วไม่ได้ยอดจริง 13 ก.ย. 2026) · เลขรายอย่างที่ซ้อนกันย้ายไปอยู่ใน ? แทน */}
            {/* แยกว่าจับคู่ด้วยอะไร — โชว์เฉพาะตอนที่บวกแล้วได้ยอดที่ส่งได้จริง · เซิร์ฟเวอร์รุ่นเก่า
                (ยังไม่คอมไพล์ใหม่) ไม่ส่งสองค่านี้มา จะได้ไม่ขึ้น "0 คน" ซึ่งขัดกับตัวเลขใหญ่ */}
            {preview.reachable.contact + preview.reachable.psid_only === preview.reachable.any && (
              <ul className="space-y-0.5">
                <li className="subtitle-text">
                  · จับคู่ด้วยเบอร์หรืออีเมล {formatNumber(preview.reachable.contact)} คน
                </li>
                {preview.reachable.psid_only > 0 && (
                  <li className="subtitle-text">
                    · จับคู่ด้วย Messenger อย่างเดียว {formatNumber(preview.reachable.psid_only)} คน
                  </li>
                )}
              </ul>
            )}
            {/* ไม่มีค่า = ถามไม่ได้ ไม่โชว์บรรทัดนี้ (ห้ามเดา 0) */}
            {!!preview.not_syncable_marketplace && (
              <p className="section-desc">
                ในนี้ {formatNumber(preview.not_syncable_marketplace)} คนซื้อผ่าน Shopee, Lazada, TikTok
                อย่างเดียว ซึ่งไม่ส่งเบอร์หรืออีเมลของผู้ซื้อมาให้ร้าน
              </p>
            )}
          </div>

          {preview.reachable.any < META_AUDIENCE_MIN_MATCHED && (
            <Alert tone="warning" className="mt-3">
              {/* แผงนี้แคบ — ข้อความเตือนใช้ขนาดเดียวกับบรรทัดอื่นในการ์ด (เจ้าของขอ 13 ก.ย. 2026) */}
              <span className="subtitle-text block">
                ส่งขึ้น Meta ได้ไม่ถึง {formatNumber(META_AUDIENCE_MIN_MATCHED)} คน กลุ่มนี้เล็กเกินกว่าจะยิงโฆษณาได้ ·
                Meta ต้องจับคู่คนได้ราว {formatNumber(META_AUDIENCE_MIN_MATCHED)} คนขึ้นไป
                และมักจับคู่ได้ไม่ครบทุกคนที่ส่งไป
              </span>
            </Alert>
          )}

          {preview.capped && (
            <Alert tone="warning" className="mt-3">
              <span className="subtitle-text block">กลุ่มใหญ่เกิน 50,000 คน · ทำให้แคบลงก่อน</span>
            </Alert>
          )}

          {/* คนส่วนใหญ่มาจากไหน + แหล่งไหนเพิ่มคนที่แหล่งอื่นไม่มี (เจ้าของถามว่าติ๊ก LINE แล้วยอดไม่ขยับ 13 ก.ย. 2026) */}
          {!!preview.by_source?.length && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 space-y-1">
              <p className="field-label">มาจากแหล่งไหนบ้าง</p>
              {preview.by_source.map(s => (
                <div key={`${s.kind}-${s.platform ?? ''}`} className="flex items-start gap-2">
                  <span className="mt-1 flex-shrink-0">
                    {s.kind === 'chat' && s.platform
                      ? <PlatformIcon id={s.platform as 'line' | 'facebook'} size={14} title={s.label} />
                      : <Users className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />}
                  </span>
                  <div className="min-w-0">
                    <p className="subtitle-text">{s.label} · {formatNumber(s.total)} คน</p>
                    <p className="section-desc">
                      ส่งขึ้น Meta ได้ {formatNumber(s.syncable)} ·{' '}
                      {s.only > 0
                        ? `มีเฉพาะแหล่งนี้ ${formatNumber(s.only)} คน`
                        /* แหล่งที่ติ๊กแล้วไม่ได้คนเพิ่มต้องสะดุดตา ไม่ใช่สีเทาเหมือนบรรทัดอื่น (เจ้าของขอ) */
                        : <span className="text-amber-600 dark:text-amber-400">ทุกคนซ้ำกับแหล่งอื่น</span>}
                    </p>
                  </div>
                </div>
              ))}
              <p className="section-desc pt-1">
                คนเดียวกันนับครั้งเดียวในยอดรวม แต่ขึ้นในทุกแหล่งที่เจอ ผลรวมของแถวจึงมากกว่ายอดรวม ·
                แหล่งที่ &ldquo;ทุกคนซ้ำกับแหล่งอื่น&rdquo; ติ๊กแล้วยอดรวมไม่ขยับ
              </p>
            </div>
          )}
        </div>
      ) : null}

      {error && !loading && <Alert tone="danger" className="mt-3">{error}</Alert>}
    </Card>
  );
}
