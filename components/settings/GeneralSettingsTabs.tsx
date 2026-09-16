// Path: components/settings/GeneralSettingsTabs.tsx
// แท็บของหมวด "ทั่วไป" ในหน้าตั้งค่า — เดิม array นี้ถูก copy ไว้ในทุกหน้าที่
// อยู่ในหมวดนี้ พอเพิ่มแท็บใหม่ก็ต้องไล่แก้ทุกไฟล์ (แล้วลืมบางไฟล์เสมอ)
// เพิ่มแท็บใหม่ = เพิ่ม 1 บรรทัดที่นี่ + อัปเดต isActive ของเมนู "ทั่วไป" ใน Sidebar
'use client';

import Tabs from '@/components/ui/Tabs';
import { useFeatures } from '@/lib/features-context';

export type GeneralSettingsTabKey =
  | 'company' | 'general' | 'consignment' | 'department-store' | 'tags';

interface GeneralSettingsTabsProps {
  active: GeneralSettingsTabKey;
  className?: string;
}

/**
 * แท็บของลูกค้าตัวแทน/ลูกค้าห้างขึ้นเฉพาะเมื่อเปิดฟีเจอร์นั้นไว้ — ร้านที่ไม่ได้ขายผ่าน
 * ตัวแทนไม่ควรเจอแท็บที่กดเข้าไปแล้วไม่มีความหมาย · อ่านฟีเจอร์เองที่นี่ที่เดียว
 * ไม่ต้องให้ทุกหน้าส่งมาแล้วลืมบางหน้า
 */
export default function GeneralSettingsTabs({ active, className }: GeneralSettingsTabsProps) {
  const { features } = useFeatures();

  return (
    <Tabs
      activeKey={active}
      className={className}
      tabs={[
        { key: 'company', label: 'ข้อมูลร้านค้า', href: '/settings/company' },
        { key: 'general', label: 'บิล และสินค้า', href: '/settings' },
        ...(features.consignment
          ? [{ key: 'consignment', label: 'ลูกค้าตัวแทน', href: '/settings/consignment' }]
          : []),
        ...(features.department_store
          ? [{ key: 'department-store', label: 'ลูกค้าห้าง', href: '/settings/department-store' }]
          : []),
        { key: 'tags', label: 'แท็กลูกค้า', href: '/settings/tags' },
      ]}
    />
  );
}
