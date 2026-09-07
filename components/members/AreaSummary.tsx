// Path: components/members/AreaSummary.tsx
// ป้าย "คนนี้เห็นอะไร ทำอะไรได้" — ใช้ร่วมทุกที่ที่ต้องแสดงสิทธิ์ของสมาชิก
// (รายชื่อสมาชิก · คำเชิญ · ตารางใครเห็นอะไร · หน้ารับคำเชิญ)
//
// ⛔ ห้ามประกอบป้ายตำแหน่ง/สิทธิ์เองที่อื่นอีก — ของเดิมมีตาราง ROLE_LABELS/ROLE_COLORS
//    ก๊อปกันอยู่ 3 ไฟล์ (หน้าสมาชิก · หน้าผู้ใช้ · หน้ารับคำเชิญ) แล้วชื่อตำแหน่ง
//    กับสีไม่ตรงกันสักไฟล์ ตอนนี้ทุกอย่างอ่านจาก lib/permissions.ts ที่เดียว
'use client';

import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';
import {
  AREAS, ROLE_LEVELS, isAdminTierRole,
  type AreaLevel, type Permissions, type RoleLevel,
} from '@/lib/permissions';

const ROLE_TONE: Record<RoleLevel, BadgeTone> = {
  owner: 'purple',
  admin: 'red',
  manager: 'indigo',
  staff: 'gray',
};

const ROLE_LABEL: Record<RoleLevel, string> = ROLE_LEVELS.reduce((acc, r) => {
  acc[r.key] = r.label;
  return acc;
}, {} as Record<RoleLevel, string>);

/** สัญลักษณ์ระดับสิทธิ์ — ตัวเดียวกันทั้งป้ายและตาราง จะได้อ่านออกโดยไม่ต้องจำสองชุด */
const LEVEL_MARK: Record<Exclude<AreaLevel, 'none'>, string> = {
  manage: '●',
  view: '◐',
};

const LEVEL_TONE: Record<Exclude<AreaLevel, 'none'>, BadgeTone> = {
  manage: 'emerald',
  view: 'blue',
};

export function roleLabel(role: RoleLevel): string {
  return ROLE_LABEL[role] || role;
}

/** ป้ายตำแหน่งเดี่ยว ๆ — ใช้ในตารางหรือที่ที่ไม่ต้องการรายกลุ่มงาน */
export function RoleBadge({ role }: { role: RoleLevel }) {
  return <Badge tone={ROLE_TONE[role] ?? 'gray'} size="sm">{roleLabel(role)}</Badge>;
}

/**
 * ตำแหน่ง + กลุ่มงานที่เปิดให้ (เฉพาะ staff)
 * ชั้นผู้บริหารได้ทุกกลุ่มอยู่แล้ว → ป้ายเดียวพอ ไม่ต้องโชว์ 8 ป้ายซ้ำ ๆ ทุกแถว
 */
export function AreaBadges({ role, permissions }: { role: RoleLevel; permissions?: Permissions | null }) {
  if (isAdminTierRole(role)) return <RoleBadge role={role} />;

  const granted = AREAS
    .map(area => ({ area, level: permissions?.[area.key] }))
    .filter((x): x is { area: (typeof AREAS)[number]; level: Exclude<AreaLevel, 'none'> } =>
      x.level === 'view' || x.level === 'manage');

  return (
    <div className="flex flex-wrap gap-1">
      <RoleBadge role={role} />
      {granted.map(({ area, level }) => (
        <Tooltip
          key={area.key}
          text={`${area.label} — ${level === 'manage' ? 'จัดการได้' : 'ดูอย่างเดียว'}\n${area.desc}`}
        >
          <Badge tone={LEVEL_TONE[level]} size="sm">
            {area.label} {LEVEL_MARK[level]}
          </Badge>
        </Tooltip>
      ))}
      {granted.length === 0 && (
        <span className="helper-text text-gray-400 dark:text-slate-500">ยังไม่ได้เปิดกลุ่มงานใดเลย</span>
      )}
    </div>
  );
}

/** ช่องหนึ่งช่องในตาราง "ใครเห็นอะไร" */
export function AreaCell({ level }: { level?: AreaLevel | null }) {
  if (level === 'manage') {
    return <span className="text-emerald-600 dark:text-emerald-400 whitespace-nowrap">● จัดการ</span>;
  }
  if (level === 'view') {
    return <span className="text-blue-600 dark:text-blue-400 whitespace-nowrap">◐ ดู</span>;
  }
  return <span className="text-gray-300 dark:text-slate-600">–</span>;
}

/** คำอธิบายสัญลักษณ์ — วางเหนือตารางเสมอ ไม่งั้น ● กับ ◐ เป็นแค่จุดสองจุด */
export function AreaLegend({ className }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 subtitle-text text-gray-500 dark:text-slate-400 ${className || ''}`}>
      <span><span className="text-emerald-600 dark:text-emerald-400">●</span> จัดการ = เพิ่ม/แก้/ลบได้</span>
      <span><span className="text-blue-600 dark:text-blue-400">◐</span> ดู = เปิดดูได้อย่างเดียว</span>
      <span><span className="text-gray-400">–</span> ไม่เห็นเมนูนี้เลย</span>
    </div>
  );
}
