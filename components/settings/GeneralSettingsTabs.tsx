// Path: components/settings/GeneralSettingsTabs.tsx
// แท็บของหมวด "ทั่วไป" ในหน้าตั้งค่า — เดิม array นี้ถูก copy ไว้ในทุกหน้าที่
// อยู่ในหมวดนี้ พอเพิ่มแท็บใหม่ก็ต้องไล่แก้ทุกไฟล์ (แล้วลืมบางไฟล์เสมอ)
// เพิ่มแท็บใหม่ = เพิ่ม 1 บรรทัดที่นี่ + อัปเดต isActive ของเมนู "ทั่วไป" ใน Sidebar
'use client';

import Tabs from '@/components/ui/Tabs';

export type GeneralSettingsTabKey = 'company' | 'general' | 'tags';

interface GeneralSettingsTabsProps {
  active: GeneralSettingsTabKey;
  className?: string;
}

export default function GeneralSettingsTabs({ active, className }: GeneralSettingsTabsProps) {
  return (
    <Tabs
      activeKey={active}
      className={className}
      tabs={[
        { key: 'company', label: 'ข้อมูลร้านค้า', href: '/settings/company' },
        { key: 'general', label: 'บิล และสินค้า', href: '/settings' },
        { key: 'tags', label: 'แท็กลูกค้า', href: '/settings/tags' },
      ]}
    />
  );
}
