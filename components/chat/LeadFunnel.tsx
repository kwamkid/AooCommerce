'use client';

// Path: components/chat/LeadFunnel.tsx
//
// กรวยขายในแผงติดตาม — ขั้น "ในกรวย" เรียงเป็นลูกศรต่อกันแถวเดียว (ทักใหม่ → กำลังคุย → สนใจ →
// รอโอน → ซื้อแล้ว) ขั้นที่ผ่านมาแล้วเขียวจาง ขั้นปัจจุบันสีประจำขั้น · ผลลัพธ์นอกกรวย (มีปัญหา ·
// ดูแลเสร็จ · ไม่เอาแล้ว) เป็นปุ่มเล็กแถวใต้กรวย
//
// "ในกรวย" = ขั้นเรียงตาม sort_order จนถึงขั้นปิดการขายตัวแรก (`is_open=false` ตัวแรก) — ร้านที่
// เพิ่ม/แก้ขั้นเองยังวาดได้ถูก ไม่ผูกกับชื่อ key · สไตล์อยู่ globals.css (.lead-funnel*)
// เลือกแบบนี้แทนกรวยแนวตั้ง/ชิปกรอง เพราะใช้ที่น้อยสุด (เจ้าของเคาะ 19 ก.ย. 2026)

import Button from '@/components/ui/Button';
import LeadStageIcon from './LeadStageIcon';
import { STAGE_ACTIVE_CLASS, type LeadStage } from '@/lib/leads/stages';

/** พื้นสีทึบของขั้นปัจจุบัน — ดึงเฉพาะคลาส bg จาก STAGE_ACTIVE_CLASS (ตัวหนังสือขาวมาจาก CSS) */
function activeBg(color: LeadStage['color']): string {
  return STAGE_ACTIVE_CLASS[color].split(' ').filter(c => c.startsWith('!bg-')).join(' ');
}

interface Props {
  stages: LeadStage[];
  currentKey: string;
  onSelect: (key: string) => void;
}

export default function LeadFunnel({ stages, currentKey, onSelect }: Props) {
  const firstClosed = stages.findIndex(s => !s.is_open);
  const funnel = firstClosed >= 0 ? stages.slice(0, firstClosed + 1) : stages;
  const outcomes = firstClosed >= 0 ? stages.slice(firstClosed + 1) : [];
  const currentIdx = funnel.findIndex(s => s.key === currentKey);

  return (
    <div>
      <div className="lead-funnel" role="group" aria-label="ขั้นในกรวยขาย">
        {funnel.map((s, i) => {
          const current = s.key === currentKey;
          const done = currentIdx >= 0 && i < currentIdx;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={current}
              title={`${s.name}${s.auto_managed ? ' · ระบบติดให้เองเมื่อส่งบิล/ลูกค้าจ่ายเงิน' : ''}`}
              onClick={() => onSelect(s.key)}
              className={`lead-funnel-step ${current ? `lead-funnel-current ${activeBg(s.color)}` : done ? 'lead-funnel-done' : ''}`}
            >
              {s.name}
            </button>
          );
        })}
      </div>

      {outcomes.length > 0 && (
        <div className="flex gap-1.5 mt-1.5">
          {outcomes.map(s => {
            const current = s.key === currentKey;
            return (
              <Button
                key={s.key}
                size="sm"
                fullWidth
                variant="secondary"
                className={current ? STAGE_ACTIVE_CLASS[s.color] : undefined}
                icon={<LeadStageIcon stageKey={s.key} />}
                onClick={() => onSelect(s.key)}
              >
                {s.name}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
