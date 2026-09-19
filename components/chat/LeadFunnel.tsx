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
  // ขั้นตั้งต้น ("ยังไม่ระบุ" — ทุกห้องเริ่มที่นี่โดยไม่มีใครกด) ไม่ใช่ขั้นที่คนเลือก จึงไม่วาดเป็นช่อง
  // (เจ้าของทัก 19 ก.ย. 2026: "ทักใหม่" ก็แค่ทักมา ไม่ได้บอกอะไร) — ยังเป็นค่าใน DB อยู่ เพื่อรู้ว่ายังไม่ได้ติด
  const visible = stages.filter(s => !s.is_default);
  const firstClosed = visible.findIndex(s => !s.is_open);
  const funnel = firstClosed >= 0 ? visible.slice(0, firstClosed + 1) : visible;
  const outcomes = firstClosed >= 0 ? visible.slice(firstClosed + 1) : [];
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
              <button
                key={s.key}
                type="button"
                aria-pressed={current}
                onClick={() => onSelect(s.key)}
                className={`opt-btn flex-1 ${current ? `opt-btn-active ${STAGE_ACTIVE_CLASS[s.color]}` : ''}`}
              >
                <LeadStageIcon stageKey={s.key} />
                {s.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
