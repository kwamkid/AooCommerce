// Path: app/settings/tags/page.tsx
// จัดการแท็กลูกค้า — ย้ายมาจาก Modal ในหน้า /customers เพราะแท็กชุดนี้ใช้ทั้ง
// หน้าลูกค้าและหน้าแชท จึงเป็น master data ของร้าน ไม่ใช่เครื่องมือของหน้าใดหน้าหนึ่ง
'use client';

import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import { NoPermissionCard } from '@/components/ui/StateCard';
import GeneralSettingsTabs from '@/components/settings/GeneralSettingsTabs';
import TagManager from '@/components/customers/TagManager';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';

export default function SettingsTagsPage() {
  const { userProfile } = useAuth();

  if (!can(userProfile?.roles, 'masterdata.tags')) {
    return (
      <Layout>
        <NoPermissionCard />
      </Layout>
    );
  }

  return (
    <Layout>
      <Container size="full">
        <PageHeader title="ตั้งค่า" subtitle="จัดการแท็กที่ใช้จัดกลุ่มลูกค้าและผู้ติดต่อในแชท" />
        <GeneralSettingsTabs active="tags" />
        <TagManager />
      </Container>
    </Layout>
  );
}
