// Path: components/chat/LeadStageIcon.tsx
//
// ไอคอนประจำขั้นในกรวยขาย — ใช้ร่วมทุกจอของระบบติดตาม (แผ่นติดตาม · คิวติดตาม · รายชื่อแชท)
//
// ทำไมไม่อยู่ใน `lib/leads/stages.ts`: ไฟล์นั้น client-safe แบบไม่มี React (API route ก็ import)
// · ขั้นที่ร้านเพิ่มเองจะไม่มีในทะเบียนนี้ → คืน `null` แล้วจอวาดแค่ข้อความ (ห้ามเดาไอคอนมั่ว)

import {
  ChatIcon, MessageIcon, StarIcon, PaymentIcon, SuccessIcon, AlertIcon, ConfirmIcon, BanIcon,
} from '@/lib/icons';

type IconComponent = React.ComponentType<{ className?: string }>;

/** หนึ่งขั้น = หนึ่งไอคอนทั้งระบบ — เปลี่ยนที่นี่ที่เดียว */
const STAGE_ICONS: Record<string, IconComponent> = {
  new: ChatIcon,          // ทักเข้ามาใหม่
  talking: MessageIcon,   // กำลังคุย
  interested: StarIcon,   // สนใจ มีแวว
  quoted: PaymentIcon,    // เสนอราคา/รอโอน
  won: SuccessIcon,       // ซื้อแล้ว
  issue: AlertIcon,       // มีปัญหา/เคลม
  resolved: ConfirmIcon,  // ดูแลเสร็จแล้ว
  lost: BanIcon,          // ไม่เอาแล้ว
};

export default function LeadStageIcon({ stageKey, className = 'w-4 h-4' }: { stageKey: string; className?: string }) {
  const Icon = STAGE_ICONS[stageKey];
  if (!Icon) return null;
  return <Icon className={className} />;
}
